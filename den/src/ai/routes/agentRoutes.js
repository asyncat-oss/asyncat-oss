// den/src/ai/routes/agentRoutes.js
// ─── Agent API Routes ────────────────────────────────────────────────────────
// SSE streaming endpoint for the agent runtime.

import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachCompat } from '../../db/compat.js';
import { initializeAgent, AgentRuntime, AgentSession } from '../../agent/index.js';
import { getAiClientForUser } from '../controllers/ai/chat/chatRouter.js';

const router = express.Router();

// Initialize agent tools on first load
initializeAgent();

// Auth middleware
const authenticate = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return;
    attachCompat(req, res, () => {
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

export default router;
