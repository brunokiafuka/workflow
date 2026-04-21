import { cliui } from "@poppinss/cliui";
import { execa } from "execa";
import { currentBranch, git, gitInherit } from "../git.js";
import { detectTrunk } from "../trunk.js";
import { colors, fail, info, success } from "../ui.js";

const ui = cliui();

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

  let trunk = "";
  let branch = "";
  let commits = 0;
  let summary = "";
  let copyBody = "";

  // Gather everything we need up front as a task group.
  await ui
    .tasks()
    .add("Detecting trunk", async () => {
      trunk = await detectTrunk();
      branch = await currentBranch();
      return trunk;
    })
    .addIf(!copy, "Measuring diff", async () => {
      if (branch === trunk) return "working tree";
      const countRes = await git(["rev-list", "--count", `${trunk}...HEAD`], { allowFail: true });
      commits = parseInt(countRes.stdout.trim(), 10) || 0;
      const statRes = await git(["diff", "--stat", `${trunk}...HEAD`], { allowFail: true });
      const statLines = statRes.stdout.trim().split("\n").filter(Boolean);
      summary = statLines.at(-1)?.trim() ?? "";
      return summary || `${commits} commit${commits !== 1 ? "s" : ""}`;
    })
    .addIf(copy, "Capturing diff", async (task) => {
      const args = branch === trunk
        ? ["diff", ...flags]
        : ["diff", `${trunk}...HEAD`, ...flags];
      const r = await git(args, { allowFail: true });
      copyBody = r.stdout;
      return `${copyBody.split("\n").length} lines`;
    })
    .addIf(copy, "Copying to clipboard", async (task) => {
      const ok = await copyToClipboard(copyBody);
      if (!ok) return task.error("pbcopy not available");
      return "copied";
    })
    .run();

  // Copy mode: done (task group handled the I/O); just print the summary.
  if (copy) {
    if (branch === trunk) {
      success("Working tree diff copied to clipboard.");
    } else {
      info(`${colors.bold(branch)} vs ${colors.bold(trunk)}  (${commits} commit${commits !== 1 ? "s" : ""})`);
      if (summary) console.log(`  ${colors.dim(summary)}`);
      success("Diff copied to clipboard.");
    }
    return;
  }

  // Display mode: stream git diff through inherited stdio.
  if (branch === trunk) {
    info(`On ${colors.bold(trunk)} — showing working tree changes.`);
    console.log("");
    const code = await gitInherit(["diff", "--color=always", ...flags]);
    if (code !== 0) process.exit(code);
    return;
  }

  info(`${colors.bold(branch)} vs ${colors.bold(trunk)}  (${commits} commit${commits !== 1 ? "s" : ""})`);
  if (summary) console.log(`  ${colors.dim(summary)}`);
  console.log("");

  const code = await gitInherit(["diff", "--color=always", `${trunk}...HEAD`, ...flags]);
  if (code !== 0) fail("diff exited with an error.");
}
