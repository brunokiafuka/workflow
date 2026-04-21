import { cliui } from "@poppinss/cliui";
import inquirer, { type DistinctQuestion } from "inquirer";
import {
  configLabel,
  displayPath,
  type FloConfig,
  loadConfig,
  renderBranchName,
  resolveConfig,
  saveConfig,
} from "../config.js";
import { resolveSlot } from "../slot.js";
import { detectTrunk } from "../trunk.js";
import { colors, info, success } from "../ui.js";

const ui = cliui();

const SAMPLE_SLUG = "add_new_feature";
const PREFIX_TEMPLATE = "{user}/{slug}";
const PLAIN_TEMPLATE = "{slug}";

type Answers = {
  trunk: string;
  usePrefix: boolean;
  prefix?: string;
};

/** Keep prefixes within the safe subset that produces well-formed git refs. */
function validatePrefix(v: string): true | string {
  const trimmed = v.trim();
  if (!trimmed) return "Required";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
    return "Use letters, digits, and ._- (starts with a letter or digit).";
  }
  return true;
}

export async function setupCommand(): Promise<void> {
  const existing = await loadConfig();
  if (existing) {
    info(`An existing flo config was found (${await configLabel()}).`);
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

  let detectedTrunk = "";
  let resolved: Awaited<ReturnType<typeof resolveConfig>>;
  await ui
    .tasks()
    .add("Detecting repo context", async () => {
      detectedTrunk = await detectTrunk();
      resolved = await resolveConfig();
      return `trunk ${detectedTrunk}`;
    })
    .run();

  const questions: DistinctQuestion<Answers>[] = [
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
      default: Boolean(resolved!.user),
    },
    {
      type: "input",
      name: "prefix",
      message: "Prefix",
      default: resolved!.user || undefined,
      when: (a) => a.usePrefix === true,
      validate: validatePrefix,
    },
  ];
  const answers = await inquirer.prompt<Answers>(questions);

  const trunk = answers.trunk.trim();
  const usePrefix = answers.usePrefix === true;
  const prefix = (answers.prefix ?? "").trim();
  const template = usePrefix ? PREFIX_TEMPLATE : PLAIN_TEMPLATE;

  const cfg: FloConfig = {
    trunk,
    branch: {
      template,
      ...(usePrefix && prefix ? { user: prefix } : {}),
    },
  };

  let path = "";
  await ui
    .tasks()
    .add("Writing config", async (task) => {
      path = await saveConfig(cfg);
      return displayPath(path);
    })
    .run();

  const slot = await resolveSlot();
  const preview = renderBranchName(
    { trunk, template, user: prefix, hasConfigFile: true, configPath: path },
    SAMPLE_SLUG,
  );

  success(`Wrote ${colors.bold(displayPath(path))}`);
  if (!slot.usedOrigin) {
    info(
      `No git ${colors.bold("origin")} found — config stored under ${colors.bold(`_local/${slot.projectId.slice("_local/".length)}`)}.`,
    );
  }
  console.log("");
  console.log(`  trunk:      ${colors.cyan(trunk)}`);
  console.log(`  prefix:     ${usePrefix ? colors.cyan(prefix) : colors.dim("(none)")}`);
  console.log("");
  console.log(`  Example:    ${colors.dim(SAMPLE_SLUG)} → ${colors.bold(preview)}`);
  console.log("");
}
