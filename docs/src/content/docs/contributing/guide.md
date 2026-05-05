---
title: Contributing guide
description: Hack on flo — local dev setup, tests, and the release flow.
---

## Local dev

Clone, install, and symlink flo into your `PATH`:

```bash
git clone https://github.com/brunokiafuka/flo.git
cd flo
pnpm install
pnpm run install:flo    # symlinks ~/.local/bin/flo at the working tree
```

`flo --help` should now resolve to your checkout. Edits to `tools/flo/lib/**` take effect on next invocation — there's no build step (TypeScript runs through `tsx`).

## Tests, lint, format

```bash
pnpm --filter flo test       # unit tests for tools/flo
pnpm lint                    # oxlint
pnpm format                  # oxfmt write
pnpm format:check            # CI form
```

There's a top-level `flo.yml` with shortcuts: `flo test`, `flo lint`, `flo fmt`.

## Docs

The docs site is a Starlight project under `docs/`. Live-reload it with:

```bash
pnpm --filter docs dev       # http://localhost:4321/flo/
pnpm --filter docs build     # static output to docs/dist/
```

A push to `main` that touches `docs/**` triggers `.github/workflows/deploy-docs.yml`, which builds and publishes to GitHub Pages.

## Cutting a release

flo uses **`tools/flo/package.json`'s `version` field on `main`** as the source of truth for "what's the latest version?". The in-flo update check fetches that file directly. A release is just:

1. **Bump the version** in `tools/flo/package.json` (`0.2.0` → `0.3.0`).
2. **Merge to `main`.**

That's it. Users get the update notice the next time their local cache expires (12h TTL).

There's a helper too — `flo fr` (alias for `flo release-flo`) runs `scripts/release.sh`, which handles the bump + commit + push interactively.

### Tagged release (optional, for Homebrew pinning)

Only needed if you want a pinned, reproducible Homebrew install (`brew install flo` without `--HEAD`). Solo-tool usage can usually skip this entirely.

1. **Tag the repo**

   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

2. **Grab the tarball SHA**

   ```bash
   curl -sL https://github.com/brunokiafuka/flo/archive/refs/tags/v0.3.0.tar.gz | shasum -a 256
   ```

3. **Update [`Formula/flo.rb`](https://github.com/brunokiafuka/flo/blob/main/Formula/flo.rb)**

   Add (or update) `url` and `sha256`, keeping `head` around so `--HEAD` installs still work:

   ```ruby
   url "https://github.com/brunokiafuka/flo/archive/refs/tags/v0.3.0.tar.gz"
   sha256 "<paste the shasum output>"
   head "https://github.com/brunokiafuka/flo.git", branch: "main"
   ```

4. **Commit, push, and you're done.** The next `brew upgrade flo` picks up the new version.

## HEAD vs versioned at a glance

|                     | `--HEAD`                    | Versioned                |
| ------------------- | --------------------------- | ------------------------ |
| Install command     | `brew install --HEAD flo`   | `brew install flo`       |
| Update strategy     | `brew upgrade --fetch-HEAD` | `brew upgrade`           |
| Reproducible builds | ❌                          | ✅                       |
| Maintenance cost    | Zero                        | Bump formula per release |

For a solo tool `--HEAD` is usually fine. Switch to tagged releases once others start relying on flo.

## Formula layout

```
Formula/
└── flo.rb          # one formula per tool; each is self-contained
```

The formula runs `npm install` inside `tools/flo` at build time, so installers only need `node` (declared via `depends_on "node"`).
