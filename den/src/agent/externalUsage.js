// externalUsage.js — how much of their plan limits Claude Code and Codex have used.
//
// Neither CLI has a command for this, but both report it as they work:
//   Claude Code sends a `rate_limit_event` in its stream-json output.
//   Codex writes `token_count` events with `rate_limits` into its session files.
// Asyncat keeps the latest reading per engine (and, for Codex, also reads its
// newest session file, so use from the terminal or the Codex app counts too).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { runtimeDataPath } from '../config/runtimeConfig.js';

const codexHome = (env) => env.CODEX_HOME || path.join(os.homedir(), '.codex');

const STORE_FILE = () => runtimeDataPath('external-agent-usage.json');
let cache = null;

function readStore() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(STORE_FILE(), 'utf8')) || {}; } catch { cache = {}; }
  return cache;
}

function writeStore(store) {
  cache = store;
  try {
    fs.mkdirSync(path.dirname(STORE_FILE()), { recursive: true });
    fs.writeFileSync(STORE_FILE(), JSON.stringify(store, null, 2));
  } catch { /* usage is informational */ }
}

const CLAUDE_WINDOW_LABELS = {
  five_hour: '5-hour',
  seven_day: 'Weekly',
  seven_day_opus: 'Weekly (Opus)',
  seven_day_sonnet: 'Weekly (Sonnet)',
};

function windowLabel(minutes) {
  if (!minutes) return 'Limit';
  if (minutes === 300) return '5-hour';
  if (minutes === 10080) return 'Weekly';
  if (minutes >= 40320 && minutes <= 44640) return 'Monthly';
  if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour`;
  return `${minutes}-minute`;
}

const toMs = (seconds) => (Number(seconds) > 0 ? Number(seconds) * 1000 : null);
const percent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) * 10) / 10));

/** Usage from Claude Code's `rate_limit_info`. */
export function claudeUsageFromEvent(info = {}) {
  const windows = Object.entries(info.unifiedWindows || {})
    .filter(([, value]) => value && value.utilization != null)
    .map(([key, value]) => ({
      key,
      label: CLAUDE_WINDOW_LABELS[key] || key.replace(/_/g, ' '),
      usedPercent: percent(value.utilization * 100),
      resetsAt: toMs(value.resetsAt),
    }));
  if (!windows.length && info.rateLimitType) {
    windows.push({ key: info.rateLimitType, label: CLAUDE_WINDOW_LABELS[info.rateLimitType] || info.rateLimitType, usedPercent: null, resetsAt: toMs(info.resetsAt) });
  }
  return {
    plan: null,
    // allowed | allowed_warning | rejected
    status: info.status || null,
    windows,
    observedAt: Date.now(),
  };
}

/** Usage from a Codex `rate_limits` object. */
export function codexUsageFromRateLimits(limits = {}, observedAt = Date.now()) {
  const windows = ['primary', 'secondary']
    .map((key) => limits[key] && {
      key,
      label: windowLabel(limits[key].window_minutes),
      usedPercent: percent(limits[key].used_percent),
      resetsAt: toMs(limits[key].resets_at),
    })
    .filter(Boolean);
  return {
    plan: limits.plan_type || null,
    status: limits.rate_limit_reached_type ? 'rejected' : 'allowed',
    windows,
    observedAt,
  };
}

export function recordUsage(engine, usage) {
  if (!usage) return;
  writeStore({ ...readStore(), [engine]: usage });
}

/** The latest Codex rate limits from its newest session files. */
export function latestCodexUsage({ env = process.env, filesToCheck = 5 } = {}) {
  const root = path.join(codexHome(env), 'sessions');
  const files = [];
  const walk = (dir, depth) => {
    if (files.length >= filesToCheck) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (files.length >= filesToCheck) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(root, 0);

  let best = null;
  for (const file of files) {
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    const length = Math.min(stat.size, 512 * 1024);
    const fd = fs.openSync(file, 'r');
    let text = '';
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, stat.size - length);
      text = buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"rate_limits"')) continue;
      try {
        const event = JSON.parse(lines[i]);
        const limits = event.payload?.rate_limits;
        if (!limits) continue;
        const observedAt = Date.parse(event.timestamp) || stat.mtimeMs;
        if (!best || observedAt > best.observedAt) best = codexUsageFromRateLimits(limits, observedAt);
        break;
      } catch { /* cut line */ }
    }
  }
  return best;
}

/** Latest known usage per engine: { 'claude-code': {...} | null, codex: {...} | null }. */
export function getExternalUsage(env = process.env) {
  const store = readStore();
  const codexFromFiles = latestCodexUsage({ env });
  const codex = [store.codex, codexFromFiles].filter(Boolean).sort((a, b) => b.observedAt - a.observedAt)[0] || null;
  return { 'claude-code': store['claude-code'] || null, codex };
}
