// aiRoutes.js — Conversation & folder CRUD only
// AI streaming is handled by /api/agent/run (agentRoutes.js).

import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import db from '../../db/client.js';
import { chatService } from '../controllers/ai/chatService.js';
import { randomUUID } from 'crypto';

const router = express.Router();

const getWorkspaceContext = (req) =>
  req.query?.workspaceId || req.body?.workspaceId || null;

const addAuthenticatedClient = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return;
    attachDb(req, res, () => {
      req.workspaceId = getWorkspaceContext(req);
      next();
    });
  });
};

const authenticateUser = addAuthenticatedClient;

// ── Conversation title generation (used by unified chat after first exchange) ──

router.post('/generate-title', addAuthenticatedClient, async (req, res) => {
  try {
    const { userMessage, aiResponse } = req.body;
    if (!userMessage) return res.status(400).json({ success: false, error: 'userMessage required' });

    const { getAiClientForUser } = await import('../controllers/ai/clientFactory.js');
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

// ── Conversation save / autosave ───────────────────────────────────────────────

router.post('/chats/save', addAuthenticatedClient, async (req, res) => {
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

router.post('/chats/autosave', addAuthenticatedClient, async (req, res) => {
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

// ── Conversation list / detail / update / delete ───────────────────────────────

router.get('/chats', addAuthenticatedClient, async (req, res) => {
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

router.get('/chats/workspaces', authenticateUser, async (req, res) => {
  try {
    const workspaces = await chatService.getUserConversationWorkspaces(req.user.id);
    res.json({ success: true, workspaces });
  } catch (error) {
    console.error('Get conversation workspaces error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversation workspaces' });
  }
});

router.get('/chats/trash', addAuthenticatedClient, async (req, res) => {
  try {
    const conversations = await chatService.getTrashConversations(req.user.id, req.workspaceId, req.db);
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load trash' });
  }
});

router.get('/chats/stats/summary', authenticateUser, async (req, res) => {
  try {
    const stats = await chatService.getConversationStats(req.user.id, req.workspaceId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve statistics' });
  }
});

router.get('/chats/:conversationId', addAuthenticatedClient, async (req, res) => {
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

router.patch('/chats/:conversationId', addAuthenticatedClient, async (req, res) => {
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

router.delete('/chats/:conversationId', addAuthenticatedClient, async (req, res) => {
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

// ── Trash ──────────────────────────────────────────────────────────────────────

router.post('/chats/:conversationId/restore', addAuthenticatedClient, async (req, res) => {
  try {
    await chatService.restoreConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to restore conversation' });
  }
});

router.delete('/chats/:conversationId/permanent', addAuthenticatedClient, async (req, res) => {
  try {
    await chatService.permanentDeleteConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to permanently delete' });
  }
});

router.delete('/chats/trash/empty', addAuthenticatedClient, async (req, res) => {
  try {
    await chatService.emptyTrash(req.user.id, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to empty trash' });
  }
});

// ── Chat folders ───────────────────────────────────────────────────────────────

router.get('/chat-folders', addAuthenticatedClient, async (req, res) => {
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

router.post('/chat-folders', addAuthenticatedClient, async (req, res) => {
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

router.patch('/chat-folders/:folderId', addAuthenticatedClient, async (req, res) => {
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

router.delete('/chat-folders/:folderId', addAuthenticatedClient, async (req, res) => {
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

router.patch('/chats/:conversationId/folder', addAuthenticatedClient, async (req, res) => {
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

// ── Error handler ──────────────────────────────────────────────────────────────

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

export default router;
