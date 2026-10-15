import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// Settings → Personalization: what Asyncat should know about you and how it
// should answer. Saved on the profile, length-limited, and sent to the model
// as the user's own preferences in every kind of run: a chat with the agent,
// a plain chat, Quick ask, a Cat, and a temporary chat (which only reads
// them and keeps nothing). A stand-in model records each system prompt.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-personalization-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');
process.env.ASYNCAT_RESTORE_LOCAL_MODEL = 'false';

// The database starts as an older version left it, with no columns for the
// preferences, so the tests below run on one the upgrade added them to.
const { default: Database } = await import('better-sqlite3');
const older = new Database(process.env.DB_PATH);
older.exec(`CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, profile_picture TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
older.close();

const systemPrompts = [];
const model = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const json = JSON.parse(body || '{}');
    const system = (json.messages || []).filter((message) => message.role === 'system').map((message) => String(message.content)).join('\n\n');
    if (json.stream) systemPrompts.push(system);
    const content = 'Noted.';
    if (json.stream) {
      const chunk = (choices, extra = {}) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: json.model, choices, ...extra })}\n\n`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(chunk([{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }]));
      res.write(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]));
      res.write(chunk([], { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }));
      res.end('data: [DONE]\n\n');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: json.model, choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] }));
  });
});
await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));

const { default: express } = await import('express');
const { default: db } = await import('../src/db/client.js');
const { default: userRoutes } = await import('../src/users/routes/userRoutes.js');
const { default: aiAgentRoutes } = await import('../src/ai/routes/aiAgentRoutes.js');
const { default: providerRoutes } = await import('../src/ai/routes/providerRoutes.js');
const { insertCat, hydrateCat, ownedCatRow } = await import('../src/cats/catStore.js');
const { runCat } = await import('../src/cats/catRunner.js');
const { PERSONALIZATION_LIMIT, personalizationPrompt } = await import('../src/users/personalization.js');

const userId = randomUUID();
const workspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'demo@example.test', 'Demo')").run(userId);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Home', ?)").run(workspaceId, userId);
const profileId = randomUUID();
db.prepare(`INSERT INTO ai_provider_profiles (id, user_id, name, provider_type, provider_id, base_url, model, api_key, settings, supports_tools)
  VALUES (?, ?, 'Stand-in', 'custom', 'custom', ?, 'stand-in-model', 'test-key', '{}', 0)`)
  .run(profileId, userId, `http://127.0.0.1:${model.address().port}/v1`);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; req.db = null; next(); });
app.use('/api/users', userRoutes);
app.use('/api/ai/providers', providerRoutes);
app.use('/api/ai', aiAgentRoutes);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => {
  server.close();
  model.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

assert.equal((await call('PUT', '/api/ai/providers/default-model', { model: { kind: 'profile', profileId } })).status, 200);

/** The system prompt of the streamed model call a request makes. */
async function promptOf(url, body) {
  const before = systemPrompts.length;
  const res = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, ...body }) });
  const text = await res.text();
  assert.match(text, /"type":"done"/, `${url} finished`);
  assert.ok(systemPrompts.length > before, `${url} asked the model`);
  return systemPrompts[before];
}

const ABOUT = 'I keep bees on an allotment and teach evening classes.';
const STYLE = 'Short answers, metric units, British spelling.';
const row = () => db.prepare('SELECT about_me, answer_style, updated_at FROM users WHERE id = ?').get(userId);
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('the two fields are saved on the profile, trimmed and length-limited', async () => {
  assert.deepEqual((await call('GET', '/api/users/me/personalization')).body.data, { about: '', answerStyle: '', limit: PERSONALIZATION_LIMIT });

  const saved = await call('PUT', '/api/users/me/personalization', { about: `  ${ABOUT}\r\n`, answerStyle: STYLE });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.data, { about: ABOUT, answerStyle: STYLE, limit: PERSONALIZATION_LIMIT });
  assert.equal(row().about_me, ABOUT);

  // A field left out keeps its value.
  assert.equal((await call('PUT', '/api/users/me/personalization', { answerStyle: 'Longer answers.' })).body.data.about, ABOUT);
  await call('PUT', '/api/users/me/personalization', { answerStyle: STYLE });

  // Too long, not text, or nothing at all: refused, and nothing changes.
  const long = await call('PUT', '/api/users/me/personalization', { about: 'x'.repeat(PERSONALIZATION_LIMIT + 1) });
  assert.equal(long.status, 400);
  assert.match(long.body.error, /1,500 characters/);
  assert.equal((await call('PUT', '/api/users/me/personalization', { answerStyle: 42 })).status, 400);
  assert.equal((await call('PUT', '/api/users/me/personalization', {})).status, 400);
  assert.equal((await call('PUT', '/api/users/me/personalization', { about: 'x'.repeat(PERSONALIZATION_LIMIT) })).status, 200, 'exactly the limit is fine');
  await call('PUT', '/api/users/me/personalization', { about: ABOUT });
  assert.deepEqual([row().about_me, row().answer_style], [ABOUT, STYLE]);
});

test('the prompt part marks them as the user\'s own and cuts them to the limit', () => {
  assert.equal(personalizationPrompt({}), '');
  assert.equal(personalizationPrompt({ about: '  ', answerStyle: '\n' }), '');
  const both = personalizationPrompt({ about: ABOUT, answerStyle: STYLE });
  assert.match(both, /^## The user's own preferences\n/);
  assert.match(both, /Settings → Personalization/);
  assert.ok(both.includes(`<about_the_user>\n${ABOUT}\n</about_the_user>`));
  assert.ok(both.includes(`<how_to_answer>\n${STYLE}\n</how_to_answer>`));
  assert.doesNotMatch(personalizationPrompt({ answerStyle: STYLE }), /about_the_user/, 'an empty field is left out');
  const cut = personalizationPrompt({ about: '7'.repeat(PERSONALIZATION_LIMIT * 3) });
  assert.equal(cut.match(/7{10,}/)[0].length, PERSONALIZATION_LIMIT);
});

test('chats with the agent, plain chats and Quick ask send them to the model', async () => {
  const agent = await promptOf('/api/ai/run', { goal: 'What should I plant?' });
  assert.ok(agent.includes(ABOUT) && agent.includes(STYLE), 'a chat with the agent');
  assert.ok(agent.indexOf("## The user's own preferences") > agent.indexOf('## Tool Call Format'), 'after the rules, near the end');

  const plain = await promptOf('/api/ai/chat/stream', { message: 'What should I plant?' });
  assert.ok(plain.startsWith("## The user's own preferences"), 'Quick ask and plain chats: the system prompt is just them');
  assert.ok(plain.includes(ABOUT) && plain.includes(STYLE));
});

test('a Cat sends them to the model', async () => {
  const cat = hydrateCat(ownedCatRow(userId, insertCat(userId, { name: 'Hive check', mission: 'Remind me to check the hives.' }, { workspaceId })));
  const before = systemPrompts.length;
  await runCat({ cat, wake: { kind: 'manual' } });
  const prompt = systemPrompts[before];
  assert.match(prompt, /Hive check/, "the Cat's run");
  assert.ok(prompt.includes(ABOUT) && prompt.includes(STYLE));
});

test('a temporary chat uses them but stores nothing new', async () => {
  const user = row();
  const sessions = count('agent_sessions');
  const memories = count('agent_memory');
  const chats = count('conversations');

  const agent = await promptOf('/api/ai/run', { goal: 'Remember that I prefer clover honey.', ephemeral: true });
  assert.ok(agent.includes(ABOUT) && agent.includes(STYLE));
  assert.match(agent, /This is a temporary chat/);
  const plain = await promptOf('/api/ai/chat/stream', { message: 'Which honey is best?', ephemeral: true });
  assert.ok(plain.includes(ABOUT) && plain.includes(STYLE));

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(row(), user, 'the preferences are untouched');
  assert.equal(count('agent_sessions'), sessions, 'no saved session');
  assert.equal(count('agent_memory'), memories, 'no memories');
  assert.equal(count('conversations'), chats, 'no chat');
});

test('text longer than the limit that reached the database is cut in the prompt', async () => {
  db.prepare('UPDATE users SET about_me = ? WHERE id = ?').run('7'.repeat(PERSONALIZATION_LIMIT + 500), userId);
  const prompt = await promptOf('/api/ai/chat/stream', { message: 'Hello' });
  assert.equal(prompt.match(/7{10,}/)[0].length, PERSONALIZATION_LIMIT);
  db.prepare('UPDATE users SET about_me = ? WHERE id = ?').run(ABOUT, userId);
});

test('with nothing set, the prompt has no preferences part', async () => {
  await call('PUT', '/api/users/me/personalization', { about: '', answerStyle: '' });
  assert.doesNotMatch(await promptOf('/api/ai/run', { goal: 'Hello' }), /The user's own preferences/);
  assert.equal(await promptOf('/api/ai/chat/stream', { message: 'Hello' }), '');
});
