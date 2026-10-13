// den/src/cats/catTriggers.js
// ─── What wakes a Cat ────────────────────────────────────────────────────────
// Besides its schedule (catEngine.js) and its chat, a Cat can watch:
//  - email: new messages in the inbox set up under Settings → Connections,
//    optionally only from someone or about something;
//  - rss: new posts in a feed;
//  - webpage: a page whose text changes (or starts mentioning a phrase);
//  - folder: files added, changed or removed in a folder.
//
// Each check compares what is there now with what the trigger saw last time
// (its `state`). The first check only takes note, so a new watcher wakes the
// Cat on the next change rather than on everything already there.
//
// The I/O is passed in (`deps`) so tests can use fake mail, feeds and pages.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAX_REPORTED = 10;
const MAX_SEEN = 300;
const MAX_FOLDER_FILES = 3000;
const MAX_FOLDER_DEPTH = 5;
const MAX_PAGE_LINES = 400;
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', '.asyncat', '.cache', '__pycache__', '.venv']);

const hash = (text) => crypto.createHash('sha256').update(String(text || '')).digest('hex');
const clip = (text, max) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

function contains(haystack, needle) {
  if (!needle) return true;
  return String(haystack || '').toLowerCase().includes(String(needle).toLowerCase());
}

// ── Email ─────────────────────────────────────────────────────────────────────

export async function checkEmail(config, state, { listMail }) {
  const messages = await listMail({ limit: 30, unread: false });
  const withUid = messages.filter((message) => Number.isFinite(Number(message.uid)));
  const maxUid = withUid.reduce((max, message) => Math.max(max, Number(message.uid)), Number(state.lastUid) || 0);
  if (!state.initialized) {
    return { fire: false, state: { initialized: true, lastUid: maxUid }, note: `Watching the inbox (${withUid.length} messages there now).` };
  }
  const fresh = withUid
    .filter((message) => Number(message.uid) > (Number(state.lastUid) || 0))
    .filter((message) => contains(message.from, config.from) && contains(message.subject, config.subject))
    .sort((a, b) => Number(a.uid) - Number(b.uid));
  const nextState = { initialized: true, lastUid: maxUid };
  if (!fresh.length) return { fire: false, state: nextState };
  const shown = fresh.slice(-MAX_REPORTED);
  const first = shown[0];
  return {
    fire: true,
    state: nextState,
    reason: fresh.length === 1
      ? `New email from ${clip(first.from, 60)}: “${clip(first.subject, 80)}”`
      : `${fresh.length} new emails`,
    details: [
      'New email in the inbox:',
      ...shown.map((message) => `- From ${clip(message.from, 100)} — “${clip(message.subject, 160)}”${message.date ? ` (${clip(message.date, 40)})` : ''}`),
      fresh.length > shown.length ? `…and ${fresh.length - shown.length} more.` : '',
      'Read them with the email tools if your mission needs more than the subject.',
    ].filter(Boolean).join('\n'),
    payload: { emails: shown.map((message) => ({ uid: message.uid, from: message.from, subject: message.subject, date: message.date })) },
  };
}

// ── RSS ───────────────────────────────────────────────────────────────────────

export async function checkRss(config, state, { fetchFeed }) {
  const { feed, items } = await fetchFeed(config.url);
  const seen = new Set(Array.isArray(state.seen) ? state.seen : []);
  const keys = items.map((item) => item.guid || item.url || hash(`${item.title}:${item.publishedAt}`));
  const nextSeen = [...new Set([...keys, ...seen])].slice(0, MAX_SEEN);
  const title = feed?.title || config.url;
  if (!state.initialized) {
    return { fire: false, state: { initialized: true, seen: nextSeen, title }, note: `Watching “${clip(title, 80)}” (${items.length} posts there now).` };
  }
  const fresh = items.filter((item, index) => !seen.has(keys[index]));
  const nextState = { initialized: true, seen: nextSeen, title };
  if (!fresh.length) return { fire: false, state: nextState };
  const shown = fresh.slice(0, MAX_REPORTED);
  return {
    fire: true,
    state: nextState,
    reason: fresh.length === 1 ? `New post on ${clip(title, 50)}: “${clip(shown[0].title, 80)}”` : `${fresh.length} new posts on ${clip(title, 50)}`,
    details: [
      `New posts on ${title}:`,
      ...shown.map((item) => `- ${clip(item.title, 160)}${item.url ? ` — ${item.url}` : ''}${item.summary ? `\n  ${clip(item.summary, 300)}` : ''}`),
      fresh.length > shown.length ? `…and ${fresh.length - shown.length} more.` : '',
    ].filter(Boolean).join('\n'),
    payload: { posts: shown.map((item) => ({ title: item.title, url: item.url })) },
  };
}

// ── Web page ──────────────────────────────────────────────────────────────────

/** The readable text of an HTML page, one line per block. */
export function pageTextLines(html) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(h[1-6]|p|li|div|section|article|main|tr|br|blockquote|pre|td|th|dd|dt)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5000);
}

export async function checkWebpage(config, state, { fetchPage }) {
  const html = await fetchPage(config.url);
  const lines = pageTextLines(html);
  const text = lines.join('\n');
  const digest = hash(text);
  const mentions = config.contains ? contains(text, config.contains) : null;
  const kept = lines.slice(0, MAX_PAGE_LINES);
  const nextState = { initialized: true, hash: digest, lines: kept, mentions };
  if (!state.initialized) {
    return { fire: false, state: nextState, note: `Watching the page (${lines.length} lines of text).` };
  }
  if (config.contains) {
    // Wake when the page starts mentioning the phrase, not on every change.
    if (mentions && !state.mentions) {
      const hit = lines.find((line) => contains(line, config.contains)) || '';
      return {
        fire: true,
        state: nextState,
        reason: `${hostOf(config.url)} now mentions “${clip(config.contains, 60)}”`,
        details: `The page ${config.url} now mentions “${config.contains}”:\n> ${clip(hit, 400)}`,
        payload: { url: config.url, line: clip(hit, 400) },
      };
    }
    return { fire: false, state: nextState };
  }
  if (digest === state.hash) return { fire: false, state: nextState };
  const before = new Set(Array.isArray(state.lines) ? state.lines : []);
  const after = new Set(kept);
  const added = kept.filter((line) => !before.has(line)).slice(0, 15);
  const removed = [...before].filter((line) => !after.has(line)).slice(0, 15);
  return {
    fire: true,
    state: nextState,
    reason: `${hostOf(config.url)} changed`,
    details: [
      `The page ${config.url} changed.`,
      added.length ? `New text:\n${added.map((line) => `+ ${clip(line, 300)}`).join('\n')}` : '',
      removed.length ? `Gone:\n${removed.map((line) => `- ${clip(line, 300)}`).join('\n')}` : '',
      !added.length && !removed.length ? 'The text changed further down the page.' : '',
    ].filter(Boolean).join('\n'),
    payload: { url: config.url, added: added.length, removed: removed.length },
  };
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

// ── Folder ────────────────────────────────────────────────────────────────────

/** { "relative/path": "size:mtime" } for the files in a folder (bounded). */
export async function folderSnapshot(root) {
  const files = {};
  let count = 0;
  const walk = async (dir, depth) => {
    if (depth > MAX_FOLDER_DEPTH || count >= MAX_FOLDER_FILES) return;
    let entries = [];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (count >= MAX_FOLDER_FILES) return;
      if (SKIPPED_FOLDERS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(full);
          files[path.relative(root, full)] = `${stat.size}:${Math.round(stat.mtimeMs)}`;
          count += 1;
        } catch { /* gone meanwhile */ }
      }
    }
  };
  await walk(root, 0);
  return files;
}

export async function checkFolder(config, state, { snapshotFolder = folderSnapshot } = {}) {
  if (!fs.existsSync(config.path)) throw new Error(`The folder ${config.path} is gone.`);
  const files = await snapshotFolder(config.path);
  const nextState = { initialized: true, files };
  if (!state.initialized) {
    return { fire: false, state: nextState, note: `Watching ${Object.keys(files).length} files.` };
  }
  const before = state.files || {};
  const added = Object.keys(files).filter((name) => !(name in before));
  const changed = Object.keys(files).filter((name) => name in before && before[name] !== files[name]);
  const removed = Object.keys(before).filter((name) => !(name in files));
  const total = added.length + changed.length + removed.length;
  if (!total) return { fire: false, state: nextState };
  const list = (label, names) => (names.length ? `${label}: ${names.slice(0, MAX_REPORTED).join(', ')}${names.length > MAX_REPORTED ? ` and ${names.length - MAX_REPORTED} more` : ''}` : '');
  return {
    fire: true,
    state: nextState,
    reason: total === 1
      ? `${added.length ? 'New file' : changed.length ? 'Changed file' : 'Removed file'} in ${path.basename(config.path)}: ${[...added, ...changed, ...removed][0]}`
      : `${total} files changed in ${path.basename(config.path)}`,
    details: [
      `Files changed in ${config.path}:`,
      list('Added', added),
      list('Changed', changed),
      list('Removed', removed),
    ].filter(Boolean).join('\n'),
    payload: { added: added.slice(0, MAX_REPORTED), changed: changed.slice(0, MAX_REPORTED), removed: removed.slice(0, MAX_REPORTED) },
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export const WATCHERS = { email: checkEmail, rss: checkRss, webpage: checkWebpage, folder: checkFolder };

/**
 * Check one watcher. Resolves to { fire, state, reason?, details?, payload?, note? };
 * throws with a message to show when the check itself fails.
 */
export async function checkWatcher(kind, config, state, deps) {
  const watcher = WATCHERS[kind];
  if (!watcher) throw new Error(`Nothing to check for a ${kind} trigger.`);
  return watcher(config || {}, state || {}, deps);
}

/** The real I/O, for the running app. */
export async function defaultWatcherDeps() {
  const [{ listImapMessages, isImapConfigured }, { fetchAndParseFeed }, { agentFetch, checkAgentUrl }] = await Promise.all([
    import('../integrations/mail/mailService.js'),
    import('../integrations/rss/rssService.js'),
    import('../agent/tools/urlPolicy.js'),
  ]);
  return {
    listMail: async (options) => {
      if (!isImapConfigured()) throw new Error('Email isn\'t set up. Add an account in Settings → Connections.');
      return listImapMessages(options);
    },
    fetchFeed: async (url) => {
      // Same address checks as the agent's own web tools.
      const check = await checkAgentUrl(url);
      if (!check.ok) throw new Error(check.reason);
      return fetchAndParseFeed(check.url);
    },
    fetchPage: async (url) => {
      const res = await agentFetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Asyncat',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`The page answered ${res.status} ${res.statusText}`.trim());
      const text = await res.text();
      return text.slice(0, 3_000_000);
    },
    snapshotFolder: folderSnapshot,
  };
}
