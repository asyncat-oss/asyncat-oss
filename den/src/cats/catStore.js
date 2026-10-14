// den/src/cats/catStore.js
// ─── Cats: agents that work on their own ─────────────────────────────────────
// A Cat has a name, a picture and a mission in plain words. It uses one of
// the user's agents as its brain (that agent's instructions, files and model)
// and wakes up when something happens: a time comes round, an email or RSS
// item arrives, a web page or a folder changes, or the user writes to it in
// its chat.
//
// Each Cat has a space of its own: a working folder, a browser profile (its
// logins aren't shared with other Cats), its own memories and, optionally, a
// project it shares with the user. Its freedom setting says how much it may
// do without asking, how much it may use in a day, and which sites it may
// visit.
//
// This module holds the tables and their rows. catEngine.js wakes Cats and
// runs them; catInbox.js keeps their timeline and what they ask.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { runtimeDataPath } from '../config/runtimeConfig.js';
import {
  ScheduleError, computeNextRun, describeSchedule, isValidTimeZone, localTimeZone, normalizeSchedule, resolveTimeZone,
} from '../agent/scheduleMath.js';
import { parseScheduleText } from '../agent/scheduleParser.js';
import { resolveScheduledProvider } from '../agent/scheduledProvider.js';
import { cleanSite, siteAllowed } from './catSites.js';

export { cleanSite, siteAllowed };

export const FREEDOM_LEVELS = ['ask_first', 'ask_risky', 'alone'];
export const TRIGGER_KINDS = ['schedule', 'email', 'rss', 'webpage', 'folder', 'chat'];
export const FOLDER_MODES = ['own', 'project', 'custom'];
export const DEFAULT_AVATAR = '🐱';
const MAX_ALLOWED_TOOLS = 64;
const MAX_SITES = 50;
const MAX_TRIGGERS = 12;
const MAX_AVATAR_CHARS = 400_000; // a small picture as a data: URL
export const POLL_MINUTES = { email: 5, rss: 30, webpage: 60, folder: 1 };
const MIN_POLL_MINUTES = { email: 2, rss: 10, webpage: 15, folder: 1 };

// ── Tables ────────────────────────────────────────────────────────────────────

export function ensureCatTables(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cats (
      id                       TEXT PRIMARY KEY,
      user_id                  TEXT NOT NULL,
      workspace_id             TEXT,
      name                     TEXT NOT NULL,
      avatar                   TEXT NOT NULL DEFAULT '${DEFAULT_AVATAR}',
      mission                  TEXT NOT NULL,
      profile_id               TEXT,
      provider_profile_id      TEXT,
      provider_snapshot        TEXT NOT NULL DEFAULT '{}',
      project_id               TEXT,
      folder_mode              TEXT NOT NULL DEFAULT 'own',
      folder                   TEXT,
      freedom                  TEXT NOT NULL DEFAULT 'ask_risky'
                                 CHECK (freedom IN ('ask_first','ask_risky','alone')),
      limits                   TEXT NOT NULL DEFAULT '{}',
      allowed_sites            TEXT NOT NULL DEFAULT '[]',
      allowed_tools            TEXT NOT NULL DEFAULT '[]',
      connectors               TEXT,
      approval_timeout_minutes INTEGER NOT NULL DEFAULT 120,
      timezone                 TEXT,
      enabled                  INTEGER NOT NULL DEFAULT 1,
      conversation_id          TEXT,
      last_run_at              TEXT,
      run_count                INTEGER NOT NULL DEFAULT 0,
      created_by               TEXT NOT NULL DEFAULT 'user',
      migrated_from            TEXT UNIQUE,
      created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cats_user ON cats(user_id, created_at);

    CREATE TABLE IF NOT EXISTS cat_triggers (
      id              TEXT PRIMARY KEY,
      cat_id          TEXT NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL CHECK (kind IN ('schedule','email','rss','webpage','folder','chat')),
      config          TEXT NOT NULL DEFAULT '{}',
      state           TEXT NOT NULL DEFAULT '{}',
      enabled         INTEGER NOT NULL DEFAULT 1,
      next_at         TEXT,
      last_fired_at   TEXT,
      last_checked_at TEXT,
      last_error      TEXT,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cat_triggers_due ON cat_triggers(enabled, next_at);
    CREATE INDEX IF NOT EXISTS idx_cat_triggers_cat ON cat_triggers(cat_id);

    CREATE TABLE IF NOT EXISTS cat_runs (
      id               TEXT PRIMARY KEY,
      cat_id           TEXT NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
      trigger_id       TEXT,
      trigger_kind     TEXT NOT NULL DEFAULT 'manual',
      reason           TEXT,
      status           TEXT NOT NULL CHECK (status IN ('running','waiting','succeeded','failed','cancelled','skipped')),
      scheduled_for    TEXT,
      started_at       TEXT NOT NULL,
      finished_at      TEXT,
      answer           TEXT,
      error            TEXT,
      agent_session_id TEXT,
      conversation_id  TEXT,
      input_tokens     INTEGER NOT NULL DEFAULT 0,
      output_tokens    INTEGER NOT NULL DEFAULT 0,
      cost_usd         REAL NOT NULL DEFAULT 0,
      active_ms        INTEGER NOT NULL DEFAULT 0,
      feedback         TEXT,
      feedback_note    TEXT,
      reviewed_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cat_runs_cat ON cat_runs(cat_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS cat_events (
      id         TEXT PRIMARY KEY,
      cat_id     TEXT NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
      run_id     TEXT,
      kind       TEXT NOT NULL,
      title      TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cat_events_cat ON cat_events(cat_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cat_events_run ON cat_events(run_id, created_at);

    CREATE TABLE IF NOT EXISTS cat_inbox (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      cat_id      TEXT NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
      run_id      TEXT,
      kind        TEXT NOT NULL CHECK (kind IN ('approval','question','result','notice')),
      title       TEXT NOT NULL,
      body        TEXT,
      data        TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','done','expired','dismissed')),
      answer      TEXT,
      expires_at  TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      answered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cat_inbox_open ON cat_inbox(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cat_inbox_cat ON cat_inbox(cat_id, created_at DESC);
  `);
}

ensureCatTables(db);

// ── Small helpers ─────────────────────────────────────────────────────────────

export function catError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

export function nowIso() {
  return new Date().toISOString();
}

function lookupName(table, id) {
  if (!id) return null;
  try {
    return db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id)?.name || null;
  } catch {
    return null;
  }
}

/** Whether a Cat's brain (its agent, else the default agent) has a model of its own. */
function brainHasModel(row) {
  try {
    const brain = row.profile_id
      ? db.prepare('SELECT model_profile_id FROM agent_profiles WHERE id = ? AND user_id = ?').get(row.profile_id, row.user_id)
      : db.prepare('SELECT model_profile_id FROM agent_profiles WHERE user_id = ? AND is_default = 1 LIMIT 1').get(row.user_id);
    return Boolean(brain?.model_profile_id);
  } catch {
    return false;
  }
}

export function defaultWorkspaceId(userId) {
  try {
    return db.prepare('SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1').get(userId)?.id || null;
  } catch {
    return null;
  }
}

/** The folder a Cat gets when it has none of its own yet. */
export function defaultCatFolder(catId) {
  return runtimeDataPath('cats', catId);
}

/** The browser session partition that keeps a Cat's logins its own. */
export function catBrowserPartition(catId) {
  return `persist:asyncat-cat-${String(catId).replace(/[^A-Za-z0-9-]/g, '')}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

function cleanName(name, mission) {
  const given = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (given) return given.slice(0, 80);
  const firstLine = String(mission || '').split('\n').map((line) => line.trim()).find(Boolean) || 'New Cat';
  return firstLine.length > 40 ? `${firstLine.slice(0, 37).trim()}…` : firstLine;
}

function cleanMission(mission) {
  const text = String(mission ?? '').trim();
  if (!text) throw catError('Write the Cat\'s mission: what it should look after.');
  if (text.length > 20_000) throw catError('The mission is too long (20,000 characters at most).');
  return text;
}

function cleanAvatar(avatar) {
  const value = String(avatar ?? '').trim();
  if (!value) return DEFAULT_AVATAR;
  if (value.startsWith('data:image/')) {
    if (value.length > MAX_AVATAR_CHARS) throw catError('That picture is too big. Use one under 300 KB.');
    if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) throw catError('The picture must be a PNG, JPEG, WebP or GIF.');
    return value;
  }
  return [...value].slice(0, 4).join('');
}

export function cleanAllowedTools(tools) {
  if (tools === undefined || tools === null) return [];
  if (!Array.isArray(tools)) throw catError('Always-allowed tools must be a list of tool names.');
  const names = [...new Set(tools.map((tool) => String(tool || '').trim()).filter(Boolean))];
  if (names.length > MAX_ALLOWED_TOOLS) throw catError(`Allow ${MAX_ALLOWED_TOOLS} tools at most.`);
  for (const name of names) {
    if (!/^[\w.:-]{1,100}$/.test(name)) throw catError(`"${name}" isn't a tool name.`);
  }
  return names;
}

/** The connectors a Cat may use: a list of names, or null for its brain's choice. */
export function cleanConnectors(connectors) {
  if (connectors === undefined || connectors === null) return null;
  if (!Array.isArray(connectors)) throw catError('Connectors must be a list of connector names.');
  return [...new Set(connectors.map((name) => String(name || '').trim()).filter(Boolean))].slice(0, 100);
}

export function cleanSites(sites) {
  if (sites === undefined || sites === null) return [];
  if (!Array.isArray(sites)) throw catError('Allowed sites must be a list.');
  const cleaned = [];
  for (const site of sites) {
    const host = cleanSite(site);
    if (!host) throw catError(`"${site}" isn't a site. Write it like example.com.`);
    if (!cleaned.includes(host)) cleaned.push(host);
  }
  if (cleaned.length > MAX_SITES) throw catError(`List ${MAX_SITES} sites at most.`);
  return cleaned;
}

function limitNumber(value, { max, integer = true } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw catError('Limits must be positive numbers.');
  if (max && n > max) throw catError(`A limit can be ${max.toLocaleString()} at most.`);
  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

/** { runsPerDay, tokensPerDay, minutesPerDay, costPerDay, pricePerMillion }; null = no limit. */
export function cleanLimits(limits = {}) {
  const input = limits && typeof limits === 'object' ? limits : {};
  return {
    runsPerDay: limitNumber(input.runsPerDay, { max: 1000 }),
    tokensPerDay: limitNumber(input.tokensPerDay, { max: 1_000_000_000 }),
    minutesPerDay: limitNumber(input.minutesPerDay, { max: 1440 }),
    costPerDay: limitNumber(input.costPerDay, { max: 10_000, integer: false }),
    pricePerMillion: limitNumber(input.pricePerMillion, { max: 10_000, integer: false }),
  };
}

function checkTimeZone(timezone) {
  if (timezone === undefined || timezone === null || timezone === '') return localTimeZone();
  if (!isValidTimeZone(String(timezone))) throw catError(`"${timezone}" isn't a time zone. Use a name like Europe/London.`);
  return String(timezone);
}

function checkProject(userId, projectId) {
  if (!projectId) return null;
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ? AND is_archived = 0').get(projectId, userId);
  if (!project) throw catError('That project was not found.');
  return project.id;
}

function checkProfile(userId, profileId) {
  if (!profileId) return null;
  const profile = db.prepare('SELECT id FROM agent_profiles WHERE id = ? AND user_id = ?').get(profileId, userId);
  if (!profile) throw catError('That agent was not found.');
  return profile.id;
}

function checkFolder(mode, folder) {
  if (!FOLDER_MODES.includes(mode)) throw catError('Choose the Cat\'s own folder, its project\'s folder or another folder.');
  if (mode !== 'custom') return null;
  const value = String(folder || '').trim();
  if (!value || !path.isAbsolute(value)) throw catError('Pick the folder the Cat works in.');
  let stat;
  try { stat = fs.statSync(value); } catch { throw catError(`The folder ${value} doesn't exist.`); }
  if (!stat.isDirectory()) throw catError(`${value} isn't a folder.`);
  return path.resolve(value);
}

export function resolveScheduleInput(input, { timezone, now, previous = null }) {
  let schedule = input;
  if (typeof input === 'string') {
    schedule = parseScheduleText(input, { now, timezone });
    if (!schedule) {
      throw catError(`"${input}" isn't a schedule I understand. Try "every weekday at 8:00", "every Monday at 9", "daily 18:00", "every 3 hours" or "tomorrow at 7am".`);
    }
  }
  // Editing an every-N-hours timer keeps its rhythm unless the interval changes.
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
    if (err instanceof ScheduleError) throw catError(err.message);
    throw err;
  }
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function pollMinutes(kind, value) {
  const n = Number(value);
  const fallback = POLL_MINUTES[kind] || 30;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(MIN_POLL_MINUTES[kind] || 1, Math.min(24 * 60, Math.round(n)));
}

function containsFilter(value, max = 200) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

/**
 * A trigger's config, checked, and when it next needs looking at.
 * Returns { config, nextAt } (nextAt null: only events wake it).
 */
export function normalizeTrigger(kind, config = {}, { timezone, now = new Date(), previous = null } = {}) {
  if (!TRIGGER_KINDS.includes(kind)) throw catError(`"${kind}" isn't something that can wake a Cat.`);
  const input = config && typeof config === 'object' ? config : {};
  switch (kind) {
    case 'schedule': {
      const schedule = resolveScheduleInput(input.schedule ?? input.text ?? input, {
        timezone, now, previous: previous?.schedule || null,
      });
      const next = computeNextRun(schedule, now, timezone);
      if (!next && schedule.kind !== 'once') throw catError('This schedule never comes round. Check the cron expression.');
      return { config: { schedule }, nextAt: next ? next.toISOString() : null };
    }
    case 'email': {
      const normalized = {
        from: containsFilter(input.from),
        subject: containsFilter(input.subject),
        everyMinutes: pollMinutes('email', input.everyMinutes),
      };
      return { config: normalized, nextAt: now.toISOString() };
    }
    case 'rss': {
      const url = String(input.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw catError('Give the RSS feed\'s address, starting with https://');
      return { config: { url: url.slice(0, 2000), everyMinutes: pollMinutes('rss', input.everyMinutes) }, nextAt: now.toISOString() };
    }
    case 'webpage': {
      const url = String(input.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw catError('Give the page\'s address, starting with https://');
      return {
        config: {
          url: url.slice(0, 2000),
          contains: containsFilter(input.contains),
          everyMinutes: pollMinutes('webpage', input.everyMinutes),
        },
        nextAt: now.toISOString(),
      };
    }
    case 'folder': {
      const folder = String(input.path || '').trim();
      if (!folder || !path.isAbsolute(folder)) throw catError('Pick the folder to watch.');
      let stat;
      try { stat = fs.statSync(folder); } catch { throw catError(`The folder ${folder} doesn't exist.`); }
      if (!stat.isDirectory()) throw catError(`${folder} isn't a folder.`);
      return { config: { path: path.resolve(folder), everyMinutes: pollMinutes('folder', input.everyMinutes) }, nextAt: now.toISOString() };
    }
    case 'chat':
    default:
      return { config: {}, nextAt: null };
  }
}

/** Words for a trigger, as the Cats page shows it. */
export function describeTrigger(kind, config = {}) {
  switch (kind) {
    case 'schedule': return describeSchedule(config.schedule);
    case 'email': {
      const parts = ['New email'];
      if (config.from) parts.push(`from “${config.from}”`);
      if (config.subject) parts.push(`about “${config.subject}”`);
      return parts.join(' ');
    }
    case 'rss': {
      let host = config.url;
      try { host = new URL(config.url).hostname; } catch { /* keep the url */ }
      return `New post on ${host}`;
    }
    case 'webpage': {
      let host = config.url;
      try { host = new URL(config.url).hostname; } catch { /* keep the url */ }
      return config.contains ? `${host} mentions “${config.contains}”` : `${host} changes`;
    }
    case 'folder': return `Files change in ${path.basename(config.path || '') || config.path}`;
    case 'chat': return 'You write to it';
    default: return kind;
  }
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export function catRow(id) {
  return db.prepare('SELECT * FROM cats WHERE id = ?').get(id) || null;
}

export function ownedCatRow(userId, id) {
  const row = catRow(id);
  if (!row || (userId && row.user_id !== userId)) return null;
  return row;
}

export function triggerRows(catId) {
  return db.prepare('SELECT * FROM cat_triggers WHERE cat_id = ? ORDER BY created_at ASC').all(catId);
}

export function hydrateTrigger(row) {
  if (!row) return null;
  const config = parseJson(row.config, {});
  return {
    id: row.id,
    catId: row.cat_id,
    kind: row.kind,
    config,
    text: describeTrigger(row.kind, config),
    enabled: Boolean(row.enabled),
    nextAt: row.next_at || null,
    lastFiredAt: row.last_fired_at || null,
    lastCheckedAt: row.last_checked_at || null,
    lastError: row.last_error || null,
  };
}

export function hydrateRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    catId: row.cat_id,
    triggerId: row.trigger_id || null,
    triggerKind: row.trigger_kind,
    reason: row.reason || null,
    status: row.status,
    scheduledFor: row.scheduled_for || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
    answer: row.answer || null,
    error: row.error || null,
    agentSessionId: row.agent_session_id || null,
    conversationId: row.conversation_id || null,
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    costUsd: Number(row.cost_usd || 0),
    activeMs: Number(row.active_ms || 0),
    feedback: row.feedback || null,
    feedbackNote: row.feedback_note || null,
    reviewedAt: row.reviewed_at || null,
  };
}

/** Where a Cat works: its own folder, its project's folder or one it was given. */
export function resolveCatFolder(row) {
  if (row.folder_mode === 'custom' && row.folder) return row.folder;
  if (row.folder_mode === 'project' && row.project_id) {
    try {
      const folder = db.prepare(`
        SELECT path FROM project_folders WHERE project_id = ? ORDER BY is_primary DESC, created_at ASC LIMIT 1
      `).get(row.project_id);
      if (folder?.path) return folder.path;
    } catch { /* fall back to its own */ }
  }
  return row.folder || defaultCatFolder(row.id);
}

/** Start of today on this computer, for daily limits. */
export function startOfToday(now = new Date()) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.toISOString();
}

/** What a Cat has used today: runs, tokens, active minutes and cost. */
export function usageToday(catId, now = new Date()) {
  const row = db.prepare(`
    SELECT COUNT(*) AS runs,
           COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
           COALESCE(SUM(active_ms), 0) AS active_ms,
           COALESCE(SUM(cost_usd), 0) AS cost
    FROM cat_runs
    WHERE cat_id = ? AND status != 'skipped' AND started_at >= ?
  `).get(catId, startOfToday(now));
  return {
    runs: Number(row?.runs || 0),
    tokens: Number(row?.tokens || 0),
    minutes: Math.round(Number(row?.active_ms || 0) / 60_000),
    activeMs: Number(row?.active_ms || 0),
    costUsd: Math.round(Number(row?.cost || 0) * 10_000) / 10_000,
  };
}

/** Which daily limit is used up, as a sentence, or null. */
export function limitReached(limits = {}, usage = {}) {
  if (limits.runsPerDay !== null && limits.runsPerDay !== undefined && usage.runs >= limits.runsPerDay) {
    return `it has used its ${limits.runsPerDay} run${limits.runsPerDay === 1 ? '' : 's'} for today`;
  }
  if (limits.tokensPerDay && usage.tokens >= limits.tokensPerDay) {
    return `it has used its ${limits.tokensPerDay.toLocaleString()} tokens for today`;
  }
  if (limits.minutesPerDay && usage.activeMs >= limits.minutesPerDay * 60_000) {
    return `it has worked its ${limits.minutesPerDay} minutes for today`;
  }
  if (limits.costPerDay && limits.pricePerMillion && usage.costUsd >= limits.costPerDay) {
    return `it has spent its $${limits.costPerDay.toFixed(2)} for today`;
  }
  return null;
}

/** A Cat as the API, the Cats page and the agent tools see it. */
export function hydrateCat(row, { running = null, queued = 0, includeRuns = true } = {}) {
  if (!row) return null;
  const snapshot = parseJson(row.provider_snapshot, {});
  const triggers = triggerRows(row.id).map(hydrateTrigger);
  const enabled = Boolean(row.enabled);
  const scheduleTimes = triggers
    .filter((trigger) => trigger.enabled && trigger.kind === 'schedule' && trigger.nextAt)
    .map((trigger) => trigger.nextAt)
    .sort();
  const lastRun = includeRuns
    ? hydrateRun(db.prepare('SELECT * FROM cat_runs WHERE cat_id = ? ORDER BY started_at DESC LIMIT 1').get(row.id))
    : null;
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'open' AND kind IN ('approval','question') THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN status = 'open' AND kind IN ('result','notice') THEN 1 ELSE 0 END) AS unread
    FROM cat_inbox WHERE cat_id = ?
  `).get(row.id);
  const limits = cleanLimits(parseJson(row.limits, {}));
  const usage = usageToday(row.id);
  const isRunning = Boolean(running) && !running.cancelled && !running.timedOut;
  const waiting = Number(counts?.waiting || 0);
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id || defaultWorkspaceId(row.user_id),
    name: row.name,
    avatar: row.avatar || DEFAULT_AVATAR,
    mission: row.mission,
    profileId: row.profile_id || null,
    profileName: lookupName('agent_profiles', row.profile_id),
    providerProfileId: row.provider_profile_id || null,
    providerSnapshot: snapshot,
    model: snapshot?.model
      ? { name: lookupName('ai_provider_profiles', row.provider_profile_id) || snapshot.name || snapshot.provider_id || null, model: snapshot.model }
      : null,
    // Whose model it runs on: its own, its brain's, or the default model.
    modelSource: row.provider_profile_id || snapshot?.model ? 'own' : brainHasModel(row) ? 'brain' : 'default',
    projectId: row.project_id || null,
    projectName: lookupName('projects', row.project_id),
    folderMode: row.folder_mode || 'own',
    folder: resolveCatFolder(row),
    browserPartition: catBrowserPartition(row.id),
    freedom: row.freedom,
    limits,
    allowedSites: parseJson(row.allowed_sites, []),
    allowedTools: parseJson(row.allowed_tools, []),
    connectors: row.connectors === null || row.connectors === undefined ? null : parseJson(row.connectors, []),
    approvalTimeoutMinutes: Number(row.approval_timeout_minutes || 120),
    timezone: row.timezone || null,
    enabled,
    state: !enabled ? 'paused' : waiting > 0 && isRunning ? 'waiting' : isRunning ? 'running' : 'active',
    running: isRunning,
    queued: Number(queued || 0),
    stopping: Boolean(running?.cancelled || running?.timedOut),
    runningRunId: running?.runId || null,
    conversationId: row.conversation_id || null,
    triggers,
    nextWakeAt: enabled ? scheduleTimes[0] || null : null,
    lastRun,
    lastRunAt: row.last_run_at || null,
    runCount: Number(row.run_count || 0),
    waiting,
    unread: Number(counts?.unread || 0),
    usageToday: usage,
    limitReached: enabled ? limitReached(limits, usage) : null,
    createdBy: row.created_by,
    migratedFrom: row.migrated_from || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Writes ────────────────────────────────────────────────────────────────────

function insertTriggers(catId, triggers, { timezone, now }) {
  const insert = db.prepare(`
    INSERT INTO cat_triggers (id, cat_id, kind, config, state, enabled, next_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const trigger of triggers) {
    // Moved over as they were (catMigration.js): no checks, same times.
    const { config, nextAt } = trigger.trusted
      ? { config: trigger.config || {}, nextAt: trigger.nextAt ?? null }
      : normalizeTrigger(trigger.kind, trigger.config, { timezone, now });
    const enabled = trigger.enabled !== false;
    insert.run(trigger.id || randomUUID(), catId, trigger.kind, JSON.stringify(config), JSON.stringify(trigger.state || {}), enabled ? 1 : 0, enabled ? (trigger.nextAt ?? nextAt) : null);
  }
}

function checkTriggerList(triggers) {
  if (triggers === undefined) return undefined;
  if (!Array.isArray(triggers)) throw catError('Triggers must be a list.');
  if (triggers.length > MAX_TRIGGERS) throw catError(`A Cat can have ${MAX_TRIGGERS} wake-ups at most.`);
  if (triggers.filter((trigger) => trigger?.kind === 'chat').length > 1) throw catError('A Cat has one chat.');
  return triggers.map((trigger) => {
    if (!trigger || !TRIGGER_KINDS.includes(trigger.kind)) throw catError(`"${trigger?.kind}" isn't something that can wake a Cat.`);
    return trigger;
  });
}

/**
 * Create a Cat. `input`: { name, avatar, mission, profileId, providerProfileId,
 * projectId, folderMode, folder, freedom, limits, allowedSites, allowedTools,
 * connectors, approvalTimeoutMinutes, timezone, enabled, triggers: [{ kind, config }] }.
 * Every Cat can be written to in its chat, so a chat trigger is always added.
 */
export function insertCat(userId, input = {}, { workspaceId = null, createdBy = 'user', now = new Date(), migratedFrom = null, keepTimes = false } = {}) {
  if (!userId) throw catError('Missing user.');
  const mission = cleanMission(input.mission ?? input.prompt);
  const timezone = checkTimeZone(input.timezone);
  const freedom = input.freedom === undefined ? 'ask_risky' : String(input.freedom);
  if (!FREEDOM_LEVELS.includes(freedom)) throw catError('Freedom is "ask_first", "ask_risky" or "alone".');
  const folderMode = input.folderMode || (input.folder ? 'custom' : 'own');
  const projectId = checkProject(userId, input.projectId);
  if (folderMode === 'project' && !projectId) throw catError('Pick the project whose folder the Cat uses.');
  const folder = checkFolder(folderMode, input.folder);
  const triggers = checkTriggerList(input.triggers) || [];
  // The model: one picked for the Cat, else its brain's, else the default
  // model (chatModel.js), followed as the default changes.
  let provider = { providerProfileId: null, providerSnapshot: {} };
  if (keepTimes && (input.providerProfileId || input.providerSnapshot)) {
    provider = { providerProfileId: input.providerProfileId || null, providerSnapshot: input.providerSnapshot || {} };
  } else if (input.providerProfileId) {
    provider = resolveScheduledProvider(userId, input.providerProfileId);
  }
  const timeout = Number(input.approvalTimeoutMinutes ?? 120);
  const id = input.id || randomUUID();
  const created = keepTimes && input.createdAt ? input.createdAt : now.toISOString();

  const write = db.transaction(() => {
    db.prepare(`
      INSERT INTO cats (
        id, user_id, workspace_id, name, avatar, mission, profile_id, provider_profile_id, provider_snapshot,
        project_id, folder_mode, folder, freedom, limits, allowed_sites, allowed_tools, connectors,
        approval_timeout_minutes, timezone, enabled, conversation_id, last_run_at, run_count, created_by,
        migrated_from, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      workspaceId || input.workspaceId || defaultWorkspaceId(userId),
      cleanName(input.name, mission),
      cleanAvatar(input.avatar),
      mission,
      checkProfile(userId, input.profileId),
      provider.providerProfileId,
      JSON.stringify(provider.providerSnapshot || {}),
      projectId,
      folderMode,
      folder,
      freedom,
      JSON.stringify(cleanLimits(input.limits)),
      JSON.stringify(cleanSites(input.allowedSites)),
      JSON.stringify(cleanAllowedTools(input.allowedTools)),
      input.connectors === undefined || input.connectors === null ? null : JSON.stringify(cleanConnectors(input.connectors)),
      Number.isFinite(timeout) ? Math.max(5, Math.min(7 * 24 * 60, Math.round(timeout))) : 120,
      timezone,
      input.enabled === false ? 0 : 1,
      input.conversationId || null,
      keepTimes ? input.lastRunAt || null : null,
      keepTimes ? Number(input.runCount || 0) : 0,
      createdBy,
      migratedFrom,
      created,
      now.toISOString(),
    );
    const withChat = triggers.some((trigger) => trigger.kind === 'chat') ? triggers : [...triggers, { kind: 'chat' }];
    insertTriggers(id, withChat, { timezone, now });
  });
  write();
  return id;
}

/**
 * Change a Cat. Only the fields present in `patch` change. `triggers` replaces
 * the list; a trigger sent with its id keeps its place and what it has seen.
 */
export function patchCat(userId, id, patch = {}, { now = new Date() } = {}) {
  const row = ownedCatRow(userId, id);
  if (!row) return false;
  const sets = {};

  if (patch.name !== undefined || patch.mission !== undefined) {
    const mission = patch.mission !== undefined ? cleanMission(patch.mission) : row.mission;
    if (patch.mission !== undefined) sets.mission = mission;
    if (patch.name !== undefined) sets.name = cleanName(patch.name, mission);
  }
  if (patch.avatar !== undefined) sets.avatar = cleanAvatar(patch.avatar);
  if (patch.profileId !== undefined) sets.profile_id = checkProfile(userId, patch.profileId);
  if (patch.providerProfileId !== undefined) {
    if (patch.providerProfileId) {
      const provider = resolveScheduledProvider(userId, patch.providerProfileId);
      sets.provider_profile_id = provider.providerProfileId;
      sets.provider_snapshot = JSON.stringify(provider.providerSnapshot || {});
    } else {
      // No model of its own: the brain's model, else the default model.
      sets.provider_profile_id = null;
      sets.provider_snapshot = '{}';
    }
  }
  const projectId = patch.projectId !== undefined ? checkProject(userId, patch.projectId) : row.project_id;
  if (patch.projectId !== undefined) sets.project_id = projectId;
  if (patch.folderMode !== undefined || patch.folder !== undefined) {
    const mode = patch.folderMode ?? row.folder_mode;
    if (mode === 'project' && !projectId) throw catError('Pick the project whose folder the Cat uses.');
    sets.folder_mode = mode;
    sets.folder = checkFolder(mode, patch.folder ?? row.folder);
  }
  if (patch.freedom !== undefined) {
    if (!FREEDOM_LEVELS.includes(patch.freedom)) throw catError('Freedom is "ask_first", "ask_risky" or "alone".');
    sets.freedom = patch.freedom;
  }
  if (patch.limits !== undefined) sets.limits = JSON.stringify(cleanLimits(patch.limits));
  if (patch.allowedSites !== undefined) sets.allowed_sites = JSON.stringify(cleanSites(patch.allowedSites));
  if (patch.allowedTools !== undefined) sets.allowed_tools = JSON.stringify(cleanAllowedTools(patch.allowedTools));
  if (patch.connectors !== undefined) sets.connectors = patch.connectors === null ? null : JSON.stringify(cleanConnectors(patch.connectors));
  if (patch.approvalTimeoutMinutes !== undefined) {
    const timeout = Number(patch.approvalTimeoutMinutes);
    if (!Number.isFinite(timeout)) throw catError('The time to wait for an answer must be a number of minutes.');
    sets.approval_timeout_minutes = Math.max(5, Math.min(7 * 24 * 60, Math.round(timeout)));
  }
  const timezone = patch.timezone !== undefined ? checkTimeZone(patch.timezone) : resolveTimeZone(row.timezone);
  if (patch.timezone !== undefined) sets.timezone = timezone;
  if (patch.enabled !== undefined) sets.enabled = patch.enabled ? 1 : 0;

  const triggers = checkTriggerList(patch.triggers);
  const write = db.transaction(() => {
    const columns = Object.keys(sets);
    if (columns.length) {
      db.prepare(`
        UPDATE cats SET ${columns.map((column) => `${column} = ?`).join(', ')},
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(...columns.map((column) => sets[column]), id);
    }
    if (triggers) {
      const existing = new Map(triggerRows(id).map((trigger) => [trigger.id, trigger]));
      const keep = new Set();
      const withChat = triggers.some((trigger) => trigger.kind === 'chat') ? triggers : [...triggers, { kind: 'chat' }];
      for (const trigger of withChat) {
        const old = trigger.id ? existing.get(trigger.id) : null;
        if (old && old.kind === trigger.kind) {
          keep.add(old.id);
          const previous = parseJson(old.config, {});
          const changed = trigger.config !== undefined && JSON.stringify(trigger.config) !== JSON.stringify(previous);
          const { config, nextAt } = changed || timezone !== row.timezone
            ? normalizeTrigger(trigger.kind, trigger.config ?? previous, { timezone, now, previous })
            : { config: previous, nextAt: old.next_at };
          const enabled = trigger.enabled === undefined ? Boolean(old.enabled) : trigger.enabled !== false;
          // A watcher given a new address or folder starts over: it learns
          // what is there now and wakes on the next change.
          const state = changed && trigger.kind !== 'schedule' ? '{}' : old.state;
          const reEnabled = enabled && !old.enabled;
          db.prepare(`
            UPDATE cat_triggers SET config = ?, state = ?, enabled = ?, next_at = ?, last_error = CASE WHEN ? THEN NULL ELSE last_error END,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?
          `).run(
            JSON.stringify(config),
            state,
            enabled ? 1 : 0,
            enabled ? (changed || reEnabled ? nextAt ?? normalizeTrigger(trigger.kind, config, { timezone, now }).nextAt : old.next_at) : null,
            changed ? 1 : 0,
            old.id,
          );
        } else {
          insertTriggers(id, [trigger], { timezone, now });
        }
      }
      for (const oldId of existing.keys()) {
        if (!keep.has(oldId)) db.prepare('DELETE FROM cat_triggers WHERE id = ?').run(oldId);
      }
    }
    // Turning a Cat back on: its timers count from now; nothing missed while
    // it was paused runs.
    if (patch.enabled === true && !row.enabled) {
      for (const trigger of triggerRows(id)) {
        if (!trigger.enabled) continue;
        const config = parseJson(trigger.config, {});
        const nextAt = trigger.kind === 'schedule'
          ? computeNextRun(config.schedule, now, timezone)?.toISOString() || null
          : normalizeTrigger(trigger.kind, config, { timezone, now }).nextAt;
        db.prepare('UPDATE cat_triggers SET next_at = ? WHERE id = ?').run(nextAt, trigger.id);
      }
    }
  });
  write();
  return true;
}

export function removeCat(userId, id) {
  const row = ownedCatRow(userId, id);
  if (!row) return false;
  db.transaction(() => {
    db.prepare('DELETE FROM cat_inbox WHERE cat_id = ?').run(id);
    db.prepare('DELETE FROM cat_events WHERE cat_id = ?').run(id);
    db.prepare('DELETE FROM cat_runs WHERE cat_id = ?').run(id);
    db.prepare('DELETE FROM cat_triggers WHERE cat_id = ?').run(id);
    db.prepare('DELETE FROM cats WHERE id = ?').run(id);
  })();
  return true;
}

export function listCatRows(userId) {
  return db.prepare('SELECT * FROM cats WHERE user_id = ? ORDER BY enabled DESC, created_at ASC').all(userId);
}

export function enabledCatCount() {
  return db.prepare('SELECT COUNT(*) AS count FROM cats WHERE enabled = 1').get().count;
}

export function listRuns(catId, limit = 20) {
  const capped = Math.max(1, Math.min(200, Number(limit) || 20));
  return db.prepare('SELECT * FROM cat_runs WHERE cat_id = ? ORDER BY started_at DESC LIMIT ?').all(catId, capped).map(hydrateRun);
}

export { addMinutes };
