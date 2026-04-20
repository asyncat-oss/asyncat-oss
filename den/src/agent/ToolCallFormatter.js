// den/src/agent/ToolCallFormatter.js
// ─── Tool Call Format Layer ──────────────────────────────────────────────────
// Normalizes tool call formats across different LLM providers/models.
//
// Different models output tool calls in wildly different formats:
//   • OpenAI/GPT       — native `tool_calls` array in API response
//   • Llama 3.1+       — <|python_tag|> or JSON in <tool_call> tags
//   • Hermes/Nous      — <tool_call> XML-style tags
//   • Qwen 2.5         — <tool_call> JSON blocks or ✿FUNCTION✿ format
//   • DeepSeek         — <｜tool▁call▁begin｜> special tokens
//   • Generic/small    — may just output JSON in plain text
//
// This formatter handles ALL of them and produces a single internal format:
//   { tool_name: string, arguments: object, call_id: string }

import { randomUUID } from 'crypto';

/**
 * Normalised internal tool call format.
 * @typedef {{ tool_name: string, arguments: object, call_id: string }} NormalizedToolCall
 */

// ── Regex patterns for different model formats ──────────────────────────────

// Llama 3.1 / Hermes / generic XML-style
const TOOL_CALL_XML_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;

// Qwen function calling format
const QWEN_FUNC_RE    = /✿FUNCTION✿:\s*(\w+)\s*\n✿ARGS✿:\s*([\s\S]*?)(?=✿FUNCTION✿|$)/gi;

// DeepSeek special tokens
const DEEPSEEK_RE     = /<｜tool▁call▁begin｜>\s*(\w+)\s*\n([\s\S]*?)<｜tool▁call▁end｜>/gi;

// Generic JSON function call pattern (fallback)
const JSON_FUNC_RE    = /\{\s*"(?:name|function|tool_name|tool)":\s*"(\w+)"\s*,\s*"(?:arguments|args|parameters|params)":\s*(\{[\s\S]*?\})\s*\}/gi;

// Llama 3.1 python tag style
const PYTHON_TAG_RE   = /<\|python_tag\|>([\s\S]*?)(?:<\|\/python_tag\|>|<\|eom_id\|>|$)/gi;

// Simple function() call style some models use
const FUNC_CALL_RE    = /(\w+)\(([\s\S]*?)\)(?:\s*;?\s*$)/gm;


export class ToolCallFormatter {
  /**
   * Parse tool calls from model output text.
   * Tries multiple format detectors in priority order.
   *
   * @param {string} text - Raw model output text
   * @param {object} [apiToolCalls] - Native API tool_calls (from OpenAI-compat response)
   * @param {string[]} [knownToolNames] - List of registered tool names to validate against
   * @returns {NormalizedToolCall[]}
   */
  static parseToolCalls(text, apiToolCalls = null, knownToolNames = []) {
    const knownSet = new Set(knownToolNames);

    // 1. Native API tool calls (OpenAI, Ollama with tool support)
    if (apiToolCalls && apiToolCalls.length > 0) {
      return apiToolCalls.map(tc => {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        return {
          tool_name: tc.function?.name || 'unknown',
          arguments: args,
          call_id: tc.id || `tc_${randomUUID().slice(0, 8)}`,
        };
      }).filter(tc => tc.tool_name);
    }

    if (!text || typeof text !== 'string') return [];

    // 2. <tool_call> XML tags (Hermes, Llama 3.1, Qwen)
    let calls = this._parseXmlToolCalls(text, knownSet);
    if (calls.length > 0) return calls;

    // 3. Qwen ✿FUNCTION✿ format
    calls = this._parseQwenFormat(text, knownSet);
    if (calls.length > 0) return calls;

    // 4. DeepSeek special tokens
    calls = this._parseDeepSeekFormat(text, knownSet);
    if (calls.length > 0) return calls;

    // 5. Llama 3.1 <|python_tag|>
    calls = this._parsePythonTag(text, knownSet);
    if (calls.length > 0) return calls;

    // 6. Generic JSON pattern in text
    calls = this._parseGenericJson(text, knownSet);
    if (calls.length > 0) return calls;

    return [];
  }

  /**
   * Check if text contains any tool call patterns (quick check before full parse).
   */
  static hasToolCalls(text, apiToolCalls = null) {
    if (apiToolCalls && apiToolCalls.length > 0) return true;
    if (!text) return false;

    return (
      TOOL_CALL_XML_RE.test(text) ||
      QWEN_FUNC_RE.test(text) ||
      DEEPSEEK_RE.test(text) ||
      PYTHON_TAG_RE.test(text) ||
      // Only check JSON pattern if it looks like it could be a tool call
      (text.includes('"name"') && text.includes('"arguments"'))
    );
  }

  /**
   * Format tool definitions for injection into a system prompt.
   * Produces a format that works across most models.
   *
   * @param {Array} tools - Array of tool definition objects
   * @returns {string} Formatted tool descriptions for system prompt
   */
  static formatToolsForPrompt(tools) {
    if (!tools || tools.length === 0) return '';

    const lines = [
      '',
      '# Available Tools',
      '',
      'You can call tools by outputting a tool call in this format:',
      '',
      '<tool_call>',
      '{"name": "tool_name", "arguments": {"param1": "value1"}}',
      '</tool_call>',
      '',
      'You may call multiple tools in sequence. After each tool call, you will receive the result.',
      'Always wait for tool results before proceeding.',
      '',
      '## Tool Definitions',
      '',
    ];

    for (const tool of tools) {
      const fn = tool.function || tool;
      lines.push(`### ${fn.name}`);
      lines.push(fn.description || '');

      if (fn.parameters?.properties) {
        lines.push('**Parameters:**');
        const props = fn.parameters.properties;
        const required = new Set(fn.parameters.required || []);

        for (const [name, prop] of Object.entries(props)) {
          const req = required.has(name) ? ' (required)' : ' (optional)';
          const enumVals = prop.enum ? ` — one of: ${prop.enum.join(', ')}` : '';
          lines.push(`- \`${name}\` (${prop.type}${req}): ${prop.description || ''}${enumVals}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format a tool result for injection back into the conversation.
   *
   * @param {string} toolName
   * @param {string} callId
   * @param {object} result
   * @returns {string}
   */
  static formatToolResult(toolName, callId, result) {
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return `<tool_result name="${toolName}" call_id="${callId}">\n${resultStr}\n</tool_result>`;
  }

  /**
   * Build OpenAI-format tools array from our internal tool definitions.
   */
  static toOpenAITools(tools) {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.function?.name || t.name,
        description: t.function?.description || t.description,
        parameters: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
      }
    }));
  }

  // ── Internal parsers ────────────────────────────────────────────────────────

  static _parseXmlToolCalls(text, knownSet) {
    // Reset regex state
    TOOL_CALL_XML_RE.lastIndex = 0;
    const calls = [];
    let match;

    while ((match = TOOL_CALL_XML_RE.exec(text)) !== null) {
      try {
        const content = match[1].trim();
        const parsed = JSON.parse(content);
        const name = parsed.name || parsed.function || parsed.tool_name || parsed.tool;
        const args = parsed.arguments || parsed.args || parsed.parameters || parsed.params || {};

        if (name) {
          calls.push({
            tool_name: name,
            arguments: typeof args === 'string' ? JSON.parse(args) : args,
            call_id: `tc_${randomUUID().slice(0, 8)}`,
          });
        }
      } catch {
        // Try key=value format inside XML tags
        const nameMatch = content.match(/(?:name|function)\s*[:=]\s*["']?(\w+)["']?/i);
        if (nameMatch) {
          const argsMatch = content.match(/(?:arguments|args)\s*[:=]\s*(\{[\s\S]*\})/i);
          let args = {};
          try { args = JSON.parse(argsMatch?.[1] || '{}'); } catch {}
          const name = nameMatch[1];
          if (name) {
            calls.push({
              tool_name: name,
              arguments: args,
              call_id: `tc_${randomUUID().slice(0, 8)}`,
            });
          }
        }
      }
    }

    return calls;
  }

  static _parseQwenFormat(text, knownSet) {
    QWEN_FUNC_RE.lastIndex = 0;
    const calls = [];
    let match;

    while ((match = QWEN_FUNC_RE.exec(text)) !== null) {
      const name = match[1].trim();
      let args = {};
      try { args = JSON.parse(match[2].trim()); } catch {}

      if (name) {
        calls.push({
          tool_name: name,
          arguments: args,
          call_id: `tc_${randomUUID().slice(0, 8)}`,
        });
      }
    }

    return calls;
  }

  static _parseDeepSeekFormat(text, knownSet) {
    DEEPSEEK_RE.lastIndex = 0;
    const calls = [];
    let match;

    while ((match = DEEPSEEK_RE.exec(text)) !== null) {
      const name = match[1].trim();
      let args = {};
      try { args = JSON.parse(match[2].trim()); } catch {}

      if (name) {
        calls.push({
          tool_name: name,
          arguments: args,
          call_id: `tc_${randomUUID().slice(0, 8)}`,
        });
      }
    }

    return calls;
  }

  static _parsePythonTag(text, knownSet) {
    PYTHON_TAG_RE.lastIndex = 0;
    const calls = [];
    let match;

    while ((match = PYTHON_TAG_RE.exec(text)) !== null) {
      try {
        const content = match[1].trim();
        // Llama sometimes wraps in a function call style
        const funcMatch = content.match(/(\w+)\.call\(([\s\S]*)\)/);
        if (funcMatch) {
          const name = funcMatch[1];
          let args = {};
          try { args = JSON.parse(funcMatch[2]); } catch {}
          if (name) {
            calls.push({ tool_name: name, arguments: args, call_id: `tc_${randomUUID().slice(0, 8)}` });
          }
          continue;
        }

        // Try parsing as JSON directly
        const parsed = JSON.parse(content);
        if (parsed.name) {
          const name = parsed.name;
          const args = parsed.arguments || parsed.parameters || {};
          if (name) {
            calls.push({
              tool_name: name,
              arguments: typeof args === 'string' ? JSON.parse(args) : args,
              call_id: `tc_${randomUUID().slice(0, 8)}`,
            });
          }
        }
      } catch { /* not parseable */ }
    }

    return calls;
  }

  static _parseGenericJson(text, knownSet) {
    JSON_FUNC_RE.lastIndex = 0;
    const calls = [];
    let match;

    while ((match = JSON_FUNC_RE.exec(text)) !== null) {
      const name = match[1];
      let args = {};
      try { args = JSON.parse(match[2]); } catch {}

      if (name) {
        calls.push({
          tool_name: name,
          arguments: args,
          call_id: `tc_${randomUUID().slice(0, 8)}`,
        });
      }
    }

    return calls;
  }
}

export default ToolCallFormatter;
