import { readFile } from "node:fs/promises";
import { join } from "node:path";

import YAML from "yaml";

import { git } from "./git.js";

export type Recipe = {
  name: string;
  description?: string;
  command: string;
  aliases: string[];
  /** Inherit stdio so the recipe can prompt the user directly. */
  interactive: boolean;
};

export type InitStep = {
  id: string;
  name: string;
  run: string;
};

export type RecipesFile = {
  project?: string;
  commands: Record<string, Recipe>;
  init: InitStep[];
  path: string;
};

const RECIPES_FILENAME = "flo.yml";

async function repoRoot(): Promise<string> {
  return (await git(["rev-parse", "--show-toplevel"])).stdout.trim();
}

export async function loadRecipes(): Promise<RecipesFile | null> {
  const path = join(await repoRoot(), RECIPES_FILENAME);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  return parseRecipes(raw, path);
}

export function parseRecipes(raw: string, path: string): RecipesFile {
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (e) {
    throw new Error(`Couldn't parse ${path}: ${(e as Error).message}`, {
      cause: e,
    });
  }
  const doc = (parsed ?? {}) as {
    project?: unknown;
    commands?: unknown;
    init?: unknown;
  };
  const rawCommands = doc.commands && typeof doc.commands === "object" ? (doc.commands as Record<string, unknown>) : {};

  const commands: Record<string, Recipe> = {};
  const aliasOwner = new Map<string, string>();

  for (const [name, val] of Object.entries(rawCommands)) {
    if (!val || typeof val !== "object") {
      throw new Error(`${path}: commands.${name} must be an object`);
    }
    const entry = val as {
      description?: unknown;
      command?: unknown;
      aliases?: unknown;
      interactive?: unknown;
    };
    if (typeof entry.command !== "string" || !entry.command.trim()) {
      throw new Error(`${path}: commands.${name}.command is required (string)`);
    }
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((a): a is string => typeof a === "string" && a.length > 0)
      : [];
    if (entry.interactive !== undefined && typeof entry.interactive !== "boolean") {
      throw new Error(`${path}: commands.${name}.interactive must be a boolean`);
    }
    for (const alias of aliases) {
      const owner = aliasOwner.get(alias);
      if (owner && owner !== name) {
        throw new Error(`${path}: alias "${alias}" is defined on both "${owner}" and "${name}"`);
      }
      if (rawCommands[alias] && alias !== name) {
        throw new Error(`${path}: alias "${alias}" on "${name}" shadows another command`);
      }
      aliasOwner.set(alias, name);
    }
    commands[name] = {
      name,
      command: entry.command.trim(),
      description: typeof entry.description === "string" ? entry.description.trim() || undefined : undefined,
      aliases,
      interactive: entry.interactive === true,
    };
  }

  const init = parseInit(doc.init, path);

  return {
    project: typeof doc.project === "string" ? doc.project : undefined,
    commands,
    init,
    path,
  };
}

function parseInit(raw: unknown, path: string): InitStep[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new TypeError(`${path}: init must be a list of steps`);
  }
  const steps: InitStep[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${path}: init[${i}] must be a map with a step id as key`);
    }
    const keys = Object.keys(item as Record<string, unknown>);
    if (keys.length !== 1) {
      throw new Error(`${path}: init[${i}] must have exactly one step id as key (got ${keys.length})`);
    }
    const id = keys[0];
    if (seen.has(id)) {
      throw new Error(`${path}: init step "${id}" is defined twice`);
    }
    seen.add(id);
    const entry = (item as Record<string, unknown>)[id];
    if (!entry || typeof entry !== "object") {
      throw new Error(`${path}: init step "${id}" must be an object`);
    }
    const e = entry as { name?: unknown; run?: unknown };
    if (typeof e.run !== "string" || !e.run.trim()) {
      throw new Error(`${path}: init step "${id}".run is required (string)`);
    }
    const displayName = typeof e.name === "string" && e.name.trim() ? e.name.trim() : id;
    steps.push({ id, name: displayName, run: e.run.trim() });
  }
  return steps;
}

export function resolveRecipe(file: RecipesFile, nameOrAlias: string): Recipe | null {
  const direct = file.commands[nameOrAlias];
  if (direct) return direct;
  for (const r of Object.values(file.commands)) {
    if (r.aliases.includes(nameOrAlias)) return r;
  }
  return null;
}

export function listRecipeNames(file: RecipesFile): string[] {
  return Object.keys(file.commands).sort();
}
