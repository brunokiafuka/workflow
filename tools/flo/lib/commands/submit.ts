import { cliui } from "@poppinss/cliui";
import { execa } from "execa";
import { resolveConfig } from "../config.js";
import { currentBranch, git, upstreamOf } from "../git.js";
import { colors, fail, success, warn } from "../ui.js";
import { pushCurrentBranch, type PushResult } from "./push.js";

const ui = cliui();

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
    const r = await execa("gh", ["pr", "view", branch, "--json", "url,isDraft,state"]);
    return JSON.parse(r.stdout) as { url: string; isDraft: boolean; state: string };
  } catch {
    return null;
  }
}

function badge(status: PrStatus): string {
  switch (status) {
    case "new":
      return colors.cyan("(new)");
    case "update":
      return colors.yellow("(update)");
    case "no update":
      return colors.dim("(no update)");
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
  const { prMode } = await resolveConfig();

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

  console.log(`${colors.bold(branch)}  ${badge(status)}`);

  let pushResult: PushResult | null = null;
  let prUrl = existing?.url ?? "";

  const tm = ui.tasks();

  if (status !== "no update") {
    tm.add("Pushing", async (task) => {
      const { result } = await pushCurrentBranch();
      pushResult = result;
      if (result.exitCode !== 0) {
        return task.error(result.stderr.trim().split("\n").pop() ?? "push failed");
      }
      return result.firstPush ? "set upstream to origin" : "up to date";
    });
  }

  if (!existing) {
    const isDraft = prMode === "draft";
    const label = isDraft ? "Opening draft PR" : "Opening PR";
    const ghArgs = isDraft
      ? ["pr", "create", "--draft", "--fill"]
      : ["pr", "create", "--fill"];
    tm.add(label, async (task) => {
      const r = await execa("gh", ghArgs, { reject: false });
      if (r.exitCode !== 0) {
        return task.error(r.stderr?.trim().split("\n").pop() ?? "gh pr create failed");
      }
      const match = r.stdout.match(/https?:\/\/\S+/);
      prUrl = match ? match[0] : (await lookupPr(branch))?.url ?? "";
      return isDraft ? "draft created" : "created";
    });
  } else if (status === "update") {
    tm.add("Updating PR", async () => "refreshed");
  }

  await tm.run();

  if (pushResult && (pushResult as PushResult).exitCode !== 0) {
    const stderr = (pushResult as PushResult).stderr;
    if (/stale info|rejected|non-fast-forward|force-with-lease/i.test(stderr)) {
      warn("Remote has moved on since your last fetch. Run `flo sync` first, then try again.");
    } else if (stderr.trim()) {
      process.stderr.write(`${stderr}\n`);
    }
    process.exit((pushResult as PushResult).exitCode || 1);
  }

  if (tm.getState() === "failed") {
    process.exit(1);
  }

  const link = prUrl ? colors.cyan(prUrl) : colors.dim("(no url)");
  console.log("");
  success(`${colors.bold(branch)}: ${link}  ${badge(status)}`);
}
