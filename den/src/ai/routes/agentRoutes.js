// den/src/ai/routes/agentRoutes.js
// ─── Agent API Routes ────────────────────────────────────────────────────────
// SSE streaming endpoint for the agent runtime + scheduler management.

import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import { initializeAgent, AgentRuntime, AgentSession } from '../../agent/index.js';
import { listCheckpoints, restoreCheckpoint } from '../../agent/AgentRuntime.js';
import { loadSkills, listSkills } from '../../agent/skills.js';
import { loadSoul, readSoulRaw, writeSoul, listSouls } from '../../agent/prompts/agentSystemPrompt.js';
import { getAiClientForUser } from '../controllers/ai/chat/chatRouter.js';
import { scheduleJob, listJobs, deleteJob, enableJob, disableJob, initScheduler } from '../../agent/Scheduler.js';
import { listMemories, normalizeMemoryRow, searchMemories } from '../../agent/tools/memoryTools.js';
import { getMcpStatus, listMcpServers, readMcpConfig, reloadMcpTools, writeMcpConfig } from '../../agent/tools/mcpTools.js';
import { listProfiles, getProfile, createProfile, updateProfile, deleteProfile, getDefaultProfile } from '../../agent/ProfileManager.js';
import db from '../../db/client.js';
import { createHash, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const router = express.Router();
const pendingPermissions = new Map();
const pendingUserQuestions = new Map();
const MCP_CONFIG_PATH = path.resolve(process.cwd(), 'data', 'mcp.json');

function writeAgentSse(res, payload) {
  if (res.destroyed || res.writableEnded) return false;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.flush?.();
  return true;
}

function writeAgentSseComment(res, comment) {
  if (res.destroyed || res.writableEnded) return false;
  res.write(`: ${comment}\n\n`);
  res.flush?.();
  return true;
}

function markStaleActiveSessions() {
  try {
    const rows = db.prepare(
      "SELECT id, scratchpad FROM agent_sessions WHERE status = 'active'"
    ).all();
    const update = db.prepare(`
      UPDATE agent_sessions
      SET status = 'failed', scratchpad = ?, updated_at = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();
    for (const row of rows) {
      let scratchpad = {};
      try { scratchpad = JSON.parse(row.scratchpad || '{}'); } catch {}
      scratchpad._error = scratchpad._error || 'Agent run was interrupted before it could finish.';
      update.run(JSON.stringify(scratchpad), now, row.id);
    }
    if (rows.length > 0) {
      console.warn(`[agent] Marked ${rows.length} stale active session(s) as failed after restart`);
    }
  } catch (err) {
    console.warn('[agent] Failed to mark stale active sessions:', err.message);
  }
}

// Initialize agent tools on first load
await initializeAgent();
markStaleActiveSessions();

// Initialize scheduler — pass a runAgent function so jobs can call the agent
initScheduler(async ({ goal, userId, workspaceId, workingDir, profileId }) => {
  try {
    const { client: aiClient, model, isLocal, supportsNativeTools } = getAiClientForUser(userId);
    const profile = profileId ? getProfile(profileId, userId) : getDefaultProfile(userId);
    let resolvedSoul = null;
    if (profile?.soul_override) {
      const withoutFrontmatter = profile.soul_override.replace(/^---[\s\S]*?---\n?/, '').trim();
      resolvedSoul = withoutFrontmatter || null;
    } else if (profile?.soul_name && profile.soul_name !== 'default') {
      resolvedSoul = loadSoul(profile.soul_name);
    }
    const agent = new AgentRuntime({
      aiClient, model, isLocal, supportsNativeTools,
      userId, workspaceId,
      workingDir: workingDir || profile?.working_dir || process.cwd(),
      maxRounds: profile?.max_rounds || 20,
      autoApprove: profile?.auto_approve || false,
      soul: resolvedSoul,
    });
    if (Array.isArray(profile?.always_allowed_tools)) {
      profile.always_allowed_tools.forEach(tool => {
        if (typeof tool === 'string' && tool.trim()) agent.sessionApprovedTools.add(tool.trim());
      });
    }
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

const FILE_WRITE_TOOLS = new Set(['write_file', 'create_file']);
const FILE_EDIT_TOOLS = new Set(['edit_file']);
const FILE_DELETE_TOOLS = new Set(['file_delete', 'delete_file']);
const FILE_CREATE_TOOLS = new Set(['create_directory']);
const FILE_COPY_TOOLS = new Set(['file_copy', 'copy_file']);
const FILE_MOVE_TOOLS = new Set(['file_move', 'move_file']);
const SHELL_TOOLS = new Set(['run_command', 'run_python', 'run_node']);

function loadOwnedSession(sessionId, userId) {
  const session = AgentSession.load(sessionId);
  if (!session || session.userId !== userId) return null;
  return session;
}

function getSessionAuditRows(sessionId, userId) {
  return db.prepare(`
    SELECT id, session_id, tool_name, permission_level, permission_decision,
           permission_reason, working_dir, args, result, success, round,
           started_at, completed_at
    FROM agent_tool_audit
    WHERE session_id = ? AND user_id = ?
    ORDER BY started_at ASC
  `).all(sessionId, userId).map(row => ({
    ...row,
    args: JSON.parse(row.args || '{}'),
    result: row.result ? JSON.parse(row.result) : null,
    success: row.success === null ? null : Boolean(row.success),
  }));
}

function deriveAgentChanges(rows = []) {
  const files = new Map();
  const commands = [];

  for (const row of rows) {
    const tool = row.tool_name || row.tool;
    const args = row.args || {};
    const result = row.result || {};
    const succeeded = row.success === true || (row.success === null && result.success !== false && !result.error);
    if (!succeeded) continue;

    const base = {
      tool,
      workingDir: row.working_dir || row.workingDir || null,
      timestamp: row.completed_at || row.started_at || row.timestamp || null,
      auditId: row.id || null,
    };

    if (FILE_WRITE_TOOLS.has(tool) && args.path) {
      files.set(args.path, { ...base, type: result.action === 'created' ? 'created' : 'written', path: args.path });
    } else if (FILE_EDIT_TOOLS.has(tool) && args.path) {
      if (!files.has(args.path)) files.set(args.path, { ...base, type: 'edited', path: args.path });
    } else if (FILE_DELETE_TOOLS.has(tool) && args.path) {
      files.set(args.path, { ...base, type: 'deleted', path: args.path });
    } else if (FILE_CREATE_TOOLS.has(tool) && args.path) {
      files.set(args.path, { ...base, type: 'directory', path: args.path });
    } else if (FILE_COPY_TOOLS.has(tool) && args.destination) {
      files.set(args.destination, { ...base, type: 'copied', path: args.destination, source: args.source || null });
    } else if (FILE_MOVE_TOOLS.has(tool) && args.destination) {
      files.set(args.destination, { ...base, type: 'moved', path: args.destination, source: args.source || null });
    } else if (SHELL_TOOLS.has(tool)) {
      commands.push({
        ...base,
        type: 'command',
        command: args.command || args.code || '',
        output: result.output || result.stdout || '',
      });
    }
  }

  return { files: [...files.values()], commands };
}

function resolveWithin(root, relPath) {
  const workingDir = path.resolve(root || process.cwd());
  const resolved = path.resolve(workingDir, relPath || '.');
  if (!resolved.startsWith(workingDir + path.sep) && resolved !== workingDir) return null;
  return { workingDir, resolved };
}

function fileStateFor(change, fallbackWorkingDir) {
  const root = change.workingDir || fallbackWorkingDir || process.cwd();
  const resolvedInfo = resolveWithin(root, change.path);
  if (!resolvedInfo) return { path: change.path, state: 'unknown', error: 'Path outside working directory' };

  const { resolved } = resolvedInfo;
  if (!fs.existsSync(resolved)) {
    return {
      path: change.path,
      state: change.type === 'deleted' ? 'deleted' : 'missing',
      exists: false,
      workingDir: root,
    };
  }

  const stat = fs.statSync(resolved);
  const changedAtMs = change.timestamp ? Date.parse(change.timestamp) : null;
  const changedSinceAgent = Number.isFinite(changedAtMs) && stat.mtimeMs > changedAtMs + 1500;
  const state = stat.isDirectory()
    ? 'directory'
    : changedSinceAgent ? 'changed_since_agent' : 'exists';
  let hash = null;
  if (stat.isFile() && stat.size <= 5 * 1024 * 1024) {
    try {
      hash = createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
    } catch { /* ignore */ }
  }

  return {
    path: change.path,
    state,
    exists: true,
    kind: stat.isDirectory() ? 'directory' : 'file',
    size: stat.isFile() ? stat.size : null,
    mtime: stat.mtime.toISOString(),
    hash,
    workingDir: root,
  };
}

function checkpointAvailability(checkpoint) {
  if (!checkpoint?.id) return { available: false, reason: 'No baseline checkpoint was recorded for this run.' };
  if (checkpoint.kind === 'dir_snapshot') {
    if (!checkpoint.dir || !fs.existsSync(checkpoint.dir)) {
      return { available: false, reason: 'The baseline snapshot is missing from disk.' };
    }
    return { available: true, reason: null };
  }
  if (checkpoint.kind === 'git_stash') {
    try {
      const list = execGitStashList(checkpoint.workspace);
      return list.includes(checkpoint.ref)
        ? { available: true, reason: null }
        : { available: false, reason: 'The git stash checkpoint is no longer present.' };
    } catch (err) {
      return { available: false, reason: err.message };
    }
  }
  return { available: false, reason: 'Unsupported checkpoint type.' };
}

function execGitStashList(cwd) {
  return execSync('git stash list', { cwd: cwd || process.cwd(), encoding: 'utf8', timeout: 3000 });
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

    const sent = writeAgentSse(res, {
      type: 'permission_request',
      data: {
        ...request,
        toolName: request.toolName || request.tool,
        requestId,
        expiresInMs: 5 * 60 * 1000,
      }
    });

    if (!sent) {
      clearTimeout(timer);
      pendingPermissions.delete(requestId);
      ownedRequestIds.delete(requestId);
      resolve({ decision: 'deny', reason: 'Agent stream closed before approval' });
    }
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

    const sent = writeAgentSse(res, {
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
    });

    if (!sent) {
      clearTimeout(timer);
      pendingUserQuestions.delete(requestId);
      ownedRequestIds.delete(requestId);
      resolve({ success: false, error: 'Agent stream closed before answer' });
    }
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
 * GET /api/agent/souls
 * List all available soul names.
 */
router.get('/souls', authenticate, (req, res) => {
  res.json({ success: true, souls: listSouls() });
});

/**
 * GET /api/agent/soul
 * Return the raw soul file content (with frontmatter, for editing).
 */
router.get('/soul', authenticate, (req, res) => {
  const { name = 'default' } = req.query;
  const content = readSoulRaw(name);
  if (content === null) {
    return res.status(404).json({ success: false, error: `Soul "${name}" not found` });
  }
  res.json({ success: true, name, content });
});

/**
 * PUT /api/agent/soul
 * Save updated soul file content.
 */
router.put('/soul', authenticate, (req, res) => {
  try {
    const { name = 'default', content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'content is required' });
    }
    writeSoul(name, content);
    res.json({ success: true, name });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500)
      .json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent/run
 * Run the agent with SSE streaming.
 *
 * Body: { goal, conversationHistory?, workingDir?, maxRounds? }
 */
router.post('/run', authenticate, async (req, res) => {
  let heartbeatInterval = null;
  try {
    const { goal, conversationHistory = [], workingDir, maxRounds, autoApprove, continueSessionId, preApprovedTools = [], profileId } = req.body;

    if (!goal || !goal.trim()) {
      return res.status(400).json({ success: false, error: 'Goal is required' });
    }

    // Resolve profile (if provided)
    let profile = null;
    if (profileId) {
      profile = getProfile(profileId, req.user.id);
    }
    if (!profile && !profileId) {
      profile = getDefaultProfile(req.user.id);
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
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Encoding', 'identity');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    req.socket?.setTimeout?.(0);
    heartbeatInterval = setInterval(() => {
      writeAgentSseComment(res, 'ping');
    }, 15000);
    res.on('close', () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    });

    // Resolve final run params (profile < request body, request body wins)
    const resolvedWorkingDir = workingDir || profile?.working_dir || process.cwd();
    const resolvedMaxRounds  = maxRounds  || profile?.max_rounds  || 25;
    const resolvedAutoApprove = autoApprove === true || autoApprove === 'all' || profile?.auto_approve || false;
    const profileTools = Array.isArray(profile?.always_allowed_tools) ? profile.always_allowed_tools : [];

    // Resolve soul: profile soul_override > profile soul_name > default
    let resolvedSoul = null;
    if (profile?.soul_override) {
      const withoutFrontmatter = profile.soul_override.replace(/^---[\s\S]*?---\n?/, '').trim();
      resolvedSoul = withoutFrontmatter || null;
    } else if (profile?.soul_name && profile.soul_name !== 'default') {
      resolvedSoul = loadSoul(profile.soul_name);
    }

    // Create and run agent
    const agent = new AgentRuntime({
      aiClient,
      model,
      isLocal,
      supportsNativeTools,
      userId: req.user.id,
      workspaceId: req.workspaceId,
      workingDir: resolvedWorkingDir,
      maxRounds: resolvedMaxRounds,
      autoApprove: resolvedAutoApprove,
      requestPermission: createPermissionRequest(req, res),
      askUser: createAskUserRequest(req, res),
      continueSessionId,
      soul: resolvedSoul,
    });

    const allPreApproved = [...preApprovedTools, ...profileTools];
    if (allPreApproved.length > 0) {
      allPreApproved.forEach(tool => {
        if (typeof tool === 'string' && tool.trim()) {
          agent.sessionApprovedTools.add(tool.trim());
        }
      });
    }

    await agent.runStreaming(goal, conversationHistory, res);

  } catch (error) {
    console.error('Agent error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      writeAgentSse(res, { type: 'error', data: { message: error.message } });
      res.end();
    }
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
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
 * GET /api/agent/sessions/:id/changes/state
 * Return historical changes for a run plus current filesystem state.
 */
router.get('/sessions/:id/changes/state', authenticate, (req, res) => {
  try {
    const session = loadOwnedSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const rows = getSessionAuditRows(req.params.id, req.user.id);
    const changes = deriveAgentChanges(rows);
    const fileStates = Object.fromEntries(
      changes.files.map(change => [change.path, fileStateFor(change, session.workingDir)])
    );
    const checkpoint = session.scratchpad?.baselineCheckpoint || null;
    const availability = checkpointAvailability(checkpoint);

    res.json({
      success: true,
      sessionId: session.id,
      goal: session.goal,
      changes,
      fileStates,
      checkpoint: checkpoint ? {
        id: checkpoint.id,
        kind: checkpoint.kind,
        workspace: checkpoint.workspace,
        createdAt: checkpoint.createdAt,
        baseline: Boolean(checkpoint.baseline),
      } : null,
      revert: {
        available: availability.available,
        reason: availability.reason,
        revertedAt: session.scratchpad?.revertedAt || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent/sessions/:id/revert
 * Restore the run's baseline checkpoint.
 */
router.post('/sessions/:id/revert', authenticate, (req, res) => {
  try {
    const session = loadOwnedSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const checkpoint = session.scratchpad?.baselineCheckpoint || null;
    const availability = checkpointAvailability(checkpoint);
    if (!availability.available) {
      return res.status(409).json({ success: false, error: availability.reason || 'Revert unavailable' });
    }

    const result = restoreCheckpoint(checkpoint);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Revert failed', checkpoint: result.checkpoint });
    }

    session.setScratchpad('revertedAt', new Date().toISOString());
    session.setScratchpad('revertCheckpointId', checkpoint.id);
    session.save();

    res.json({
      success: true,
      message: 'Run reverted to its baseline checkpoint.',
      checkpoint: {
        id: checkpoint.id,
        kind: checkpoint.kind,
        workspace: checkpoint.workspace,
        createdAt: checkpoint.createdAt,
      },
      revertedAt: session.scratchpad.revertedAt,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
    const { name, goal, schedule, profileId } = req.body;
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
      profileId: profileId || null,
      workingDir: req.body.workingDir || req.body.working_dir || '.',
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

/**
 * GET /api/agent/files/list?path=<relative-dir>&depth=<1-3>
 * List directory contents (lazy, depth-limited).
 */
router.get('/files/list', authenticate, (req, res) => {
  const dirPath = req.query.path || '.';
  const depth   = Math.min(Math.max(Number(req.query.depth || 1), 0), 3);

  const workingDir = path.resolve(process.cwd());
  const resolved   = path.resolve(workingDir, dirPath);

  if (!resolved.startsWith(workingDir + path.sep) && resolved !== workingDir) {
    return res.status(403).json({ success: false, error: 'Path outside working directory' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ success: false, error: 'Directory not found' });
  }
  if (!fs.statSync(resolved).isDirectory()) {
    return res.status(400).json({ success: false, error: 'Not a directory' });
  }

  const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', 'venv', '.venv']);

  function walk(dir, currentDepth) {
    let items;
    try {
      items = fs.readdirSync(dir).filter(n => !n.startsWith('.') && !SKIP.has(n)).sort();
    } catch { return []; }

    return items.map(name => {
      const full = path.join(dir, name);
      const rel  = path.relative(workingDir, full);
      let stat;
      try { stat = fs.statSync(full); } catch { return null; }
      if (!stat) return null;

      if (stat.isDirectory()) {
        return {
          name, path: rel, type: 'dir',
          children: currentDepth < depth ? walk(full, currentDepth + 1) : null,
        };
      }
      return {
        name, path: rel, type: 'file',
        size: stat.size,
        mtime: stat.mtime,
        ext: path.extname(name).slice(1).toLowerCase(),
      };
    }).filter(Boolean);
  }

  try {
    res.json({ success: true, path: dirPath, entries: walk(resolved, 0) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent/files/entry?path=<path>
 * Returns directory listing OR file content depending on what the path is.
 * One round-trip for the FilesPage to determine what to render.
 */
router.get('/files/entry', authenticate, (req, res) => {
  const entryPath = req.query.path || '.';
  const workingDir = path.resolve(process.cwd());
  const resolved   = path.resolve(workingDir, entryPath);

  if (!resolved.startsWith(workingDir + path.sep) && resolved !== workingDir) {
    return res.status(403).json({ success: false, error: 'Path outside working directory' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ success: false, error: 'Path not found' });
  }

  const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', 'venv', '.venv']);

  try {
    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      let items;
      try { items = fs.readdirSync(resolved).filter(n => !n.startsWith('.') && !SKIP.has(n)).sort(); }
      catch { items = []; }

      const entries = items.map(name => {
        const full = path.join(resolved, name);
        const rel  = path.relative(workingDir, full);
        let s;
        try { s = fs.statSync(full); } catch { return null; }
        if (!s) return null;
        if (s.isDirectory()) return { name, path: rel, type: 'dir', mtime: s.mtime };
        return { name, path: rel, type: 'file', size: s.size, mtime: s.mtime, ext: path.extname(name).slice(1).toLowerCase() };
      }).filter(Boolean);

      const dirs  = entries.filter(e => e.type === 'dir');
      const files = entries.filter(e => e.type === 'file');

      return res.json({ success: true, type: 'dir', path: entryPath, entries: [...dirs, ...files] });
    }

    // File
    if (stat.size > 1024 * 1024) {
      return res.json({ success: true, type: 'file', path: entryPath, tooLarge: true,
        size: stat.size, mtime: stat.mtime, ext: path.extname(entryPath).slice(1).toLowerCase() });
    }
    const content = fs.readFileSync(resolved, 'utf8');
    res.json({ success: true, type: 'file', path: entryPath,
      content, size: stat.size, mtime: stat.mtime, ext: path.extname(entryPath).slice(1).toLowerCase() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent/files/read?path=<relative-path>
 * Read a file from the agent's working directory.
 */
router.get('/files/read', authenticate, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ success: false, error: 'path is required' });

  const workingDir = path.resolve(process.cwd());
  const resolved = path.resolve(workingDir, filePath);

  if (!resolved.startsWith(workingDir + path.sep) && resolved !== workingDir) {
    return res.status(403).json({ success: false, error: 'Path outside working directory' });
  }

  try {
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Path is a directory' });
    }
    if (stat.size > 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'File too large to preview (>1MB)' });
    }
    const content = fs.readFileSync(resolved, 'utf8');
    res.json({ success: true, content, path: filePath, size: stat.size, mtime: stat.mtime });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE ROUTES — /api/agent/profiles
// ══════════════════════════════════════════════════════════════════════════════

router.get('/profiles', authenticate, (req, res) => {
  try {
    const profiles = listProfiles(req.user.id);
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/profiles', authenticate, (req, res) => {
  try {
    const { name, description, icon, color, soulName, soulOverride, workingDir, maxRounds, autoApprove, alwaysAllowedTools, isDefault } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
    const profile = createProfile({
      userId: req.user.id, name: name.trim(), description, icon, color,
      soulName, soulOverride, workingDir, maxRounds, autoApprove, alwaysAllowedTools, isDefault,
    });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/profiles/:id', authenticate, (req, res) => {
  try {
    const profile = getProfile(req.params.id, req.user.id);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/profiles/:id', authenticate, (req, res) => {
  try {
    const profile = updateProfile(req.params.id, req.user.id, req.body);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/profiles/:id', authenticate, (req, res) => {
  try {
    deleteProfile(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
