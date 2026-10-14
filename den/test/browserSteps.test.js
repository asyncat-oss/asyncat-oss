import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Browser steps act on the agent's one tab, so the ones a model asks for in
// one turn run in the order it gave them, not side by side like other
// reads; and a page read by its address never moves that tab.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-browser-steps-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');
process.env.ASYNCAT_HOST_TOKEN = 'test-host-token';

const { default: db } = await import('../src/db/client.js');
const { initializeAgent } = await import('../src/agent/index.js');
const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');
const { useHeadlessBrowser } = await import('../src/agent/browserCommandQueue.js');

await initializeAgent();

test.after(() => {
  useHeadlessBrowser(null);
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const call = (name, args) => `<tool_call>\n${JSON.stringify({ name, arguments: args })}\n</tool_call>`;

/**
 * A stand-in for the headless browser with one tab, run without a queue of
 * its own, so steps that arrive side by side really overlap. Pages load
 * slowly; the first one asked for, slowest.
 */
function oneTabBrowser() {
  const log = [];
  let tab = null;
  const load = (url) => sleep(url.endsWith('/pears') ? 300 : 100);
  return {
    log,
    command: async (action, params) => {
      log.push(params.url ? `${action} ${new URL(params.url).pathname}` : action);
      if (action === 'navigate') {
        await load(params.url);
        tab = params.url;
        return { success: true, url: tab };
      }
      if (action === 'read_page') {
        await load(params.url);
        return { success: true, url: params.url, text: `Text of ${new URL(params.url).pathname}` };
      }
      if (!tab) return { success: false, error: 'No page is open in the browser. Open one with preview_navigate first.' };
      return { success: true, url: tab, text: `Text of ${new URL(tab).pathname}` };
    },
  };
}

/** Run one turn of tool calls with a scripted model; returns the tool results by call. */
async function runTurn(calls) {
  const turns = [`**Thought:** Look at the pages.\n${calls.map(([name, args]) => call(name, args)).join('\n')}`, '**Answer:** Done.'];
  let turn = 0;
  const create = async (params) => {
    if (!params.stream) return { choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] };
    const text = turns[Math.min(turn++, turns.length - 1)];
    return (async function* stream() {
      yield { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] };
      yield { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
    })();
  };
  const events = [];
  const dir = fs.mkdtempSync(path.join(scratch, 'ws-'));
  const runtime = new AgentRuntime({
    aiClient: { client: { chat: { completions: { create } } } },
    model: 'demo-model',
    supportsNativeTools: false,
    workingDir: dir,
    workspaceRoot: dir,
    autoApprove: true,
    ephemeral: true,
    conversationId: `chat-${randomUUID()}`,
    onEvent: (event) => events.push(event),
  });
  await runtime.run('Read the fruit pages.', []);
  return events.filter((event) => event.type === 'tool_result').map((event) => ({ tool: event.data.tool, ...event.data.result }));
}

test('a page opened and read in one turn is opened first', async () => {
  const browser = oneTabBrowser();
  useHeadlessBrowser(browser);
  const results = await runTurn([
    ['preview_navigate', { url: 'http://127.0.0.1:5173/plums' }],
    ['preview_get_text', {}],
  ]);
  assert.deepEqual(browser.log, ['navigate /plums', 'get_text']);
  const read = results.find((result) => result.tool === 'preview_get_text');
  assert.equal(read.success, true, read.error);
  assert.equal(read.text, 'Text of /plums');
});

test('two pages read by their address in one turn each come back as themselves', async () => {
  const browser = oneTabBrowser();
  useHeadlessBrowser(browser);
  const results = await runTurn([
    ['preview_get_text', { url: 'http://127.0.0.1:5173/pears' }],
    ['preview_get_text', { url: 'http://127.0.0.1:5173/plums' }],
  ]);
  assert.deepEqual(browser.log, ['read_page /pears', 'read_page /plums'], 'one command each, and no navigate');
  assert.deepEqual(results.map((result) => result.text), ['Text of /pears', 'Text of /plums']);
});
