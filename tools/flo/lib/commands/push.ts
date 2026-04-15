import { execa } from "execa";
import { currentBranch, upstreamOf } from "../git.js";
import { fail, logCmd, success, warn } from "../ui.js";

export type PushResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  firstPush: boolean;
};

/** Core push used by both `flo push` and `flo submit`. Captures output. */
export async function pushCurrentBranch(): Promise<{ branch: string; result: PushResult }> {
  const branch = await currentBranch();
  if (!branch || branch === "HEAD") {
    fail("You're in detached HEAD — check out a branch first.");
  }
  const upstream = await upstreamOf(branch);
  const args = upstream ? ["push", "--force-with-lease"] : ["push", "-u", "origin", "HEAD"];
  const r = await execa("git", args, { reject: false });
  return {
    branch,
    result: {
      exitCode: r.exitCode ?? 0,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      firstPush: !upstream,
    },
  };
}

export async function pushCommand(): Promise<void> {
  const args = (await upstreamOf(await currentBranch())) ? ["push", "--force-with-lease"] : ["push", "-u", "origin", "HEAD"];
  logCmd(args);
  const { branch, result } = await pushCurrentBranch();
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.exitCode === 0) {
    if (result.firstPush) {
      success(`🚀 Pushed ${branch} and set it tracking origin/${branch}`);
    } else {
      success("🚀 Pushed");
    }
    return;
  }
  if (/stale info|rejected|non-fast-forward|force-with-lease/i.test(result.stderr)) {
    warn("Remote has moved on since your last fetch. Run `flo sync` first, then try again.");
  }
  process.exit(result.exitCode || 1);
}
