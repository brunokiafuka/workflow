import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { cliui } from "@poppinss/cliui";
import inquirer, { type DistinctQuestion } from "inquirer";

import {
  DEFAULT_OPEN_BROWSER,
  DEFAULT_PR_MODE,
  displayPath,
  type FloConfig,
  loadConfig,
  type OpenBrowser,
  type PrMode,
  renderBranchName,
  resolveConfig,
  saveConfig,
} from "../config.js";
import { openInEditor } from "../editor.js";
import { prTemplatePath, resolveSlot } from "../slot.js";
import { detectTrunk } from "../trunk.js";
import { colors, info, warn } from "../ui.js";

const DEFAULT_PR_TEMPLATE = `## Summary

## Test plan
- [ ]
`;

const ui = cliui();

const SAMPLE_SLUG = "add_new_feature";
const PREFIX_TEMPLATE = "{user}/{slug}";
const PLAIN_TEMPLATE = "{slug}";

export type SetupOpts = {
  /** Skip the overwrite/update chooser and go straight to the update picker. */
  update?: boolean;
};

export type FullAnswers = {
  trunk: string;
  usePrefix: boolean;
  prefix?: string;
  prMode: PrMode;
};

type ExistingAction = "update" | "overwrite" | "cancel";
type UpdateField = "trunk" | "prefix" | "prMode" | "openBrowser";
type SetupSection = "branchNaming" | "submitSettings" | "repoSettings" | "back" | "exit";
type SubmitAction = "submitBehaviour" | "prDescription" | "browserBehaviour" | "back" | "exit";
type PrBodyAction = "override" | "new" | "back" | "exit";
type SectionResult = { cfg: FloConfig; exit: boolean };

/** Keep prefixes within the safe subset that produces well-formed git refs. */
export function validatePrefix(v: string): true | string {
  const trimmed = v.trim();
  if (!trimmed) return "Required";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
    return "Use letters, digits, and ._- (starts with a letter or digit).";
  }
  return true;
}

/**
 * Warn about the protection the old trunk is losing and ask the user to
 * confirm. Returns true if the change should proceed. No-ops (returns true)
 * when there's no previous trunk or the value is unchanged.
 */
export async function confirmTrunkChange(oldTrunk: string | undefined, newTrunk: string): Promise<boolean> {
  const prev = (oldTrunk ?? "").trim();
  if (!prev || prev === newTrunk.trim()) return true;
  warn(
    `${colors.bold(prev)} will no longer be protected — ` +
      `${colors.cyan("flo commit")}/${colors.cyan("flo modify")} won't stop you ` +
      `from committing directly onto it. ${colors.bold(newTrunk)} is the new trunk.`,
  );
  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    {
      type: "confirm",
      name: "ok",
      message: `Switch trunk from ${prev} to ${newTrunk}?`,
      default: false,
    },
  ]);
  return ok;
}

export function prefixFromTemplate(template: string | undefined, user: string): string {
  if (!template || !user) return "";
  return template.includes("{user}") ? user : "";
}

function configRow(label: string, value: string): string {
  return `${label.padEnd(20)}${value}`;
}

function summarize(cfg: FloConfig): void {
  const prefix = prefixFromTemplate(cfg.branch?.template, cfg.branch?.user ?? "");
  const prMode = cfg.pr?.mode ?? DEFAULT_PR_MODE;
  const openBrowser = cfg.pr?.openBrowser ?? DEFAULT_OPEN_BROWSER;
  ui.sticker()
    .heading(colors.dim("Current flo config"))
    .add(configRow("Trunk branch:", cfg.trunk ? colors.cyan(cfg.trunk) : colors.dim("(auto)")))
    .add(configRow("Branch prefix:", prefix ? colors.cyan(prefix) : colors.dim("(none)")))
    .add(configRow("PR submission mode:", colors.cyan(prMode)))
    .add(configRow("Open in browser:", colors.cyan(openBrowser)))
    .render();
}

async function askExistingAction(): Promise<ExistingAction> {
  const { action } = await inquirer.prompt<{ action: ExistingAction }>([
    {
      type: "select",
      name: "action",
      message: "What would you like to do?",
      default: "update",
      choices: [
        { name: "Update specific settings", value: "update" },
        { name: "Overwrite from scratch", value: "overwrite" },
        { name: "Cancel", value: "cancel" },
      ],
    },
  ]);
  return action;
}

async function askFullSetup(
  detectedTrunk: string,
  defaults: { user: string; prMode: PrMode; usePrefix: boolean },
): Promise<FullAnswers> {
  const questions: DistinctQuestion<FullAnswers>[] = [
    {
      type: "input",
      name: "trunk",
      message: "Trunk branch",
      default: detectedTrunk,
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
    {
      type: "confirm",
      name: "usePrefix",
      message: "Prefix your branches with a personal tag?",
      default: defaults.usePrefix,
    },
    {
      type: "input",
      name: "prefix",
      message: "Prefix",
      default: defaults.user || undefined,
      when: (a) => a.usePrefix === true,
      validate: validatePrefix,
    },
    {
      type: "select",
      name: "prMode",
      message: "How should `flo submit` open PRs?",
      default: defaults.prMode,
      choices: [
        { name: "Draft — safer default, ready for review later", value: "draft" },
        { name: "Open — immediately ready for review", value: "open" },
      ],
    },
  ];
  return inquirer.prompt<FullAnswers>(questions);
}

async function askWhichFields(): Promise<UpdateField[]> {
  const { fields } = await inquirer.prompt<{ fields: UpdateField[] }>([
    {
      type: "checkbox",
      name: "fields",
      message: "Which settings would you like to update?",
      choices: [
        { name: "Trunk branch", value: "trunk" },
        { name: "Branch prefix (personal tag in branch names)", value: "prefix" },
        { name: "PR submission mode (draft | open)", value: "prMode" },
        { name: "Open PR in browser after submit (always | new | never)", value: "openBrowser" },
      ],
      validate: (v) => (Array.isArray(v) && v.length > 0) || "Pick at least one",
    },
  ]);
  return fields;
}

export function fieldsForSection(section: SetupSection): UpdateField[] {
  switch (section) {
    case "branchNaming":
      return ["prefix"];
    case "submitSettings":
      // Submit settings opens its own sub-menu; the top-level loop detects
      // the empty list and delegates to `submitSettingsSection`.
      return [];
    case "repoSettings":
      return ["trunk"];
    case "back":
    case "exit":
      return [];
  }
}

async function askSetupSection(): Promise<SetupSection> {
  const { section } = await inquirer.prompt<{ section: SetupSection }>([
    {
      type: "select",
      name: "section",
      message: "flo setup",
      choices: [
        {
          name: "Branch naming",
          value: "branchNaming",
          description: "Personal tag prepended to new branch names.",
        },
        {
          name: "Submit & PR settings",
          value: "submitSettings",
          description: "Submission mode, PR description template, and post-submit browser behaviour.",
        },
        {
          name: "Repo settings",
          value: "repoSettings",
          description: "Trunk branch this repo builds off of.",
        },
        { name: "Back", value: "back" },
        { name: "Exit", value: "exit" },
      ],
    },
  ]);
  return section;
}

async function askConfigureAnotherSection(): Promise<boolean> {
  const { another } = await inquirer.prompt<{ another: boolean }>([
    {
      type: "confirm",
      name: "another",
      message: "Configure another setup section?",
      default: true,
    },
  ]);
  return another;
}

export function buildConfig(a: FullAnswers): FloConfig {
  const trunk = a.trunk.trim();
  const usePrefix = a.usePrefix === true;
  const prefix = (a.prefix ?? "").trim();
  const template = usePrefix ? PREFIX_TEMPLATE : PLAIN_TEMPLATE;
  return {
    trunk,
    branch: {
      template,
      ...(usePrefix && prefix ? { user: prefix } : {}),
    },
    pr: { mode: a.prMode },
  };
}

async function updateFields(existing: FloConfig, fields: UpdateField[]): Promise<FloConfig> {
  const next: FloConfig = {
    ...existing,
    branch: { ...(existing.branch ?? {}) },
    pr: { ...(existing.pr ?? {}) },
  };

  if (fields.includes("trunk")) {
    const { trunk } = await inquirer.prompt<{ trunk: string }>([
      {
        type: "input",
        name: "trunk",
        message: "Trunk branch",
        default: existing.trunk,
        validate: (v: string) => v.trim().length > 0 || "Required",
      },
    ]);
    const trimmed = trunk.trim();
    if (await confirmTrunkChange(existing.trunk, trimmed)) {
      next.trunk = trimmed;
    } else {
      info(`Keeping trunk as ${colors.bold(existing.trunk ?? "")}.`);
    }
  }

  if (fields.includes("prefix")) {
    const currentPrefix = prefixFromTemplate(existing.branch?.template, existing.branch?.user ?? "");
    const { usePrefix } = await inquirer.prompt<{ usePrefix: boolean }>([
      {
        type: "confirm",
        name: "usePrefix",
        message: "Prefix your branches with a personal tag?",
        default: Boolean(currentPrefix),
      },
    ]);
    if (usePrefix) {
      const { prefix } = await inquirer.prompt<{ prefix: string }>([
        {
          type: "input",
          name: "prefix",
          message: "Prefix",
          default: currentPrefix || existing.branch?.user || undefined,
          validate: validatePrefix,
        },
      ]);
      next.branch = { template: PREFIX_TEMPLATE, user: prefix.trim() };
    } else {
      next.branch = { template: PLAIN_TEMPLATE };
    }
  }

  if (fields.includes("prMode")) {
    const { prMode } = await inquirer.prompt<{ prMode: PrMode }>([
      {
        type: "select",
        name: "prMode",
        message: "How should `flo submit` open PRs?",
        default: existing.pr?.mode ?? DEFAULT_PR_MODE,
        choices: [
          { name: "Draft — safer default, ready for review later", value: "draft" },
          { name: "Open — immediately ready for review", value: "open" },
        ],
      },
    ]);
    next.pr = { ...next.pr, mode: prMode };
  }

  if (fields.includes("openBrowser")) {
    const { openBrowser } = await inquirer.prompt<{ openBrowser: OpenBrowser }>([
      {
        type: "select",
        name: "openBrowser",
        message: "Open the PR in your browser after `flo submit`?",
        default: existing.pr?.openBrowser ?? DEFAULT_OPEN_BROWSER,
        choices: [
          { name: "Always open", value: "always" },
          { name: "Only when a new PR is created", value: "new" },
          { name: "Don't open", value: "never" },
        ],
      },
    ]);
    next.pr = { ...next.pr, openBrowser };
  }

  return next;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

async function askSubmitAction(): Promise<SubmitAction> {
  const { action } = await inquirer.prompt<{ action: SubmitAction }>([
    {
      type: "select",
      name: "action",
      message: "Submit settings",
      choices: [
        {
          name: "PR submission mode (draft | open)",
          value: "submitBehaviour",
          description: "Whether `flo submit` opens PRs as drafts or ready for review.",
        },
        {
          name: "PR description template",
          value: "prDescription",
          description: "Markdown body flo submit fills new PRs with.",
        },
        {
          name: "Open PR in browser after submit",
          value: "browserBehaviour",
          description: "Pop the PR URL automatically — always, only for new PRs, or never.",
        },
        { name: "Back", value: "back" },
        { name: "Exit", value: "exit" },
      ],
    },
  ]);
  return action;
}

async function askPrBodyAction(hasTemplate: boolean): Promise<PrBodyAction> {
  const { action } = await inquirer.prompt<{ action: PrBodyAction }>([
    {
      type: "select",
      name: "action",
      message: "PR description template",
      choices: [
        {
          name: "Edit existing template",
          value: "override",
          description: hasTemplate
            ? "Open the current template in your editor."
            : "No template yet — seed a starter and open it.",
        },
        {
          name: "Start from scratch",
          value: "new",
          description: "Reset to the starter template, then open it.",
        },
        { name: "Back", value: "back" },
        { name: "Exit", value: "exit" },
      ],
    },
  ]);
  return action;
}

async function updatePrTemplate(): Promise<"back" | "exit" | "done"> {
  const path = prTemplatePath(await resolveSlot());
  const exists = await pathExists(path);
  const action = await askPrBodyAction(exists);
  if (action === "back") return "back";
  if (action === "exit") return "exit";
  await mkdir(dirname(path), { recursive: true });
  if (action === "new" || !exists) {
    await writeFile(path, DEFAULT_PR_TEMPLATE, "utf8");
  }
  await openInEditor(path);
  info(`PR template: ${colors.bold(displayPath(path))}`);
  return "done";
}

async function submitSettingsSection(working: FloConfig): Promise<SectionResult> {
  while (true) {
    const action = await askSubmitAction();
    if (action === "back") return { cfg: working, exit: false };
    if (action === "exit") return { cfg: working, exit: true };
    if (action === "submitBehaviour") {
      const next = await updateFields(working, ["prMode"]);
      await writeAndReport(next);
      working = next;
    } else if (action === "browserBehaviour") {
      const next = await updateFields(working, ["openBrowser"]);
      await writeAndReport(next);
      working = next;
    } else if (action === "prDescription") {
      const result = await updatePrTemplate();
      if (result === "exit") return { cfg: working, exit: true };
    }
  }
}

async function writeAndReport(cfg: FloConfig): Promise<void> {
  let path = "";
  await ui
    .tasks()
    .add("Writing config", async () => {
      path = await saveConfig(cfg);
      return displayPath(path);
    })
    .run();

  const slot = await resolveSlot();
  const template = cfg.branch?.template ?? PLAIN_TEMPLATE;
  const user = cfg.branch?.user ?? "";
  const prefix = prefixFromTemplate(template, user);
  const preview = renderBranchName(
    {
      trunk: cfg.trunk ?? "main",
      template,
      user,
      prMode: cfg.pr?.mode ?? DEFAULT_PR_MODE,
      openBrowser: cfg.pr?.openBrowser ?? DEFAULT_OPEN_BROWSER,
      hasConfigFile: true,
      configPath: path,
    },
    SAMPLE_SLUG,
  );

  if (!slot.usedOrigin) {
    info(
      `No git ${colors.bold("origin")} found — config stored under ${colors.bold(`_local/${slot.projectId.slice("_local/".length)}`)}.`,
    );
  }

  const prMode = cfg.pr?.mode ?? DEFAULT_PR_MODE;
  const openBrowser = cfg.pr?.openBrowser ?? DEFAULT_OPEN_BROWSER;
  ui.sticker()
    .heading(colors.green().bold("flo config saved"))
    .add(configRow("Trunk branch:", colors.cyan(cfg.trunk ?? "")))
    .add(configRow("Branch prefix:", prefix ? colors.cyan(prefix) : colors.dim("(none)")))
    .add(configRow("PR submission mode:", colors.cyan(prMode)))
    .add(configRow("Open in browser:", colors.cyan(openBrowser)))
    .add("")
    .add(configRow("Branch preview:", `${colors.dim(SAMPLE_SLUG)} → ${colors.bold(preview)}`))
    .render();
}

export async function setupCommand(opts: SetupOpts = {}): Promise<void> {
  const existing = await loadConfig();

  if (existing && opts.update) {
    summarize(existing);
    const fields = await askWhichFields();
    const next = await updateFields(existing, fields);
    await writeAndReport(next);
    return;
  } else if (opts.update) {
    info("No existing flo config — running a fresh setup instead.");
  }

  let detectedTrunk = "";
  await ui
    .tasks()
    .add("Detecting repo context", async () => {
      detectedTrunk = await detectTrunk();
      return `trunk ${detectedTrunk}`;
    })
    .run();

  const resolved = await resolveConfig();
  const defaultConfig = buildConfig({
    trunk: existing?.trunk ?? detectedTrunk,
    usePrefix: Boolean(existing?.branch?.user ?? resolved.user),
    prefix: existing?.branch?.user ?? resolved.user,
    prMode: existing?.pr?.mode ?? resolved.prMode,
  });

  if (existing) {
    summarize(existing);
    const action = await askExistingAction();
    if (action === "cancel") return;
    if (action === "overwrite") {
      const answers = await askFullSetup(detectedTrunk, {
        user: resolved.user,
        prMode: resolved.prMode,
        usePrefix: Boolean(resolved.user),
      });
      if (!(await confirmTrunkChange(existing.trunk, answers.trunk))) {
        answers.trunk = existing.trunk ?? answers.trunk;
        info(`Keeping trunk as ${colors.bold(answers.trunk)}.`);
      }
      await writeAndReport(buildConfig(answers));
      return;
    }
  }

  let working = existing ?? defaultConfig;
  while (true) {
    const section = await askSetupSection();
    if (section === "exit" || section === "back") return;

    if (section === "submitSettings") {
      const result = await submitSettingsSection(working);
      working = result.cfg;
      if (result.exit) return;
    } else {
      const fields = fieldsForSection(section);
      if (fields.length === 0) continue;
      working = await updateFields(working, fields);
      await writeAndReport(working);
    }

    if (!(await askConfigureAnotherSection())) return;
  }
}
