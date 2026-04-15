import inquirer from "inquirer";
import {
  CONFIG_FILE,
  ensureGitignored,
  type FloConfig,
  loadConfig,
  renderBranchName,
  resolveConfig,
  saveConfig,
} from "../config.js";
import { detectTrunk } from "../trunk.js";
import { c, info, success } from "../ui.js";

type Preset = { template: string };

const PRESETS: Preset[] = [
  { template: "{slug}" },
  { template: "{user}/{slug}" },
];

const SAMPLE_SLUG = "add_new_feature";
const CUSTOM_KEY = "__custom__";

type Answers = {
  overwrite?: boolean;
  trunk: string;
  presetKey: string;
  customTemplate?: string;
  user?: string;
};

/** Preview a preset using the user's detected prefix so labels show real names. */
function previewFor(preset: Preset, user: string): string {
  return renderBranchName(
    {
      trunk: "",
      template: preset.template,
      user,
      hasConfigFile: true,
      configPath: "",
    },
    SAMPLE_SLUG,
  );
}

export async function setupCommand(): Promise<void> {
  const existing = await loadConfig();
  if (existing) {
    info(`An existing ${CONFIG_FILE} was found.`);
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: "confirm",
        name: "overwrite",
        message: "Overwrite it?",
        default: false,
      },
    ]);
    if (!overwrite) return;
  }

  const detectedTrunk = await detectTrunk();
  const resolved = await resolveConfig();
  const sampleUser = resolved.user || "you";

  // Build preset choices with concrete previews in the labels.
  const maxPreview = Math.max(...PRESETS.map((p) => previewFor(p, sampleUser).length));
  const presetChoices = PRESETS.map((p, i) => {
    const preview = previewFor(p, sampleUser);
    const padded = preview.padEnd(maxPreview, " ");
    return {
      name: `${padded}   ${c.dim(p.template)}`,
      value: String(i),
      short: preview,
    };
  });
  presetChoices.push({
    name: `${"custom".padEnd(maxPreview, " ")}   ${c.dim("enter your own template")}`,
    value: CUSTOM_KEY,
    short: "custom",
  });

  const answers = await inquirer.prompt<Answers>([
    {
      type: "input",
      name: "trunk",
      message: "Trunk branch",
      default: detectedTrunk,
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
    {
      type: "list",
      name: "presetKey",
      message: `Branch naming (example for ${c.b("“add new feature”")})`,
      choices: presetChoices,
      default: "1",
      loop: false,
      pageSize: presetChoices.length,
    },
    {
      type: "input",
      name: "customTemplate",
      message: "Template (tokens: {user}, {slug})",
      default: "{user}/{slug}",
      when: (a) => a.presetKey === CUSTOM_KEY,
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
    {
      type: "input",
      name: "user",
      message: "User prefix",
      default: resolved.user,
      when: (a) => templateOf(a).includes("{user}"),
      validate: (v: string) => v.trim().length > 0 || "Template uses {user} — give me something",
    },
  ]);

  const template = templateOf(answers);
  const user = (answers.user ?? "").trim();
  const trunk = answers.trunk.trim();

  const cfg: FloConfig = {
    trunk,
    branch: {
      template,
      ...(user ? { user } : {}),
    },
  };

  const path = await saveConfig(cfg);
  const ignored = await ensureGitignored();

  const preview = renderBranchName(
    { trunk, template, user, hasConfigFile: true, configPath: path },
    SAMPLE_SLUG,
  );

  success(`Wrote ${c.b(CONFIG_FILE)}`);
  if (ignored) info(`Added ${c.b(".flo/")} to ${c.b(".gitignore")} (config stays personal).`);
  console.log("");
  console.log(`  trunk:      ${c.cyan(trunk)}`);
  console.log(`  template:   ${c.cyan(template)}`);
  if (user) console.log(`  user:       ${c.cyan(user)}`);
  console.log("");
  console.log(`  Example:    ${c.dim(SAMPLE_SLUG)} → ${c.b(preview)}`);
  console.log("");
}

/** Given the partial answers in flight, figure out which template is active. */
function templateOf(a: Partial<Answers>): string {
  if (a.presetKey === CUSTOM_KEY) return (a.customTemplate ?? "").trim();
  if (a.presetKey !== undefined) return PRESETS[Number(a.presetKey)]?.template ?? "{slug}";
  return "{slug}";
}
