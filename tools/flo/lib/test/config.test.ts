import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { describe, test } from "node:test";

import { displayPath, renderBranchName, type ResolvedConfig } from "../config.js";

const cfg = (template: string, user = "bk"): ResolvedConfig => ({
  trunk: "main",
  template,
  user,
  hasConfigFile: true,
  configPath: "",
});

describe("renderBranchName", () => {
  test("substitutes {user} and {slug}", () => {
    assert.equal(renderBranchName(cfg("{user}/{slug}"), "add_feature"), "bk/add_feature");
  });

  test("slug-only template leaves user out", () => {
    assert.equal(renderBranchName(cfg("{slug}"), "fix_thing"), "fix_thing");
  });

  test("collapses empty slash segments when user is empty", () => {
    assert.equal(renderBranchName(cfg("{user}/{slug}", ""), "thing"), "thing");
  });

  test("collapses doubled underscores from empty tokens", () => {
    assert.equal(renderBranchName(cfg("{user}_{slug}", ""), "thing"), "thing");
  });

  test("strips leading/trailing separators", () => {
    assert.equal(renderBranchName(cfg("/{slug}/", ""), "thing"), "thing");
  });

  test("falls back to slug when template renders empty", () => {
    // Template has no tokens and no literals → empty after collapsing.
    assert.equal(renderBranchName(cfg(""), "keep_this"), "keep_this");
  });

  test("preserves custom literal separators", () => {
    assert.equal(renderBranchName(cfg("{user}-{slug}"), "thing"), "bk-thing");
  });

  test("handles nested group-style prefix", () => {
    assert.equal(renderBranchName(cfg("team/{user}/{slug}"), "thing"), "team/bk/thing");
  });

  test("escapes nothing — slug is passed through as-is", () => {
    // renderBranchName doesn't slugify; that's the caller's job.
    assert.equal(renderBranchName(cfg("{slug}"), "Already Slugged"), "Already Slugged");
  });
});

describe("displayPath", () => {
  test("collapses $HOME to ~", () => {
    const home = homedir();
    assert.equal(displayPath(`${home}/.flo/projects/foo`), "~/.flo/projects/foo");
  });

  test("leaves non-home paths untouched", () => {
    assert.equal(displayPath("/etc/hosts"), "/etc/hosts");
    assert.equal(displayPath("/tmp/foo"), "/tmp/foo");
  });

  test("collapses bare $HOME exactly", () => {
    assert.equal(displayPath(homedir()), "~");
  });

  test("does not collapse a sibling dir with $HOME as prefix", () => {
    // If $HOME is /Users/bob, /Users/bobby should NOT become ~by.
    const home = homedir();
    const sibling = `${home}-sibling/foo`;
    assert.equal(displayPath(sibling), sibling);
  });
});
