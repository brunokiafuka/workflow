import { cliui } from "@poppinss/cliui";
import enquirer from "enquirer";
import { execa } from "execa";

import { branchExists, currentBranch, git, localBranches } from "../git.js";
import { detectTrunk } from "../trunk.js";
import { colors, fail, success } from "../ui.js";

const { prompt } = enquirer;
const ui = cliui();

type Row = { branch: string; sha: string; subject: string; isTrunk: boolean };

const TRUNK_TAG = "  (trunk)";

async function headInfo(branch: string): Promise<{ sha: string; subject: string }> {
  const r = await git(["log", "-1", "--pretty=%h\t%s", branch], {
    allowFail: true,
  });
  const [sha = "", subject = ""] = r.stdout.trim().split("\t");
  return { sha, subject };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** One `gh pr list` call → map of branch → open PR number. */
async function fetchOpenPrs(branches: string[]): Promise<{ map: Map<string, number>; ghFailed: boolean }> {
  const map = new Map<string, number>();
  if (branches.length === 0) return { map, ghFailed: false };
  try {
    const r = await execa("gh", ["pr", "list", "--json", "number,headRefName", "--state", "open", "--limit", "200"], {
      reject: false,
    });
    if (r.exitCode !== 0) return { map, ghFailed: true };
    const list = JSON.parse(r.stdout) as {
      number: number;
      headRefName: string;
    }[];
    const wanted = new Set(branches);
    for (const pr of list) {
      if (wanted.has(pr.headRefName)) map.set(pr.headRefName, pr.number);
    }
  } catch {
    return { map, ghFailed: true };
  }
  return { map, ghFailed: false };
}

export async function checkoutCommand(): Promise<void> {
  const trunk = await detectTrunk();
  const current = await currentBranch();
  const locals = await localBranches();
  const others = locals.filter((b) => b !== trunk);

  // Collect head info for every branch, plus PR numbers (one gh call).
  const rows: Row[] = [];
  const [{ map: prMap, ghFailed }] = await Promise.all([
    fetchOpenPrs(locals),
    (async () => {
      for (const b of others) {
        const { sha, subject } = await headInfo(b);
        rows.push({ branch: b, sha, subject, isTrunk: false });
      }
      const trunkHead = await headInfo(trunk);
      rows.push({
        branch: trunk,
        sha: trunkHead.sha,
        subject: trunkHead.subject,
        isTrunk: true,
      });
    })(),
  ]);

  const prLabel = (branch: string) => {
    const n = prMap.get(branch);
    return n ? `PR#${n}` : "";
  };

  // Render a little tree: branches stacked above trunk, connected by │.
  const maxFirstCol = Math.min(
    48,
    Math.max(1, ...rows.map((r) => (r.isTrunk ? r.branch.length + TRUNK_TAG.length : r.branch.length))),
  );
  const maxPrLen = Math.max(0, ...rows.map((r) => prLabel(r.branch).length));
  const cols = process.stdout.columns;
  const subjectCap =
    cols && cols > 0 ? Math.max(20, Math.min(90, cols - 12 - maxFirstCol - (maxPrLen ? maxPrLen + 2 : 0))) : 50;

  console.log("");
  if (rows.length > 0) {
    const headBranch = "Branch".padEnd(maxFirstCol);
    const headPr = maxPrLen ? "  " + "PR".padEnd(maxPrLen) : "";
    const headMeta = "  " + "Last commit";
    console.log("  " + "  " + colors.dim(headBranch + headPr + headMeta));
  }
  rows.forEach((r, i) => {
    const isLast = i === rows.length - 1;
    const marker = r.branch === current ? colors.cyan("●") : colors.dim("○");
    const name = r.branch === current ? colors.bold(r.branch) : r.branch;
    const plain = r.isTrunk ? r.branch + TRUNK_TAG : r.branch;
    const firstCol = plain.padEnd(maxFirstCol, " ").replace(r.branch, name).replace(TRUNK_TAG, colors.dim(TRUNK_TAG));
    const pr = prLabel(r.branch);
    const prCell = maxPrLen
      ? pr
        ? pr.padEnd(maxPrLen, " ").replace(pr, colors.magenta(pr))
        : colors.dim("—") + " ".repeat(maxPrLen - 1)
      : "";
    const meta = r.sha ? colors.dim(`${r.sha}  ${truncate(r.subject, subjectCap)}`) : "";
    const parts = [`  ${marker} ${firstCol}`, prCell, meta].filter(Boolean);
    console.log(parts.join("  "));

    if (!isLast) {
      // Spine extends through branch + PR columns (2 + 1 + 1 + firstCol + gap + pr).
      const spinePad = 2 + maxFirstCol + (maxPrLen ? 2 + maxPrLen : 0);
      console.log(`  ${colors.dim("│" + " ".repeat(spinePad))}`);
    }
  });
  console.log("");

  if (ghFailed) {
    console.log(
      colors.dim(
        "  Tip: could not list open PRs. Install the GitHub CLI (gh) and run gh auth login to show PR numbers here.",
      ),
    );
    console.log("");
  }

  if (rows.length === 1) {
    fail("Nothing to check out — only trunk exists.");
  }

  const choices = rows.map((r) => {
    const pr = prLabel(r.branch);
    const hint = pr ? pr : r.isTrunk ? "(trunk)" : maxPrLen ? "—" : "";
    return {
      name: r.branch,
      message: r.branch,
      ...(hint ? { hint } : {}),
    };
  });
  const limit = Math.min(rows.length, Math.max(10, Math.min(18, (process.stdout.rows ?? 30) - 8)));
  const res = (await prompt({
    type: "autocomplete",
    name: "v",
    message: "Checkout which branch? (type to filter, ↑↓ scroll) ",
    choices,
    limit,
    initial: Math.max(
      0,
      rows.findIndex((r) => r.branch === current),
    ),
  } as never)) as { v: string };

  const target = res.v;
  if (!target || target === current) return;
  if (!(await branchExists(target))) fail(`Branch ${target} doesn't exist.`);

  const prOnTarget = prMap.get(target);

  await ui
    .tasks()
    .add(`Switching to ${target}`, async (task) => {
      task.update(`git checkout ${target}`);
      const co = await git(["checkout", "--quiet", target], {
        allowFail: true,
      });
      if (co.exitCode !== 0) return task.error(co.stderr.trim() || "checkout failed");
      return "switched";
    })
    .run();

  const prNote = prOnTarget != null ? `  ${colors.dim(`·  PR#${prOnTarget}`)}` : "";
  success(`Switched to ${colors.bold(target)}${prNote}`);
}
