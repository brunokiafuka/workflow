import {
  branchExists,
  currentBranch,
  git,
  gitFetch,
  gitInherit,
  hasUncommittedChanges,
} from "../git.js";
import { conflictHint, fail, logCmd, success } from "../ui.js";

export async function getCommand(branch: string | undefined): Promise<void> {
  if (!branch) {
    const current = await currentBranch();
    if (!current || current === "HEAD") {
      fail("You're in detached HEAD — tell me which branch: flo get <branch>");
    }
    branch = current;
  }

  logCmd(["fetch", "origin", branch!]);
  const fetched = await gitFetch(["origin", branch!]);
  if (fetched.exitCode !== 0) {
    fail(`Couldn't fetch origin/${branch}: ${fetched.stderr.trim()}`);
  }

  if (await hasUncommittedChanges()) {
    fail("You've got uncommitted changes. Commit or stash them first, then try again.");
  }

  if (await branchExists(branch!)) {
    logCmd(["checkout", branch!]);
    const co = await git(["checkout", branch!]);
    if (co.exitCode !== 0) fail(`Couldn't switch to ${branch}: ${co.stderr}`);
    logCmd(["rebase", `origin/${branch}`]);
    const rebase = await gitInherit(["rebase", `origin/${branch}`]);
    if (rebase !== 0) {
      conflictHint("rebase");
      process.exit(1);
    }
    success(`${branch} is up to date with origin/${branch} ✨`);
    return;
  }

  logCmd(["checkout", "-b", branch!, "--track", `origin/${branch}`]);
  const co = await git(["checkout", "-b", branch!, "--track", `origin/${branch}`]);
  if (co.exitCode !== 0) fail(`Couldn't create ${branch}: ${co.stderr}`);
  success(`Created ${branch} and set it tracking origin/${branch}`);
}
