#!/usr/bin/env node
// claudeApprovalMcp.js — a one-tool MCP server Claude Code asks before acting.
//
// Claude Code started with `--permission-prompt-tool mcp__asyncat__approve`
// calls this server's `approve` tool whenever it needs permission (for example
// to run a shell command in Action mode). The server forwards the request to
// the Asyncat backend, which shows the usual approval card in the chat, and
// returns the user's answer in the shape Claude Code expects:
//   { "behavior": "allow", "updatedInput": {...} } or { "behavior": "deny", "message": "..." }
//
// Started by Claude Code over stdio with ASYNCAT_APPROVAL_URL and
// ASYNCAT_APPROVAL_TOKEN in its environment. No dependencies on purpose.

const url = process.env.ASYNCAT_APPROVAL_URL;
const token = process.env.ASYNCAT_APPROVAL_TOKEN;

const TOOL = {
  name: 'approve',
  description: 'Ask the Asyncat user to approve or deny a tool call.',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string' },
      input: { type: 'object' },
      tool_use_id: { type: 'string' },
    },
    required: ['tool_name', 'input'],
  },
};

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

async function decide(args = {}) {
  const deny = (message) => ({ behavior: 'deny', message });
  if (!url || !token) return deny('Asyncat could not ask for approval.');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Asyncat-Approval-Token': token },
      body: JSON.stringify({ toolName: args.tool_name, input: args.input || {}, toolUseId: args.tool_use_id || null }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) return deny('Asyncat could not ask for approval.');
    if (body.behavior === 'allow') return { behavior: 'allow', updatedInput: args.input || {} };
    return deny(body.message || 'The user declined this action.');
  } catch {
    return deny('Asyncat could not ask for approval.');
  }
}

async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return; // notifications need no reply
  if (method === 'initialize') {
    send({
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'asyncat', version: '1.0.0' },
      },
    });
  } else if (method === 'tools/list') {
    send({ id, result: { tools: [TOOL] } });
  } else if (method === 'tools/call') {
    if (params?.name !== TOOL.name) {
      send({ id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
      return;
    }
    const decision = await decide(params.arguments);
    send({ id, result: { content: [{ type: 'text', text: JSON.stringify(decision) }] } });
  } else if (method === 'ping') {
    send({ id, result: {} });
  } else {
    send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    handle(message).catch((err) => {
      if (message?.id != null) send({ id: message.id, error: { code: -32603, message: err.message } });
    });
  }
});
process.stdin.on('end', () => process.exit(0));
