import { execa } from "execa";
import { currentBranch, git, upstreamOf } from "../git.js";
import { c, fail, success, warn } from "../ui.js";
import { pushCurrentBranch } from "./push.js";

type PrStatus = "new" | "update" | "no update";

type PrInfo = { url: string; isDraft: boolean; state: string } | null;

async function ensureGh(): Promise<void> {
  try {
    await execa("gh", ["--version"]);
  } catch {
    fail("`gh` CLI not found. Install it from https://cli.github.com/ and run `gh auth login`.");
  }
}

async function lookupPr(branch: string): Promise<PrInfo> {
  try {
    const r = await execa("gh", [
      "pr",
      "view",
      branch,
      "--json",
      "url,isDraft,state",
    ]);
    const data = JSON.parse(r.stdout) as { url: string; isDraft: boolean; state: string };
    return data;
  } catch {
    return null;
  }
}

function startSpinner(label: string): () => void {
  if (!process.stdout.isTTY) {
    process.stdout.write(`  ${label}…\n`);
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const render = () => {
    process.stdout.write(`\r  ${c.cyan(frames[i % frames.length])} ${label}…`);
    i++;
  };
  render();
  const id = setInterval(render, 80);
  return () => {
    clearInterval(id);
    process.stdout.write(`\r  ${c.ok("✓")} ${label}    \n`);
  };
}

function badge(status: PrStatus): string {
  switch (status) {
    case "new":
      return c.cyan("(new)");
    case "update":
      return c.warn("(update)");
    case "no update":
      return c.dim("(no update)");
  }
}

export async function submitCommand(): Promise<void> {
  await ensureGh();

  const branch = await currentBranch();
  if (!branch || branch === "HEAD") {
    fail("You're in detached HEAD — check out a branch first.");
  }

  const existing = await lookupPr(branch);
  const upstream = await upstreamOf(branch);

  // Determine status before pushing.
  let status: PrStatus;
  if (!existing) {
    status = "new";
  } else if (!upstream) {
    status = "update";
  } else {
    const local = (await git(["rev-parse", "HEAD"])).stdout.trim();
    const remote = (await git(["rev-parse", upstream], { allowFail: true })).stdout.trim();
    status = local && remote && local === remote ? "no update" : "update";
  }

  console.log(`${c.b(branch)}  ${badge(status)}`);

  // Push (skip when nothing to push).
  if (status !== "no update") {
    const stopPush = startSpinner("pushing");
    const { result } = await pushCurrentBranch();
    stopPush();
    if (result.exitCode !== 0) {
      if (/stale info|rejected|non-fast-forward|force-with-lease/i.test(result.stderr)) {
        warn("Remote has moved on since your last fetch. Run `flo sync` first, then try again.");
      } else if (result.stderr.trim()) {
        process.stderr.write(`${result.stderr}\n`);
      }
      process.exit(result.exitCode || 1);
    }
  }

  // Open or refresh PR.
  let prUrl = existing?.url ?? "";
  if (!existing) {
    const stopPr = startSpinner("opening draft PR");
    try {
      const r = await execa("gh", ["pr", "create", "--draft", "--fill"], { reject: false });
      if (r.exitCode !== 0) {
        stopPr();
        if (r.stderr?.trim()) process.stderr.write(`${r.stderr}\n`);
        fail("Couldn't open the PR.");
      }
      const match = r.stdout.match(/https?:\/\/\S+/);
      prUrl = match ? match[0] : (await lookupPr(branch))?.url ?? "";
    } finally {
      stopPr();
    }
  } else if (status === "update") {
    console.log(`  ${c.ok("✓")} PR updated`);
  }

  const link = prUrl ? c.cyan(prUrl) : c.dim("(no url)");
  console.log("");
  success(`${c.b(branch)}: ${link}  ${badge(status)}`);
}
