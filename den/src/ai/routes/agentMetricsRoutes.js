import express from 'express';
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

function runEvalProcess({ mode = 'deterministic', keepSandbox = false, userId = null, workspaceId = null } = {}) {
  if (activeEval) {
    const error = new Error('An agent eval is already running.');
    error.status = 409;
    throw error;
  }

  const live = mode === 'live';
  const args = [EVAL_SCRIPT, '--json'];
  if (live) args.push('--live');
  if (live && keepSandbox) args.push('--keep-sandbox');
  if (live && userId) args.push('--user-id', userId);
  if (live && workspaceId) args.push('--workspace-id', workspaceId);
  const timeoutMs = live ? 6 * 60_000 : 90_000;

  activeEval = { mode, startedAt: Date.now() };

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: DEN_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
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
      stderr += chunk.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        const jsonText = jsonStart >= 0 && jsonEnd >= jsonStart
          ? stdout.slice(jsonStart, jsonEnd + 1)
          : stdout.trim();
        const parsed = JSON.parse(jsonText || '{}');
        resolve({
          ...parsed,
          exitCode: code,
          stderr: stderr.trim(),
        });
      } catch {
        const error = new Error(stderr.trim() || stdout.trim() || `Agent eval exited with code ${code}`);
        error.status = code === 0 ? 500 : 400;
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
