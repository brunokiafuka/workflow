import { cliui } from "@poppinss/cliui";
import { git } from "../git.js";
import { success } from "../ui.js";

const ui = cliui();

export async function addCommand(): Promise<void> {
  await ui
    .tasks()
    .add("Staging all changes", async (task) => {
      task.update("git add -A");
      const r = await git(["add", "-A"], { allowFail: true });
      if (r.exitCode !== 0) return task.error(r.stderr.trim() || "git add failed");
      return "staged";
    })
    .run();
  success("Everything's staged");
}
