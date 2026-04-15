import { branchExists, currentBranch, git, gitFetch, hasUncommittedChanges, localBranches } from "../git.js";
import { detectTrunk, findMergedBranches } from "../trunk.js";
import { c, fail, info, logCmd, multiSelect, success, warn } from "../ui.js";

export async function syncCommand(): Promise<void> {
  info("Syncing your branches…");
  logCmd(["fetch", "origin", "--prune"]);
  const fetched = await gitFetch(["origin", "--prune"]);
  if (fetched.exitCode !== 0) fail(`Couldn't reach origin — ${fetched.stderr.trim()}`);

  const trunk = await detectTrunk();
  const original = await currentBranch();

  if (await hasUncommittedChanges()) {
    fail("You've got uncommitted changes. Commit or stash them first, then try again.");
  }

  const localSha = (await git(["rev-parse", trunk], { allowFail: true })).stdout.trim();
  const remoteSha = (await git(["rev-parse", `origin/${trunk}`], { allowFail: true }))
    .stdout.trim();
  const trunkUpToDate = localSha && remoteSha && localSha === remoteSha;
  const mergedBranches = (await findMergedBranches(trunk)).filter((b) => b !== original);

  if (trunkUpToDate && mergedBranches.length === 0) {
    success(`You're all caught up with origin/${trunk} ✨`);
    return;
  }

  // Fast-forward trunk when needed.
  if (!trunkUpToDate) {
    logCmd(["checkout", trunk]);
    const coTrunk = await git(["checkout", "--quiet", trunk], { allowFail: true });
    if (coTrunk.exitCode !== 0) {
      fail(`Couldn't switch to ${trunk}: ${coTrunk.stderr.trim()}`);
    }
    logCmd(["merge", "--ff-only", `origin/${trunk}`]);
    const ff = await git(["merge", "--ff-only", `origin/${trunk}`], { allowFail: true });
    if (ff.exitCode !== 0) {
      warn(`Your local ${trunk} has diverged from origin/${trunk} — you'll need to sort that out manually.`);
    }
  }

  // Merged-branch cleanup.
  if (mergedBranches.length > 0) {
    const label = mergedBranches.length === 1 ? "branch" : "branches";
    const toDelete = await multiSelect(
      `Found ${mergedBranches.length} merged ${label}. Which ones should I clean up?`,
      mergedBranches,
      true,
    );
    for (const b of toDelete) {
      logCmd(["branch", "-D", b]);
      const del = await git(["branch", "-D", b], { allowFail: true });
      if (del.exitCode !== 0) warn(`Couldn't delete ${b}: ${del.stderr.trim()}`);
    }
  }

  // Rebase every remaining local branch onto trunk. Abort on conflict.
  if (!trunkUpToDate) {
    const toRestack = (await localBranches()).filter((b) => b !== trunk);
    for (const b of toRestack) {
      logCmd(["checkout", b]);
      const co = await git(["checkout", "--quiet", b], { allowFail: true });
      if (co.exitCode !== 0) {
        warn(`Skipped ${b} — ${co.stderr.trim()}`);
        continue;
      }
      logCmd(["rebase", trunk]);
      const r = await git(["rebase", trunk], { allowFail: true });
      if (r.exitCode !== 0) {
        await git(["rebase", "--abort"], { allowFail: true });
        if (await branchExists(original)) {
          await git(["checkout", "--quiet", original], { allowFail: true });
        }
        console.error("");
        console.error(
          c.err(`✗ Hit a conflict rebasing ${c.b(b)} onto ${c.b(trunk)} — rolled the rebase back.`),
        );
        console.error(
          `  When you're ready, finish it off with: ${c.cyan(`flo restack ${b}`)}`,
        );
        console.error("");
        process.exit(1);
      }
    }
  }

  // Return to original branch (if it still exists).
  if (await branchExists(original)) {
    logCmd(["checkout", original]);
    await git(["checkout", "--quiet", original], { allowFail: true });
  } else {
    warn(`Your branch ${original} was cleaned up — leaving you on ${trunk}.`);
  }
  success(`All set — everything's rebased on ${trunk} 🎉`);
}
