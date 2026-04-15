import chalk from "chalk";
import enquirer from "enquirer";

const { prompt } = enquirer;

export const c = {
  ok: (s: string) => chalk.green(s),
  warn: (s: string) => chalk.yellow(s),
  err: (s: string) => chalk.red(s),
  dim: (s: string) => chalk.dim(s),
  b: (s: string) => chalk.bold(s),
  cyan: (s: string) => chalk.cyan(s),
};

export function info(msg: string) {
  console.log(`${chalk.cyan.bold("›")} ${msg}`);
}

export function success(msg: string) {
  console.log(`${chalk.green.bold("✓")} ${msg}`);
}

export function warn(msg: string) {
  console.log(`${chalk.yellow.bold("!")} ${msg}`);
}

export function logCmd(args: string[]) {
  console.log(chalk.yellow.dim(`$ git ${args.join(" ")}`));
}

export function fail(msg: string): never {
  console.error(`${chalk.red.bold("✗")} ${msg}`);
  process.exit(1);
}

export function conflictHint(kind: "rebase" | "merge" = "rebase") {
  const cmd = kind === "rebase" ? "rebase" : "merge";
  const bar = chalk.red("│");
  console.error("");
  console.error(chalk.red.bold("  ✗ There are conflicts to work through"));
  console.error(`  ${bar}`);
  console.error(`  ${bar} ${c.b("1.")} Take a look:     ${c.cyan(`git status`)}`);
  console.error(`  ${bar} ${c.b("2.")} Fix the files,   then ${c.cyan("git add <file>")}`);
  console.error(`  ${bar} ${c.b("3a.")} Carry on:       ${c.cyan(`git ${cmd} --continue`)}`);
  console.error(`  ${bar} ${c.b("3b.")} Bail out:       ${c.cyan(`git ${cmd} --abort`)}`);
  console.error("");
}

export async function promptInput(message: string, initial?: string): Promise<string> {
  const res = (await prompt({
    type: "input",
    name: "v",
    message,
    initial,
  } as never)) as { v: string };
  return (res.v ?? "").trim();
}

export async function confirm(message: string, initial = true): Promise<boolean> {
  const res = (await prompt({
    type: "confirm",
    name: "v",
    message,
    initial,
  })) as { v: boolean };
  return res.v;
}

export async function multiSelect(
  message: string,
  choices: string[],
  initiallyAll = true,
): Promise<string[]> {
  if (choices.length === 0) return [];
  const res = (await prompt({
    type: "multiselect",
    name: "v",
    message,
    choices: choices.map((name) => ({ name, value: name })),
    initial: initiallyAll ? choices : [],
  } as never)) as { v: string[] };
  return res.v ?? [];
}
