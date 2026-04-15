<p align="center">
  <img src="docs/assets/avatar.jpg" alt="bk" width="160" />
</p>

<h1 align="center">workflow</h1>

<p align="center">
  bk's personal workflow tools and scripts.<br/>
  Each tool lives under <code>tools/&lt;name&gt;</code> and ships on its own.
</p>

---

## Tools

| Tool | What it does |
| ---- | ------------ |
| [`flo`](tools/flo) | Local git workflow helper (Graphite-style): sync, stacked branches, draft-PR submit. |

## Layout

```
workflow/
├── tools/
│   └── flo/             # each tool is self-contained
├── docs/
│   └── flo/             # per-tool docs (commands + installation)
├── Formula/             # Homebrew taps
└── package.json         # pnpm workspace root
```

## Installing a tool

Two install paths:

**Homebrew** (end users — see [`docs/flo/installation.md`](docs/flo/installation.md) for the full install & release guide):

```bash
brew tap brunokiafuka/workflow https://github.com/brunokiafuka/workflow
brew install --HEAD flo
```

**Local dev install** (when hacking on a tool):

```bash
pnpm install
pnpm run install:flo    # symlinks ~/.local/bin/flo
```

## Philosophy

- **Scripts over services.** Small, local, reversible.
- **One tool, one job.** No shared runtime — each tool owns its dependencies under `tools/<name>`.
- **Boring stack.** TypeScript + tsx, no bundler, no framework.
