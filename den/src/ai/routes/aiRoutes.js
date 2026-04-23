// aiRoutes.js - Chat Only
import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import { enhancedRouter } from '../controllers/ai/chat/chatRouter.js';
import { dataLayer } from '../controllers/ai/DataLayer.js';
import { chatService } from '../controllers/ai/chatService.js';
import { getPacks, launchPack } from '../controllers/ai/packsController.js';

// import { imageGenerator } from '../controllers/ai/imageGenerator.js'; // PAUSED: Image model temporarily disabled
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const router = express.Router();

// Helper function to get workspace context from request
const getWorkspaceContext = (req) => {
  return req.query?.workspaceId || req.body?.workspaceId || null;
};

// Shared auth middleware: JWT verify + attach compat db client + workspace context
const addAuthenticatedClient = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return; // jwtVerify already sent 401
    attachDb(req, res, () => {
      req.workspaceId = getWorkspaceContext(req);
      next();
    });
  });
};

const authenticateUser = addAuthenticatedClient;


// Main AI chat endpoint
router.post('/unified', addAuthenticatedClient, async (req, res, next) => {
  try {
    await enhancedRouter(req, res);
  } catch (error) {
    next(error);
  }
});

// Streaming AI chat endpoint
router.post('/unified-stream', addAuthenticatedClient, async (req, res, next) => {
  try {
    const {
      message,
      conversationHistory = [],
      projectIds = [],
      responseStyle = 'normal',
      webSearch = false,
      thinking = false,
      modelConfig = null,
    } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Import required modules
    const { generateSystemPrompt } = await import('../controllers/ai/chat/systemPrompts.js');
    const { formatContext } = await import('../controllers/ai/DataLayer.js');
    const dataLayer = (await import('../controllers/ai/DataLayer.js')).default;
    const { TOOL_DEFINITIONS, buildToolsSystemSection } = await import('../controllers/ai/toolDefinitions.js');
    const { executeTool } = await import('../controllers/ai/toolExecutor.js');
    const { getAiClientForUser } = await import('../controllers/ai/chat/chatRouter.js');
    const { searchWeb, formatSearchResults } = await import('../controllers/ai/webSearch.js');

    // Use the same per-user provider lookup as the non-streaming route
    const { client: aiClient, model: AI_MODEL, isLocal } = getAiClientForUser(req.user.id);

    // Web search — fetch results before building prompt so they go into context
    let searchContext = '';
    if (webSearch) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'search_start', query: message.trim() })}\n\n`);

        const searchData = await searchWeb(message.trim(), 5, true); // includeImages = true
        searchContext = formatSearchResults(searchData);
        const pagesRead = searchData.results.filter(r => r.content).length;
        // Send lightweight source list to frontend (no full content — that stays server-side)
        const sources = searchData.results.map(r => ({
          title:      r.title,
          url:        r.url,
          read:       !!r.content,   // true = full page fetched, false = snippet only
          fetchError: r.fetchError || null,
        }));
        res.write(`data: ${JSON.stringify({
          type: 'search_done',
          resultCount: searchData.results.length,
          pagesRead,
          sources,
          images: searchData.images || [],
          engine: searchData.engine
        })}\n\n`);
        console.log(`🔍 [webSearch] "${message.trim().slice(0, 60)}" → ${searchData.results.length} results, ${pagesRead} pages read, ${searchData.images?.length || 0} images (${searchData.engine})`);
      } catch (searchErr) {
        console.warn('[webSearch] Search failed:', searchErr.message);
        res.write(`data: ${JSON.stringify({ type: 'search_error', error: searchErr.message })}\n\n`);
        // Non-fatal — continue without search context
      }
    }

    // Get context
    const workspaceId = req.workspaceId;
    const contextData = await dataLayer.getUserContext(req.user.id, projectIds, workspaceId, req.db);
    const contextPrompt = formatContext(contextData);

    const workspaceContext = `**WORKSPACE:** ${contextData.workspaceName || 'Current Workspace'}`;
    const projectContext = projectIds.length > 0
      ? `**SELECTED PROJECTS:** ${projectIds.join(', ')}`
      : `**PROJECT SCOPE:** All projects in workspace`;

    // Generate system prompt
    // Local small models: skip the tool definitions section — it adds ~3000+ tokens
    // and small models cannot reliably execute tool calls anyway.
    const baseSystemPrompt = generateSystemPrompt({
      workspaceContext,
      projectContext,
      responseStyleInstructions: responseStyle === 'concise' ? 'Be concise and direct.' : 'Be helpful and thorough.',
      userTimezone: req.body.userTimezone || 'UTC',
      userLocalDateTime: req.body.userLocalDateTime || new Date().toISOString(),
      contextData: contextPrompt,
      enableArtifacts: true
    });

    // User-supplied system prompt prefix (from Model Config panel)
    const promptPrefix = modelConfig?.system_prompt_prefix?.trim()
      ? modelConfig.system_prompt_prefix.trim() + '\n\n'
      : '';

    // Thinking instruction for models that don't natively emit <think> blocks
    // Native thinking models (QwQ, DeepSeek-R1, etc.) don't need this — they think automatically.
    const thinkingInstruction = thinking
      ? '\n\nIMPORTANT: Before giving your final answer, reason step-by-step inside <think>...</think> tags. Think through the problem thoroughly. Then give your clean answer after the closing tag.'
      : '';

    const systemPrompt = isLocal
      ? promptPrefix + baseSystemPrompt + thinkingInstruction
      : promptPrefix + baseSystemPrompt + buildToolsSystemSection(contextData);

    // Local models: trim conversation history more aggressively to stay within context
    const historySlice = isLocal ? 3 : 6;

    // Prepare messages — inject web search results before user message if present
    const userContent = searchContext
      ? `${searchContext}\n\n---\n\n**User question:** ${message}`
      : message;

    const messages = [
      ...conversationHistory.slice(-historySlice).map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: "user", content: userContent }
    ];

    const toolContext = {
      userId: req.user.id,
      db: req.db,
      workspaceId
    };

    // Local models: smaller max tokens to fit within context window
    const maxTokens = isLocal
      ? (responseStyle === 'concise' ? 512 : 1024)
      : (responseStyle === 'concise' ? 1500 : 4000);

    // ── Agentic streaming loop ──────────────────────────────────────────────
    // We iterate: stream → detect tool_calls → execute → stream again
    // Local models skip tool calling — they can't reliably handle it.
    let threadMessages = [...messages];
    let fullContent = '';
    let continueLoop = true;
    const MAX_TOOL_ROUNDS = isLocal ? 1 : 5;
    let toolRound = 0;

    while (continueLoop && toolRound < MAX_TOOL_ROUNDS) {
      toolRound++;

      const streamParams = {
        model: AI_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...threadMessages],
        stream: true,
        max_tokens: maxTokens,
        // Apply user's model config (sampling params) — llama-server passes these through
        ...(modelConfig && isLocal ? {
          temperature:    modelConfig.temperature    ?? undefined,
          top_p:          modelConfig.top_p          ?? undefined,
          top_k:          modelConfig.top_k          ?? undefined,
          min_p:          modelConfig.min_p          ?? undefined,
          repeat_penalty: modelConfig.repeat_penalty ?? undefined,
        } : {}),
      };

      // Only send tool definitions for cloud providers that support them
      if (!isLocal) {
        streamParams.tools = TOOL_DEFINITIONS;
        streamParams.tool_choice = 'auto';
        streamParams.max_completion_tokens = maxTokens;
        delete streamParams.max_tokens;
      }

      const stream = await aiClient.client.chat.completions.create(streamParams);

      // Accumulate this round's output
      let roundContent = '';
      let finishReason = null;
      // Map of index → { id, name, arguments_so_far }
      const pendingToolCalls = {};

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        finishReason = chunk.choices[0]?.finish_reason || finishReason;

        if (delta?.content) {
          roundContent += delta.content;
          fullContent += delta.content;
          res.write(`data: ${JSON.stringify({ content: delta.content, type: 'delta' })}\n\n`);
        }

        // Accumulate tool call deltas
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!pendingToolCalls[tc.index]) {
              pendingToolCalls[tc.index] = { id: tc.id || '', name: '', arguments: '' };
            }
            if (tc.id) pendingToolCalls[tc.index].id = tc.id;
            if (tc.function?.name) pendingToolCalls[tc.index].name += tc.function.name;
            if (tc.function?.arguments) pendingToolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }

      if (finishReason === 'tool_calls') {
        // Build the assistant message to add to thread
        const toolCallsList = Object.values(pendingToolCalls);
        const assistantMsg = {
          role: 'assistant',
          content: roundContent || null,
          tool_calls: toolCallsList.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments }
          }))
        };
        threadMessages.push(assistantMsg);

        // Execute each tool, emit events, collect results
        const toolResultMessages = [];
        for (const tc of toolCallsList) {
          let args = {};
          try { args = JSON.parse(tc.arguments); } catch (_) {}

          // Notify frontend this tool is starting
          res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: tc.name, args, callId: tc.id })}\n\n`);

          const result = await executeTool(tc.name, args, toolContext);
          console.log(`🔧 Stream tool [${tc.name}]:`, result);

          // Notify frontend of result
          res.write(`data: ${JSON.stringify({ type: 'tool_done', tool: tc.name, result, callId: tc.id })}\n\n`);

          toolResultMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          });
        }

        threadMessages.push(...toolResultMessages);
        // Loop back to let model produce final response
      } else {
        // Model returned text — we're done
        continueLoop = false;
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ type: 'done', fullContent })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Streaming error:', error);
    
    let errorMessage = error.message;
    let errorType = 'error';

    // Local model server not running
    const cause = error.cause;
    const isLocalRefused =
      (cause?.code === 'ECONNREFUSED' || error.code === 'ECONNREFUSED') &&
      (cause?.address === '127.0.0.1' || String(cause?.port) === String(process.env.LLAMA_SERVER_PORT ?? '8765'));
    if (isLocalRefused || error.message?.includes('ECONNREFUSED')) {
      errorType = 'local_model_offline';
      errorMessage = 'The local model server is not running. Open Models and load a model first.';
    }
    // Azure / cloud content filter
    else if (error.code === 'content_filter' || error.message?.includes('content management policy')) {
      errorType = 'content_filter';
      errorMessage = 'Content filtered by the AI provider. Please rephrase your request.';
    }
    // Context window overflow
    else if (error.message?.includes('context') && error.message?.includes('token')) {
      errorType = 'context_overflow';
      errorMessage = 'Message too long for the model context window. Try a shorter message or start a new conversation.';
    }
    
    res.write(`data: ${JSON.stringify({ 
      type: errorType, 
      error: errorMessage,
      code: error.code 
    })}\n\n`);
    res.end();
  }
});

// Web search test endpoint — GET /api/ai/web-search?q=your+query&images=true
router.get('/web-search', addAuthenticatedClient, async (req, res) => {
  const query = req.query.q?.trim();
  const includeImages = req.query.images === 'true';
  if (!query) return res.status(400).json({ success: false, error: 'q parameter required' });
  try {
    const { searchWeb } = await import('../controllers/ai/webSearch.js');
    const results = await searchWeb(query, 5, includeImages);
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Conversation summarization endpoint — uses the user's configured local model
router.post('/summarize-conversation', addAuthenticatedClient, async (req, res) => {
  try {
    const { conversation, messageCount, mode = 'chat' } = req.body;

    if (!conversation || !conversation.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Conversation text is required for summarization'
      });
    }

    const { getAiClientForUser } = await import('../controllers/ai/chat/chatRouter.js');
    const { client: aiClient, model } = getAiClientForUser(req.user.id);

    const systemPrompt = `Summarize the following conversation concisely. Capture main topics, key decisions, and important context needed to continue the conversation. Keep it under 400 words.`;

    const response = await aiClient.messages.create({
      model,
      max_completion_tokens: 600,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Summarize this conversation (${messageCount || 'multiple'} messages):\n\n${conversation.substring(0, 40000)}`
      }]
    });

    const summary = response.content?.[0]?.text || 'Summary unavailable';
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ success: false, error: 'Failed to summarize conversation' });
  }
});

// Conversation title generation — fast, uses local model, called after first exchange
router.post('/generate-title', addAuthenticatedClient, async (req, res) => {
  try {
    const { userMessage, aiResponse } = req.body;
    if (!userMessage) return res.status(400).json({ success: false, error: 'userMessage required' });

    const { getAiClientForUser } = await import('../controllers/ai/chat/chatRouter.js');
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

// ==========================================
// IMAGE GENERATION ENDPOINTS - PAUSED
// ==========================================

// PAUSED: Image model temporarily disabled
/*
// Generate image endpoint
router.post('/image/generate', authenticateUser, async (req, res) => {
  try {
    const {
      prompt,
      sessionId = null,
      size = "1024x1024",
      outputFormat = "png",
      n = 1,
      editMode = false,
      baseImage = null,
      conversationId = null, // NEW: Optional conversation ID for storage
      storeInConversation = false // NEW: Flag to store images in conversation
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required for image generation'
      });
    }

    if (editMode && !baseImage) {
      return res.status(400).json({
        success: false,
        error: 'Base image is required for image editing'
      });
    }

    // Validate base image size for editing
    if (editMode && baseImage) {
      try {
        const base64Data = baseImage.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageSizeBytes = (base64Data.length * 3) / 4; // Approximate decoded size
        const maxImageSize = 10 * 1024 * 1024; // 10MB limit

        if (imageSizeBytes > maxImageSize) {
          return res.status(400).json({
            success: false,
            error: 'Image too large for editing',
            message: `Image size (${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxImageSize / 1024 / 1024}MB). Please use a smaller image.`,
            currentSize: `${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB`,
            maxSize: `${maxImageSize / 1024 / 1024}MB`
          });
        }
      } catch (sizeError) {
        console.warn('Could not validate image size:', sizeError.message);
      }
    }


    const result = await imageGenerator.generateImage(req.user.id, prompt, {
      sessionId,
      size,
      outputFormat,
      n,
      editMode,
      baseImage,
      conversationId,
      storeInConversation
    });


    res.json(result);

  } catch (error) {
    console.error('🔥 Image generation endpoint error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to ${req.body.editMode ? 'edit' : 'generate'} image`,
      message: `Sorry, something went wrong with image ${req.body.editMode ? 'editing' : 'generation'}. Please try again.`
    });
  }
});

// Legacy endpoint for image editing (for backward compatibility)
router.post('/image/edit', authenticateUser, async (req, res) => {
  try {
    const {
      prompt,
      baseImage,
      sessionId = null,
      size = "1024x1024",
      outputFormat = "png",
      n = 1,
      conversationId = null, // NEW: Optional conversation ID for storage
      storeInConversation = false // NEW: Flag to store images in conversation
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required for image editing'
      });
    }

    if (!baseImage) {
      return res.status(400).json({
        success: false,
        error: 'Base image is required for image editing'
      });
    }

    // Validate base image size
    try {
      const base64Data = baseImage.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageSizeBytes = (base64Data.length * 3) / 4; // Approximate decoded size
      const maxImageSize = 10 * 1024 * 1024; // 10MB limit

      if (imageSizeBytes > maxImageSize) {
        return res.status(400).json({
          success: false,
          error: 'Image too large for editing',
          message: `Image size (${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxImageSize / 1024 / 1024}MB). Please use a smaller image.`,
          currentSize: `${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB`,
          maxSize: `${maxImageSize / 1024 / 1024}MB`
        });
      }
    } catch (sizeError) {
      console.warn('Could not validate image size:', sizeError.message);
    }


    const result = await imageGenerator.generateImage(req.user.id, prompt, {
      sessionId,
      size,
      outputFormat,
      n,
      editMode: true,
      baseImage,
      conversationId,
      storeInConversation
    });


    res.json(result);

  } catch (error) {
    console.error('🔥 Image editing endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to edit image',
      message: 'Sorry, something went wrong with image editing. Please try again.'
    });
  }
});

// Get image session info
router.get('/image/session/:sessionId', authenticateUser, async (req, res) => {
  try {
    const session = imageGenerator.getSession(req.params.sessionId);

    if (!session || session.userId !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Image session not found' });
    }

    const result = imageGenerator.getSessionHistory(req.params.sessionId);
    res.json(result);

  } catch (error) {
    console.error('Image session error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve image session' });
  }
});
*/

// ==========================================
// CHAT ENDPOINTS WITH WORKSPACE SUPPORT
// ==========================================

// Save conversation
router.post('/chats/save', addAuthenticatedClient, async (req, res) => {
  try {
    const { messages, title, mode = 'chat', projectIds = [], metadata = {}, conversationId = null, fileAttachments = null } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required and cannot be empty'
      });
    }
    
    
    const result = await chatService.saveConversation(req.user.id, messages, {
      title,
      mode,
      projectIds,
      metadata,
      conversationId,
      workspaceId: req.workspaceId,
      fileAttachments,
      authenticatedDb: req.db
    });
    
    res.json({ success: true, ...result });
    
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    console.error('💥 Save conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to save conversation' });
  }
});

// Auto-save endpoint
router.post('/chats/autosave', addAuthenticatedClient, async (req, res) => {
  try {
    const { messages, mode = 'chat', projectIds = [], metadata = {}, conversationId = null, fileAttachments = null } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Auto-save requires at least 2 messages'
      });
    }
    
    const result = await chatService.saveConversation(req.user.id, messages, {
      title: null,
      mode,
      projectIds,
      metadata,
      conversationId,
      workspaceId: req.workspaceId,
      fileAttachments,
      authenticatedDb: req.db
    });
    
    res.json({ success: true, ...result });
    
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    console.error('💥 Auto-save error:', error);
    res.status(500).json({ success: false, error: 'Auto-save failed' });
  }
});

// Get conversations list with workspace filtering
router.get('/chats', addAuthenticatedClient, async (req, res) => {
  try {

    const { mode, limit = 50, offset = 0, includeArchived = false, search } = req.query;

    const options = {
      mode: mode || null,
      limit: parseInt(limit),
      offset: parseInt(offset),
      includeArchived: includeArchived === 'true',
      searchTerm: search || null,
      workspaceId: req.workspaceId,
      authenticatedDb: req.db // Pass authenticated client
    };

    const result = await chatService.getUserConversations(req.user.id, options);
    res.json({ success: true, ...result });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversations' });
  }
});

// Get conversation workspaces for user (must be before /:conversationId)
router.get('/chats/workspaces', authenticateUser, async (req, res) => {
  try {
    const workspaces = await chatService.getUserConversationWorkspaces(req.user.id);
    res.json({ success: true, workspaces });
  } catch (error) {
    console.error('Get conversation workspaces error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversation workspaces' });
  }
});

// Get trashed conversations (must be before /:conversationId)
router.get('/chats/trash', addAuthenticatedClient, async (req, res) => {
  try {
    const conversations = await chatService.getTrashConversations(
      req.user.id, req.workspaceId, req.db
    );
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load trash' });
  }
});

// Get specific conversation with workspace validation
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

// ==========================================
// PUBLIC CHAT ENDPOINTS
// ==========================================

// Make conversation public
router.post('/chats/:conversationId/public', authenticateUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { expiresIn = null } = req.body;
    
    
    const result = await chatService.makeConversationPublic(req.user.id, conversationId, expiresIn, req.workspaceId);
    
    if (result.success) {
      res.json({
        success: true,
        publicToken: result.publicToken,
        publicUrl: `${req.protocol}://${req.get('host')}/public/chat/${result.publicToken}`,
        expiresAt: result.expiresAt
      });
    } else {
      res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('Make public error:', error);
    
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      res.status(404).json({ success: false, error: 'Conversation not found or access denied' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to make conversation public' });
    }
  }
});

// Revoke public access
router.delete('/chats/:conversationId/public', authenticateUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    
    const result = await chatService.revokePublicAccess(req.user.id, conversationId, req.workspaceId);
    
    if (result.success) {
      res.json({ success: true, message: 'Public access revoked successfully' });
    } else {
      res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('Revoke public access error:', error);
    
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      res.status(404).json({ success: false, error: 'Conversation not found or access denied' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to revoke public access' });
    }
  }
});

// Get public conversation (NO AUTHENTICATION REQUIRED)
router.get('/public/chat/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    
    const result = await chatService.getPublicConversation(token);
    
    if (result.success) {
      res.json({
        success: true,
        conversation: result.conversation,
        isPublic: true,
        expiresAt: result.expiresAt
      });
    } else {
      res.status(404).json(result);
    }
    
  } catch (error) {
    console.error('Get public conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve public conversation' });
  }
});

// Check if conversation is public (for owner)
router.get('/chats/:conversationId/public/status', authenticateUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const result = await chatService.getPublicStatus(req.user.id, conversationId, req.workspaceId);
    res.json(result);
    
  } catch (error) {
    console.error('Get public status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get public status' });
  }
});

// Update conversation (pin, archive, etc.) with workspace validation
router.patch('/chats/:conversationId', addAuthenticatedClient, async (req, res) => {
  try {
    const result = await chatService.updateConversation(req.user.id, req.params.conversationId, req.body, req.workspaceId, req.db);
    res.json({ success: true, conversation: result });
    
  } catch (error) {
    console.error('Update conversation error:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update conversation' });
    }
  }
});

// Delete conversation with workspace validation
router.delete('/chats/:conversationId', addAuthenticatedClient, async (req, res) => {
  try {
    await chatService.deleteConversation(req.user.id, req.params.conversationId, req.workspaceId, req.db);
    res.json({ success: true, message: 'Conversation deleted successfully' });
    
  } catch (error) {
    console.error('Delete conversation error:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to delete conversation' });
    }
  }
});

// Get conversation stats for workspace
router.get('/chats/stats/summary', authenticateUser, async (req, res) => {
  try {
    const stats = await chatService.getConversationStats(req.user.id, req.workspaceId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve statistics' });
  }
});

// ==========================================
// CHAT FOLDER ROUTES (user-specific)
// ==========================================

// List folders for current user + workspace
router.get('/chat-folders', addAuthenticatedClient, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

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

// Create a folder
router.post('/chat-folders', addAuthenticatedClient, async (req, res) => {
  try {
    const { name, color } = req.body;
    const workspaceId = req.workspaceId;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const { data, error } = await req.db
      .schema('aichats')
      .from('chat_folders')
      .insert({ user_id: req.user.id, workspace_id: workspaceId, name: name.trim(), color: color || null })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, folder: data });
  } catch (error) {
    console.error('Create chat folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to create folder' });
  }
});

// Rename / reorder a folder
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

// Delete a folder (conversations become unfiled via ON DELETE SET NULL)
router.delete('/chat-folders/:folderId', addAuthenticatedClient, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { error } = await req.db
      .schema('aichats')
      .from('chat_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete folder' });
  }
});

// Assign / unassign a conversation to a folder
router.patch('/chats/:conversationId/folder', addAuthenticatedClient, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { folder_id } = req.body; // null to unassign

    const { data, error } = await req.db
      .schema('aichats')
      .from('conversations')
      .update({ folder_id: folder_id || null })
      .eq('id', conversationId)
      .eq('user_id', req.user.id)
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

// ==========================================
// EXISTING ENDPOINTS WITH WORKSPACE CONTEXT
// ==========================================

// User context endpoint with workspace filtering
router.get('/context/:projectIds?', authenticateUser, async (req, res) => {
  try {
    const projectIds = req.params.projectIds 
      ? req.params.projectIds.split(',').filter(Boolean)
      : [];
    
    const contextData = await dataLayer.getUserContext(req.user.id, projectIds, req.workspaceId);
    res.json({ success: true, data: contextData });
    
  } catch (error) {
    console.error('Context retrieval error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve user context' });
  }
});

// Analytics query endpoint with workspace context
router.post('/analytics/query', authenticateUser, async (req, res) => {
  try {
    const { query, classification, projectIds = [] } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    
    const result = await dataLayer.executeAnalyticsQuery(
      req.user.id,
      query,
      classification || { category: 'GENERAL', needsSQL: true },
      projectIds,
      req.workspaceId
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Analytics query error:', error);
    res.status(500).json({ success: false, error: 'Failed to execute analytics query' });
  }
});

// Simple error handling with payload size handling
router.use((error, req, res, next) => {
  console.error('API Error:', error);
  
  // Handle payload too large errors specifically
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Payload too large',
      message: 'The image or data is too large to process. Please try with a smaller image.',
      limit: error.limit ? `${Math.round(error.limit / 1024 / 1024)}MB` : '50MB',
      details: {
        expected: error.expected ? `${Math.round(error.expected / 1024 / 1024)}MB` : 'Unknown',
        received: error.length ? `${Math.round(error.length / 1024 / 1024)}MB` : 'Unknown'
      }
    });
  }
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

// ── Trash ─────────────────────────────────────────────────────────────────────

router.post('/chats/:conversationId/restore', addAuthenticatedClient, async (req, res) => {
  try {
    await chatService.restoreConversation(
      req.user.id, req.params.conversationId, req.workspaceId, req.db
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to restore conversation' });
  }
});

router.delete('/chats/:conversationId/permanent', addAuthenticatedClient, async (req, res) => {
  try {
    await chatService.permanentDeleteConversation(
      req.user.id, req.params.conversationId, req.workspaceId, req.db
    );
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

// ── Packs ─────────────────────────────────────────────────────────────────────

// Get all available packs (no auth required — static pack metadata)
router.get('/packs', getPacks);

// Launch a pack — creates folder + pre-seeded conversations
router.post('/packs/launch', addAuthenticatedClient, launchPack);


// 404 handler
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

export default router;
