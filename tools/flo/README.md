# flo

`flo` is a local git workflow helper (Graphite-style) for stacked branches.

## Install

### Homebrew (no manual repo clone)

If this repository is configured as a Homebrew tap, you can install with:

```bash
brew tap bruno_kiafuka/workflow https://github.com/bruno_kiafuka/workflow
brew install --HEAD flo
```

### Local repo install

From the repository root:

```bash
pnpm install
pnpm run install:flo
```

This creates `~/.local/bin/flo` as a symlink to `tools/flo/flo`.

## Usage

```bash
flo --help
```

Main commands:

- `flo sync`: update trunk and restack local branches
- `flo get [branch]`: fetch + checkout a remote branch
- `flo checkout` (`flo co`): pick a local branch from a graph view
- `flo restack [branch]`: rebase branch onto trunk
- `flo add`: stage all tracked and untracked changes
- `flo commit`: create a commit (`-m`, `-a`)
- `flo modify`: amend or create (`-m`, `-a`, `-c`, `-e`)
- `flo push`: push with `--force-with-lease`
- `flo submit`: push and open/update a draft PR (requires [`gh`](https://cli.github.com/))
