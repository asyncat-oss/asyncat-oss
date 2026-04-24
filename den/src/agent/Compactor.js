// den/src/agent/Compactor.js
// ─── Context Compactor ───────────────────────────────────────────────────────
// Keeps the agent's conversation window under a token budget by replacing the
// middle of a long transcript with a structured summary.
//
// Strategy:
//   head  = [ prior conversation history, the original goal ]
//   tail  = [ the last N messages, raw ]
//   middle → collapsed into a single <compacted_history> user message
//            generated mechanically from session.toolHistory (no extra LLM call)
//
// The summary keeps the signal (which tools ran, which files were touched,
// which commands were run, what errors hit) and drops the noise (raw tool
// output, full file contents). A future LLM-backed compactor can drop in
// behind the same interface.

export class Compactor {
  constructor(opts = {}) {
    // Rough token budget before compaction kicks in.
    this.tokenBudget = opts.tokenBudget ?? 12000;
    // How many of the most recent messages to keep raw.
    this.keepLastMessages = opts.keepLastMessages ?? 8;
    // Log a hint in the summary if output was truncated.
    this.maxCommands = opts.maxCommands ?? 8;
    this.maxFiles = opts.maxFiles ?? 14;
    this.maxErrors = opts.maxErrors ?? 5;
    this.maxThoughts = opts.maxThoughts ?? 5;
  }

  estimateTokens(messages) {
    let total = 0;
    for (const m of messages) {
      const len = typeof m?.content === 'string' ? m.content.length : 0;
      total += Math.ceil(len / 4); // 4-char per token heuristic
    }
    return total;
  }

  needsCompaction(messages) {
    return this.estimateTokens(messages) > this.tokenBudget;
  }

  /**
   * Compact `messages` in place.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} session - AgentSession instance (used for structured toolHistory).
   * @param {object} opts
   * @param {number} opts.goalIndex - Index of the original goal user message. Messages at or before this index are never dropped.
   * @returns {{ messages: Array, compacted: boolean, droppedCount: number, tokensBefore: number, tokensAfter: number }}
   */
  compact(messages, session, { goalIndex = 0 } = {}) {
    const tokensBefore = this.estimateTokens(messages);
    if (tokensBefore <= this.tokenBudget) {
      return { messages, compacted: false, droppedCount: 0, tokensBefore, tokensAfter: tokensBefore };
    }

    // If a previous compaction summary exists right after the goal, drop it so
    // we can replace it with a fresh, fuller summary.
    let working = messages;
    const existingIdx = goalIndex + 1;
    const existing = working[existingIdx];
    if (existing?.role === 'user' && typeof existing.content === 'string'
        && existing.content.startsWith('<compacted_history>')) {
      working = [...working.slice(0, existingIdx), ...working.slice(existingIdx + 1)];
    }

    const start = goalIndex + 1;
    const end = Math.max(start, working.length - this.keepLastMessages);
    const droppable = working.slice(start, end);

    if (droppable.length === 0) {
      return { messages, compacted: false, droppedCount: 0, tokensBefore, tokensAfter: tokensBefore };
    }

    const summaryText = this._summarize(droppable, session);
    const summaryMsg = { role: 'user', content: summaryText };
    const next = [...working.slice(0, start), summaryMsg, ...working.slice(end)];

    return {
      messages: next,
      compacted: true,
      droppedCount: droppable.length,
      tokensBefore,
      tokensAfter: this.estimateTokens(next),
    };
  }

  _summarize(droppable, session) {
    const toolCounts = {};
    const errors = [];
    const thoughts = [];
    const filesRead = new Set();
    const filesWritten = new Set();
    const commands = [];
    const answers = [];

    // Walk dropped messages for inline signals — works even without session.toolHistory
    for (const m of droppable) {
      if (!m || typeof m.content !== 'string') continue;

      if (m.role === 'assistant') {
        const thought = m.content.match(/(?:\*\*)?Thought:(?:\*\*)?\s*([\s\S]*?)(?=(?:\*\*)?(?:Action|Answer):(?:\*\*)?|<tool_call>|<think>|$)/i);
        if (thought) {
          const trimmed = thought[1].trim();
          if (trimmed) thoughts.push(trimmed.slice(0, 180));
        }
        const answer = m.content.match(/(?:\*\*)?Answer:(?:\*\*)?\s*([\s\S]+)$/i);
        if (answer) answers.push(answer[1].trim().slice(0, 160));
      }

      if (m.role === 'user' && m.content.includes('<tool_result')) {
        const match = m.content.match(/<tool_result name="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/tool_result>/);
        if (match) {
          const name = match[1];
          toolCounts[name] = (toolCounts[name] || 0) + 1;
          try {
            const body = JSON.parse(match[2]);
            if (body && body.success === false) {
              errors.push(`${name}: ${String(body.error || 'failed').slice(0, 140)}`);
            }
          } catch { /* non-JSON result, ignore */ }
        }
      }
    }

    // Cross-reference with session.toolHistory for richer structure
    const history = Array.isArray(session?.toolHistory) ? session.toolHistory : [];
    for (const h of history) {
      const args = h?.args || {};
      if (h.tool === 'read_file' && args.path) filesRead.add(args.path);
      if ((h.tool === 'write_file' || h.tool === 'edit_file' || h.tool === 'create_file') && args.path) filesWritten.add(args.path);
      if (h.tool === 'run_command' && args.command) commands.push(String(args.command).slice(0, 100));
      if (h.result && h.result.success === false && h.result.error) {
        const line = `${h.tool}: ${String(h.result.error).slice(0, 140)}`;
        if (!errors.includes(line)) errors.push(line);
      }
    }

    const parts = ['<compacted_history>'];
    parts.push(`Earlier in this run ${droppable.length} messages were compacted to save context.`);

    const toolsLine = Object.entries(toolCounts).map(([t, c]) => `${t}×${c}`).join(', ');
    if (toolsLine) parts.push(`Tools used: ${toolsLine}`);

    if (filesRead.size) {
      parts.push(`Files read: ${[...filesRead].slice(-this.maxFiles).join(', ')}`);
    }
    if (filesWritten.size) {
      parts.push(`Files written: ${[...filesWritten].slice(-this.maxFiles).join(', ')}`);
    }
    if (commands.length) {
      parts.push(`Commands run (latest ${this.maxCommands}): ${commands.slice(-this.maxCommands).join(' ; ')}`);
    }
    if (errors.length) {
      parts.push(`Errors hit: ${errors.slice(-this.maxErrors).join(' | ')}`);
    }
    if (thoughts.length) {
      parts.push(`Key thoughts (most recent ${this.maxThoughts}):`);
      for (const t of thoughts.slice(-this.maxThoughts)) {
        parts.push(`  • ${t.replace(/\s+/g, ' ')}`);
      }
    }

    // Plan snapshot — very useful when compacting long runs
    const plan = Array.isArray(session?.plan) ? session.plan : [];
    if (plan.length) {
      parts.push(`Current plan:`);
      for (const item of plan) {
        const mark = item.status === 'completed' ? '✔' : item.status === 'in_progress' ? '◉' : '○';
        parts.push(`  ${mark} ${String(item.content || '').slice(0, 120)}`);
      }
    }

    parts.push(`Continue the task from here. The messages after this block are the most recent raw exchanges.`);
    parts.push('</compacted_history>');
    return parts.join('\n');
  }
}

export default Compactor;
