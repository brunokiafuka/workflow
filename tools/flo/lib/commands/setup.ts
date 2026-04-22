import { cliui } from "@poppinss/cliui";
import inquirer, { type DistinctQuestion } from "inquirer";
import {
  configLabel,
  DEFAULT_PR_MODE,
  displayPath,
  type FloConfig,
  loadConfig,
  type PrMode,
  renderBranchName,
  resolveConfig,
  saveConfig,
} from "../config.js";
import { resolveSlot } from "../slot.js";
import { detectTrunk } from "../trunk.js";
import { colors, info, success, warn } from "../ui.js";

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
type UpdateField = "trunk" | "prefix" | "prMode";

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
export async function confirmTrunkChange(
  oldTrunk: string | undefined,
  newTrunk: string,
): Promise<boolean> {
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

function summarize(cfg: FloConfig): void {
  const prefix = prefixFromTemplate(cfg.branch?.template, cfg.branch?.user ?? "");
  const prMode = cfg.pr?.mode ?? DEFAULT_PR_MODE;
  console.log("");
  console.log(`  trunk:      ${cfg.trunk ? colors.cyan(cfg.trunk) : colors.dim("(auto)")}`);
  console.log(`  prefix:     ${prefix ? colors.cyan(prefix) : colors.dim("(none)")}`);
  console.log(`  pr mode:    ${colors.cyan(prMode)}`);
  console.log("");
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
        { name: "Branch prefix", value: "prefix" },
        { name: "PR submission mode (draft | open)", value: "prMode" },
      ],
      validate: (v) => (Array.isArray(v) && v.length > 0) || "Pick at least one",
    },
  ]);
  return fields;
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

async function updateFields(
  existing: FloConfig,
  fields: UpdateField[],
): Promise<FloConfig> {
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
    const currentPrefix = prefixFromTemplate(
      existing.branch?.template,
      existing.branch?.user ?? "",
    );
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
    next.pr = { mode: prMode };
  }

  return next;
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
      hasConfigFile: true,
      configPath: path,
    },
    SAMPLE_SLUG,
  );

  success(`Wrote ${colors.bold(displayPath(path))}`);
  if (!slot.usedOrigin) {
    info(
      `No git ${colors.bold("origin")} found — config stored under ${colors.bold(`_local/${slot.projectId.slice("_local/".length)}`)}.`,
    );
  }
  console.log("");
  console.log(`  trunk:      ${colors.cyan(cfg.trunk ?? "")}`);
  console.log(`  prefix:     ${prefix ? colors.cyan(prefix) : colors.dim("(none)")}`);
  console.log(`  pr mode:    ${colors.cyan(cfg.pr?.mode ?? DEFAULT_PR_MODE)}`);
  console.log("");
  console.log(`  Example:    ${colors.dim(SAMPLE_SLUG)} → ${colors.bold(preview)}`);
  console.log("");
}

export async function setupCommand(opts: SetupOpts = {}): Promise<void> {
  const existing = await loadConfig();

  if (existing) {
    info(`An existing flo config was found (${await configLabel()}).`);
    summarize(existing);

    const action: ExistingAction = opts.update ? "update" : await askExistingAction();
    if (action === "cancel") return;

    if (action === "update") {
      const fields = await askWhichFields();
      const next = await updateFields(existing, fields);
      await writeAndReport(next);
      return;
    }
    // action === "overwrite" falls through to fresh setup
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
  const answers = await askFullSetup(detectedTrunk, {
    user: resolved.user,
    prMode: resolved.prMode,
    usePrefix: Boolean(resolved.user),
  });

  if (!(await confirmTrunkChange(existing?.trunk, answers.trunk))) {
    answers.trunk = existing?.trunk ?? answers.trunk;
    info(`Keeping trunk as ${colors.bold(answers.trunk)}.`);
  }
  await writeAndReport(buildConfig(answers));
}
