import enquirer from "enquirer";
import { branchExists, currentBranch, git, localBranches } from "../git.js";
import { detectTrunk } from "../trunk.js";
import { c, fail, logCmd, success } from "../ui.js";

const { prompt } = enquirer;

type Row = { branch: string; sha: string; subject: string; isTrunk: boolean };

async function headInfo(branch: string): Promise<{ sha: string; subject: string }> {
  const r = await git(["log", "-1", "--pretty=%h\t%s", branch], { allowFail: true });
  const [sha = "", subject = ""] = r.stdout.trim().split("\t");
  return { sha, subject };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export async function checkoutCommand(): Promise<void> {
  const trunk = await detectTrunk();
  const current = await currentBranch();
  const locals = await localBranches();
  const others = locals.filter((b) => b !== trunk);

  // Collect head info for every branch.
  const rows: Row[] = [];
  for (const b of others) {
    const { sha, subject } = await headInfo(b);
    rows.push({ branch: b, sha, subject, isTrunk: false });
  }
  const trunkHead = await headInfo(trunk);
  rows.push({ branch: trunk, sha: trunkHead.sha, subject: trunkHead.subject, isTrunk: true });

  // Render a little tree: branches stacked above trunk, connected by │.
  const maxBranchLen = Math.min(40, Math.max(...rows.map((r) => r.branch.length)));
  console.log("");
  rows.forEach((r, i) => {
    const isLast = i === rows.length - 1;
    const marker = r.branch === current ? c.cyan("●") : r.isTrunk ? c.dim("○") : c.dim("○");
    const name = r.branch === current ? c.b(r.branch) : r.branch;
    const padded = r.branch.padEnd(maxBranchLen, " ").replace(r.branch, name);
    const meta = r.sha ? c.dim(`${r.sha}  ${truncate(r.subject, 50)}`) : "";
    console.log(`  ${marker} ${padded}  ${meta}`);
    if (!isLast) console.log(`  ${c.dim("│")}`);
  });
  console.log("");

  if (rows.length === 1) {
    fail("Nothing to check out — only trunk exists.");
  }

  const choices = rows.map((r) => ({
    name: r.branch,
    message: `${r.branch}${r.isTrunk ? c.dim("  (trunk)") : ""}`,
  }));
  const res = (await prompt({
    type: "select",
    name: "v",
    message: "Checkout which branch?",
    choices,
    initial: Math.max(0, rows.findIndex((r) => r.branch === current)),
  } as never)) as { v: string };

  const target = res.v;
  if (!target || target === current) return;
  if (!(await branchExists(target))) fail(`Branch ${target} doesn't exist.`);

  logCmd(["checkout", target]);
  const co = await git(["checkout", "--quiet", target], { allowFail: true });
  if (co.exitCode !== 0) fail(`Couldn't switch: ${co.stderr.trim()}`);
  success(`Switched to ${c.b(target)}`);
}
