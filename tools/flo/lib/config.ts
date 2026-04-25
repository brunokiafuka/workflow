import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import YAML from "yaml";

import { git } from "./git.js";
import { resolveSlot, type SlotInfo } from "./slot.js";

const LEGACY_DIR = ".flo";
const LEGACY_JSON_FILENAME = "config.json";
const LEGACY_FLAT_FILE = ".flo.json";

export type PrMode = "draft" | "open";
export type OpenBrowser = "always" | "new" | "never";

export type FloConfig = {
  trunk?: string;
  branch?: {
    template?: string;
    user?: string;
  };
  pr?: {
    mode?: PrMode;
    openBrowser?: OpenBrowser;
  };
};

export type ResolvedConfig = {
  trunk: string | null; // null = fall back to auto-detect
  template: string;
  user: string;
  prMode: PrMode;
  openBrowser: OpenBrowser;
  hasConfigFile: boolean;
  configPath: string;
};

export const DEFAULT_PR_MODE: PrMode = "draft";
export const DEFAULT_OPEN_BROWSER: OpenBrowser = "always";

/** Display a filesystem path with $HOME collapsed to `~` for readability. */
export function displayPath(abs: string): string {
  const home = homedir();
  if (home && (abs === home || abs.startsWith(`${home}/`))) {
    return `~${abs.slice(home.length)}`;
  }
  return abs;
}

/** Where *new* config writes will land, formatted for display. */
export async function configLabel(): Promise<string> {
  const slot = await resolveSlot();
  return displayPath(slot.configPath);
}

async function repoRoot(): Promise<string> {
  return (await git(["rev-parse", "--show-toplevel"])).stdout.trim();
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function loadSlotConfig(slot: SlotInfo): Promise<FloConfig | null> {
  const raw = await readIfExists(slot.configPath);
  if (raw === null) return null;
  try {
    const parsed = YAML.parse(raw);
    return (parsed ?? {}) as FloConfig;
  } catch (e) {
    throw new Error(`Couldn't parse ${displayPath(slot.configPath)}: ${(e as Error).message}`);
  }
}

type LegacyHit = { cfg: FloConfig; path: string };

async function loadLegacyConfig(): Promise<LegacyHit | null> {
  const root = await repoRoot();
  const candidates = [join(root, LEGACY_DIR, LEGACY_JSON_FILENAME), join(root, LEGACY_FLAT_FILE)];
  for (const path of candidates) {
    const raw = await readIfExists(path);
    if (raw === null) continue;
    try {
      return { cfg: JSON.parse(raw) as FloConfig, path };
    } catch (e) {
      throw new Error(`Couldn't parse ${displayPath(path)}: ${(e as Error).message}`);
    }
  }
  return null;
}

/**
 * Load config, preferring the user-level slot. Legacy `.flo/config.json`
 * and `.flo.json` remain readable as a fallback during the deprecation window.
 */
export async function loadConfig(): Promise<FloConfig | null> {
  const slot = await resolveSlot();
  const slotCfg = await loadSlotConfig(slot);
  if (slotCfg) return slotCfg;
  const legacy = await loadLegacyConfig();
  return legacy?.cfg ?? null;
}

/** Write config as YAML into the user-level slot. Returns the written path. */
export async function saveConfig(cfg: FloConfig): Promise<string> {
  const slot = await resolveSlot();
  await mkdir(slot.projectDir, { recursive: true });
  const body = YAML.stringify(cfg, { indent: 2 });
  await writeFile(slot.configPath, body, "utf8");
  // Best-effort: clean up the legacy flat file so it can't shadow new writes.
  // We deliberately leave `.flo/config.json` in place; a future --migrate
  // flow will handle that case with user confirmation.
  try {
    await unlink(join(await repoRoot(), LEGACY_FLAT_FILE));
  } catch {
    /* ENOENT expected */
  }
  return slot.configPath;
}

/**
 * Historical no-op. User-level slots live outside the repo, so nothing needs
 * to be added to `.gitignore`. Kept for call-site compatibility; returns false
 * to signal that no change was made.
 */
export async function ensureGitignored(): Promise<boolean> {
  return false;
}

async function gitUserShort(): Promise<string> {
  const r = await git(["config", "--get", "user.email"], { allowFail: true });
  const email = r.stdout.trim();
  if (!email) return "";
  return (
    email
      .split("@")[0]
      ?.replace(/[^a-z0-9]/gi, "")
      .toLowerCase() ?? ""
  );
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const slot = await resolveSlot();
  const slotCfg = await loadSlotConfig(slot);
  const legacy = slotCfg ? null : await loadLegacyConfig();
  const cfg = slotCfg ?? legacy?.cfg ?? null;
  const sourcePath = slotCfg ? slot.configPath : (legacy?.path ?? slot.configPath);
  const fallbackUser = cfg?.branch?.user ?? (await gitUserShort());
  return {
    trunk: cfg?.trunk ?? null,
    template: cfg?.branch?.template ?? "{slug}",
    user: fallbackUser,
    prMode: cfg?.pr?.mode ?? DEFAULT_PR_MODE,
    openBrowser: cfg?.pr?.openBrowser ?? DEFAULT_OPEN_BROWSER,
    hasConfigFile: cfg !== null,
    configPath: sourcePath,
  };
}

/** Apply the branch template to a slug. Strips empty segments. */
export function renderBranchName(cfg: ResolvedConfig, slug: string): string {
  const rendered = cfg.template
    .replace(/\{user\}/g, cfg.user)
    .replace(/\{slug\}/g, slug)
    .replace(/\/+/g, "/")
    .replace(/_+/g, "_")
    .replace(/^[_\-/.]+|[_\-/.]+$/g, "");
  return rendered || slug;
}
