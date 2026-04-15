import { branchExists, currentBranch, git, gitInherit } from "../git.js";
import { detectTrunk } from "../trunk.js";
import { conflictHint, fail, logCmd, success } from "../ui.js";

export async function restackCommand(target?: string): Promise<void> {
  const trunk = await detectTrunk();
  if (target) {
    if (!(await branchExists(target))) fail(`Can't find a branch called ${target}.`);
    logCmd(["checkout", target]);
    const co = await git(["checkout", "--quiet", target], { allowFail: true });
    if (co.exitCode !== 0) fail(`Couldn't switch to ${target}: ${co.stderr.trim()}`);
  }
  const branch = await currentBranch();
  if (branch === trunk) fail(`You're already on ${trunk} — nothing to restack.`);
  logCmd(["rebase", trunk]);
  const code = await gitInherit(["rebase", trunk]);
  if (code !== 0) {
    conflictHint("rebase");
    process.exit(1);
  }
  success(`${branch} is now restacked on ${trunk} 👍`);
}
