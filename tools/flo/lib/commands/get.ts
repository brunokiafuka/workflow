import { cliui } from "@poppinss/cliui";
import { execa } from "execa";

import { branchExists, currentBranch, git, gitFetch, gitInherit, hasUncommittedChanges } from "../git.js";
import { detectTrunk } from "../trunk.js";
import { c, conflictHint, fail, info, logCmd, success } from "../ui.js";

const ui = cliui();

export async function getCommand(branch: string | undefined): Promise<void> {
  if (!branch) {
    const current = await currentBranch();
    if (!current || current === "HEAD") {
      fail("You're in detached HEAD — tell me which branch: flo get <branch>");
    }
    branch = current;
  }

  if (/^https?:\/\//i.test(branch!)) {
    await getFromURL(branch!);
    return;
  }

  if (branch!.includes(":")) {
    await getFromFork(branch!);
    return;
  }

  const existed = await branchExists(branch!);
  let fetchOk = true;

  await ui
    .tasks()
    .add(`Fetching origin/${branch}`, async (task) => {
      task.update(`git fetch origin ${branch}`);
      const fetched = await gitFetch(["origin", branch!]);
      if (fetched.exitCode !== 0) {
        fetchOk = false;
        return task.error(`couldn't fetch — ${fetched.stderr.trim()}`);
      }
      return "up to date";
    })
    .run();

  if (!fetchOk) process.exit(1);

  let failed = false;

  await ui
    .tasks()
    .addIf(!existed, `Creating ${branch} tracking origin/${branch}`, async (task) => {
      const co = await git(["checkout", "-b", branch!, "--track", `origin/${branch}`]);
      if (co.exitCode !== 0) {
        failed = true;
        return task.error(`couldn't create ${branch}: ${co.stderr}`);
      }
      return "tracking set";
    })
    .addIf(existed, `Switching to ${branch}`, async (task) => {
      if (await hasUncommittedChanges()) {
        failed = true;
        return task.error("you've got uncommitted changes — commit or stash them first");
      }
      const co = await git(["checkout", branch!]);
      if (co.exitCode !== 0) {
        failed = true;
        return task.error(`couldn't switch: ${co.stderr}`);
      }
      return "checked out";
    })
    .run();

  if (failed) process.exit(1);

  if (!existed) {
    success(`Created ${branch} and set it tracking origin/${branch}`);
    await hintRestackIfBehindTrunk();
    return;
  }

  // Rebase uses inherited stdio so the user sees git's own output on conflict.
  logCmd(["rebase", `origin/${branch}`]);
  const rebase = await gitInherit(["rebase", `origin/${branch}`]);
  if (rebase !== 0) {
    conflictHint("rebase");
    process.exit(1);
  }
  success(`${branch} is up to date with origin/${branch} ✨`);
  await hintRestackIfBehindTrunk();
}

async function getFromURL(url: string): Promise<void> {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (!m) {
    fail(`'${url}' doesn't look like a PR URL — expected github.com/owner/repo/pull/<number>`);
  }
  const [, owner, repo, num] = m!;
  await ghCheckoutPR(url, `${owner}/${repo}#${num}`);
}

async function getFromFork(ref: string): Promise<void> {
  let prNumber: number | null = null;

  await ui
    .tasks()
    .add(`Finding PR for ${ref}`, async (task) => {
      const found = await findPRByHeadRef(ref);
      if (found == null) {
        return task.error(`no PR found with head '${ref}' — check the ref or run: gh pr checkout <number>`);
      }
      prNumber = found;
      return `PR #${found}`;
    })
    .run();

  if (prNumber == null) process.exit(1);
  await ghCheckoutPR(String(prNumber), `PR #${prNumber} (${ref})`);
}

async function ghCheckoutPR(identifier: string, label: string): Promise<void> {
  let failed = false;
  await ui
    .tasks()
    .add(`Checking out ${label} via gh`, async (task) => {
      const r = await execa("gh", ["pr", "checkout", identifier], {
        reject: false,
      });
      if (r.exitCode !== 0) {
        failed = true;
        return task.error(`gh pr checkout failed — ${String(r.stderr ?? "").trim() || "unknown error"}`);
      }
      return "checked out";
    })
    .run();

  if (failed) process.exit(1);
  success(`Checked out ${label} ✨`);
  await hintRestackIfBehindTrunk();
}

async function hintRestackIfBehindTrunk(): Promise<void> {
  const trunk = await detectTrunk();
  const current = await currentBranch();
  if (!current || current === trunk) return;
  const r = await git(["rev-list", "--count", `HEAD..origin/${trunk}`], {
    allowFail: true,
  });
  if (r.exitCode !== 0) return;
  const behind = parseInt(r.stdout.trim(), 10);
  if (!Number.isFinite(behind) || behind === 0) return;
  info(
    `${current} is ${behind} commit${behind === 1 ? "" : "s"} behind origin/${trunk} — run ${c.cyan("flo restack")} to rebase.`,
  );
}

async function findPRByHeadRef(ref: string): Promise<number | null> {
  const r = await execa(
    "gh",
    [
      "api",
      `repos/{owner}/{repo}/pulls?state=all&head=${ref}&per_page=5`,
      "--jq",
      'sort_by(.state != "open") | .[0].number // empty',
    ],
    { reject: false },
  );
  if (r.exitCode !== 0) return null;
  const n = parseInt(String(r.stdout).trim(), 10);
  return Number.isFinite(n) ? n : null;
}
