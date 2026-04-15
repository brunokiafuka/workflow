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

## Cutting a versioned release (maintainers)

GitHub auto-generates a tarball for every git tag — you don't need to build anything yourself. The flow:

1. **Tag the repo**

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **Grab the tarball SHA**

   ```bash
   curl -sL https://github.com/brunokiafuka/workflow/archive/refs/tags/v0.1.0.tar.gz | shasum -a 256
   ```

3. **Update [`Formula/flo.rb`](../../Formula/flo.rb)**

   Add (or update) `url` and `sha256`, keeping `head` around so `--HEAD` installs still work:

   ```ruby
   url "https://github.com/brunokiafuka/workflow/archive/refs/tags/v0.1.0.tar.gz"
   sha256 "<paste the shasum output>"
   head "https://github.com/brunokiafuka/workflow.git", branch: "main"
   ```

4. **Commit, push, and you're done.** The next `brew upgrade flo` will pick up the new version.

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
