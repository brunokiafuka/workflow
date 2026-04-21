import { cliui } from "@poppinss/cliui";
import { branchExists, currentBranch, git } from "../git.js";
import { detectTrunk } from "../trunk.js";
import { conflictHint, fail, success } from "../ui.js";

const ui = cliui();

export async function restackCommand(target?: string): Promise<void> {
  const trunk = await detectTrunk();

  if (target) {
    if (!(await branchExists(target))) fail(`Can't find a branch called ${target}.`);
  }

  const branch = target ?? (await currentBranch());
  if (branch === trunk) fail(`You're already on ${trunk} — nothing to restack.`);

  let conflicted = false;

  const tm = ui.tasks();

  if (target) {
    tm.add(`Switching to ${target}`, async (task) => {
      task.update(`git checkout ${target}`);
      const co = await git(["checkout", "--quiet", target], { allowFail: true });
      if (co.exitCode !== 0) return task.error(co.stderr.trim() || "checkout failed");
      return "switched";
    });
  }

  tm.add(`Rebasing ${branch} onto ${trunk}`, async (task) => {
    task.update(`git rebase ${trunk}`);
    const r = await git(["rebase", trunk], { allowFail: true });
    if (r.exitCode !== 0) {
      // Leave the rebase in-progress so the user can resolve conflicts.
      conflicted = true;
      const tail = r.stderr.trim().split("\n").pop() ?? "rebase conflict";
      return task.error(tail);
    }
    return "rebased";
  });

  await tm.run();

  if (conflicted) {
    conflictHint("rebase");
    process.exit(1);
  }
  if (tm.getState() === "failed") process.exit(1);

  success(`${branch} is now restacked on ${trunk} 👍`);
}
