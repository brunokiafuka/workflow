import { git, gitInherit, hasUnstagedChanges } from "../git.js";
import { ensureOffTrunk, isOnTrunk, suggestBranchName } from "../guards.js";
import { detectTrunk } from "../trunk.js";
import { confirm, fail, info, logCmd, promptInput, success } from "../ui.js";

export type ModifyOpts = {
  message?: string;
  all?: boolean;
  newCommit?: boolean;
  edit?: boolean;
};

/** True when HEAD has at least one commit beyond trunk. */
async function hasOwnCommits(): Promise<boolean> {
  const trunk = await detectTrunk();
  const r = await git(["rev-list", "--count", `${trunk}..HEAD`], { allowFail: true });
  if (r.exitCode !== 0) return true; // if we can't tell, don't block the user
  return r.stdout.trim() !== "0";
}

export async function modifyCommand(opts: ModifyOpts): Promise<void> {
  if (!opts.all && (await hasUnstagedChanges())) {
    const yes = await confirm("You have unstaged changes. Stage them all?", true);
    if (yes) opts.all = true;
  }

  if (opts.all) {
    logCmd(["add", "-A"]);
    const add = await git(["add", "-A"]);
    if (add.exitCode !== 0) fail(`Couldn't stage changes: ${add.stderr}`);
  }

  // Guard against amending the base/trunk commit — if this branch has no
  // commits of its own yet, an amend would rewrite the trunk's HEAD.
  if (!opts.newCommit && !(await hasOwnCommits())) {
    info("No commit on this branch yet — creating a new one instead of amending.");
    opts.newCommit = true;
    if (!opts.message && !opts.edit) {
      const msg = await promptInput("What's the commit message?");
      if (!msg) fail("I need a message to commit.");
      opts.message = msg;
    }
  }

  // If we'd be committing onto trunk, branch off first (suggest from message).
  if (opts.newCommit && (await isOnTrunk())) {
    await ensureOffTrunk(opts.message ? suggestBranchName(opts.message) : undefined);
  }

  const args: string[] = ["commit"];
  if (!opts.newCommit) args.push("--amend");
  if (opts.message) args.push("-m", opts.message);
  else if (opts.edit) {
    /* default editor */
  } else if (!opts.newCommit) args.push("--no-edit");

  logCmd(args);
  const code = await gitInherit(args);
  if (code !== 0) fail("Commit didn't go through.");
  success(opts.newCommit ? "New commit created" : "Branch updated");
}
