// den/src/agent/WorkflowEngine.js
// ─── Workflow / Automation Engine ────────────────────────────────────────────
// A workflow is a named automation: a trigger (manual or cron schedule) plus an
// ordered list of steps. Each step is a natural-language instruction the agent
// executes (reusing the SAME agent runner the Scheduler uses, injected via
// initWorkflows). Step output can be carried forward as context to later steps.
//
// Tables are created on init (CREATE TABLE IF NOT EXISTS), so no schema.sql edit.

import db from '../db/client.js';
import { randomUUID } from 'crypto';
import cron from 'node-cron';

let _runAgent = null;                 // injected agent runner: ({goal,userId,...}) => {session,answer}
const _cronTasks = new Map();         // workflowId -> node-cron task

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      workspace_id        TEXT,
      name                TEXT NOT NULL,
      description         TEXT,
      trigger_type        TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'schedule'
      schedule            TEXT,                              -- cron expression when trigger_type='schedule'
      steps               TEXT NOT NULL DEFAULT '[]',        -- JSON: [{ id, prompt, useContext, continueOnError }]
      enabled             INTEGER NOT NULL DEFAULT 1,
      profile_id          TEXT,
      provider_profile_id TEXT,
      provider_snapshot   TEXT NOT NULL DEFAULT '{}',
      working_dir         TEXT,
      last_run_at         TEXT,
      run_count           INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_user ON workflows(user_id, updated_at);

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id              TEXT PRIMARY KEY,
      workflow_id     TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'running',       -- running | completed | failed
      trigger         TEXT NOT NULL DEFAULT 'manual',
      steps_total     INTEGER NOT NULL DEFAULT 0,
      steps_completed INTEGER NOT NULL DEFAULT 0,
      results         TEXT NOT NULL DEFAULT '[]',
      error           TEXT,
      started_at      TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(workflow_id, started_at);
  `);
}

export function initWorkflows(runAgentFn) {
  _runAgent = runAgentFn;
  ensureTables();
  try {
    const rows = db.prepare("SELECT * FROM workflows WHERE enabled = 1 AND trigger_type = 'schedule' AND schedule IS NOT NULL").all();
    for (const wf of rows) _armSchedule(wf);
    if (rows.length) console.log(`[workflows] Armed ${rows.length} scheduled workflow(s)`);
  } catch (err) { console.warn('[workflows] schedule re-arm failed:', err.message); }
  console.log('[workflows] Initialized');
}

// ── Scheduling ────────────────────────────────────────────────────────────────
function _armSchedule(wf) {
  _clearSchedule(wf.id);
  if (!wf.schedule) return;
  try {
    if (!cron.validate(wf.schedule)) { console.warn(`[workflows] invalid cron for ${wf.id}: ${wf.schedule}`); return; }
    const task = cron.schedule(wf.schedule, () => {
      runWorkflow(wf.id, { trigger: 'schedule' }).catch(e => console.error('[workflows] scheduled run failed:', e.message));
    });
    _cronTasks.set(wf.id, task);
  } catch (err) { console.warn('[workflows] arm schedule failed:', err.message); }
}

function _clearSchedule(id) {
  const t = _cronTasks.get(id);
  if (t) { try { t.stop(); } catch { /* already stopped */ } _cronTasks.delete(id); }
}

// ── Serialization helpers ─────────────────────────────────────────────────────
function _parseJson(json, fallback) {
  try { const v = JSON.parse(json); return v ?? fallback; } catch { return fallback; }
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps
    .filter(s => s && typeof s === 'object')
    .map((s, i) => ({
      id: s.id || `step-${i + 1}`,
      prompt: String(s.prompt || '').slice(0, 6000),
      useContext: Boolean(s.useContext),
      continueOnError: Boolean(s.continueOnError),
    }));
}

function normalizeWorkflow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    triggerType: row.trigger_type,
    schedule: row.schedule || null,
    steps: _parseJson(row.steps, []),
    enabled: Boolean(row.enabled),
    profileId: row.profile_id || null,
    workingDir: row.working_dir || null,
    lastRunAt: row.last_run_at || null,
    runCount: Number(row.run_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRun(r) {
  return {
    id: r.id,
    status: r.status,
    trigger: r.trigger,
    stepsTotal: Number(r.steps_total || 0),
    stepsCompleted: Number(r.steps_completed || 0),
    results: _parseJson(r.results, []),
    error: r.error || null,
    startedAt: r.started_at,
    finishedAt: r.finished_at || null,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function listWorkflows(userId) {
  return db.prepare('SELECT * FROM workflows WHERE user_id = ? ORDER BY updated_at DESC').all(userId).map(normalizeWorkflow);
}

export function getWorkflow(id, userId) {
  const row = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?').get(id, userId);
  return row ? normalizeWorkflow(row) : null;
}

export function createWorkflow({ userId, workspaceId = null, name, description = '', triggerType = 'manual', schedule = null, steps = [], enabled = true, profileId = null, workingDir = null, providerProfileId = null, providerSnapshot = null }) {
  if (!name || !String(name).trim()) throw new Error('Workflow name is required');
  if (triggerType === 'schedule' && schedule && !cron.validate(schedule)) throw new Error('Invalid cron schedule');
  const id = randomUUID();
  db.prepare(`
    INSERT INTO workflows (id, user_id, workspace_id, name, description, trigger_type, schedule, steps, enabled, profile_id, provider_profile_id, provider_snapshot, working_dir)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, workspaceId, String(name).trim(), description || null,
    triggerType, triggerType === 'schedule' ? schedule : null,
    JSON.stringify(normalizeSteps(steps)), enabled ? 1 : 0,
    profileId, providerProfileId, JSON.stringify(providerSnapshot || {}), workingDir,
  );
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (wf.enabled && wf.trigger_type === 'schedule') _armSchedule(wf);
  return normalizeWorkflow(wf);
}

export function updateWorkflow(id, userId, fields = {}) {
  const existing = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) throw new Error('Workflow not found');
  const triggerType = fields.triggerType ?? existing.trigger_type;
  let schedule = fields.schedule !== undefined ? fields.schedule : existing.schedule;
  if (triggerType !== 'schedule') schedule = null;
  if (triggerType === 'schedule' && schedule && !cron.validate(schedule)) throw new Error('Invalid cron schedule');

  db.prepare(`
    UPDATE workflows
    SET name = ?, description = ?, trigger_type = ?, schedule = ?, steps = ?, enabled = ?, profile_id = ?, working_dir = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    fields.name !== undefined ? String(fields.name).trim() : existing.name,
    fields.description !== undefined ? (fields.description || null) : existing.description,
    triggerType,
    schedule,
    fields.steps !== undefined ? JSON.stringify(normalizeSteps(fields.steps)) : existing.steps,
    fields.enabled !== undefined ? (fields.enabled ? 1 : 0) : existing.enabled,
    fields.profileId !== undefined ? fields.profileId : existing.profile_id,
    fields.workingDir !== undefined ? fields.workingDir : existing.working_dir,
    id,
  );
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  _clearSchedule(id);
  if (wf.enabled && wf.trigger_type === 'schedule') _armSchedule(wf);
  return normalizeWorkflow(wf);
}

export function deleteWorkflow(id, userId) {
  const existing = db.prepare('SELECT id FROM workflows WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return false;
  _clearSchedule(id);
  db.prepare('DELETE FROM workflow_runs WHERE workflow_id = ?').run(id);
  db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
  return true;
}

export function listWorkflowRuns(workflowId, userId, limit = 20) {
  return db.prepare('SELECT * FROM workflow_runs WHERE workflow_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(workflowId, userId, limit).map(normalizeRun);
}

// Recent runs across all of a user's workflows (for the activity center).
export function listRecentRuns(userId, limit = 30) {
  return db.prepare(`
    SELECT r.*, w.name AS workflow_name
    FROM workflow_runs r
    JOIN workflows w ON w.id = r.workflow_id
    WHERE r.user_id = ?
    ORDER BY r.started_at DESC
    LIMIT ?
  `).all(userId, limit).map(r => ({ ...normalizeRun(r), workflowId: r.workflow_id, workflowName: r.workflow_name }));
}

// ── Execution ─────────────────────────────────────────────────────────────────
// Runs steps sequentially via the injected agent runner. Creates the run record
// synchronously (before the first await) so callers can return immediately and
// poll progress.
export async function runWorkflow(id, { trigger = 'manual', userId = null } = {}) {
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (!wf) throw new Error('Workflow not found');
  if (userId && wf.user_id !== userId) throw new Error('Workflow not found');
  if (typeof _runAgent !== 'function') throw new Error('Workflow engine is not initialized');

  const steps = normalizeSteps(_parseJson(wf.steps, [])).filter(s => s.prompt.trim());
  const runId = randomUUID();
  db.prepare('INSERT INTO workflow_runs (id, workflow_id, user_id, status, trigger, steps_total) VALUES (?, ?, ?, ?, ?, ?)')
    .run(runId, id, wf.user_id, 'running', trigger, steps.length);

  const results = [];
  let priorContext = '';
  try {
    if (steps.length === 0) throw new Error('Workflow has no steps');
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const goal = (step.useContext && priorContext)
        ? `Context from previous workflow steps:\n${priorContext}\n---\n\nNow do this:\n${step.prompt}`
        : step.prompt;
      try {
        const res = await _runAgent({
          goal,
          userId: wf.user_id,
          workspaceId: wf.workspace_id,
          workingDir: wf.working_dir === '.' ? null : wf.working_dir,
          profileId: wf.profile_id,
          providerProfileId: wf.provider_profile_id,
          providerSnapshot: _parseJson(wf.provider_snapshot, {}),
        });
        const answer = String(res?.answer || '');
        results.push({ ok: true, output: answer.slice(0, 4000), sessionId: res?.session?.id || null });
        priorContext += `Step ${i + 1} (${step.prompt.slice(0, 80)}):\n${answer.slice(0, 1500)}\n\n`;
        db.prepare('UPDATE workflow_runs SET steps_completed = ?, results = ? WHERE id = ?').run(i + 1, JSON.stringify(results), runId);
      } catch (err) {
        results.push({ ok: false, error: err.message || 'Step failed' });
        db.prepare('UPDATE workflow_runs SET steps_completed = ?, results = ? WHERE id = ?').run(i, JSON.stringify(results), runId);
        if (!step.continueOnError) throw new Error(`Step ${i + 1} failed: ${err.message}`);
      }
    }
    db.prepare("UPDATE workflow_runs SET status = 'completed', results = ?, finished_at = datetime('now') WHERE id = ?").run(JSON.stringify(results), runId);
  } catch (err) {
    db.prepare("UPDATE workflow_runs SET status = 'failed', error = ?, results = ?, finished_at = datetime('now') WHERE id = ?")
      .run(err.message || 'Workflow failed', JSON.stringify(results), runId);
  }
  db.prepare("UPDATE workflows SET last_run_at = datetime('now'), run_count = run_count + 1, updated_at = datetime('now') WHERE id = ?").run(id);

  return db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId) ? normalizeRun(db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId)) : { id: runId };
}

export default {
  initWorkflows, listWorkflows, getWorkflow, createWorkflow,
  updateWorkflow, deleteWorkflow, runWorkflow, listWorkflowRuns, listRecentRuns,
};
