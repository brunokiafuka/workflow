import { execa } from "execa";

/**
 * Resolve the editor command to use, as an argv list.
 *
 * Precedence:
 *   1. `$VISUAL` / `$EDITOR` — explicit user preference always wins.
 *   2. The GUI IDE hosting the parent terminal, detected from env:
 *      Cursor (`$CURSOR_TRACE_ID`), VS Code (`$TERM_PROGRAM=vscode`),
 *      Zed (`$TERM_PROGRAM=zed`). Invoked with `--wait` so the call blocks
 *      until the tab is closed — otherwise flo would race the user's edits.
 *   3. `vi` as last resort.
 */
export function resolveEditorCommand(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const explicit = (env.VISUAL || env.EDITOR || "").trim();
  if (explicit) return explicit.split(/\s+/);

  if (env.CURSOR_TRACE_ID) return ["cursor", "--wait"];
  const term = env.TERM_PROGRAM?.toLowerCase();
  if (term === "vscode") return ["code", "--wait"];
  if (term === "zed") return ["zed", "--wait"];

  return ["vi"];
}

/**
 * Open `filePath` in the user's preferred editor, attached to the TTY.
 * Supports editors with simple flag arguments (e.g. `code --wait`) by
 * splitting on whitespace.
 */
export async function openInEditor(filePath: string): Promise<void> {
  const [cmd, ...args] = resolveEditorCommand();
  if (!cmd) throw new Error("No editor available (set $VISUAL or $EDITOR).");
  await execa(cmd, [...args, filePath], { stdio: "inherit" });
}
