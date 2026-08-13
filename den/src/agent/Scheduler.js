// den/src/agent/Scheduler.js
// ─── Agent Task Scheduler ─────────────────────────────────────────────────────
// Cron-like scheduler that lets the agent (or user) schedule tasks to run
// at fixed intervals, specific times, or after a delay.
// All jobs are persisted to SQLite so they survive restarts.
// Zero new packages — uses Node.js built-in timers + our existing DB.

import db from '../db/client.js';
import { randomUUID } from 'crypto';

// ── Schema bootstrap (idempotent) ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    goal         TEXT NOT NULL,
    schedule     TEXT NOT NULL,          -- 'interval:<ms>' | 'at:<iso>' | 'once:<ms>'
    timezone     TEXT,                   -- IANA timezone for wall-clock schedules
    user_id      TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    profile_id   TEXT,
    provider_profile_id TEXT,
    provider_snapshot TEXT NOT NULL DEFAULT '{}',
    working_dir  TEXT NOT NULL DEFAULT '.',
    enabled      INTEGER NOT NULL DEFAULT 1,
    last_run_at  TEXT,
    next_run_at  TEXT NOT NULL,
    run_count    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

try {
  db.prepare('ALTER TABLE scheduled_jobs ADD COLUMN profile_id TEXT').run();
} catch (err) {
  if (!String(err.message || '').includes('duplicate column')) throw err;
}
try {
  db.prepare('ALTER TABLE scheduled_jobs ADD COLUMN provider_profile_id TEXT').run();
} catch (err) {
  if (!String(err.message || '').includes('duplicate column')) throw err;
}
try {
  db.prepare("ALTER TABLE scheduled_jobs ADD COLUMN provider_snapshot TEXT NOT NULL DEFAULT '{}'").run();
} catch (err) {
  if (!String(err.message || '').includes('duplicate column')) throw err;
}
try {
  db.prepare('ALTER TABLE scheduled_jobs ADD COLUMN timezone TEXT').run();
} catch (err) {
  if (!String(err.message || '').includes('duplicate column')) throw err;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_job_runs (
    id                  TEXT PRIMARY KEY,
    job_id              TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
    agent_session_id    TEXT,
    status              TEXT NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','completed','failed')),
    provider_profile_id TEXT,
    provider_snapshot   TEXT NOT NULL DEFAULT '{}',
    started_at          TEXT NOT NULL,
    finished_at         TEXT,
    answer              TEXT,
    error               TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job ON scheduled_job_runs(job_id, started_at DESC);
`);

// In-memory timer map: job.id -> NodeJS.Timer
const _timers = new Map();

// Will be set by initScheduler()
let _runAgent = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initScheduler(runAgentFn) {
  _runAgent = runAgentFn;
  _loadAndResumeJobs();
  console.log('[scheduler] Initialized — loaded persisted jobs');
}

/** Create a new scheduled job. */
export function scheduleJob({ name, goal, schedule, timezone = null, userId, workspaceId, workingDir = process.cwd(), profileId = null, providerProfileId = null, providerSnapshot = null }) {
  if (!_runAgent) throw new Error('Scheduler not initialized. Call initScheduler() first.');

  const id = randomUUID();
  timezone = _validateTimezone(timezone);
  const nextRunAt = _calcNextRun(schedule, new Date(), timezone);
  if (!nextRunAt) throw new Error(`Invalid schedule: "${schedule}". Use: interval:<ms> | at:<ISO> | once:<ms>`);

  db.prepare(`
    INSERT INTO scheduled_jobs (id, name, goal, schedule, timezone, user_id, workspace_id, profile_id, provider_profile_id, provider_snapshot, working_dir, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, goal, schedule, timezone, userId, workspaceId, profileId, providerProfileId, JSON.stringify(providerSnapshot || {}), workingDir, nextRunAt.toISOString());

  _armTimer(id);
  return { id, name, goal, schedule, timezone, profile_id: profileId, provider_profile_id: providerProfileId, provider_snapshot: providerSnapshot || {}, nextRunAt: nextRunAt.toISOString() };
}

/** List all scheduled jobs for a user. */
export function listJobs(userId, workspaceId) {
  return db.prepare(
    'SELECT * FROM scheduled_jobs WHERE user_id = ? AND workspace_id = ? ORDER BY next_run_at ASC'
  ).all(userId, workspaceId).map(_hydrateJob);
}

export function listJobRuns(id, userId, workspaceId, limit = 20) {
  const job = db.prepare('SELECT id FROM scheduled_jobs WHERE id = ? AND user_id = ? AND workspace_id = ?').get(id, userId, workspaceId);
  if (!job) return null;
  return db.prepare(`
    SELECT * FROM scheduled_job_runs
    WHERE job_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(id, limit).map(_hydrateRun);
}

export async function runJobNow(id) {
  return _fireJob(id, { manual: true });
}

/** Update an existing scheduled job. */
export function updateJob({ id, userId, workspaceId, name, goal, schedule, timezone, enabled, profileId, providerProfileId, providerSnapshot, workingDir }) {
  const existing = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ? AND user_id = ? AND workspace_id = ?')
    .get(id, userId, workspaceId);
  if (!existing) return null;

  const updates = [];
  const values = [];
  const set = (column, value) => {
    updates.push(`${column} = ?`);
    values.push(value);
  };

  if (name !== undefined) set('name', name);
  if (goal !== undefined) set('goal', goal);
  if (workingDir !== undefined) set('working_dir', workingDir || '.');
  if (profileId !== undefined) set('profile_id', profileId || null);
  if (providerProfileId !== undefined) set('provider_profile_id', providerProfileId || null);
  if (providerSnapshot !== undefined) set('provider_snapshot', JSON.stringify(providerSnapshot || {}));
  if (enabled !== undefined) set('enabled', enabled ? 1 : 0);

  if (schedule !== undefined || timezone !== undefined) {
    const resolvedSchedule = schedule !== undefined ? schedule : existing.schedule;
    const resolvedTimezone = _validateTimezone(timezone !== undefined ? timezone : existing.timezone);
    const nextRunAt = _calcNextRun(resolvedSchedule, new Date(), resolvedTimezone);
    if (!nextRunAt) throw new Error(`Invalid schedule: "${resolvedSchedule}". Use: interval:<ms> | at:<ISO> | once:<ms> | daily:<HH:MM> | hourly`);
    if (schedule !== undefined) set('schedule', schedule);
    if (timezone !== undefined) set('timezone', resolvedTimezone);
    set('next_run_at', nextRunAt.toISOString());
  }

  if (updates.length === 0) return _hydrateJob(existing);

  updates.push("updated_at = datetime('now')");
  values.push(id, userId, workspaceId);
  db.prepare(`
    UPDATE scheduled_jobs
    SET ${updates.join(', ')}
    WHERE id = ? AND user_id = ? AND workspace_id = ?
  `).run(...values);

  _clearTimer(id);
  const updated = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id);
  if (updated?.enabled) _armTimer(id);
  return _hydrateJob(updated);
}

/** Disable / delete a job. */
function _canManageJob(id, userId = null, workspaceId = null) {
  if (!userId) return Boolean(db.prepare('SELECT id FROM scheduled_jobs WHERE id = ?').get(id));
  return Boolean(db.prepare(`
    SELECT id FROM scheduled_jobs
    WHERE id = ? AND user_id = ? AND (? IS NULL OR workspace_id = ?)
  `).get(id, userId, workspaceId, workspaceId));
}

export function deleteJob(id, { userId = null, workspaceId = null } = {}) {
  if (!_canManageJob(id, userId, workspaceId)) return false;
  _clearTimer(id);
  db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id);
  return true;
}

export function enableJob(id, { userId = null, workspaceId = null } = {}) {
  if (!_canManageJob(id, userId, workspaceId)) return false;
  db.prepare("UPDATE scheduled_jobs SET enabled = 1 WHERE id = ?").run(id);
  _armTimer(id);
  return true;
}

export function disableJob(id, { userId = null, workspaceId = null } = {}) {
  if (!_canManageJob(id, userId, workspaceId)) return false;
  _clearTimer(id);
  db.prepare("UPDATE scheduled_jobs SET enabled = 0 WHERE id = ?").run(id);
  return true;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _loadAndResumeJobs() {
  const jobs = db.prepare("SELECT * FROM scheduled_jobs WHERE enabled = 1").all();
  for (const job of jobs) {
    const next = new Date(job.next_run_at);
    if (next < new Date()) {
      if (job.schedule.startsWith('once:') || job.schedule.startsWith('at:')) {
        disableJob(job.id);
        continue;
      }
      // Missed — recalculate next run, skip catch-up execution to avoid storms
      const newNext = _calcNextRun(job.schedule, new Date(), job.timezone);
      if (!newNext) { disableJob(job.id); continue; }
      db.prepare("UPDATE scheduled_jobs SET next_run_at = ? WHERE id = ?").run(newNext.toISOString(), job.id);
    }
    _armTimer(job.id);
  }
}

function _armTimer(id) {
  _clearTimer(id);
  const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id);
  if (!job || !job.enabled) return;

  const msUntil = Math.max(0, new Date(job.next_run_at) - Date.now());
  const maxTimerMs = 2_147_000_000;
  const timer = msUntil > maxTimerMs
    ? setTimeout(() => _armTimer(id), maxTimerMs)
    : setTimeout(() => _fireJob(id), msUntil);
  _timers.set(id, timer);
}

function _clearTimer(id) {
  if (_timers.has(id)) {
    clearTimeout(_timers.get(id));
    _timers.delete(id);
  }
}

async function _fireJob(id, { manual = false } = {}) {
  const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id);
  if (!job || (!job.enabled && !manual)) return;

  const now = new Date();
  const runId = randomUUID();
  db.prepare(`
    INSERT INTO scheduled_job_runs (id, job_id, status, provider_profile_id, provider_snapshot, started_at)
    VALUES (?, ?, 'running', ?, ?, ?)
  `).run(runId, id, job.provider_profile_id || null, job.provider_snapshot || '{}', now.toISOString());

  console.log(`[scheduler] Running job "${job.name}" (${id})`);

  try {
    const result = await _runAgent({
      goal: job.goal,
      userId: job.user_id,
      workspaceId: job.workspace_id,
      workingDir: job.working_dir === '.' ? null : job.working_dir,
      profileId: job.profile_id,
      providerProfileId: job.provider_profile_id,
      providerSnapshot: _safeJson(job.provider_snapshot, {}),
      scheduledJobId: job.id,
      scheduledRunId: runId,
    });
    db.prepare(`
      UPDATE scheduled_job_runs
      SET status = 'completed', agent_session_id = ?, answer = ?, finished_at = ?
      WHERE id = ?
    `).run(result?.session?.id || null, result?.answer || null, new Date().toISOString(), runId);
  } catch (err) {
    console.error(`[scheduler] Job "${job.name}" failed:`, err.message);
    db.prepare(`
      UPDATE scheduled_job_runs
      SET status = 'failed', error = ?, finished_at = ?
      WHERE id = ?
    `).run(err.message || 'Scheduled run failed', new Date().toISOString(), runId);
  }

  if (manual) {
    db.prepare(`
      UPDATE scheduled_jobs SET last_run_at = ?, run_count = run_count + 1, updated_at = datetime('now') WHERE id = ?
    `).run(now.toISOString(), id);
    return _hydrateRun(db.prepare('SELECT * FROM scheduled_job_runs WHERE id = ?').get(runId));
  }

  // Recalculate next run
  const isOneTime = job.schedule.startsWith('once:') || job.schedule.startsWith('at:');
  const newNext = isOneTime ? null : _calcNextRun(job.schedule, new Date(), job.timezone);
  if (newNext) {
    db.prepare(`
      UPDATE scheduled_jobs SET last_run_at = ?, next_run_at = ?, run_count = run_count + 1, updated_at = datetime('now') WHERE id = ?
    `).run(now.toISOString(), newNext.toISOString(), id);
    _armTimer(id);
  } else {
    // 'once' schedule — done, disable
    db.prepare("UPDATE scheduled_jobs SET enabled = 0, run_count = run_count + 1, updated_at = datetime('now') WHERE id = ?").run(id);
  }
}

function _safeJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function _hydrateRun(row) {
  if (!row) return row;
  return {
    ...row,
    provider_snapshot: _safeJson(row.provider_snapshot, {}),
  };
}

function _hydrateJob(row) {
  if (!row) return row;
  const latestRun = db.prepare(`
    SELECT * FROM scheduled_job_runs
    WHERE job_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(row.id);
  return {
    ...row,
    provider_snapshot: _safeJson(row.provider_snapshot, {}),
    latest_run: latestRun ? _hydrateRun(latestRun) : null,
  };
}

function _validateTimezone(timezone) {
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new Error(`Invalid timezone: "${timezone}"`);
  }
}

function _zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function _wallClockToUtc({ year, month, day, hour, minute }, timezone) {
  const desiredUtcValue = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(desiredUtcValue);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = _zonedParts(candidate, timezone);
    const actualUtcValue = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second || 0, 0);
    const adjustment = desiredUtcValue - actualUtcValue;
    if (adjustment === 0) break;
    candidate = new Date(candidate.getTime() + adjustment);
  }
  return candidate;
}

/**
 * Parse schedule string and return the next Date to fire.
 * Formats:
 *   interval:<ms>   — repeating every N milliseconds (e.g. interval:3600000 = hourly)
 *   once:<ms>       — fire once after N milliseconds from now
 *   at:<ISO>        — fire once at a specific datetime
 *   daily:<HH:MM>   — fire every day at HH:MM
 *   hourly          — fire at the top of every hour
 */
function _calcNextRun(schedule, fromDate, timezone = null) {
  if (!schedule) return null;

  if (schedule.startsWith('interval:')) {
    const ms = parseInt(schedule.slice(9), 10);
    if (isNaN(ms) || ms < 1000) return null;
    return new Date(fromDate.getTime() + ms);
  }

  if (schedule.startsWith('once:')) {
    const ms = parseInt(schedule.slice(5), 10);
    if (isNaN(ms) || ms < 0) return null;
    return new Date(fromDate.getTime() + ms); // Will be disabled after running
  }

  if (schedule.startsWith('at:')) {
    const d = new Date(schedule.slice(3));
    if (isNaN(d.getTime())) return null;
    return d > fromDate ? d : null; // Don't reschedule past 'at:' jobs
  }

  if (schedule.startsWith('daily:')) {
    const [hh, mm] = schedule.slice(6).split(':').map(Number);
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    if (timezone) {
      const local = _zonedParts(fromDate, timezone);
      let wallDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
      let next = _wallClockToUtc({
        year: wallDate.getUTCFullYear(), month: wallDate.getUTCMonth() + 1, day: wallDate.getUTCDate(), hour: hh, minute: mm,
      }, timezone);
      if (next <= fromDate) {
        wallDate.setUTCDate(wallDate.getUTCDate() + 1);
        next = _wallClockToUtc({
          year: wallDate.getUTCFullYear(), month: wallDate.getUTCMonth() + 1, day: wallDate.getUTCDate(), hour: hh, minute: mm,
        }, timezone);
      }
      return next;
    }
    const next = new Date(fromDate);
    next.setHours(hh, mm, 0, 0);
    if (next <= fromDate) next.setDate(next.getDate() + 1);
    return next;
  }

  if (schedule === 'hourly') {
    const next = new Date(fromDate);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }

  return null;
}

export default { initScheduler, scheduleJob, listJobs, listJobRuns, runJobNow, updateJob, deleteJob, enableJob, disableJob };
