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
export function scheduleJob({ name, goal, schedule, userId, workspaceId, workingDir = process.cwd(), profileId = null, providerProfileId = null, providerSnapshot = null }) {
  if (!_runAgent) throw new Error('Scheduler not initialized. Call initScheduler() first.');

  const id = randomUUID();
  const nextRunAt = _calcNextRun(schedule, new Date());
  if (!nextRunAt) throw new Error(`Invalid schedule: "${schedule}". Use: interval:<ms> | at:<ISO> | once:<ms>`);

  db.prepare(`
    INSERT INTO scheduled_jobs (id, name, goal, schedule, user_id, workspace_id, profile_id, provider_profile_id, provider_snapshot, working_dir, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, goal, schedule, userId, workspaceId, profileId, providerProfileId, JSON.stringify(providerSnapshot || {}), workingDir, nextRunAt.toISOString());

  _armTimer(id);
  return { id, name, goal, schedule, profile_id: profileId, provider_profile_id: providerProfileId, provider_snapshot: providerSnapshot || {}, nextRunAt: nextRunAt.toISOString() };
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

/** Disable / delete a job. */
export function deleteJob(id) {
  _clearTimer(id);
  db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id);
}

export function enableJob(id) {
  db.prepare("UPDATE scheduled_jobs SET enabled = 1 WHERE id = ?").run(id);
  _armTimer(id);
}

export function disableJob(id) {
  _clearTimer(id);
  db.prepare("UPDATE scheduled_jobs SET enabled = 0 WHERE id = ?").run(id);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _loadAndResumeJobs() {
  const jobs = db.prepare("SELECT * FROM scheduled_jobs WHERE enabled = 1").all();
  for (const job of jobs) {
    const next = new Date(job.next_run_at);
    if (next < new Date()) {
      // Missed — recalculate next run, skip catch-up execution to avoid storms
      const newNext = _calcNextRun(job.schedule, new Date());
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
  const timer = setTimeout(() => _fireJob(id), msUntil);
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
  const newNext = _calcNextRun(job.schedule, now);
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

/**
 * Parse schedule string and return the next Date to fire.
 * Formats:
 *   interval:<ms>   — repeating every N milliseconds (e.g. interval:3600000 = hourly)
 *   once:<ms>       — fire once after N milliseconds from now
 *   at:<ISO>        — fire once at a specific datetime
 *   daily:<HH:MM>   — fire every day at HH:MM
 *   hourly          — fire at the top of every hour
 */
function _calcNextRun(schedule, fromDate) {
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

export default { initScheduler, scheduleJob, listJobs, listJobRuns, runJobNow, deleteJob, enableJob, disableJob };
