import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { cliui } from "@poppinss/cliui";
import { loadRecipes } from "../recipes.js";
import { colors, fail, success } from "../ui.js";

const ui = cliui();

export async function initCommand(): Promise<void> {
  const file = await loadRecipes();
  if (!file) {
    fail(`No ${colors.bold("flo.yml")} in this repo.`);
  }
  if (file.init.length === 0) {
    fail(`No ${colors.bold("init:")} steps defined in flo.yml.`);
  }

  const total = file.init.length;
  const tm = ui.tasks();
  // Per-step output buffer — replayed only if that step fails.
  const buffers = new Map<number, string[]>();
  let failedAt = -1;

  file.init.forEach((step, i) => {
    const n = i + 1;
    const buf: string[] = [];
    buffers.set(i, buf);

    tm.add(`[${n}/${total}] ${step.name}  ${colors.dim(step.run)}`, async (task) => {
      const child = spawn(step.run, {
        shell: true,
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
      });

      const pipe = (stream: NodeJS.ReadableStream) => {
        const rl = createInterface({ input: stream });
        rl.on("line", (line) => buf.push(line));
      };
      if (child.stdout) pipe(child.stdout);
      if (child.stderr) pipe(child.stderr);

      const code = await new Promise<number>((resolve) => {
        child.on("close", (c) => resolve(c ?? 0));
        child.on("error", () => resolve(1));
      });

      if (code !== 0) {
        failedAt = i;
        return task.error(`${step.name} failed (exit ${code})`);
      }
      return "done";
    });
  });

  await tm.run();

  if (failedAt >= 0) {
    const lines = buffers.get(failedAt) ?? [];
    console.error("");
    for (const line of lines) console.error(`  ${colors.dim("│")} ${line}`);
    console.error("");
    console.error(colors.dim(`${failedAt}/${total} steps completed before failure.`));
    process.exit(1);
  }

  success(`init done (${total}/${total} steps)`);
}
