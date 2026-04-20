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
import { buildAgentSystemPrompt } from './prompts/agentSystemPrompt.js';
import db from '../db/client.js';

const MAX_ROUNDS_DEFAULT = 25;

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
   * @param {string} opts.userId
   * @param {string} opts.workspaceId
   * @param {string} opts.workingDir - Working directory for file/shell tools
   * @param {number} [opts.maxRounds] - Max ReAct iterations
   * @param {(event: AgentEvent) => void} [opts.onEvent] - Event callback for streaming
   */
  constructor(opts) {
    this.aiClient = opts.aiClient;
    this.model = opts.model;
    this.isLocal = opts.isLocal || false;
    this.userId = opts.userId;
    this.workspaceId = opts.workspaceId;
    this.workingDir = opts.workingDir || process.cwd();
    this.maxRounds = opts.maxRounds || MAX_ROUNDS_DEFAULT;
    this.onEvent = opts.onEvent || (() => {});
    this.session = null;
  }

  /**
   * Run the agent to completion on a given goal.
   *
   * @param {string} goal - The user's request/goal
   * @param {object[]} [conversationHistory] - Previous conversation messages
   * @returns {Promise<{answer: string, session: AgentSession, toolCalls: Array}>}
   */
  async run(goal, conversationHistory = []) {
    // Create session
    this.session = new AgentSession({
      userId: this.userId,
      workspaceId: this.workspaceId,
      goal,
      workingDir: this.workingDir,
    });

    // Load relevant memories
    const memories = this._loadMemories(goal);

    // Build system prompt
    const toolDefs = toolRegistry.all();
    const toolDescriptions = ToolCallFormatter.formatToolsForPrompt(
      toolDefs.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
    );

    const systemPrompt = buildAgentSystemPrompt({
      goal,
      workingDir: this.workingDir,
      toolDescriptions,
      memories,
      scratchpad: '',
    });

    // Build conversation thread (filter out UI system messages)
    const validHistory = conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant');
    const messages = [
      ...validHistory.slice(-4).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: goal },
    ];

    const toolContext = {
      userId: this.userId,
      workspaceId: this.workspaceId,
      workingDir: this.workingDir,
    };

    const knownTools = toolRegistry.names();

    // ── ReAct Loop ──────────────────────────────────────────────────────────
    let answer = null;

    for (let round = 0; round < this.maxRounds; round++) {
      this.session.nextRound();

      // Call the LLM
      let responseText = '';
      let apiToolCalls = null;

      try {
        const result = await this._callLLM(systemPrompt, messages);
        responseText = result.text;
        apiToolCalls = result.toolCalls;
      } catch (err) {
        this.onEvent({ type: 'error', data: { message: `LLM call failed: ${err.message}`, round } });
        this.session.fail(err.message);
        return { answer: `Error: ${err.message}`, session: this.session, toolCalls: this.session.toolHistory };
      }

      // Add assistant response to thread
      messages.push({ role: 'assistant', content: responseText });

      // Parse for tool calls (handles all model formats)
      const toolCalls = ToolCallFormatter.parseToolCalls(responseText, apiToolCalls, knownTools);

      // Extract thinking/answer from text
      const { thinking, finalAnswer } = this._parseResponse(responseText);

      if (thinking) {
        this.onEvent({ type: 'thinking', data: { thought: thinking, round } });
      }

      // If model returned a final answer (no tool calls)
      if (finalAnswer && toolCalls.length === 0) {
        answer = finalAnswer;
        this.onEvent({ type: 'answer', data: { answer, round } });
        break;
      }

      // If no tool calls and no explicit answer, treat entire response as answer
      if (toolCalls.length === 0) {
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

      // Execute tool calls (one at a time for safety)
      for (const tc of toolCalls) {
        // Permission check
        const permission = toolRegistry.getPermission(tc.tool_name);
        const actionDesc = PermissionManager.describeAction(tc.tool_name, tc.arguments);

        this.onEvent({ type: 'tool_start', data: { tool: tc.tool_name, args: tc.arguments, permission, description: actionDesc, round } });

        const permResult = await permissionManager.check(tc.tool_name, tc.arguments, permission);

        if (!permResult.allowed) {
          const deniedResult = { success: false, error: `Permission denied: ${permResult.reason}` };
          this.session.recordToolCall(tc.tool_name, tc.arguments, deniedResult);
          this.onEvent({ type: 'tool_result', data: { tool: tc.tool_name, result: deniedResult, round } });

          // Feed denial back to LLM
          const resultStr = ToolCallFormatter.formatToolResult(tc.tool_name, tc.call_id, deniedResult);
          messages.push({ role: 'user', content: resultStr });
          continue;
        }

        // Execute
        const result = await toolRegistry.execute(tc.tool_name, tc.arguments, toolContext);
        this.session.recordToolCall(tc.tool_name, tc.arguments, result);
        this.onEvent({ type: 'tool_result', data: { tool: tc.tool_name, result, round } });

        // Feed result back to LLM
        const resultStr = ToolCallFormatter.formatToolResult(tc.tool_name, tc.call_id, result);
        messages.push({ role: 'user', content: resultStr });
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
    this.session.complete();
    return { answer, session: this.session, toolCalls: this.session.toolHistory };
  }

  /**
   * Run the agent with SSE streaming (for API endpoint).
   */
  async runStreaming(goal, conversationHistory, res) {
    const originalOnEvent = this.onEvent;

    this.onEvent = (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {}
      originalOnEvent(event);
    };

    const result = await this.run(goal, conversationHistory);

    res.write(`data: ${JSON.stringify({ type: 'done', data: { answer: result.answer, sessionId: result.session.id, rounds: result.session.totalRounds } })}\n\n`);
    res.end();

    return result;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  async _callLLM(systemPrompt, messages) {
    const useNativeTools = !this.isLocal;

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

  _loadMemories(goal) {
    try {
      // Load all memories for this workspace (they're small, load all)
      const rows = db.prepare(
        'SELECT key, content, memory_type FROM agent_memory WHERE user_id = ? AND workspace_id = ? ORDER BY updated_at DESC LIMIT 20'
      ).all(this.userId, this.workspaceId);
      return rows || [];
    } catch {
      return [];
    }
  }
}

export default AgentRuntime;
