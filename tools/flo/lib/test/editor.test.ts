import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { resolveEditorCommand } from "../editor.js";

describe("resolveEditorCommand", () => {
  test("respects $VISUAL over everything else", () => {
    assert.deepEqual(
      resolveEditorCommand({
        VISUAL: "nvim",
        EDITOR: "vi",
        TERM_PROGRAM: "vscode",
        CURSOR_TRACE_ID: "abc",
      }),
      ["nvim"],
    );
  });

  test("falls back to $EDITOR when $VISUAL is unset", () => {
    assert.deepEqual(resolveEditorCommand({ EDITOR: "nano" }), ["nano"]);
  });

  test("splits multi-word editor commands into argv", () => {
    assert.deepEqual(resolveEditorCommand({ EDITOR: "code --wait" }), ["code", "--wait"]);
  });

  test("prefers Cursor when CURSOR_TRACE_ID is present, even inside VS Code-hosted terminals", () => {
    assert.deepEqual(resolveEditorCommand({ TERM_PROGRAM: "vscode", CURSOR_TRACE_ID: "x" }), ["cursor", "--wait"]);
  });

  test("uses VS Code when TERM_PROGRAM=vscode and no explicit editor", () => {
    assert.deepEqual(resolveEditorCommand({ TERM_PROGRAM: "vscode" }), ["code", "--wait"]);
  });

  test("uses Zed when TERM_PROGRAM=zed", () => {
    assert.deepEqual(resolveEditorCommand({ TERM_PROGRAM: "zed" }), ["zed", "--wait"]);
  });

  test("falls back to vi when nothing is detected", () => {
    assert.deepEqual(resolveEditorCommand({}), ["vi"]);
  });

  test("treats whitespace-only $VISUAL/$EDITOR as unset", () => {
    assert.deepEqual(resolveEditorCommand({ VISUAL: "   ", EDITOR: "  " }), ["vi"]);
  });
});
