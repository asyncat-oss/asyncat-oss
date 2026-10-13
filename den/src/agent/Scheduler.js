// den/src/agent/Scheduler.js
// ─── Scheduled tasks ──────────────────────────────────────────────────────────
// A scheduled task is a prompt the agent runs on a schedule ("Weekdays at
// 8:00, summarise my unread email"). Each task owns a chat where every run's
// prompt and answer land, and a finished run shows a desktop notification.
//
// One clock checks every 30 seconds which tasks are due by comparing their
// next run time with the wall clock, so a computer that slept simply finds
// them due when it wakes (the desktop app also reports waking up, which
// triggers a check at once). A run missed by less than 12 hours is made up
// once; older ones are skipped. A task never runs twice at the same time, and
// at most two tasks run at once.
//
// The date maths is in scheduleMath.js, plain-English schedules in
// scheduleParser.js, the agent run itself in scheduledRunner.js.

import db from '../db/client.js';
import { randomUUID } from 'crypto';
import path from 'path';
import {
  ScheduleError, computeNextRun, describeSchedule, isValidTimeZone, localTimeZone, normalizeSchedule, planDueRun, resolveTimeZone,
} from './scheduleMath.js';
import { parseScheduleText } from './scheduleParser.js';
import { runInScheduledContext } from './scheduledRunContext.js';
import { resolveScheduledProvider } from './scheduledProvider.js';
import { migrateLegacyAutomations } from './scheduledTaskMigration.js';
import { onHostEvent, sendToHost } from '../lib/hostBridge.js';

export const TICK_MS = 30_000;
export const MAX_CONCURRENT_RUNS = 2;
export const RUN_TIMEOUT_MS = 30 * 60_000;
const MAX_ALLOWED_TOOLS = 64;
const RUN_HISTORY_KEEP = 200;

// ── Tables ────────────────────────────────────────────────────────────────────

export function ensureScheduledTaskTables(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      workspace_id        TEXT,
      name                TEXT NOT NULL,
      prompt              TEXT NOT NULL,
      schedule            TEXT NOT NULL DEFAULT '{}',
      timezone            TEXT,
      enabled             INTEGER NOT NULL DEFAULT 1,
      project_id          TEXT,
      profile_id          TEXT,
      provider_profile_id TEXT,
      provider_snapshot   TEXT NOT NULL DEFAULT '{}',
      allowed_tools       TEXT NOT NULL DEFAULT '[]',
      conversation_id     TEXT,
      next_run_at         TEXT,
      last_run_at         TEXT,
      run_count           INTEGER NOT NULL DEFAULT 0,
      created_by          TEXT NOT NULL DEFAULT 'user',
      migrated_from       TEXT UNIQUE,
      created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due ON scheduled_tasks(enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id, created_at);

    CREATE TABLE IF NOT EXISTS scheduled_task_runs (
      id               TEXT PRIMARY KEY,
      task_id          TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
      status           TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','cancelled','skipped')),
      trigger          TEXT NOT NULL DEFAULT 'schedule',
      scheduled_for    TEXT,
      started_at       TEXT NOT NULL,
      finished_at      TEXT,
      answer           TEXT,
      error            TEXT,
      agent_session_id TEXT,
      conversation_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task ON scheduled_task_runs(task_id, started_at DESC);
  `);
}

ensureScheduledTaskTables(db);

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  runTask: null,
  chat: null,
  started: false,
  stopped: false,
  timer: null,
  firstTick: null,
  offResume: null,
  running: new Map(), // taskId → { runId, controller, startedAt, timedOut, cancelled }
  lastPublished: null,
};

function taskError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

// SQLite's datetime('now') gives "YYYY-MM-DD HH:MM:SS" in UTC.
function toIso(value, fallback) {
  if (!value) return fallback;
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? `${text.replace(' ', 'T')}Z` : text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

// A one-off whose time has come and gone (it ran, or was missed) is done.
// Run now doesn't use up its turn.
function isDone(row, schedule, now = new Date()) {
  if (row.enabled || schedule?.kind !== 'once') return false;
  if (new Date(schedule.at).getTime() <= now.getTime()) return true;
  return Boolean(db.prepare(`
    SELECT 1 FROM scheduled_task_runs WHERE task_id = ? AND trigger != 'manual' AND scheduled_for = ? LIMIT 1
  `).get(row.id, schedule.at));
}

async function chat() {
  if (!state.chat) state.chat = await import('./scheduledTaskChat.js');
  return state.chat;
}

// ── Rows ──────────────────────────────────────────────────────────────────────

function taskRow(id) {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) || null;
}

function ownedTaskRow(userId, id) {
  const row = taskRow(id);
  if (!row || (userId && row.user_id !== userId)) return null;
  return row;
}

function hydrateRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    trigger: row.trigger,
    scheduledFor: row.scheduled_for || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
    answer: row.answer || null,
    error: row.error || null,
    agentSessionId: row.agent_session_id || null,
    conversationId: row.conversation_id || null,
  };
}

function defaultWorkspaceId(userId) {
  try {
    return db.prepare('SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1').get(userId)?.id || null;
  } catch {
    return null;
  }
}

function lookupName(table, id) {
  if (!id) return null;
  try {
    return db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id)?.name || null;
  } catch {
    return null;
  }
}

/** A task as the API and the agent tools return it. */
export function hydrateTask(row) {
  if (!row) return null;
  const schedule = parseJson(row.schedule, {});
  const snapshot = parseJson(row.provider_snapshot, {});
  const lastRun = db.prepare(`
    SELECT * FROM scheduled_task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1
  `).get(row.id);
  const running = state.running.get(row.id) || null;
  const enabled = Boolean(row.enabled);
  const done = isDone(row, schedule);
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id || defaultWorkspaceId(row.user_id),
    name: row.name,
    prompt: row.prompt,
    schedule,
    scheduleText: describeSchedule(schedule),
    timezone: row.timezone || null,
    enabled,
    state: enabled ? 'active' : done ? 'done' : 'paused',
    projectId: row.project_id || null,
    projectName: lookupName('projects', row.project_id),
    profileId: row.profile_id || null,
    profileName: lookupName('agent_profiles', row.profile_id),
    providerProfileId: row.provider_profile_id || null,
    providerSnapshot: snapshot,
    model: snapshot?.model
      ? { name: lookupName('ai_provider_profiles', row.provider_profile_id) || snapshot.name || snapshot.provider_id || null, model: snapshot.model }
      : null,
    allowedTools: parseJson(row.allowed_tools, []),
    conversationId: row.conversation_id || null,
    nextRunAt: enabled ? row.next_run_at || null : null,
    lastRunAt: row.last_run_at || null,
    runCount: Number(row.run_count || 0),
    running: Boolean(running) && !running.cancelled && !running.timedOut,
    stopping: Boolean(running?.cancelled || running?.timedOut),
    runningRunId: running?.runId || null,
    lastRun: hydrateRun(lastRun),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Insert a task row as given (used by create and by the migration). */
function insertTaskRow(task) {
  const id = task.id || randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scheduled_tasks (
      id, user_id, workspace_id, name, prompt, schedule, timezone, enabled,
      project_id, profile_id, provider_profile_id, provider_snapshot, allowed_tools,
      conversation_id, next_run_at, last_run_at, run_count, created_by, migrated_from,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    task.userId,
    task.workspaceId || null,
    task.name,
    task.prompt,
    JSON.stringify(task.schedule || {}),
    task.timezone || null,
    task.enabled ? 1 : 0,
    task.projectId || null,
    task.profileId || null,
    task.providerProfileId || null,
    JSON.stringify(task.providerSnapshot || {}),
    JSON.stringify(task.allowedTools || []),
    task.conversationId || null,
    task.enabled ? task.nextRunAt || null : null,
    task.lastRunAt || null,
    Number(task.runCount || 0),
    task.createdBy || 'user',
    task.migratedFrom || null,
    toIso(task.createdAt, now),
    now,
  );
  return id;
}

// ── Validation ────────────────────────────────────────────────────────────────

function cleanName(name, prompt) {
  const given = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (given) return given.slice(0, 120);
  const firstLine = String(prompt || '').split('\n').map((line) => line.trim()).find(Boolean) || 'Scheduled task';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trim()}…` : firstLine;
}

function cleanPrompt(prompt) {
  const text = String(prompt ?? '').trim();
  if (!text) throw taskError('Write what the task should do.');
  if (text.length > 20_000) throw taskError('The prompt is too long (20,000 characters at most).');
  return text;
}

function cleanAllowedTools(tools) {
  if (tools === undefined || tools === null) return [];
  if (!Array.isArray(tools)) throw taskError('Pre-approved tools must be a list of tool names.');
  const names = [...new Set(tools.map((tool) => String(tool || '').trim()).filter(Boolean))];
  if (names.length > MAX_ALLOWED_TOOLS) throw taskError(`Pre-approve ${MAX_ALLOWED_TOOLS} tools at most.`);
  for (const name of names) {
    if (!/^[\w.:-]{1,100}$/.test(name)) throw taskError(`"${name}" isn't a tool name.`);
  }
  return names;
}

function checkTimeZone(timezone) {
  if (timezone === undefined || timezone === null || timezone === '') return localTimeZone();
  if (!isValidTimeZone(String(timezone))) throw taskError(`"${timezone}" isn't a time zone. Use a name like Europe/London.`);
  return String(timezone);
}

function checkProject(userId, projectId) {
  if (!projectId) return null;
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ? AND is_archived = 0').get(projectId, userId);
  if (!project) throw taskError('That project was not found.');
  return project.id;
}

function checkProfile(userId, profileId) {
  if (!profileId) return null;
  const profile = db.prepare('SELECT id FROM agent_profiles WHERE id = ? AND user_id = ?').get(profileId, userId);
  if (!profile) throw taskError('That agent was not found.');
  return profile.id;
}

function resolveScheduleInput(input, { timezone, now, previous = null }) {
  let schedule = input;
  if (typeof input === 'string') {
    schedule = parseScheduleText(input, { now, timezone });
    if (!schedule) {
      throw taskError(`"${input}" isn't a schedule I understand. Try "every weekday at 8:00", "every Monday at 9", "daily 18:00", "every 3 hours" or "tomorrow at 7am".`);
    }
  }
  // Editing an every-N-hours task keeps its rhythm unless the interval changes.
  if (schedule?.kind === 'every_hours' && !schedule.anchor && previous?.kind === 'every_hours'
    && Number(previous.interval) === Number(schedule.interval ?? schedule.hours)) {
    schedule = { ...schedule, anchor: previous.anchor };
  }
  const requireFuture = schedule?.kind === 'once'
    && !(previous?.kind === 'once' && previous.at && (schedule.at === previous.at
      || (schedule.date === previous.date && schedule.time === previous.time)));
  try {
    return normalizeSchedule(schedule, { now, timezone, requireFuture });
  } catch (err) {
    if (err instanceof ScheduleError) throw taskError(err.message);
    throw err;
  }
}

function nextRunFor(schedule, timezone, now) {
  const next = computeNextRun(schedule, now, timezone);
  if (!next) {
    throw taskError(schedule.kind === 'once'
      ? 'That time has already passed. Pick a later one.'
      : 'This schedule never comes round. Check the cron expression.');
  }
  return next.toISOString();
}

// ── Public API: tasks ─────────────────────────────────────────────────────────

export function listTasks(userId) {
  return db.prepare(`
    SELECT * FROM scheduled_tasks WHERE user_id = ?
    ORDER BY enabled DESC, CASE WHEN next_run_at IS NULL THEN 1 ELSE 0 END, next_run_at ASC, created_at DESC
  `).all(userId).map(hydrateTask);
}

export function getTask(userId, id) {
  return hydrateTask(ownedTaskRow(userId, id));
}

/**
 * Create a task. `input`: { name, prompt, schedule (object or plain English),
 * timezone, enabled, projectId, profileId, providerProfileId, allowedTools }.
 */
export function createTask(userId, input = {}, { workspaceId = null, createdBy = 'user', now = new Date() } = {}) {
  if (!userId) throw taskError('Missing user.');
  const prompt = cleanPrompt(input.prompt ?? input.goal);
  const timezone = checkTimeZone(input.timezone);
  const schedule = resolveScheduleInput(input.schedule, { timezone, now });
  const enabled = input.enabled !== false;
  const provider = resolveScheduledProvider(userId, input.providerProfileId || null);
  const id = insertTaskRow({
    userId,
    workspaceId: workspaceId || defaultWorkspaceId(userId),
    name: cleanName(input.name, prompt),
    prompt,
    schedule,
    timezone,
    enabled,
    nextRunAt: enabled ? nextRunFor(schedule, timezone, now) : null,
    projectId: checkProject(userId, input.projectId),
    profileId: checkProfile(userId, input.profileId),
    providerProfileId: provider.providerProfileId,
    providerSnapshot: provider.providerSnapshot,
    allowedTools: cleanAllowedTools(input.allowedTools),
    createdBy,
  });
  publishState();
  return getTask(userId, id);
}

/** Change a task. Only the fields present in `patch` change. */
export function updateTask(userId, id, patch = {}, { now = new Date() } = {}) {
  const row = ownedTaskRow(userId, id);
  if (!row) return null;
  const previousSchedule = parseJson(row.schedule, {});
  const sets = {};

  if (patch.name !== undefined || patch.prompt !== undefined) {
    const prompt = patch.prompt !== undefined ? cleanPrompt(patch.prompt) : row.prompt;
    if (patch.prompt !== undefined) sets.prompt = prompt;
    if (patch.name !== undefined) sets.name = cleanName(patch.name, prompt);
  }
  if (patch.projectId !== undefined) sets.project_id = checkProject(userId, patch.projectId);
  if (patch.profileId !== undefined) sets.profile_id = checkProfile(userId, patch.profileId);
  if (patch.allowedTools !== undefined) sets.allowed_tools = JSON.stringify(cleanAllowedTools(patch.allowedTools));
  if (patch.providerProfileId !== undefined) {
    const provider = resolveScheduledProvider(userId, patch.providerProfileId || null);
    sets.provider_profile_id = provider.providerProfileId;
    sets.provider_snapshot = JSON.stringify(provider.providerSnapshot || {});
  }

  const timezone = patch.timezone !== undefined ? checkTimeZone(patch.timezone) : resolveTimeZone(row.timezone);
  if (patch.timezone !== undefined) sets.timezone = timezone;

  let schedule = previousSchedule;
  let scheduleChanged = false;
  if (patch.schedule !== undefined || (patch.timezone !== undefined && timezone !== row.timezone)) {
    const input = patch.schedule !== undefined
      ? patch.schedule
      : (previousSchedule.kind === 'once' ? { kind: 'once', date: previousSchedule.date, time: previousSchedule.time } : previousSchedule);
    schedule = resolveScheduleInput(input, { timezone, now, previous: previousSchedule });
    scheduleChanged = JSON.stringify(schedule) !== JSON.stringify(previousSchedule);
    sets.schedule = JSON.stringify(schedule);
  }

  const wasEnabled = Boolean(row.enabled);
  const wasDone = isDone(row, previousSchedule, now);
  let enabled = wasEnabled;
  if (patch.enabled !== undefined) enabled = Boolean(patch.enabled);
  // A finished one-off given a new time is scheduled again.
  else if (wasDone && scheduleChanged) enabled = true;

  if (!enabled) {
    sets.enabled = 0;
    sets.next_run_at = null;
  } else if (!wasEnabled || scheduleChanged || timezone !== row.timezone) {
    if (wasDone && !scheduleChanged) throw taskError("This one-time task's time has passed. Pick a new time to run it again.");
    // Resuming computes the next run from now; nothing missed while paused runs.
    sets.enabled = 1;
    sets.next_run_at = nextRunFor(schedule, timezone, now);
  }

  const columns = Object.keys(sets);
  if (columns.length) {
    db.prepare(`
      UPDATE scheduled_tasks SET ${columns.map((column) => `${column} = ?`).join(', ')},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(...columns.map((column) => sets[column]), id);
  }
  publishState();
  return getTask(userId, id);
}

export function setTaskEnabled(userId, id, enabled, options = {}) {
  return updateTask(userId, id, { enabled: Boolean(enabled) }, options);
}

export function deleteTask(userId, id) {
  const row = ownedTaskRow(userId, id);
  if (!row) return false;
  cancelTask(userId, id, 'The task was deleted.');
  db.prepare('DELETE FROM scheduled_task_runs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
  publishState();
  return true;
}

export function listTaskRuns(userId, id, limit = 20) {
  if (!ownedTaskRow(userId, id)) return null;
  const capped = Math.max(1, Math.min(100, Number(limit) || 20));
  return db.prepare('SELECT * FROM scheduled_task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(id, capped).map(hydrateRun);
}

export function enabledTaskCount() {
  return db.prepare('SELECT COUNT(*) AS count FROM scheduled_tasks WHERE enabled = 1').get().count;
}

/** Start a run now, outside the schedule. Returns the new run at once. */
export function runTaskNow(userId, id) {
  const row = ownedTaskRow(userId, id);
  if (!row) return null;
  if (!state.runTask) throw taskError('Scheduled tasks are still starting. Try again in a moment.', 503);
  if (state.running.has(id)) {
    throw taskError(state.running.get(id).cancelled ? 'This task is still stopping. Try again in a moment.' : 'This task is already running.', 409);
  }
  if (state.running.size >= MAX_CONCURRENT_RUNS) {
    throw taskError(`${MAX_CONCURRENT_RUNS} tasks are already running. Try again when one finishes.`, 429);
  }
  return startRun(hydrateTask(row), { trigger: 'manual' });
}

/** Stop a running task. Returns false when it wasn't running. */
export function cancelTask(userId, id, reason = 'Cancelled.') {
  if (userId && !ownedTaskRow(userId, id)) return false;
  const entry = state.running.get(id);
  if (!entry) return false;
  entry.cancelled = reason;
  entry.controller.abort();
  return true;
}

// ── Desktop app ───────────────────────────────────────────────────────────────

/**
 * Tell the desktop app how many tasks are on, so it can keep running in the
 * tray when its window closes.
 */
export function publishState(force = false) {
  let enabled = 0;
  try { enabled = enabledTaskCount(); } catch { return; }
  if (!force && enabled === state.lastPublished) return;
  state.lastPublished = enabled;
  sendToHost('scheduled.state', { enabled });
}

function firstLine(text) {
  const cleaned = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map((line) => line.replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim())
    .find(Boolean) || '';
  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trim()}…` : cleaned;
}

function notifyFinished(task, { status, answer, error, conversationId }) {
  sendToHost('notify', {
    title: task.name,
    body: status === 'succeeded' ? (firstLine(answer) || 'Finished.') : `Didn't finish: ${firstLine(error) || 'something went wrong.'}`,
    route: conversationId ? `/conversations/${conversationId}` : '/scheduled',
  });
}

// ── Running ───────────────────────────────────────────────────────────────────

function recordSkip(task, { scheduledFor, reason, now }) {
  const at = now.toISOString();
  db.prepare(`
    INSERT INTO scheduled_task_runs (id, task_id, status, trigger, scheduled_for, started_at, finished_at, error)
    VALUES (?, ?, 'skipped', 'schedule', ?, ?, ?, ?)
  `).run(randomUUID(), task.id, scheduledFor ? new Date(scheduledFor).toISOString() : null, at, at, reason);
}

function advance(taskId, next) {
  if (next) {
    db.prepare("UPDATE scheduled_tasks SET next_run_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(next.toISOString(), taskId);
  } else {
    // A one-off that has had its turn is done.
    db.prepare("UPDATE scheduled_tasks SET next_run_at = NULL, enabled = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(taskId);
  }
}

function trimRunHistory(taskId) {
  db.prepare(`
    DELETE FROM scheduled_task_runs WHERE task_id = ? AND status != 'running' AND id NOT IN (
      SELECT id FROM scheduled_task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?
    )
  `).run(taskId, taskId, RUN_HISTORY_KEEP);
}

function startRun(task, { trigger = 'schedule', scheduledFor = null } = {}) {
  const runId = randomUUID();
  const startedAt = new Date();
  db.prepare(`
    INSERT INTO scheduled_task_runs (id, task_id, status, trigger, scheduled_for, started_at)
    VALUES (?, ?, 'running', ?, ?, ?)
  `).run(runId, task.id, trigger, scheduledFor ? new Date(scheduledFor).toISOString() : null, startedAt.toISOString());
  db.prepare('UPDATE scheduled_tasks SET last_run_at = ?, run_count = run_count + 1 WHERE id = ?')
    .run(startedAt.toISOString(), task.id);

  const entry = { runId, controller: new AbortController(), startedAt, timedOut: false, cancelled: null };
  state.running.set(task.id, entry);
  entry.done = executeRun(task, entry, { trigger }).catch((err) => {
    console.error(`[scheduler] Run of "${task.name}" crashed:`, err);
  });
  return hydrateRun(db.prepare('SELECT * FROM scheduled_task_runs WHERE id = ?').get(runId));
}

async function executeRun(task, entry, { trigger }) {
  const timeout = setTimeout(() => {
    entry.timedOut = true;
    entry.controller.abort();
  }, RUN_TIMEOUT_MS);
  timeout.unref?.();

  let status = 'succeeded';
  let answer = null;
  let error = null;
  let sessionId = null;
  let chatModule = null;
  let collector = { collect: () => {}, events: [] };

  try {
    try {
      chatModule = await chat();
      collector = chatModule.createEventCollector();
      const conversationHistory = await chatModule.loadTaskChatHistory(task);
      entry.agent = runInScheduledContext({ taskId: task.id, runId: entry.runId, trigger }, () => state.runTask({
        task,
        abortSignal: entry.controller.signal,
        conversationHistory,
        onEvent: collector.collect,
      }));
      // Cancel and time-out take effect at once, even while the agent is
      // waiting on the model; the agent itself stops at its next step.
      const stopped = new Promise((_, reject) => {
        const onAbort = () => reject(Object.assign(new Error('Stopped.'), { name: 'AbortError' }));
        if (entry.controller.signal.aborted) onAbort();
        else entry.controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const result = await Promise.race([entry.agent, stopped]);
      answer = String(result?.answer || '').trim() || 'The task finished without saying anything.';
      sessionId = result?.sessionId || null;
    } catch (err) {
      sessionId = err?.sessionId || null;
      if (entry.timedOut) {
        status = 'failed';
        error = `Stopped after ${Math.round(RUN_TIMEOUT_MS / 60_000)} minutes without finishing.`;
      } else if (entry.cancelled || entry.controller.signal.aborted) {
        status = 'cancelled';
        error = entry.cancelled || 'Cancelled.';
      } else {
        status = 'failed';
        error = String(err?.message || err || 'The run failed.').slice(0, 2000);
      }
    } finally {
      clearTimeout(timeout);
    }

    if (state.stopped) return; // the backend is shutting down; stopScheduler recorded it
    const finishedAt = new Date();
    db.prepare(`
      UPDATE scheduled_task_runs SET status = ?, answer = ?, error = ?, agent_session_id = ?, finished_at = ?
      WHERE id = ?
    `).run(status, answer, error, sessionId, finishedAt.toISOString(), entry.runId);

    const fresh = taskRow(task.id);
    if (!fresh || status === 'cancelled') return; // deleted meanwhile, or stopped by the user

    let conversationId = fresh.conversation_id || null;
    if (chatModule) {
      try {
        conversationId = await chatModule.appendRunToTaskChat(hydrateTask(fresh), {
          startedAt: entry.startedAt, finishedAt, status, answer, error, sessionId, events: collector.events,
        });
        db.prepare('UPDATE scheduled_tasks SET conversation_id = ? WHERE id = ?').run(conversationId, task.id);
        db.prepare('UPDATE scheduled_task_runs SET conversation_id = ? WHERE id = ?').run(conversationId, entry.runId);
      } catch (err) {
        console.warn(`[scheduler] Couldn't save the result of "${fresh.name}" to its chat:`, err.message);
      }
    }
    trimRunHistory(task.id);
    notifyFinished(hydrateTask(fresh), { status, answer, error, conversationId });
  } finally {
    // Held until the agent has really stopped and the answer is in the chat,
    // so two runs of a task never overlap and the next run sees this one.
    await entry.agent?.catch(() => {});
    if (state.running.get(task.id) === entry) state.running.delete(task.id);
  }
}

/**
 * Look for due tasks and start or skip them. Runs every 30 seconds, on wake
 * from sleep, and from tests with a fixed `now`. Returns the started runs.
 */
export function tick(now = new Date()) {
  if (!state.runTask || state.stopped) return [];
  const due = db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
    ORDER BY next_run_at ASC
  `).all(now.toISOString());

  const started = [];
  for (const row of due) {
    const task = hydrateTask(row);
    const plan = planDueRun({ schedule: task.schedule, timezone: task.timezone, nextRunAt: row.next_run_at, now });
    if (plan.action === 'wait') continue;
    if (plan.action === 'skip') {
      recordSkip(task, { scheduledFor: plan.scheduledFor, now, reason: "Missed: Asyncat wasn't running (or the computer was asleep) for more than 12 hours after this run was due." });
      advance(task.id, plan.next);
      continue;
    }
    if (state.running.has(task.id)) {
      recordSkip(task, { scheduledFor: plan.scheduledFor, now, reason: 'Skipped: the previous run was still going.' });
      advance(task.id, plan.next);
      continue;
    }
    if (state.running.size >= MAX_CONCURRENT_RUNS) continue; // waits for a free slot
    advance(task.id, plan.next);
    started.push(startRun(task, { trigger: plan.late ? 'catch_up' : 'schedule', scheduledFor: plan.scheduledFor }));
  }
  if (due.length) publishState();
  return started;
}

/** Runs left "running" by a crash or a forced quit never finished. */
export function recoverInterruptedRuns() {
  const now = new Date().toISOString();
  return db.prepare(`
    UPDATE scheduled_task_runs
    SET status = 'failed', finished_at = ?, error = 'Asyncat stopped before this run finished.'
    WHERE status = 'running'
  `).run(now).changes;
}

function projectForFolder(folder, userId) {
  try {
    const wanted = path.resolve(folder);
    const rows = db.prepare(`
      SELECT pf.project_id, pf.path FROM project_folders pf
      JOIN projects p ON p.id = pf.project_id
      WHERE p.owner_id = ? AND p.is_archived = 0
    `).all(userId);
    return rows.find((row) => path.resolve(row.path) === wanted)?.project_id || null;
  } catch {
    return null;
  }
}

function profileTools(profileId) {
  try {
    const row = db.prepare('SELECT always_allowed_tools FROM agent_profiles WHERE id = ?').get(profileId);
    return cleanAllowedTools(parseJson(row?.always_allowed_tools, []));
  } catch {
    return [];
  }
}

/** Copy old schedules and workflows into tasks (once; see scheduledTaskMigration.js). */
export function migrateLegacyData(now = new Date()) {
  return migrateLegacyAutomations(db, { now, insertTask: insertTaskRow, projectForFolder, profileTools });
}

/**
 * Start the clock. `runTask({ task, abortSignal, conversationHistory, onEvent })`
 * runs the agent and resolves to { answer, sessionId }.
 */
export function startScheduler({ runTask, chat: chatModule = null, tickMs = TICK_MS, firstTickMs = 15_000 } = {}) {
  state.runTask = runTask;
  if (chatModule) state.chat = chatModule;
  if (state.started) return;
  state.started = true;
  state.stopped = false;

  const recovered = recoverInterruptedRuns();
  if (recovered) console.warn(`[scheduler] Marked ${recovered} interrupted run(s) as failed`);
  try {
    const migrated = migrateLegacyData();
    if (migrated.jobs || migrated.workflows) {
      console.log(`[scheduler] Moved ${migrated.jobs} schedule(s) and ${migrated.workflows} workflow(s) to scheduled tasks`);
    }
  } catch (err) {
    console.warn('[scheduler] Could not move old schedules and workflows:', err.message);
  }

  const safeTick = () => {
    try { tick(); } catch (err) { console.error('[scheduler] Check failed:', err.message); }
  };
  state.timer = setInterval(safeTick, tickMs);
  state.timer.unref?.();
  // Give the backend (and a local model) a moment before making up missed runs.
  state.firstTick = setTimeout(safeTick, firstTickMs);
  state.firstTick.unref?.();
  state.offResume = onHostEvent('power.resume', safeTick);
  publishState(true);
  console.log('[scheduler] Started');
}

/** Stop the clock and mark running tasks as interrupted (backend shutdown). */
export function stopScheduler() {
  if (!state.started) return;
  state.stopped = true;
  state.started = false;
  clearInterval(state.timer);
  clearTimeout(state.firstTick);
  state.offResume?.();
  state.offResume = null;
  const now = new Date().toISOString();
  for (const entry of state.running.values()) {
    entry.cancelled = 'Asyncat was closed while this task was running.';
    try {
      db.prepare("UPDATE scheduled_task_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ? AND status = 'running'")
        .run(now, entry.cancelled, entry.runId);
    } catch { /* the database may already be closed */ }
    entry.controller.abort();
  }
  state.running.clear();
}

/** For tests: wait for the runs in progress to finish. */
export async function waitForRuns() {
  await Promise.all([...state.running.values()].map((entry) => entry.done));
}

export default {
  startScheduler, stopScheduler, tick, listTasks, getTask, createTask, updateTask, deleteTask,
  setTaskEnabled, listTaskRuns, runTaskNow, cancelTask, enabledTaskCount,
};
