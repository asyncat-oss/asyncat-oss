// den/src/ai/routes/agentRoutes.js
// ─── Agent API Routes ────────────────────────────────────────────────────────
// SSE streaming endpoint for the agent runtime + scheduler management.

import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import { initializeAgent, AgentRuntime, AgentSession } from '../../agent/index.js';
import { listCheckpoints, restoreCheckpoint } from '../../agent/AgentRuntime.js';
import { loadSkills, listSkills } from '../../agent/skills.js';
import { getAiClientForUser } from '../controllers/ai/chat/chatRouter.js';
import { scheduleJob, listJobs, deleteJob, enableJob, disableJob, initScheduler } from '../../agent/Scheduler.js';
import { PermissionRules } from '../../agent/PermissionRules.js';
import { listMemories, normalizeMemoryRow, searchMemories } from '../../agent/tools/memoryTools.js';
import { getMcpStatus, listMcpServers, readMcpConfig, reloadMcpTools, writeMcpConfig } from '../../agent/tools/mcpTools.js';
import { randomUUID } from 'crypto';
import path from 'path';

const router = express.Router();
const pendingPermissions = new Map();
const pendingUserQuestions = new Map();
const MCP_CONFIG_PATH = path.resolve(process.cwd(), 'data', 'mcp.json');

// Initialize agent tools on first load
await initializeAgent();

// Initialize scheduler — pass a runAgent function so jobs can call the agent
initScheduler(async ({ goal, userId, workspaceId, workingDir }) => {
  try {
    const { client: aiClient, model, isLocal, supportsNativeTools } = getAiClientForUser(userId);
    const agent = new AgentRuntime({
      aiClient, model, isLocal, supportsNativeTools,
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

function getWorkspaceId(req, db) {
  return req.workspaceId ||
    db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
}

function createPermissionRequest(req, res) {
  const ownedRequestIds = new Set();

  res.on('close', () => {
    for (const requestId of ownedRequestIds) {
      const pending = pendingPermissions.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve({ decision: 'deny', reason: 'Agent stream closed before approval' });
        pendingPermissions.delete(requestId);
      }
    }
  });

  return (request) => new Promise((resolve) => {
    const requestId = randomUUID();
    ownedRequestIds.add(requestId);

    const timer = setTimeout(() => {
      pendingPermissions.delete(requestId);
      ownedRequestIds.delete(requestId);
      resolve({ decision: 'deny', reason: 'Permission request timed out' });
    }, 5 * 60 * 1000);

    pendingPermissions.set(requestId, {
      userId: req.user.id,
      sessionId: request.sessionId,
      resolve: (decision) => {
        clearTimeout(timer);
        ownedRequestIds.delete(requestId);
        resolve(decision);
      },
      timer,
    });

    res.write(`data: ${JSON.stringify({
      type: 'permission_request',
      data: {
        ...request,
        toolName: request.toolName || request.tool,
        requestId,
        expiresInMs: 5 * 60 * 1000,
      }
    })}\n\n`);
  });
}

function createAskUserRequest(req, res) {
  const ownedRequestIds = new Set();

  res.on('close', () => {
    for (const requestId of ownedRequestIds) {
      const pending = pendingUserQuestions.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve({ success: false, error: 'User did not answer in time' });
        pendingUserQuestions.delete(requestId);
      }
    }
  });

  return (request) => new Promise((resolve) => {
    const requestId = randomUUID();
    ownedRequestIds.add(requestId);

    const timer = setTimeout(() => {
      pendingUserQuestions.delete(requestId);
      ownedRequestIds.delete(requestId);
      resolve({ success: false, error: 'User did not answer in time' });
    }, 5 * 60 * 1000);

    pendingUserQuestions.set(requestId, {
      userId: req.user.id,
      sessionId: request.sessionId,
      resolve: (answer) => {
        clearTimeout(timer);
        ownedRequestIds.delete(requestId);
        resolve(answer);
      },
      timer,
    });

    res.write(`data: ${JSON.stringify({
      type: 'ask_user',
      data: {
        requestId,
        sessionId: request.sessionId,
        question: request.question,
        choices: Array.isArray(request.choices) ? request.choices.slice(0, 8) : [],
        default: request.default ?? null,
        round: request.round,
        expiresInMs: 5 * 60 * 1000,
      }
    })}\n\n`);
  });
}

/**
 * GET /api/agent/tools
 * Return all registered tools grouped by category.
 */
router.get('/tools', authenticate, async (req, res) => {
  const { toolRegistry } = await import('../../agent/index.js');
  const tools = toolRegistry.all().map(t => ({
    name: t.name,
    description: t.description,
    permission: t.permission,
    category: t.category || 'general',
  }));
  res.json({ tools });
});

/**
 * GET /api/agent/skills
 * Return all skills (bundled + user) with full detail.
 */
router.get('/skills', authenticate, (req, res) => {
  loadSkills();
  const skills = listSkills().map(s => ({
    name: s.name,
    description: s.description || '',
    brain_region: s.brain_region || 'unknown',
    weight: parseFloat(s.weight || 1),
    tags: Array.isArray(s.tags) ? s.tags : (typeof s.tags === 'string' ? s.tags.split(',').map(t => t.trim()) : []),
    when_to_use: s.when_to_use || '',
    body: s.body || '',
    source: s.source || 'bundled',
  }));
  res.json({ success: true, count: skills.length, skills });
});

/**
 * GET /api/agent/skills/:name
 * Return a single skill by name with full body.
 */
router.get('/skills/:name', authenticate, (req, res) => {
  loadSkills();
  const skill = listSkills().find(s => s.name === req.params.name);
  if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
  res.json({
    success: true,
    skill: {
      name: skill.name,
      description: skill.description || '',
      brain_region: skill.brain_region || 'unknown',
      weight: parseFloat(skill.weight || 1),
      tags: Array.isArray(skill.tags) ? skill.tags : (typeof skill.tags === 'string' ? skill.tags.split(',').map(t => t.trim()) : []),
      when_to_use: skill.when_to_use || '',
      body: skill.body || '',
      source: skill.source || 'bundled',
    },
  });
});

/**
 * POST /api/agent/run
 * Run the agent with SSE streaming.
 *
 * Body: { goal, conversationHistory?, workingDir?, maxRounds? }
 */
router.post('/run', authenticate, async (req, res) => {
  try {
    const { goal, conversationHistory = [], workingDir, maxRounds, autoApprove, continueSessionId } = req.body;

    if (!goal || !goal.trim()) {
      return res.status(400).json({ success: false, error: 'Goal is required' });
    }

    // Get user's AI provider
    const { client: aiClient, model, isLocal, supportsNativeTools } = getAiClientForUser(req.user.id);

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
      supportsNativeTools,
      userId: req.user.id,
      workspaceId: req.workspaceId,
      workingDir: workingDir || process.cwd(),
      maxRounds: maxRounds || 25,
      autoApprove: autoApprove === true || autoApprove === 'all',
      requestPermission: createPermissionRequest(req, res),
      askUser: createAskUserRequest(req, res),
      continueSessionId,
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
 * GET /api/agent/sessions/:id/audit
 * Get audited tool calls for a session.
 */
router.get('/sessions/:id/audit', authenticate, async (req, res) => {
  try {
    const { default: db } = await import('../../db/client.js');
    const session = db.prepare(
      'SELECT id FROM agent_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const rows = db.prepare(`
      SELECT id, session_id, tool_name, permission_level, permission_decision,
             permission_reason, working_dir, args, result, success, round,
             started_at, completed_at
      FROM agent_tool_audit
      WHERE session_id = ? AND user_id = ?
      ORDER BY started_at ASC
    `).all(req.params.id, req.user.id).map(row => ({
      ...row,
      args: JSON.parse(row.args || '{}'),
      result: row.result ? JSON.parse(row.result) : null,
      success: row.success === null ? null : Boolean(row.success),
    }));

    res.json({ success: true, count: rows.length, audit: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
 * POST /api/agent/permissions/:requestId
 * Resolve a pending tool permission request.
 * Body: { decision: "allow" | "deny" | "allow_session", reason? }
 */
router.post('/permissions/:requestId', authenticate, (req, res) => {
  const pending = pendingPermissions.get(req.params.requestId);
  if (!pending || pending.userId !== req.user.id) {
    // Already resolved (stream closed, timeout, or duplicate POST) — treat as noop
    return res.json({ success: true, decision: req.body?.decision || 'deny', note: 'already_resolved' });
  }

  const decision = ['allow', 'deny', 'allow_session', 'allow_always_tool', 'allow_always_command'].includes(req.body?.decision)
    ? req.body.decision
    : 'deny';

  pendingPermissions.delete(req.params.requestId);
  pending.resolve({
    decision,
    reason: req.body?.reason || null,
  });

  res.json({ success: true, decision });
});

/**
 * POST /api/agent/permission
 * Legacy resolver for older CLI clients that only know sessionId.
 * Body: { sessionId, decision }
 */
router.post('/permission', authenticate, (req, res) => {
  const { sessionId } = req.body || {};
  const found = [...pendingPermissions.entries()].find(([, pending]) =>
    pending.userId === req.user.id && pending.sessionId === sessionId
  );

  if (!found) {
    return res.json({ success: true, decision: req.body?.decision || 'deny', note: 'already_resolved' });
  }

  const [requestId, pending] = found;
  const decision = ['allow', 'deny', 'allow_session', 'allow_always_tool', 'allow_always_command'].includes(req.body?.decision)
    ? req.body.decision
    : 'deny';

  pendingPermissions.delete(requestId);
  pending.resolve({
    decision,
    reason: req.body?.reason || null,
  });

  res.json({ success: true, decision });
});

/**
 * POST /api/agent/ask/:requestId
 * Resolve a pending ask_user request.
 * Body: { answer }
 */
router.post('/ask/:requestId', authenticate, (req, res) => {
  const pending = pendingUserQuestions.get(req.params.requestId);
  if (!pending || pending.userId !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Question request not found' });
  }

  const answer = req.body?.answer === undefined ? '' : String(req.body.answer);

  pendingUserQuestions.delete(req.params.requestId);
  pending.resolve({ success: true, answer });

  res.json({ success: true });
});

/**
 * GET /api/agent/permissions/rules
 * List saved permission rules for this user.
 */
router.get('/permissions/rules', authenticate, (req, res) => {
  try {
    const rules = PermissionRules.list({ userId: req.user.id, workspaceId: req.workspaceId });
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent/permissions/rules
 * Add a permission rule.
 * Body: { toolName, argField?, argPattern?, action?, scope?, note? }
 */
router.post('/permissions/rules', authenticate, (req, res) => {
  try {
    const { toolName, argField, argPattern, action, scope, note } = req.body || {};
    if (!toolName) return res.status(400).json({ success: false, error: 'toolName is required' });
    const result = PermissionRules.add({
      userId: req.user.id,
      workspaceId: req.workspaceId,
      toolName,
      argField: argField ?? null,
      argPattern: argPattern ?? null,
      action: action || 'allow',
      scope: scope || 'workspace',
      note: note ?? null,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/agent/permissions/rules/:id
 */
router.delete('/permissions/rules/:id', authenticate, (req, res) => {
  try {
    const removed = PermissionRules.remove(req.params.id);
    if (!removed) return res.status(404).json({ success: false, error: 'Rule not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── MCP management ──────────────────────────────────────────────────────────
router.get('/mcp', authenticate, (_req, res) => {
  try {
    res.json({ success: true, servers: listMcpServers(MCP_CONFIG_PATH), status: getMcpStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/mcp', authenticate, async (req, res) => {
  try {
    const { name, command, args = [], env = {}, disabled = false } = req.body || {};
    if (!name || !command) return res.status(400).json({ success: false, error: 'name and command are required' });
    const config = readMcpConfig(MCP_CONFIG_PATH);
    config.mcpServers[name] = { command, args: Array.isArray(args) ? args : [], env, disabled: !!disabled };
    writeMcpConfig(MCP_CONFIG_PATH, config);
    const status = await reloadMcpTools(MCP_CONFIG_PATH);
    res.json({ success: true, servers: listMcpServers(MCP_CONFIG_PATH), status });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/mcp/:name', authenticate, async (req, res) => {
  try {
    const config = readMcpConfig(MCP_CONFIG_PATH);
    const server = config.mcpServers?.[req.params.name];
    if (!server) return res.status(404).json({ success: false, error: 'MCP server not found' });
    if (req.body?.disabled !== undefined) server.disabled = !!req.body.disabled;
    if (req.body?.command) server.command = req.body.command;
    if (Array.isArray(req.body?.args)) server.args = req.body.args;
    if (req.body?.env && typeof req.body.env === 'object') server.env = req.body.env;
    writeMcpConfig(MCP_CONFIG_PATH, config);
    const status = await reloadMcpTools(MCP_CONFIG_PATH);
    res.json({ success: true, server: req.params.name, status });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/mcp/:name', authenticate, async (req, res) => {
  try {
    const config = readMcpConfig(MCP_CONFIG_PATH);
    if (!config.mcpServers?.[req.params.name]) return res.status(404).json({ success: false, error: 'MCP server not found' });
    delete config.mcpServers[req.params.name];
    writeMcpConfig(MCP_CONFIG_PATH, config);
    const status = await reloadMcpTools(MCP_CONFIG_PATH);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/mcp/reload', authenticate, async (_req, res) => {
  try {
    const status = await reloadMcpTools(MCP_CONFIG_PATH);
    res.json({ success: true, status, servers: listMcpServers(MCP_CONFIG_PATH) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/checkpoints', authenticate, (_req, res) => {
  res.json({ success: true, checkpoints: listCheckpoints() });
});

router.post('/checkpoints/restore', authenticate, (req, res) => {
  const result = restoreCheckpoint(req.body?.id || null);
  res.status(result.success ? 200 : 404).json(result);
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
 * PATCH /api/agent/sessions/:id
 * Rename an agent session (update goal text used as display title).
 */
router.patch('/sessions/:id', authenticate, async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal?.trim()) return res.status(400).json({ success: false, error: 'Goal is required' });
    const { default: db } = await import('../../db/client.js');
    const result = db.prepare(
      'UPDATE agent_sessions SET goal = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(goal.trim(), new Date().toISOString(), req.params.id, req.user.id);
    if (result.changes > 0) {
      res.json({ success: true, goal: goal.trim() });
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
    const workspaceId = getWorkspaceId(req, db);
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const q = req.query.q?.trim();
    const kind = req.query.kind || req.query.memory_type || 'all';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || (q ? 20 : 50))));
    const rows = q
      ? searchMemories({
        userId: req.user.id,
        workspaceId,
        query: q,
        kind,
        limit,
        bumpAccess: true,
      })
      : listMemories({
        userId: req.user.id,
        workspaceId,
        kind,
        limit,
      });
    res.json({ success: true, count: rows.length, memories: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent/memory/:key
 * Show one memory by key.
 */
router.get('/memory/:key', authenticate, async (req, res) => {
  try {
    const { default: db } = await import('../../db/client.js');
    const workspaceId = getWorkspaceId(req, db);
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const row = db.prepare(`
      SELECT id, key, content, memory_type, tags, importance, last_accessed_at,
             access_count, created_at, updated_at
      FROM agent_memory
      WHERE user_id = ? AND workspace_id = ? AND key = ?
    `).get(req.user.id, workspaceId, req.params.key);

    if (!row) return res.status(404).json({ success: false, error: `No memory found with key: ${req.params.key}` });

    db.prepare(
      "UPDATE agent_memory SET access_count = access_count + 1, last_accessed_at = datetime('now') WHERE id = ?"
    ).run(row.id);

    res.json({ success: true, memory: normalizeMemoryRow({ ...row, access_count: Number(row.access_count || 0) + 1 }) });
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
    const workspaceId = getWorkspaceId(req, db);
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

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

/**
 * DELETE /api/agent/memory/:key
 * Delete a memory by key.
 */
router.delete('/memory/:key', authenticate, async (req, res) => {
  try {
    const { default: db } = await import('../../db/client.js');
    const workspaceId = getWorkspaceId(req, db);
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const result = db.prepare(
      'DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ?'
    ).run(req.user.id, workspaceId, req.params.key);

    if (result.changes > 0) {
      res.json({ success: true, message: `Deleted memory: ${req.params.key}` });
    } else {
      res.status(404).json({ success: false, error: `No memory found with key: ${req.params.key}` });
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

    const { client: aiClient, model, isLocal, supportsNativeTools } = getAiClientForUser(req.user.id);
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
            aiClient, model, isLocal, supportsNativeTools,
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
