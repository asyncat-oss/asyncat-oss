// chatRouter.js - Main chat routing logic
// Refactored from enhancedRouterV2.js for better organization

import OpenAIClient from '../openAIClient.js';
import { config } from "dotenv";
import dataLayer, { formatContext } from '../DataLayer.js';
import db from '../../../../db/client.js';

// Import refactored modules
import { generateSystemPrompt } from './systemPrompts.js';
import {
  validateInput,
  getWorkspaceContext,
} from './requestAnalysis.js';
import { artifactParser } from '../artifactParser.js';
import { TOOL_DEFINITIONS, buildToolsSystemSection } from '../toolDefinitions.js';
import { executeTool } from '../toolExecutor.js';
import { getStatus as getLlamaStatus } from '../llamaServerManager.js';
import {
  LLAMA_BASE_URL,
  normalizeBaseUrl,
  parseSettings,
  providerRequiresBuiltinServer,
  providerSupportsTools,
} from '../providerCatalog.js';

config();

// Global fallback: built-in llama server (no cloud provider by default)
const GLOBAL_AI_MODEL = process.env.AI_MODEL || 'local';
const GLOBAL_AI_BASE_URL = process.env.AI_BASE_URL || LLAMA_BASE_URL;
const GLOBAL_AI_API_KEY = process.env.AI_API_KEY || 'local';

function isLocalBaseUrl(baseUrl) {
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(baseUrl || '');
}

function isBuiltinLlamaBaseUrl(baseUrl) {
  const port = process.env.LLAMA_SERVER_PORT ?? '8765';
  return new RegExp(`^(https?:\\/\\/)?(127\\.0\\.0\\.1|localhost):${port}(\\/|$)`, 'i').test(baseUrl || '');
}

function assertLocalModelReady() {
  const status = getLlamaStatus();
  if (status.status !== 'ready') {
    throw new Error(
      `Local model is not ready yet (status: ${status.status}${status.model ? `, model: ${status.model}` : ''}).`
    );
  }
  return status;
}

// Global fallback AI Client (points to local llama server)
const aiClient = new OpenAIClient({
  endpoint: GLOBAL_AI_BASE_URL,
  apiKey: GLOBAL_AI_API_KEY,
  defaultModel: GLOBAL_AI_MODEL
});

/**
 * Get the AI client and model for a specific user.
 * Falls back to global .env config if user has no custom provider saved.
 */
export function getAiClientForUser(userId) {
  try {
    const row = db
      .prepare('SELECT profile_id, provider_type, provider_id, base_url, model, api_key, settings, supports_tools FROM ai_provider_config WHERE user_id = ?')
      .get(userId);

    if (!row) {
      console.log(`🤖 [chat] No provider config for user ${userId} — using global defaults (${GLOBAL_AI_BASE_URL}, model=${GLOBAL_AI_MODEL})`);
      const isLocal = isLocalBaseUrl(GLOBAL_AI_BASE_URL);
      const requiresLocalServer = isBuiltinLlamaBaseUrl(GLOBAL_AI_BASE_URL);
      const localStatus = requiresLocalServer ? assertLocalModelReady() : null;
      return {
        client: aiClient,
        model: localStatus?.model || GLOBAL_AI_MODEL,
        isLocal,
        requiresLocalServer,
        supportsNativeTools: !isLocal,
        providerInfo: null,
      };
    }

    const isLocal = row.provider_type === 'local';
    const requiresLocalServer = providerRequiresBuiltinServer(row);
    const baseUrl = normalizeBaseUrl(row.base_url, row.provider_id);
    const settings = parseSettings(row.settings);
    const supportsNativeTools = providerSupportsTools(row);
    const localStatus = requiresLocalServer ? assertLocalModelReady() : null;

    // Use 'local' as the API key for local providers (llama-server ignores auth)
    // Fixed: operator precedence bug — was `key || type === 'local' ? ... : global`
    const apiKey = isLocal ? (row.api_key || 'local') : (row.api_key || GLOBAL_AI_API_KEY);

    console.log(`🤖 [chat] User ${userId} → ${baseUrl} model=${row.model} local=${isLocal}`);

    const userClient = new OpenAIClient({
      endpoint: baseUrl,
      apiKey,
      defaultModel: localStatus?.model || row.model,
      providerId: row.provider_id,
      settings,
      defaultHeaders: row.provider_id === 'openrouter'
        ? {
            'HTTP-Referer': 'https://asyncat.local',
            'X-OpenRouter-Title': 'Asyncat',
          }
        : undefined,
    });

    return {
      client: userClient,
      model: localStatus?.model || row.model,
      isLocal,
      requiresLocalServer,
      supportsNativeTools,
      provider_type: row.provider_type,
      providerInfo: {
        type: row.provider_type,
        providerId: row.provider_id,
        baseUrl: row.base_url,
        model: row.model,
        profileId: row.profile_id,
        supportsNativeTools,
      },
    };
  } catch (err) {
    if (err.message?.startsWith('Local model is not ready')) throw err;
    console.warn('Failed to load user AI config, using global defaults:', err.message);
    return { client: aiClient, model: GLOBAL_AI_MODEL, isLocal: false, requiresLocalServer: false, supportsNativeTools: true, providerInfo: null };
  }
}

/**
 * Run an agentic loop with tool calling support.
 * Handles multiple rounds of tool calls until the model returns a final text response.
 * @param {OpenAIClient} clientInstance - the AI client to use
 * @param {string} modelName - the model name to use
 * @returns {{ responseText: string, toolCalls: Array }}
 */
async function runAgenticLoop(systemPrompt, openAIMessages, toolContext, maxTokens, maxIterations = 5, clientInstance = aiClient, modelName = GLOBAL_AI_MODEL) {
  const messages = [...openAIMessages];
  const allToolCalls = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await clientInstance.client.chat.completions.create({
      model: modelName,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      max_completion_tokens: maxTokens
    });

    const choice = response.choices[0];

    if (choice.finish_reason === 'tool_calls') {
      const toolCalls = choice.message.tool_calls;

      // Push the assistant's tool-call message into the thread
      messages.push(choice.message);

      // Execute each tool and collect results
      const toolResultMessages = [];
      for (const tc of toolCalls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch (_) {}

        console.log(`🔧 Tool call: ${tc.function.name}`, args);
        const result = await executeTool(tc.function.name, args, toolContext);
        console.log(`✅ Tool result [${tc.function.name}]:`, result);

        allToolCalls.push({ name: tc.function.name, args, result, id: tc.id });

        toolResultMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }

      messages.push(...toolResultMessages);
      // Loop back — model will now process results and respond
    } else {
      // Final text response
      return {
        responseText: choice.message?.content || '',
        toolCalls: allToolCalls
      };
    }
  }

  // Fallback if we hit max iterations
  return {
    responseText: 'I completed the requested actions. Is there anything else you need?',
    toolCalls: allToolCalls
  };
}

/**
 * Enhanced Chat Router - Main endpoint handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const enhancedRouter = async (req, res) => {
  try {
    const {
      message,
      conversationHistory = [],
      projectIds = [],
      userTimezone,
      userLocalDateTime,
      conversationId = null,
      uploadedFiles = null,
      fileContentsForAI = null
    } = req.body;

    // Auth check first so we have user.id for provider lookup
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Resolve per-user AI client + model (falls back to global .env if not configured)
    const { client: userAiClient, model: AI_MODEL, isLocal, supportsNativeTools, providerInfo } = getAiClientForUser(user.id);
    console.log(`🤖 Using model: ${AI_MODEL}${isLocal ? ' (local)' : ''}`);

    // Get authenticated Supabase client
    const authenticatedDb = req.db;

    // Extract actual message content
    let actualMessage = message;
    let filesToProcess = uploadedFiles;
    let fileContentForAI = fileContentsForAI;

    // Handle object-type messages
    if (typeof message === 'object' && message.content) {
      actualMessage = message.content;
      filesToProcess = message.uploadedFiles || uploadedFiles;
      fileContentForAI = message.fileContentsForAI || fileContentsForAI;
    }

    // Detect comprehensive requests for note-optimized formatting (keyword-based, no extra AI call)
    const noteKeywords = ['explain', 'how to', 'guide', 'tutorial', 'comprehensive', 'detailed', 'step by step', 'best practices', 'breakdown'];
    const noteOptimizedMode = noteKeywords.some(keyword => actualMessage.toLowerCase().includes(keyword));

    // Enhance message with file content if present
    let messageForAI = actualMessage;
    if (fileContentForAI) {
      // Estimate tokens
      const estimatedTokens = Math.ceil((actualMessage.length + fileContentForAI.length) / 4);

      if (estimatedTokens > 100000) { // 100k tokens max
        return res.status(400).json({
          success: false,
          message: 'The uploaded files are too large for processing. Please upload smaller files or fewer files.',
          error: 'File content exceeds token limit',
          estimatedTokens,
          maxTokens: 100000
        });
      }

      messageForAI = actualMessage + fileContentForAI;
      console.log('📎 Enhanced message for AI (first 200 chars):', messageForAI.substring(0, 200) + '...');
      console.log('📊 Token estimate:', estimatedTokens, 'tokens');
    }

    const workspaceId = getWorkspaceContext(req);

    // Validate input
    const validation = validateInput(actualMessage);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Get user context and data
    const hasSelectedProjects = projectIds && projectIds.length > 0;
    const contextData = await dataLayer.getUserContext(user.id, projectIds, workspaceId, authenticatedDb);
    const contextPrompt = formatContext(contextData);

    const timezone = userTimezone || 'UTC';
    const userLocalTime = userLocalDateTime || new Date().toISOString();

    // Build workspace and project context
    const workspaceContext = `**WORKSPACE:** ${contextData.workspaceName || 'Current Workspace'}`;
    const projectContext = hasSelectedProjects
      ? `**SELECTED PROJECTS:** ${projectIds.join(', ')} (User has filtered to specific projects)`
      : `**PROJECT SCOPE:** All projects in workspace`;

    // Generate response
    let responseText = '';
    let animationBlocks = null;
    let chartBlocks = null;

    // Check if user is editing an existing artifact
    const editCheck = artifactParser.isArtifactEditRequest(actualMessage, conversationHistory);
    const isArtifactEdit = editCheck.isEdit;
    const existingArtifacts = editCheck.lastArtifacts;
    
    // Check if user is requesting multiple artifacts
    const multipleCheck = artifactParser.shouldGenerateMultipleArtifacts(actualMessage);
    const shouldGenerateMultiple = multipleCheck.shouldGenerate;
    const artifactCount = multipleCheck.count;

    // Check if we should generate artifacts for this request
    // We keep the strict check for auto-wrapping and token limits, but we enable artifacts generally
    const strictArtifactCheck = artifactParser.shouldGenerateArtifact(actualMessage);
    const artifactType = artifactParser.determineArtifactType(actualMessage);

    // Generate system prompt - Smart artifact decision
    const baseSystemPrompt = generateSystemPrompt({
      workspaceContext,
      projectContext,
      userTimezone: timezone,
      userLocalDateTime: userLocalTime,
      contextData: contextPrompt,
      enableArtifacts: true,
      forceArtifact: isArtifactEdit,
      artifactType: artifactType,
      existingArtifacts: existingArtifacts,
      isArtifactEdit: isArtifactEdit,
      multipleArtifacts: shouldGenerateMultiple,
      artifactCount: artifactCount
    });

    // Append tool awareness section with project IDs
    const toolsSection = supportsNativeTools ? buildToolsSystemSection(contextData) : '';
    const systemPrompt = baseSystemPrompt + toolsSection;

    // Determine token limits - Smart allocation based on request type
    let maxTokens = 4000;
    if (noteOptimizedMode) {
      maxTokens = 8000;
    } else if (shouldGenerateMultiple) {
      maxTokens = 10000;
    } else if (strictArtifactCheck) {
      maxTokens = 6000;
    } else if (isArtifactEdit) {
      maxTokens = 5000;
    }

    // Build OpenAI-format messages for the agentic loop
    const openAIMessages = [
      ...conversationHistory.slice(-6).map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: "user", content: messageForAI }
    ];

    const toolContext = {
      userId: user.id,
      db: authenticatedDb,
      workspaceId
    };

    // Run agentic loop only for providers that support native OpenAI-format tools.
    const { responseText: agenticResponse, toolCalls: executedToolCalls } = supportsNativeTools
      ? await runAgenticLoop(
          systemPrompt,
          openAIMessages,
          toolContext,
          maxTokens,
          5,
          userAiClient,
          AI_MODEL
        )
      : {
          responseText: (await userAiClient.messages.create({
            model: AI_MODEL,
            max_completion_tokens: maxTokens,
            system: systemPrompt,
            messages: openAIMessages,
          })).content?.[0]?.text || '',
          toolCalls: [],
        };

    responseText = agenticResponse || "I understand your request. How can I help you further?";

    // Note: Animation/chart parsing removed - now handled by dedicated visual mode router

    // Heuristic: If response is long and has headers, it might be a document that should be an artifact
    // This catches cases where user used a typo (e.g. "wassy") or AI decided to write a long essay without tags
    const isLongStructuredResponse = responseText.length > 800 && (responseText.match(/^#+\s/m) || []).length >= 2;
    const shouldAutoWrap = strictArtifactCheck || isLongStructuredResponse;

    // Parse response for artifacts (only auto-wrap if we strictly expected artifacts or detected structure)
    const artifactParseResult = artifactParser.parseResponse(responseText, shouldAutoWrap);
    const artifacts = artifactParseResult.artifacts;
    const artifactExplanation = artifactParseResult.artifactExplanation;

    // If artifacts were found, use the cleaned content without artifact tags
    if (artifacts && artifacts.length > 0) {
      responseText = artifactParseResult.content || artifactExplanation || 'Here is your response:';
    }

    // Calculate token usage
    const systemPromptTokens = Math.ceil(systemPrompt.length / 4);
    const conversationMessages = conversationHistory.slice(-6);
    const conversationTokens = conversationMessages.reduce((total, msg) => {
      return total + Math.ceil((msg.content || '').length / 4) + 15;
    }, 0);
    const currentMessageTokens = Math.ceil(messageForAI.length / 4) + 15;
    const totalContextTokens = systemPromptTokens + conversationTokens + currentMessageTokens;

    // Build conversation history
    const userMessageForHistory = {
      role: "user",
      content: actualMessage
    };

    // Add file attachments to history if present
    if (filesToProcess && filesToProcess.length > 0) {
      userMessageForHistory.uploadedFiles = filesToProcess.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
        id: file.id
      }));
    }

    const newHistory = [
      ...conversationHistory.slice(-8),
      userMessageForHistory,
      { 
        role: "assistant", 
        content: responseText,
        artifacts: artifacts, // Store artifacts in history for editing
        artifactExplanation: artifactExplanation
      }
    ];

    return res.json({
      success: true,
      message: responseText,
      content: responseText, // Alias for consistency
      conversationHistory: newHistory,
      projectIds: projectIds,
      hasProjectFilter: hasSelectedProjects,
      workspaceId: contextData.workspaceId,
      workspaceName: contextData.workspaceName || 'Current Workspace',
      suggestions: [],
      blocks: null, // Visual blocks now handled by dedicated visual mode
      artifacts: artifacts, // NEW: Artifacts from AI response
      artifactExplanation: artifactExplanation, // NEW: Explanation for artifacts
      toolCalls: executedToolCalls || [], // NEW: Tool calls made during this request
      tokenUsage: {
        contextTokens: totalContextTokens,
        actualUsage: null
      }
    });

  } catch (error) {
    console.error('Router error:', error);

    return res.status(500).json({
      success: false,
      message: 'Meow! Something went wrong on my end. Let me try to help you again in a moment.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export default enhancedRouter;
