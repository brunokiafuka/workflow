#!/usr/bin/env -S tsx
import inquirer from "inquirer";
import {
  addCommand,
  checkoutCommand,
  commitCommand,
  type CommitOpts,
  getCommand,
  modifyCommand,
  type ModifyOpts,
  pushCommand,
  restackCommand,
  setupCommand,
  submitCommand,
  syncCommand,
} from "./lib/commands/index.js";
import { CONFIG_FILE, loadConfig } from "./lib/config.js";
import { c, fail } from "./lib/ui.js";

const HELP = `
flo — your local git workflow helper

Usage:
  flo sync                Fetch origin, fast-forward trunk, prompt to delete
                          merged branches, then rebase every local branch
                          onto trunk. Aborts on conflict and suggests flo restack.
  flo get [branch]        Fetch and check out <branch> from origin, rebasing
                          only that one branch. Defaults to the current branch.
  flo checkout            Pick a local branch from a graph view and switch to it.
  flo restack [branch]    Rebase the current (or named) branch onto trunk,
                          leaving conflicts open for you to resolve.
  flo add                 Stage all changes (git add -A).
  flo commit [flags]      Create a new commit on the current branch.
    -m <msg>              commit message (asks if omitted)
    -a                    stage all changes first
  flo modify [flags]      Amend (or create) a commit on the current branch.
    -m <msg>              amend with new message
    -a                    stage all changes first
    -c                    create a new commit instead of amending
    -e                    open editor for the amended message
  flo setup               Configure .flo/config.json for this repo (trunk,
                          branch template, user prefix). Per-dev — auto-ignored.
  flo push                Push current branch with --force-with-lease
                          (sets upstream on first push).
  flo submit              Push and open/update the PR for the current branch.
                          Creates a draft PR (via gh pr create --draft --fill)
                          if none exists yet.
  flo --help              Show this message.
`;

function parseCommit(argv: string[]): CommitOpts {
  const opts: CommitOpts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-m":
      case "--message":
        opts.message = argv[++i];
        if (!opts.message) fail("-m requires a message argument");
        break;
      case "-a":
      case "--all":
        opts.all = true;
        break;
      default:
        fail(`Unknown flag for commit: ${a}`);
    }
  }
  return opts;
}

function parseModify(argv: string[]): ModifyOpts {
  const opts: ModifyOpts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-m":
      case "--message":
        opts.message = argv[++i];
        if (!opts.message) fail("-m requires a message argument");
        break;
      case "-a":
      case "--all":
        opts.all = true;
        break;
      case "-c":
      case "--commit":
        opts.newCommit = true;
        break;
      case "-e":
      case "--edit":
        opts.edit = true;
        break;
      default:
        fail(`Unknown flag for modify: ${a}`);
    }
  }
  return opts;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return;
  }

  // Ensure config is defined for the commands that need it (everything except
  // setup and help). If it's missing, offer to run setup inline.
  if (cmd !== "setup" && (await loadConfig()) === null) {
    console.log(
      c.dim(`  No ${c.b(CONFIG_FILE)} found for this repo.`),
    );
    if (process.stdout.isTTY) {
      const { runSetup } = await inquirer.prompt<{ runSetup: boolean }>([
        {
          type: "confirm",
          name: "runSetup",
          message: "Run flo setup now?",
          default: true,
        },
      ]);
      if (runSetup) {
        await setupCommand();
        console.log("");
      } else {
        console.log(
          c.dim(`  Carrying on with defaults. Run ${c.cyan("flo setup")} later when you're ready.`),
        );
      }
    } else {
      console.log(
        c.dim(`  Run ${c.cyan("flo setup")} to configure it.`),
      );
    }
  }

  switch (cmd) {
    case "sync":
      await syncCommand();
      break;
    case "get":
      await getCommand(rest[0]);
      break;
    case "checkout":
    case "co":
      await checkoutCommand();
      break;
    case "add":
      await addCommand();
      break;
    case "commit":
      await commitCommand(parseCommit(rest));
      break;
    case "restack":
      await restackCommand(rest[0]);
      break;
    case "modify":
      await modifyCommand(parseModify(rest));
      break;
    case "push":
      await pushCommand();
      break;
    case "setup":
      await setupCommand();
      break;
    case "submit":
      await submitCommand();
      break;
    default:
      console.error(`I don't know the command "${cmd}".`);
      console.error(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  // enquirer throws on Ctrl-C with an empty value — treat as clean exit.
  if (err === "" || err === undefined) {
    console.error("\nOK, cancelled.");
    process.exit(130);
  }
  fail(err instanceof Error ? err.message : String(err));
});
