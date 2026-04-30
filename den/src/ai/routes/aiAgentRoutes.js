// aiAgentRoutes.js — Unified AI/Agent routes
// Combines conversation CRUD (formerly aiRoutes.js) and agent runtime (formerly agentRoutes.js)

import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import db from '../../db/client.js';
import { chatService } from '../controllers/ai/chatService.js';
import { initializeAgent, AgentRuntime, AgentSession } from '../../agent/index.js';
import { listCheckpoints, restoreCheckpoint } from '../../agent/AgentRuntime.js';
import { loadSkills, listSkills } from '../../agent/skills.js';
import { loadSoul, readSoulRaw, writeSoul, listSouls } from '../../agent/prompts/agentSystemPrompt.js';
import { getAiClientForUser } from '../controllers/ai/clientFactory.js';
import { scheduleJob, listJobs, deleteJob, enableJob, disableJob, initScheduler } from '../../agent/Scheduler.js';
import { listMemories, normalizeMemoryRow, searchMemories } from '../../agent/tools/memoryTools.js';
import { getMcpStatus, listMcpServers, readMcpConfig, reloadMcpTools, writeMcpConfig } from '../../agent/tools/mcpTools.js';
import { listProfiles, getProfile, createProfile, updateProfile, deleteProfile, getDefaultProfile } from '../../agent/ProfileManager.js';
import { createHash, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const router = express.Router();
const pendingPermissions = new Map();
const pendingUserQuestions = new Map();
const MCP_CONFIG_PATH = path.resolve(process.cwd(), 'data', 'mcp.json');

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

function getWorkspaceContext(req) {
  return req.query?.workspaceId || req.body?.workspaceId || null;
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

// ─── Auth middleware ──────────────────────────────────────────────────────────

const authenticate = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return;
    attachDb(req, res, () => {
      req.workspaceId = getWorkspaceContext(req);
      next();
    });
  });
};

// ─── Agent init (once on module load) ────────────────────────────────────────

await initializeAgent();
markStaleActiveSessions();

initScheduler(async ({ goal, userId, workspaceId, workingDir, profileId }) => {
  try {
    const { client: aiClient, model, isLocal, supportsNativeTools, providerInfo } = getAiClientForUser(userId);
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
      providerInfo,
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

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATION ROUTES — /api/ai/*
// ══════════════════════════════════════════════════════════════════════════════

router.post('/generate-title', authenticate, async (req, res) => {
  try {
    const { userMessage, aiResponse } = req.body;
    if (!userMessage) return res.status(400).json({ success: false, error: 'userMessage required' });

    const { client: aiClient, model } = getAiClientForUser(req.user.id);

    const response = await aiClient.messages.create({
      model,
      max_completion_tokens: 20,
      system: 'Generate a short, descriptive title (3-6 words, no punctuation, no quotes) for a chat that starts with the following message. Reply with ONLY the title.',
      messages: [{ role: 'user', content: `User said: "${(userMessage || '').slice(0, 200)}"` }]
    });

    const raw = (response.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '');
    const title = raw.slice(0, 60) || null;
    res.json({ success: true, title });
  } catch (error) {
    console.error('Title generation error:', error);
    res.status(500).json({ success: false, error: 'Title generation failed' });
  }
});

router.post('/chats/save', authenticate, async (req, res) => {
  try {
    const { messages, title, mode = 'chat', projectIds = [], metadata = {}, conversationId = null, fileAttachments = null } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Messages array is required and cannot be empty' });
    }

    const result = await chatService.saveConversation(req.user.id, messages, {
      title, mode, projectIds, metadata, conversationId,
      workspaceId: req.workspaceId,
      fileAttachments,
      authenticatedDb: req.db
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    console.error('Save conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to save conversation' });
  }
});

router.post('/chats/autosave', authenticate, async (req, res) => {
  try {
    const { messages, mode = 'chat', projectIds = [], metadata = {}, conversationId = null, fileAttachments = null } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length < 2) {
      return res.status(400).json({ success: false, error: 'Auto-save requires at least 2 messages' });
    }

    const result = await chatService.saveConversation(req.user.id, messages, {
      title: null, mode, projectIds, metadata, conversationId,
      workspaceId: req.workspaceId,
      fileAttachments,
      authenticatedDb: req.db
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    console.error('Auto-save error:', error);
    res.status(500).json({ success: false, error: 'Auto-save failed' });
  }
});

router.get('/chats', authenticate, async (req, res) => {
  try {
    const { mode, limit = 50, offset = 0, includeArchived = false, search } = req.query;
    const result = await chatService.getUserConversations(req.user.id, {
      mode: mode || null,
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeArchived: includeArchived === 'true',
      searchTerm: search || null,
      workspaceId: req.workspaceId,
      authenticatedDb: req.db
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversations' });
  }
});

router.get('/chats/workspaces', authenticate, async (req, res) => {
  try {
    const workspaces = await chatService.getUserConversationWorkspaces(req.user.id);
    res.json({ success: true, workspaces });
  } catch (error) {
    console.error('Get conversation workspaces error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversation workspaces' });
  }
});

router.get('/chats/trash', authenticate, async (req, res) => {
  try {
    const conversations = await chatService.getTrashConversations(req.user.id, req.workspaceId, req.db);
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load trash' });
  }
});

router.get('/chats/stats/summary', authenticate, async (req, res) => {
  try {
    const stats = await chatService.getConversationStats(req.user.id, req.workspaceId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve statistics' });
  }
});

router.get('/chats/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await chatService.getConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true, conversation });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    console.error('Get conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversation' });
  }
});

router.patch('/chats/:conversationId', authenticate, async (req, res) => {
  try {
    const result = await chatService.updateConversation(req.user.id, req.params.conversationId, req.body, req.workspaceId, req.db);
    res.json({ success: true, conversation: result });
  } catch (error) {
    console.error('Update conversation error:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
});

router.delete('/chats/:conversationId', authenticate, async (req, res) => {
  try {
    await chatService.deleteConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

router.post('/chats/:conversationId/restore', authenticate, async (req, res) => {
  try {
    await chatService.restoreConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to restore conversation' });
  }
});

router.delete('/chats/:conversationId/permanent', authenticate, async (req, res) => {
  try {
    await chatService.permanentDeleteConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to permanently delete' });
  }
});

router.delete('/chats/trash/empty', authenticate, async (req, res) => {
  try {
    await chatService.emptyTrash(req.user.id, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to empty trash' });
  }
});

// ── Chat folders ─────────────────────────────────────────────────────────────

router.get('/chat-folders', authenticate, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const legacyFolders = db.prepare(`
      SELECT rowid FROM chat_folders WHERE id IS NULL AND user_id = ? AND workspace_id = ?
    `).all(req.user.id, workspaceId);
    if (legacyFolders.length > 0) {
      const repair = db.prepare('UPDATE chat_folders SET id = ? WHERE rowid = ?');
      db.transaction(rows => rows.forEach(row => repair.run(randomUUID(), row.rowid)))(legacyFolders);
    }

    const { data, error } = await req.db
      .schema('aichats')
      .from('chat_folders')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, folders: data || [] });
  } catch (error) {
    console.error('List chat folders error:', error);
    res.status(500).json({ success: false, error: 'Failed to list folders' });
  }
});

router.post('/chat-folders', authenticate, async (req, res) => {
  try {
    const { name, color } = req.body;
    const workspaceId = req.workspaceId;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const { data, error } = await req.db
      .schema('aichats')
      .from('chat_folders')
      .insert({ id: randomUUID(), user_id: req.user.id, workspace_id: workspaceId, name: name.trim(), color: color || null })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, folder: data });
  } catch (error) {
    console.error('Create chat folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to create folder' });
  }
});

router.patch('/chat-folders/:folderId', authenticate, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, color, sort_order } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await req.db
      .schema('aichats')
      .from('chat_folders')
      .update(updates)
      .eq('id', folderId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Folder not found' });
    res.json({ success: true, folder: data });
  } catch (error) {
    console.error('Update chat folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to update folder' });
  }
});

router.delete('/chat-folders/:folderId', authenticate, async (req, res) => {
  try {
    const { folderId } = req.params;
    const workspaceId = req.workspaceId;
    if (!folderId || folderId === 'null') return res.status(400).json({ success: false, error: 'folderId required' });
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const { error } = await req.db
      .schema('aichats')
      .from('chat_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete folder' });
  }
});

router.patch('/chats/:conversationId/folder', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { folder_id } = req.body;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    if (folder_id) {
      const { data: folder, error: folderError } = await req.db
        .schema('aichats')
        .from('chat_folders')
        .select('id')
        .eq('id', folder_id)
        .eq('user_id', req.user.id)
        .eq('workspace_id', workspaceId)
        .single();

      if (folderError || !folder) {
        return res.status(404).json({ success: false, error: 'Folder not found' });
      }
    }

    const { data, error } = await req.db
      .schema('aichats')
      .from('conversations')
      .update({ folder_id: folder_id || null })
      .eq('id', conversationId)
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId)
      .select('id, folder_id')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Conversation not found' });
    res.json({ success: true, conversation: data });
  } catch (error) {
    console.error('Assign conversation folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to update conversation folder' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AGENT RUNTIME ROUTES — /api/agent/*
// ══════════════════════════════════════════════════════════════════════════════

// ── Permission / ask_user helpers ─────────────────────────────────────────────

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

// ── Agent tools / skills / souls ─────────────────────────────────────────────

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

router.get('/souls', authenticate, (req, res) => {
  res.json({ success: true, souls: listSouls() });
});

router.get('/soul', authenticate, (req, res) => {
  const { name = 'default' } = req.query;
  const content = readSoulRaw(name);
  if (content === null) {
    return res.status(404).json({ success: false, error: `Soul "${name}" not found` });
  }
  res.json({ success: true, name, content });
});

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

// ── Agent run (streaming) ─────────────────────────────────────────────────────

router.post('/run', authenticate, async (req, res) => {
  let heartbeatInterval = null;
  try {
    const { goal: rawGoal, message: rawMessage, conversationHistory = [], workingDir, maxRounds, autoApprove, continueSessionId, preApprovedTools = [], profileId, enableTools = true } = req.body;
    const goal = (rawGoal || rawMessage || '').trim();

    if (!goal) {
      return res.status(400).json({ success: false, error: 'Goal is required' });
    }

    if (!enableTools) {
      const { client: aiClient, model, isLocal } = getAiClientForUser(req.user.id);
      const maxTokens = isLocal ? 1024 : 4000;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Content-Encoding', 'identity');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const hbInterval = setInterval(() => writeAgentSseComment(res, 'ping'), 15000);
      res.on('close', () => clearInterval(hbInterval));

      try {
        const messages = [
          ...conversationHistory.slice(-6).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: goal },
        ];
        const systemPrompt = 'You are a helpful AI assistant. Respond clearly and concisely.';

        const stream = await aiClient.client.chat.completions.create({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          stream: true,
          max_tokens: maxTokens,
        });

        let fullContent = '';
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            writeAgentSse(res, { type: 'delta', data: { content: delta } });
          }
        }

        writeAgentSse(res, { type: 'done', data: { answer: fullContent } });
      } catch (err) {
        writeAgentSse(res, { type: 'error', data: { message: err.message } });
      } finally {
        clearInterval(hbInterval);
        res.end();
      }
      return;
    }

    let profile = null;
    if (profileId) {
      profile = getProfile(profileId, req.user.id);
    }
    if (!profile && !profileId) {
      profile = getDefaultProfile(req.user.id);
    }

    const { client: aiClient, model, isLocal, supportsNativeTools, providerInfo } = getAiClientForUser(req.user.id);

    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      const ws = db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id);
      if (ws) req.workspaceId = ws.id;
    }

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

    const resolvedWorkingDir = workingDir || profile?.working_dir || process.cwd();
    const resolvedMaxRounds  = maxRounds  || profile?.max_rounds  || 25;
    const resolvedAutoApprove = autoApprove === true || autoApprove === 'all' || profile?.auto_approve || false;
    const profileTools = Array.isArray(profile?.always_allowed_tools) ? profile.always_allowed_tools : [];

    let resolvedSoul = null;
    if (profile?.soul_override) {
      const withoutFrontmatter = profile.soul_override.replace(/^---[\s\S]*?---\n?/, '').trim();
      resolvedSoul = withoutFrontmatter || null;
    } else if (profile?.soul_name && profile.soul_name !== 'default') {
      resolvedSoul = loadSoul(profile.soul_name);
    }

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
      providerInfo,
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

// ── Session management ────────────────────────────────────────────────────────

router.get('/sessions', authenticate, (req, res) => {
  const limit = parseInt(req.query.limit || '20');
  const sessions = AgentSession.listRecent(req.user.id, limit);
  res.json({ success: true, sessions });
});

router.get('/sessions/search', authenticate, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'q parameter required' });
    }

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

router.get('/sessions/:id', authenticate, (req, res) => {
  const session = AgentSession.load(req.params.id);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, session });
});

router.get('/sessions/:id/audit', authenticate, async (req, res) => {
  try {
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

router.patch('/sessions/:id', authenticate, async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal?.trim()) return res.status(400).json({ success: false, error: 'goal is required' });
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

router.delete('/sessions/:id', authenticate, async (req, res) => {
  try {
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

router.post('/sessions/:id/feedback', authenticate, async (req, res) => {
  try {
    const { rating, comment, was_helpful } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'rating 1-5 required' });
    }

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

router.post('/sessions/:id/correct', authenticate, async (req, res) => {
  try {
    const { tool, correction, explanation } = req.body;
    if (!correction) {
      return res.status(400).json({ success: false, error: 'correction text required' });
    }

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

// ── Agent health ──────────────────────────────────────────────────────────────

router.get('/health', authenticate, (req, res) => {
  try {
    const limit = Math.max(10, Math.min(200, Number(req.query.limit || 80)));
    const sessions = db.prepare(`
      SELECT id, status, scratchpad, total_rounds, created_at, updated_at
      FROM agent_sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(req.user.id, limit);
    const ids = sessions.map(s => s.id);
    const rows = ids.length
      ? db.prepare(`
          SELECT session_id, tool_name, result, success
          FROM agent_tool_audit
          WHERE user_id = ?
            AND session_id IN (${ids.map(() => '?').join(',')})
        `).all(req.user.id, ...ids)
      : [];

    const bySession = new Map();
    for (const row of rows) {
      if (!bySession.has(row.session_id)) bySession.set(row.session_id, []);
      bySession.get(row.session_id).push(row);
    }

    const groups = new Map();
    for (const session of sessions) {
      const scratchpad = parseJson(session.scratchpad, {});
      const provider = providerKeyFromScratchpad(scratchpad);
      if (!groups.has(provider.key)) {
        groups.set(provider.key, {
          ...provider,
          sessions: 0,
          completedSessions: 0,
          failedSessions: 0,
          totalRounds: 0,
          totalTools: 0,
          failedTools: 0,
          invalidToolArgs: 0,
          repeatedLoops: 0,
          lastSeenAt: session.updated_at,
        });
      }
      const group = groups.get(provider.key);
      group.sessions += 1;
      group.completedSessions += session.status === 'completed' ? 1 : 0;
      group.failedSessions += session.status === 'failed' ? 1 : 0;
      group.totalRounds += Number(session.total_rounds || 0);
      if (String(session.updated_at || '').localeCompare(String(group.lastSeenAt || '')) > 0) {
        group.lastSeenAt = session.updated_at;
      }

      const finalAnswer = String(scratchpad.finalAnswer || '');
      if (/same tool call repeated|loop guard|calling the same tool/i.test(finalAnswer)) {
        group.repeatedLoops += 1;
      }

      for (const row of bySession.get(session.id) || []) {
        const result = parseJson(row.result, {});
        group.totalTools += 1;
        const failed = row.success === 0 || result?.success === false || Boolean(result?.error);
        if (failed) group.failedTools += 1;
        if (result?.code === 'invalid_tool_arguments') group.invalidToolArgs += 1;
      }
    }

    const providers = [...groups.values()].map(group => ({
      ...group,
      avgRounds: group.sessions ? Number((group.totalRounds / group.sessions).toFixed(1)) : 0,
      toolSuccessRate: group.totalTools
        ? Number(((group.totalTools - group.failedTools) / group.totalTools).toFixed(3))
        : null,
      status: gradeHealth(group),
    })).sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));

    res.json({ success: true, count: providers.length, providers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Permissions / ask_user responses ─────────────────────────────────────────

router.post('/permissions/:requestId', authenticate, (req, res) => {
  const pending = pendingPermissions.get(req.params.requestId);
  if (!pending || pending.userId !== req.user.id) {
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

// ── Agent memory ──────────────────────────────────────────────────────────────

router.get('/memory', authenticate, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
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

router.get('/memory/:key', authenticate, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
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

router.delete('/memory', authenticate, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'key is required' });

    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
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

router.delete('/memory/:key', authenticate, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
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

// ── MCP management ────────────────────────────────────────────────────────────

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

// ── Profiles ─────────────────────────────────────────────────────────────────

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

// ── Scheduler ────────────────────────────────────────────────────────────────

router.post('/schedule', authenticate, async (req, res) => {
  try {
    const { name, goal, schedule, profileId } = req.body;
    if (!name || !goal || !schedule) {
      return res.status(400).json({ success: false, error: 'name, goal, and schedule are required' });
    }
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

router.get('/schedule', authenticate, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
    const jobs = listJobs(req.user.id, workspaceId || 'default');
    res.json({ success: true, count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/schedule/:id', authenticate, (req, res) => {
  try {
    deleteJob(req.params.id);
    res.json({ success: true, message: `Job ${req.params.id} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/schedule/:id/enable', authenticate, (req, res) => {
  try { enableJob(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.patch('/schedule/:id/disable', authenticate, (req, res) => {
  try { disableJob(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Checkpoints ──────────────────────────────────────────────────────────────

router.get('/checkpoints', authenticate, (_req, res) => {
  res.json({ success: true, checkpoints: listCheckpoints() });
});

router.post('/checkpoints/restore', authenticate, (req, res) => {
  const result = restoreCheckpoint(req.body?.id || null);
  res.status(result.success ? 200 : 404).json(result);
});

// ── Files (browse working directory) ────────────────────────────────────────

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

// ── Multi-agent ──────────────────────────────────────────────────────────────

router.post('/multi', authenticate, async (req, res) => {
  try {
    const { tasks, maxConcurrency = 3 } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, error: 'tasks must be a non-empty array' });
    }
    if (tasks.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 parallel tasks per request' });
    }

    const { client: aiClient, model, isLocal, supportsNativeTools, providerInfo } = getAiClientForUser(req.user.id);
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;

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
            providerInfo,
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

// ══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

router.use((error, req, res, next) => {
  console.error('API Error:', error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

router.use('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (used by routes above)
// ══════════════════════════════════════════════════════════════════════════════

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

const FILE_WRITE_TOOLS = new Set(['write_file', 'create_file']);
const FILE_EDIT_TOOLS = new Set(['edit_file']);
const FILE_DELETE_TOOLS = new Set(['file_delete', 'delete_file']);
const FILE_CREATE_TOOLS = new Set(['create_directory']);
const FILE_COPY_TOOLS = new Set(['file_copy', 'copy_file']);
const FILE_MOVE_TOOLS = new Set(['file_move', 'move_file']);
const SHELL_TOOLS = new Set(['run_command', 'run_python', 'run_node']);

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

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function providerKeyFromScratchpad(scratchpad = {}) {
  const info = scratchpad.providerInfo || {};
  const providerId = info.providerId || info.provider_id || (info.isLocal ? 'local' : null) || 'global';
  const model = info.model || 'unknown';
  return {
    key: `${providerId}:${model}`,
    providerId,
    providerType: info.type || info.provider_type || (info.isLocal ? 'local' : 'unknown'),
    model,
    supportsNativeTools: Boolean(info.supportsNativeTools),
  };
}

function gradeHealth({ invalidToolArgs, repeatedLoops, failedTools, totalTools }) {
  const totalProblems = invalidToolArgs + repeatedLoops + failedTools;
  if (totalTools === 0) return 'unknown';
  if (invalidToolArgs >= 3 || repeatedLoops >= 2 || totalProblems / Math.max(1, totalTools) > 0.25) return 'poor';
  if (totalProblems > 0) return 'watch';
  return 'good';
}

export default router;