import { git, gitInherit, hasUnstagedChanges } from "../git.js";
import { ensureOffTrunk, isOnTrunk, suggestBranchName } from "../guards.js";
import { confirm, fail, logCmd, promptInput, success } from "../ui.js";

export type CommitOpts = {
  message?: string;
  all?: boolean;
};

export async function commitCommand(opts: CommitOpts): Promise<void> {
  if (!opts.all && (await hasUnstagedChanges())) {
    const yes = await confirm("You have unstaged changes. Stage them all?", true);
    if (yes) opts.all = true;
  }

  if (opts.all) {
    logCmd(["add", "-A"]);
    const add = await git(["add", "-A"]);
    if (add.exitCode !== 0) fail(`Couldn't stage changes: ${add.stderr}`);
  }

  let message = opts.message?.trim();
  if (!message) {
    message = await promptInput("What's the commit message?");
    if (!message) fail("I need a message to commit.");
  }

  // If on trunk, branch off before committing (suggest name from message).
  if (await isOnTrunk()) {
    await ensureOffTrunk(suggestBranchName(message));
  }

  logCmd(["commit", "-m", message]);
  const code = await gitInherit(["commit", "-m", message]);
  if (code !== 0) fail("Commit didn't go through.");
  success("New commit created");
}
