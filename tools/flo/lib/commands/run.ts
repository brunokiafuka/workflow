import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { listRecipeNames, loadRecipes, resolveRecipe } from "../recipes.js";
import { c, fail } from "../ui.js";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m${secs.toString().padStart(2, "0")}s`;
}

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
      `No ${c.b("flo.yml")} in this repo. Define commands there to use ${c.cyan("flo run")}.`,
    );
  }

  const recipe = resolveRecipe(file, nameOrAlias);
  if (!recipe) {
    const names = listRecipeNames(file);
    const list = names.length
      ? names.map((n) => `    ${c.cyan(n)}`).join("\n")
      : `    ${c.dim("(none defined)")}`;
    fail(`No recipe "${nameOrAlias}" in ${c.b("flo.yml")}.\n\n  Available:\n${list}`);
  }

  const extras = extraArgs.length ? ` ${extraArgs.map(shellQuote).join(" ")}` : "";
  const full = `${recipe.command}${extras}`;

  const bar = c.dim("│");
  const started = Date.now();

  console.log("");
  console.log(`  ${c.cyan("▶")} ${c.b(recipe.name)}  ${c.dim(full)}`);
  console.log(`  ${bar}`);

  const child = spawn(full, {
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
  });

  const pipe = (stream: NodeJS.ReadableStream) => {
    const rl = createInterface({ input: stream });
    rl.on("line", (line) => {
      console.log(`  ${bar} ${line}`);
    });
  };
  if (child.stdout) pipe(child.stdout);
  if (child.stderr) pipe(child.stderr);

  const code: number = await new Promise((resolve) => {
    child.on("close", (c) => resolve(c ?? 0));
    child.on("error", () => resolve(1));
  });

  const duration = formatDuration(Date.now() - started);
  console.log(`  ${bar}`);
  if (code === 0) {
    console.log(`  ${c.ok("✓")} ${c.dim(`done in ${duration}`)}`);
  } else {
    console.log(`  ${c.err("✗")} ${c.dim(`failed in ${duration} (exit ${code})`)}`);
  }
  console.log("");

  if (code !== 0) process.exit(code);
}
