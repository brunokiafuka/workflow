import { cliui } from "@poppinss/cliui";
import { git, gitInherit, hasUnstagedChanges } from "../git.js";
import { ensureOffTrunk, isOnTrunk, suggestBranchName } from "../guards.js";
import { detectTrunk } from "../trunk.js";
import { colors, confirm, fail, info, promptInput, success } from "../ui.js";

const ui = cliui();

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
    await ensureOffTrunk(opts.message ? await suggestBranchName(opts.message) : undefined);
  }

  const args: string[] = ["commit"];
  if (!opts.newCommit) args.push("--amend");
  if (opts.message) args.push("-m", opts.message);
  else if (opts.edit) {
    /* default editor */
  } else if (!opts.newCommit) args.push("--no-edit");

  // `-e` amend needs a real editor — capture the staging task, then hand off
  // to inherited stdio for the editor session.
  if (opts.edit && !opts.message && !opts.newCommit) {
    if (opts.all) {
      await ui
        .tasks()
        .add("Staging all changes", async (task) => {
          task.update("git add -A");
          const r = await git(["add", "-A"], { allowFail: true });
          if (r.exitCode !== 0) return task.error(r.stderr.trim() || "git add failed");
          return "staged";
        })
        .run();
    }
    const code = await gitInherit(args);
    if (code !== 0) fail("Commit didn't go through.");
    success("Branch updated");
    return;
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

  tm.add(opts.newCommit ? "Committing" : "Amending", async (task) => {
    task.update(`git ${args.join(" ")}`);
    const r = await git(args, { allowFail: true });
    commitOutput = [r.stdout, r.stderr].filter(Boolean).join("\n");
    if (r.exitCode !== 0) return task.error("commit didn't go through");
    return opts.newCommit ? "committed" : "amended";
  });

  await tm.run();

  if (tm.getState() === "failed") {
    if (commitOutput.trim()) {
      console.error("");
      for (const line of commitOutput.split("\n")) {
        if (line.trim()) console.error(`  ${colors.dim("│")} ${line}`);
      }
      console.error("");
    }
    process.exit(1);
  }
  success(opts.newCommit ? "New commit created" : "Branch updated");
}
