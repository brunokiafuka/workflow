import { homedir } from "node:os";
import { basename, join } from "node:path";
import { git } from "./git.js";

export type SlotInfo = {
  /** Absolute path to the flo user base dir (e.g. ~/.flo). */
  baseDir: string;
  /** Absolute path to this project's slot directory. */
  projectDir: string;
  /** Absolute path to the slot's config.yml. */
  configPath: string;
  /** Slot id: "host/owner/repo" for origin-derived, "_local/<label>" otherwise. */
  projectId: string;
  /** True when the slot was derived from a git `origin` URL. */
  usedOrigin: boolean;
};

/**
 * Base directory for flo's user-level config. Respects $XDG_CONFIG_HOME on
 * Linux when set; otherwise falls back to ~/.flo on every platform.
 */
export function userBaseDir(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === "linux") {
    const xdg = env.XDG_CONFIG_HOME?.trim();
    if (xdg) return join(xdg, "flo");
  }
  return join(homedir(), ".flo");
}

/**
 * Normalize a git remote URL into a `host/owner/repo` slot id. Recognizes:
 *   - SSH short form:  git@github.com:owner/repo(.git)?
 *   - URI form:        https://github.com/owner/repo(.git)?, ssh://git@…, git://…
 *
 * Returns null when the URL shape is not recognized or the path would escape
 * its slot (empty/./.. segments, unusual characters).
 */
export function normalizeOrigin(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const ssh = trimmed.match(/^[^\s@]+@([^:\s]+):(.+)$/);
  if (ssh) return joinHostPath(ssh[1], ssh[2]);

  const uri = trimmed.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?([^/\s]+)\/(.+)$/i);
  if (uri) return joinHostPath(uri[1], uri[2]);

  return null;
}

function joinHostPath(host: string, path: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  const p = path.replace(/\.git$/i, "").replace(/\/+$/g, "");
  if (!h || !p) return null;
  if (!/^[\w.\-/]+$/.test(p)) return null;
  if (p.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  return `${h}/${p}`;
}

/** Resolve the user-level slot for the git repo containing CWD. */
export async function resolveSlot(): Promise<SlotInfo> {
  const baseDir = userBaseDir();
  const top = (await git(["rev-parse", "--show-toplevel"])).stdout.trim();

  let projectId: string | null = null;
  let usedOrigin = false;

  const origin = await git(["remote", "get-url", "origin"], { allowFail: true });
  if (origin.exitCode === 0) {
    const normalized = normalizeOrigin(origin.stdout.trim());
    if (normalized) {
      projectId = normalized;
      usedOrigin = true;
    }
  }

  if (!projectId) {
    const label = basename(top).replace(/[^a-zA-Z0-9._-]/g, "_") || "project";
    projectId = `_local/${label}`;
  }

  const projectDir = join(baseDir, "projects", projectId);
  const configPath = join(projectDir, "config.yml");
  return { baseDir, projectDir, configPath, projectId, usedOrigin };
}
