import { renderBranchName, resolveConfig } from "./config.js";
import { currentBranch, git } from "./git.js";
import { detectTrunk } from "./trunk.js";
import { c, fail, info, logCmd, promptInput } from "./ui.js";

/** Turn a commit message into a safe slug (lowercased, underscore-joined). */
export function slugify(message: string): string {
  return (
    message
      .trim()
      .toLowerCase()
      // strip git-invalid chars (~^:?*[\)
      .replace(/[~^:?*[\\]+/g, "")
      // collapse whitespace to single underscore
      .replace(/\s+/g, "_")
      // drop stray punctuation except _-/.
      .replace(/[^a-z0-9_\-/.]/g, "")
      .replace(/_+/g, "_")
      .replace(/^[_\-.]+|[_\-.]+$/g, "")
      .slice(0, 60)
  );
}

/** Slug + apply the configured branch template (e.g. "{user}/{date}_{slug}"). */
export async function suggestBranchName(message: string): Promise<string> {
  const slug = slugify(message);
  const cfg = await resolveConfig();
  return renderBranchName(cfg, slug);
}

export async function isOnTrunk(): Promise<boolean> {
  const trunk = await detectTrunk();
  return (await currentBranch()) === trunk;
}

/**
 * Refuse to commit directly onto trunk. If the user is on main/master, prompt
 * for a new branch name (prefilled from `suggested`) and create it.
 */
export async function ensureOffTrunk(suggested?: string): Promise<void> {
  if (!(await isOnTrunk())) return;
  const trunk = await detectTrunk();

  info(`You're on ${c.b(trunk)} — let's put this work on its own branch first.`);
  const name = (await promptInput("New branch name?", suggested)).trim();
  if (!name) fail("Need a branch name to continue.");

  logCmd(["checkout", "-b", name]);
  const r = await git(["checkout", "-b", name], { allowFail: true });
  if (r.exitCode !== 0) fail(`Couldn't create branch: ${r.stderr.trim()}`);
}
