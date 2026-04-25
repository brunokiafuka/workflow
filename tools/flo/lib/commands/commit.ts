import { cliui } from "@poppinss/cliui";

import { git, hasUnstagedChanges } from "../git.js";
import { ensureOffTrunk, isOnTrunk, suggestBranchName } from "../guards.js";
import { colors, confirm, fail, promptInput, success } from "../ui.js";

const ui = cliui();

export type CommitOpts = {
  message?: string;
  all?: boolean;
};

export async function commitCommand(opts: CommitOpts): Promise<void> {
  if (!opts.all && (await hasUnstagedChanges())) {
    const yes = await confirm("You have unstaged changes. Stage them all?", true);
    if (yes) opts.all = true;
  }

  let message = opts.message?.trim();
  if (!message) {
    message = await promptInput("What's the commit message?");
    if (!message) fail("I need a message to commit.");
  }

  // If on trunk, branch off before committing (suggest name from message).
  if (await isOnTrunk()) {
    await ensureOffTrunk(await suggestBranchName(message));
  }

  const tm = ui.tasks();
  let commitOutput = "";

  if (opts.all) {
    tm.add("Staging all changes", async (task) => {
      task.update("git add -A");
      const r = await git(["add", "-A"], { allowFail: true });
      if (r.exitCode !== 0) return task.error(r.stderr.trim() || "git add failed");
      return "staged";
    });
  }

  tm.add("Committing", async (task) => {
    task.update(`git commit -m "${message!.slice(0, 60)}${message!.length > 60 ? "…" : ""}"`);
    const r = await git(["commit", "-m", message!], { allowFail: true });
    commitOutput = [r.stdout, r.stderr].filter(Boolean).join("\n");
    if (r.exitCode !== 0) return task.error("commit didn't go through");
    return "committed";
  });

  await tm.run();

  if (tm.getState() === "failed") {
    // Replay hook/commit output so the user can see why it failed.
    if (commitOutput.trim()) {
      console.error("");
      for (const line of commitOutput.split("\n")) {
        if (line.trim()) console.error(`  ${colors.dim("│")} ${line}`);
      }
      console.error("");
    }
    process.exit(1);
  }
  success("New commit created");
}
