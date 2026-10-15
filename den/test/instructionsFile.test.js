import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// The instructions file (the agent's "soul": who it is, how it works, its
// rules), edited in Settings → Personalization. Edits go to a copy in
// Asyncat's home folder and never change the file Asyncat ships, so an
// update keeps them and Reset to default brings the shipped one back.

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-instructions-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');

const { default: express } = await import('express');
const { default: db } = await import('../src/db/client.js');
const { default: aiAgentRoutes } = await import('../src/ai/routes/aiAgentRoutes.js');
const souls = await import('../src/agent/prompts/agentSystemPrompt.js');
const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');

const SHIPPED = path.join(here, '..', 'src', 'agent', 'souls', 'default.md');
const EDITED = path.join(scratch, 'home', 'souls', 'default.md');
const shipped = fs.readFileSync(SHIPPED, 'utf8');
const MINE = '---\nname: mine\n---\n\n# My helper\n\nYou are Pip, a patient helper for my garden notes.\n';

const userId = randomUUID();
const workspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'demo@example.test', 'Demo')").run(userId);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Home', ?)").run(workspaceId, userId);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; req.db = null; next(); });
app.use('/api/agent', aiAgentRoutes);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/agent`;

test.after(() => {
  server.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

/** The system prompt an agent run sends, with a model that answers at once. */
async function runPrompt() {
  let system = '';
  const create = async (params) => {
    if (params.stream) {
      system = String(params.messages.find((message) => message.role === 'system')?.content || '');
      return (async function* stream() {
        yield { choices: [{ index: 0, delta: { content: '**Answer:** Done.' }, finish_reason: null }] };
        yield { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
      })();
    }
    return { choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] };
  };
  const runtime = new AgentRuntime({
    aiClient: { client: { chat: { completions: { create } } } },
    model: 'demo-model', supportsNativeTools: false, userId, workspaceId, ephemeral: true, preferences: '',
  });
  await runtime.run('Hello');
  return system;
}

test('the shipped file is used until it is edited', async () => {
  const got = await call('GET', '/soul');
  assert.equal(got.status, 200);
  assert.equal(got.body.content, shipped);
  assert.equal(got.body.path, SHIPPED);
  assert.equal(got.body.edited, false);
  assert.equal(got.body.hasDefault, true);
  assert.ok((await runPrompt()).startsWith(souls.loadSoul('default')), 'the run starts with it');
});

test('an edit is saved to a copy in Asyncat\'s home folder, and the run uses it', async () => {
  const saved = await call('PUT', '/soul', { content: MINE });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.edited, true);
  assert.equal(saved.body.path, EDITED);
  assert.equal(fs.readFileSync(EDITED, 'utf8'), MINE);
  assert.equal(fs.readFileSync(SHIPPED, 'utf8'), shipped, 'the shipped file is untouched');
  assert.equal((await call('GET', '/soul')).body.content, MINE);
  assert.equal(souls.loadSoul('default'), '# My helper\n\nYou are Pip, a patient helper for my garden notes.', 'without its frontmatter');
  assert.ok((await runPrompt()).startsWith('# My helper'));
  assert.deepEqual((await call('GET', '/souls')).body.souls, ['default'], 'listed once');
});

test('empty, too long, unknown and odd names are refused, and nothing is written', async () => {
  assert.equal((await call('PUT', '/soul', { content: '  \n' })).status, 400);
  const long = await call('PUT', '/soul', { content: 'x'.repeat(souls.SOUL_MAX_CHARS + 1) });
  assert.equal(long.status, 400);
  assert.match(long.body.error, /20,000 characters/);
  assert.equal((await call('PUT', '/soul', {})).status, 400, 'no content');
  assert.equal((await call('PUT', '/soul', { name: 'nobody', content: MINE })).status, 404, 'only souls that exist');
  for (const name of ['../skills/systematic-debugging', '../../package', 'a/b', '.hidden', '']) {
    if (name) assert.equal((await call('PUT', '/soul', { name, content: MINE })).status, 404, name);
    assert.equal(souls.readSoulRaw(name || '..'), null, `nothing is read for ${name || '..'}`);
  }
  assert.equal((await call('GET', `/soul?name=${encodeURIComponent('../skills/systematic-debugging')}`)).status, 404);
  assert.deepEqual(fs.readdirSync(path.dirname(EDITED)), ['default.md'], 'nothing else was written');
  assert.equal(fs.readFileSync(EDITED, 'utf8'), MINE, 'the copy is unchanged');
});

test('Reset to default deletes the copy and the shipped file is used again', async () => {
  const reset = await call('POST', '/soul/reset', {});
  assert.equal(reset.status, 200);
  assert.equal(reset.body.edited, false);
  assert.equal(reset.body.content, shipped);
  assert.equal(fs.existsSync(EDITED), false);
  assert.ok((await runPrompt()).startsWith(souls.loadSoul('default')));
  assert.equal((await call('POST', '/soul/reset', {})).status, 200, 'resetting again is fine');
  assert.equal((await call('POST', '/soul/reset', { name: 'nobody' })).status, 404);
});
