# flo

`flo` is a local git workflow helper (Graphite-style) for stacked branches.

https://github.com/user-attachments/assets/6df2fbfa-568d-489e-a2a3-5156945488a5


## Docs

- **[Installation & releases](../../docs/flo/installation.md)** — Homebrew install, local dev install, release flow
- **[Command reference](../../docs/flo/commands.md)** — every command, flags, and behavior notes
- **[Per-project customization](../../docs/flo/customization.md)** — the `flo.yml` schema: recipes, init steps, patterns

## Quickstart

```bash
flo --help              # list commands
flo setup               # one-time per-dev config (stored under ~/.flo)
flo sync                # update trunk, prune merged branches, restack
flo checkout            # pick a branch from a graph view
flo commit -a -m "msg"  # stage + commit (branches off trunk if needed)
flo submit              # push + open/update a draft PR
```
