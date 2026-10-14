// den/src/cats/catEngine.js
// ─── Waking Cats and running them ────────────────────────────────────────────
// One clock looks every 30 seconds (and when the computer wakes from sleep)
// for Cats with something to do:
//  - a schedule that came round. A run missed by less than 12 hours (Asyncat
//    closed, the computer asleep) is made up once; older ones are skipped;
//  - a watcher due a look (new email or RSS posts, a page or folder that
//    changed; catTriggers.js).
// The user writing in a Cat's chat, or pressing Run now, wakes it at once.
//
// A Cat never runs twice at once: what wakes it meanwhile waits and wakes it
// once more when the run ends (a schedule that comes round meanwhile is
// skipped, as before). At most two Cats work at once; a Cat waiting for the
// user's answer doesn't count.
//
// In a run, the Cat's freedom decides each step that needs an OK: allowed,
// or asked through the inbox (the run pauses, the user is notified, and it
// resumes with the answer, or without the step after a timeout). Daily
// limits are checked before a run and while it works. Every step goes on the
// Cat's timeline; the report goes to its chat and the inbox.

import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { describeSchedule, planDueRun } from '../agent/scheduleMath.js';
import { runInScheduledContext } from '../agent/scheduledRunContext.js';
import { toolRegistry } from '../agent/tools/toolRegistry.js';
import { isHostConnected, onHostEvent, requestFromHost, sendToHost } from '../lib/hostBridge.js';
import { publishAppEvent } from '../lib/appEvents.js';
import { notifyUser } from '../lib/notify.js';
import {
  addMinutes, catBrowserPartition, catError, catRow, cleanAllowedTools, enabledCatCount, hydrateCat, hydrateRun,
  insertCat, limitReached, listCatRows, listRuns, nowIso, ownedCatRow, parseJson, patchCat, removeCat, startOfToday,
  POLL_MINUTES,
} from './catStore.js';
import {
  addTimelineEvent, createInboxItem, expireOrphanedItems, trimTimeline, waitForAnswer,
} from './catInbox.js';
import { checkWatcher, defaultWatcherDeps, folderSnapshot } from './catTriggers.js';

export const TICK_MS = 30_000;
export const MAX_ACTIVE_RUNS = 2;
export const RUN_TIMEOUT_MS = 30 * 60_000; // working time; waiting for the user doesn't count
const RUN_HISTORY_KEEP = 300;
const MAX_PENDING_WAKES = 10;
const MAX_PARALLEL_CHECKS = 4;
const WATCHER_KINDS = ['email', 'rss', 'webpage', 'folder'];
const WAKE_LABELS = {
  schedule: 'Scheduled run',
  email: 'New email',
  rss: 'New post',
  webpage: 'Page changed',
  folder: 'Files changed',
  manual: 'Run now',
  chat: 'Message',
};

const state = {
  runCat: null,
  chat: null,
  deps: null,
  started: false,
  stopped: false,
  timer: null,
  firstTick: null,
  offResume: null,
  running: new Map(), // catId → run entry
  pending: new Map(), // catId → [wake] waiting for the Cat (or a free slot)
  checking: new Set(), // trigger ids being looked at
  lastPublished: null,
};

async function chat() {
  if (!state.chat) state.chat = await import('./catChat.js');
  return state.chat;
}

async function watcherDeps() {
  if (!state.deps) state.deps = await defaultWatcherDeps();
  return state.deps;
}

function hydrate(row) {
  return hydrateCat(row, {
    running: row ? state.running.get(row.id) : null,
    queued: row ? (state.pending.get(row.id) || []).length : 0,
  });
}

function publishCat(catId, userId = null) {
  publishAppEvent('cat.updated', { catId }, { userId });
}

/**
 * Tell the desktop app how many Cats are on, so it keeps running in the tray
 * when its window closes (the message kept its old name).
 */
export function publishState(force = false) {
  let enabled = 0;
  try { enabled = enabledCatCount(); } catch { return; }
  if (!force && enabled === state.lastPublished) return;
  state.lastPublished = enabled;
  sendToHost('scheduled.state', { enabled });
}

function activeCount() {
  let count = 0;
  for (const entry of state.running.values()) if (!entry.waiting) count += 1;
  return count;
}

function firstLine(text, max = 180) {
  const cleaned = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map((line) => line.replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim())
    .find(Boolean) || '';
  return cleaned.length > max ? `${cleaned.slice(0, max - 3).trim()}…` : cleaned;
}

// ── Public API: Cats ──────────────────────────────────────────────────────────

export function listCats(userId) {
  return listCatRows(userId).map(hydrate);
}

export function getCat(userId, id) {
  return hydrate(ownedCatRow(userId, id));
}

/** Create a Cat (catStore.insertCat) with its chat. */
export async function createCat(userId, input = {}, options = {}) {
  const id = insertCat(userId, input, options);
  const cat = getCat(userId, id);
  try {
    const chatModule = await chat();
    await chatModule.ensureCatChat(cat);
  } catch (err) {
    console.warn(`[cats] Couldn't start ${cat.name}'s chat:`, err.message);
  }
  addTimelineEvent(id, null, 'created', options.createdBy === 'agent' ? 'Made in a chat' : 'Made', {}, { userId });
  publishState();
  publishCat(id, userId);
  return getCat(userId, id);
}

export function updateCat(userId, id, patch = {}, options = {}) {
  if (!patchCat(userId, id, patch, options)) return null;
  publishState();
  publishCat(id, userId);
  return getCat(userId, id);
}

export function setCatEnabled(userId, id, enabled) {
  return updateCat(userId, id, { enabled: Boolean(enabled) });
}

/** Delete a Cat: stop it, forget its browser sign-ins. Its chat stays. */
export function deleteCat(userId, id) {
  const row = ownedCatRow(userId, id);
  if (!row) return false;
  cancelCat(userId, id, 'The Cat was deleted.');
  state.pending.delete(id);
  removeCat(userId, id);
  if (isHostConnected('browser')) {
    requestFromHost('browser.clearCat', { partition: catBrowserPartition(id) }, { timeoutMs: 15_000, capability: 'browser' })
      .catch(() => {});
  }
  publishState();
  publishCat(id, userId);
  return true;
}

export function listCatRuns(userId, id, limit = 20) {
  if (!ownedCatRow(userId, id)) return null;
  return listRuns(id, limit);
}

/** Stop a Cat's run. Returns false when it wasn't running. */
export function cancelCat(userId, id, reason = 'Stopped by you.') {
  if (userId && !ownedCatRow(userId, id)) return false;
  const entry = state.running.get(id);
  if (!entry) return false;
  entry.cancelled = reason;
  entry.controller.abort();
  return true;
}

/**
 * Wake a Cat now: with a message (the user wrote in its chat) or without
 * (Run now). Returns { run } when it starts, { queued: true } when it waits.
 */
export async function wakeCatNow(userId, id, { message = null } = {}) {
  const row = ownedCatRow(userId, id);
  if (!row) return null;
  if (!state.runCat) throw catError('Cats are still starting. Try again in a moment.', 503);
  const cat = hydrate(row);
  if (message !== null && message !== undefined) {
    const text = String(message).trim();
    if (!text) throw catError('Write a message.');
    if (text.length > 20_000) throw catError('That message is too long.');
    const chatModule = await chat();
    const { conversationId, messageId } = await chatModule.addUserMessage(cat, text);
    return { ...wake(hydrate(catRow(id)), { kind: 'chat', message: text, messageId, reason: 'You wrote to it' }), conversationId };
  }
  const result = wake(cat, { kind: 'manual', reason: 'You asked it to run now' });
  if (result.skipped) throw catError(result.skipped, 429);
  return result;
}

// ── Waking ────────────────────────────────────────────────────────────────────

function recordSkip(cat, wakeInfo, reason, now = new Date()) {
  const at = now.toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO cat_runs (id, cat_id, trigger_id, trigger_kind, reason, status, scheduled_for, started_at, finished_at, error)
    VALUES (?, ?, ?, ?, ?, 'skipped', ?, ?, ?, ?)
  `).run(id, cat.id, wakeInfo.triggerId || null, wakeInfo.kind || 'manual', wakeInfo.reason || null,
    wakeInfo.scheduledFor ? new Date(wakeInfo.scheduledFor).toISOString() : null, at, at, reason);
  addTimelineEvent(cat.id, id, 'skipped', reason, { wake: wakeInfo.kind || 'manual' }, { userId: cat.userId });
  return id;
}

/** A notice that a daily limit was reached, once a day per Cat. */
function limitNotice(cat, reason) {
  const already = db.prepare(`
    SELECT 1 FROM cat_inbox WHERE cat_id = ? AND kind = 'notice' AND json_extract(data, '$.notice') = 'limit' AND created_at >= ? LIMIT 1
  `).get(cat.id, startOfToday());
  if (already) return;
  createInboxItem({
    userId: cat.userId,
    catId: cat.id,
    kind: 'notice',
    title: `${cat.name} stopped for today`,
    body: `It didn't run because ${reason}. Raise its limits in Freedom, or it carries on tomorrow.`,
    data: { notice: 'limit', notifyEvent: 'failed' },
  });
}

function queuePending(catId, wakeInfo) {
  const list = state.pending.get(catId) || [];
  const same = wakeInfo.triggerId ? list.find((item) => item.triggerId === wakeInfo.triggerId && item.kind === wakeInfo.kind) : null;
  if (same && wakeInfo.kind !== 'chat') {
    same.reason = wakeInfo.reason;
    same.details = [same.details, wakeInfo.details].filter(Boolean).join('\n\n').slice(-12_000);
  } else if (list.length < MAX_PENDING_WAKES) {
    list.push(wakeInfo);
  }
  state.pending.set(catId, list);
}

/** All of a Cat's waiting wakes as one: messages first, then what happened. */
function mergeWakes(list) {
  if (list.length === 1) return list[0];
  const messages = list.filter((item) => item.kind === 'chat');
  const events = list.filter((item) => item.kind !== 'chat');
  if (messages.length) {
    return {
      kind: 'chat',
      message: messages.map((item) => item.message).join('\n\n'),
      messageId: messages.at(-1).messageId,
      reason: 'You wrote to it',
      details: events.length ? `Meanwhile:\n${events.map((item) => `- ${item.reason}`).join('\n')}` : '',
    };
  }
  return {
    ...events[0],
    reason: events.map((item) => item.reason).join('; '),
    details: events.map((item) => item.details).filter(Boolean).join('\n\n').slice(-12_000),
    scheduledFor: events.find((item) => item.scheduledFor)?.scheduledFor || null,
  };
}

/**
 * Wake a Cat for one reason: start a run, or wait. `wakeInfo`: { kind,
 * triggerId, reason, details, payload, scheduledFor, message, messageId }.
 */
function wake(cat, wakeInfo, { now = new Date() } = {}) {
  const info = { label: WAKE_LABELS[wakeInfo.kind] || 'Woke up', ...wakeInfo };
  if (state.running.has(cat.id)) {
    if (info.kind === 'schedule') {
      recordSkip(cat, info, 'Skipped: the last run was still going.', now);
      publishCat(cat.id, cat.userId);
      return { skipped: 'The last run was still going.' };
    }
    queuePending(cat.id, info);
    publishCat(cat.id, cat.userId);
    return { queued: true };
  }
  if (activeCount() >= MAX_ACTIVE_RUNS) {
    queuePending(cat.id, info);
    publishCat(cat.id, cat.userId);
    return { queued: true };
  }
  const run = startRun(cat, info, { now });
  return run ? { run } : { skipped: 'A daily limit was reached.' };
}

/** Start waiting wakes now that a Cat or a slot is free. */
function drainPending() {
  for (const [catId, list] of [...state.pending]) {
    if (activeCount() >= MAX_ACTIVE_RUNS) return;
    if (state.running.has(catId) || !list.length) continue;
    state.pending.delete(catId);
    const row = catRow(catId);
    if (!row) continue;
    startRun(hydrate(row), mergeWakes(list));
  }
}

// ── Running ───────────────────────────────────────────────────────────────────

function activeMsOf(entry, now = Date.now()) {
  const waitingNow = entry.waitingSince ? now - entry.waitingSince : 0;
  return Math.max(0, now - entry.startedAt.getTime() - entry.waitMs - waitingNow);
}

function setRunStatus(runId, status) {
  db.prepare("UPDATE cat_runs SET status = ? WHERE id = ? AND status IN ('running','waiting')").run(status, runId);
}

function startRun(cat, wakeInfo, { now = new Date() } = {}) {
  const reached = limitReached(cat.limits, cat.usageToday);
  if (reached) {
    recordSkip(cat, wakeInfo, `Not run: ${reached}.`, now);
    limitNotice(cat, reached);
    if (wakeInfo.kind === 'chat') {
      chat().then((chatModule) => chatModule.appendToCatChat(cat, chatModule.runMessages(cat, {
        wake: wakeInfo, startedAt: now, finishedAt: new Date(), status: 'failed',
        error: `I've reached a daily limit: ${reached}. Raise it in my Freedom settings, or I'll carry on tomorrow.`,
      }))).catch(() => {});
    }
    publishCat(cat.id, cat.userId);
    return null;
  }

  const runId = randomUUID();
  db.prepare(`
    INSERT INTO cat_runs (id, cat_id, trigger_id, trigger_kind, reason, status, scheduled_for, started_at)
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?)
  `).run(runId, cat.id, wakeInfo.triggerId || null, wakeInfo.kind || 'manual', wakeInfo.reason || null,
    wakeInfo.scheduledFor ? new Date(wakeInfo.scheduledFor).toISOString() : null, now.toISOString());
  db.prepare('UPDATE cats SET last_run_at = ?, run_count = run_count + 1 WHERE id = ?').run(now.toISOString(), cat.id);

  const entry = {
    runId,
    catId: cat.id,
    userId: cat.userId,
    controller: new AbortController(),
    startedAt: now,
    waitMs: 0,
    waitingSince: null,
    waiting: 0,
    cancelled: null,
    timedOut: false,
    limitStop: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    sessionId: null,
    wake: wakeInfo,
  };
  state.running.set(cat.id, entry);
  addTimelineEvent(cat.id, runId, 'woke', wakeInfo.kind === 'chat' ? 'You wrote to it' : wakeInfo.reason || 'Woke up',
    { wake: wakeInfo.kind, trigger: wakeInfo.triggerId || null, payload: wakeInfo.payload || null }, { userId: cat.userId });
  publishCat(cat.id, cat.userId);
  entry.done = executeRun(cat, entry).catch((err) => {
    console.error(`[cats] A run of "${cat.name}" crashed:`, err);
  });
  return hydrateRun(db.prepare('SELECT * FROM cat_runs WHERE id = ?').get(runId));
}

/** Pause the run on an inbox item until the user answers or time runs out. */
async function pauseFor(cat, entry, { kind, title, body, data }) {
  entry.waiting += 1;
  if (entry.waiting === 1) {
    entry.waitingSince = Date.now();
    setRunStatus(entry.runId, 'waiting');
    publishCat(cat.id, cat.userId);
    drainPending(); // a waiting Cat leaves its slot to others
  }
  const timeoutMs = cat.approvalTimeoutMinutes * 60_000;
  const item = createInboxItem({
    userId: cat.userId,
    catId: cat.id,
    runId: entry.runId,
    kind,
    title,
    body,
    data: { ...data, route: `/cats/${cat.id}?inbox=1` },
    expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
  });
  addTimelineEvent(cat.id, entry.runId, 'asked', title, { itemId: item.id, kind }, { userId: cat.userId });
  let result;
  try {
    result = await waitForAnswer(item.id, { timeoutMs, signal: entry.controller.signal });
  } finally {
    entry.waiting -= 1;
    if (entry.waiting === 0 && entry.waitingSince) {
      entry.waitMs += Date.now() - entry.waitingSince;
      entry.waitingSince = null;
      if (!entry.controller.signal.aborted) setRunStatus(entry.runId, 'running');
      publishCat(cat.id, cat.userId);
    }
  }
  const outcome = result.status === 'answered'
    ? (kind === 'approval'
      ? { allow_once: 'You allowed it', allow_always: 'You allowed it from now on', deny: 'You said no' }[result.answer?.decision] || 'Answered'
      : 'You answered')
    : result.status === 'expired' ? 'Nobody answered in time' : 'Not answered';
  addTimelineEvent(cat.id, entry.runId, 'answered', outcome, { itemId: item.id, status: result.status, answer: result.answer || null }, { userId: cat.userId });
  return result;
}

/**
 * Allowed by the Cat's freedom, or ask? Sensitive steps are always asked, and
 * so are commands while the sandbox is on but can't start.
 */
export function freedomAllows(freedom, request) {
  if (request?.sensitive || request?.unsandboxed) return false;
  if (freedom === 'alone') return true;
  if (freedom === 'ask_risky') return request?.permission !== 'dangerous';
  return false;
}

function argsSummary(args) {
  try {
    const text = JSON.stringify(args ?? {});
    return text.length > 600 ? `${text.slice(0, 597)}…` : text;
  } catch {
    return '';
  }
}

async function askPermission(cat, entry, request) {
  if (freedomAllows(cat.freedom, request)) return { decision: 'allow' };
  const what = request.description || request.tool;
  const result = await pauseFor(cat, entry, {
    kind: 'approval',
    title: `${request.sensitive ? 'Sensitive step: ' : ''}${what}`.slice(0, 280),
    body: request.sensitive ? 'A site marked this as sensitive (a payment, password or sending something).'
      : request.sandboxNote || `Tool: ${request.tool}`,
    data: {
      tool: request.tool,
      args: argsSummary(request.args),
      permission: request.permission,
      sensitive: request.sensitive || null,
      unsandboxed: request.unsandboxed || null,
      diff: request.diff ? String(request.diff).slice(0, 4000) : null,
    },
  });
  if (result.status !== 'answered') {
    return {
      decision: 'deny',
      reason: result.status === 'expired'
        ? `Nobody answered within ${cat.approvalTimeoutMinutes} minutes, so this step wasn't done. Carry on without it, or ask again next run.`
        : 'This step was not done (the run is stopping).',
    };
  }
  const { decision, note } = result.answer || {};
  if (decision === 'deny') {
    return { decision: 'deny', reason: note ? `The user said no: ${note}` : 'The user said no to this step.' };
  }
  if (decision === 'allow_always' && !request.sensitive) {
    // From now on this Cat may use the tool without asking.
    const row = catRow(cat.id);
    if (row) {
      const tools = cleanAllowedTools([...parseJson(row.allowed_tools, []), request.tool]);
      db.prepare("UPDATE cats SET allowed_tools = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .run(JSON.stringify(tools), cat.id);
    }
    return { decision: 'allow_always' };
  }
  return { decision: 'allow' };
}

async function askQuestion(cat, entry, request) {
  const choices = Array.isArray(request.choices) ? request.choices : [];
  const fields = Array.isArray(request.fields) ? request.fields : [];
  // The inbox answers in words; a form's fields are listed to fill in.
  const formText = fields.length
    ? `Please answer with:\n${fields.map((field) => `- ${field.label}${field.choices?.length ? ` (${field.choices.join(' / ')})` : ''}`).join('\n')}`
    : '';
  const result = await pauseFor(cat, entry, {
    kind: 'question',
    title: String(request.question || 'A question').slice(0, 280),
    body: [choices.length ? `Choices: ${choices.join(' · ')}` : '', formText].filter(Boolean).join('\n\n'),
    data: { choices, fields, default: request.default ?? null },
  });
  if (result.status === 'answered') return { success: true, answer: result.answer?.answer || '' };
  if (request.default !== null && request.default !== undefined && request.default !== '') {
    return { success: true, answer: String(request.default), note: 'Nobody answered in time; the default was used.' };
  }
  return { success: false, error: 'Nobody answered in time. Carry on with your best judgement and say what you assumed.' };
}

const PAGE_ARG = { preview_navigate: 'url', preview_open_tab: 'url', preview_get_text: 'url', preview_screenshot: 'url', fetch_url: 'url', http_request: 'url' };

/** A timeline step for a tool call: { kind, title }. */
export function describeToolStep(tool, args = {}) {
  const shortPath = (value) => String(value || '').split(/[\\/]/).slice(-3).join('/');
  if (PAGE_ARG[tool] && args?.[PAGE_ARG[tool]]) {
    let shown = args[PAGE_ARG[tool]];
    try { const url = new URL(shown); shown = `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`; } catch { /* keep it */ }
    return { kind: 'page', title: `Opened ${String(shown).slice(0, 120)}` };
  }
  if (tool === 'web_search' || tool === 'search_web') return { kind: 'page', title: `Searched the web for “${String(args.query || '').slice(0, 100)}”` };
  const spec = toolRegistry.get(tool);
  const file = args?.path || args?.file || args?.filename || args?.target_path || null;
  if (spec?.category === 'file' && file) {
    if (spec.permission === 'safe') return { kind: 'tool', title: `Read ${shortPath(file)}` };
    const verb = /delete|remove/.test(tool) ? 'Deleted' : /move|rename/.test(tool) ? 'Moved' : /create|write/.test(tool) ? 'Wrote' : 'Changed';
    return { kind: 'file', title: `${verb} ${shortPath(file)}` };
  }
  if (tool === 'run_command' && args?.command) return { kind: 'tool', title: `Ran \`${String(args.command).slice(0, 100)}\`` };
  if (tool === 'save_memory') return { kind: 'memory', title: `Remembered ${String(args.key || args.content || '').slice(0, 80)}` };
  if (tool === 'mail_send_message') return { kind: 'tool', title: `Sent an email${args?.to ? ` to ${String(args.to).slice(0, 80)}` : ''}` };
  if (spec?.category === 'mcp' && spec.displayName) return { kind: 'tool', title: `Used ${spec.displayName}` };
  return { kind: 'tool', title: `Used ${tool}` };
}

const FAILED_VERBS = {
  Opened: "Couldn't open", Searched: "Couldn't search", Wrote: "Couldn't write", Changed: "Couldn't change",
  Deleted: "Couldn't delete", Moved: "Couldn't move", Ran: "Couldn't run", Read: "Couldn't read",
  Sent: "Couldn't send", Used: "Couldn't use", Remembered: "Couldn't remember",
};

/** "Opened x" → "Couldn't open x", for a step that failed. */
export function failedStepTitle(title) {
  const [verb, ...rest] = String(title).split(' ');
  if (!FAILED_VERBS[verb]) return `Failed: ${title}`;
  return `${FAILED_VERBS[verb]} ${rest.join(' ')}`.trim();
}

function costOf(cat, usage, isLocal) {
  if (isLocal) return 0;
  const price = cat.limits?.pricePerMillion;
  if (!price) return 0;
  const tokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
  return Math.round((tokens / 1_000_000) * price * 10_000) / 10_000;
}

/** Folder watchers learn the Cat's own changes, so it doesn't wake itself. */
async function refreshFolderBaselines(catId) {
  const rows = db.prepare("SELECT * FROM cat_triggers WHERE cat_id = ? AND kind = 'folder' AND enabled = 1").all(catId);
  for (const row of rows) {
    const config = parseJson(row.config, {});
    const prior = parseJson(row.state, {});
    if (!prior.initialized || !config.path) continue;
    try {
      const snapshot = state.deps?.snapshotFolder || folderSnapshot;
      const files = await snapshot(config.path);
      db.prepare('UPDATE cat_triggers SET state = ? WHERE id = ? AND config = ?')
        .run(JSON.stringify({ initialized: true, files }), row.id, row.config);
    } catch { /* checked again on the next look */ }
  }
}

function trimRunHistory(catId) {
  db.prepare(`
    DELETE FROM cat_runs WHERE cat_id = ? AND status NOT IN ('running','waiting') AND id NOT IN (
      SELECT id FROM cat_runs WHERE cat_id = ? ORDER BY started_at DESC LIMIT ?
    )
  `).run(catId, catId, RUN_HISTORY_KEEP);
}

async function executeRun(cat, entry) {
  const wakeInfo = entry.wake;
  const toolCalls = new Map(); // toolCallId → { tool, args }
  const limits = cat.limits || {};
  const usedBefore = cat.usageToday || { tokens: 0, activeMs: 0, costUsd: 0 };

  const watchdog = setInterval(() => {
    const active = activeMsOf(entry);
    if (active > RUN_TIMEOUT_MS) {
      entry.timedOut = true;
      entry.controller.abort();
    } else if (limits.minutesPerDay && usedBefore.activeMs + active > limits.minutesPerDay * 60_000) {
      entry.limitStop = `it reached its ${limits.minutesPerDay} minutes for today`;
      entry.controller.abort();
    }
  }, 1000);
  watchdog.unref?.();

  let status = 'succeeded';
  let answer = null;
  let error = null;
  let chatModule = null;
  let collector = { collect: () => {}, events: [] };
  let isLocal = false;

  const onEvent = (event) => {
    if (!event?.type) return;
    collector.collect(event);
    const data = event.data || {};
    if (event.type === 'session_start' && (data.sessionId || data.id)) entry.sessionId = data.sessionId || data.id;
    // Files were about to change: the run can be undone from its checkpoint.
    if (event.type === 'checkpoint' && data?.id) entry.undoable = true;
    if (event.type === 'usage_update') {
      entry.usage = { inputTokens: Number(data.inputTokens || 0), outputTokens: Number(data.outputTokens || 0) };
      isLocal = Boolean(data.isLocal);
      const tokens = entry.usage.inputTokens + entry.usage.outputTokens;
      if (limits.tokensPerDay && usedBefore.tokens + tokens > limits.tokensPerDay) {
        entry.limitStop = `it reached its ${limits.tokensPerDay.toLocaleString()} tokens for today`;
        entry.controller.abort();
      } else if (limits.costPerDay && limits.pricePerMillion && !isLocal
        && usedBefore.costUsd + costOf(cat, entry.usage, isLocal) > limits.costPerDay) {
        entry.limitStop = `it reached its $${limits.costPerDay.toFixed(2)} for today`;
        entry.controller.abort();
      }
    }
    if (event.type === 'tool_start' && data.tool && data.toolCallId) {
      toolCalls.set(data.toolCallId, { tool: data.tool, args: data.args || {} });
      if (data.tool === 'preview_ask_user') {
        // The Cat waits for the user in its browser (to sign in, say).
        createInboxItem({
          userId: cat.userId,
          catId: cat.id,
          runId: entry.runId,
          kind: 'notice',
          title: `${cat.name} needs you in its browser`,
          body: String(data.args?.message || 'Finish a step in the browser, then press Continue there.').slice(0, 500),
          data: { notice: 'handover', notifyEvent: 'question', route: cat.conversationId ? `/conversations/${cat.conversationId}` : `/cats/${cat.id}` },
        });
      }
    }
    if (event.type === 'tool_result' && data.toolCallId && toolCalls.has(data.toolCallId)) {
      const call = toolCalls.get(data.toolCallId);
      toolCalls.delete(data.toolCallId);
      const step = describeToolStep(call.tool, call.args);
      const ok = data.result?.success !== false && !data.result?.error;
      addTimelineEvent(cat.id, entry.runId, step.kind, ok ? step.title : failedStepTitle(step.title), {
        tool: call.tool,
        args: argsSummary(call.args),
        ok,
        error: ok ? null : String(data.result?.error || '').slice(0, 400) || null,
        sessionId: entry.sessionId,
      }, { userId: cat.userId });
    }
  };

  try {
    try {
      chatModule = await chat();
      collector = chatModule.createEventCollector();
      const conversationHistory = await chatModule.loadCatChatHistory(cat, { skipMessageId: wakeInfo.messageId || null });
      entry.agent = runInScheduledContext({
        catId: cat.id,
        catName: cat.name,
        runId: entry.runId,
        trigger: wakeInfo.kind,
        allowedSites: cat.allowedSites || [],
        browserPartition: cat.browserPartition,
      }, () => state.runCat({
        cat,
        wake: wakeInfo,
        abortSignal: entry.controller.signal,
        conversationHistory,
        onEvent,
        requestPermission: (request) => askPermission(cat, entry, request),
        askUser: (request) => askQuestion(cat, entry, request),
      }));
      const stopped = new Promise((_, reject) => {
        const onAbort = () => reject(Object.assign(new Error('Stopped.'), { name: 'AbortError' }));
        if (entry.controller.signal.aborted) onAbort();
        else entry.controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const result = await Promise.race([entry.agent, stopped]);
      answer = String(result?.answer || '').trim() || 'Done; nothing to report.';
      entry.sessionId = result?.sessionId || entry.sessionId;
      if (result?.usage) entry.usage = { inputTokens: result.usage.inputTokens || 0, outputTokens: result.usage.outputTokens || 0 };
      if (result?.isLocal !== undefined) isLocal = Boolean(result.isLocal);
    } catch (err) {
      entry.sessionId = err?.sessionId || entry.sessionId;
      if (err?.usage) entry.usage = { inputTokens: err.usage.inputTokens || 0, outputTokens: err.usage.outputTokens || 0 };
      if (entry.timedOut) {
        status = 'failed';
        error = `Stopped after ${Math.round(RUN_TIMEOUT_MS / 60_000)} minutes of work without finishing.`;
      } else if (entry.limitStop) {
        status = 'failed';
        error = `Stopped: ${entry.limitStop}.`;
      } else if (entry.cancelled || entry.controller.signal.aborted) {
        status = 'cancelled';
        error = entry.cancelled || 'Stopped.';
      } else {
        status = 'failed';
        error = String(err?.message || err || 'The run failed.').slice(0, 2000);
      }
    } finally {
      clearInterval(watchdog);
    }

    if (state.stopped) return; // the backend is shutting down; stopCatEngine recorded it
    const finishedAt = new Date();
    const activeMs = activeMsOf(entry, finishedAt.getTime());
    db.prepare(`
      UPDATE cat_runs SET status = ?, answer = ?, error = ?, agent_session_id = ?, finished_at = ?,
        input_tokens = ?, output_tokens = ?, cost_usd = ?, active_ms = ?
      WHERE id = ?
    `).run(status, answer, error, entry.sessionId, finishedAt.toISOString(),
      entry.usage.inputTokens, entry.usage.outputTokens, costOf(cat, entry.usage, isLocal), activeMs, entry.runId);

    const fresh = catRow(cat.id);
    if (!fresh) return; // deleted meanwhile
    const freshCat = hydrate(fresh);

    // The report goes to the chat (a stopped run only when the user's
    // message started it, so it isn't left unanswered).
    let conversationId = fresh.conversation_id || null;
    if (chatModule && (status !== 'cancelled' || wakeInfo.kind === 'chat')) {
      try {
        conversationId = await chatModule.appendToCatChat(freshCat, chatModule.runMessages(freshCat, {
          wake: wakeInfo, startedAt: entry.startedAt, finishedAt, status, answer, error,
          sessionId: entry.sessionId, events: collector.events,
        }));
        db.prepare('UPDATE cat_runs SET conversation_id = ? WHERE id = ?').run(conversationId, entry.runId);
      } catch (err) {
        console.warn(`[cats] Couldn't post ${fresh.name}'s report to its chat:`, err.message);
      }
    }

    addTimelineEvent(cat.id, entry.runId, status === 'succeeded' ? 'finished' : status,
      status === 'succeeded' ? (firstLine(answer) || 'Finished') : (error || 'Stopped'),
      { status, tokens: entry.usage.inputTokens + entry.usage.outputTokens, activeMs, sessionId: entry.sessionId, conversationId, undoable: Boolean(entry.undoable) },
      { userId: cat.userId });

    if (status !== 'cancelled') {
      if (wakeInfo.kind === 'chat') {
        // The user is talking to the Cat: a notification only if it took a while.
        if (activeMs > 30_000 || entry.waitMs > 0) {
          notifyUser({
            event: status === 'succeeded' ? 'done' : 'failed',
            title: `${fresh.name} replied`,
            body: firstLine(answer || error),
            route: conversationId ? `/conversations/${conversationId}` : `/cats/${cat.id}`,
          });
        }
      } else {
        createInboxItem({
          userId: cat.userId,
          catId: cat.id,
          runId: entry.runId,
          kind: 'result',
          title: status === 'succeeded' ? (firstLine(answer) || 'Finished') : `Didn't finish: ${firstLine(error)}`,
          body: String(status === 'succeeded' ? answer : error || '').slice(0, 1200),
          data: {
            status,
            conversationId,
            sessionId: entry.sessionId,
            wake: wakeInfo.kind,
            reason: wakeInfo.reason || null,
            notifyEvent: status === 'succeeded' ? 'done' : 'failed',
            route: conversationId ? `/conversations/${conversationId}` : `/cats/${cat.id}`,
          },
        });
      }
    }
    await refreshFolderBaselines(cat.id);
    trimRunHistory(cat.id);
    trimTimeline(cat.id);
  } finally {
    // Held until the agent has really stopped and the report is in the chat,
    // so two runs of a Cat never overlap and the next one sees this one.
    await entry.agent?.catch(() => {});
    if (state.running.get(cat.id) === entry) state.running.delete(cat.id);
    publishCat(cat.id, cat.userId);
    if (!state.stopped) drainPending();
  }
}

// ── Watchers ──────────────────────────────────────────────────────────────────

/** Look at one watcher now. Resolves to what it found. */
export async function checkTrigger(triggerRow, { now = new Date(), wakeOnFire = true } = {}) {
  const config = parseJson(triggerRow.config, {});
  const prior = parseJson(triggerRow.state, {});
  const every = Number(config.everyMinutes) || POLL_MINUTES[triggerRow.kind] || 30;
  try {
    const deps = await watcherDeps();
    const result = await checkWatcher(triggerRow.kind, config, prior, deps);
    // Only if the trigger is still as it was when the look started.
    const updated = db.prepare(`
      UPDATE cat_triggers SET state = ?, last_checked_at = ?, last_error = NULL, next_at = ?,
        last_fired_at = CASE WHEN ? THEN ? ELSE last_fired_at END
      WHERE id = ? AND config = ? AND enabled = 1
    `).run(JSON.stringify(result.state || {}), now.toISOString(), addMinutes(now, every).toISOString(),
      result.fire ? 1 : 0, now.toISOString(), triggerRow.id, triggerRow.config).changes;
    const row = catRow(triggerRow.cat_id);
    if (!updated || !row) return { ...result, fire: false };
    if (result.note && !prior.initialized) {
      addTimelineEvent(row.id, null, 'watching', result.note, { trigger: triggerRow.id, kind: triggerRow.kind }, { userId: row.user_id });
    }
    if (result.fire && wakeOnFire && row.enabled) {
      wake(hydrate(row), {
        kind: triggerRow.kind,
        triggerId: triggerRow.id,
        reason: result.reason,
        details: result.details,
        payload: result.payload || null,
      }, { now });
    }
    publishCat(row.id, row.user_id);
    return result;
  } catch (err) {
    const message = String(err?.message || err).slice(0, 500);
    // Try again later, more slowly while it keeps failing.
    db.prepare('UPDATE cat_triggers SET last_error = ?, last_checked_at = ?, next_at = ? WHERE id = ? AND config = ?')
      .run(message, now.toISOString(), addMinutes(now, Math.max(every, 15)).toISOString(), triggerRow.id, triggerRow.config);
    publishCat(triggerRow.cat_id);
    return { fire: false, error: message };
  }
}

/** "Check now" from the Cats page. */
export async function checkTriggerNow(userId, catId, triggerId) {
  if (!ownedCatRow(userId, catId)) return null;
  const row = db.prepare('SELECT * FROM cat_triggers WHERE id = ? AND cat_id = ?').get(triggerId, catId);
  if (!row) return null;
  if (!WATCHER_KINDS.includes(row.kind)) throw catError('Only watchers can be checked.');
  return checkTrigger(row);
}

// ── The clock ─────────────────────────────────────────────────────────────────

function advanceTrigger(triggerId, next) {
  if (next) {
    db.prepare("UPDATE cat_triggers SET next_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(next.toISOString(), triggerId);
  } else {
    // A one-off time has had its turn.
    db.prepare("UPDATE cat_triggers SET next_at = NULL, enabled = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(triggerId);
  }
}

/**
 * Wake the Cats with something to do. Runs every 30 seconds, on wake from
 * sleep, and from tests with a fixed `now`. Returns the runs it started.
 */
export function tick(now = new Date()) {
  if (!state.runCat || state.stopped) return [];
  const started = [];

  const dueSchedules = db.prepare(`
    SELECT t.*, c.timezone AS cat_timezone FROM cat_triggers t JOIN cats c ON c.id = t.cat_id
    WHERE c.enabled = 1 AND t.enabled = 1 AND t.kind = 'schedule' AND t.next_at IS NOT NULL AND t.next_at <= ?
    ORDER BY t.next_at ASC
  `).all(now.toISOString());
  for (const row of dueSchedules) {
    const config = parseJson(row.config, {});
    const plan = planDueRun({ schedule: config.schedule, timezone: row.cat_timezone, nextRunAt: row.next_at, now });
    if (plan.action === 'wait') continue;
    const cat = hydrate(catRow(row.cat_id));
    const wakeInfo = {
      kind: 'schedule',
      triggerId: row.id,
      reason: describeSchedule(config.schedule),
      scheduledFor: plan.scheduledFor,
      late: Boolean(plan.late),
    };
    if (plan.action === 'skip') {
      recordSkip(cat, wakeInfo, "Missed: Asyncat wasn't running (or the computer was asleep) for more than 12 hours after this was due.", now);
      advanceTrigger(row.id, plan.next);
      continue;
    }
    // With no free slot it waits in line and starts when one frees up.
    advanceTrigger(row.id, plan.next);
    const result = wake(cat, wakeInfo, { now });
    if (result.run) started.push(result.run);
  }

  const dueWatchers = db.prepare(`
    SELECT t.* FROM cat_triggers t JOIN cats c ON c.id = t.cat_id
    WHERE c.enabled = 1 AND t.enabled = 1 AND t.kind IN ('email','rss','webpage','folder')
      AND t.next_at IS NOT NULL AND t.next_at <= ?
    ORDER BY t.next_at ASC
  `).all(now.toISOString());
  for (const row of dueWatchers) {
    if (state.checking.size >= MAX_PARALLEL_CHECKS) break;
    if (state.checking.has(row.id)) continue;
    state.checking.add(row.id);
    checkTrigger(row, { now }).finally(() => state.checking.delete(row.id));
  }

  drainPending();
  if (dueSchedules.length) publishState();
  return started;
}

/** Runs left running by a crash or a forced quit never finished. */
export function recoverInterruptedRuns() {
  return db.prepare(`
    UPDATE cat_runs SET status = 'failed', finished_at = ?, error = 'Asyncat stopped before this run finished.'
    WHERE status IN ('running','waiting')
  `).run(nowIso()).changes;
}

/**
 * Start the clock. `runCat({ cat, wake, abortSignal, conversationHistory,
 * onEvent, requestPermission, askUser })` runs the agent and resolves to
 * { answer, sessionId, usage }. Tests pass `chat` and `deps` fakes.
 */
export function startCatEngine({ runCat, chat: chatModule = null, deps = null, tickMs = TICK_MS, firstTickMs = 15_000, migrate = null } = {}) {
  state.runCat = runCat;
  if (chatModule) state.chat = chatModule;
  if (deps) state.deps = deps;
  if (state.started) return;
  state.started = true;
  state.stopped = false;

  const recovered = recoverInterruptedRuns();
  if (recovered) console.warn(`[cats] Marked ${recovered} interrupted run(s) as failed`);
  expireOrphanedItems();
  if (migrate) {
    try { migrate(); } catch (err) { console.warn('[cats] Could not move scheduled tasks to Cats:', err.message); }
  }

  const safeTick = () => {
    try { tick(); } catch (err) { console.error('[cats] Check failed:', err.message); }
  };
  state.timer = setInterval(safeTick, tickMs);
  state.timer.unref?.();
  // Give the backend (and a local model) a moment before making up missed runs.
  state.firstTick = setTimeout(safeTick, firstTickMs);
  state.firstTick.unref?.();
  state.offResume = onHostEvent('power.resume', safeTick);
  publishState(true);
  console.log('[cats] Started');
}

/** Stop the clock and mark runs in progress as interrupted (backend shutdown). */
export function stopCatEngine() {
  if (!state.started) return;
  state.stopped = true;
  state.started = false;
  clearInterval(state.timer);
  clearTimeout(state.firstTick);
  state.offResume?.();
  state.offResume = null;
  const now = nowIso();
  for (const entry of state.running.values()) {
    entry.cancelled = 'Asyncat was closed while this Cat was working.';
    try {
      db.prepare("UPDATE cat_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ? AND status IN ('running','waiting')")
        .run(now, entry.cancelled, entry.runId);
    } catch { /* the database may already be closed */ }
    entry.controller.abort();
  }
  state.running.clear();
  state.pending.clear();
}

/** For tests: wait for the runs in progress (and the checks) to finish. */
export async function waitForRuns() {
  for (let i = 0; i < 50; i += 1) {
    const runs = [...state.running.values()].map((entry) => entry.done);
    if (!runs.length && !state.checking.size) return;
    await Promise.all(runs);
    if (state.checking.size) await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** For tests: is a Cat's run paused on the user? */
export function runEntry(catId) {
  return state.running.get(catId) || null;
}

export default {
  startCatEngine, stopCatEngine, tick, listCats, getCat, createCat, updateCat, deleteCat, setCatEnabled,
  listCatRuns, cancelCat, wakeCatNow, checkTriggerNow,
};
