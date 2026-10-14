// aiAgentRoutes.js — Unified AI/Agent routes
// Combines conversation CRUD (formerly aiRoutes.js) and agent runtime (formerly agentRoutes.js)

import express from 'express';
import db from '../../db/client.js';
import { chatService } from '../controllers/ai/chatService.js';
import { searchChats, indexingChats } from '../../search/messageIndex.js';
import { initializeAgent, AgentRuntime, AgentSession } from '../../agent/index.js';
import { deleteCheckpoint, restoreCheckpoint } from '../../agent/AgentRuntime.js';
import {
  applySandboxPatch,
  commitSandboxBranch,
  createSandbox,
  createSandboxPatch,
  deleteSandbox,
  getSandboxJob,
  getSandboxStatus,
  getSandboxDiff,
  listSandboxJobs,
  listSandboxes,
  runSandboxCommand,
  sandboxRoot,
} from '../../agent/SandboxManager.js';
import { loadSkills, reloadSkills, listSkills, normalizeTags, createSkill, updateSkill, deleteSkill } from '../../agent/skills.js';
import { loadSoul, readSoulRaw, writeSoul, listSouls } from '../../agent/prompts/agentSystemPrompt.js';
import { getAiClientForScheduledProvider, getAiClientForUser } from '../controllers/ai/clientFactory.js';
import { noProjectToolNames } from '../../agent/toolScopes.js';
import { getWorkspaceRoot, loadEntry, resolveWorkingDirectoryContext } from '../../files/fileExplorerService.js';
import { codeSearchTool, listDefinitionsTool, findDefinitionTool, findReferencesTool } from '../../agent/tools/codeSearchTools.js';
import { listMemories, normalizeMemoryRow, searchMemories, hybridRecall, ALL_PROJECTS, ALL_CATS } from '../../agent/tools/memoryTools.js';
import { addMemory, nameOwners, ownedBy, ownerFilter, updateMemory } from '../../agent/memoryAdmin.js';
import { embeddingStatus, embedText } from '../embeddings/embeddingService.js';
import { toolRegistry } from '../../agent/tools/toolRegistry.js';
import { formatMultimodalCapabilityPrompt, getMultimodalCapabilities } from '../../agent/multimodalCapabilities.js';
import { normalizeApprovalDecision } from '../../agent/approvalDecisions.js';
import { buildChatContext, projectForChat } from '../../knowledge/chatContext.js';
import { getModelCapabilities, normalizeReasoningEffort } from '../controllers/ai/modelCapabilities.js';
import { getModelRuntimeStatus } from '../controllers/ai/modelRuntimeStatus.js';
import { listProfiles, getProfile, getProfileByHandle, createProfile, updateProfile, deleteProfile, toolsForCapabilities, AGENT_CAPABILITIES } from '../../agent/ProfileManager.js';
import { addKnowledgeFile, deleteKnowledgeFile, deleteOwnerKnowledge, listKnowledgeFiles, MAX_FILE_BYTES } from '../../knowledge/knowledgeStore.js';
import { knowledgeFitReport } from '../../knowledge/contextBuilder.js';
import { describeModel } from '../controllers/ai/modelProfile.js';
import multer from 'multer';
import { branchGit, commitGit, discardGitFiles, getGitBranches, getGitCommit, getGitCommitMessageContext, getGitDiff, getGitState, getGitLog, pullGit, pushGit, stageGitFiles, stashGit, unstageGitFiles } from '../../agent/gitService.js';
import { createHash, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getArtifactsDir, getLegacyArtifactsDir } from '../../agent/workspacePaths.js';
import { shellSessionManager } from '../../agent/ShellSessionManager.js';
import { decideExternalApproval, detectExternalEngines, isAcpEngine, isExternalEngine, openExternalApprovals, runExternalAgent, scratchWorkspace } from '../../agent/externalAgents.js';
import { ACP_CATALOG, acpNameFromEngine, checkAcpAgent, getAcpAgent, listAcpAgents, removeAcpAgent, saveAcpAgent } from '../../agent/acp/acpAgents.js';
import { runAcpAgent } from '../../agent/acp/acpRunner.js';
import { downloadSize } from '../../connectors/launchers.js';
import { listExternalSessions, readExternalSession } from '../../agent/externalSessions.js';
import { getExternalUsage } from '../../agent/externalUsage.js';

const router = express.Router();
const pendingPermissions = new Map();
const pendingUserQuestions = new Map();
function normalizeConversationHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter(m => m?.role === 'user' || m?.role === 'assistant')
    .map(m => ({
      role: m.role,
      content: String(m.content || ''),
      timestamp: m.timestamp || m.createdAt || m.created_at || null,
      fileAttachments: Array.isArray(m.fileAttachments) ? m.fileAttachments : [],
    }));
}

function defaultAgentWorkingDir() {
  return getWorkspaceRoot();
}

function resolveAgentWorkingContext({ workingContext = null, workingDir = null, profile = null, userId = null } = {}) {
  if (workingContext && typeof workingContext === 'object') {
    return resolveWorkingDirectoryContext(workingContext, {
      userId,
      projectId: workingContext.projectId || null,
    });
  }

  const resolvedWorkingDir = workingDir || profile?.working_dir || defaultAgentWorkingDir();
  return {
    root: null,
    rootId: null,
    rootLabel: null,
    rootKind: null,
    rootPath: null,
    relativePath: '.',
    workingDir: path.resolve(resolvedWorkingDir),
  };
}

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

function parseProviderJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function getWorkspaceIdForRequest(req) {
  return req.workspaceId || db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id || null;
}

function resolveAgentMentions(rawMentions = [], userId) {
  if (!Array.isArray(rawMentions)) return [];
  const seen = new Set();
  const profiles = [];
  for (const mention of rawMentions.slice(0, 8)) {
    const profile = mention?.id
      ? getProfile(mention.id, userId)
      : mention?.handle
        ? getProfileByHandle(String(mention.handle).replace(/^#/, ''), userId)
        : null;
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return profiles;
}

function resolveFileAttachments(fileAttachments = [], workingContext = null, userId = null) {
  if (!Array.isArray(fileAttachments)) return [];
  const results = [];
  for (const attachment of fileAttachments.slice(0, 10)) {
    const filePath = typeof attachment === 'string' ? attachment : attachment?.path;
    if (!filePath) continue;
    if (typeof attachment === 'object' && attachment?.promptOnly) {
      const content = typeof attachment.content === 'string'
        ? attachment.content.slice(0, 120_000)
        : '';
      const dataUrl = typeof attachment.dataUrl === 'string' && attachment.dataUrl.length < 8_000_000
        ? attachment.dataUrl
        : '';
      results.push({
        path: filePath,
        toolPath: null,
        rootId: 'none',
        name: attachment.name || filePath.replace(/^prompt:\/\//, ''),
        ext: attachment.ext || (attachment.name ? attachment.name.split('.').pop() : ''),
        mime: attachment.mime || '',
        size: Number(attachment.size || 0),
        promptOnly: true,
        content,
        dataUrl,
      });
      continue;
    }
    // A no-Project Work chat may use prompt-only uploads, but it must never
    // resolve an arbitrary path through the legacy global workspace root.
    if (!workingContext?.rootId) continue;
    const rootId = typeof attachment === 'object' && attachment?.rootId
      ? attachment.rootId
      : workingContext.rootId;
    if (workingContext?.rootId && rootId !== workingContext.rootId) {
      continue;
    }
    try {
      const entry = loadEntry({
        rootId,
        relativePath: filePath,
        userId,
        projectId: workingContext?.projectId || null,
      });
      if (entry.success && entry.type === 'file') {
        const absolutePath = entry.root?.path
          ? path.resolve(entry.root.path, filePath)
          : null;
        const toolPath = absolutePath && workingContext?.workingDir
          ? path.relative(workingContext.workingDir, absolutePath)
          : filePath;
        results.push({
          path: filePath,
          toolPath: toolPath || filePath,
          rootId,
          name: entry.name,
          ext: entry.ext,
          mime: entry.mime,
          size: entry.size,
          binary: Boolean(entry.binary),
          tooLarge: Boolean(entry.tooLarge),
          content: entry.content || '',
        });
      }
    } catch (err) {
      console.warn(`[agent] Failed to load attached file ${filePath}:`, err.message);
    }
  }
  return results;
}

function injectFileAttachments(goal, fileAttachments = []) {
  if (!fileAttachments.length) return goal;
  const blocks = fileAttachments.map(f => {
    const ext = f.ext || (f.name ? f.name.split('.').pop() : '');
    const mime = String(f.mime || '').toLowerCase();
    const toolPath = f.toolPath || f.path;
    if (f.content) {
      const scopeLine = f.promptOnly
        ? 'Scope: prompt-only upload; not stored in or read from the workspace.'
        : `Tool path: ${toolPath}`;
      return `--- Attached file: ${f.name || f.path} ---\n${scopeLine}\nMIME: ${f.mime || 'text/plain'}\n\`\`\`${ext}\n${f.content}\n\`\`\`\n`;
    }
    if (f.promptOnly && f.dataUrl && mime.startsWith('image/')) {
      return [
        `--- Attached image: ${f.name || f.path} ---`,
        'Scope: prompt-only upload; not stored in or read from the workspace.',
        `MIME: ${f.mime || 'image/*'}`,
        f.size ? `Size: ${f.size} bytes` : null,
        'Image bytes are attached to the conversation UI. If visual inspection is needed, ask the user to switch to a workspace/tool mode with vision-capable attachment inspection.',
        '',
      ].filter(Boolean).join('\n');
    }
    if (f.promptOnly) {
      return [
        `--- Attached file: ${f.name || f.path} ---`,
        'Scope: prompt-only upload; not stored in or read from the workspace.',
        `MIME: ${f.mime || 'application/octet-stream'}`,
        f.size ? `Size: ${f.size} bytes` : null,
        'This file type is available as prompt metadata only.',
        '',
      ].filter(Boolean).join('\n');
    }
    const hint = mime.startsWith('image/')
      ? `Use inspect_attachment with path "${toolPath}" first; it describes the image when vision is available.`
      : mime.startsWith('audio/')
        ? `Use inspect_attachment with path "${toolPath}" first; it will route to transcribe_audio when Whisper is available.`
        : `Use inspect_attachment with path "${toolPath}" first; it will route by file type or return metadata.`;
    return [
      `--- Attached media file: ${f.path} ---`,
      `Tool path: ${toolPath}`,
      `MIME: ${f.mime || 'application/octet-stream'}`,
      f.size ? `Size: ${f.size} bytes` : null,
      hint,
      '',
    ].filter(Boolean).join('\n');
  }).join('\n');
  return `The user attached the following file(s). These attachment paths are available in the agent working directory unless marked otherwise.\n\n${blocks}\n\nUser request:\n${goal}`;
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

const withWorkspaceContext = (req, _res, next) => {
  req.workspaceId = getWorkspaceContext(req);
  next();
};

// ─── Agent init (once on module load) ────────────────────────────────────────

await initializeAgent();
markStaleActiveSessions();

/**
 * The model client for a chat: the agent's own model when it has one and it
 * can be used, otherwise the user's current model.
 */
function clientForAgent(userId, profile) {
  if (profile?.model_profile_id) {
    try {
      return getAiClientForScheduledProvider(userId, profile.model_profile_id);
    } catch (err) {
      console.warn(`[agent] ${profile.name}'s model is unavailable, using the current one: ${err.message}`);
    }
  }
  return getAiClientForUser(userId);
}


// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATION ROUTES — /api/ai/*
// ══════════════════════════════════════════════════════════════════════════════

const SUPPORTED_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

function attachedImageUrls(fileAttachments = []) {
  if (!Array.isArray(fileAttachments)) return [];
  return fileAttachments
    .slice(0, 2)
    .map(attachment => String(attachment?.dataUrl || ''))
    .filter(dataUrl => dataUrl.length > 0 && dataUrl.length < 8_000_000 && SUPPORTED_IMAGE_DATA_URL.test(dataUrl));
}

function messageContentWithImages(text, fileAttachments = []) {
  const imageUrls = attachedImageUrls(fileAttachments);
  if (!imageUrls.length) return text;
  return [
    { type: 'text', text },
    ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
  ];
}

router.post('/chat/stream', withWorkspaceContext, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ success: false, error: 'message required' });
  }

  const history = normalizeConversationHistory(req.body?.conversationHistory);
  const chatAgent = req.body?.profileId ? getProfile(String(req.body.profileId), req.user.id) : null;
  let resolvedClient;
  try {
    resolvedClient = clientForAgent(req.user.id, chatAgent);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'Could not load the active model' });
  }
  const { client: aiClient, model, providerInfo } = resolvedClient;
  const modelCapabilities = getModelCapabilities(
    providerInfo?.providerId,
    model,
    providerInfo?.settings?.model_capabilities,
  );
  const suppliedCurrentImages = (Array.isArray(req.body?.fileAttachments) ? req.body.fileAttachments : [])
    .filter(attachment => (
      String(attachment?.mime || attachment?.mimeType || '').toLowerCase().startsWith('image/')
      || String(attachment?.dataUrl || '').startsWith('data:image/')
    ));
  const currentImageUrls = attachedImageUrls(req.body?.fileAttachments);
  if (suppliedCurrentImages.length !== currentImageUrls.length) {
    return res.status(400).json({
      success: false,
      error: 'Images must be PNG, JPEG, WebP, or GIF files under the attachment size limit.',
    });
  }
  if (currentImageUrls.length > 0 && !modelCapabilities.supportsImageInput) {
    return res.status(400).json({
      success: false,
      error: `The active model (${model || 'unknown'}) does not support image input. Choose an image-capable language model first.`,
    });
  }
  // Project instructions and knowledge apply to plain chats as well.
  const chatProject = projectForChat(req.user.id, req.body?.projectId || req.body?.workingContext?.projectId || null);
  const chatContext = buildChatContext({ project: chatProject, agent: chatAgent, query: message, resolvedClient });
  const currentContent = modelCapabilities.supportsImageInput
    ? messageContentWithImages(message, req.body?.fileAttachments)
    : message;
  const messages = [
    ...(chatContext.prompt ? [{ role: 'system', content: chatContext.prompt }] : []),
    ...history.map(item => ({
      role: item.role,
      content: item.role === 'user' && modelCapabilities.supportsImageInput
        ? messageContentWithImages(item.content, item.fileAttachments)
        : item.content,
    })),
    {
      role: 'user',
      content: chatContext.images.length
        ? [
          ...(typeof currentContent === 'string' ? [{ type: 'text', text: currentContent }] : currentContent),
          ...chatContext.images.map(url => ({ type: 'image_url', image_url: { url } })),
        ]
        : currentContent,
    },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const abortController = new AbortController();
  const abort = () => {
    if (!res.writableEnded) abortController.abort();
  };
  res.on('close', abort);

  let answer = '';
  try {
    // Only a level the model has, mapped to its nearest one (xhigh → high…).
    const reasoningEffort = normalizeReasoningEffort(req.body?.reasoningEffort, modelCapabilities);
    const stream = await aiClient.client.chat.completions.create({
      model,
      messages,
      stream: true,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    }, { signal: abortController.signal });

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) {
        answer += delta;
        writeAgentSse(res, { type: 'delta', data: { content: delta } });
      }
      if (chunk?.usage) {
        writeAgentSse(res, {
          type: 'usage_update',
          data: {
            inputTokens: chunk.usage.prompt_tokens || 0,
            outputTokens: chunk.usage.completion_tokens || 0,
            totalTokens: chunk.usage.total_tokens || 0,
          },
        });
      }
    }

    if (!abortController.signal.aborted) {
      writeAgentSse(res, { type: 'done', data: { answer, stopReason: 'answer' } });
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.error('Direct chat error:', error);
      writeAgentSse(res, { type: 'error', data: { message: error.message || 'Chat failed' } });
      writeAgentSse(res, { type: 'done', data: { answer: '', stopReason: 'error' } });
    }
  } finally {
    res.off('close', abort);
    if (!res.writableEnded) res.end();
  }
});

router.post('/generate-title', withWorkspaceContext, async (req, res) => {
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

router.post('/chats/save', withWorkspaceContext, async (req, res) => {
  try {
    const { messages, title, mode = 'chat', projectIds = [], metadata = {}, conversationId = null, fileAttachments = null, knownMessageIds = null, clientId = null } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Messages array is required and cannot be empty' });
    }

    const result = await chatService.saveConversation(req.user.id, messages, {
      title, mode, projectIds, metadata, conversationId,
      workspaceId: req.workspaceId,
      fileAttachments,
      databaseClient: req.db,
      // Never lose messages added on the server since this window loaded the
      // chat: a sender that lists none is treated as having seen none.
      knownMessageIds: Array.isArray(knownMessageIds) ? knownMessageIds.map(String).slice(0, 20_000) : [],
      origin: typeof clientId === 'string' ? clientId.slice(0, 80) : null,
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

router.get('/chats', withWorkspaceContext, async (req, res) => {
  try {
    const { mode, limit = 50, offset = 0, includeArchived = false, search } = req.query;
    const result = await chatService.getUserConversations(req.user.id, {
      mode: mode || null,
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeArchived: includeArchived === 'true',
      searchTerm: search || null,
      workspaceId: req.workspaceId,
      databaseClient: req.db
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversations' });
  }
});

// ── Conversation search: titles and what was said (search/messageIndex.js) ──
router.get('/chats/search', withWorkspaceContext, (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ success: false, error: 'q parameter required' });
    const conversations = searchChats(db, {
      userId: req.user.id,
      query: q,
      limit: parseInt(req.query.limit) || 20,
      hitsPerChat: 3,
    });
    // `indexing`: chats are still waiting to be indexed, so some may be missing.
    res.json({ success: true, count: conversations.length, query: q, conversations, indexing: indexingChats(db) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/chats/trash', withWorkspaceContext, async (req, res) => {
  try {
    const conversations = await chatService.getTrashConversations(req.user.id, req.workspaceId, req.db);
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load trash' });
  }
});

router.get('/chats/:conversationId', withWorkspaceContext, async (req, res) => {
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

router.patch('/chats/:conversationId', withWorkspaceContext, async (req, res) => {
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

router.delete('/chats/:conversationId', withWorkspaceContext, async (req, res) => {
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

router.post('/chats/:conversationId/restore', withWorkspaceContext, async (req, res) => {
  try {
    await chatService.restoreConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to restore conversation' });
  }
});

router.delete('/chats/:conversationId/permanent', withWorkspaceContext, async (req, res) => {
  try {
    await chatService.permanentDeleteConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to permanently delete' });
  }
});

router.delete('/chats/trash/empty', withWorkspaceContext, async (req, res) => {
  try {
    await chatService.emptyTrash(req.user.id, req.workspaceId, req.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to empty trash' });
  }
});

// ── Chat folders ─────────────────────────────────────────────────────────────

router.get('/chat-folders', withWorkspaceContext, async (req, res) => {
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
        fields: Array.isArray(request.fields) ? request.fields.slice(0, 6) : [],
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


router.get('/tools', withWorkspaceContext, async (req, res) => {
  const { toolRegistry } = await import('../../agent/index.js');
  const tools = toolRegistry.all().map(t => ({
    name: t.name,
    description: t.description,
    permission: t.permission,
    category: t.category || 'general',
  }));
  res.json({ tools });
});

router.get('/capabilities/multimodal', withWorkspaceContext, async (req, res) => {
  try {
    res.json({ success: true, capabilities: await getMultimodalCapabilities(req.user.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to load multimodal capabilities' });
  }
});

// ─── Embeddings / semantic layer status ──────────────────────────────────────
// Reports the resolved embedding strategy (provider model vs. offline lexical)
// and cache size, so the UI can show whether semantic search is active.
router.get('/embeddings/status', withWorkspaceContext, (req, res) => {
  try {
    res.json({ success: true, ...embeddingStatus(req.user.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to load embedding status' });
  }
});

// Semantic search over the agent's durable memory (hybrid BM25 + vector). Powers
// the command palette's "Memory" results and reports the active embedding space.
router.get('/semantic/search', withWorkspaceContext, async (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    const status = embeddingStatus(req.user.id);
    if (!q) return res.json({ success: true, query: q, results: [], embedding: status });
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit, 10) || 8));
    const workspaceId = req.workspaceId
      || db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id
      || null;
    const context = {
      userId: req.user.id,
      workspaceId,
      profileId: null,
      projectId: ALL_PROJECTS,
      catId: ALL_CATS,
      computeEmbedding: (text) => embedText(text, { userId: req.user.id }),
    };
    const { memories, method } = await hybridRecall(context, { query: q, kind: 'all', limit });
    res.json({
      success: true,
      query: q,
      method,
      embedding: status,
      results: memories.map(m => ({ key: m.key, kind: m.kind, content: m.content, importance: m.importance, score: m.score })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Semantic search failed' });
  }
});

// ─── Shell process / server management ───────────────────────────────────────

router.get('/processes', withWorkspaceContext, (req, res) => {
  try {
    const sessions = shellSessionManager.list(null);
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/processes/:key', withWorkspaceContext, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const killed = shellSessionManager.killByKey(key);
  res.json({ success: killed, key });
});

router.get('/runtime/status', withWorkspaceContext, async (req, res) => {
  try {
    res.json(await getModelRuntimeStatus(req.user.id));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to load model runtime status' });
  }
});

router.get('/skills', withWorkspaceContext, (req, res) => {
  loadSkills();
  const skills = listSkills().map(s => ({
    name: s.name,
    description: s.description || '',
    brain_region: s.brain_region || 'unknown',
    weight: parseFloat(s.weight || 1),
    tags: normalizeTags(s.tags),
    when_to_use: s.when_to_use || '',
    body: s.body || '',
    source: s.source || 'bundled',
    created_by: s.created_by || null,
  }));
  res.json({ success: true, count: skills.length, skills });
});

router.get('/skills/:name', withWorkspaceContext, (req, res) => {
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
      tags: normalizeTags(skill.tags),
      when_to_use: skill.when_to_use || '',
      body: skill.body || '',
      source: skill.source || 'bundled',
      created_by: skill.created_by || null,
    },
  });
});

router.post('/skills/reload', withWorkspaceContext, (_req, res) => {
  try {
    const skills = reloadSkills();
    res.json({ success: true, count: skills.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/skills', withWorkspaceContext, (req, res) => {
  try {
    const { name, description = '', brain_region = 'unknown', weight = 1, tags = [], when_to_use = '', body = '', created_by = null } = req.body;
    const result = createSkill({ name, description, brain_region, weight, tags, when_to_use, body, created_by });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('already exists') ? 409 : err.message.includes('required') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.put('/skills/:name', withWorkspaceContext, (req, res) => {
  try {
    const result = updateSkill(req.params.name, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.delete('/skills/:name', withWorkspaceContext, (req, res) => {
  try {
    deleteSkill(req.params.name);
    res.json({ success: true });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/souls', withWorkspaceContext, (req, res) => {
  res.json({ success: true, souls: listSouls() });
});

router.get('/soul', withWorkspaceContext, (req, res) => {
  const { name = 'default' } = req.query;
  const content = readSoulRaw(name);
  if (content === null) {
    return res.status(404).json({ success: false, error: `Soul "${name}" not found` });
  }
  res.json({ success: true, name, content });
});

router.put('/soul', withWorkspaceContext, (req, res) => {
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

// ── Visual Git workflow ──────────────────────────────────────────────────────

function gitWorkingDir(req) {
  if (req.body?.workingContext && typeof req.body.workingContext === 'object') {
    return resolveAgentWorkingContext({ workingContext: req.body.workingContext, userId: req.user?.id }).workingDir;
  }
  return req.body?.path || req.query?.path || defaultAgentWorkingDir();
}

function cleanGeneratedCommitMessage(value = '') {
  let message = String(value || '').replace(/\r\n/g, '\n').trim();
  message = message
    .replace(/<think>[\s\S]*?<\/think>/gi, '\n')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '\n')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '\n')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/<analysis>[\s\S]*$/i, '')
    .replace(/<reasoning>[\s\S]*$/i, '')
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  message = message.replace(/^git\s+commit\s+-m\s+/i, '').trim();
  message = message.replace(/^(commit\s+message|message|subject)\s*:\s*/i, '').trim();
  message = message.replace(/^["'`]|["'`]$/g, '').trim();
  message = message
    .split('\n')
    .map(line => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''))
    .filter(Boolean)
    .filter(line => !/^here(?:'s| is)\b/i.test(line))
    .filter(line => !/^let me\b/i.test(line))
    .join('\n');
  return message.slice(0, 500);
}

function commitMessageArea(context = {}) {
  const paths = (context.files || []).map(file => file.path || '').filter(Boolean);
  if (paths.some(file => /(^|\/)(GitPanel|gitApi|gitService)\./i.test(file) || /\/git\//i.test(file))) return 'Git workflow';
  if (paths.some(file => file.includes('/CommandCenter/'))) return 'Command Center';
  if (paths.some(file => file.startsWith('den/src/ai/'))) return 'AI routes';
  if (paths.some(file => file.startsWith('den/'))) return 'backend';
  if (paths.some(file => file.startsWith('neko/'))) return 'frontend';
  const first = paths[0] || 'workspace';
  return first.split('/').filter(Boolean).slice(0, 2).join('/') || 'workspace';
}

function fallbackCommitMessage(context = {}) {
  const files = context.files || [];
  const paths = files.map(file => file.path || '').filter(Boolean);
  const diff = String(context.diff || '');

  if (/commit-message|commit message|generateCommitMessage|getGitCommitMessageContext/i.test(`${diff}\n${paths.join('\n')}`)) {
    return 'feat: add Git commit message generation';
  }

  const docsOnly = paths.length > 0 && paths.every(file => /\.(md|mdx|txt|rst)$/i.test(file));
  const testsOnly = paths.length > 0 && paths.every(file => /(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\.[jt]sx?$/i.test(file));
  const configOnly = paths.length > 0 && paths.every(file => /(^|\/)(package(-lock)?\.json|vite\.config|eslint\.config|tsconfig|tailwind\.config)/i.test(file));
  const hasFeatureShape = /^\+.*\b(export function|router\.(get|post|put|patch|delete)|function\s+\w+|const\s+\[|<button)\b/im.test(diff);
  const hasFixShape = /\b(fix|error|fallback|sanitize|strip|guard|prevent|reject|catch)\b/i.test(diff);

  const type = docsOnly ? 'docs'
    : testsOnly ? 'test'
      : configOnly ? 'build'
        : hasFeatureShape ? 'feat'
          : hasFixShape ? 'fix'
            : 'chore';

  const allDeleted = files.length > 0 && files.every(file => file.deleted || file.status === 'deleted');
  const allUntracked = files.length > 0 && files.every(file => file.untracked || file.code === '??');
  const hasRenames = files.some(file => file.renamed || file.status === 'renamed');
  const action = allDeleted ? 'remove' : hasRenames ? 'rename' : allUntracked ? 'add' : 'update';
  return `${type}: ${action} ${commitMessageArea(context)}`.slice(0, 72);
}

router.get('/git/state', withWorkspaceContext, (req, res) => {
  try {
    res.json(getGitState(gitWorkingDir(req)));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/git/log', withWorkspaceContext, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = parseInt(req.query.skip, 10) || 0;
    res.json(getGitLog(gitWorkingDir(req), { limit, skip }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/git/diff', withWorkspaceContext, (req, res) => {
  try {
    res.json(getGitDiff(gitWorkingDir(req), {
      file: req.query?.file || null,
      staged: req.query?.staged === 'true',
      compare: req.query?.compare || null,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/commit-message', withWorkspaceContext, async (req, res) => {
  try {
    const context = getGitCommitMessageContext(gitWorkingDir(req), {
      scope: req.body?.scope || 'auto',
    });
    if (!context.success) {
      return res.status(400).json(context);
    }

    const { client: aiClient, model } = getAiClientForUser(req.user.id);
    const response = await aiClient.messages.create({
      model,
      max_completion_tokens: 1000,
      system: [
        'Generate an accurate Git commit message from the provided status and diff.',
        'Return exactly one commit message line. No quotes, no markdown, no bullet list, no explanations.',
        'Do not include reasoning, analysis, XML tags, or <think> tags.',
        'Prefer one concise subject line under 72 characters.',
        'Use imperative mood and conventional prefixes when obvious, such as feat:, fix:, refactor:, docs:, test:, chore:, or build:.',
        'Do not invent changes that are not present in the diff or status.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: JSON.stringify({
          branch: context.branch,
          scope: context.scope,
          files: context.files,
          status: context.status,
          diff_truncated: context.diffTruncated,
          diff: context.diff || '(No textual diff available. Use the file status only.)',
        }, null, 2),
      }],
    });

    let message = cleanGeneratedCommitMessage(response.content?.[0]?.text || '');
    const source = message ? 'ai' : 'fallback';
    if (!message) message = fallbackCommitMessage(context);

    res.json({
      success: true,
      message,
      source,
      scope: context.scope,
      branch: context.branch,
      changedCount: context.changedCount,
      diffTruncated: context.diffTruncated,
    });
  } catch (err) {
    console.error('Commit message generation error:', err);
    res.status(500).json({ success: false, error: err.message || 'Commit message generation failed.' });
  }
});

router.post('/git/stage', withWorkspaceContext, (req, res) => {
  try {
    res.json(stageGitFiles(gitWorkingDir(req), req.body?.files || []));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/unstage', withWorkspaceContext, (req, res) => {
  try {
    res.json(unstageGitFiles(gitWorkingDir(req), req.body?.files || []));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/commit', withWorkspaceContext, (req, res) => {
  try {
    res.json(commitGit(gitWorkingDir(req), {
      message: req.body?.message,
      files: req.body?.files || [],
      amend: req.body?.amend === true,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/pull', withWorkspaceContext, (req, res) => {
  try {
    res.json(pullGit(gitWorkingDir(req), {
      remote: req.body?.remote || null,
      branch: req.body?.branch || null,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/push', withWorkspaceContext, (req, res) => {
  try {
    if (req.body?.force) {
      return res.status(400).json({ success: false, error: 'Force push is not available in the visual Git workflow.' });
    }
    res.json(pushGit(gitWorkingDir(req), {
      remote: req.body?.remote || 'origin',
      branch: req.body?.branch || null,
      setUpstream: req.body?.setUpstream === true,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/stash', withWorkspaceContext, (req, res) => {
  try {
    res.json(stashGit(gitWorkingDir(req), {
      action: req.body?.action || 'list',
      message: req.body?.message || null,
      index: req.body?.index !== undefined ? req.body.index : null,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/branch', withWorkspaceContext, (req, res) => {
  try {
    res.json(branchGit(gitWorkingDir(req), {
      action: req.body?.action || 'list',
      name: req.body?.name || null,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/git/branches', withWorkspaceContext, (req, res) => {
  try {
    res.json(getGitBranches(gitWorkingDir(req)));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/git/commit/:hash', withWorkspaceContext, (req, res) => {
  try {
    res.json(getGitCommit(gitWorkingDir(req), req.params.hash));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/git/discard', withWorkspaceContext, (req, res) => {
  try {
    res.json(discardGitFiles(gitWorkingDir(req), req.body?.files || []));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Agent run (streaming) ─────────────────────────────────────────────────────

// ── External agents (Claude Code, Codex) ───────────────────────────────────
// A conversation can hand its turns to an installed agent CLI instead of
// Asyncat's own loop. It works in the conversation's Project folder, or a
// private scratch folder without one, and its events are streamed in the same
// format as Asyncat's agent.
router.get('/engines', async (_req, res) => {
  try {
    const usage = getExternalUsage();
    const engines = (await detectExternalEngines()).map((engine) => ({ ...engine, usage: usage[engine.id] || null }));
    // Agents spoken to over the Agent Client Protocol.
    for (const agent of listAcpAgents()) {
      engines.push({
        id: agent.engine,
        name: agent.title,
        acp: true,
        installed: agent.installed && !agent.needsDownload,
        signedIn: null,
        description: agent.needsDownload ? `Needs your OK to download ${agent.download?.name} (Customize → Agents)` : 'An ACP agent on this computer',
        models: [{ id: null, label: 'Default', hint: "The agent's own choice" }],
      });
    }
    res.json({ success: true, engines });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Claude Code's approval server (agent/claudeApprovalMcp.js) posts here and
// waits for the user's answer. Each run has its own secret.
router.post('/external-approvals/:runId', async (req, res) => {
  try {
    const result = await decideExternalApproval(req.params.runId, req.get('x-asyncat-approval-token'), req.body || {});
    if (!result) return res.status(403).json({ behavior: 'deny', message: 'Unknown approval request.' });
    res.json(result);
  } catch (err) {
    res.json({ behavior: 'deny', message: err.message });
  }
});

// Conversations already linked to a Claude Code or Codex session, by "engine:id".
function linkedExternalConversations(userId) {
  const rows = db.prepare(`
    SELECT id, metadata FROM conversations
    WHERE user_id = ? AND deleted_at IS NULL AND metadata LIKE '%externalSessions%'
  `).all(userId);
  const linked = new Map();
  for (const row of rows) {
    const metadata = parseProviderJson(row.metadata, {}) || {};
    for (const [engine, sessionId] of Object.entries(metadata.externalSessions || {})) {
      if (sessionId) linked.set(`${engine}:${sessionId}`, { id: row.id, metadata });
    }
  }
  return linked;
}

// Sessions from Claude Code and Codex on this computer, newest first.
router.get('/external-sessions', (req, res) => {
  try {
    const engine = ['claude-code', 'codex'].includes(req.query.engine) ? req.query.engine : 'all';
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const linked = linkedExternalConversations(req.user.id);
    const sessions = listExternalSessions({ engine, limit, hideCwd: scratchWorkspace() })
      .map((session) => ({ ...session, conversationId: linked.get(`${session.engine}:${session.id}`)?.id || null }));
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open a Claude Code or Codex session as an Asyncat chat. The first time it is
// copied in; later, a chat that was opened this way is refreshed when the
// session has moved on (the session file is the full record, including turns
// sent from Asyncat). Follow-ups resume the same session in its own folder.
router.post('/external-sessions/open', withWorkspaceContext, async (req, res) => {
  try {
    const { engine, sessionId } = req.body || {};
    if (!isExternalEngine(engine) || !sessionId) {
      return res.status(400).json({ success: false, error: 'Choose a Claude Code or Codex session.' });
    }
    const existing = linkedExternalConversations(req.user.id).get(`${engine}:${sessionId}`);
    const importedAt = existing?.metadata?.importedFrom?.syncedAt || 0;
    if (existing && !existing.metadata?.importedFrom) {
      return res.json({ success: true, conversationId: existing.id, refreshed: false });
    }

    const session = await readExternalSession(engine, sessionId);
    if (existing && session.modifiedAt <= importedAt + 1000) {
      return res.json({ success: true, conversationId: existing.id, refreshed: false });
    }
    if (session.messages.length === 0) {
      return res.status(422).json({ success: false, error: 'That session has no messages to show yet.' });
    }

    const metadata = {
      ...(existing?.metadata || {}),
      engine,
      experienceMode: 'work',
      externalSessions: { ...(existing?.metadata?.externalSessions || {}), [engine]: sessionId },
      externalCwd: session.cwd || null,
      importedFrom: { engine, sessionId, syncedAt: session.modifiedAt, skippedTurns: session.skippedTurns },
    };
    const result = await chatService.saveConversation(req.user.id, session.messages, {
      title: existing ? null : session.title,
      mode: 'work',
      projectIds: [],
      metadata,
      conversationId: existing?.id || null,
      workspaceId: req.workspaceId,
      databaseClient: req.db,
    });
    res.json({ success: true, conversationId: result.conversationId, refreshed: Boolean(existing) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// The folder a chat without a Project runs in: the folder of the Claude Code or
// Codex session it continues (Claude Code only finds a session from its own
// folder), otherwise a private scratch folder.
function externalFallbackFolder(externalCwd) {
  if (externalCwd && path.isAbsolute(externalCwd)) {
    try {
      if (fs.statSync(externalCwd).isDirectory()) return externalCwd;
    } catch { /* the folder is gone */ }
  }
  return scratchWorkspace();
}

async function runExternalEngineTurn(req, res, { engine, baseGoal, workingContext, workingDir, fileAttachments, externalSessionId, externalCwd, engineModel, agentMode, autoApprove, preApprovedTools, abortSignal }) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  req.socket?.setTimeout?.(0);
  const heartbeat = setInterval(() => writeAgentSseComment(res, 'ping'), 15000);
  let approvals = null;

  try {
    const hasProjectContext = Boolean(workingContext && typeof workingContext === 'object' && workingContext.rootId);
    // A chat can belong to a project without using its folders: the project's
    // instructions and knowledge still apply.
    const chatProject = projectForChat(req.user.id, workingContext?.projectId || req.body?.projectId || null);
    const context = resolveAgentWorkingContext({
      workingContext: hasProjectContext ? workingContext : null,
      workingDir: hasProjectContext ? workingDir : null,
      profile: null,
      userId: req.user.id,
    });
    const taskGoal = injectFileAttachments(baseGoal, resolveFileAttachments(fileAttachments, context, req.user.id));
    // A new Claude Code or Codex session gets the project's instructions and
    // knowledge once; later turns resume that session, which already has them.
    const chatAgent = req.body?.profileId ? getProfile(String(req.body.profileId), req.user.id) : null;
    const projectPreamble = (chatProject || chatAgent) && !externalSessionId
      ? buildChatContext({
        project: chatProject,
        agent: chatAgent,
        query: baseGoal,
        resolvedClient: {
          model: engineModel || engine,
          isLocal: false,
          providerInfo: {
            providerId: engine === 'claude-code' ? 'anthropic' : 'openai',
            settings: { context_window: 200000, model_capabilities: { supportsImageInput: false } },
          },
        },
      }).prompt
      : '';
    const contextName = [chatProject && `the Asyncat project "${chatProject.name}"`, chatAgent && `the agent "${chatAgent.name}"`].filter(Boolean).join(' with ');
    const goal = projectPreamble
      ? `This task comes from ${contextName}. Read the context first, then do the task.\n\n${projectPreamble}\n\n---\n\n## Task\n${taskGoal}`
      : taskGoal;
    const runDir = hasProjectContext ? context.workingDir : externalFallbackFolder(externalCwd);
    approvals = engine === 'claude-code' && agentMode === 'action' && !autoApprove
      ? openExternalApprovals({
        requestPermission: createPermissionRequest(req, res),
        port: req.socket.localPort,
        alwaysAllowedTools: Array.isArray(preApprovedTools) ? preApprovedTools : [],
        workingDir: runDir,
      })
      : null;
    const result = await runExternalAgent({
      engine,
      goal,
      workingDir: runDir,
      externalSessionId,
      agentMode,
      autoApprove,
      model: engineModel,
      approvalConfigPath: approvals?.configPath || null,
      emit: (type, data) => writeAgentSse(res, { type, data }),
      abortSignal,
    });
    writeAgentSse(res, {
      type: 'done',
      data: { answer: result.answer, stopReason: result.stopReason, engine, externalSessionId: result.externalSessionId, workingDir: runDir, rounds: 1 },
    });
  } catch (err) {
    writeAgentSse(res, { type: 'error', data: { message: err.message } });
    writeAgentSse(res, {
      type: 'done',
      data: { answer: '', stopReason: 'error', engine, externalSessionId: err.externalSessionId || externalSessionId },
    });
  } finally {
    clearInterval(heartbeat);
    approvals?.close();
    if (!res.writableEnded) res.end();
  }
}

// One turn with an ACP agent (agent/acp/): same folder rules and approval
// cards as the other engines.
async function runAcpEngineTurn(req, res, { engine, baseGoal, workingContext, workingDir, fileAttachments, externalSessionId, externalCwd, conversationHistory, agentMode, autoApprove, abortSignal }) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  req.socket?.setTimeout?.(0);
  const heartbeat = setInterval(() => writeAgentSseComment(res, 'ping'), 15000);
  try {
    const agent = getAcpAgent(acpNameFromEngine(engine));
    if (!agent) throw new Error('That ACP agent was removed. Pick another in the composer.');
    const hasProjectContext = Boolean(workingContext && typeof workingContext === 'object' && workingContext.rootId);
    const chatProject = projectForChat(req.user.id, workingContext?.projectId || req.body?.projectId || null);
    const context = resolveAgentWorkingContext({
      workingContext: hasProjectContext ? workingContext : null,
      workingDir: hasProjectContext ? workingDir : null,
      profile: null,
      userId: req.user.id,
    });
    const taskGoal = injectFileAttachments(baseGoal, resolveFileAttachments(fileAttachments, context, req.user.id));
    const projectPreamble = chatProject && !externalSessionId
      ? buildChatContext({
        project: chatProject,
        agent: null,
        query: baseGoal,
        resolvedClient: { model: engine, isLocal: false, providerInfo: { providerId: 'acp', settings: { context_window: 200000, model_capabilities: { supportsImageInput: false } } } },
      }).prompt
      : '';
    const goal = projectPreamble
      ? `This task comes from the Asyncat project "${chatProject.name}". Read the context first, then do the task.\n\n${projectPreamble}\n\n---\n\n## Task\n${taskGoal}`
      : taskGoal;
    const runDir = hasProjectContext ? context.workingDir : externalFallbackFolder(externalCwd);
    const result = await runAcpAgent({
      agent,
      goal,
      history: normalizeConversationHistory(conversationHistory),
      workingDir: runDir,
      externalSessionId,
      agentMode,
      autoApprove,
      requestPermission: createPermissionRequest(req, res),
      emit: (type, data) => writeAgentSse(res, { type, data }),
      abortSignal,
    });
    writeAgentSse(res, {
      type: 'done',
      data: { answer: result.answer, stopReason: result.stopReason, engine, externalSessionId: result.externalSessionId, workingDir: runDir, rounds: 1 },
    });
  } catch (err) {
    writeAgentSse(res, { type: 'error', data: { message: err.message } });
    writeAgentSse(res, { type: 'done', data: { answer: '', stopReason: 'error', engine, externalSessionId: err.externalSessionId || externalSessionId } });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}

// ── ACP agents (Customize → Agents → Coding agents) ──────────────────────────

router.get('/acp-agents', withWorkspaceContext, (_req, res) => {
  try {
    res.json({ success: true, agents: listAcpAgents(), catalog: ACP_CATALOG });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ success: false, error: err.message });
  }
});

// What a command downloads before it first runs, and its size: { command, args, deep }.
router.post('/acp-agents/check-download', withWorkspaceContext, async (req, res) => {
  try {
    const command = String(req.body?.command || '').trim();
    if (!command) return res.status(400).json({ success: false, error: 'Give the command.' });
    res.json({ success: true, download: await downloadSize(command, Array.isArray(req.body?.args) ? req.body.args.map(String) : [], { deep: Boolean(req.body?.deep) }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/acp-agents', withWorkspaceContext, (req, res) => {
  try {
    res.status(201).json({ success: true, agent: saveAcpAgent(req.body || {}) });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ success: false, error: err.message });
  }
});

router.patch('/acp-agents/:name', withWorkspaceContext, (req, res) => {
  try {
    if (!getAcpAgent(req.params.name)) return res.status(404).json({ success: false, error: 'No ACP agent by that name.' });
    res.json({ success: true, agent: saveAcpAgent(req.body || {}, { existing: req.params.name }) });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ success: false, error: err.message });
  }
});

router.delete('/acp-agents/:name', withWorkspaceContext, (req, res) => {
  try {
    if (!removeAcpAgent(req.params.name)) return res.status(404).json({ success: false, error: 'No ACP agent by that name.' });
    res.json({ success: true });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ success: false, error: err.message });
  }
});

// Start it and introduce Asyncat, to see that it answers.
router.post('/acp-agents/:name/check', withWorkspaceContext, async (req, res) => {
  try {
    res.json({ success: true, check: await checkAcpAgent(req.params.name, { cwd: scratchWorkspace() }) });
  } catch (err) {
    res.status(Number(err.status) || 502).json({ success: false, error: err.message });
  }
});

router.post('/run', withWorkspaceContext, async (req, res) => {
  let heartbeatInterval = null;
  const abortController = new AbortController();
  let clientClosed = false;
  res.on('close', () => {
    clientClosed = true;
    abortController.abort();
  });
  try {
    const {
      goal: rawGoal,
      message: rawMessage,
      conversationHistory = [],
      workingDir,
      workingContext,
      maxRounds,
      autoApprove,
      continueSessionId,
      preApprovedTools = [],
      profileId,
      enableTools = true,
      agentMode,
      agentMentions = [],
      fileAttachments = [],
      reasoningEffort = 'auto',
      enabledIntegrationTools = null,
      conversationId = null,
      userMessageId = null,
      assistantMessageId = null,
      clientTimestamp = null,
      clientTimezone = null,
      experienceMode = null,
      engine = 'asyncat',
      externalSessionId = null,
      externalCwd = null,
      engineModel = null,
      // A temporary chat: nothing from this run is saved or learned from.
      ephemeral = false,
    } = req.body;
    const temporary = ephemeral === true;
    const resolvedAgentMode = agentMode === 'design'
      ? 'design'
      : agentMode === 'plan' || enableTools === false
        ? 'plan'
        : 'action';
    const baseGoal = (rawGoal || rawMessage || '').trim();

    if (!baseGoal) {
      return res.status(400).json({ success: false, error: 'Goal is required' });
    }
    // Claude Code, Codex and other outside agents keep their own history.
    if (temporary && (isAcpEngine(engine) || isExternalEngine(engine))) {
      return res.status(400).json({ success: false, error: "A temporary chat can only use Asyncat's own agent: other agents keep their own history." });
    }
    if (isAcpEngine(engine)) {
      await runAcpEngineTurn(req, res, {
        engine,
        baseGoal,
        workingContext,
        workingDir,
        fileAttachments,
        externalSessionId,
        externalCwd,
        conversationHistory,
        agentMode: resolvedAgentMode,
        autoApprove: resolvedAgentMode === 'action' && (autoApprove === true || autoApprove === 'all'),
        abortSignal: abortController.signal,
      });
      return;
    }
    if (isExternalEngine(engine)) {
      await runExternalEngineTurn(req, res, {
        engine,
        baseGoal,
        workingContext,
        workingDir,
        fileAttachments,
        externalSessionId,
        externalCwd,
        engineModel,
        agentMode: resolvedAgentMode,
        autoApprove: resolvedAgentMode === 'action' && (autoApprove === true || autoApprove === 'all'),
        preApprovedTools,
        abortSignal: abortController.signal,
      });
      return;
    }
    // The agent picked for this chat (none means Asyncat itself). A default
    // agent is pre-selected in the composer, never applied silently here.
    const profile = profileId ? getProfile(profileId, req.user.id) : null;
    const resolvedClient = clientForAgent(req.user.id, profile);
    const { client: aiClient, model, isLocal, supportsNativeTools, providerInfo } = resolvedClient;

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

    const hasProjectContext = Boolean(workingContext && typeof workingContext === 'object' && workingContext.rootId);
    // A chat can belong to a project without using its folders: the project's
    // instructions and knowledge still apply.
    const chatProject = projectForChat(req.user.id, workingContext?.projectId || req.body?.projectId || null);
    const resolvedWorkingContext = resolveAgentWorkingContext({
      workingContext: hasProjectContext ? workingContext : null,
      // A client-supplied or profile directory is never accepted as an
      // implicit filesystem grant. Without a Project, local-file tools are
      // removed from the agent entirely.
      workingDir: hasProjectContext ? workingDir : null,
      profile: hasProjectContext ? profile : null,
      userId: req.user.id,
    });
    const resolvedWorkingDir = resolvedWorkingContext.workingDir;
    const resolvedFiles = resolveFileAttachments(fileAttachments, resolvedWorkingContext, req.user.id);
    const multimodalCapabilities = await getMultimodalCapabilities(req.user.id);
    const initialImageUrls = multimodalCapabilities.vision?.ready
      ? resolvedFiles
          .filter(file => file.promptOnly && String(file.mime || '').startsWith('image/'))
          .map(file => file.dataUrl)
          .filter(Boolean)
      : [];
    // Capabilities go into the system prompt via AgentRuntime — NOT prepended to the user's goal.
    const capabilitiesSection = [
      formatMultimodalCapabilityPrompt(multimodalCapabilities),
      !hasProjectContext && chatProject
        ? `Project scope: this chat is in the project "${chatProject.name}", which has no folder selected for this chat, so local files, code, shell, Git and workspace tools are unavailable. The user can attach a folder on the project page.`
        : '',
      !hasProjectContext && !chatProject
        ? 'Project scope: No Project is selected for this conversation. Local files, code, shell, Git, artifacts, and workspace tools are unavailable. Ask the user to select a Project before attempting local-file work.'
        : '',
    ].filter(Boolean).join('\n\n');
    const chatContext = buildChatContext({
      project: chatProject,
      agent: profile,
      query: baseGoal,
      resolvedClient,
    });
    const goal = injectFileAttachments(baseGoal, resolvedFiles);
    const resolvedMaxRounds  = maxRounds  || profile?.max_rounds  || 25;
    const resolvedAutoApprove = resolvedAgentMode === 'action'
      ? (autoApprove === true || autoApprove === 'all' || profile?.auto_approve || false)
      : false;
    const profileTools = Array.isArray(profile?.always_allowed_tools) ? profile.always_allowed_tools : [];
    const mentionedAgentProfiles = resolveAgentMentions(agentMentions, req.user.id);

    // Agent instructions travel with the knowledge context; a soul file
    // (advanced) still replaces the default identity.
    const resolvedSoul = profile?.soul_name && profile.soul_name !== 'default' ? loadSoul(profile.soul_name) : null;
    const agentToolNames = toolsForCapabilities(profile?.capabilities, toolRegistry.all());
    const scopeToolNames = hasProjectContext ? null : noProjectToolNames();
    const allowedToolNames = agentToolNames && scopeToolNames
      ? agentToolNames.filter(name => scopeToolNames.includes(name))
      : (agentToolNames || scopeToolNames);

    const agent = new AgentRuntime({
      aiClient,
      model,
      isLocal,
      supportsNativeTools,
      userId: req.user.id,
      workspaceId: req.workspaceId,
      projectId: resolvedWorkingContext.projectId || chatProject?.id || null,
      agentProfileId: profile?.id || null,
      workingDir: resolvedWorkingDir,
      workspaceRoot: resolvedWorkingContext.rootPath || resolvedWorkingDir,
      maxRounds: resolvedMaxRounds,
      autoApprove: resolvedAutoApprove,
      requestPermission: createPermissionRequest(req, res),
      askUser: createAskUserRequest(req, res),
      continueSessionId,
      soul: resolvedSoul,
      providerInfo,
      reasoningEffort,
      agentMode: resolvedAgentMode,
      allowedTools: allowedToolNames,
      allowedConnectors: Array.isArray(profile?.connectors) ? profile.connectors : null,
      enabledIntegrationTools: Array.isArray(enabledIntegrationTools) ? enabledIntegrationTools : null,
      mentionedAgents: mentionedAgentProfiles,
      capabilitiesSection,
      initialImageUrls: [...initialImageUrls, ...chatContext.images],
      knowledgeContext: chatContext.prompt,
      knowledgeSources: chatContext.sources,
      clientTimestamp,
      clientTimezone,
      abortSignal: abortController.signal,
      ephemeral: temporary,
      usageContext: {
        operation: 'agent',
        conversationId,
        userMessageId,
        assistantMessageId,
      },
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
    if (error?.name === 'AbortError' || abortController.signal.aborted || clientClosed) {
      if (!res.destroyed && !res.writableEnded) res.end();
      return;
    }
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

// ── Sandboxes ────────────────────────────────────────────────────────────────

router.get('/sandboxes', withWorkspaceContext, (req, res) => {
  try {
    res.json({
      success: true,
      root: sandboxRoot(),
      sandboxes: listSandboxes(req.user.id, {
        workspaceId: req.query.workspaceId || req.workspaceId || null,
        includeDeleted: req.query.includeDeleted === 'true',
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sandboxes', withWorkspaceContext, (req, res) => {
  try {
    const result = createSandbox({
      userId: req.user.id,
      workspaceId: req.body.workspaceId || req.workspaceId || null,
      name: req.body.name || 'Copy',
      sourcePath: req.body.sourcePath || req.body.source_path || null,
      strategy: req.body.strategy || 'auto',
      baseRef: req.body.baseRef || req.body.base_ref || 'HEAD',
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/sandboxes/:id', withWorkspaceContext, (req, res) => {
  try {
    const sandbox = getSandboxStatus(req.user.id, req.params.id);
    if (!sandbox) return res.status(404).json({ success: false, error: 'Copy not found.' });
    res.json({ success: true, sandbox });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sandboxes/:id/diff', withWorkspaceContext, (req, res) => {
  try {
    res.json(getSandboxDiff(req.user.id, req.params.id, {
      filePath: req.query.file || null,
      includePatch: req.query.includePatch === 'true',
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/sandboxes/:id/patch', withWorkspaceContext, (req, res) => {
  try {
    res.json(createSandboxPatch(req.user.id, req.params.id, {
      filePaths: req.body?.filePaths || req.body?.files || [],
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/sandboxes/:id/apply', withWorkspaceContext, (req, res) => {
  try {
    res.json(applySandboxPatch(req.user.id, req.params.id, {
      filePaths: req.body?.filePaths || req.body?.files || [],
      dryRun: req.body?.dryRun === true,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/sandboxes/:id/commit-branch', withWorkspaceContext, (req, res) => {
  try {
    res.json(commitSandboxBranch(req.user.id, req.params.id, {
      message: req.body?.message || 'Asyncat copy changes',
      filePaths: req.body?.filePaths || req.body?.files || [],
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/sandboxes/:id/jobs', withWorkspaceContext, (req, res) => {
  try {
    res.json({
      success: true,
      jobs: listSandboxJobs(req.user.id, req.params.id, { limit: req.query.limit }),
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/sandboxes/:id/jobs/:jobId', withWorkspaceContext, (req, res) => {
  try {
    const job = getSandboxJob(req.user.id, req.params.id, req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
    res.json({ success: true, job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/sandboxes/:id/jobs', withWorkspaceContext, async (req, res) => {
  try {
    res.status(201).json(await runSandboxCommand(req.user.id, req.params.id, {
      command: req.body?.command,
      cwd: req.body?.cwd || '.',
      kind: req.body?.kind || 'command',
      timeoutMs: req.body?.timeoutMs,
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/sandboxes/:id', withWorkspaceContext, (req, res) => {
  try {
    res.json(deleteSandbox(req.user.id, req.params.id, {
      force: req.body?.force === true || req.query.force === 'true',
    }));
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Session management ────────────────────────────────────────────────────────

router.get('/sessions', withWorkspaceContext, (req, res) => {
  const limit = parseInt(req.query.limit || '20');
  const workspaceId = getWorkspaceIdForRequest(req);
  const sessions = AgentSession.listRecent(req.user.id, limit, workspaceId);
  res.json({ success: true, sessions });
});

router.get('/sessions/:id', withWorkspaceContext, (req, res) => {
  const session = AgentSession.load(req.params.id);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, session });
});

router.get('/sessions/:id/audit', withWorkspaceContext, async (req, res) => {
  try {
    const session = db.prepare(
      'SELECT id FROM agent_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const rows = db.prepare(`
      SELECT id, session_id, tool_name, tool_call_id, permission_level, permission_decision,
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

router.get('/sessions/:id/changes/state', withWorkspaceContext, (req, res) => {
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

router.post('/sessions/:id/revert', withWorkspaceContext, (req, res) => {
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

router.patch('/sessions/:id', withWorkspaceContext, async (req, res) => {
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

// ── Mid-run plan editing ───────────────────────────────────────────────────────
// Allows the UI to inject or replace the plan of a running (or paused) session.
// Each plan item: { id, content, status: 'pending'|'in_progress'|'completed' }
router.patch('/sessions/:id/plan', withWorkspaceContext, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!Array.isArray(plan)) {
      return res.status(400).json({ success: false, error: 'plan must be an array of items' });
    }
    const normalized = plan.map((item, idx) => ({
      id: String(item.id || `plan_${idx}`),
      content: String(item.content || '').trim(),
      status: ['pending', 'in_progress', 'completed'].includes(item.status) ? item.status : 'pending',
    })).filter(item => item.content);

    // Update in-memory session if currently active
    const session = AgentSession.load(req.params.id);
    if (!session || session.userId !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Session not found or access denied' });
    }
    session.plan = normalized;
    session.save();

    res.json({ success: true, plan: normalized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/sessions/:id', withWorkspaceContext, async (req, res) => {
  try {
    const sessionRow = db.prepare(
      'SELECT scratchpad FROM agent_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);
    try {
      const scratchpad = JSON.parse(sessionRow?.scratchpad || '{}');
      if (scratchpad?.baselineCheckpoint) deleteCheckpoint(scratchpad.baselineCheckpoint);
    } catch {
      // Keep deletion resilient even if old scratchpad JSON is malformed.
    }

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

// ── Permissions / ask_user responses ─────────────────────────────────────────

router.post('/permissions/:requestId', withWorkspaceContext, (req, res) => {
  const pending = pendingPermissions.get(req.params.requestId);
  if (!pending || pending.userId !== req.user.id) {
    return res.json({ success: true, decision: req.body?.decision || 'deny', note: 'already_resolved' });
  }

  const decision = normalizeApprovalDecision(req.body?.decision);

  pendingPermissions.delete(req.params.requestId);
  pending.resolve({
    decision,
    reason: req.body?.reason || null,
  });

  res.json({ success: true, decision });
});

router.post('/ask/:requestId', withWorkspaceContext, (req, res) => {
  const pending = pendingUserQuestions.get(req.params.requestId);
  if (!pending || pending.userId !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Question request not found' });
  }

  const answer = req.body?.answer === undefined ? '' : String(req.body.answer);

  pendingUserQuestions.delete(req.params.requestId);
  pending.resolve({ success: true, answer });

  res.json({ success: true });
});

// ── Brain stats (memory + skill counts for UI indicators) ─────────────────────

// ── Agent memory ──────────────────────────────────────────────────────────────

router.get('/memory', withWorkspaceContext, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const q = req.query.q?.trim();
    const kind = req.query.kind || req.query.memory_type || 'all';
    // ?scope=project:<id> | agent:<id> | cat:<id> | shared — one owner's memories.
    const scope = String(req.query.scope || 'all');
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || (q ? 20 : 50))));
    let rows;
    if (q) {
      rows = searchMemories({
        userId: req.user.id,
        workspaceId,
        projectId: ALL_PROJECTS,
        catId: ALL_CATS,
        query: q,
        kind,
        limit: scope === 'all' ? limit : 200,
        bumpAccess: true,
      }).filter(row => ownedBy(row, scope)).slice(0, limit);
    } else if (scope !== 'all') {
      const filter = ownerFilter(scope);
      const kindClause = kind !== 'all' ? 'AND memory_type = ?' : '';
      rows = db.prepare(`
        SELECT * FROM agent_memory
        WHERE user_id = ? AND workspace_id = ? ${filter.sql} ${kindClause}
        ORDER BY importance DESC, COALESCE(last_accessed_at, updated_at) DESC
        LIMIT ?
      `).all(req.user.id, workspaceId, ...filter.params, ...(kindClause ? [kind] : []), limit).map(normalizeMemoryRow);
    } else {
      rows = listMemories({
        userId: req.user.id,
        workspaceId,
        projectId: ALL_PROJECTS,
        catId: ALL_CATS,
        kind,
        limit,
      });
    }
    // Name the project, agent and Cat a memory belongs to, for the Memory page.
    const memories = nameOwners(rows);
    res.json({ success: true, count: memories.length, memories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Memory stats ─────────────────────────────────────────────────────────────
router.get('/memory/stats', withWorkspaceContext, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const CAP = 750;
    const total = db.prepare(
      'SELECT COUNT(*) AS cnt FROM agent_memory WHERE user_id = ? AND workspace_id = ?'
    ).get(req.user.id, workspaceId)?.cnt || 0;

    const byTypeRows = db.prepare(
      'SELECT memory_type, COUNT(*) AS cnt FROM agent_memory WHERE user_id = ? AND workspace_id = ? GROUP BY memory_type ORDER BY cnt DESC'
    ).all(req.user.id, workspaceId);

    const oldest = db.prepare(
      "SELECT key, memory_type, created_at FROM agent_memory WHERE user_id = ? AND workspace_id = ? ORDER BY created_at ASC LIMIT 1"
    ).get(req.user.id, workspaceId);

    const mostAccessed = db.prepare(
      'SELECT key, memory_type, access_count FROM agent_memory WHERE user_id = ? AND workspace_id = ? ORDER BY access_count DESC LIMIT 1'
    ).get(req.user.id, workspaceId);

    res.json({
      success: true,
      total,
      cap: CAP,
      pctUsed: Math.round((total / CAP) * 100),
      byType: byTypeRows.reduce((acc, r) => ({ ...acc, [r.memory_type]: r.cnt }), {}),
      oldest: oldest || null,
      mostAccessed: mostAccessed || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Memory consolidate (manual trigger) ──────────────────────────────────────
router.post('/memory/consolidate', withWorkspaceContext, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const { memoryConsolidator } = await import('../../agent/MemoryConsolidator.js');
    const { enforceMemoryCap } = await import('../../agent/tools/memoryTools.js');

    const expired = db.prepare(
      "DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND expires_at IS NOT NULL AND expires_at < datetime('now')"
    ).run(req.user.id, workspaceId);

    const evicted = enforceMemoryCap(req.user.id, workspaceId);

    const result = await memoryConsolidator.consolidate({
      userId: req.user.id,
      workspaceId,
    });

    res.json({ success: true, expired: expired.changes, evicted, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/memory/:key', withWorkspaceContext, async (req, res) => {
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

// A memory written by hand: { content, kind, scope: shared | project:<id> | agent:<id> | cat:<id> }.
router.post('/memory', withWorkspaceContext, (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });
    const row = addMemory({ userId: req.user.id, workspaceId, content: req.body?.content, kind: req.body?.kind, scope: req.body?.scope });
    res.json({ success: true, memory: nameOwners([normalizeMemoryRow(row)])[0] });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ success: false, error: err.message });
  }
});

// Edit a memory: { content?, kind?, importance? }.
router.patch('/memory/by-id/:id', withWorkspaceContext, (req, res) => {
  try {
    const row = updateMemory({ userId: req.user.id, id: req.params.id, content: req.body?.content, kind: req.body?.kind, importance: req.body?.importance });
    res.json({ success: true, memory: nameOwners([normalizeMemoryRow(row)])[0] });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ success: false, error: err.message });
  }
});

router.delete('/memory', withWorkspaceContext, async (req, res) => {
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

router.delete('/memory/:key', withWorkspaceContext, async (req, res) => {
  try {
    const workspaceId = req.workspaceId ||
      db.prepare('SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1').get(req.user.id)?.id;
    if (!workspaceId) return res.status(404).json({ success: false, error: 'Workspace not found' });

    // The same key can exist in several projects; ?id= deletes just one.
    const result = req.query.id
      ? db.prepare('DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND id = ?').run(req.user.id, workspaceId, String(req.query.id))
      : db.prepare('DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ?').run(req.user.id, workspaceId, req.params.key);

    if (result.changes > 0) {
      res.json({ success: true, message: `Deleted memory: ${req.params.key}` });
    } else {
      res.status(404).json({ success: false, error: `No memory found with key: ${req.params.key}` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Profiles ─────────────────────────────────────────────────────────────────

router.get('/profiles', withWorkspaceContext, (req, res) => {
  try {
    const profiles = listProfiles(req.user.id);
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/profiles', withWorkspaceContext, (req, res) => {
  try {
    const {
      name, handle, description, icon, color, soulName, soulOverride, workingDir, maxRounds, autoApprove,
      alwaysAllowedTools, isDefault, instructions, avatarImage, starterPrompts, modelProfileId, capabilities, connectors,
    } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
    const profile = createProfile({
      userId: req.user.id, name: name.trim(), handle, description, icon, color,
      soulName, soulOverride, workingDir, maxRounds, autoApprove, alwaysAllowedTools, isDefault,
      instructions, avatarImage, starterPrompts, modelProfileId, capabilities, connectors,
    });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// The capability switches an agent can have (see ProfileManager).
router.get('/profiles-capabilities', withWorkspaceContext, (_req, res) => {
  res.json({
    success: true,
    capabilities: Object.entries(AGENT_CAPABILITIES).map(([id, { label }]) => ({ id, label })),
  });
});

const agentKnowledgeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 20 } }).array('files', 20);

router.get('/profiles/:id/knowledge', withWorkspaceContext, (req, res) => {
  const profile = getProfile(req.params.id, req.user.id);
  if (!profile) return res.status(404).json({ success: false, error: 'Agent not found' });
  res.json({ success: true, data: listKnowledgeFiles('agent', profile.id) });
});

router.post('/profiles/:id/knowledge', withWorkspaceContext, (req, res, next) => agentKnowledgeUpload(req, res, (err) => {
  if (!err) return next();
  const tooBig = err.code === 'LIMIT_FILE_SIZE';
  return res.status(tooBig ? 413 : 400).json({ success: false, error: tooBig ? 'Files can be up to 25 MB each.' : err.message });
}), async (req, res) => {
  const profile = getProfile(req.params.id, req.user.id);
  if (!profile) return res.status(404).json({ success: false, error: 'Agent not found' });
  const added = [];
  const errors = [];
  for (const file of Array.isArray(req.files) ? req.files : []) {
    try {
      added.push(await addKnowledgeFile({
        ownerType: 'agent',
        ownerId: profile.id,
        userId: req.user.id,
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        mimeType: file.mimetype,
        buffer: file.buffer,
      }));
    } catch (uploadErr) {
      errors.push({ name: file.originalname, error: uploadErr.message });
    }
  }
  res.status(added.length || !errors.length ? 200 : 422).json({ success: added.length > 0, data: added, errors });
});

router.delete('/profiles/:id/knowledge/:fileId', withWorkspaceContext, (req, res) => {
  const profile = getProfile(req.params.id, req.user.id);
  if (!profile) return res.status(404).json({ success: false, error: 'Agent not found' });
  const removed = deleteKnowledgeFile('agent', profile.id, req.params.fileId);
  res.status(removed ? 200 : 404).json({ success: removed });
});

router.get('/profiles/:id/context', withWorkspaceContext, (req, res) => {
  const profile = getProfile(req.params.id, req.user.id);
  if (!profile) return res.status(404).json({ success: false, error: 'Agent not found' });
  let modelProfile;
  try {
    modelProfile = describeModel(clientForAgent(req.user.id, profile));
  } catch (err) {
    modelProfile = { ready: false, reason: err.message };
  }
  res.json({
    success: true,
    data: knowledgeFitReport({ ownerType: 'agent', ownerId: profile.id, instructions: profile.instructions, profile: modelProfile }),
  });
});

router.get('/profiles/:id', withWorkspaceContext, (req, res) => {
  try {
    const profile = getProfile(req.params.id, req.user.id);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/profiles/:id', withWorkspaceContext, (req, res) => {
  try {
    const profile = updateProfile(req.params.id, req.user.id, req.body);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/profiles/:id', withWorkspaceContext, (req, res) => {
  try {
    if (getProfile(req.params.id, req.user.id)) deleteOwnerKnowledge('agent', req.params.id);
    deleteProfile(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Checkpoints ──────────────────────────────────────────────────────────────

// ─── Artifact Routes ────────────────────────────────────────────────────────

function findArtifactFile(workingDir, filename) {
  const roots = [getArtifactsDir(workingDir), getLegacyArtifactsDir(workingDir)];
  for (const root of roots) {
    const filePath = path.join(root, filename);
    if (filePath.startsWith(root) && fs.existsSync(filePath)) {
      return { artifactsDir: root, filePath };
    }
  }
  return null;
}

/** List all artifacts in the workspace. */
router.get('/artifacts', (req, res) => {
  try {
    const workingDir = req.headers['x-workspace-root'] || defaultAgentWorkingDir();
    const artifactsDir = getArtifactsDir(workingDir);
    const legacyArtifactsDir = getLegacyArtifactsDir(workingDir);

    if (!fs.existsSync(artifactsDir) && !fs.existsSync(legacyArtifactsDir)) {
      return res.json({ success: true, count: 0, artifacts: [] });
    }

    const seen = new Set();
    const artifacts = [artifactsDir, legacyArtifactsDir]
      .filter(dir => fs.existsSync(dir))
      .flatMap(dir => fs.readdirSync(dir)
        .filter(f => !f.startsWith('.') && !seen.has(f))
        .map(f => {
      seen.add(f);
      const filePath = path.join(dir, f);
      const stat = fs.statSync(filePath);
      const ext = path.extname(f).toLowerCase();
      const typeMap = {
        '.md': 'markdown', '.markdown': 'markdown',
        '.html': 'html', '.htm': 'html',
        '.svg': 'svg', '.csv': 'csv', '.json': 'json', '.txt': 'text',
        '.pdf': 'pdf', '.zip': 'zip',
        '.js': 'code', '.ts': 'code', '.py': 'code', '.jsx': 'code', '.tsx': 'code',
      };
      return {
        filename: f,
        path: path.relative(workingDir, filePath),
        type: typeMap[ext] || 'text',
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    })).sort((a, b) => b.modified.localeCompare(a.modified));

    res.json({ success: true, count: artifacts.length, artifacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Get artifact content or raw download. */
router.get('/artifacts/:filename', (req, res) => {
  try {
    const workingDir = req.headers['x-workspace-root'] || defaultAgentWorkingDir();
    const filename = path.basename(req.params.filename);
    const found = findArtifactFile(workingDir, filename);

    if (!found) {
      return res.status(404).json({ success: false, error: 'Artifact not found' });
    }
    const { filePath } = found;

    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
      '.md': 'text/markdown', '.html': 'text/html', '.htm': 'text/html',
      '.svg': 'image/svg+xml', '.csv': 'text/csv', '.json': 'application/json',
      '.txt': 'text/plain', '.js': 'text/javascript', '.ts': 'text/plain',
      '.py': 'text/plain', '.css': 'text/css',
      '.pdf': 'application/pdf', '.zip': 'application/zip',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', contentType);
      return res.sendFile(filePath);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const stat = fs.statSync(filePath);
    res.json({
      success: true,
      filename,
      type: contentType,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      content,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Delete an artifact. */
router.delete('/artifacts/:filename', (req, res) => {
  try {
    const workingDir = req.headers['x-workspace-root'] || defaultAgentWorkingDir();
    const filename = path.basename(req.params.filename);
    const found = findArtifactFile(workingDir, filename);

    if (!found) {
      return res.status(404).json({ success: false, error: 'Artifact not found' });
    }
    const { filePath } = found;

    fs.unlinkSync(filePath);
    res.json({ success: true, deleted: filename });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Code intelligence endpoints ───────────────────────────────────────────────

function codeWorkingDir(req) {
  return req.query?.path || req.body?.path || defaultAgentWorkingDir();
}

const codeContext = (req) => ({ workingDir: codeWorkingDir(req) });

router.get('/code/search', withWorkspaceContext, async (req, res) => {
  try {
    const result = await codeSearchTool.execute({
      symbol: req.query.q || '',
      kind: req.query.kind || 'any',
      language: req.query.language || undefined,
      max_results: parseInt(req.query.limit || '30'),
    }, codeContext(req));
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/code/definitions', withWorkspaceContext, async (req, res) => {
  try {
    const result = await listDefinitionsTool.execute({
      path: req.query.file,
    }, codeContext(req));
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/code/find-definition', withWorkspaceContext, async (req, res) => {
  try {
    const result = await findDefinitionTool.execute({
      symbol: req.query.symbol,
      language: req.query.language,
    }, codeContext(req));
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/code/references', withWorkspaceContext, async (req, res) => {
  try {
    const result = await findReferencesTool.execute({
      symbol: req.query.symbol,
      language: req.query.language,
      max_results: parseInt(req.query.limit || '50'),
    }, codeContext(req));
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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

// Omitting the path makes this a catch-all in both Express 4 and Express 5.
router.use((req, res) => {
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
    SELECT id, session_id, tool_name, tool_call_id, permission_level, permission_decision,
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
const GIT_TOOLS = new Set(['git_clone', 'git_pull', 'git_status', 'git_diff', 'git_log', 'git_branch', 'git_commit', 'git_push', 'git_stash', 'git_remote']);

function gitCommandLabel(tool, args = {}) {
  if (tool === 'git_commit') return `git commit -m "${args.message || ''}"`;
  if (tool === 'git_pull') return `git pull ${[args.remote, args.branch].filter(Boolean).join(' ')}`.trim();
  if (tool === 'git_push') return `git push ${[args.remote, args.branch].filter(Boolean).join(' ')}`.trim();
  if (tool === 'git_branch') return args.create ? `git branch ${args.create}` : args.switch ? `git switch ${args.switch}` : args.delete ? `git branch -d ${args.delete}` : 'git branch';
  if (tool === 'git_stash') return `git stash ${args.action || 'list'}`;
  if (tool === 'git_diff') return `git diff${args.file ? ` -- ${args.file}` : ''}`;
  if (tool === 'git_status') return 'git status';
  if (tool === 'git_log') return 'git log';
  if (tool === 'git_remote') return `git remote ${args.action || 'list'}`;
  if (tool === 'git_clone') return `git clone ${args.url || ''}`.trim();
  return tool;
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
    } else if (GIT_TOOLS.has(tool)) {
      commands.push({
        ...base,
        type: 'command',
        command: gitCommandLabel(tool, args),
        output: result.output || result.stdout || result.message || '',
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

export default router;
