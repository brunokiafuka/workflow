import enquirer from "enquirer";
import { cliui } from "@poppinss/cliui";

const { prompt } = enquirer;
const ui = cliui();
export const colors = ui.colors;

// Kept for backwards compat with existing call sites — same shape as before,
// now routed through cliui's colors implementation.
export const c = {
  ok: (s: string) => colors.green(s),
  warn: (s: string) => colors.yellow(s),
  err: (s: string) => colors.red(s),
  dim: (s: string) => colors.dim(s),
  b: (s: string) => colors.bold(s),
  cyan: (s: string) => colors.cyan(s),
};

export function info(msg: string) {
  console.log(`${colors.cyan().bold("›")} ${msg}`);
}

export function success(msg: string) {
  console.log(`${colors.green().bold("✓")} ${msg}`);
}

export function warn(msg: string) {
  console.log(`${colors.yellow().bold("!")} ${msg}`);
}

export function logCmd(args: string[]) {
  console.log(colors.yellow().dim(`$ git ${args.join(" ")}`));
}

export function fail(msg: string): never {
  console.error(`${colors.red().bold("✗")} ${msg}`);
  process.exit(1);
}

export function conflictHint(kind: "rebase" | "merge" = "rebase") {
  const cmd = kind === "rebase" ? "rebase" : "merge";
  ui.sticker()
    .heading(colors.red("There are conflicts to work through"))
    .add("")
    .add(`${colors.bold("1.")}  Take a look:    ${colors.cyan("git status")}`)
    .add(`${colors.bold("2.")}  Fix the files,  then ${colors.cyan("git add <file>")}`)
    .add(`${colors.bold("3a.")} Carry on:       ${colors.cyan(`git ${cmd} --continue`)}`)
    .add(`${colors.bold("3b.")} Bail out:       ${colors.cyan(`git ${cmd} --abort`)}`)
    .render();
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
