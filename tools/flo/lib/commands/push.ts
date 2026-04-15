import { currentBranch, git, gitInherit, upstreamOf } from "../git.js";
import { fail, logCmd, success, warn } from "../ui.js";

export async function pushCommand(): Promise<void> {
  const branch = await currentBranch();
  if (!branch || branch === "HEAD") {
    fail("You're in detached HEAD — check out a branch first.");
  }

  const upstream = await upstreamOf(branch);
  if (!upstream) {
    logCmd(["push", "-u", "origin", "HEAD"]);
    const code = await gitInherit(["push", "-u", "origin", "HEAD"]);
    if (code !== 0) fail("Push didn't go through.");
    success(`🚀 Pushed ${branch} and set it tracking origin/${branch}`);
    return;
  }

  logCmd(["push", "--force-with-lease"]);
  const res = await git(["push", "--force-with-lease"], { allowFail: true });
  process.stdout.write(res.stdout);
  process.stderr.write(res.stderr);
  if (res.exitCode === 0) {
    success("🚀 Pushed");
    return;
  }
  if (/stale info|rejected|non-fast-forward|force-with-lease/i.test(res.stderr)) {
    warn("Remote has moved on since your last fetch. Run `flo sync` first, then try again.");
  }
  process.exit(res.exitCode);
}
