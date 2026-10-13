// den/src/cats/catInbox.js
// ─── What Cats did, and what they ask ────────────────────────────────────────
// Two records:
//  - the timeline (cat_events): every step a Cat took in a run, pages it
//    visited, files it changed, what woke it and how the run ended;
//  - the inbox (cat_inbox): what needs the user — approvals and questions a
//    run is paused on, results to review, notices (a daily limit reached).
//
// Inbox items reach the user through channels. Today that is the app itself
// (the Cats page, live over /api/events) and desktop notifications; another
// channel (a phone app, a chat service) can be added with
// registerInboxChannel and answer through answerInboxItem like the app does.

import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { publishAppEvent } from '../lib/appEvents.js';
import { notifyUser } from '../lib/notify.js';
import { catError, defaultWorkspaceId, nowIso, parseJson } from './catStore.js';

const MAX_TITLE = 300;
const MAX_BODY = 4000;
const TIMELINE_KEEP = 2000;

// ── Timeline ──────────────────────────────────────────────────────────────────

function hydrateEvent(row) {
  return {
    id: row.id,
    catId: row.cat_id,
    runId: row.run_id || null,
    kind: row.kind,
    title: row.title,
    detail: parseJson(row.detail, {}),
    createdAt: row.created_at,
  };
}

/** Add a step to a Cat's timeline. */
export function addTimelineEvent(catId, runId, kind, title, detail = {}, { userId = null } = {}) {
  const id = randomUUID();
  let detailJson = '{}';
  try { detailJson = JSON.stringify(detail || {}).slice(0, 20_000); } catch { /* keep {} */ }
  db.prepare(`
    INSERT INTO cat_events (id, cat_id, run_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, catId, runId || null, String(kind), String(title || '').slice(0, MAX_TITLE), detailJson, nowIso());
  publishAppEvent('cat.timeline', { catId, runId: runId || null, kind }, { userId });
  return id;
}

export function trimTimeline(catId) {
  db.prepare(`
    DELETE FROM cat_events WHERE cat_id = ? AND id NOT IN (
      SELECT id FROM cat_events WHERE cat_id = ? ORDER BY created_at DESC LIMIT ?
    )
  `).run(catId, catId, TIMELINE_KEEP);
}

export function listTimeline(catId, { limit = 100, before = null, runId = null } = {}) {
  const capped = Math.max(1, Math.min(500, Number(limit) || 100));
  const clauses = ['cat_id = ?'];
  const params = [catId];
  if (runId) { clauses.push('run_id = ?'); params.push(runId); }
  if (before) { clauses.push('created_at < ?'); params.push(before); }
  return db.prepare(`SELECT * FROM cat_events WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, capped).map(hydrateEvent);
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

const channels = new Map();

/**
 * Add a way for inbox items to reach the user. `deliver(item, cat)` is
 * called for each new item; it must not throw.
 */
export function registerInboxChannel(name, channel) {
  if (!channel || typeof channel.deliver !== 'function') throw new Error('A channel needs a deliver(item, cat) function.');
  channels.set(name, channel);
  return () => channels.delete(name);
}

const NOTIFY_EVENT_FOR = { approval: 'approval', question: 'question', result: 'done', notice: 'failed' };

registerInboxChannel('desktop', {
  deliver(item, cat) {
    if (item.data?.silent) return;
    const name = cat?.name || 'A Cat';
    const route = `/cats/${item.catId}${item.kind === 'result' && item.data?.conversationId ? '' : '?inbox=1'}`;
    notifyUser({
      event: item.data?.notifyEvent || NOTIFY_EVENT_FOR[item.kind] || 'done',
      title: item.kind === 'approval'
        ? `${name} wants your OK`
        : item.kind === 'question' ? `${name} has a question` : name,
      body: item.title + (item.body && item.kind !== 'result' ? ` — ${item.body}` : ''),
      route: item.data?.route || route,
    });
  },
});

export function hydrateInboxItem(row, catNames = null) {
  if (!row) return null;
  return {
    id: row.id,
    catId: row.cat_id,
    catName: catNames?.get(row.cat_id) || null,
    runId: row.run_id || null,
    kind: row.kind,
    title: row.title,
    body: row.body || '',
    data: parseJson(row.data, {}),
    status: row.status,
    answer: parseJson(row.answer, null),
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    answeredAt: row.answered_at || null,
  };
}

function catBasics(catId) {
  return db.prepare('SELECT id, name, avatar, user_id, workspace_id FROM cats WHERE id = ?').get(catId) || null;
}

/** Put an item in the inbox and send it through the channels. */
export function createInboxItem({ userId, catId, runId = null, kind, title, body = '', data = {}, expiresAt = null }) {
  const cat = catBasics(catId);
  if (!cat) throw catError('That Cat was not found.', 404);
  const id = randomUUID();
  db.prepare(`
    INSERT INTO cat_inbox (id, user_id, cat_id, run_id, kind, title, body, data, status, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(
    id, userId || cat.user_id, catId, runId, kind,
    String(title || '').slice(0, MAX_TITLE), String(body || '').slice(0, MAX_BODY),
    JSON.stringify(data || {}), expiresAt, nowIso(),
  );
  const item = getInboxItem(userId || cat.user_id, id);
  publishAppEvent('cat.inbox', { catId, itemId: id, kind, status: 'open' }, { userId: cat.user_id });
  for (const [name, channel] of channels) {
    try {
      channel.deliver(item, cat);
    } catch (err) {
      console.warn(`[cats] The ${name} channel failed to deliver an inbox item:`, err.message);
    }
  }
  return item;
}

export function getInboxItem(userId, id) {
  const row = db.prepare('SELECT * FROM cat_inbox WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  return hydrateInboxItem(row, new Map([[row.cat_id, catBasics(row.cat_id)?.name || null]]));
}

export function listInbox(userId, { status = 'open', catId = null, kinds = null, limit = 100 } = {}) {
  const clauses = ['user_id = ?'];
  const params = [userId];
  if (status && status !== 'all') { clauses.push('status = ?'); params.push(status); }
  if (catId) { clauses.push('cat_id = ?'); params.push(catId); }
  if (Array.isArray(kinds) && kinds.length) {
    clauses.push(`kind IN (${kinds.map(() => '?').join(',')})`);
    params.push(...kinds);
  }
  const capped = Math.max(1, Math.min(500, Number(limit) || 100));
  const rows = db.prepare(`SELECT * FROM cat_inbox WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`).all(...params, capped);
  const names = new Map(db.prepare('SELECT id, name FROM cats WHERE user_id = ?').all(userId).map((cat) => [cat.id, cat.name]));
  return rows.map((row) => hydrateInboxItem(row, names));
}

/** Open items per kind, for the sidebar badge. */
export function inboxCounts(userId) {
  const rows = db.prepare(`
    SELECT kind, COUNT(*) AS count FROM cat_inbox WHERE user_id = ? AND status = 'open' GROUP BY kind
  `).all(userId);
  const counts = { approval: 0, question: 0, result: 0, notice: 0 };
  for (const row of rows) counts[row.kind] = Number(row.count || 0);
  return { ...counts, waiting: counts.approval + counts.question, total: rows.reduce((sum, row) => sum + Number(row.count || 0), 0) };
}

// Runs paused on an item wait here for its answer.
const waiters = new Map(); // item id → { resolve, timer }

function closeItem(id, status, answer = null) {
  const row = db.prepare('SELECT * FROM cat_inbox WHERE id = ?').get(id);
  if (!row || row.status !== 'open') return false;
  db.prepare('UPDATE cat_inbox SET status = ?, answer = ?, answered_at = ? WHERE id = ? AND status = \'open\'')
    .run(status, answer === null ? null : JSON.stringify(answer), nowIso(), id);
  publishAppEvent('cat.inbox', { catId: row.cat_id, itemId: id, kind: row.kind, status }, { userId: row.user_id });
  return true;
}

/**
 * Wait for the answer to an approval or question. Resolves to
 * { status: 'answered', answer } or { status: 'expired' | 'dismissed' }.
 */
export function waitForAnswer(itemId, { timeoutMs, signal = null } = {}) {
  return new Promise((resolve) => {
    const finish = (result) => {
      const waiter = waiters.get(itemId);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      waiters.delete(itemId);
      signal?.removeEventListener?.('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => {
      closeItem(itemId, 'dismissed');
      finish({ status: 'dismissed' });
    };
    const timer = setTimeout(() => {
      closeItem(itemId, 'expired');
      finish({ status: 'expired' });
    }, Math.max(1000, Number(timeoutMs) || 60_000));
    timer.unref?.();
    waiters.set(itemId, { resolve: finish, timer });
    if (signal?.aborted) onAbort();
    else signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

const APPROVAL_DECISIONS = new Set(['allow_once', 'allow_always', 'deny']);

/**
 * Answer an inbox item. Approvals: { decision: 'allow_once' | 'allow_always'
 * | 'deny', note }. Questions: { answer }. Results and notices: {} marks them
 * done. Returns the item.
 */
export function answerInboxItem(userId, id, input = {}) {
  const row = db.prepare('SELECT * FROM cat_inbox WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw catError('That inbox item was not found.', 404);
  if (row.status !== 'open') throw catError(row.status === 'expired' ? 'Too late: the Cat stopped waiting for this.' : 'This was already answered.', 409);

  let answer = {};
  if (row.kind === 'approval') {
    const decision = String(input.decision || '');
    if (!APPROVAL_DECISIONS.has(decision)) throw catError('Answer with allow_once, allow_always or deny.');
    answer = { decision, note: input.note ? String(input.note).slice(0, 1000) : null };
  } else if (row.kind === 'question') {
    const text = String(input.answer ?? '').trim();
    if (!text) throw catError('Write an answer.');
    answer = { answer: text.slice(0, 4000) };
  }
  const status = row.kind === 'approval' || row.kind === 'question' ? 'answered' : 'done';
  closeItem(id, status, answer);
  waiters.get(id)?.resolve({ status: 'answered', answer });
  return getInboxItem(userId, id);
}

export function dismissInboxItem(userId, id) {
  const row = db.prepare('SELECT * FROM cat_inbox WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw catError('That inbox item was not found.', 404);
  if (row.status !== 'open') return getInboxItem(userId, id);
  closeItem(id, row.kind === 'approval' || row.kind === 'question' ? 'dismissed' : 'done');
  waiters.get(id)?.resolve({ status: 'dismissed' });
  return getInboxItem(userId, id);
}

/** Mark every open result and notice as read. */
export function markAllRead(userId, { catId = null } = {}) {
  const rows = db.prepare(`
    SELECT id FROM cat_inbox WHERE user_id = ? AND status = 'open' AND kind IN ('result','notice') ${catId ? 'AND cat_id = ?' : ''}
  `).all(...(catId ? [userId, catId] : [userId]));
  for (const row of rows) closeItem(row.id, 'done');
  return rows.length;
}

/** Items a stopped backend left open can't be answered any more. */
export function expireOrphanedItems() {
  const rows = db.prepare(`
    SELECT id FROM cat_inbox WHERE status = 'open' AND kind IN ('approval','question')
  `).all();
  for (const row of rows) {
    if (!waiters.has(row.id)) closeItem(row.id, 'expired');
  }
  return rows.length;
}

/** Results of a run still waiting for review are done once it's reviewed. */
export function closeRunResults(runId) {
  const rows = db.prepare(`SELECT id FROM cat_inbox WHERE run_id = ? AND kind = 'result' AND status = 'open'`).all(runId);
  for (const row of rows) closeItem(row.id, 'done');
}

// ── Feedback ──────────────────────────────────────────────────────────────────

/**
 * 👍 / 👎 and "next time…" on a run. Saved on the run, and as a feedback
 * memory the Cat reads at the start of its next runs.
 */
export function recordRunFeedback(userId, runId, { rating = null, note = '' } = {}) {
  const run = db.prepare(`
    SELECT r.*, c.user_id, c.workspace_id, c.name AS cat_name FROM cat_runs r JOIN cats c ON c.id = r.cat_id
    WHERE r.id = ? AND c.user_id = ?
  `).get(runId, userId);
  if (!run) throw catError('That run was not found.', 404);
  if (rating !== null && rating !== 'up' && rating !== 'down') throw catError('Rate a run up or down.');
  const text = String(note || '').trim().slice(0, 2000);
  if (!rating && !text) throw catError('Rate the run or say what to do next time.');
  const reviewedAt = nowIso();
  db.prepare('UPDATE cat_runs SET feedback = COALESCE(?, feedback), feedback_note = COALESCE(?, feedback_note), reviewed_at = ? WHERE id = ?')
    .run(rating, text || null, reviewedAt, runId);

  const when = new Date(run.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const what = run.reason ? ` (${run.reason})` : '';
  const verdict = rating === 'up' ? 'liked' : rating === 'down' ? "didn't like" : 'reviewed';
  const content = [
    `The user ${verdict} the result of the run on ${when}${what}.`,
    text ? `Next time: ${text}` : '',
  ].filter(Boolean).join(' ');
  const workspaceId = run.workspace_id || defaultWorkspaceId(userId);
  if (workspaceId) {
    const key = `cat_feedback_${runId}`;
    db.prepare(`DELETE FROM agent_memory WHERE user_id = ? AND key = ? AND cat_id = ?`).run(userId, key, run.cat_id);
    db.prepare(`
      INSERT INTO agent_memory (id, user_id, workspace_id, memory_type, key, content, tags, importance, profile_id, project_id, cat_id, source)
      VALUES (?, ?, ?, 'feedback', ?, ?, ?, ?, NULL, NULL, ?, 'user')
    `).run(randomUUID(), userId, workspaceId, key, content, JSON.stringify(['cat-feedback', rating || 'note']), text ? 0.9 : 0.7, run.cat_id);
  }
  closeRunResults(runId);
  addTimelineEvent(run.cat_id, runId, 'feedback', rating === 'up' ? 'You liked this' : rating === 'down' ? "You didn't like this" : 'You left a note', { rating, note: text || null }, { userId });
  publishAppEvent('cat.updated', { catId: run.cat_id }, { userId });
  return { runId, rating, note: text || null, reviewedAt, memory: content };
}
