import { execa } from "execa";
import { currentBranch, git, gitInherit } from "../git.js";
import { detectTrunk } from "../trunk.js";
import { c, fail, info, success } from "../ui.js";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await execa("pbcopy", { input: text });
    return true;
  } catch {
    return false;
  }
}

export async function diffCommand(rawFlags: string[]): Promise<void> {
  const copy = rawFlags.includes("--copy") || rawFlags.includes("-c");
  const flags = rawFlags.filter((f) => f !== "--copy" && f !== "-c");

  const trunk = await detectTrunk();
  const branch = await currentBranch();

  // On trunk: fall back to plain working-tree diff.
  if (branch === trunk) {
    if (copy) {
      const r = await git(["diff", ...flags], { allowFail: true });
      if (await copyToClipboard(r.stdout)) {
        success("Working tree diff copied to clipboard.");
      } else {
        fail("Couldn't copy — is pbcopy available?");
      }
      return;
    }
    info(`On ${c.b(trunk)} — showing working tree changes.`);
    console.log("");
    const code = await gitInherit(["diff", "--color=always", ...flags]);
    if (code !== 0) process.exit(code);
    return;
  }

  // Count commits and files to give a summary header.
  const countRes = await git(["rev-list", "--count", `${trunk}...HEAD`], { allowFail: true });
  const commits = parseInt(countRes.stdout.trim(), 10) || 0;

  const statRes = await git(["diff", "--stat", `${trunk}...HEAD`], { allowFail: true });
  const statLines = statRes.stdout.trim().split("\n").filter(Boolean);
  const summary = statLines.at(-1)?.trim() ?? "";

  // Copy mode: capture output, pipe to pbcopy, skip display.
  if (copy) {
    const r = await git(["diff", `${trunk}...HEAD`, ...flags], { allowFail: true });
    if (await copyToClipboard(r.stdout)) {
      info(`${c.b(branch)} vs ${c.b(trunk)}  (${commits} commit${commits !== 1 ? "s" : ""})`);
      if (summary) console.log(`  ${c.dim(summary)}`);
      success("Diff copied to clipboard.");
    } else {
      fail("Couldn't copy — is pbcopy available?");
    }
    return;
  }

  info(`${c.b(branch)} vs ${c.b(trunk)}  (${commits} commit${commits !== 1 ? "s" : ""})`);
  if (summary) console.log(`  ${c.dim(summary)}`);
  console.log("");

  // Pass through to git diff with color, plus any extra flags (--stat, --name-only, etc.).
  const args = ["diff", "--color=always", `${trunk}...HEAD`, ...flags];
  const code = await gitInherit(args);

  if (code !== 0) {
    fail("diff exited with an error.");
  }
}
