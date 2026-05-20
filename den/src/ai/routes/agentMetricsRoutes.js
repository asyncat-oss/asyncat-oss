import express from 'express';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../../db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEN_ROOT = path.resolve(__dirname, '../../..');
const EVAL_SCRIPT = path.join(DEN_ROOT, 'scripts', 'run-agent-evals.js');
let activeEval = null;

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function boundedLimit(value, fallback = 100, max = 500) {
  return Math.max(1, Math.min(max, Number(value || fallback)));
}

function boundedDays(value, fallback = 30) {
  return Math.max(1, Math.min(365, Number(value || fallback)));
}

function ensureEvalRunsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_eval_runs (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id  TEXT,
      mode          TEXT NOT NULL CHECK (mode IN ('deterministic', 'live')),
      status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
      phase         TEXT,
      success       INTEGER,
      passed        INTEGER DEFAULT 0,
      failed        INTEGER DEFAULT 0,
      total         INTEGER DEFAULT 0,
      model         TEXT,
      is_local      INTEGER,
      duration_ms   INTEGER,
      results       TEXT NOT NULL DEFAULT '[]',
      stderr        TEXT,
      error         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_eval_runs_user ON agent_eval_runs(user_id, created_at);
  `);
}

function normalizeEvalRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    mode: row.mode,
    status: row.status,
    phase: row.phase,
    success: row.success === null || row.success === undefined ? null : Boolean(row.success),
    passed: Number(row.passed || 0),
    failed: Number(row.failed || 0),
    total: Number(row.total || 0),
    model: row.model,
    isLocal: row.is_local === null || row.is_local === undefined ? null : Boolean(row.is_local),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    results: parseJson(row.results, []),
    stderr: row.stderr || '',
    error: row.error || '',
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function toolMetricFromRow(row) {
  const total = Number(row.total_calls || 0);
  const failed = Number(row.failed_calls || 0);
  const successful = Math.max(0, total - failed);
  const invalidArguments = Number(row.invalid_arguments || 0);
  const readBeforeWriteBlocks = Number(row.read_before_write_blocks || 0);
  const permissionDenied = Number(row.permission_denied || 0);
  const unknownTools = Number(row.unknown_tools || 0);
  const guardBlocks = readBeforeWriteBlocks + permissionDenied;
  const executionErrors = Math.max(0, failed - invalidArguments - guardBlocks - unknownTools);
  return {
    toolName: row.tool_name,
    totalCalls: total,
    successfulCalls: successful,
    failedCalls: failed,
    successRate: total ? Number((successful / total).toFixed(3)) : null,
    invalidArguments,
    readBeforeWriteBlocks,
    permissionDenied,
    guardBlocks,
    unknownTools,
    executionErrors,
    avgDurationMs: row.avg_duration_ms === null || row.avg_duration_ms === undefined
      ? null
      : Number(Number(row.avg_duration_ms).toFixed(1)),
    lastSeenAt: row.last_seen_at,
  };
}

function updateEvalRun(evalId, fields = {}) {
  const row = {
    status: fields.status,
    phase: fields.phase,
    success: fields.success === undefined || fields.success === null ? null : (fields.success ? 1 : 0),
    passed: Number(fields.passed || 0),
    failed: Number(fields.failed || 0),
    total: Number(fields.total || 0),
    model: fields.model || null,
    isLocal: fields.isLocal === undefined || fields.isLocal === null ? null : (fields.isLocal ? 1 : 0),
    durationMs: fields.durationMs === undefined || fields.durationMs === null ? null : Number(fields.durationMs),
    results: JSON.stringify(fields.results || []),
    stderr: fields.stderr || '',
    error: fields.error || null,
    completedAt: fields.completedAt || null,
  };
  db.prepare(`
    UPDATE agent_eval_runs
    SET status = COALESCE(?, status),
        phase = COALESCE(?, phase),
        success = ?,
        passed = ?,
        failed = ?,
        total = ?,
        model = ?,
        is_local = ?,
        duration_ms = ?,
        results = ?,
        stderr = ?,
        error = ?,
        completed_at = ?
    WHERE id = ?
  `).run(
    row.status, row.phase, row.success, row.passed, row.failed, row.total,
    row.model, row.isLocal, row.durationMs, row.results, row.stderr, row.error, row.completedAt,
    evalId,
  );
}

function setEvalPhase(phase, label = null) {
  if (!activeEval) return;
  activeEval.phase = phase;
  activeEval.label = label || phase;
  activeEval.updatedAt = new Date().toISOString();
  try {
    db.prepare('UPDATE agent_eval_runs SET phase = ? WHERE id = ?').run(phase, activeEval.id);
  } catch {
    // best-effort progress only
  }
}

function runEvalProcess({ mode = 'deterministic', keepSandbox = false, userId = null, workspaceId = null } = {}) {
  if (activeEval) {
    const error = new Error('An agent eval is already running.');
    error.status = 409;
    throw error;
  }

  const live = mode === 'live';
  const evalId = randomUUID();
  const now = new Date().toISOString();
  const firstPhase = live ? 'preparing' : 'running';
  db.prepare(`
    INSERT INTO agent_eval_runs (id, user_id, workspace_id, mode, status, phase, created_at)
    VALUES (?, ?, ?, ?, 'running', ?, ?)
  `).run(evalId, userId, workspaceId, mode, firstPhase, now);

  const args = [EVAL_SCRIPT, '--json'];
  if (live) args.push('--live');
  if (live && keepSandbox) args.push('--keep-sandbox');
  if (live && userId) args.push('--user-id', userId);
  if (live && workspaceId) args.push('--workspace-id', workspaceId);
  const timeoutMs = live ? 6 * 60_000 : 90_000;

  activeEval = {
    id: evalId,
    userId,
    workspaceId,
    mode,
    phase: firstPhase,
    label: live ? 'Preparing live eval' : 'Running tool contract checks',
    startedAt: Date.now(),
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: DEN_ROOT,
      env: { ...process.env, ASYNCAT_EVAL_PROGRESS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stderrLineBuffer = '';
    const timer = setTimeout(() => {
      setEvalPhase('timed_out', 'Eval timed out');
      child.kill('SIGTERM');
      const error = new Error(`Agent eval timed out after ${Math.round(timeoutMs / 1000)}s.`);
      error.status = 504;
      reject(error);
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
      stderrLineBuffer += text;
      const lines = stderrLineBuffer.split(/\r?\n/);
      stderrLineBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('ASYNCAT_EVAL_PROGRESS ')) continue;
        try {
          const event = JSON.parse(line.slice('ASYNCAT_EVAL_PROGRESS '.length));
          if (event?.phase) setEvalPhase(event.phase, event.label || event.phase);
        } catch {
          // ignore malformed progress
        }
      }
    });
    child.on('error', err => {
      updateEvalRun(evalId, {
        status: 'failed',
        phase: 'failed',
        success: false,
        error: err.message || String(err),
        completedAt: new Date().toISOString(),
      });
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        const jsonText = jsonStart >= 0 && jsonEnd >= jsonStart
          ? stdout.slice(jsonStart, jsonEnd + 1)
          : stdout.trim();
        const parsed = JSON.parse(jsonText || '{}');
        setEvalPhase('recording', 'Recording eval result');
        const payload = {
          ...parsed,
          evalRunId: evalId,
          exitCode: code,
          stderr: stderr.trim(),
        };
        updateEvalRun(evalId, {
          status: payload.success ? 'completed' : 'failed',
          phase: payload.success ? 'completed' : 'failed',
          success: Boolean(payload.success),
          passed: payload.passed,
          failed: payload.failed,
          total: payload.total,
          model: payload.model || null,
          isLocal: payload.isLocal,
          durationMs: payload.durationMs,
          results: payload.results || [],
          stderr: payload.stderr,
          error: payload.success ? null : payload.results?.find(item => !item.ok)?.message || null,
          completedAt: new Date().toISOString(),
        });
        resolve(payload);
      } catch {
        const error = new Error(stderr.trim() || stdout.trim() || `Agent eval exited with code ${code}`);
        error.status = code === 0 ? 500 : 400;
        updateEvalRun(evalId, {
          status: 'failed',
          phase: 'failed',
          success: false,
          stderr: stderr.trim(),
          error: error.message,
          completedAt: new Date().toISOString(),
        });
        reject(error);
      }
    });
  }).finally(() => {
    activeEval = null;
  });
}

function metricFailureSql() {
  return `
    success = 0
    OR json_extract(result, '$.success') = 0
    OR json_extract(result, '$.error') IS NOT NULL
  `;
}

export function createAgentMetricsRouter({ authenticate }) {
  ensureEvalRunsTable();
  const router = express.Router();

  router.get('/tools', authenticate, (req, res) => {
    try {
      const days = boundedDays(req.query.days, 30);
      const limit = boundedLimit(req.query.limit, 100, 500);
      const rows = db.prepare(`
        SELECT
          tool_name,
          COUNT(*) AS total_calls,
          SUM(CASE WHEN ${metricFailureSql()} THEN 1 ELSE 0 END) AS failed_calls,
          SUM(CASE WHEN json_extract(result, '$.code') = 'invalid_tool_arguments' THEN 1 ELSE 0 END) AS invalid_arguments,
          SUM(CASE WHEN json_extract(result, '$.code') = 'read_before_write_required' THEN 1 ELSE 0 END) AS read_before_write_blocks,
          SUM(CASE WHEN permission_decision IN ('denied', 'deny') THEN 1 ELSE 0 END) AS permission_denied,
          SUM(CASE WHEN json_extract(result, '$.code') = 'unknown_tool' OR json_extract(result, '$.error') LIKE 'Unknown tool:%' THEN 1 ELSE 0 END) AS unknown_tools,
          AVG(CASE
            WHEN completed_at IS NOT NULL
            THEN (julianday(completed_at) - julianday(started_at)) * 86400000.0
            ELSE NULL
          END) AS avg_duration_ms,
          MAX(started_at) AS last_seen_at
        FROM agent_tool_audit
        WHERE user_id = ?
          AND julianday(started_at) >= julianday('now', ?)
        GROUP BY tool_name
        ORDER BY failed_calls DESC, total_calls DESC
        LIMIT ?
      `).all(req.user.id, `-${days} days`, limit);

      res.json({
        success: true,
        windowDays: days,
        count: rows.length,
        tools: rows.map(toolMetricFromRow),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/summary', authenticate, (req, res) => {
    try {
      const days = boundedDays(req.query.days, 30);
      const totals = db.prepare(`
        SELECT
          COUNT(*) AS total_calls,
          SUM(CASE WHEN ${metricFailureSql()} THEN 1 ELSE 0 END) AS failed_calls,
          SUM(CASE WHEN json_extract(result, '$.code') = 'invalid_tool_arguments' THEN 1 ELSE 0 END) AS invalid_arguments,
          SUM(CASE WHEN json_extract(result, '$.code') = 'read_before_write_required' THEN 1 ELSE 0 END) AS read_before_write_blocks,
          SUM(CASE WHEN permission_decision IN ('denied', 'deny') THEN 1 ELSE 0 END) AS permission_denied,
          SUM(CASE WHEN json_extract(result, '$.code') = 'unknown_tool' OR json_extract(result, '$.error') LIKE 'Unknown tool:%' THEN 1 ELSE 0 END) AS unknown_tools,
          COUNT(DISTINCT session_id) AS sessions,
          COUNT(DISTINCT tool_name) AS tools_used
        FROM agent_tool_audit
        WHERE user_id = ?
          AND julianday(started_at) >= julianday('now', ?)
      `).get(req.user.id, `-${days} days`);

      const recentFailures = db.prepare(`
        SELECT session_id, tool_name, result, started_at
        FROM agent_tool_audit
        WHERE user_id = ?
          AND julianday(started_at) >= julianday('now', ?)
          AND (${metricFailureSql()})
        ORDER BY started_at DESC
        LIMIT 20
      `).all(req.user.id, `-${days} days`).map(row => {
        const result = parseJson(row.result, {});
        return {
          sessionId: row.session_id,
          toolName: row.tool_name,
          error: result?.error || result?.message || 'Tool failed',
          code: result?.code || null,
          startedAt: row.started_at,
        };
      });

      const totalCalls = Number(totals?.total_calls || 0);
      const failedCalls = Number(totals?.failed_calls || 0);
      const invalidArguments = Number(totals?.invalid_arguments || 0);
      const readBeforeWriteBlocks = Number(totals?.read_before_write_blocks || 0);
      const permissionDenied = Number(totals?.permission_denied || 0);
      const unknownTools = Number(totals?.unknown_tools || 0);
      const guardBlocks = readBeforeWriteBlocks + permissionDenied;
      const executionErrors = Math.max(0, failedCalls - invalidArguments - guardBlocks - unknownTools);
      res.json({
        success: true,
        windowDays: days,
        summary: {
          totalCalls,
          failedCalls,
          successfulCalls: Math.max(0, totalCalls - failedCalls),
          successRate: totalCalls ? Number(((totalCalls - failedCalls) / totalCalls).toFixed(3)) : null,
          sessions: Number(totals?.sessions || 0),
          toolsUsed: Number(totals?.tools_used || 0),
          invalidArguments,
          readBeforeWriteBlocks,
          permissionDenied,
          guardBlocks,
          unknownTools,
          executionErrors,
        },
        recentFailures,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/audit', authenticate, (req, res) => {
    try {
      const all = req.query.all === 'true' || req.body?.all === true;
      const days = boundedDays(req.query.days || req.body?.days, 30);
      const workspaceId = req.workspaceId || req.body?.workspaceId || null;

      let result;
      if (all) {
        if (workspaceId) {
          result = db.prepare('DELETE FROM agent_tool_audit WHERE user_id = ? AND workspace_id = ?')
            .run(req.user.id, workspaceId);
        } else {
          result = db.prepare('DELETE FROM agent_tool_audit WHERE user_id = ?').run(req.user.id);
        }
      } else if (workspaceId) {
        result = db.prepare(`
          DELETE FROM agent_tool_audit
          WHERE user_id = ?
            AND workspace_id = ?
            AND julianday(started_at) >= julianday('now', ?)
        `).run(req.user.id, workspaceId, `-${days} days`);
      } else {
        result = db.prepare(`
          DELETE FROM agent_tool_audit
          WHERE user_id = ?
            AND julianday(started_at) >= julianday('now', ?)
        `).run(req.user.id, `-${days} days`);
      }

      res.json({
        success: true,
        deleted: result?.changes || 0,
        windowDays: all ? null : days,
        all,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/evals', authenticate, (req, res) => {
    try {
      const limit = boundedLimit(req.query.limit, 10, 50);
      const workspaceId = req.workspaceId || req.query.workspaceId || null;
      const rows = workspaceId
        ? db.prepare(`
            SELECT *
            FROM agent_eval_runs
            WHERE user_id = ? AND (workspace_id = ? OR workspace_id IS NULL)
            ORDER BY created_at DESC
            LIMIT ?
          `).all(req.user.id, workspaceId, limit)
        : db.prepare(`
            SELECT *
            FROM agent_eval_runs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(req.user.id, limit);
      res.json({ success: true, count: rows.length, evals: rows.map(normalizeEvalRun) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/evals/active', authenticate, (req, res) => {
    if (!activeEval) return res.json({ success: true, active: null });
    if (activeEval.userId && activeEval.userId !== req.user.id) {
      return res.json({ success: true, active: null });
    }
    res.json({
      success: true,
      active: {
        id: activeEval.id,
        mode: activeEval.mode,
        phase: activeEval.phase,
        label: activeEval.label,
        elapsedMs: Date.now() - activeEval.startedAt,
        createdAt: activeEval.createdAt,
        updatedAt: activeEval.updatedAt,
      },
    });
  });

  router.post('/evals', authenticate, async (req, res) => {
    try {
      const mode = req.body?.mode === 'live' ? 'live' : 'deterministic';
      if (mode === 'live' && req.body?.confirmLive !== true) {
        return res.status(400).json({
          success: false,
          error: 'Live evals call the active model provider. Pass confirmLive=true to run one.',
        });
      }

      const payload = await runEvalProcess({
        mode,
        keepSandbox: req.body?.keepSandbox === true,
        userId: req.user.id,
        workspaceId: req.workspaceId || req.body?.workspaceId || null,
      });

      res.json(payload);
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export default createAgentMetricsRouter;
