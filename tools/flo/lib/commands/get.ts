import { cliui } from "@poppinss/cliui";
import {
  branchExists,
  currentBranch,
  git,
  gitFetch,
  gitInherit,
  hasUncommittedChanges,
} from "../git.js";
import { conflictHint, fail, logCmd, success } from "../ui.js";

const ui = cliui();

export async function getCommand(branch: string | undefined): Promise<void> {
  if (!branch) {
    const current = await currentBranch();
    if (!current || current === "HEAD") {
      fail("You're in detached HEAD — tell me which branch: flo get <branch>");
    }
    branch = current;
  }

  const existed = await branchExists(branch!);

  await ui
    .tasks()
    .add(`Fetching origin/${branch}`, async (task) => {
      task.update(`git fetch origin ${branch}`);
      const fetched = await gitFetch(["origin", branch!]);
      if (fetched.exitCode !== 0) return task.error(`couldn't fetch — ${fetched.stderr.trim()}`);
      return "up to date";
    })
    .addIf(!existed, `Creating ${branch} tracking origin/${branch}`, async (task) => {
      const co = await git(["checkout", "-b", branch!, "--track", `origin/${branch}`]);
      if (co.exitCode !== 0) return task.error(`couldn't create ${branch}: ${co.stderr}`);
      return "tracking set";
    })
    .addIf(existed, `Switching to ${branch}`, async (task) => {
      if (await hasUncommittedChanges()) {
        return task.error("you've got uncommitted changes — commit or stash them first");
      }
      const co = await git(["checkout", branch!]);
      if (co.exitCode !== 0) return task.error(`couldn't switch: ${co.stderr}`);
      return "checked out";
    })
    .run();

  if (!existed) {
    success(`Created ${branch} and set it tracking origin/${branch}`);
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
}
