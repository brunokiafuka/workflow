import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { git } from "./git.js";

const GITIGNORE = ".gitignore";
const LEGACY_FILE = ".flo.json";

export type FloConfig = {
  trunk?: string;
  branch?: {
    template?: string;
    user?: string;
  };
};

export type ResolvedConfig = {
  trunk: string | null; // null = fall back to auto-detect
  template: string;
  user: string;
  hasConfigFile: boolean;
  configPath: string;
};

export const CONFIG_DIR = ".flo";
export const CONFIG_FILENAME = "config.json";
/** Human-facing label for the config location. */
export const CONFIG_FILE = `${CONFIG_DIR}/${CONFIG_FILENAME}`;

/** Repo root = the directory containing .git. */
async function repoRoot(): Promise<string> {
  const r = await git(["rev-parse", "--show-toplevel"]);
  return r.stdout.trim();
}

export async function configPath(): Promise<string> {
  return join(await repoRoot(), CONFIG_DIR, CONFIG_FILENAME);
}

async function legacyPath(): Promise<string> {
  return join(await repoRoot(), LEGACY_FILE);
}

export async function loadConfig(): Promise<FloConfig | null> {
  const path = await configPath();
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as FloConfig;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Couldn't read ${CONFIG_FILE}: ${(e as Error).message}`);
    }
  }
  // Backward compatibility: fall back to the old flat file.
  try {
    const raw = await readFile(await legacyPath(), "utf8");
    return JSON.parse(raw) as FloConfig;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Couldn't read ${LEGACY_FILE}: ${(e as Error).message}`);
  }
}

export async function saveConfig(cfg: FloConfig): Promise<string> {
  const root = await repoRoot();
  await mkdir(join(root, CONFIG_DIR), { recursive: true });
  const path = await configPath();
  await writeFile(path, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  // Best-effort: remove the old flat-file so it doesn't shadow the new location.
  try {
    await unlink(await legacyPath());
  } catch {
    /* ignore — usually just ENOENT */
  }
  return path;
}

/**
 * Make sure the `.flo/` folder is in the repo's `.gitignore`. Returns true if
 * we added the entry, false if it was already present. Silently skips on errors.
 */
export async function ensureGitignored(): Promise<boolean> {
  const root = await repoRoot();
  const gi = join(root, GITIGNORE);
  try {
    let body = "";
    try {
      body = await readFile(gi, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    // Accept any variant of the directory ignore pattern.
    const lines = body.split(/\r?\n/).map((l) => l.trim());
    const variants = new Set([CONFIG_DIR, `${CONFIG_DIR}/`, `/${CONFIG_DIR}`, `/${CONFIG_DIR}/`]);
    if (lines.some((l) => variants.has(l))) return false;

    const needsNewline = body.length > 0 && !body.endsWith("\n");
    const addition = `${needsNewline ? "\n" : ""}# flo — per-dev config\n${CONFIG_DIR}/\n`;
    await writeFile(gi, body + addition, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function gitUserShort(): Promise<string> {
  const r = await git(["config", "--get", "user.email"], { allowFail: true });
  const email = r.stdout.trim();
  if (!email) return "";
  return email.split("@")[0]?.replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const cfg = await loadConfig();
  const path = await configPath();
  const fallbackUser = cfg?.branch?.user ?? (await gitUserShort());
  return {
    trunk: cfg?.trunk ?? null,
    template: cfg?.branch?.template ?? "{slug}",
    user: fallbackUser,
    hasConfigFile: cfg !== null,
    configPath: path,
  };
}

/** Apply the branch template to a slug. Strips empty segments. */
export function renderBranchName(cfg: ResolvedConfig, slug: string): string {
  const rendered = cfg.template
    .replace(/\{user\}/g, cfg.user)
    .replace(/\{slug\}/g, slug)
    // tidy: collapse empty "//", "__", and leading/trailing separators
    .replace(/\/+/g, "/")
    .replace(/_+/g, "_")
    .replace(/^[_\-/.]+|[_\-/.]+$/g, "");
  return rendered || slug;
}
