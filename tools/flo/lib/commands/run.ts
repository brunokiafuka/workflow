import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { cliui } from "@poppinss/cliui";
import { listRecipeNames, loadRecipes, resolveRecipe } from "../recipes.js";
import { colors, fail } from "../ui.js";

const ui = cliui();

function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (!/[\s'"\\$`!|&;<>()*?{}[\]~#]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function runCommand(
  nameOrAlias: string | undefined,
  extraArgs: string[],
): Promise<void> {
  if (!nameOrAlias) fail("Usage: flo run <name> [...args]");

  const file = await loadRecipes();
  if (!file) {
    fail(
      `No ${colors.bold("flo.yml")} in this repo. Define commands there to use ${colors.cyan("flo run")}.`,
    );
  }

  const recipe = resolveRecipe(file, nameOrAlias);
  if (!recipe) {
    const names = listRecipeNames(file);
    const list = names.length
      ? names.map((n) => `    ${colors.cyan(n)}`).join("\n")
      : `    ${colors.dim("(none defined)")}`;
    fail(`No recipe "${nameOrAlias}" in ${colors.bold("flo.yml")}.\n\n  Available:\n${list}`);
  }

  const extras = extraArgs.length ? ` ${extraArgs.map(shellQuote).join(" ")}` : "";
  const full = `${recipe.command}${extras}`;

  const buffer: string[] = [];
  let exitCode = 0;

  await ui
    .tasks()
    .add(`${recipe.name}  ${colors.dim(full)}`, async (task) => {
      const child = spawn(full, {
        shell: true,
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
      });

      // Buffer subprocess output silently; the spinner stays on the task title.
      // Raw output isn't meaningful progress (per cliui docs, task.update is for
      // semantic messages you emit), and piping it here just flickers through
      // pnpm/tsx boilerplate.
      const pipe = (stream: NodeJS.ReadableStream) => {
        const rl = createInterface({ input: stream });
        rl.on("line", (line) => buffer.push(line));
      };
      if (child.stdout) pipe(child.stdout);
      if (child.stderr) pipe(child.stderr);

      exitCode = await new Promise<number>((resolve) => {
        child.on("close", (c) => resolve(c ?? 0));
        child.on("error", () => resolve(1));
      });

      if (exitCode !== 0) return task.error(`exit ${exitCode}`);
      return "done";
    })
    .run();

  if (exitCode !== 0) {
    console.error("");
    for (const line of buffer) console.error(`  ${colors.dim("│")} ${line}`);
    console.error("");
    process.exit(exitCode);
  }
}
