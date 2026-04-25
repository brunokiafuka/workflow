#!/usr/bin/env node
/*
 * Claude Code HUD status line — three-line dashboard with repo/PR, model,
 * context meter, session tokens, and a rotating time-of-day greeting.
 *
 * Install:
 *   1. Drop this file at ~/.claude/statusline.js
 *   2. Add to ~/.claude/settings.json:
 *        "statusLine": { "type": "command", "command": "node ~/.claude/statusline.js", "padding": 0 }
 *
 * Config (env vars):
 *   CLAUDE_STATUSLINE_NAME   Name used in greetings. Defaults to $USER's first segment.
 *
 * Requires: node 18+, git (optional, for branch), gh (optional, for PR).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function getName() {
  const override = process.env.CLAUDE_STATUSLINE_NAME;
  if (override && override.trim()) return override.trim();
  const user = process.env.USER || process.env.USERNAME || "";
  const first = user.split(/[._\-\s]/)[0].toLowerCase();
  return first || "friend";
}

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const PURPLE = rgb(196, 146, 233);
const CYAN = rgb(125, 207, 255);
const GREEN = rgb(152, 195, 121);
const YELLOW = rgb(224, 175, 104);
const RED = rgb(224, 108, 117);
const BLUE = rgb(108, 171, 247);
const GRAY = rgb(130, 139, 154);

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function parseTranscript(p) {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let lastContext = 0,
    modelId = null,
    firstTs = null,
    lastTs = null;
  if (!p || !fs.existsSync(p)) return { totals, lastContext, modelId, firstTs, lastTs };
  try {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
      if (Number.isFinite(ts)) {
        if (firstTs === null) firstTs = ts;
        lastTs = ts;
      }
      const u = entry?.message?.usage;
      if (!u) continue;
      totals.input += u.input_tokens || 0;
      totals.output += u.output_tokens || 0;
      totals.cacheRead += u.cache_read_input_tokens || 0;
      totals.cacheWrite += u.cache_creation_input_tokens || 0;
      if (entry.message.model) modelId = entry.message.model;
      lastContext = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    }
  } catch {}
  return { totals, lastContext, modelId, firstTs, lastTs };
}

function findGitBranch(startDir) {
  if (!startDir) return null;
  let dir = startDir;
  while (true) {
    const gitPath = path.join(dir, ".git");
    try {
      const stat = fs.statSync(gitPath);
      let headDir = gitPath;
      if (stat.isFile()) {
        const m = fs.readFileSync(gitPath, "utf8").match(/^gitdir:\s*(.+)$/m);
        if (!m) break;
        headDir = path.isAbsolute(m[1]) ? m[1] : path.join(dir, m[1]);
      }
      const head = fs.readFileSync(path.join(headDir, "HEAD"), "utf8").trim();
      const ref = head.match(/^ref: refs\/heads\/(.+)$/);
      return ref ? ref[1] : head.slice(0, 7);
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const GREETINGS = {
  deadOfNight: [
    "can't sleep? same 👀",
    "{name}, it's {hour}am — you good? 🫣",
    "vampire hours 🧛",
    "ghost prompting at {hour}am 👻",
    "unhinged hours unlocked 🌠",
    "your bed misses you 🛏",
    "clauding in the void 🕳",
    "the cursor blinks, and so do you 👁",
  ],
  earlyMorning: [
    "rise and grind ☀️",
    "first light, first prompt 🌅",
    "coffee in, claude on ☕",
    "morning person detected 🐓",
    "{name}, who hurt you (it's {hour}am) 🥲",
    "early bird, meet bug 🐛",
    "sunrise deploy? bold 🌄",
    "zen mode activated 🧘",
    "the calm before the standup 🕊",
  ],
  morning: [
    "yo {name}, let's cook 🍳",
    "morning energy detected ⚡",
    "hey hey {name} 👋",
    "fresh session, zero regrets 🌱",
    "ship day starts now 🎯",
    "prompts + pastries 🥐",
    "what are we building today? 🔨",
    "good vibes only ☀️",
    "strong coffee, strong prompts 💪",
  ],
  lunch: [
    "lunch break clauding 🍜",
    "running on snacks 🥪",
    "eat something, {name} 🍕",
    "midday sprint ☀️",
    "post-lunch prompting takes courage 😌",
    "food > prompts (for now) 🌯",
  ],
  afternoon: [
    "afternoon flow state ⚡",
    "don't skip water 🧊",
    "cruising, {name} 🛼",
    "deep work mode 🎯",
    "3pm slump? prompt through it ☕",
    "cooking mode 🍳",
    "the grind respects no one 💼",
  ],
  evening: [
    "sun's down, prompts up 🌇",
    "golden hour bug hunt 🌆",
    "wind down or lock in? 🌙",
    "evening session, {name}? 🎧",
    "stay a while 🛋",
    "twilight debugging 🌃",
    "ship before midnight 🚢",
    "vibe coding 🎶",
  ],
  lateNight: [
    "hey hey, clauding at this time? 👀",
    "{name}, one more commit 🌙",
    "owl mode engaged 🦉",
    "lights out, terminal bright 🕯",
    "the quiet hours 🌃",
    "clauding in stealth mode 🥷",
    "sleep is for committers 😴",
    "you and the cursor vs the world ⌨️",
  ],
};

function bucketFor(h) {
  if (h < 5) return "deadOfNight";
  if (h < 8) return "earlyMorning";
  if (h < 12) return "morning";
  if (h < 14) return "lunch";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "lateNight";
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function pickGreeting({ sessionId, name, hour }) {
  const bucket = bucketFor(hour);
  const pool = GREETINGS[bucket];
  const seed = `${sessionId || "anon"}|${bucket}`;
  const template = pool[hashStr(seed) % pool.length];
  return template.replaceAll("{name}", name).replaceAll("{hour}", String(hour));
}

function fmtTokens(n) {
  if (!n) return "0";
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function contextCap(modelId = "") {
  return /\[1m\]|-1m\b/i.test(modelId) ? 1_000_000 : 200_000;
}

function ctxColor(pct) {
  if (pct < 50) return GREEN;
  if (pct < 80) return YELLOW;
  return RED;
}

function getGithubRepo(cwd) {
  try {
    const url = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).trim();
    const m = url.match(/github\.com[:\/]([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

const PR_CACHE = path.join(os.homedir(), ".claude", ".statusline-pr-cache.json");
const PR_CACHE_TTL_MS = 5 * 60_000;

function getPr(cwd, branch) {
  if (!branch) return null;
  const key = `${cwd}#${branch}`;
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(PR_CACHE, "utf8"));
  } catch {}
  const hit = cache[key];
  if (hit && Date.now() - hit.at < PR_CACHE_TTL_MS) return hit.pr;

  let pr = null;
  try {
    const out = execFileSync("gh", ["pr", "view", "--json", "number,title,state,isDraft"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    pr = JSON.parse(out);
  } catch {}

  cache[key] = { at: Date.now(), pr };
  try {
    fs.writeFileSync(PR_CACHE, JSON.stringify(cache));
  } catch {}
  return pr;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function bar(pct, width = 10) {
  const clamped = Math.max(0, Math.min(100, pct));
  let filled = Math.floor((clamped / 100) * width);
  if (clamped > 0 && filled === 0) filled = 1;
  return "█".repeat(filled) + "▒".repeat(width - filled);
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const data = readStdin();
const cwd = data.workspace?.current_dir || data.cwd || process.cwd();
const modelDisplay = data.model?.display_name || "Claude";
const stdinModelId = data.model?.id || "";

const { totals, lastContext, modelId: transcriptModel, firstTs, lastTs } = parseTranscript(data.transcript_path);
const effectiveModel = transcriptModel || stdinModelId;

const totalTokens = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
const cap = contextCap(stdinModelId || effectiveModel);
const ctxPct = cap ? (lastContext / cap) * 100 : 0;

const branch = findGitBranch(cwd);
const dirName = path.basename(cwd) || cwd;

const sep = `${GRAY}·${RESET}`;
const frame = (ch) => `${GRAY}${ch}${RESET}`;

const ghRepo = getGithubRepo(cwd);
const pr = ghRepo ? getPr(cwd, branch) : null;

const topParts = [];
topParts.push(ghRepo ? `${BLUE}${ghRepo}${RESET}` : `${BLUE}📁 ${dirName}${RESET}`);
if (branch) topParts.push(`${YELLOW}⎇ ${branch}${RESET}`);
if (pr) {
  const stateColor = pr.isDraft ? GRAY : pr.state === "OPEN" ? GREEN : PURPLE;
  const stateLabel = pr.isDraft ? "draft" : pr.state.toLowerCase();
  topParts.push(`${stateColor}#${pr.number} ${truncate(pr.title, 45)} ${DIM}(${stateLabel})${RESET}`);
} else if (ghRepo && branch) {
  topParts.push(`${DIM}no PR${RESET}`);
}

const ctxBar = bar(ctxPct, 10);
const midParts = [
  `${PURPLE}🤖 ${modelDisplay}${RESET}`,
  `${ctxColor(ctxPct)}🧠 ${ctxBar} ${ctxPct.toFixed(0)}%${RESET} ${DIM}(${fmtTokens(lastContext)}/${fmtTokens(cap)})${RESET}`,
  `${CYAN}📊 ${fmtTokens(totalTokens)}${RESET}`,
];

const durationMs = firstTs && lastTs ? lastTs - firstTs : 0;
const greetingText = pickGreeting({
  sessionId: data.session_id,
  name: getName(),
  hour: new Date().getHours(),
});

const bottomParts = [`${YELLOW}${greetingText}${RESET}`];
const dur = fmtDuration(durationMs);
if (dur) bottomParts.push(`${DIM}⏱ ${dur}${RESET}`);

const line1 = `${frame("┌")} ${topParts.join(` ${sep} `)}`;
const line2 = `${frame("│")} ${midParts.join(` ${sep} `)}`;
const line3 = `${frame("└")} ${bottomParts.join(` ${sep} `)}`;

process.stdout.write(`${line1}\n${line2}\n${line3}`);
