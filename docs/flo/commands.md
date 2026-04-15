# `flo` — command reference

`flo` is a local git workflow helper for stacked branches. It wraps the handful of git invocations you'd otherwise type a hundred times a day, with safer defaults and friendlier output.

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
