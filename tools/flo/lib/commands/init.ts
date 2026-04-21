import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { loadRecipes } from "../recipes.js";
import { c, fail } from "../ui.js";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m${secs.toString().padStart(2, "0")}s`;
}

export async function initCommand(): Promise<void> {
  const file = await loadRecipes();
  if (!file) {
    fail(`No ${c.b("flo.yml")} in this repo.`);
  }
  if (file.init.length === 0) {
    fail(`No ${c.b("init:")} steps defined in flo.yml.`);
  }

  const bar = c.dim("│");
  const total = file.init.length;
  const startedAll = Date.now();

  console.log("");
  console.log(
    `  ${c.cyan("▶")} ${c.b("init")}  ${c.dim(`${total} step${total === 1 ? "" : "s"}`)}`,
  );
  console.log(`  ${bar}`);

  for (let i = 0; i < total; i++) {
    const step = file.init[i];
    const n = i + 1;
    const started = Date.now();

    console.log(`  ${bar} ${c.b(`[${n}/${total}]`)} ${step.name}`);
    console.log(`  ${bar} ${c.dim(`$ ${step.run}`)}`);
    console.log(`  ${bar}`);

    const child = spawn(step.run, {
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
    });

    const pipe = (stream: NodeJS.ReadableStream) => {
      const rl = createInterface({ input: stream });
      rl.on("line", (line) => console.log(`  ${bar} ${line}`));
    };
    if (child.stdout) pipe(child.stdout);
    if (child.stderr) pipe(child.stderr);

    const code: number = await new Promise((resolve) => {
      child.on("close", (exit) => resolve(exit ?? 0));
      child.on("error", () => resolve(1));
    });

    const dur = formatDuration(Date.now() - started);
    console.log(`  ${bar}`);

    if (code !== 0) {
      console.log(
        `  ${c.err("✗")} ${c.dim(`${step.name} failed in ${dur} (exit ${code}) — stopping`)}`,
      );
      console.log(
        `  ${c.dim(`${i}/${total} steps completed before failure`)}`,
      );
      console.log("");
      process.exit(code);
    }

    console.log(`  ${bar} ${c.ok("✓")} ${c.dim(`${step.name} — ${dur}`)}`);
    if (n < total) console.log(`  ${bar}`);
  }

  const totalDur = formatDuration(Date.now() - startedAll);
  console.log(`  ${bar}`);
  console.log(
    `  ${c.ok("✓")} ${c.dim(`init done in ${totalDur} (${total}/${total} steps)`)}`,
  );
  console.log("");
}
