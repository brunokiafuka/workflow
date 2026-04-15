import { git } from "../git.js";
import { fail, logCmd, success } from "../ui.js";

export async function addCommand(): Promise<void> {
  logCmd(["add", "-A"]);
  const r = await git(["add", "-A"], { allowFail: true });
  if (r.exitCode !== 0) fail(`Couldn't stage changes: ${r.stderr.trim()}`);
  success("Everything's staged");
}
