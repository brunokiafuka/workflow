# flo

`flo` is your local flow orchestrator — git, PRs, and project recipes in one tool.

https://github.com/user-attachments/assets/6df2fbfa-568d-489e-a2a3-5156945488a5


## Docs

- **[Installation & releases](../../docs/flo/installation.md)** — Homebrew install, local dev install, release flow
- **[Command reference](../../docs/flo/commands.md)** — every command, flags, and behavior notes
- **[Per-project customization](../../docs/flo/customization.md)** — the `flo.yml` schema: recipes, init steps, patterns

## Quickstart

```bash
flo --help              # list commands
flo setup               # per-dev config: trunk, prefix, PR mode (stored under ~/.flo)
flo setup --update      # tweak a single setting without walking the whole wizard
flo sync                # update trunk, prune merged branches, restack
flo checkout            # pick a branch from a graph view
flo commit -a -m "msg"  # stage + commit (branches off trunk if needed)
flo submit              # push + open/update a PR (draft or ready-for-review, per setup)
flo <recipe>            # run a project command defined in flo.yml
```
