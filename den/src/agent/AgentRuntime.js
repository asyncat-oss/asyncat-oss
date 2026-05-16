// den/src/agent/AgentRuntime.js
// ─── Agent Runtime — ReAct Orchestration Loop ────────────────────────────────
// The core agent engine. Implements a ReAct (Reason + Act) loop:
//   1. Send goal + context to LLM
//   2. Parse response for Thought + Action (tool call)
//   3. Check permissions, execute tool
//   4. Feed result back to LLM
//   5. Repeat until Answer or max rounds
//
// Works with ANY model via ToolCallFormatter (handles native API tool calls,
// XML tags, JSON blocks, and other model-specific formats).

import { ToolCallFormatter } from './ToolCallFormatter.js';
import { toolRegistry } from './tools/toolRegistry.js';
import { permissionManager, PermissionManager } from './PermissionManager.js';
import { AgentSession } from './AgentSession.js';
import { buildAgentSystemPrompt, loadSoul } from './prompts/agentSystemPrompt.js';
import { basalGanglia } from './BasalGanglia.js';
import { Compactor } from './Compactor.js';
import { normalizeTags, selectRelevantSkillsWithLlm } from './skills.js';
import { listMemories, searchMemories } from './tools/memoryTools.js';
import { isGitDangerousAction, isGitReadOnlyAction } from './gitService.js';
import { getModelCapabilities, normalizeReasoningEffort } from '../ai/controllers/ai/modelCapabilities.js';
import { cleanReasoningAnswer, combineReasoningParts, extractReasoningFromText, reasoningTextFromDelta } from './reasoningParser.js';
import { resolveContextWindow } from '../ai/controllers/ai/modelContextResolver.js';
import db from '../db/client.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const MAX_ROUNDS_DEFAULT = 25;
const CHECKPOINTS = new Map();
const SNAPSHOT_SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'data', 'logs']);
const MUTATING_FILE_TOOLS = new Set([
  'write_file', 'create_file', 'edit_file', 'create_directory',
  'file_delete', 'delete_file', 'file_copy', 'copy_file', 'file_move', 'move_file',
]);
const MUTATING_SHELL_TOOLS = new Set(['run_command', 'run_python', 'run_node']);
const ACTION_GOAL_RE = /\b(create|add|update|edit|delete|remove|move|rename|write|save|schedule|run|execute|install|open|read|inspect|check|search|find|browse|fix|change|modify|look at|review)\b/i;
const MULTI_STEP_GOAL_RE = /\b(and then|after that|also|then|next|finally|step[\s-]?\d|multiple|several|both|all of)\b/i;
const AUTO_PLAN_IDS = new Set(['auto_plan_inspect', 'auto_plan_understand', 'auto_plan_apply', 'auto_plan_verify']);
const RETRYABLE_TOOLS = new Set(['run_command', 'run_python', 'run_node', 'browse_website', 'web_search']);
const PLAN_DYNAMIC_SAFE_TOOLS = new Set(['run_command', 'package_manager']);
const PLAN_BLOCKED_SAFE_TOOLS = new Set([
  'save_memory',
  'forget_memory',
  'notify',
  'clipboard_write',
  'speak_text',
  'create_artifact',
  'create_markdown',
  'create_diagram',
  'create_csv',
  'create_html_page',
]);

function applyReasoningEffort(params, effort, providerInfo, model) {
  const providerId = providerInfo?.providerId || providerInfo?.provider_id || '';
  const capabilities = getModelCapabilities(providerId, model);
  const normalized = normalizeReasoningEffort(effort, capabilities);
  
  if (!normalized) return params; // either not supported, no effort provided, or native_tags
  
  if (providerId === 'openrouter') return { ...params, reasoning: { effort: normalized } };
  return { ...params, reasoning_effort: normalized };
}

/**
 * Normalize tool call signature for loop detection.
 * Trims strings, sorts object keys, canonicalizes paths.
 */
function normalizeToolSig(toolName, args) {
  const normalized = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (typeof v === 'string') {
      normalized[k] = v.trim().replace(/\/+$/, '');
    } else {
      normalized[k] = v;
    }
  }
  const sortedKeys = Object.keys(normalized).sort();
  const sorted = {};
  for (const k of sortedKeys) sorted[k] = normalized[k];
  return `${toolName}:${JSON.stringify(sorted)}`;
}

function stringifyToolArguments(value) {
  if (!value) return '{}';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '{}';
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // Attempt JSON repair: trailing commas, single quotes, unquoted keys
      try {
        const repaired = trimmed
          .replace(/,\s*([\]}])/g, '$1')           // trailing commas
          .replace(/'/g, '"')                       // single → double quotes
          .replace(/(\w+)\s*:/g, '"$1":');          // unquoted keys
        JSON.parse(repaired);
        return repaired;
      } catch {
        return '{}';
      }
    }
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '{}';
    }
  }
  return '{}';
}

function normalizeNativeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return null;
  const normalized = toolCalls
    .map(tc => {
      const name = tc?.function?.name || tc?.name || '';
      if (!name) return null;
      return {
        id: tc.id || `tc_${Math.random().toString(16).slice(2, 10)}`,
        type: tc.type || 'function',
        function: {
          name,
          arguments: stringifyToolArguments(tc.function?.arguments ?? tc.arguments),
        },
      };
    })
    .filter(Boolean);
  return normalized.length ? normalized : null;
}

function isAutoPlan(plan) {
  return Array.isArray(plan) && plan.length > 0 && plan.every(item => AUTO_PLAN_IDS.has(item.id));
}

/**
 * @typedef {Object} AgentEvent
 * @property {string} type - 'thinking' | 'tool_start' | 'tool_result' | 'answer' | 'error' | 'permission_request' | 'delta'
 * @property {*} data
 */

export class AgentRuntime {
  /**
   * @param {object} opts
   * @param {object} opts.aiClient - OpenAIClient instance
   * @param {string} opts.model - Model name
   * @param {boolean} opts.isLocal - Whether using a local model
   * @param {boolean} opts.supportsNativeTools - Whether provider accepts OpenAI tool definitions
   * @param {string} opts.userId
   * @param {string} opts.workspaceId
   * @param {string} opts.workingDir - Working directory for file/shell tools
   * @param {number} [opts.maxRounds] - Max ReAct iterations
   * @param {(event: AgentEvent) => void} [opts.onEvent] - Event callback for streaming
   * @param {string} [opts.continueSessionId] - Existing session ID to continue
   */
  constructor(opts) {
    this.aiClient = opts.aiClient;
    this.model = opts.model;
    this.isLocal = opts.isLocal || false;
    this.supportsNativeTools = opts.supportsNativeTools ?? !this.isLocal;
    this.userId = opts.userId;
    this.workspaceId = opts.workspaceId;
    this.workingDir = opts.workingDir || process.cwd();
    this.maxRounds = opts.maxRounds || MAX_ROUNDS_DEFAULT;
    this.onEvent = opts.onEvent || (() => {});
    this.autoApprove = opts.autoApprove === true || opts.autoApprove === 'all';
    this.requestPermission = opts.requestPermission || null;
    this.askUser = opts.askUser || null;
    this.sessionApprovedTools = new Set();
    this.session = null;
    this.continueSessionId = opts.continueSessionId || null;
    this.soulOverride = opts.soul || null;
    this.providerInfo = opts.providerInfo || null;
    this.reasoningEffort = opts.reasoningEffort || 'auto';
    this.mentionedAgents = Array.isArray(opts.mentionedAgents) ? opts.mentionedAgents : [];
    this.agentMode = opts.agentMode === 'plan' ? 'plan' : 'action';
    this.abortSignal = opts.abortSignal || null;
    this.capabilitiesSection = opts.capabilitiesSection || '';
    this.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    // Wire BasalGanglia events (skill auto-discovery) to the runtime event stream
    basalGanglia.onEvent = (event) => this.onEvent(event);

    // ── Compaction budget ──────────────────────────────────────────────────
    // Use the model's real context window from the existing resolver system.
    // Priority: user settings > model metadata > model registry > provider preset > fallback
    const resolvedCtx = this._resolveContextWindow();
    const modelContextWindow = resolvedCtx.contextWindow;
    const defaultBudget = this.isLocal
      ? Math.min(modelContextWindow * 0.75, opts.tokenBudget ?? 6000)  // local: 75% or user-set
      : Math.floor(modelContextWindow * 0.5);  // cloud: 50% of context

    this.modelContextWindow = modelContextWindow; // expose for usage events
    this.contextWindowSource = resolvedCtx.source;
    this.contextWindowConfidence = resolvedCtx.confidence;

    this.compactor = opts.compactor || new Compactor({
      tokenBudget: opts.tokenBudget ?? defaultBudget,
      keepLastMessages: opts.keepLastMessages ?? (this.isLocal ? 6 : 10),
    });
  }

  /**
   * Run the agent to completion on a given goal.
   *
   * @param {string} goal - The user's request/goal
   * @param {object[]} [conversationHistory] - Previous conversation messages
   * @returns {Promise<{answer: string, session: AgentSession, toolCalls: Array}>}
   */
  async run(goal, conversationHistory = []) {
    let conversationRoundStart = 0;
    let conversationToolStart = 0;
    const reasoningEvents = [];

    this._throwIfAborted();

    // Load or create session
    if (this.continueSessionId) {
      this.session = AgentSession.load(this.continueSessionId);
      if (this.session && this.session.userId === this.userId) {
        // Reuse existing session — update goal and reset to active
        this.session.goal = goal;
        this.session.workingDir = this.workingDir;
        this.session.status = 'active';
        this.session.updatedAt = new Date().toISOString();
        // Track conversation rounds for UI reconstruction after refresh
        const rounds = this.session.scratchpad.conversationRounds || [];
        this.session.setScratchpad('conversationRounds', rounds);
        this.session.save();
      } else {
        // Session not found or access denied — create new
        this.continueSessionId = null;
        this.session = new AgentSession({
          userId: this.userId,
          workspaceId: this.workspaceId,
          goal,
          workingDir: this.workingDir,
        });
        this.session.save();
      }
    } else {
      // Create new session
      this.session = new AgentSession({
        userId: this.userId,
        workspaceId: this.workspaceId,
        goal,
        workingDir: this.workingDir,
      });
      this.session.save();
    }

    conversationRoundStart = this.session.totalRounds || 0;
    conversationToolStart = this.session.toolHistory?.length || 0;
    this.session.setScratchpad('providerInfo', {
      ...(this.providerInfo || {}),
      model: this.model,
      isLocal: this.isLocal,
      supportsNativeTools: this.supportsNativeTools,
      agentMode: this.agentMode,
    });
    this.session.save();

    this.onEvent({
      type: 'session_start',
      data: {
        sessionId: this.session.id,
        goal,
        status: this.session.status,
        workingDir: this.workingDir,
        continued: Boolean(this.continueSessionId),
        agentMode: this.agentMode,
      },
    });

    // Load relevant memories
    const memories = this._loadMemories(goal);

    // Build system prompt
    const toolDefs = this._toolDefinitionsForMode();
    const toolDescriptions = ToolCallFormatter.formatToolsForPrompt(
      toolDefs.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
    );

    // Let the model choose which skills are worth injecting for this run.
    const skillSelection = await selectRelevantSkillsWithLlm({
      aiClient: this.aiClient,
      model: this.model,
      goal,
      conversationHistory,
      workingDir: this.workingDir,
      limit: 5,
    });
    const relevantSkills = skillSelection.skills || [];

    if (relevantSkills.length > 0) {
      this.onEvent({
        type: 'skills_loaded',
        data: {
          method: skillSelection.method || 'unknown',
          reason: skillSelection.reason || '',
          skills: relevantSkills.map(s => ({
            name: s.name,
            description: s.description || '',
            tags: normalizeTags(s.tags),
            source: s.source || 'bundled',
          })),
        },
      });
    }

    // Load soul for this run (profile override takes priority)
    const soul = this.soulOverride ?? loadSoul('default');

    const systemPrompt = buildAgentSystemPrompt({
      goal,
      workingDir: this.workingDir,
      toolDescriptions,
      memories,
      scratchpad: '',
      skills: relevantSkills,
      mentionedAgents: this.mentionedAgents,
      soul,
      agentMode: this.agentMode,
      capabilitiesSection: this.capabilitiesSection,
    });

    // Auto-detect and store corrections from user's latest message in continued conversations
    if (conversationHistory.length > 0) {
      this._extractCorrections(goal, conversationHistory);
    }

    // Build conversation thread (filter out UI system messages)
    const validHistory = conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant');
    const historyPrefix = validHistory.slice(-8).map(m => ({ role: m.role, content: m.content }));
    const messages = [
      ...historyPrefix,
      { role: 'user', content: goal },
    ];
    const goalIndex = historyPrefix.length; // position of the original goal user message

    const toolContext = {
      userId: this.userId,
      workspaceId: this.workspaceId,
      workingDir: this.workingDir,
      session: this.session,
      emitEvent: (event) => this.onEvent(event),
      requestPermission: this.requestPermission
        ? (request) => this.requestPermission(request)
        : null,
      askUser: this.askUser
        ? (request) => this.askUser({ ...request, round: this.session?.totalRounds || 0 })
        : null,
    };

    const knownTools = toolDefs.map(t => t.name);
    this._ensureAutoPlan(goal, 0);

    // ── ReAct Loop ──────────────────────────────────────────────────────────
    let answer = null;
    let stopReason = 'answer'; // 'answer' | 'max_rounds' | 'tool_failure' | 'loop_detected' | 'reflection_abort' | 'cancelled'
    let formatRepairAttempts = 0;
    const argumentRepairAttempts = new Map();
    // Smart loop detection: sliding window of recent tool signatures
    const recentToolSigs = []; // sliding window of last 8 normalized sigs
    const LOOP_WINDOW_SIZE = 8;
    const MAX_CONSECUTIVE_DUPS = 3;
    const MAX_CYCLE_REPEATS = 2;
    // Consecutive failure escalation
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;
    const FAILURE_STRATEGY_THRESHOLD = 3;
    // Plan-driven continuation: limits how many times we nudge the agent
    let planContinuationNudges = 0;
    const MAX_PLAN_NUDGES = 3;

    for (let round = 0; round < this.maxRounds; round++) {
      this._throwIfAborted();
      this.session.nextRound();

      // Compact before the LLM call if we're over budget.
      if (this.compactor.needsCompaction(messages)) {
        const result = this.compactor.compact(messages, this.session, { goalIndex });
        if (result.compacted) {
          messages.length = 0;
          messages.push(...result.messages);
          this.onEvent({
            type: 'compaction',
            data: {
              droppedMessages: result.droppedCount,
              tokensBefore: result.tokensBefore,
              tokensAfter: result.tokensAfter,
              round,
            },
          });
        }
      }

      // Call the LLM (with retry + exponential backoff)
      let responseText = '';
      let apiToolCalls = null;
      let streamedReasoning = '';
      const LLM_MAX_RETRIES = 3;
      const LLM_BASE_DELAY_MS = 1000;

      let llmSuccess = false;
      for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
        try {
          this._throwIfAborted();
          const promptTokens = this._estimateTokens(systemPrompt) + this._estimateTokens(JSON.stringify(messages));
          const llmCallStart = Date.now();
          const result = await this._callLLM(systemPrompt, messages, {
            forceToolName: this._shouldPrimePlan(goal, round) ? 'todo_write' : null,
          });
          const llmCallDurationMs = Date.now() - llmCallStart;
          responseText = result.text;
          apiToolCalls = result.toolCalls;
          streamedReasoning = result.reasoning || '';
          const hasRealUsage = Boolean(result.usage?.prompt_tokens || result.usage?.completion_tokens);
          const inputTokens = result.usage?.prompt_tokens || promptTokens;
          const outputTokens = result.usage?.completion_tokens || this._estimateTokens(responseText);
          this.usage.inputTokens += inputTokens;
          this.usage.outputTokens += outputTokens;
          this.usage.totalTokens = this.usage.inputTokens + this.usage.outputTokens;
          // Token generation speed (tokens/sec)
          const tokensPerSecond = llmCallDurationMs > 0 ? Math.round((outputTokens / llmCallDurationMs) * 1000) : null;
          this.onEvent({
            type: 'usage_update',
            data: {
              ...this.usage,
              round,
              model: this.model,
              isLocal: this.isLocal,
              estimated: !hasRealUsage,
              tokensPerSecond,
              contextWindow: this.modelContextWindow,
              contextWindowSource: this.contextWindowSource,
              contextWindowConfidence: this.contextWindowConfidence,
            },
          });
          llmSuccess = true;
          break;
        } catch (err) {
          if (this._isAbortError(err)) {
            this.session.fail('Agent run stopped by user.');
            throw err;
          }
          const isRetryable = this._isRetryableError(err);
          if (!isRetryable || attempt >= LLM_MAX_RETRIES) {
            this.onEvent({ type: 'error', data: { message: `LLM call failed: ${err.message}`, round } });
            this.session.fail(err.message);
            this._trackFailure(goal, err.message);
            return { answer: `Error: ${err.message}`, session: this.session, toolCalls: this.session.toolHistory };
          }
          // Exponential backoff before retry
          const delay = LLM_BASE_DELAY_MS * Math.pow(2, attempt);
          this.onEvent({ type: 'thinking', data: { thought: `LLM call failed (${err.message}), retrying in ${delay / 1000}s… (attempt ${attempt + 1}/${LLM_MAX_RETRIES})`, round } });
          await new Promise(r => setTimeout(r, delay));
        }
      }
      if (!llmSuccess) continue; // shouldn't reach here, but safety net

      this._throwIfAborted();

      // Add assistant response to thread. Native tool-calling providers expect
      // the assistant tool_call message followed by role=tool result messages.
      const nativeToolCallsForThread = normalizeNativeToolCalls(apiToolCalls);
      if (nativeToolCallsForThread) {
        messages.push({
          role: 'assistant',
          content: responseText || null,
          tool_calls: nativeToolCallsForThread,
        });
      } else {
        messages.push({ role: 'assistant', content: responseText });
      }

      // Parse for tool calls (handles all model formats)
      const toolCalls = ToolCallFormatter.parseToolCalls(responseText, apiToolCalls, knownTools);

      // Extract thinking/answer from text
      const { thinking, finalAnswer } = this._parseResponse(responseText, streamedReasoning);

      if (thinking) {
        reasoningEvents.push({ thought: thinking, round, timestamp: new Date().toISOString() });
        this.onEvent({ type: 'thinking', data: { thought: thinking, round } });
      }

      // If model returned a final answer (no tool calls)
      if (finalAnswer && toolCalls.length === 0) {
        // Plan-driven continuation: if the agent's own plan has uncompleted items,
        // nudge it to keep working instead of stopping early.
        if (!this.session.isPlanComplete() && planContinuationNudges < MAX_PLAN_NUDGES) {
          planContinuationNudges++;
          const remaining = this.session.plan.filter(i => i.status !== 'completed');
          const progress = this.session.getPlanProgress();
          messages.push({
            role: 'user',
            content: [
              `You provided an answer, but your plan still has ${remaining.length} uncompleted item(s) (${progress.percentage}% done):`,
              ...remaining.map(i => `- [ ] ${i.content}`),
              '',
              'Please continue working on the remaining items. Update each item to in_progress/completed using todo_write as you go.',
              'When ALL items are completed, provide your final Answer.',
            ].join('\n'),
          });
          this.onEvent({
            type: 'thinking',
            data: {
              thought: `Plan has ${remaining.length} uncompleted items (${progress.percentage}% done). Nudging agent to continue (${planContinuationNudges}/${MAX_PLAN_NUDGES}).`,
              round,
            },
          });
          continue; // don't break, keep looping
        }
        answer = finalAnswer;
        this._completeAutoPlan(round);
        this.onEvent({ type: 'answer', data: { answer, round } });
        this._trackWorkflow(goal);
        break;
      }

      // If no tool calls and no explicit answer, treat entire response as answer
      if (toolCalls.length === 0) {
        if (this._looksLikeUnfinishedAction(responseText) && formatRepairAttempts < 2) {
          formatRepairAttempts++;
          messages.push({
            role: 'user',
            content: [
              'You said you need to use a tool, but you did not emit a valid tool call.',
              'Reply with exactly one machine-readable tool call block and no extra prose.',
              '',
              '<tool_call>',
              '{"name": "create_directory", "arguments": {"path": "folder-name"}}',
              '</tool_call>',
            ].join('\n'),
          });
          this.onEvent({
            type: 'thinking',
            data: { thought: 'The model did not output a valid tool call. Asking for the required tool_call format.', round },
          });
          reasoningEvents.push({
            thought: 'The model did not output a valid tool call. Asking for the required tool_call format.',
            round,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        if (!answer) {
          answer = cleanReasoningAnswer(finalAnswer || responseText);
          if (!answer) answer = responseText; // fallback if stripping removes everything
        }
        // Same plan-driven continuation check for implicit answers
        if (!this.session.isPlanComplete() && planContinuationNudges < MAX_PLAN_NUDGES) {
          planContinuationNudges++;
          const remaining = this.session.plan.filter(i => i.status !== 'completed');
          messages.push({
            role: 'user',
            content: `Your plan still has uncompleted items. Continue working:\n${remaining.map(i => `- [ ] ${i.content}`).join('\n')}`,
          });
          answer = null; // reset so we don't break
          continue;
        }
        this._completeAutoPlan(round);
        this.onEvent({ type: 'answer', data: { answer, round } });
        break;
      }

      // Permission checks — always sequential (may need interactive prompts)
      const permitted = [];
      let repairRequested = false;
      for (const tc of toolCalls) {
        if (!toolRegistry.has(tc.tool_name) || !knownTools.includes(tc.tool_name)) {
          const unknownResult = {
            success: false,
            error: this.agentMode === 'plan' && toolRegistry.has(tc.tool_name)
              ? `Tool "${tc.tool_name}" is not available in Plan mode.`
              : `Unknown tool: "${tc.tool_name}"`,
          };
          this.onEvent({
            type: 'tool_start',
            data: {
              tool: tc.tool_name,
              args: tc.arguments,
              permission: 'none',
              permissionDecision: 'not_applicable',
              permissionReason: this.agentMode === 'plan' && toolRegistry.has(tc.tool_name)
                ? 'Unavailable in Plan mode'
                : 'Unknown tool; not sent for approval',
              workingDir: this.workingDir,
              description: this.agentMode === 'plan' && toolRegistry.has(tc.tool_name)
                ? `Unavailable in Plan mode: ${tc.tool_name}`
                : `Unknown tool: ${tc.tool_name}`,
              round,
            }
          });
          this.session.recordToolCall(tc.tool_name, tc.arguments, unknownResult, {
            permissionLevel: 'none',
            permissionDecision: 'not_applicable',
            permissionReason: this.agentMode === 'plan' && toolRegistry.has(tc.tool_name)
              ? 'Unavailable in Plan mode'
              : 'Unknown tool; not sent for approval',
            workingDir: this.workingDir,
            startedAt: new Date().toISOString(),
          });
          this.onEvent({ type: 'tool_result', data: { tool: tc.tool_name, result: unknownResult, round } });
          messages.push(this._toolResultMessage(tc, unknownResult, Boolean(nativeToolCallsForThread)));
          continue;
        }

        // Auto-repair common argument aliases before validation
        // (e.g. model sends {file: 'x.js'} instead of {path: 'x.js'} for read_file)
        const toolDef = toolRegistry.get(tc.tool_name);
        if (toolDef?.parameters) {
          tc.arguments = ToolCallFormatter.repairArguments(tc.tool_name, tc.arguments, toolDef.parameters);
        }

        const validation = toolRegistry.validateArgs(tc.tool_name, tc.arguments);
        if (!validation.valid) {
          const invalidResult = {
            success: false,
            code: 'invalid_tool_arguments',
            error: validation.error,
            missing: validation.missing,
            invalid: validation.invalid,
          };
          const repairPrompt = this._formatArgumentRepairPrompt(tc, validation);
          this.onEvent({
            type: 'tool_start',
            data: {
              tool: tc.tool_name,
              args: tc.arguments,
              permission: 'none',
              permissionDecision: 'not_applicable',
              permissionReason: 'Invalid arguments; not executed',
              workingDir: this.workingDir,
              description: `Invalid arguments for ${tc.tool_name}`,
              repairPrompt,
              round,
            }
          });
          this.session.recordToolCall(tc.tool_name, tc.arguments, invalidResult, {
            permissionLevel: 'none',
            permissionDecision: 'not_executed',
            permissionReason: 'Invalid arguments; not executed',
            workingDir: this.workingDir,
            startedAt: new Date().toISOString(),
          });
          this.onEvent({ type: 'tool_result', data: { tool: tc.tool_name, result: invalidResult, round } });
          messages.push(this._toolResultMessage(tc, invalidResult, Boolean(nativeToolCallsForThread)));

          const repairKey = `${tc.tool_name}:${JSON.stringify(validation.missing)}:${JSON.stringify(validation.invalid)}`;
          const repairs = argumentRepairAttempts.get(repairKey) || 0;
          if (repairs < 3) {
            argumentRepairAttempts.set(repairKey, repairs + 1);
            messages.push({ role: 'user', content: repairPrompt });
            const thought = `The ${tc.tool_name} tool call had invalid arguments. Asking the model to emit corrected arguments (attempt ${repairs + 1}/3).`;
            reasoningEvents.push({ thought, round, timestamp: new Date().toISOString() });
            this.onEvent({ type: 'thinking', data: { thought, round } });
            repairRequested = true;
            break;
          }

          answer = `I could not continue because \`${tc.tool_name}\` was called with invalid arguments more than once. ${validation.error}`;
          this.onEvent({ type: 'answer', data: { answer, round } });
          break;
        }

        const permission = this._effectivePermission(tc.tool_name, tc.arguments, toolRegistry.getPermission(tc.tool_name));
        const actionDesc = PermissionManager.describeAction(tc.tool_name, tc.arguments);
        const permissionStartedAt = new Date().toISOString();
        const permResult = await this._checkPermission({
          toolCall: tc,
          permission,
          actionDesc,
          round,
        });
        this._throwIfAborted();

        if (!permResult.allowed) {
          const deniedResult = { success: false, error: `Permission denied: ${permResult.reason}` };
          this.onEvent({
            type: 'tool_start',
            data: {
              tool: tc.tool_name,
              args: tc.arguments,
              permission,
              permissionDecision: permResult.decision || 'denied',
              permissionReason: permResult.reason || 'Denied',
              workingDir: this.workingDir,
              description: actionDesc,
              round,
            }
          });
          this.session.recordToolCall(tc.tool_name, tc.arguments, deniedResult, {
            permissionLevel: permission,
            permissionDecision: permResult.decision || 'denied',
            permissionReason: permResult.reason || 'Denied',
            workingDir: this.workingDir,
            startedAt: permissionStartedAt,
          });
          this.onEvent({ type: 'tool_result', data: { tool: tc.tool_name, result: deniedResult, round } });
          messages.push(this._toolResultMessage(
            tc,
            this._compactToolResultForContext(tc.tool_name, deniedResult),
            Boolean(nativeToolCallsForThread),
          ));
        } else {
          let checkpoint = null;
          if (this._isMutatingTool(tc.tool_name, tc.arguments)) {
            checkpoint = this._ensureBaselineCheckpoint({ round, toolName: tc.tool_name });
          }
          this.onEvent({
            type: 'tool_start',
            data: {
              tool: tc.tool_name,
              args: tc.arguments,
              permission,
              permissionDecision: permResult.decision || 'allowed',
              permissionReason: permResult.reason || null,
              checkpointId: checkpoint?.id || null,
              workingDir: this.workingDir,
              description: actionDesc,
              round,
            }
          });
          permitted.push({
            toolCall: tc,
            permission,
            permissionDecision: permResult.decision || 'allowed',
            permissionReason: permResult.reason || null,
            startedAt: new Date().toISOString(),
          });
        }
      }

      if (repairRequested) continue;
      if (answer) break;

      // Execute permitted tools in parallel — safe tools gain the most from this
      if (permitted.length > 0) {
        this._throwIfAborted();
        const execResults = await Promise.all(
          permitted.map(({ toolCall }) =>
            toolRegistry.execute(toolCall.tool_name, toolCall.arguments, toolContext)
              .catch(err => ({ success: false, error: err.message || String(err) }))
          )
        );
        this._throwIfAborted();
        for (let i = 0; i < permitted.length; i++) {
          const item = permitted[i];
          const tc = item.toolCall;
          const result = execResults[i];
          this.session.recordToolCall(tc.tool_name, tc.arguments, result, {
            permissionLevel: item.permission,
            permissionDecision: item.permissionDecision,
            permissionReason: item.permissionReason,
            workingDir: this.workingDir,
            startedAt: item.startedAt,
          });
          this.onEvent({ type: 'tool_result', data: { tool: tc.tool_name, result, round } });
          messages.push(this._toolResultMessage(
            tc,
            this._compactToolResultForContext(tc.tool_name, result),
            Boolean(nativeToolCallsForThread),
          ));

          // ── Consecutive failure tracking ────────────────────────────────
          if (result?.success === false || result?.error) {
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              const failThought = `${consecutiveFailures} consecutive tool failures — stopping to prevent runaway.`;
              reasoningEvents.push({ thought: failThought, round, timestamp: new Date().toISOString() });
              this.onEvent({ type: 'thinking', data: { thought: failThought, round } });
              const completedItems = (this.session.plan || []).filter(i => i.status === 'completed');
              answer = `I stopped after ${consecutiveFailures} consecutive tool failures. Here's what I accomplished:\n\n` +
                (completedItems.length > 0
                  ? completedItems.map(i => `✓ ${i.content}`).join('\n')
                  : this.session.toolHistory.slice(-5).map(t => `- ${t.tool}: ${t.result?.error || (t.result?.success ? 'success' : 'failed')}`).join('\n'));
              stopReason = 'tool_failure';
              this.onEvent({ type: 'answer', data: { answer, round } });
              break;
            }
            if (consecutiveFailures >= FAILURE_STRATEGY_THRESHOLD) {
              messages.push({
                role: 'user',
                content: 'You have had several consecutive tool failures. Step back, reconsider your approach, and try a completely different strategy. Do not repeat the same failing calls.',
              });
            }
          } else {
            consecutiveFailures = 0; // reset on success
          }

          // ── Plan progress emission ──────────────────────────────────────
          if (tc.tool_name !== 'todo_write' && tc.tool_name !== 'list_plan') {
            const plan = this.session?.plan;
            if (Array.isArray(plan) && plan.length > 0) {
              const progress = this.session.getPlanProgress();
              this.onEvent({
                type: 'plan_progress',
                data: { ...progress, round },
              });
            }
          }

          // ── Smart loop detection ─────────────────────────────────────────
          const sig = normalizeToolSig(tc.tool_name, tc.arguments);
          recentToolSigs.push(sig);
          if (recentToolSigs.length > LOOP_WINDOW_SIZE) recentToolSigs.shift();

          // Check consecutive duplicates (allow retryable tools more slack)
          const maxDups = RETRYABLE_TOOLS.has(tc.tool_name) ? MAX_CONSECUTIVE_DUPS + 1 : MAX_CONSECUTIVE_DUPS;
          let consecutiveCount = 0;
          for (let j = recentToolSigs.length - 1; j >= 0; j--) {
            if (recentToolSigs[j] === sig) consecutiveCount++;
            else break;
          }
          if (consecutiveCount >= maxDups) {
            const repeatedToolThought = `Detected repeated tool call (${tc.tool_name}) — stopping loop.`;
            reasoningEvents.push({ thought: repeatedToolThought, round, timestamp: new Date().toISOString() });
            this.onEvent({ type: 'thinking', data: { thought: repeatedToolThought, round } });
            answer = this._formatRepeatedToolAnswer(tc, result);
            stopReason = 'loop_detected';
            this.onEvent({ type: 'answer', data: { answer, round } });
            break;
          }

          // Detect cycles of length 2-3 (A→B→A→B or A→B→C→A→B→C)
          if (recentToolSigs.length >= 4) {
            for (let cycleLen = 2; cycleLen <= 3; cycleLen++) {
              if (recentToolSigs.length >= cycleLen * MAX_CYCLE_REPEATS) {
                const tail = recentToolSigs.slice(-cycleLen * MAX_CYCLE_REPEATS);
                const pattern = tail.slice(0, cycleLen).join('|');
                let isRepeating = true;
                for (let c = 1; c < MAX_CYCLE_REPEATS; c++) {
                  if (tail.slice(c * cycleLen, (c + 1) * cycleLen).join('|') !== pattern) {
                    isRepeating = false;
                    break;
                  }
                }
                if (isRepeating) {
                  const cycleTools = tail.slice(0, cycleLen).map(s => s.split(':')[0]).join(' → ');
                  const loopThought = `Detected cycling pattern (${cycleTools}) repeating ${MAX_CYCLE_REPEATS}x — stopping loop.`;
                  reasoningEvents.push({ thought: loopThought, round, timestamp: new Date().toISOString() });
                  this.onEvent({ type: 'thinking', data: { thought: loopThought, round } });
                  answer = `I stopped because I detected a repeating cycle: ${cycleTools}. This usually means I'm stuck. Here's the latest result:\n\n${JSON.stringify(result).slice(0, 2000)}`;
                  stopReason = 'loop_detected';
                  this.onEvent({ type: 'answer', data: { answer, round } });
                  break;
                }
              }
            }
            if (answer) break;
          }

          if (tc.tool_name !== 'todo_write' && tc.tool_name !== 'list_plan') {
            this._advanceAutoPlan(this._isMutatingTool(tc.tool_name, tc.arguments) ? 'mutated' : 'inspected', round);
          }

          // ── Self-verification after file mutations (3.2) ─────────────────
          if (this._isMutatingTool(tc.tool_name, tc.arguments)) {
            const mutatedFile = tc.arguments?.path || tc.arguments?.file || tc.arguments?.filename || null;
            if (mutatedFile) {
              const absPath = path.isAbsolute(mutatedFile) ? mutatedFile : path.resolve(this.workingDir, mutatedFile);
              const verifyResult = await this._autoVerify([absPath], toolContext);
              if (verifyResult?.hasErrors) {
                // Inject verification errors into context so the agent can self-correct
                messages.push({
                  role: 'user',
                  content: `[Auto-verification detected issues after your edit]\n${verifyResult.summary}\n\nPlease review and fix these issues.`,
                });
              }
            }
          }
        }
        if (answer) break;
      }

      // ── Periodic self-reflection (3.3) ─────────────────────────────────
      if (!answer) {
        const reflection = await this._selfReflect(goal, messages, round, this.session.toolHistory);
        if (reflection?.abort) {
          answer = `I've been reflecting on my progress and determined I'm stuck: ${reflection.reason}\n\nHere's what I accomplished:\n` +
            this.session.toolHistory.slice(-5).map(t => `- ${t.tool}: ${t.result?.message || (t.result?.success ? 'success' : 'failed')}`).join('\n');
          stopReason = 'reflection_abort';
          this.onEvent({ type: 'answer', data: { answer, round } });
          break;
        }
        if (reflection?.guidance) {
          messages.push({ role: 'user', content: reflection.guidance });
        }
      }

      // Save session periodically
      if (round % 3 === 0) this.session.save();
    }

    // If we exhausted all rounds without an answer
    if (!answer) {
      answer = 'I reached the maximum number of steps. Here is what I accomplished:\n\n' +
        this.session.toolHistory.map(t => `- ${t.tool}: ${t.result?.message || (t.result?.success ? 'success' : 'failed')}`).join('\n');
      stopReason = 'max_rounds';
      this.onEvent({ type: 'answer', data: { answer, round: this.maxRounds } });
    }

    this.session.setScratchpad('finalAnswer', answer);

    // Track conversation rounds for UI reconstruction after refresh
    const rounds = this.session.scratchpad.conversationRounds || [];
    rounds.push({
      goal,
      answer,
      timestamp: new Date().toISOString(),
      startRound: conversationRoundStart,
      endRound: this.session.totalRounds || conversationRoundStart,
      toolStartIndex: conversationToolStart,
      toolEndIndex: this.session.toolHistory?.length || conversationToolStart,
      reasoning: reasoningEvents,
    });
    this.session.setScratchpad('conversationRounds', rounds);

    this.session.complete();

    this._trackWorkflow(goal);

    // Post-run memory extraction — proactively save durable facts from the conversation
    this._extractMemories(goal, answer, messages).catch(err =>
      console.error('[agent] Post-run memory extraction failed:', err.message)
    );

    return { answer, stopReason, session: this.session, toolCalls: this.session.toolHistory };
  }

  /**
   * Run the agent with SSE streaming (for API endpoint).
   */
  async runStreaming(goal, conversationHistory, res) {
    const originalOnEvent = this.onEvent;
    const writeSse = (event) => {
      if (res.destroyed || res.writableEnded) return false;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.flush?.();
      return true;
    };

    this.onEvent = (event) => {
      try {
        writeSse(event);
      } catch {}
      originalOnEvent(event);
    };

    const result = await this.run(goal, conversationHistory);

    writeSse({
      type: 'done',
      data: {
        answer: result.answer,
        stopReason: result.stopReason || 'answer',
        sessionId: result.session.id,
        rounds: result.session.totalRounds,
        maxRounds: this.maxRounds,
        conversationRounds: result.session.scratchpad.conversationRounds || []
      }
    });
    res.end();

    return result;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  async _checkPermission({ toolCall, permission, actionDesc, round }) {
    this._throwIfAborted();

    if (permission === 'safe') {
      return { allowed: true, decision: 'auto_safe' };
    }

    if (this.agentMode === 'plan') {
      return {
        allowed: false,
        decision: 'plan_mode_denied',
        reason: 'Plan mode can inspect and plan with safe tools only. Switch to Action mode to execute changes.',
      };
    }

    if (this.autoApprove) {
      return { allowed: true, decision: 'auto_approved' };
    }

    if (this.sessionApprovedTools.has(toolCall.tool_name)) {
      return { allowed: true, decision: 'session_approved' };
    }

    if (this.requestPermission) {
      const request = {
        sessionId: this.session?.id,
        tool: toolCall.tool_name,
        args: toolCall.arguments,
        permission,
        description: actionDesc,
        diff: this._buildPermissionDiff(toolCall.tool_name, toolCall.arguments),
        round,
        workingDir: this.workingDir,
      };

      const decision = await this.requestPermission(request);
      this._throwIfAborted();
      const decisionName = decision?.decision || 'deny';
      const allowed = decisionName === 'allow'
        || decisionName === 'allow_session';

      if (decisionName === 'allow_session') {
        this.sessionApprovedTools.add(toolCall.tool_name);
      }

      return {
        allowed,
        decision: allowed ? decisionName : 'denied',
        reason: decision?.reason || (allowed ? null : 'User denied permission'),
      };
    }

    return { allowed: true, decision: 'local_auto' };
  }
  async _callLLM(systemPrompt, messages, options = {}) {
    this._throwIfAborted();
    const useNativeTools = this.supportsNativeTools;

    let params = {
      model: this.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: this.isLocal ? 2048 : 4096,
      stream: true,
    };

    // For cloud models with native tool support, pass tool definitions via API
    if (useNativeTools) {
      params.tools = toolRegistry.toOpenAIFormat(this._toolDefinitionsForMode().map(t => t.name));
      params.tool_choice = options.forceToolName
        ? { type: 'function', function: { name: options.forceToolName } }
        : 'auto';
      params.max_completion_tokens = params.max_tokens;
      delete params.max_tokens;
    }

    params = applyReasoningEffort(params, options.reasoningEffort || this.reasoningEffort, this.providerInfo, this.model);

    const requestOptions = this.abortSignal ? { signal: this.abortSignal } : undefined;
    let stream;
    try {
      stream = await this.aiClient.client.chat.completions.create(params, requestOptions);
    } catch (err) {
      if (!options.forceToolName) throw err;
      const fallbackParams = { ...params, tool_choice: 'auto' };
      stream = await this.aiClient.client.chat.completions.create(fallbackParams, requestOptions);
    }
    let fullText = '';
    let reasoningText = '';
    const toolCalls = {};
    let finishReason = null;

    for await (const chunk of stream) {
      this._throwIfAborted();
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      
      finishReason = chunk.choices[0]?.finish_reason || finishReason;

      const reasoningDelta = reasoningTextFromDelta(delta);
      if (reasoningDelta) {
        reasoningText += reasoningDelta;
      }

      if (delta.content) {
        fullText += delta.content;
        // Emit delta event for real-time streaming
        this.onEvent({ type: 'delta', data: { content: delta.content } });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCalls[tc.index]) {
            toolCalls[tc.index] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
          }
          if (tc.id) toolCalls[tc.index].id = tc.id;
          if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
          if (tc.function?.arguments) {
            toolCalls[tc.index].function.arguments += typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : stringifyToolArguments(tc.function.arguments);
          }
        }
      }
    }

    this._throwIfAborted();

    const apiToolCalls = normalizeNativeToolCalls(Object.values(toolCalls));

    return {
      text: fullText,
      reasoning: reasoningText,
      toolCalls: apiToolCalls,
      finishReason: finishReason,
    };
  }

  _isAbortError(err) {
    return err?.name === 'AbortError' || this.abortSignal?.aborted;
  }

  _ensureAutoPlan(goal, round = 0) {
    if (!ACTION_GOAL_RE.test(String(goal || ''))) return;
    if (Array.isArray(this.session?.plan) && this.session.plan.length > 0) return;

    const plan = this.agentMode === 'plan'
      ? [
          {
            id: 'auto_plan_inspect',
            content: 'Inspect current context',
            activeForm: 'Inspecting current context',
            status: 'in_progress',
          },
          {
            id: 'auto_plan_understand',
            content: 'Identify constraints and risks',
            activeForm: 'Identifying constraints and risks',
            status: 'pending',
          },
          {
            id: 'auto_plan_apply',
            content: 'Draft the action plan',
            activeForm: 'Drafting the action plan',
            status: 'pending',
          },
          {
            id: 'auto_plan_verify',
            content: 'Answer with next steps',
            activeForm: 'Answering with next steps',
            status: 'pending',
          },
        ]
      : [
          {
            id: 'auto_plan_inspect',
            content: 'Inspect current context',
            activeForm: 'Inspecting current context',
            status: 'in_progress',
          },
          {
            id: 'auto_plan_understand',
            content: 'Identify the cause',
            activeForm: 'Identifying the cause',
            status: 'pending',
          },
          {
            id: 'auto_plan_apply',
            content: 'Apply the needed change',
            activeForm: 'Applying the needed change',
            status: 'pending',
          },
          {
            id: 'auto_plan_verify',
            content: 'Verify the result',
            activeForm: 'Verifying the result',
            status: 'pending',
          },
        ];

    this.session.plan = plan;
    this.session.save();
    this.onEvent({ type: 'plan_update', data: { plan, round, automatic: true } });
  }

  _advanceAutoPlan(phase, round = 0) {
    if (!isAutoPlan(this.session?.plan)) return;

    const current = this.session.plan.map(item => ({ ...item }));
    const byId = new Map(current.map(item => [item.id, item]));
    const inspect = byId.get('auto_plan_inspect');
    const understand = byId.get('auto_plan_understand');
    const apply = byId.get('auto_plan_apply');
    const verify = byId.get('auto_plan_verify');

    if (phase === 'inspected' && inspect?.status === 'in_progress') {
      inspect.status = 'completed';
      if (understand?.status === 'pending') understand.status = 'in_progress';
    }

    if (phase === 'mutated') {
      if (inspect && inspect.status !== 'completed') inspect.status = 'completed';
      if (understand && understand.status !== 'completed') understand.status = 'completed';
      if (apply) apply.status = 'completed';
      if (verify?.status === 'pending') verify.status = 'in_progress';
    }

    const changed = JSON.stringify(current) !== JSON.stringify(this.session.plan);
    if (!changed) return;
    this.session.plan = current;
    this.session.save();
    this.onEvent({ type: 'plan_update', data: { plan: current, round, automatic: true } });
  }

  _completeAutoPlan(round = 0) {
    if (!isAutoPlan(this.session?.plan)) return;
    const plan = this.session.plan.map(item => ({ ...item, status: 'completed' }));
    this.session.plan = plan;
    this.session.save();
    this.onEvent({ type: 'plan_update', data: { plan, round, automatic: true } });
  }

  _shouldPrimePlan(goal, round) {
    if (!this.supportsNativeTools) return false;
    if (round !== 0) return false;
    if (Array.isArray(this.session?.plan) && this.session.plan.length > 0) return false;
    if (!toolRegistry.has('todo_write')) return false;
    // Only force plan for goals that look multi-step
    const goalStr = String(goal || '');
    if (!ACTION_GOAL_RE.test(goalStr)) return false;
    // Skip plan priming for short/simple goals (less than 15 words or no multi-step indicators)
    const wordCount = goalStr.split(/\s+/).filter(Boolean).length;
    if (wordCount < 15 && !MULTI_STEP_GOAL_RE.test(goalStr)) return false;
    return true;
  }

  _throwIfAborted() {
    if (!this.abortSignal?.aborted) return;
    const error = new Error('Agent run stopped by user.');
    error.name = 'AbortError';
    throw error;
  }

  _buildPermissionDiff(toolName, args = {}) {
    if (toolName !== 'write_file' && toolName !== 'edit_file') return null;
    if (!args.path) return null;

    try {
      const targetPath = path.resolve(this.workingDir, args.path);
      const rootPath = path.resolve(this.workingDir);
      const relative = path.relative(rootPath, targetPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

      const oldContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
      let newContent = oldContent;
      if (toolName === 'write_file') {
        newContent = String(args.content ?? '');
      } else {
        const find = String(args.find ?? '');
        if (!find || !oldContent.includes(find)) return null;
        newContent = oldContent.replace(find, String(args.replace ?? ''));
      }

      return this._unifiedDiff(args.path, oldContent, newContent);
    } catch {
      return null;
    }
  }

  _unifiedDiff(filePath, oldContent, newContent) {
    if (oldContent === newContent) return null;
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
    const maxLines = 120;
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen && lines.length < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      if (oldLine === newLine) {
        lines.push(` ${oldLine ?? ''}`);
      } else {
        if (oldLine !== undefined) lines.push(`-${oldLine}`);
        if (newLine !== undefined) lines.push(`+${newLine}`);
      }
    }

    if (maxLen + 2 > maxLines) {
      lines.push(`... [diff truncated: ${maxLen + 2 - maxLines} more lines]`);
    }

    const diff = lines.join('\n');
    return diff.length > 12000 ? `${diff.slice(0, 12000)}\n... [diff truncated]` : diff;
  }

  /**
   * Resolve the model's context window using the existing modelContextResolver.
   * Uses providerInfo (already passed from clientFactory) for accurate lookup.
   */
  _resolveContextWindow() {
    try {
      const providerId = this.providerInfo?.providerId || '';
      const settings = this.providerInfo?.settings || {};
      return resolveContextWindow({
        providerId,
        model: this.model,
        settings,
        fallback: this.isLocal ? 8192 : 128000,
      });
    } catch {
      return { contextWindow: this.isLocal ? 8192 : 128000, source: 'fallback', confidence: 'conservative' };
    }
  }

  _estimateTokens(value) {
    return Math.ceil(String(value || '').length / 4);
  }

  _effectivePermission(toolName, args = {}, fallbackPermission = 'dangerous') {
    if (toolName === 'run_command' && this._looksReadOnlyShellCommand(args.command || '')) {
      return 'safe';
    }
    if (toolName === 'http_request') {
      const method = String(args.method || 'GET').trim().toUpperCase();
      return method === 'GET' || method === 'HEAD' ? 'safe' : 'moderate';
    }
    if (toolName?.startsWith('git_')) {
      if (isGitDangerousAction(toolName, args)) return 'dangerous';
      if (isGitReadOnlyAction(toolName, args)) return 'safe';
      return 'moderate';
    }
    if (toolName === 'package_manager') {
      const command = String(args.command || '').trim().toLowerCase();
      if (/^(audit|outdated|freeze|list|show|info|why|version|--version)\b/.test(command)) return 'safe';
      return 'moderate';
    }
    return fallbackPermission;
  }

  _toolDefinitionsForMode() {
    if (this.agentMode !== 'plan') return toolRegistry.all();
    return toolRegistry.all().filter(tool => {
      if (PLAN_BLOCKED_SAFE_TOOLS.has(tool.name)) return false;
      if (tool.permission === 'safe') return true;
      if (PLAN_DYNAMIC_SAFE_TOOLS.has(tool.name)) return true;
      if (tool.name?.startsWith('git_')) return true;
      return false;
    });
  }

  _isMutatingTool(toolName, args = {}) {
    if (MUTATING_FILE_TOOLS.has(toolName)) return true;
    if (toolName === 'run_command') return !this._looksReadOnlyShellCommand(args.command || '');
    return MUTATING_SHELL_TOOLS.has(toolName);
  }

  _looksReadOnlyShellCommand(command) {
    if (!command || typeof command !== 'string') return false;
    const raw = command.trim();
    if (!raw) return false;
    if (/[`$<>]/.test(raw)) return false;

    const mutatingPattern = /\b(rm|mv|cp|touch|mkdir|rmdir|chmod|chown|ln|tee|truncate|dd|curl|wget|ssh|scp|rsync)\b|\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|update|upgrade|run|exec|dlx|create)\b|\bgit\s+(add|am|apply|checkout|clean|commit|merge|pull|push|rebase|reset|restore|revert|stash|switch)\b|\b(sed\s+-i|perl\s+-pi|python|python3|node|bash|sh)\b/i;
    if (mutatingPattern.test(raw)) return false;

    const normalized = raw
      .replace(/^(?:cd\s+(?:"[^"]+"|'[^']+'|[^&|;]+)\s*&&\s*)+/i, '')
      .trim();

    if (/[;&]|\|\|/.test(normalized)) return false;

    const readonlySegment = /^(git\s+(show|log|status|diff|rev-parse|branch|ls-files|describe|remote|tag)\b|pwd\b|ls\b|find\b|rg\b|grep\b|cat\b|sed\s+-n\b|awk\b|wc\b|head\b|tail\b|du\b|sort\b|uniq\b|cut\b|tr\b)/i;
    return normalized
      .split('|')
      .map(segment => segment.trim())
      .filter(Boolean)
      .every(segment => readonlySegment.test(segment));
  }

  _ensureBaselineCheckpoint({ round, toolName }) {
    const existing = this.session?.scratchpad?.baselineCheckpoint;
    if (existing?.id) return existing;

    const checkpoint = this._createCheckpoint({ round, toolName, baseline: true, forceSnapshot: true });
    if (checkpoint && this.session) {
      this.session.setScratchpad('baselineCheckpoint', checkpoint);
      this.session.save();
      this.onEvent({ type: 'checkpoint', data: checkpoint });
    }
    return checkpoint;
  }

  _createCheckpoint({ round, toolName, baseline = false, forceSnapshot = false }) {
    try {
      const id = `cp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const workspace = path.resolve(this.workingDir);
      const message = `asyncat ${baseline ? 'baseline' : 'checkpoint'} ${this.session?.id || 'session'} round ${round} ${toolName}`;
      let checkpoint;
      try {
        if (forceSnapshot) throw new Error('snapshot requested');
        execSync('git rev-parse --is-inside-work-tree', { cwd: workspace, stdio: 'ignore', timeout: 3000 });
        execSync(`git stash push --include-untracked -m ${JSON.stringify(message)}`, { cwd: workspace, stdio: 'ignore', timeout: 15000 });
        const list = execSync('git stash list', { cwd: workspace, encoding: 'utf8', timeout: 3000 });
        const first = list.split('\n').find(line => line.includes(message));
        checkpoint = {
          id,
          kind: 'git_stash',
          workspace,
          message,
          ref: first?.split(':')[0] || 'stash@{0}',
          createdAt: new Date().toISOString(),
          baseline,
        };
      } catch {
        const snapRoot = path.join(workspace, '.asyncat', 'snapshots');
        const dir = path.join(snapRoot, id);
        fs.mkdirSync(dir, { recursive: true });
        this._copySnapshot(workspace, dir, workspace);
        checkpoint = {
          id,
          kind: 'dir_snapshot',
          workspace,
          dir,
          createdAt: new Date().toISOString(),
          baseline,
        };
      }
      CHECKPOINTS.set(id, checkpoint);
      return checkpoint;
    } catch (err) {
      this.onEvent({ type: 'error', data: { message: `Checkpoint failed: ${err.message}` } });
      return null;
    }
  }

  _copySnapshot(src, dest, root) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (SNAPSHOT_SKIP.has(entry.name)) continue;
      const from = path.join(src, entry.name);
      const rel = path.relative(root, from);
      if (rel === '.asyncat' || rel.startsWith(`.asyncat${path.sep}snapshots`)) continue;
      const to = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        this._copySnapshot(from, to, root);
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
  }

  _parseResponse(text, streamedReasoning = '') {
    const parsed = extractReasoningFromText(text);
    let finalAnswer = null;

    // Extract Answer: section (signals task completion)
    const answerMatch = parsed.answer.match(/(?:\*\*)?Answer:(?:\*\*)?\s*([\s\S]*?)$/i);
    if (answerMatch) {
      finalAnswer = cleanReasoningAnswer(answerMatch[1]);
    } else if (parsed.answer !== text) {
      finalAnswer = parsed.answer;
    }

    const thinking = combineReasoningParts(streamedReasoning, parsed.thinking);

    return { thinking, finalAnswer };
  }

  _looksLikeUnfinishedAction(text) {
    if (!text || /(?:\*\*)?Answer:(?:\*\*)?/i.test(text)) return false;
    return (
      /(?:\*\*)?Action:(?:\*\*)?/i.test(text) ||
      /\b(i'?ll|i will|going to|need to|should)\s+(use|run|execute|create|make)\b/i.test(text) ||
      /\b(mkdir|run_command|write_file|create_directory|tool_call)\b/i.test(text)
    );
  }

  _compactToolResultForContext(toolName, result) {
    if (!result || typeof result !== 'object') return result;
    const maxString = toolName === 'list_directory' ? 1800 : 3000;
    const compact = Array.isArray(result) ? [...result] : { ...result };
    for (const [key, value] of Object.entries(compact)) {
      if (typeof value === 'string' && value.length > maxString) {
        compact[key] = `${value.slice(0, maxString)}\n... [truncated for model context: ${value.length - maxString} more chars]`;
        compact.truncated_for_context = true;
      }
    }
    return compact;
  }

  _toolResultMessage(toolCall, result, nativeTools = false) {
    if (nativeTools) {
      const content = typeof result === 'string' ? result : JSON.stringify(result);
      return {
        role: 'tool',
        tool_call_id: toolCall.call_id,
        name: toolCall.tool_name,
        content,
      };
    }

    return {
      role: 'user',
      content: ToolCallFormatter.formatToolResult(toolCall.tool_name, toolCall.call_id, result),
    };
  }

  _formatArgumentRepairPrompt(toolCall, validation) {
    const tool = toolRegistry.get(toolCall.tool_name);
    const required = tool?.parameters?.required || [];
    const schema = tool?.parameters?.properties || {};
    const missing = validation.missing?.length
      ? `Missing required argument(s): ${validation.missing.map(k => `\`${k}\``).join(', ')}.`
      : '';
    const invalid = validation.invalid?.length
      ? `Invalid argument(s): ${validation.invalid.map(item => `\`${item.key}\` was ${item.actual}, expected ${item.expected}`).join('; ')}.`
      : '';

    // Build a concrete example with placeholder values for required fields
    const exampleArgs = {};
    for (const req of required) {
      const prop = schema[req];
      if (prop?.type === 'string') exampleArgs[req] = `<${req}_value>`;
      else if (prop?.type === 'number' || prop?.type === 'integer') exampleArgs[req] = 0;
      else if (prop?.type === 'boolean') exampleArgs[req] = true;
      else if (prop?.type === 'array') exampleArgs[req] = [];
      else exampleArgs[req] = `<${req}_value>`;
    }

    // Show what the model actually sent vs what was expected
    const sentArgs = Object.keys(toolCall.arguments || {}).length > 0
      ? `You sent: ${JSON.stringify(toolCall.arguments).slice(0, 800)}`
      : 'You sent an empty arguments object.';

    return [
      `You called \`${toolCall.tool_name}\` with invalid arguments, so it was NOT executed.`,
      missing,
      invalid,
      '',
      sentArgs,
      '',
      `Here is the EXACT format required. Replace placeholder values with real values:`,
      '<tool_call>',
      JSON.stringify({ name: toolCall.tool_name, arguments: exampleArgs }, null, 2),
      '</tool_call>',
      '',
      `Required fields: ${required.map(k => `\`${k}\``).join(', ')}. Do NOT use alternative names like \`file\`, \`filename\`, or \`cmd\`.`,
    ].filter(Boolean).join('\n');
  }

  _formatRepeatedToolAnswer(toolCall, result) {
    const lines = [
      `I stopped because the same tool call repeated three times in a row: \`${toolCall.tool_name}\`.`,
    ];

    const args = toolCall.arguments || {};
    const command = args.command || args.code || null;
    if (command) lines.push(`Last repeated command:\n\n\`\`\`sh\n${String(command).slice(0, 1200)}\n\`\`\``);

    if (result && typeof result === 'object') {
      const output = result.stdout || result.output || result.stderr || result.error || null;
      if (output) {
        lines.push(`Latest result:\n\n\`\`\`\n${String(output).slice(0, 4000)}\n\`\`\``);
      } else {
        lines.push(`Latest result: ${JSON.stringify(result).slice(0, 4000)}`);
      }
    } else if (result) {
      lines.push(`Latest result:\n\n\`\`\`\n${String(result).slice(0, 4000)}\n\`\`\``);
    }

    lines.push('This is a loop guard, not a user stop.');
    return lines.join('\n\n');
  }

  /**
   * Detect and store corrections from the user's latest message.
   * Looks for patterns like "no", "wrong", "actually", "instead", "don't".
   * Stores as high-importance feedback memory for self-improvement.
   */
  _extractCorrections(goal, conversationHistory) {
    try {
      const userMessages = conversationHistory.filter(m => m.role === 'user');
      if (userMessages.length === 0) return;

      const latest = userMessages[userMessages.length - 1];
      const text = String(latest.content || '').trim();
      if (text.length < 10) return;

      // Correction patterns — only match if they appear at the start of the message
      // or as clear correction indicators
      const correctionPatterns = [
        /^no[,.\s!]/i,
        /^wrong/i,
        /^that'?s (?:not|wrong|incorrect)/i,
        /^actually[,\s]/i,
        /\bdon'?t (?:use|do|make)\b/i,
        /\binstead (?:of|use)\b/i,
        /\bnot [\w]+ (?:but|use|try)\b/i,
        /\bwrong (?:approach|way|method)\b/i,
        /\bshould(?:n'?t| not) (?:use|do|be)\b/i,
        /\bplease (?:fix|change|update|correct)\b/i,
        /\bI (?:said|meant|want(?:ed)?)\b/i,
      ];

      const isCorrection = correctionPatterns.some(p => p.test(text));
      if (!isCorrection) return;

      // Get the last assistant message for context
      const assistantMessages = conversationHistory.filter(m => m.role === 'assistant');
      const lastAssistant = assistantMessages.length > 0
        ? String(assistantMessages[assistantMessages.length - 1].content || '').slice(0, 200)
        : '';

      const correctionContent = [
        `User correction: ${text.slice(0, 500)}`,
        lastAssistant ? `Context (agent said): ${lastAssistant}` : '',
        `Goal was: ${goal.slice(0, 100)}`,
      ].filter(Boolean).join('\n');

      const key = `correction_${Date.now().toString(36)}`;

      // Check we haven't saved too many corrections recently
      const recentCorrections = db.prepare(
        "SELECT COUNT(*) as cnt FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND memory_type = 'feedback' AND created_at > datetime('now', '-1 hour')"
      ).get(this.userId, this.workspaceId);

      if ((recentCorrections?.cnt || 0) >= 10) return; // Rate limit

      db.prepare(
        'INSERT INTO agent_memory (id, user_id, workspace_id, memory_type, key, content, tags, importance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        randomUUID(),
        this.userId,
        this.workspaceId,
        'feedback',
        key,
        correctionContent,
        JSON.stringify(['correction', 'auto-extracted']),
        0.9 // High importance so it surfaces in future runs
      );

      this.onEvent({
        type: 'correction_learned',
        data: { key, preview: text.slice(0, 100) },
      });

      console.log(`[agent] Auto-extracted correction: ${key}`);
    } catch (err) {
      // Non-critical — silently ignore errors
      console.warn('[agent] Correction extraction failed:', err.message);
    }
  }

  _loadMemories(goal) {
    try {
      const rows = searchMemories({
        userId: this.userId,
        workspaceId: this.workspaceId,
        query: goal,
        kind: 'all',
        limit: 10,
        bumpAccess: true,
      });
      if (rows.length > 0) return rows;
      return listMemories({
        userId: this.userId,
        workspaceId: this.workspaceId,
        kind: 'all',
        limit: 5,
      });
    } catch {
      return [];
    }
  }

  _trackWorkflow(goal) {
    if (this.session?.toolHistory?.length > 0) {
      const tools = this.session.toolHistory.map(t => t.tool);
      basalGanglia.trackWorkflow({
        userId: this.userId,
        workspaceId: this.workspaceId,
        goal,
        tools,
        success: true,
      }).catch(err => console.error('[basal-ganglia] Track error:', err.message));
    }
  }

  _trackFailure(goal, error) {
    if (this.session?.toolHistory?.length > 0) {
      const tools = this.session.toolHistory.map(t => t.tool);
      basalGanglia.trackWorkflow({
        userId: this.userId,
        workspaceId: this.workspaceId,
        goal,
        tools,
        success: false,
      }).catch(err => console.error('[basal-ganglia] Track failure error:', err.message));
    }
  }

  /**
   * Post-run memory extraction — uses a lightweight LLM call to extract
   * durable facts from the conversation that should be remembered.
   */
  async _extractMemories(goal, answer, messages) {
    if (!this.aiClient?.messages?.create && !this.aiClient?.client?.chat?.completions?.create) return;
    if (!answer || answer.length < 50) return;
    // Don't extract for trivial sessions (< 2 tool calls)
    if ((this.session?.toolHistory?.length || 0) < 2) return;

    try {
      // Build a concise summary of what happened
      const toolSummary = (this.session.toolHistory || []).slice(-10).map(t =>
        `${t.tool}(${Object.keys(t.args || {}).join(', ')}) → ${t.result?.success === false ? 'FAILED' : 'ok'}`
      ).join('\n');

      const extractionPrompt = [
        'You extract durable facts from an agent conversation that should be saved to long-term memory.',
        'Only extract STABLE facts that will be useful in future sessions. Skip one-off details.',
        'Return JSON: {"memories": [{"kind": "user|feedback|project|reference|preference|context", "key": "short_key", "content": "what to remember", "importance": 0.5}]}',
        'Return {"memories": []} if nothing is worth saving.',
        'Limit to at most 3 memories. Be selective.',
      ].join(' ');

      const conversationSummary = `Goal: ${goal.slice(0, 200)}\nTools used:\n${toolSummary}\nFinal answer (excerpt): ${answer.slice(0, 500)}`;

      let raw = '';
      if (this.aiClient?.messages?.create) {
        const response = await this.aiClient.messages.create({
          model: this.model,
          max_completion_tokens: 400,
          system: extractionPrompt,
          messages: [{ role: 'user', content: conversationSummary }],
        });
        raw = response.content?.[0]?.text || '';
      } else if (this.aiClient?.client?.chat?.completions?.create) {
        const response = await this.aiClient.client.chat.completions.create({
          model: this.model,
          max_tokens: 400,
          messages: [
            { role: 'system', content: extractionPrompt },
            { role: 'user', content: conversationSummary },
          ],
        });
        raw = response.choices?.[0]?.message?.content || '';
      }

      // Parse and save memories
      const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      let parsed;
      try { parsed = JSON.parse(cleaned); } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) try { parsed = JSON.parse(match[0]); } catch { return; }
        else return;
      }

      const memories = Array.isArray(parsed?.memories) ? parsed.memories : [];
      for (const mem of memories.slice(0, 3)) {
        if (!mem.content || mem.content.length < 5) continue;
        const kind = ['user', 'feedback', 'project', 'reference', 'preference', 'context'].includes(mem.kind) ? mem.kind : 'fact';
        const key = mem.key || `auto_${kind}_${randomUUID().slice(0, 8)}`;
        const importance = Math.max(0, Math.min(1, Number(mem.importance || 0.5)));

        // Check if a similar memory already exists
        const existing = db.prepare(
          'SELECT id FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ?'
        ).get(this.userId, this.workspaceId, key);

        if (existing) {
          db.prepare(
            "UPDATE agent_memory SET content = ?, importance = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(mem.content, importance, existing.id);
        } else {
          db.prepare(
            'INSERT INTO agent_memory (id, user_id, workspace_id, memory_type, key, content, tags, importance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(randomUUID(), this.userId, this.workspaceId, kind, key, mem.content, '[]', importance);
        }
      }

      if (memories.length > 0) {
        console.log(`[agent] Auto-extracted ${memories.length} memories from run`);
      }
    } catch (err) {
      console.warn('[agent] Memory extraction error:', err.message);
    }
  }

  // ── Error classification for retry logic ─────────────────────────────────

  _isRetryableError(err) {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    const status = err.status || err.statusCode || 0;
    // Rate limits
    if (status === 429) return true;
    // Server errors
    if (status >= 500 && status < 600) return true;
    // Network errors
    if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('etimedout')) return true;
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('socket hang up')) return true;
    // Overloaded
    if (msg.includes('overloaded') || msg.includes('capacity') || msg.includes('rate limit')) return true;
    // Timeout
    if (msg.includes('timeout') && !msg.includes('context')) return true;
    return false;
  }

  // ── Reflection / Self-Critique (3.3) ─────────────────────────────────────
  // Runs every REFLECTION_INTERVAL rounds to check if the agent is making
  // progress or stuck. Returns a guidance string to inject into context.

  async _selfReflect(goal, messages, round, toolHistory) {
    const REFLECTION_INTERVAL = 5;
    if (round < REFLECTION_INTERVAL || round % REFLECTION_INTERVAL !== 0) return null;
    if (!this.aiClient?.client?.chat?.completions?.create) return null;

    try {
      const recentTools = (toolHistory || []).slice(-8).map(t => {
        const status = t.result?.success === false ? 'FAILED' : 'ok';
        return `  ${t.tool}(${Object.keys(t.args || {}).join(', ')}) → ${status}`;
      }).join('\n');

      // Plan-aware context: include plan progress so the reflector can
      // distinguish "making progress on the plan" from "stuck"
      const planProgress = this.session?.getPlanProgress?.() || { completed: 0, total: 0, percentage: 100 };
      const planContext = planProgress.total > 0
        ? `\nPlan progress: ${planProgress.completed}/${planProgress.total} items completed (${planProgress.percentage}%)`
        : '';

      const reflectionPrompt = [
        'You are evaluating an AI agent\'s progress on a task.',
        'Analyze the recent tool calls and determine:',
        '1. Is the agent making meaningful progress toward the goal?',
        '2. Is it going in circles or repeating similar actions?',
        '3. Should it change its approach?',
        '4. If there is a plan with items being completed, that indicates progress even if tool calls look similar.',
        '',
        'Return JSON: {"progress": "good|slow|stuck", "suggestion": "brief guidance or null", "should_continue": true/false}',
        'Be concise. Return null suggestion if progress is good.',
      ].join('\n');

      const context = `Goal: ${String(goal).slice(0, 300)}\nRound: ${round}${planContext}\nRecent tools (last 8):\n${recentTools}`;

      const response = await this.aiClient.client.chat.completions.create({
        model: this.model,
        max_tokens: 200,
        messages: [
          { role: 'system', content: reflectionPrompt },
          { role: 'user', content: context },
        ],
      });

      const raw = response.choices?.[0]?.message?.content || '';
      const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      let parsed;
      try { parsed = JSON.parse(cleaned); } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) try { parsed = JSON.parse(match[0]); } catch { return null; }
        else return null;
      }

      if (!parsed) return null;

      const progress = parsed.progress || 'good';
      const suggestion = parsed.suggestion || null;

      this.onEvent({
        type: 'thinking',
        data: { thought: `Self-reflection (round ${round}): progress=${progress}${suggestion ? ` — ${suggestion}` : ''}`, round },
      });

      if (progress === 'stuck' && parsed.should_continue === false) {
        return { abort: true, reason: suggestion || 'Agent determined it is stuck and should stop.' };
      }

      if (suggestion && progress !== 'good') {
        return { guidance: `[Self-reflection at round ${round}]: ${suggestion}` };
      }

      return null;
    } catch (err) {
      console.warn('[agent] Self-reflection error:', err.message);
      return null;
    }
  }

  // ── Self-Verification After Edits (3.2) ──────────────────────────────────
  // After file mutations, detect the project type and run quick verification
  // (lint, type check, test). Returns verification results to inject into context.

  async _autoVerify(mutatedFiles, toolContext) {
    if (!mutatedFiles || mutatedFiles.length === 0) return null;

    // Only verify code files
    const CODE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.css', '.scss']);
    const codeFiles = mutatedFiles.filter(f => CODE_EXTS.has(path.extname(f).toLowerCase()));
    if (codeFiles.length === 0) return null;

    const checks = [];
    const workDir = this.workingDir;

    try {
      // Detect project type and available checks
      const hasPkgJson = fs.existsSync(path.join(workDir, 'package.json'));
      const hasPyproject = fs.existsSync(path.join(workDir, 'pyproject.toml'));

      if (hasPkgJson) {
        const pkg = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
        const scripts = pkg.scripts || {};
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Quick lint check (only on changed files)
        const jsFiles = codeFiles.filter(f => /\.[jt]sx?$/.test(f));
        if (jsFiles.length > 0 && (deps.eslint || scripts.lint)) {
          try {
            const fileArgs = jsFiles.slice(0, 5).map(f => path.relative(workDir, f)).join(' ');
            const cmd = deps.eslint
              ? `npx eslint --no-error-on-unmatched-pattern --max-warnings=50 ${fileArgs}`
              : 'npm run lint -- --max-warnings=50 2>&1 || true';
            const result = execSync(cmd, { cwd: workDir, timeout: 15000, stdio: 'pipe', encoding: 'utf8' });
            const output = result.trim();
            if (output && output.length > 10) {
              checks.push({ check: 'lint', status: 'warnings', output: output.slice(0, 1000) });
            } else {
              checks.push({ check: 'lint', status: 'clean' });
            }
          } catch (err) {
            const stderr = err.stderr?.toString() || err.stdout?.toString() || err.message;
            checks.push({ check: 'lint', status: 'errors', output: stderr.slice(0, 1000) });
          }
        }

        // TypeScript check (if tsconfig exists)
        if (fs.existsSync(path.join(workDir, 'tsconfig.json')) && jsFiles.some(f => /\.tsx?$/.test(f))) {
          try {
            const result = execSync('npx tsc --noEmit --pretty false 2>&1 | head -20', {
              cwd: workDir, timeout: 20000, stdio: 'pipe', encoding: 'utf8',
            });
            const output = result.trim();
            if (output && output.includes('error TS')) {
              checks.push({ check: 'typecheck', status: 'errors', output: output.slice(0, 800) });
            } else {
              checks.push({ check: 'typecheck', status: 'clean' });
            }
          } catch (err) {
            const stderr = err.stderr?.toString() || err.stdout?.toString() || '';
            if (stderr.includes('error TS')) {
              checks.push({ check: 'typecheck', status: 'errors', output: stderr.slice(0, 800) });
            }
          }
        }
      }

      // Python: quick syntax check
      if (hasPyproject || codeFiles.some(f => f.endsWith('.py'))) {
        const pyFiles = codeFiles.filter(f => f.endsWith('.py')).slice(0, 5);
        for (const pf of pyFiles) {
          try {
            execSync(`python3 -c "import py_compile; py_compile.compile('${pf}', doraise=True)"`, {
              cwd: workDir, timeout: 5000, stdio: 'pipe',
            });
          } catch (err) {
            checks.push({ check: 'python_syntax', status: 'error', file: path.basename(pf), output: (err.stderr?.toString() || err.message).slice(0, 500) });
          }
        }
      }

      if (checks.length === 0) return null;

      const hasErrors = checks.some(c => c.status === 'errors' || c.status === 'error');
      const summary = checks.map(c => {
        if (c.status === 'clean') return `✓ ${c.check}: clean`;
        return `✗ ${c.check}: ${c.output?.split('\n').slice(0, 3).join(' | ') || c.status}`;
      }).join('\n');

      this.onEvent({
        type: 'thinking',
        data: { thought: `Auto-verification: ${hasErrors ? 'issues found' : 'all clean'}\n${summary}`, round: this.session?.totalRounds || 0 },
      });

      return { checks, hasErrors, summary };
    } catch (err) {
      console.warn('[agent] Auto-verify error:', err.message);
      return null;
    }
  }
}

export function listCheckpoints() {
  return [...CHECKPOINTS.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function restoreCheckpoint(id) {
  const cp = typeof id === 'object' && id !== null
    ? id
    : (id ? CHECKPOINTS.get(id) : listCheckpoints()[0]);
  if (!cp) return { success: false, error: 'No checkpoint found' };
  try {
    if (cp.kind === 'git_stash') {
      execSync(`git stash apply ${cp.ref}`, { cwd: cp.workspace, stdio: 'pipe', timeout: 30000 });
    } else if (cp.kind === 'dir_snapshot') {
      if (!cp.dir || !fs.existsSync(cp.dir)) {
        return { success: false, error: 'Checkpoint snapshot is missing', checkpoint: cp };
      }
      restoreDirectorySnapshot(cp.dir, cp.workspace, cp.workspace);
    }
    return { success: true, checkpoint: cp };
  } catch (err) {
    return { success: false, error: err.message, checkpoint: cp };
  }
}

function restoreDirectorySnapshot(src, dest, root = dest) {
  fs.mkdirSync(dest, { recursive: true });

  const snapshotNames = new Set();
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SNAPSHOT_SKIP.has(entry.name)) continue;
    snapshotNames.add(entry.name);
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(to) && !fs.statSync(to).isDirectory()) {
        fs.rmSync(to, { recursive: true, force: true });
      }
      restoreDirectorySnapshot(from, to, root);
    } else if (entry.isFile()) {
      if (fs.existsSync(to) && fs.statSync(to).isDirectory()) {
        fs.rmSync(to, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }

  for (const entry of fs.readdirSync(dest, { withFileTypes: true })) {
    if (SNAPSHOT_SKIP.has(entry.name)) continue;
    const current = path.join(dest, entry.name);
    const rel = path.relative(root, current);
    if (rel === '.asyncat' || rel.startsWith(`.asyncat${path.sep}snapshots`)) continue;
    if (!snapshotNames.has(entry.name)) {
      fs.rmSync(current, { recursive: true, force: true });
    }
  }
}

export default AgentRuntime;
