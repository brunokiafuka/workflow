# claude

Customizations for [Claude Code](https://claude.com/code) — a three-line HUD status line plus an optional done-sound hook.

> **Why no cost segment?** Anthropic's billing is contextual (Sonnet's >200k-prompt tier, cache-creation tiers, subscription vs API pricing), and approximations drifted from reality enough to be misleading. The HUD shows token counts instead — those come straight from the transcript's `usage` field and are exact.

## What's in the box

| File | Where it lands | What it does |
| ---- | -------------- | ------------ |
| `statusline.js` | `~/.claude/statusline.js` | Three-line status HUD: repo/PR, model + context meter + session tokens, time-of-day greeting. |
| `settings.example.json` | merge into `~/.claude/settings.json` | `statusLine` entry + a `Stop` hook that plays a sound when Claude finishes a turn. |

## Install

### Via Homebrew (recommended)

```bash
brew tap brunokiafuka/workflow https://github.com/brunokiafuka/workflow
brew install --HEAD claude-tools
claude-tools                    # symlinks statusline.js into ~/.claude/
```

Upgrade later with:

```bash
brew upgrade --fetch-HEAD claude-tools
```

Symlinks target `$(brew --prefix)/opt/claude-tools/libexec/statusline.js`, so `brew upgrade` auto-refreshes your `~/.claude/statusline.js` — no re-install needed.

### From a local clone

```bash
./install
```

Re-run any time — idempotent, and backs up non-symlink files before replacing them.

### Merge settings

Neither path touches `~/.claude/settings.json`. After installing, merge the keys from [`settings.example.json`](settings.example.json) (statusLine + optional Stop-sound hook) into your `~/.claude/settings.json` by hand.

## Status line preview

```
┌ owner/repo · ⎇ main · #42 Fix analytics (open)
│ 🤖 Opus 4.7 · 🧠 ██▒▒▒▒▒▒▒▒ 14% (140k/1M) · 📊 3.8M
└ evening session, bruno? 🎧 · ⏱ 2h 14m
```

**Line 1** — GitHub repo + branch + PR (needs `gh` authenticated), falls back to directory name outside a repo.
**Line 2** — model name · context meter (green < 50% → yellow < 80% → red) · total session tokens.
**Line 3** — rotating time-of-day greeting (stable within a session, 7 time buckets) · session duration.

### Env vars

| Var | Default | Purpose |
| --- | ------- | ------- |
| `CLAUDE_STATUSLINE_NAME` | first segment of `$USER` | Name used in greetings. |

## Requirements

- Node 18+ (for `statusline.js`)
- `git` (optional, for branch info)
- `gh` (optional, for PR info — needs to be authenticated)
- macOS for the `afplay` Stop hook (swap to another player on Linux/WSL)

## Uninstall

```bash
rm ~/.claude/statusline.js
```

Then remove the `statusLine` and `hooks` entries from `~/.claude/settings.json`.
