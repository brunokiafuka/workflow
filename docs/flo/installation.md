# `flo` — installation & releases

`flo` ships as a Homebrew formula at [`Formula/flo.rb`](../../Formula/flo.rb). Pick HEAD for bleeding-edge, or a tagged release for reproducibility.

## Installing (users)

### Latest from `main` (HEAD)

```bash
brew tap brunokiafuka/workflow https://github.com/brunokiafuka/workflow
brew install --HEAD flo
```

Upgrade to the tip of `main` later with:

```bash
brew upgrade --fetch-HEAD flo
```

### Versioned release

_If a tagged release has been cut (see below), users can install a pinned version:_

```bash
brew install flo           # installs the latest tagged release
brew upgrade flo           # picks up new releases as formulas are updated
```

## Cutting a release (maintainers)

flo uses **`tools/flo/package.json`'s `version` field on `main`** as the source of truth for "what's the latest version?" — the in-flo update check (see below) fetches that file directly. A release is just:

1. **Bump the version** in `tools/flo/package.json` (`0.2.0` → `0.3.0`).
2. **Merge to `main`.**

That's it. Users get the update notice the next time their local cache expires (12h TTL).

### Tagged release (optional — for Homebrew pinning)

Only needed if you want a pinned, reproducible Homebrew install (`brew install flo` without `--HEAD`). Most solo-tool usage can skip this entirely.

1. **Tag the repo**

   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

2. **Grab the tarball SHA**

   ```bash
   curl -sL https://github.com/brunokiafuka/workflow/archive/refs/tags/v0.3.0.tar.gz | shasum -a 256
   ```

3. **Update [`Formula/flo.rb`](../../Formula/flo.rb)**

   Add (or update) `url` and `sha256`, keeping `head` around so `--HEAD` installs still work:

   ```ruby
   url "https://github.com/brunokiafuka/workflow/archive/refs/tags/v0.3.0.tar.gz"
   sha256 "<paste the shasum output>"
   head "https://github.com/brunokiafuka/workflow.git", branch: "main"
   ```

4. **Commit, push, and you're done.** The next `brew upgrade flo` will pick up the new version.

## Update check

Every command that isn't `flo setup` or `flo --help` (and is running in a TTY) ends with a one-line notice when a newer `version` has landed on `main`:

```
↑ flo 0.3.0 is available (you have 0.2.0). Run `brew upgrade flo` to update.
```

- **Cadence:** at most one network check per 12h, cached in `~/.flo/update-check.json`.
- **Source:** the raw `tools/flo/package.json` on `main` (no tag / release required).
- **Install-aware:** suggests `brew upgrade flo` when flo is running from a Homebrew cellar path, or `git pull && ./tools/flo/install` for a direct checkout.
- **Fail-silent:** network errors, 404s, timeouts (2.5s) — all swallowed. The check never blocks or slows down a command.
- **Opt-out:** set `FLO_NO_UPDATE_CHECK=1`.

## Choosing HEAD vs versioned

|                     | `--HEAD`                       | Versioned                    |
| ------------------- | ------------------------------ | ---------------------------- |
| Install command     | `brew install --HEAD flo`      | `brew install flo`           |
| Update strategy     | `brew upgrade --fetch-HEAD`    | `brew upgrade`               |
| Reproducible builds | ❌                              | ✅                            |
| Maintenance cost    | Zero                           | Bump formula per release     |

For a solo tool `--HEAD` is usually fine. Switch to tagged releases once other people start relying on `flo`.

## Formula layout

```
Formula/
└── flo.rb          # one formula per tool; each is self-contained
```

The formula runs `npm install` inside `tools/flo` at build time, so installers only need `node` (declared via `depends_on "node"`).
