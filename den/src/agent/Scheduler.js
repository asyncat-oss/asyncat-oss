// den/src/agent/Scheduler.js
// ─── Scheduled tasks (before Cats) ───────────────────────────────────────────
// A scheduled task ran a prompt on a timer. Cats replaced them: each task is
// turned into a Cat with a timer (cats/catMigration.js) and Cats do the
// running. What is left here keeps old data moving forward: the tasks table,
// and moving the even older schedules and workflows into it
// (scheduledTaskMigration.js), so an install skipping versions loses nothing.

import db from '../db/client.js';
import { randomUUID } from 'crypto';
import path from 'path';
import { migrateLegacyAutomations } from './scheduledTaskMigration.js';

const MAX_ALLOWED_TOOLS = 64;

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function cleanAllowedTools(tools) {
  if (tools === undefined || tools === null) return [];
  if (!Array.isArray(tools)) throw new Error('Pre-approved tools must be a list of tool names.');
  const names = [...new Set(tools.map((tool) => String(tool || '').trim()).filter(Boolean))];
  if (names.length > MAX_ALLOWED_TOOLS) throw new Error(`Pre-approve ${MAX_ALLOWED_TOOLS} tools at most.`);
  for (const name of names) {
    if (!/^[\w.:-]{1,100}$/.test(name)) throw new Error(`"${name}" isn't a tool name.`);
  }
  return names;
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
