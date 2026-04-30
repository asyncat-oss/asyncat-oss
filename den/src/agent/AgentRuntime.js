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
import { findRelevantSkills } from './skills.js';
import { listMemories, searchMemories } from './tools/memoryTools.js';
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
    this.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    // Local models handle much smaller contexts than cloud models — compact sooner.
    const defaultBudget = this.isLocal ? 6000 : 24000;
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

    // Load or create session
    if (this.continueSessionId) {
      this.session = AgentSession.load(this.continueSessionId);
      if (this.session && this.session.userId === this.userId) {
        // Reuse existing session — update goal and reset to active
        this.session.goal = goal;
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
    });
    this.session.save();

    this.onEvent({
      type: 'session_start',
      data: {
        sessionId: this.session.id,
        goal,
        status: this.session.status,
        continued: Boolean(this.continueSessionId),
      },
    });

    // Load relevant memories
    const memories = this._loadMemories(goal);

    // Build system prompt
    const toolDefs = toolRegistry.all();
    const toolDescriptions = ToolCallFormatter.formatToolsForPrompt(
      toolDefs.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
    );

    // Get relevant skills based on the goal (Cerebellum)
    const relevantSkills = findRelevantSkills(goal);

    if (relevantSkills.length > 0) {
      this.onEvent({
        type: 'skills_loaded',
        data: {
          skills: relevantSkills.map(s => ({
            name: s.name,
            description: s.description || '',
            tags: Array.isArray(s.tags) ? s.tags : [],
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
      soul,
    });

    // Build conversation thread (filter out UI system messages)
    const validHistory = conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant');
    const historyPrefix = validHistory.slice(-4).map(m => ({ role: m.role, content: m.content }));
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
      askUser: this.askUser
        ? (request) => this.askUser({ ...request, round: this.session?.totalRounds || 0 })
        : null,
    };

    const knownTools = toolRegistry.names();

    // ── ReAct Loop ──────────────────────────────────────────────────────────
    let answer = null;
    let formatRepairAttempts = 0;
    const argumentRepairAttempts = new Map();
    let lastToolSig = null;
    let consecutiveDupCount = 0;
    // Track how many times each tool has been called regardless of args — catches
    // loops where the model varies args slightly to evade the consecutive-dup guard.
    const toolCallCount = new Map();

    for (let round = 0; round < this.maxRounds; round++) {
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

      // Call the LLM
      let responseText = '';
      let apiToolCalls = null;

      try {
        const promptTokens = this._estimateTokens(systemPrompt) + this._estimateTokens(JSON.stringify(messages));
        const result = await this._callLLM(systemPrompt, messages);
        responseText = result.text;
        apiToolCalls = result.toolCalls;
        const inputTokens = result.usage?.prompt_tokens || promptTokens;
        const outputTokens = result.usage?.completion_tokens || this._estimateTokens(responseText);
        this.usage.inputTokens += inputTokens;
        this.usage.outputTokens += outputTokens;
        this.usage.totalTokens = this.usage.inputTokens + this.usage.outputTokens;
        this.onEvent({
          type: 'usage_update',
          data: { ...this.usage, round, model: this.model, isLocal: this.isLocal },
        });
      } catch (err) {
        this.onEvent({ type: 'error', data: { message: `LLM call failed: ${err.message}`, round } });
        this.session.fail(err.message);
        return { answer: `Error: ${err.message}`, session: this.session, toolCalls: this.session.toolHistory };
      }

      // Add assistant response to thread. Native tool-calling providers expect
      // the assistant tool_call message followed by role=tool result messages.
      const nativeToolCallsForThread = Array.isArray(apiToolCalls) && apiToolCalls.length > 0
        ? apiToolCalls
        : null;
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
      const { thinking, finalAnswer } = this._parseResponse(responseText);

      if (thinking) {
        reasoningEvents.push({ thought: thinking, round, timestamp: new Date().toISOString() });
        this.onEvent({ type: 'thinking', data: { thought: thinking, round } });
      }

      // If model returned a final answer (no tool calls)
      if (finalAnswer && toolCalls.length === 0) {
        answer = finalAnswer;
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
          answer = responseText
            .replace(/(?:\*\*)?Thought:(?:\*\*)?[\s\S]*?(?=(?:\*\*)?(?:Action|Answer):(?:\*\*)?|<tool_call>|<think>|$)/i, '')
            .replace(/(?:\*\*)?Action:(?:\*\*)?\s*/i, '')
            .trim();
          if (!answer) answer = responseText; // fallback if stripping removes everything
        }
        this.onEvent({ type: 'answer', data: { answer, round } });
        break;
      }

      // Permission checks — always sequential (may need interactive prompts)
      const permitted = [];
      let repairRequested = false;
      for (const tc of toolCalls) {
        if (!toolRegistry.has(tc.tool_name)) {
          const unknownResult = {
            success: false,
            error: `Unknown tool: "${tc.tool_name}"`,
          };
          this.onEvent({
            type: 'tool_start',
            data: {
              tool: tc.tool_name,
              args: tc.arguments,
              permission: 'none',
              permissionDecision: 'not_applicable',
              permissionReason: 'Unknown tool; not sent for approval',
              workingDir: this.workingDir,
              description: `Unknown tool: ${tc.tool_name}`,
              round,
            }
          });
          this.session.recordToolCall(tc.tool_name, tc.arguments, unknownResult, {
            permissionLevel: 'none',
            permissionDecision: 'not_applicable',
            permissionReason: 'Unknown tool; not sent for approval',
            workingDir: this.workingDir,
            startedAt: new Date().toISOString(),
          });
          this.onEvent({ type: 'tool_result', data: { tool: tc.tool_name, result: unknownResult, round } });
          messages.push(this._toolResultMessage(tc, unknownResult, Boolean(nativeToolCallsForThread)));
          continue;
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
          if (repairs < 2) {
            argumentRepairAttempts.set(repairKey, repairs + 1);
            messages.push({ role: 'user', content: repairPrompt });
            const thought = `The ${tc.tool_name} tool call had invalid arguments. Asking the model to emit corrected arguments.`;
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
        const execResults = await Promise.all(
          permitted.map(({ toolCall }) =>
            toolRegistry.execute(toolCall.tool_name, toolCall.arguments, toolContext)
              .catch(err => ({ success: false, error: err.message || String(err) }))
          )
        );
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

          // Detect infinite loops: same tool + same args called 3 times consecutively.
          const sig = `${tc.tool_name}:${JSON.stringify(tc.arguments)}`;
          if (sig === lastToolSig) {
            consecutiveDupCount++;
            if (consecutiveDupCount >= 2) {
              const repeatedToolThought = `Detected repeated tool call (${tc.tool_name}) — stopping loop.`;
              reasoningEvents.push({ thought: repeatedToolThought, round, timestamp: new Date().toISOString() });
              this.onEvent({ type: 'thinking', data: { thought: repeatedToolThought, round } });
              answer = this._formatRepeatedToolAnswer(tc, result);
              this.onEvent({ type: 'answer', data: { answer, round } });
              break;
            }
          } else {
            lastToolSig = sig;
            consecutiveDupCount = 0;
          }

          // Also catch loops where the model varies args slightly — if the same tool
          // name has been called 4+ times total, it's stuck regardless of arg differences.
          const totalCalls = (toolCallCount.get(tc.tool_name) || 0) + 1;
          toolCallCount.set(tc.tool_name, totalCalls);
          const toolLimit = tc.tool_name === 'list_directory' || tc.tool_name === 'read_file' ? 4 : 6;
          if (totalCalls > toolLimit) {
            const stuckThought = `Tool \`${tc.tool_name}\` called ${totalCalls} times total — likely stuck. Stopping.`;
            reasoningEvents.push({ thought: stuckThought, round, timestamp: new Date().toISOString() });
            this.onEvent({ type: 'thinking', data: { thought: stuckThought, round } });
            answer = this._formatRepeatedToolAnswer(tc, result);
            this.onEvent({ type: 'answer', data: { answer, round } });
            break;
          }
        }
        if (answer) break;
      }

      // Save session periodically
      if (round % 3 === 0) this.session.save();
    }

    // If we exhausted all rounds without an answer
    if (!answer) {
      answer = 'I reached the maximum number of steps. Here is what I accomplished:\n\n' +
        this.session.toolHistory.map(t => `- ${t.tool}: ${t.result?.message || (t.result?.success ? 'success' : 'failed')}`).join('\n');
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

    return { answer, session: this.session, toolCalls: this.session.toolHistory };
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
        sessionId: result.session.id,
        rounds: result.session.totalRounds,
        conversationRounds: result.session.scratchpad.conversationRounds || []
      }
    });
    res.end();

    return result;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  async _checkPermission({ toolCall, permission, actionDesc, round }) {
    if (permission === 'safe') {
      return { allowed: true, decision: 'auto_safe' };
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
  async _callLLM(systemPrompt, messages) {
    const useNativeTools = this.supportsNativeTools;

    const params = {
      model: this.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: this.isLocal ? 2048 : 4096,
      stream: true,
    };

    // For cloud models with native tool support, pass tool definitions via API
    if (useNativeTools) {
      params.tools = toolRegistry.toOpenAIFormat();
      params.tool_choice = 'auto';
      params.max_completion_tokens = params.max_tokens;
      delete params.max_tokens;
    }

    const stream = await this.aiClient.client.chat.completions.create(params);
    let fullText = '';
    const toolCalls = {};
    let finishReason = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      
      finishReason = chunk.choices[0]?.finish_reason || finishReason;

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
          if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
        }
      }
    }

    const apiToolCalls = Object.values(toolCalls).length > 0 ? Object.values(toolCalls) : null;

    return {
      text: fullText,
      toolCalls: apiToolCalls,
      finishReason: finishReason,
    };
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

  _estimateTokens(value) {
    return Math.ceil(String(value || '').length / 4);
  }

  _effectivePermission(toolName, args = {}, fallbackPermission = 'dangerous') {
    if (toolName === 'run_command' && this._looksReadOnlyShellCommand(args.command || '')) {
      return 'safe';
    }
    return fallbackPermission;
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

  _parseResponse(text) {
    let thinking = null;
    let finalAnswer = null;

    // 1. DeepSeek format: <think>...</think>
    const thinkTagMatch = text.match(/<think>\s*([\s\S]*?)\s*<\/think>/i);
    if (thinkTagMatch) {
      thinking = thinkTagMatch[1].trim();
    }

    // 2. Markdown format: **Thought:** ...
    const thoughtMatch = text.match(/(?:\*\*)?Thought:(?:\*\*)?\s*([\s\S]*?)(?=(?:\*\*)?(?:Action|Answer):(?:\*\*)?|<tool_call>|<think>|$)/i);
    if (thoughtMatch && !thinking) {
      thinking = thoughtMatch[1].trim();
    }

    // Extract Answer: section (signals task completion)
    const answerMatch = text.match(/(?:\*\*)?Answer:(?:\*\*)?\s*([\s\S]*?)$/i);
    if (answerMatch) finalAnswer = answerMatch[1].trim();

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

    return [
      `You called \`${toolCall.tool_name}\` with invalid arguments, so Asyncat did not execute it.`,
      missing,
      invalid,
      required.length ? `Required fields: ${required.map(k => `\`${k}\``).join(', ')}.` : '',
      `Relevant schema: ${JSON.stringify(schema).slice(0, 1800)}`,
      '',
      'Emit exactly one corrected machine-readable tool call for the same next step, with no extra prose.',
      '<tool_call>',
      `{"name": "${toolCall.tool_name}", "arguments": {}}`,
      '</tool_call>',
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
