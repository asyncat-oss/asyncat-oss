#!/usr/bin/env node
// End-to-end smoke test. Starts a throwaway Asyncat (its own data folder,
// ports and settings, so your real data is never touched) with a fake
// OpenAI-compatible model, then drives the app in a headless browser through
// the main flows: chat, a project with instructions, agents, Cats, a note made
// by the agent, connectors (with a fake MCP server), an ACP agent (a fake
// one), searching inside chats, pinning a chat, Models → Voice and Images
// (and a Models search that finds a voice file), Files, and the main pages.
//
// Needs a Chromium-based browser (Chrome, Chromium, Edge or Brave), found the
// same way PDF export finds one; PUPPETEER_EXECUTABLE_PATH picks another.
// Run with: npm run test:e2e   (add --headed to watch, --keep to keep the data)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--headed');
const KEEP = process.argv.includes('--keep');
const ANSWER = 'Smoke test answer.';
const FAKE_MCP_SERVER = path.join(ROOT, 'den/test/fixtures/fakeMcpServer.mjs');
const FAKE_ACP_AGENT = path.join(ROOT, 'den/test/fixtures/fakeAcpAgent.mjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-e2e-'));
const children = [];
const results = [];
let failed = false;

function log(message) {
  process.stdout.write(`${message}\n`);
}

let currentPage = null;

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    log(`  ✓ ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    failed = true;
    results.push({ name, ok: false, error: err.message });
    log(`  ✗ ${name}: ${err.message}`);
    // What the page showed, to see why.
    const shown = await currentPage?.evaluate(() => `${location.pathname} · ${document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)}`).catch(() => null);
    if (shown) log(`      page: ${shown}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(fn, { timeout = 30000, interval = 250, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`timed out waiting for ${what}${lastError ? ` (${lastError.message})` : ''}`);
}

function run(name, command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  const keep = (chunk) => {
    output.push(String(chunk));
    if (output.length > 400) output.shift();
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.output = output;
  child.label = name;
  children.push(child);
  return child;
}

// ── A fake OpenAI-compatible model ───────────────────────────────────────────

const requests = [];
const NOTE = {
  title: 'Smoke test note',
  blocks: [
    { type: 'heading2', content: 'Watering' },
    { type: 'barChart', properties: { data: { labels: ['Bed 1', 'Bed 2'], datasets: [{ label: 'Litres', data: [3, 5] }] } } },
  ],
};

function startFakeModel(port) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.method === 'GET' && req.url.endsWith('/models')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'smoke-model', object: 'model', context_length: 16384 }] }));
        return;
      }
      const json = JSON.parse(body || '{}');
      requests.push(json);
      const messages = json.messages || [];
      const system = String(messages.find((m) => m.role === 'system')?.content || '');
      const lastUser = String([...messages].reverse().find((m) => m.role === 'user')?.content || '');
      const calledNote = messages.some((m) => m.role === 'assistant' && String(m.content || '').includes('"create_note"'));
      const calledConnector = messages.some((m) => m.role === 'assistant' && String(m.content || '').includes('mcp__smoke_notes__echo'));
      let content = ANSWER;
      if (/make a chart note/i.test(lastUser) && system.includes('<tool_call>') && !calledNote) {
        content = `<tool_call>\n${JSON.stringify({ name: 'create_note', arguments: NOTE })}\n</tool_call>`;
      }
      if (/use the smoke connector/i.test(lastUser) && system.includes('<tool_call>') && !calledConnector) {
        content = `<tool_call>\n${JSON.stringify({ name: 'mcp__smoke_notes__echo', arguments: { text: 'from the smoke test' } })}\n</tool_call>`;
      }
      const usage = { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 };
      if (json.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const chunk = (choices, extra = {}) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: json.model, choices, ...extra })}\n\n`;
        res.write(chunk([{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }]));
        res.write(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]));
        res.write(chunk([], { usage }));
        res.end('data: [DONE]\n\n');
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: json.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// ── The app ──────────────────────────────────────────────────────────────────

async function main() {
  const [modelPort, denPort, nekoPort, llamaPort] = await Promise.all([freePort(), freePort(), freePort(), freePort()]);
  const den = `http://127.0.0.1:${denPort}`;
  const app = `http://127.0.0.1:${nekoPort}`;
  const modelServer = await startFakeModel(modelPort);
  log(`Scratch folder: ${scratch}`);

  const dataDir = path.join(scratch, 'data');
  const env = {
    ...process.env,
    PORT: String(denPort),
    NODE_ENV: 'development',
    DB_PATH: path.join(dataDir, 'asyncat.db'),
    ASYNCAT_DATA_PATH: dataDir,
    ASYNCAT_HOME: path.join(scratch, 'home'),
    STORAGE_PATH: path.join(scratch, 'uploads'),
    ASYNCAT_LOG_DIR: path.join(scratch, 'logs'),
    CLAUDE_CONFIG_DIR: path.join(scratch, 'claude'),
    CODEX_HOME: path.join(scratch, 'codex'),
    FRONTEND_URL: app,
    ASYNCAT_RESTORE_LOCAL_MODEL: 'false',
    LLAMA_SERVER_PORT: String(llamaPort),
  };
  fs.mkdirSync(dataDir, { recursive: true });

  log('Building the app for the test…');
  const build = run('build', process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', path.join(scratch, 'dist'), '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: path.join(ROOT, 'neko'),
    env: { ...process.env, VITE_MAIN_URL: den, VITE_USER_URL: den, VITE_NOTES_URL: den },
  });
  const buildCode = await new Promise((resolve) => build.on('exit', resolve));
  if (buildCode !== 0) throw new Error(`frontend build failed:\n${build.output.join('').slice(-2000)}`);

  // The backend runs from the scratch folder so it reads no .env or MCP config of yours.
  const backend = run('den', process.execPath, [path.join(ROOT, 'den/src/index.js')], { cwd: scratch, env });
  const preview = run('neko', process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', path.join(scratch, 'dist'), '--port', String(nekoPort), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.join(ROOT, 'neko'),
    env: process.env,
  });

  await waitFor(async () => (await fetch(`${den}/health`)).ok, { timeout: 60000, what: `the backend (${backend.output.join('').slice(-500)})` });
  await waitFor(async () => (await fetch(app)).ok, { timeout: 30000, what: 'the frontend' });

  const api = async (method, url, body) => {
    const res = await fetch(`${den}${url}`, {
      method,
      headers: { 'content-type': 'application/json', origin: app },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 200)}`);
    return json;
  };

  // A model to talk to: the fake one.
  const created = await api('POST', '/api/ai/providers/profiles', {
    name: 'Smoke model', provider_id: 'custom', provider_type: 'custom',
    base_url: `http://127.0.0.1:${modelPort}/v1`, model: 'smoke-model', api_key: 'smoke-key', supports_tools: false,
  });
  await api('POST', `/api/ai/providers/profiles/${created.profile.id}/activate`);

  const { launchBrowser } = await import(path.join(ROOT, 'den/src/lib/browserLauncher.js'));
  const browser = await launchBrowser({ headless: !HEADED, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  currentPage = page;
  await page.setViewport({ width: 1280, height: 860 });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const bodyText = () => page.evaluate(() => document.body.innerText);
  const textAppears = (text, timeout = 20000) => waitFor(async () => (await bodyText()).includes(text), { timeout, what: `"${text}" on the page` });
  const noCrash = async () => {
    const text = await bodyText();
    assert(!/Something went wrong|Unexpected Application Error/i.test(text), 'the page shows an error screen');
  };

  log('Running checks:');

  await check('the home screen opens', async () => {
    await page.goto(`${app}/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('textarea', { timeout: 20000 });
    await noCrash();
  });

  await check('a chat message gets an answer', async () => {
    await page.click('textarea');
    await page.keyboard.type('Hello from the smoke test');
    await page.keyboard.press('Enter');
    await textAppears(ANSWER);
  });

  let projectId = null;
  await check('a project keeps its instructions and passes them to the model', async () => {
    const project = await api('POST', '/api/projects', { name: 'Smoke garden', emoji: '🌱' });
    projectId = project.data?.id || project.project?.id || project.id;
    assert(projectId, 'no project id returned');
    await api('PATCH', `/api/projects/${projectId}/instructions`, { instructions: 'Always answer in metric units.' });
    await page.goto(`${app}/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await textAppears('Smoke garden');
    await textAppears('Always answer in metric units.');
    const before = requests.length;
    const composer = await page.waitForSelector('textarea[placeholder^="Start a chat in"]');
    await composer.click();
    await page.keyboard.type('What should I plant?');
    await page.keyboard.press('Enter');
    // The page moves to a new chat and sends there; wait for the model to get it.
    await waitFor(() => requests.slice(before).some((r) => JSON.stringify(r.messages || []).includes('What should I plant?')), { timeout: 20000, what: 'the project chat to reach the model' });
    const recent = requests.slice(before).filter((r) => JSON.stringify(r.messages || []).includes('What should I plant?'));
    assert(recent.some((r) => JSON.stringify(r.messages || []).includes('Always answer in metric units.')), 'the model never saw the project instructions');
    await textAppears('What should I plant?');
  });

  await check('the agent makes a note with a chart', async () => {
    const res = await fetch(`${den}/api/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: app },
      body: JSON.stringify({ goal: 'Make a chart note about watering', agentMode: 'action' }),
    });
    const stream = await res.text();
    assert(stream.includes('"type":"tool_result"'), 'no tool result in the run');
    assert(/"noteId":"[^"]+"/.test(stream), 'no note was made');
  });

  await check('the Agents page lists templates and saves a new agent', async () => {
    await page.goto(`${app}/agents`, { waitUntil: 'domcontentloaded' });
    await textAppears('Start from a template');
    const agent = await api('POST', '/api/agent/profiles', { name: 'Smoke helper', instructions: 'Be brief.', capabilities: ['web', 'memory'] });
    assert(agent.success !== false, 'agent was not created');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await textAppears('Smoke helper');
    await noCrash();
  });

  let catId = null;
  await check('a Cat with a timer runs, reports in its chat and inbox', async () => {
    const parsed = await api('POST', '/api/cats/parse-schedule', { text: 'every day at 7am', timezone: 'UTC' });
    assert(parsed.scheduleText === 'Daily at 7:00', `parsed as ${parsed.scheduleText}`);
    const created = await api('POST', '/api/cats', {
      name: 'Smoke morning Cat', mission: 'Say good morning.', timezone: 'UTC',
      triggers: [{ kind: 'schedule', config: { schedule: parsed.schedule } }],
    });
    catId = created.cat?.id;
    assert(catId, 'no Cat id returned');
    assert(created.cat.conversationId, 'the Cat has no chat');
    await api('POST', `/api/cats/${catId}/wake`, {});
    const finished = await waitFor(async () => {
      const { runs } = await api('GET', `/api/cats/${catId}/runs`);
      return runs[0] && !['running', 'waiting'].includes(runs[0].status) ? runs[0] : null;
    }, { timeout: 30000, what: 'the Cat to finish' });
    assert(finished.status === 'succeeded', `the run ended as ${finished.status}: ${finished.error}`);
    const { items } = await api('GET', `/api/cats/inbox?catId=${catId}`);
    assert(items.some((item) => item.kind === 'result'), 'no result in the inbox');
    const { conversation } = await api('GET', `/api/ai/chats/${created.cat.conversationId}`);
    assert(conversation.messages.some((message) => message.type === 'assistant' && message.content.includes(ANSWER)), 'the report is not in its chat');
    await page.goto(`${app}/scheduled`, { waitUntil: 'domcontentloaded' });
    await textAppears('Smoke morning Cat');
    assert(page.url().endsWith('/cats'), `/scheduled went to ${page.url()}`);
  });

  await check("a message in a Cat's chat goes to the Cat", async () => {
    const { cat } = await api('GET', `/api/cats/${catId}`);
    await page.goto(`${app}/conversations/${cat.conversationId}`, { waitUntil: 'domcontentloaded' });
    await textAppears('To Smoke morning Cat');
    const before = requests.length;
    const composer = await page.waitForSelector('textarea');
    await composer.click();
    await page.keyboard.type('Any news?');
    await page.keyboard.press('Enter');
    await waitFor(() => requests.slice(before).some((r) => JSON.stringify(r.messages || []).includes('Any news?')), { timeout: 20000, what: 'the message to reach the Cat' });
    await waitFor(async () => {
      const { runs } = await api('GET', `/api/cats/${catId}/runs`);
      return runs[0]?.triggerKind === 'chat' && runs[0].status === 'succeeded';
    }, { timeout: 20000, what: 'the Cat to answer' });
    await page.goto(`${app}/cats/${catId}`, { waitUntil: 'domcontentloaded' });
    await textAppears('Say good morning.');
    await noCrash();
  });

  const clickText = async (selector, text) => {
    await waitFor(() => page.evaluate((sel, label) => {
      const el = [...document.querySelectorAll(sel)].find((node) => node.textContent.trim().includes(label));
      if (el) el.click();
      return Boolean(el);
    }, selector, text), { timeout: 10000, what: `${selector} "${text}"` });
  };

  await check('a connector added in Settings connects and lists its tools', async () => {
    await page.goto(`${app}/settings/connectors`, { waitUntil: 'domcontentloaded' });
    await textAppears('No connectors yet');
    await clickText('button', 'Add connector');
    await clickText('[role="tab"]', 'Program on this computer');
    const command = await page.waitForSelector('#connector-command');
    await command.type(`"${process.execPath}" "${FAKE_MCP_SERVER}"`);
    await page.type('#connector-local-title', 'Smoke notes');
    await clickText('form button[type="submit"]', 'Add');
    await waitFor(() => page.evaluate(() => document.querySelector('[data-connector="smoke-notes"]')?.innerText.includes('Connected · 7 tools')), { timeout: 20000, what: 'the connector to connect' });
    await clickText('[data-connector="smoke-notes"] button', 'Tools');
    await textAppears('Can change or delete');
    await noCrash();
  });

  await check("the agent uses a connector's tool; an agent without that connector can't", async () => {
    const runStream = async (body) => {
      const res = await fetch(`${den}/api/agent/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: app },
        body: JSON.stringify({ goal: 'Use the smoke connector', agentMode: 'action', ...body }),
      });
      return res.text();
    };
    const stream = await runStream({});
    assert(stream.includes('echo: from the smoke test'), 'the connector tool did not answer');
    const limited = await api('POST', '/api/agent/profiles', { name: 'No connectors', connectors: [] });
    const refused = await runStream({ profileId: limited.profile.id });
    assert(!refused.includes('echo: from the smoke test') && refused.includes('Unknown tool'), 'an agent without connectors still reached the tool');
  });

  await check('an ACP agent answers a chat and shows in the composer', async () => {
    await api('POST', '/api/agent/acp-agents', { name: 'fake', title: 'Fake ACP agent', command: process.execPath, args: [FAKE_ACP_AGENT] });
    const { engines } = await api('GET', '/api/agent/engines');
    assert(engines.some((engine) => engine.id === 'acp:fake' && engine.installed), 'the ACP agent is not offered');
    const res = await fetch(`${den}/api/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: app },
      body: JSON.stringify({ goal: 'Say hello', engine: 'acp:fake', agentMode: 'action' }),
    });
    const stream = await res.text();
    assert(stream.includes('Hello from the fake agent'), 'the ACP agent did not answer');
    assert(/"externalSessionId":"sess_/.test(stream), 'no ACP session id');
    await page.goto(`${app}/agents?tab=coding`, { waitUntil: 'domcontentloaded' });
    await waitFor(() => page.evaluate(() => document.querySelector('[data-acp-agent="fake"]')?.innerText.includes('Ready')), { timeout: 15000, what: 'the ACP agent in Coding agents' });
    await noCrash();
  });

  await check('Settings → Privacy & safety saves blocked sites, and search finds it', async () => {
    await page.goto(`${app}/settings/privacy`, { waitUntil: 'domcontentloaded' });
    await waitFor(() => page.evaluate(() => Boolean(document.querySelector('[data-privacy] [data-export]'))), { timeout: 15000, what: 'the Privacy & safety page' });
    const input = await page.$('input[aria-label="Add a site agents never open"]');
    await input.type('bank.example');
    await page.keyboard.press('Enter');
    await waitFor(async () => (await api('GET', '/api/privacy')).blockedSites?.includes('bank.example'), { timeout: 10000, what: 'the blocked site to be saved' });
    await api('PUT', '/api/privacy/blocked-sites', { sites: [] });
    const box = await page.$('[data-settings-search]');
    await box.type('quiet hours');
    await page.keyboard.press('Enter');
    await waitFor(() => page.evaluate(() => Boolean(document.querySelector('[data-notifications]'))), { timeout: 10000, what: 'search to open Notifications' });
    await noCrash();
  });

  await check('Models → Training shows the guided steps and finds a rated answer', async () => {
    const saved = await api('POST', '/api/ai/chats/save', {
      messages: [
        { id: 'msg_1_user_e2e', type: 'user', content: 'How deep should a balcony pot be?' },
        { id: 'msg_2_assistant_e2e', type: 'assistant', content: 'At least 30 cm for tomatoes, 15 cm for herbs.', rating: 1, ratedVariant: 0 },
      ],
      title: 'Pot depth',
      mode: 'chat',
    });
    assert(saved.conversationId, 'the rated chat was not saved');
    await page.goto(`${app}/models?tab=training`, { waitUntil: 'domcontentloaded' });
    await waitFor(() => page.evaluate(() => document.querySelector('[data-guide-step="data"]')?.innerText.includes('rated 👍 (1)')), { timeout: 20000, what: 'the rated answer in the training steps' });
    await noCrash();
  });

  await check('Ctrl+K finds a word said deep in a long chat and scrolls the chat to it', async () => {
    const messages = [];
    for (let i = 0; i < 30; i += 1) {
      messages.push({ id: `msg_${i}_user_e2e_search`, type: 'user', content: `Packing question ${i + 1} for the coast walk` });
      messages.push({
        id: `msg_${i}_assistant_e2e_search`,
        type: 'assistant',
        content: i === 20
          ? 'On the island you will likely meet a quokka. Keep your distance.'
          : `Bring water and a hat for part ${i + 1}.\n\n${'Check the tide times before you set off. '.repeat(6)}`,
      });
    }
    const saved = await api('POST', '/api/ai/chats/save', { messages, title: 'Coast walk', mode: 'chat' });
    assert(saved.conversationId, 'the long chat was not saved');
    await page.goto(`${app}/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('textarea', { timeout: 20000 });
    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    const input = await page.waitForSelector('input[role="combobox"]', { timeout: 10000 });
    await input.type('quokka');
    await waitFor(() => page.evaluate(() => [...document.querySelectorAll('[role="option"] mark')].some((mark) => mark.textContent.toLowerCase() === 'quokka')), { timeout: 10000, what: 'the message hit in the palette' });
    await page.keyboard.press('Enter');
    await waitFor(() => page.evaluate((id) => location.pathname === `/conversations/${id}` && !location.search, saved.conversationId), { timeout: 15000, what: 'the chat to open' });
    const shown = await waitFor(() => page.evaluate(() => {
      const target = document.querySelector('[data-message-id="msg_20_assistant_e2e_search"]');
      // The chat's scrolling box: the nearest parent that scrolls.
      let chat = target?.parentElement;
      while (chat && !(chat.scrollHeight > chat.clientHeight && /auto|scroll/.test(getComputedStyle(chat).overflowY))) chat = chat.parentElement;
      if (!chat) return null;
      const view = chat.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      if (box.top < view.top || box.bottom > view.bottom) return null;
      // Where the message sits in the whole chat: more than a screen from
      // either end, so it is in view only because the chat scrolled to it.
      const top = box.top - view.top + chat.scrollTop;
      return {
        deep: top > chat.clientHeight && chat.scrollHeight - (top + box.height) > chat.clientHeight,
        highlighted: Boolean(target.querySelector('.bg-selected')),
      };
    }), { timeout: 10000, what: 'the message scrolled into view' });
    assert(shown.deep, 'the chat is too short for the message to need a scroll');
    assert(shown.highlighted, 'the message was not highlighted');
    await noCrash();
  });

  await check('a chat pinned from the sidebar stays pinned, and unpins from All chats', async () => {
    const saved = await api('POST', '/api/ai/chats/save', {
      messages: [{ id: 'msg_1_user_e2e_pin', type: 'user', content: 'Plan the allotment' }],
      title: 'Allotment plan',
      mode: 'chat',
    });
    const pinnedInSidebar = () => page.evaluate(() => Boolean(document.querySelector('aside section[aria-label="Pinned chats"]')?.innerText.includes('Allotment plan')));
    await page.goto(`${app}/home`, { waitUntil: 'domcontentloaded' });
    const options = await page.waitForSelector('aside button[aria-label="Options for Allotment plan"]', { timeout: 20000 });
    await options.focus();
    await page.keyboard.press('Enter');
    await clickText('[role="menuitem"]', 'Pin');
    await waitFor(pinnedInSidebar, { timeout: 10000, what: 'the Pinned group' });
    const isPinnedNow = async () => (await api('GET', '/api/ai/chats?limit=80&mode=all')).conversations.some((chat) => chat.id === saved.conversationId && chat.is_pinned);
    await waitFor(isPinnedNow, { timeout: 10000, what: 'the pin to be saved' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitFor(pinnedInSidebar, { timeout: 20000, what: 'the pin to survive a reload' });
    const { conversations } = await api('GET', '/api/ai/chats?limit=80&mode=all');
    assert(conversations[0]?.id === saved.conversationId && conversations[0].is_pinned, 'the pinned chat is not first in the list');
    await page.goto(`${app}/all-chats`, { waitUntil: 'domcontentloaded' });
    await waitFor(() => page.evaluate(() => Boolean(document.querySelector('[data-command-center] section[aria-label="Pinned chats"]')?.innerText.includes('Allotment plan'))), { timeout: 20000, what: 'the chat among pinned on All chats' });
    await page.click('[data-command-center] button[aria-label="Options for Allotment plan"]');
    await clickText('[role="menuitem"]', 'Unpin');
    await waitFor(async () => !(await pinnedInSidebar()), { timeout: 10000, what: 'the sidebar to drop the pin' });
    await waitFor(async () => !(await api('GET', '/api/ai/chats?limit=80&mode=all')).conversations.some((chat) => chat.is_pinned), { timeout: 10000, what: 'the unpin to be saved' });
    await noCrash();
  });

  await check('Models → Voice shows Listening and Speaking', async () => {
    await page.goto(`${app}/models?tab=audio`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-voice-page] [data-voice-group="stt"] [data-runs-on="stt"]', { timeout: 20000 });
    await page.waitForSelector('[data-voice-page] [data-voice-group="tts"] [data-runs-on="tts"]', { timeout: 20000 });
    await noCrash();
  });

  await check('Models → Images shows how images are made', async () => {
    await page.goto(`${app}/models?tab=image`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-images-page] [data-images-group] [data-runs-on="image"]', { timeout: 20000 });
    await noCrash();
  });

  await check('a Models search for a voice file opens Voice and shows its row', async () => {
    // A listening model of a few bytes, added where it is: nothing downloads.
    const file = path.join(scratch, 'ggml-smoke-tiny.bin');
    fs.writeFileSync(file, Buffer.alloc(2048));
    await api('POST', '/api/ai/providers/audio/models/custom-paths', { name: 'ggml-smoke-tiny', path: file, type: 'whisper' });
    // The search asks Hugging Face too; answer for it so the test stays offline.
    const offlineSearch = (req) => {
      if (req.isInterceptResolutionHandled()) return;
      if (req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/hf-search')) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': app, 'access-control-allow-credentials': 'true' },
          body: JSON.stringify({ success: true, models: [] }),
        });
      } else {
        req.continue();
      }
    };
    await page.setRequestInterception(true);
    page.on('request', offlineSearch);
    try {
      await page.goto(`${app}/models?view=local`, { waitUntil: 'domcontentloaded' });
      const box = await page.waitForSelector('input[placeholder^="Search your models"]', { timeout: 20000 });
      await box.type('smoke-tiny');
      await clickText('button', 'ggml-smoke-tiny');
      await page.waitForSelector('[data-voice-page] [data-file-row="whisper"].bg-selected', { timeout: 15000 });
      assert(new URL(page.url()).searchParams.get('tab') === 'audio', 'the search did not open Voice');
    } finally {
      page.off('request', offlineSearch);
      await page.setRequestInterception(false);
    }
    await noCrash();
  });

  await check('Files lists what agents made, and the old addresses lead there', async () => {
    await page.goto(`${app}/files/made`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-files-page] [data-files-place="made"]', { timeout: 20000 });
    // The note the agent made earlier is among what agents made.
    await textAppears('Smoke test note');
    assert(await page.$('aside button[aria-label="Files"][aria-current="page"]'), 'the sidebar has no Files entry, or it is not the current page');
    assert(!(await bodyText()).includes('Gallery'), 'the page still says Gallery');
    await page.goto(`${app}/made?kind=note`, { waitUntil: 'domcontentloaded' });
    await waitFor(() => page.evaluate(() => `${location.pathname}${location.search}` === '/files/made?kind=note'), { timeout: 10000, what: '/made to lead to Files → Made by agents' });
    await page.goto(`${app}/settings/storage`, { waitUntil: 'domcontentloaded' });
    await waitFor(() => page.evaluate(() => location.pathname === '/files/logs'), { timeout: 10000, what: 'Storage & logs to lead to Files → Logs & caches' });
    await page.waitForSelector('[data-files-place="logs"]', { timeout: 20000 });
    await noCrash();
  });

  for (const [label, route] of [['Models', '/models'], ['Settings → Profile', '/settings/profile'], ['Settings → Connections', '/settings/connections'], ['Settings → Notifications', '/settings/notifications'], ['Settings → Background', '/settings/background'], ['Settings → Engines', '/settings/runtime'], ['Tools & Skills', '/tools'], ['Files → System', '/files/system']]) {
    await check(`${label} opens`, async () => {
      await page.goto(`${app}${route}`, { waitUntil: 'domcontentloaded' });
      // Pages keep live connections open (/api/events), so the network never
      // goes idle: wait for the page itself instead.
      await page.waitForSelector('main, [data-models-page], h1', { timeout: 20000 });
      await new Promise((resolve) => setTimeout(resolve, 800));
      await noCrash();
    });
  }

  await check('no uncaught errors in the page', async () => {
    assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  });

  await browser.close();
  modelServer.close();
}

async function cleanup() {
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  if (KEEP) log(`Kept the test data in ${scratch}`);
  else fs.rmSync(scratch, { recursive: true, force: true });
}

try {
  await main();
} catch (err) {
  failed = true;
  log(`Smoke test could not run: ${err.message}`);
  for (const child of children) {
    if (child.label === 'den') log(`--- backend output ---\n${child.output.join('').slice(-3000)}`);
  }
} finally {
  await cleanup();
}

const passed = results.filter((r) => r.ok).length;
log(`\n${passed}/${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
