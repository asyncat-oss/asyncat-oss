// den/src/ai/routes/agentRoutes.js
// ─── Agent API Routes ────────────────────────────────────────────────────────
// SSE streaming endpoint for the agent runtime + scheduler management.

import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import { initializeAgent, AgentRuntime, AgentSession } from '../../agent/index.js';
import { getAiClientForUser } from '../controllers/ai/chat/chatRouter.js';
import { scheduleJob, listJobs, deleteJob, enableJob, disableJob, initScheduler } from '../../agent/Scheduler.js';

const router = express.Router();

// Initialize agent tools on first load
await initializeAgent();

// Initialize scheduler — pass a runAgent function so jobs can call the agent
initScheduler(async ({ goal, userId, workspaceId, workingDir }) => {
  try {
    const { client: aiClient, model, isLocal } = getAiClientForUser(userId);
    const agent = new AgentRuntime({
      aiClient, model, isLocal,
      userId, workspaceId,
      workingDir: workingDir || process.cwd(),
      maxRounds: 20,
    });
    return await agent.run(goal);
  } catch (err) {
    console.error('[scheduler] Agent run failed:', err.message);
  }
});

// Auth middleware
const authenticate = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return;
    attachDb(req, res, () => {
      req.workspaceId = req.query?.workspaceId || req.body?.workspaceId || null;
      next();
    });
  });
};

/**
 * POST /api/agent/run
 * Run the agent with SSE streaming.
 *
 * Body: { goal, conversationHistory?, workingDir?, maxRounds? }
 */
router.post('/run', authenticate, async (req, res) => {
  try {
    const { goal, conversationHistory = [], workingDir, maxRounds } = req.body;

    if (!goal || !goal.trim()) {
      return res.status(400).json({ success: false, error: 'Goal is required' });
    }

    // Get user's AI provider
    const { client: aiClient, model, isLocal } = getAiClientForUser(req.user.id);

    // Resolve workspace
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      // Try to get default workspace
      const { default: db } = await import('../../db/client.js');
      const ws = db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id);
      if (ws) req.workspaceId = ws.id;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Create and run agent
    const agent = new AgentRuntime({
      aiClient,
      model,
      isLocal,
      userId: req.user.id,
      workspaceId: req.workspaceId,
      workingDir: workingDir || process.cwd(),
      maxRounds: maxRounds || 25,
    });

    await agent.runStreaming(goal, conversationHistory, res);

  } catch (error) {
    console.error('Agent error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /api/agent/sessions
 * List recent agent sessions.
 */
router.get('/sessions', authenticate, (req, res) => {
  const limit = parseInt(req.query.limit || '20');
  const sessions = AgentSession.listRecent(req.user.id, limit);
  res.json({ success: true, sessions });
});

/**
 * GET /api/agent/sessions/:id
 * Get a specific agent session.
 */
router.get('/sessions/:id', authenticate, (req, res) => {
  const session = AgentSession.load(req.params.id);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, session });
});

/**
 * DELETE /api/agent/sessions/:id
 * Delete an agent session from history.
 */
router.delete('/sessions/:id', authenticate, async (req, res) => {
  try {
    const { default: db } = await import('../../db/client.js');
    const result = db.prepare(
      'DELETE FROM agent_sessions WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes > 0) {
      res.json({ success: true, message: 'Session deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Session not found or access denied' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent/sessions/search?q=term
 * FTS5 search through agent sessions (episodic memory).
 */
router.get('/sessions/search', authenticate, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'q parameter required' });
    }

    const { default: db } = await import('../../db/client.js');

    const rows = db.prepare(`
      SELECT s.id, s.goal, s.status, s.total_rounds, s.created_at, s.updated_at,
             bm25(agent_sessions_fts) as rank
      FROM agent_sessions_fts fts
      JOIN agent_sessions s ON s.id = fts.session_id
      WHERE fts.agent_sessions_fts MATCH ? AND s.user_id = ?
      ORDER BY rank
      LIMIT 20
    `).all(`${q}*`, req.user.id);

    res.json({ success: true, count: rows.length, sessions: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent/sessions/:id/feedback
 * Rate a session and provide feedback.
 * Body: { rating: 1-5, comment?: string, was_helpful?: boolean }
 */
router.post('/sessions/:id/feedback', authenticate, async (req, res) => {
  try {
    const { rating, comment, was_helpful } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'rating 1-5 required' });
    }

    const { default: db } = await import('../../db/client.js');
    const session = db.prepare(
      'SELECT id FROM agent_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    db.prepare(`
      UPDATE agent_sessions
      SET feedback_rating = ?, feedback_comment = ?, was_helpful = ?
      WHERE id = ?
    `).run(rating, comment || null, was_helpful !== undefined ? (was_helpful ? 1 : 0) : null, req.params.id);

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent/sessions/:id/correct
 * Provide a correction for a session.
 * Body: { tool?: string, correction: string, explanation?: string }
 */
router.post('/sessions/:id/correct', authenticate, async (req, res) => {
  try {
    const { tool, correction, explanation } = req.body;
    if (!correction) {
      return res.status(400).json({ success: false, error: 'correction text required' });
    }

    const { default: db } = await import('../../db/client.js');
    const session = db.prepare(
      'SELECT id, corrections FROM agent_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const corrections = session.corrections ? JSON.parse(session.corrections) : [];
    corrections.push({
      tool: tool || 'general',
      correction,
      explanation: explanation || '',
      timestamp: new Date().toISOString()
    });

    db.prepare(`
      UPDATE agent_sessions SET corrections = ? WHERE id = ?
    `).run(JSON.stringify(corrections.slice(-10)), req.params.id);

    res.json({ success: true, message: 'Correction recorded' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent/memory
 * List or search stored memories for the current user's workspace.
 * Query: ?q=search+term
 */
router.get('/memory', authenticate, async (req, res) => {
  try {
    const { default: db } = await import('../../db/client.js');
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;

    const q = req.query.q?.trim();
    let rows;
    if (q) {
      try {
        rows = db.prepare(`
          SELECT m.id, m.key, m.content, m.memory_type, m.updated_at,
                 bm25(agent_memory_fts) as rank
          FROM agent_memory_fts fts
          JOIN agent_memory m ON m.id = fts.memory_id
          WHERE fts.agent_memory_fts MATCH ? AND m.user_id = ? AND m.workspace_id = ?
          ORDER BY rank
          LIMIT 20
        `).all(`${q}*`, req.user.id, workspaceId);
      } catch {
        rows = db.prepare(
          `SELECT key, content, memory_type, updated_at FROM agent_memory
           WHERE user_id = ? AND workspace_id = ? AND (key LIKE ? OR content LIKE ?)
           ORDER BY updated_at DESC LIMIT 50`
        ).all(req.user.id, workspaceId, `%${q}%`, `%${q}%`);
      }
    } else {
      rows = db.prepare(
        'SELECT key, content, memory_type, updated_at FROM agent_memory WHERE user_id = ? AND workspace_id = ? ORDER BY updated_at DESC LIMIT 50'
      ).all(req.user.id, workspaceId);
    }
    res.json({ success: true, count: rows.length, memories: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/agent/memory
 * Delete a memory by key.
 * Body: { key }
 */
router.delete('/memory', authenticate, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'key is required' });

    const { default: db } = await import('../../db/client.js');
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;

    const result = db.prepare(
      'DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ?'
    ).run(req.user.id, workspaceId, key);

    if (result.changes > 0) {
      res.json({ success: true, message: `Deleted memory: ${key}` });
    } else {
      res.status(404).json({ success: false, error: `No memory found with key: ${key}` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULER ROUTES — /api/agent/schedule/*
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/agent/schedule
 * Create a scheduled job.
 * Body: { name, goal, schedule }
 *
 * Schedule formats:
 *   interval:<ms>     — repeat every N milliseconds
 *   once:<ms>         — run once after N milliseconds
 *   at:<ISO>          — run once at a specific datetime
 *   daily:<HH:MM>     — run every day at HH:MM
 *   hourly            — run at the top of every hour
 */
router.post('/schedule', authenticate, async (req, res) => {
  try {
    const { name, goal, schedule } = req.body;
    if (!name || !goal || !schedule) {
      return res.status(400).json({ success: false, error: 'name, goal, and schedule are required' });
    }
    const { default: db } = await import('../../db/client.js');
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;

    const job = scheduleJob({
      name, goal, schedule,
      userId: req.user.id,
      workspaceId: workspaceId || 'default',
      workingDir: req.body.working_dir || process.cwd(),
    });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent/schedule
 * List all scheduled jobs for the current user.
 */
router.get('/schedule', authenticate, async (req, res) => {
  try {
    const { default: db } = await import('../../db/client.js');
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
    const jobs = listJobs(req.user.id, workspaceId || 'default');
    res.json({ success: true, count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/agent/schedule/:id
 * Delete (cancel) a scheduled job.
 */
router.delete('/schedule/:id', authenticate, (req, res) => {
  try {
    deleteJob(req.params.id);
    res.json({ success: true, message: `Job ${req.params.id} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/agent/schedule/:id/enable
 * PATCH /api/agent/schedule/:id/disable
 */
router.patch('/schedule/:id/enable', authenticate, (req, res) => {
  try { enableJob(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
router.patch('/schedule/:id/disable', authenticate, (req, res) => {
  try { disableJob(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-AGENT ROUTES — /api/agent/multi
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/agent/multi
 * Run multiple agent tasks in parallel (supervisor → worker delegation).
 * Body: { tasks: [{ goal, name?, workingDir? }], maxConcurrency? }
 * Returns: { results: [{ name, answer, success }] }
 */
router.post('/multi', authenticate, async (req, res) => {
  try {
    const { tasks, maxConcurrency = 3 } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, error: 'tasks must be a non-empty array' });
    }
    if (tasks.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 parallel tasks per request' });
    }

    const { client: aiClient, model, isLocal } = getAiClientForUser(req.user.id);
    const { default: db } = await import('../../db/client.js');
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;

    // Process tasks in batches of maxConcurrency
    const results = [];
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const batch = tasks.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (task) => {
          const agent = new AgentRuntime({
            aiClient, model, isLocal,
            userId: req.user.id,
            workspaceId,
            workingDir: task.workingDir || process.cwd(),
            maxRounds: 15,
          });
          const answer = await agent.run(task.goal);
          return { name: task.name || task.goal.slice(0, 40), goal: task.goal, answer, success: true };
        })
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
        else results.push({ name: '(failed)', error: r.reason?.message || 'Unknown error', success: false });
      }
    }

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error('Multi-agent error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
