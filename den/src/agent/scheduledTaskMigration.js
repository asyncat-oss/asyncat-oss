// den/src/agent/scheduledTaskMigration.js
// ─── Old schedules → scheduled tasks ─────────────────────────────────────────
// Before scheduled tasks there were schedules (scheduled_jobs, one agent goal
// on a timer). Each old row becomes one scheduled task the first time the
// backend starts with this code; `migrated_from` records where it came from,
// so running the migration again changes nothing. The old table is left as
// it was.

import {
  computeNextRun, normalizeSchedule, resolveTimeZone, zonedParts,
} from './scheduleMath.js';

const HOUR_MS = 3_600_000;
const pad = (value) => String(value).padStart(2, '0');

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The new schedule for an old scheduled_jobs schedule string:
 * interval:<ms>, once:<ms>, at:<ISO>, daily:HH:MM or hourly.
 */
export function scheduleFromLegacyJob(job, { now = new Date() } = {}) {
  const raw = String(job?.schedule || '').trim();
  const timezone = resolveTimeZone(job?.timezone);
  const nextRunAt = validDate(job?.next_run_at);

  if (raw === 'hourly') return { kind: 'cron', cron: '0 * * * *' };
  if (raw.startsWith('daily:')) return { kind: 'daily', time: raw.slice(6) };
  if (raw.startsWith('once:') || raw.startsWith('at:')) {
    const at = raw.startsWith('at:') ? validDate(raw.slice(3)) : nextRunAt;
    return at ? { kind: 'once', at: at.toISOString() } : null;
  }
  if (raw.startsWith('interval:')) {
    const ms = Number(raw.slice(9));
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes === 24 * 60) {
      // "Once a day" was a 24-hour timer that drifted; keep its time of day.
      const parts = zonedParts(nextRunAt || now, timezone);
      return { kind: 'daily', time: `${pad(parts.hour)}:${pad(parts.minute)}` };
    }
    if (minutes < 60) {
      const step = [15, 20, 30].find((candidate) => candidate >= minutes) || 30;
      return { kind: 'cron', cron: `*/${step} * * * *` };
    }
    const hours = Math.min(168, Math.max(1, Math.round(minutes / 60)));
    // Keep the old rhythm: the next run stays where the old timer had it.
    const anchor = new Date((nextRunAt || now).getTime() - hours * HOUR_MS);
    return { kind: 'every_hours', interval: hours, anchor: anchor.toISOString() };
  }
  return null;
}

/** A scheduled task (see Scheduler.insertTaskRow) for an old scheduled_jobs row. */
export function taskFromLegacyJob(job, { now = new Date(), projectForFolder = () => null, profileTools = () => [] } = {}) {
  const timezone = resolveTimeZone(job.timezone);
  const raw = scheduleFromLegacyJob(job, { now });
  let schedule;
  try {
    schedule = raw ? normalizeSchedule(raw, { now, timezone }) : null;
  } catch {
    schedule = null;
  }
  const usable = Boolean(schedule);
  if (!schedule) schedule = { kind: 'daily', time: '09:00' };

  let enabled = usable && Boolean(job.enabled);
  let nextRunAt = null;
  if (enabled && schedule.kind === 'once') {
    // A one-off that already ran is done; one still waiting keeps its time
    // (a run missed by less than 12 hours is then made up once).
    if (Number(job.run_count || 0) > 0) enabled = false;
    else nextRunAt = schedule.at;
  } else if (enabled) {
    nextRunAt = computeNextRun(schedule, now, timezone)?.toISOString() || null;
    if (!nextRunAt) enabled = false;
  }

  const workingDir = job.working_dir && job.working_dir !== '.' ? job.working_dir : null;
  return {
    userId: job.user_id,
    workspaceId: job.workspace_id && job.workspace_id !== 'default' ? job.workspace_id : null,
    name: String(job.name || 'Scheduled task').slice(0, 120),
    prompt: String(job.goal || '').trim() || String(job.name || 'Scheduled task'),
    schedule,
    timezone,
    enabled,
    nextRunAt,
    lastRunAt: job.last_run_at || null,
    runCount: Number(job.run_count || 0),
    projectId: workingDir ? projectForFolder(workingDir, job.user_id) : null,
    profileId: job.profile_id || null,
    providerProfileId: job.provider_profile_id || null,
    providerSnapshot: parseJson(job.provider_snapshot, {}),
    allowedTools: job.profile_id ? profileTools(job.profile_id) : [],
    migratedFrom: `job:${job.id}`,
    createdBy: 'migration',
    createdAt: job.created_at || null,
  };
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

/**
 * Copy old schedules into scheduled tasks. Safe to run on every start: rows
 * that were already copied are skipped. `insertTask(task)` writes
 * one task (Scheduler.js owns the table).
 */
export function migrateLegacyAutomations(db, { now = new Date(), insertTask, projectForFolder, profileTools } = {}) {
  const migrated = new Set(
    db.prepare('SELECT migrated_from FROM scheduled_tasks WHERE migrated_from IS NOT NULL').all().map((row) => row.migrated_from),
  );
  const counts = { jobs: 0, workflows: 0 };
  const helpers = { now, projectForFolder, profileTools };

  const run = db.transaction(() => {
    if (tableExists(db, 'scheduled_jobs')) {
      for (const job of db.prepare('SELECT * FROM scheduled_jobs ORDER BY created_at ASC').all()) {
        if (migrated.has(`job:${job.id}`) || !job.user_id) continue;
        insertTask(taskFromLegacyJob(job, helpers));
        counts.jobs += 1;
      }
    }
  });
  run();
  return counts;
}
