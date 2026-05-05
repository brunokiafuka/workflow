<p align="center">
  <img src="docs/assets/avatar.jpg" alt="bk" width="160" />
</p>

<h1 align="center">flo</h1>

<p align="center">
  Your local flow orchestrator — git, PRs, and project recipes in one tool.<br/>
  <code>sync</code> · <code>checkout</code> · <code>commit</code> · <code>submit</code> · <code>run</code>
</p>

---

## Install

```bash
brew tap brunokiafuka/workflow https://github.com/brunokiafuka/workflow
brew install --HEAD flo
```

For versioned installs and release flow, see [`docs/flo/installation.md`](docs/flo/installation.md).

## Quickstart

```bash
flo --help              # list commands
flo setup               # per-dev config: trunk, prefix, PR mode (stored under ~/.flo)
flo sync                # update trunk, prune merged branches, restack
flo checkout            # pick a branch from a graph view
flo commit -a -m "msg"  # stage + commit (branches off trunk if needed)
flo submit              # push + open/update a PR (draft or ready-for-review, per setup)
flo <recipe>            # run a project command defined in flo.yml
```

## Docs

- **[Command reference](docs/flo/commands.md)** — every command, flags, and behavior notes
- **[Per-project customization](docs/flo/customization.md)** — `flo.yml` schema: recipes, init steps, patterns
- **[Installation & releases](docs/flo/installation.md)** — Homebrew install, local dev install, release flow

## Local dev

```bash
pnpm install
pnpm run install:flo    # symlinks ~/.local/bin/flo
```

## Layout

```
./
├── tools/
│   └── flo/         # the tool — self-contained, owns its deps
├── docs/
│   └── flo/         # commands, customization, installation
├── Formula/
│   └── flo.rb       # Homebrew formula
└── package.json     # pnpm workspace root (tools/*)
```

The repo is a pnpm workspace shaped for one tool today — extra `tools/<name>` slots stay open for whatever lands next.

## Philosophy

- **Scripts over services.** Small, local, reversible.
- **One tool, one job.** No shared runtime — each tool owns its dependencies under `tools/<name>`.
- **Boring stack.** TypeScript + tsx, no bundler, no framework.
