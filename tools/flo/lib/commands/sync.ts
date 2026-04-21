import { cliui } from "@poppinss/cliui";
import { branchExists, currentBranch, git, gitFetch, hasUncommittedChanges, localBranches } from "../git.js";
import { detectTrunk, findMergedBranches, ghMergedHeads } from "../trunk.js";
import { colors, conflictHint, fail, multiSelect, success, warn } from "../ui.js";

const ui = cliui();

export async function syncCommand(): Promise<void> {
  let trunk = "";
  let original = "";
  let localSha = "";
  let remoteSha = "";
  let mergedSet = new Set<string>();

  // Phase 1: fetch, detect trunk, scan for merged branches.
  await ui
    .tasks()
    .add("Fetching origin", async (task) => {
      task.update("git fetch origin --prune");
      const fetched = await gitFetch(["origin", "--prune"]);
      if (fetched.exitCode !== 0) return task.error(`couldn't reach origin — ${fetched.stderr.trim()}`);
      return "up to date";
    })
    .add("Detecting trunk", async () => {
      trunk = await detectTrunk();
      original = await currentBranch();
      return trunk;
    })
    .add("Scanning for merged branches", async (task) => {
      task.update("git history + GitHub merged PRs");
      const gitMerged = await findMergedBranches(trunk);
      const prMerged = await ghMergedHeads();
      const locals = new Set(await localBranches());
      mergedSet = new Set<string>(gitMerged);
      for (const head of prMerged) if (locals.has(head) && head !== trunk) mergedSet.add(head);

      localSha = (await git(["rev-parse", trunk], { allowFail: true })).stdout.trim();
      remoteSha = (await git(["rev-parse", `origin/${trunk}`], { allowFail: true })).stdout.trim();

      const n = mergedSet.size;
      return n === 0 ? "none to clean up" : `${n} merged`;
    })
    .run();

  if (await hasUncommittedChanges()) {
    fail("You've got uncommitted changes. Commit or stash them first, then try again.");
  }

  const trunkUpToDate = localSha && remoteSha && localSha === remoteSha;

  // If the user's current branch is merged, move to trunk before cleanup.
  let currentBranchName = original;
  if (mergedSet.has(original) && original !== trunk) {
    await ui
      .tasks()
      .add(`Your branch ${original} was merged — switching to ${trunk}`, async (task) => {
        const co = await git(["checkout", "--quiet", trunk], { allowFail: true });
        if (co.exitCode !== 0) return task.error(`couldn't switch to ${trunk}: ${co.stderr.trim()}`);
        return "switched";
      })
      .run();
    currentBranchName = trunk;
  }

  const mergedBranches = Array.from(mergedSet).filter((b) => b !== currentBranchName);

  if (trunkUpToDate && mergedBranches.length === 0) {
    success(`You're all caught up with origin/${trunk} ✨`);
    return;
  }

  // Fast-forward trunk when needed.
  if (!trunkUpToDate) {
    await ui
      .tasks()
      .add(`Fast-forwarding ${trunk}`, async (task) => {
        task.update(`git checkout ${trunk} && git merge --ff-only origin/${trunk}`);
        const coTrunk = await git(["checkout", "--quiet", trunk], { allowFail: true });
        if (coTrunk.exitCode !== 0) return task.error(`couldn't switch to ${trunk}: ${coTrunk.stderr.trim()}`);
        const ff = await git(["merge", "--ff-only", `origin/${trunk}`], { allowFail: true });
        if (ff.exitCode !== 0) {
          return task.error(`your local ${trunk} has diverged from origin/${trunk} — sort that out manually`);
        }
        return "fast-forwarded";
      })
      .run();
  }

  // Merged-branch cleanup.
  if (mergedBranches.length > 0) {
    const label = mergedBranches.length === 1 ? "branch" : "branches";
    const toDelete = await multiSelect(
      `Found ${mergedBranches.length} merged ${label}. Which ones should I clean up?`,
      mergedBranches,
      true,
    );
    if (toDelete.length > 0) {
      const cleanup = ui.tasks();
      for (const b of toDelete) {
        cleanup.add(`Deleting ${b}`, async (task) => {
          const del = await git(["branch", "-D", b], { allowFail: true });
          if (del.exitCode !== 0) return task.error(del.stderr.trim() || "branch -D failed");
          return "deleted";
        });
      }
      await cleanup.run();
      // One warn per failure (task manager short-circuits; this is a no-op
      // if everything succeeded, otherwise surface the remaining undone branches).
      if (cleanup.getState() === "failed") {
        warn("Some branches couldn't be deleted — check the output above.");
      }
    }
  }

  // Rebase every remaining local branch onto trunk. Abort the whole run on conflict.
  if (!trunkUpToDate) {
    const toRestack = (await localBranches()).filter((b) => b !== trunk);
    if (toRestack.length > 0) {
      const rebases = ui.tasks();
      let failedBranch: string | null = null;
      for (const b of toRestack) {
        rebases.add(`Rebasing ${b} onto ${trunk}`, async (task) => {
          task.update(`git checkout ${b} && git rebase ${trunk}`);
          const co = await git(["checkout", "--quiet", b], { allowFail: true });
          if (co.exitCode !== 0) return task.error(`skipped — ${co.stderr.trim()}`);
          const r = await git(["rebase", trunk], { allowFail: true });
          if (r.exitCode !== 0) {
            await git(["rebase", "--abort"], { allowFail: true });
            failedBranch = b;
            return task.error(`conflict rebasing onto ${trunk} — rolled back`);
          }
          return "rebased";
        });
      }
      await rebases.run();

      if (rebases.getState() === "failed" && failedBranch) {
        if (await branchExists(original)) {
          await git(["checkout", "--quiet", original], { allowFail: true });
        }
        console.error("");
        console.error(colors.red(`Rolled back rebase of ${colors.bold(failedBranch)}.`));
        console.error(`When you're ready, finish it off with: ${colors.cyan(`flo restack ${failedBranch}`)}`);
        console.error("");
        conflictHint("rebase");
        process.exit(1);
      }
    }
  }

  // Return to original branch (if it still exists).
  if (await branchExists(original)) {
    await git(["checkout", "--quiet", original], { allowFail: true });
  } else {
    warn(`Your branch ${original} was cleaned up — leaving you on ${trunk}.`);
  }
  success(`All set — everything's rebased on ${trunk} 🎉`);
}
