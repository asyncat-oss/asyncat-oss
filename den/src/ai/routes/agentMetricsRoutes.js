import express from 'express';
import db from '../../db/client.js';

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

function emptyToolMetric(row) {
  const total = Number(row.total_calls || 0);
  const failed = Number(row.failed_calls || 0);
  const successful = Math.max(0, total - failed);
  return {
    toolName: row.tool_name,
    totalCalls: total,
    successfulCalls: successful,
    failedCalls: failed,
    successRate: total ? Number((successful / total).toFixed(3)) : null,
    invalidArguments: Number(row.invalid_arguments || 0),
    readBeforeWriteBlocks: Number(row.read_before_write_blocks || 0),
    permissionDenied: Number(row.permission_denied || 0),
    avgDurationMs: row.avg_duration_ms === null || row.avg_duration_ms === undefined
      ? null
      : Number(Number(row.avg_duration_ms).toFixed(1)),
    lastSeenAt: row.last_seen_at,
  };
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
          SUM(CASE WHEN success = 0 OR json_extract(result, '$.success') = 0 OR json_extract(result, '$.error') IS NOT NULL THEN 1 ELSE 0 END) AS failed_calls,
          SUM(CASE WHEN json_extract(result, '$.code') = 'invalid_tool_arguments' THEN 1 ELSE 0 END) AS invalid_arguments,
          SUM(CASE WHEN json_extract(result, '$.code') = 'read_before_write_required' THEN 1 ELSE 0 END) AS read_before_write_blocks,
          SUM(CASE WHEN permission_decision IN ('denied', 'deny') THEN 1 ELSE 0 END) AS permission_denied,
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
        tools: rows.map(emptyToolMetric),
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
          SUM(CASE WHEN success = 0 OR json_extract(result, '$.success') = 0 OR json_extract(result, '$.error') IS NOT NULL THEN 1 ELSE 0 END) AS failed_calls,
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
          AND (success = 0 OR json_extract(result, '$.success') = 0 OR json_extract(result, '$.error') IS NOT NULL)
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
        },
        recentFailures,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export default createAgentMetricsRouter;
