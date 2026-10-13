// A small Agent Client Protocol agent for tests (den's ACP tests and the
// e2e smoke test). It speaks JSON-RPC over stdin/stdout like a real one:
// streams thoughts, a plan and text, asks permission before writing a file
// and writes it through the client, and supports resume and cancel.
//
// What it does depends on the message: "write" asks to write notes.md;
// "escape" tries to read a file outside the folder; "slow" waits to be
// cancelled; anything else just answers.

import path from 'node:path';
import readline from 'node:readline';

let nextId = 1;
const pending = new Map();
const sessions = new Map(); // sessionId → { cwd, mode, cancelled }

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

function request(method, params) {
  const id = nextId;
  nextId += 1;
  send({ id, method, params });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function update(sessionId, update) {
  send({ method: 'session/update', params: { sessionId, update } });
}

function say(sessionId, text) {
  update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
}

const MODES = { availableModes: [{ id: 'code', name: 'Code' }, { id: 'plan', name: 'Plan' }], currentModeId: 'code' };

async function prompt({ sessionId, prompt: blocks }) {
  const session = sessions.get(sessionId);
  const text = (blocks || []).map((block) => block.text || '').join(' ');
  update(sessionId, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Thinking it over.' } });
  update(sessionId, {
    sessionUpdate: 'plan',
    entries: [
      { content: 'Read the request', priority: 'high', status: 'completed' },
      { content: 'Do it', priority: 'medium', status: 'in_progress' },
    ],
  });

  if (/slow/i.test(text)) {
    say(sessionId, 'Working slowly…');
    await new Promise((resolve) => {
      const timer = setInterval(() => { if (session.cancelled) { clearInterval(timer); resolve(); } }, 20);
    });
    return { stopReason: 'cancelled' };
  }

  if (/escape/i.test(text)) {
    try {
      await request('fs/read_text_file', { sessionId, path: path.resolve(session.cwd, '..', 'outside.txt') });
      say(sessionId, 'I read a file outside the folder.');
    } catch (err) {
      say(sessionId, `Refused: ${err.message}`);
    }
    return { stopReason: 'end_turn' };
  }

  if (/write/i.test(text)) {
    const file = path.join(session.cwd, 'notes.md');
    const toolCallId = 'call_write';
    update(sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId,
      title: 'Write notes.md',
      kind: 'edit',
      status: 'pending',
      locations: [{ path: file }],
      content: [{ type: 'diff', path: file, oldText: '', newText: 'hello from acp' }],
      rawInput: { path: file },
    });
    const answer = await request('session/request_permission', {
      sessionId,
      toolCall: { toolCallId, title: 'Write notes.md', kind: 'edit', content: [{ type: 'diff', path: file, oldText: '', newText: 'hello from acp' }] },
      options: [
        { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
        { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
        { optionId: 'no', name: 'Reject', kind: 'reject_once' },
      ],
    });
    const allowed = answer?.outcome?.outcome === 'selected' && answer.outcome.optionId !== 'no';
    if (!allowed) {
      update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'Not allowed.' } }] });
      say(sessionId, 'You said no, so I left it.');
      return { stopReason: 'end_turn' };
    }
    try {
      await request('fs/write_text_file', { sessionId, path: file, content: 'hello from acp' });
      const back = await request('fs/read_text_file', { sessionId, path: file });
      update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed', content: [{ type: 'content', content: { type: 'text', text: `Wrote: ${back.content}` } }] });
      say(sessionId, 'I wrote notes.md.');
    } catch (err) {
      update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'failed', content: [{ type: 'content', content: { type: 'text', text: err.message } }] });
      say(sessionId, `Couldn't write: ${err.message}`);
    }
    return { stopReason: 'end_turn' };
  }

  say(sessionId, `Hello from the fake agent (mode: ${session.mode}). `);
  say(sessionId, `You said: ${text.slice(-200)}`);
  return { stopReason: 'end_turn' };
}

const handlers = {
  initialize: () => ({
    protocolVersion: 1,
    agentCapabilities: { loadSession: true, promptCapabilities: { image: false, audio: false, embeddedContext: false } },
    agentInfo: { name: 'fake-acp', version: '1.0.0' },
    authMethods: [],
  }),
  'session/new': ({ cwd }) => {
    const sessionId = `sess_${Math.random().toString(36).slice(2, 10)}`;
    sessions.set(sessionId, { cwd, mode: 'code', cancelled: false });
    return { sessionId, modes: MODES };
  },
  'session/load': ({ sessionId, cwd }) => {
    sessions.set(sessionId, { cwd, mode: 'code', cancelled: false });
    // Loading replays the conversation so far.
    say(sessionId, '(replayed earlier answer)');
    return { modes: MODES };
  },
  'session/set_mode': ({ sessionId, modeId }) => {
    sessions.get(sessionId).mode = modeId;
    return {};
  },
  'session/prompt': prompt,
};

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id !== undefined && !message.method) {
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter?.reject(new Error(message.error.message));
    else waiter?.resolve(message.result);
    return;
  }
  if (message.method === 'session/cancel') {
    const session = sessions.get(message.params?.sessionId);
    if (session) session.cancelled = true;
    return;
  }
  const handler = handlers[message.method];
  if (!handler) {
    send({ id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
    return;
  }
  try {
    send({ id: message.id, result: await handler(message.params || {}) });
  } catch (err) {
    send({ id: message.id, error: { code: -32603, message: err.message } });
  }
});
