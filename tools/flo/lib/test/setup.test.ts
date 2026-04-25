import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  buildConfig,
  confirmTrunkChange,
  fieldsForSection,
  prefixFromTemplate,
  validatePrefix,
} from "../commands/setup.js";
import { DEFAULT_PR_MODE } from "../config.js";

describe("validatePrefix", () => {
  test("rejects empty and whitespace-only input", () => {
    assert.equal(validatePrefix(""), "Required");
    assert.equal(validatePrefix("   "), "Required");
  });

  test("accepts letters, digits, and ._- (not as leading char)", () => {
    assert.equal(validatePrefix("bk"), true);
    assert.equal(validatePrefix("bruno-k"), true);
    assert.equal(validatePrefix("team_1"), true);
    assert.equal(validatePrefix("a.b"), true);
    assert.equal(validatePrefix("123"), true);
  });

  test("rejects disallowed characters", () => {
    assert.notEqual(validatePrefix("bk!"), true);
    assert.notEqual(validatePrefix("has space"), true);
    assert.notEqual(validatePrefix("bk/sub"), true);
  });

  test("rejects leading separator", () => {
    assert.notEqual(validatePrefix("-bk"), true);
    assert.notEqual(validatePrefix(".bk"), true);
    assert.notEqual(validatePrefix("_bk"), true);
  });
});

describe("prefixFromTemplate", () => {
  test("returns the user when the template includes {user}", () => {
    assert.equal(prefixFromTemplate("{user}/{slug}", "bk"), "bk");
    assert.equal(prefixFromTemplate("team/{user}/{slug}", "bk"), "bk");
  });

  test("returns empty when the template omits {user}", () => {
    assert.equal(prefixFromTemplate("{slug}", "bk"), "");
  });

  test("returns empty when user is empty", () => {
    assert.equal(prefixFromTemplate("{user}/{slug}", ""), "");
  });

  test("tolerates undefined template", () => {
    assert.equal(prefixFromTemplate(undefined, "bk"), "");
  });
});

describe("buildConfig", () => {
  test("usePrefix=true builds a user-prefixed template", () => {
    const cfg = buildConfig({
      trunk: "main",
      usePrefix: true,
      prefix: "bk",
      prMode: "draft",
    });
    assert.deepEqual(cfg, {
      trunk: "main",
      branch: { template: "{user}/{slug}", user: "bk" },
      pr: { mode: "draft" },
    });
  });

  test("usePrefix=false drops the user and writes slug-only template", () => {
    const cfg = buildConfig({
      trunk: "main",
      usePrefix: false,
      prMode: "open",
    });
    assert.deepEqual(cfg, {
      trunk: "main",
      branch: { template: "{slug}" },
      pr: { mode: "open" },
    });
  });

  test("usePrefix=true with empty prefix omits the user field", () => {
    const cfg = buildConfig({
      trunk: "main",
      usePrefix: true,
      prefix: "",
      prMode: "draft",
    });
    assert.equal(cfg.branch?.template, "{user}/{slug}");
    assert.equal(cfg.branch?.user, undefined);
  });

  test("trims surrounding whitespace on trunk and prefix", () => {
    const cfg = buildConfig({
      trunk: "  main  ",
      usePrefix: true,
      prefix: "  bk  ",
      prMode: "draft",
    });
    assert.equal(cfg.trunk, "main");
    assert.equal(cfg.branch?.user, "bk");
  });

  test("propagates prMode verbatim", () => {
    const draft = buildConfig({ trunk: "main", usePrefix: false, prMode: "draft" });
    const open = buildConfig({ trunk: "main", usePrefix: false, prMode: "open" });
    assert.equal(draft.pr?.mode, "draft");
    assert.equal(open.pr?.mode, "open");
  });
});

describe("confirmTrunkChange", () => {
  test("resolves true without prompting when there is no previous trunk", async () => {
    assert.equal(await confirmTrunkChange(undefined, "main"), true);
    assert.equal(await confirmTrunkChange("", "main"), true);
    assert.equal(await confirmTrunkChange("   ", "main"), true);
  });

  test("resolves true without prompting when the value is unchanged", async () => {
    assert.equal(await confirmTrunkChange("main", "main"), true);
  });

  test("treats surrounding whitespace as unchanged", async () => {
    assert.equal(await confirmTrunkChange("  main  ", "main"), true);
    assert.equal(await confirmTrunkChange("main", "  main  "), true);
  });
});

describe("fieldsForSection", () => {
  test("routes branch naming to prefix updates", () => {
    assert.deepEqual(fieldsForSection("branchNaming"), ["prefix"]);
  });

  test("returns empty for submit settings — it has its own sub-menu", () => {
    assert.deepEqual(fieldsForSection("submitSettings"), []);
  });

  test("routes repo settings to trunk updates", () => {
    assert.deepEqual(fieldsForSection("repoSettings"), ["trunk"]);
  });

  test("maps back and exit to no-op field updates", () => {
    assert.deepEqual(fieldsForSection("back"), []);
    assert.deepEqual(fieldsForSection("exit"), []);
  });
});

describe("DEFAULT_PR_MODE", () => {
  test("defaults to draft so new configs match the historical flo submit behavior", () => {
    assert.equal(DEFAULT_PR_MODE, "draft");
  });
});
