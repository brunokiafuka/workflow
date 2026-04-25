import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { listRecipeNames, parseRecipes, resolveRecipe } from "../recipes.js";

const FIXTURE = `
project: "Workflow"

commands:
  test:
    description: Run the test suite
    command: pnpm --filter flo test
    aliases: [t]
  build:
    command: pnpm --filter flo build
`;

describe("parseRecipes", () => {
  test("parses project and commands", () => {
    const file = parseRecipes(FIXTURE, "/x/flo.yml");
    assert.equal(file.project, "Workflow");
    assert.equal(file.path, "/x/flo.yml");
    assert.deepEqual(listRecipeNames(file), ["build", "test"]);
    assert.equal(file.commands.test.description, "Run the test suite");
    assert.equal(file.commands.test.command, "pnpm --filter flo test");
    assert.deepEqual(file.commands.test.aliases, ["t"]);
    assert.deepEqual(file.commands.build.aliases, []);
    assert.equal(file.commands.build.description, undefined);
    assert.equal(file.commands.test.interactive, false);
    assert.equal(file.commands.build.interactive, false);
  });

  test("parses interactive: true", () => {
    const src = `
commands:
  release:
    command: sh scripts/release.sh
    interactive: true
`;
    const file = parseRecipes(src, "/x/flo.yml");
    assert.equal(file.commands.release.interactive, true);
  });

  test("rejects non-boolean interactive values", () => {
    const src = `
commands:
  bad:
    command: echo hi
    interactive: "yes"
`;
    assert.throws(() => parseRecipes(src, "/x/flo.yml"), /interactive must be a boolean/);
  });

  test("missing commands key yields empty map", () => {
    const file = parseRecipes(`project: "x"\n`, "/x/flo.yml");
    assert.deepEqual(file.commands, {});
  });

  test("rejects non-object command entry", () => {
    assert.throws(() => parseRecipes(`commands:\n  test: "nope"\n`, "/x/flo.yml"), /commands\.test must be an object/);
  });

  test("requires a string command", () => {
    assert.throws(
      () => parseRecipes(`commands:\n  test:\n    description: only\n`, "/x/flo.yml"),
      /commands\.test\.command is required/,
    );
  });

  test("detects duplicate alias across commands", () => {
    const src = `
commands:
  a:
    command: echo a
    aliases: [x]
  b:
    command: echo b
    aliases: [x]
`;
    assert.throws(() => parseRecipes(src, "/x/flo.yml"), /alias "x" is defined on both/);
  });

  test("rejects alias that shadows another command name", () => {
    const src = `
commands:
  test:
    command: echo t
  build:
    command: echo b
    aliases: [test]
`;
    assert.throws(() => parseRecipes(src, "/x/flo.yml"), /shadows another command/);
  });
});

describe("parseRecipes — init block", () => {
  test("parses init steps with id as key", () => {
    const src = `
init:
  - install-dependencies:
      name: Install dependencies
      run: pnpm install
  - migrate:
      run: pnpm db:migrate
`;
    const file = parseRecipes(src, "/x/flo.yml");
    assert.deepEqual(file.init, [
      { id: "install-dependencies", name: "Install dependencies", run: "pnpm install" },
      { id: "migrate", name: "migrate", run: "pnpm db:migrate" },
    ]);
  });

  test("missing init yields empty list", () => {
    const file = parseRecipes(`commands: {}\n`, "/x/flo.yml");
    assert.deepEqual(file.init, []);
  });

  test("non-list init throws", () => {
    assert.throws(() => parseRecipes(`init: not-a-list\n`, "/x/flo.yml"), /init must be a list/);
  });

  test("step map with multiple keys throws", () => {
    const src = `
init:
  - a:
      run: echo a
    b:
      run: echo b
`;
    assert.throws(() => parseRecipes(src, "/x/flo.yml"), /init\[0\] must have exactly one step id/);
  });

  test("missing run throws", () => {
    assert.throws(
      () => parseRecipes(`init:\n  - x:\n      name: Hi\n`, "/x/flo.yml"),
      /init step "x"\.run is required/,
    );
  });

  test("duplicate step id throws", () => {
    const src = `
init:
  - x:
      run: echo a
  - x:
      run: echo b
`;
    assert.throws(() => parseRecipes(src, "/x/flo.yml"), /init step "x" is defined twice/);
  });
});

describe("resolveRecipe", () => {
  const file = parseRecipes(FIXTURE, "/x/flo.yml");

  test("resolves by name", () => {
    assert.equal(resolveRecipe(file, "test")?.name, "test");
  });

  test("resolves by alias", () => {
    assert.equal(resolveRecipe(file, "t")?.name, "test");
  });

  test("returns null for unknown", () => {
    assert.equal(resolveRecipe(file, "nope"), null);
  });
});
