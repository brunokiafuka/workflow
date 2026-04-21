# `flo` — command reference

`flo` is a local git workflow helper for stacked branches. It wraps the handful of git invocations you'd otherwise type a hundred times a day, with safer defaults and friendlier output.

- [`flo setup`](#flo-setup) — configure your per-dev settings for this repo
- [`flo sync`](#flo-sync) — fetch, prune merged branches, restack
- [`flo checkout`](#flo-checkout) — pick a branch from a graph view
- [`flo get`](#flo-get) — fetch + checkout a remote branch
- [`flo restack`](#flo-restack) — rebase a branch onto trunk
- [`flo add`](#flo-add) — stage everything
- [`flo commit`](#flo-commit) — create a commit
- [`flo modify`](#flo-modify) — amend (or create) a commit
- [`flo push`](#flo-push) — push with `--force-with-lease`
- [`flo submit`](#flo-submit) — push and open/update a draft PR

---

## `flo setup`

Interactive setup: writes a YAML config with your trunk branch and an optional branch-name prefix. Config lives **outside the repo**, under `~/.flo/projects/<host>/<owner>/<repo>/config.yml` (or `$XDG_CONFIG_HOME/flo/...` on Linux when that variable is set) — nothing to `.gitignore`. Every command reads this file when present; if it's missing, flo offers to run setup inline before continuing (see [Auto-prompt on first use](#auto-prompt-on-first-use) below).

**What it asks**

1. **Trunk branch** — auto-detects from `origin/HEAD`, falls back to `main`/`master`.
2. **Prefix your branches with a personal tag?** — yes/no. Handy on shared repos where everyone's branches share a root namespace (`bk/add-feature`, `alice/fix-bug`). Defaults to yes when flo detects your git email.
3. **Prefix** — if yes. Defaults to the local part of your `git config user.email`. Validated against a safe subset for git refs (letters, digits, `._-`).

**Example run**

```
? Trunk branch (main)
? Prefix your branches with a personal tag? (Y/n)
? Prefix (bk)

✔ Wrote ~/.flo/projects/github.com/owner/repo/config.yml

  trunk:      main
  prefix:     bk

  Example:    add_new_feature → bk/add_new_feature
```

**Config shape on disk**

```yaml
trunk: main
branch:
  template: "{user}/{slug}"   # or "{slug}" when no prefix
  user: bk                    # omitted when no prefix
```

Setup only writes the two template shapes above (`{user}/{slug}` and `{slug}`). The tokens are an implementation detail — `{user}` expands to `branch.user`, `{slug}` to a slugified commit subject (lowercase, spaces → `_`, git-invalid chars stripped, 60 chars max). Power users can hand-edit the YAML for other patterns like `"{user}-{slug}"`; the UI never exposes the tokens.

The template is applied wherever flo suggests a branch name (currently: the trunk-guard prompt in `commit` and `modify`). Re-running `flo setup` prompts before overwriting.

**Slot path resolution**

flo derives the slot from your `origin` remote. SSH and HTTPS forms of the same remote resolve to the **same slot** — re-cloning with a different URL scheme keeps your config.

| Origin URL | Slot |
| ---------- | ---- |
| `git@github.com:owner/repo.git` | `~/.flo/projects/github.com/owner/repo/` |
| `https://github.com/owner/repo.git` | `~/.flo/projects/github.com/owner/repo/` |
| `ssh://git@github.com/owner/repo` | `~/.flo/projects/github.com/owner/repo/` |
| `https://gitlab.com/group/sub/repo` | `~/.flo/projects/gitlab.com/group/sub/repo/` |
| (no `origin` remote) | `~/.flo/projects/_local/<dirname>/` — setup warns when this fallback is used |

Normalization: lowercase the host, strip `www.`, strip trailing `.git` / `/`. Unusual URL shapes (empty paths, `..` segments) fall back to the `_local/` slot.

**Legacy paths.** Existing repos with `.flo/config.json` or `.flo.json` keep working — flo falls back to those when no user-level config exists. Re-running `flo setup` writes the new YAML location; you can delete the old `.flo/` directory afterwards (a dedicated `--migrate` flow will handle this automatically in a later release).

### Auto-prompt on first use

Any command other than `setup` / `help` checks for a loadable config before running. If none is found, flo asks inline:

```
  No flo config found for this repo (expected at ~/.flo/projects/github.com/owner/repo/config.yml).
? Run flo setup now? (Y/n)
```

- **Yes** — runs setup, then continues with the original command
- **No** — prints a polite reminder and continues with defaults
- **Non-TTY** (CI, piped input) — skips the prompt, prints the reminder, continues

---

## `flo sync`

Fetches `origin --prune`, fast-forwards trunk, cleans up branches whose PRs have been merged, and rebases every remaining local branch onto trunk.

**What it does**

1. `git fetch origin --prune` (with a progress bar)
2. Fast-forwards local trunk to `origin/<trunk>`
3. Finds merged branches two ways:
   - Local git heuristics — real merges, upstream-gone branches, and squash-merges detected via `git cherry` patch-equivalence
   - GitHub — the head ref names of merged PRs (via `gh pr list --state merged`). Fails open if `gh` isn't available
4. If the current branch is merged, switches to trunk first so you're not standing on the branch you're about to delete
5. Prompts (multiselect) for which merged branches to clean up
6. Rebases every remaining local branch onto trunk; aborts the rebase on conflict and points you at `flo restack`

**Exits on conflict** — your working copy is left clean, on the original branch, with a hint to finish the rebase manually.

---

## `flo checkout`

Alias: `flo co`

Renders a vertical graph of local branches with trunk at the bottom, each line showing short SHA + commit subject. Current branch is marked with `●` and preselected. Pick a branch to switch to.

```
  ○ bk/feature-a          abc1234  add foo thing
  │
  ● bk/current            def5678  wip on bar
  │
  ○ main                  12345ab  init

? Checkout which branch? ›
  ❯ bk/current
    bk/feature-a
    main  (trunk)
```

Selecting the current branch is a no-op.

---

## `flo get [branch]`

Fetches the named branch from origin and checks it out, rebasing that one branch onto trunk. Defaults to the current branch if no name is given.

Useful when a teammate has force-pushed and you want the clean version without affecting your other branches.

---

## `flo restack [branch]`

Rebases the named branch (or current branch) onto trunk. Unlike `flo sync`, this **leaves conflicts open** for you to resolve — it's the tool you reach for when `flo sync` bailed on a conflict.

---

## `flo add`

Stages all tracked and untracked changes (`git add -A`). No flags.

---

## `flo commit`

Creates a new commit on the current branch.

**Flags**

| Flag | What |
| ---- | ---- |
| `-m, --message <msg>` | commit message (prompts if omitted) |
| `-a, --all` | stage all changes first |

**Trunk guard.** If you run `flo commit` while on `main`/`master`, flo first collects the commit message, then prompts for a new branch name — prefilled with a slug derived from the message (spaces → `_`, invalid chars stripped, capped at 60 chars). You can edit the suggestion or accept it. flo then runs `git checkout -b <name>` before the commit, so your work never lands directly on trunk.

---

## `flo modify`

Amend (or create) a commit on the current branch.

**Flags**

| Flag | What |
| ---- | ---- |
| `-m, --message <msg>` | amend with a new message |
| `-a, --all` | stage all changes first |
| `-c, --commit` | create a new commit instead of amending |
| `-e, --edit` | open the editor for the amended message |

**No-own-commits fallback.** If the branch has no commits of its own yet (trunk..HEAD count is 0), amending would rewrite trunk's HEAD — so flo silently falls through to creating a new commit instead. The trunk guard from `flo commit` also applies here.

---

## `flo push`

Pushes the current branch with `--force-with-lease`. On first push (no upstream set), uses `git push -u origin HEAD` instead.

Detects a stale upstream and tells you to `flo sync` rather than spewing git's native error.

---

## `flo submit`

Pushes and opens (or updates) a PR for the current branch. Requires the [`gh`](https://cli.github.com/) CLI.

**Status detection**

| Status | When |
| ------ | ---- |
| `(new)` | no PR exists for this branch yet |
| `(update)` | PR exists and you have commits to push |
| `(no update)` | PR exists and local HEAD == remote HEAD |

**Flow**

1. Prints `<branch>  (status)`
2. Pushes with a spinner (skipped when `(no update)`)
3. If `(new)`: `gh pr create --draft --fill` — title/body come from commits
4. If `(update)`: notes that the push itself synced the PR
5. Prints the PR URL on success

```
add_branching  (new)
  pushing…
  opening draft PR…

✓ add_branching: https://github.com/org/repo/pull/3  (new)
```
