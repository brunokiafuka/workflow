# flo

`flo` is a local git workflow helper (Graphite-style) for stacked branches.

## Docs

- **[Installation & releases](../../docs/flo/installation.md)** — Homebrew install, local dev install, release flow
- **[Command reference](../../docs/flo/commands.md)** — every command, flags, and behavior notes

## Quickstart

```bash
flo --help              # list commands
flo sync                # update trunk, prune merged branches, restack
flo checkout            # pick a branch from a graph view
flo commit -a -m "msg"  # stage + commit (branches off trunk if needed)
flo submit              # push + open/update a draft PR
```
