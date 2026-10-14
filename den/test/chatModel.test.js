import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Each chat runs on its own model: picking one in a chat changes that chat
// and the default for new chats, never the other chats. Runs go through the
// real routes against stand-in models: an OpenAI-style server that says which
// model answered, and a fake llama-server (fixtures/fakeLlamaServer.mjs) for
// local model files, which load for the chat that needs them.

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-chat-model-${randomUUID()}-`));

async function freePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');
process.env.ASYNCAT_RESTORE_LOCAL_MODEL = 'false';
process.env.LLAMA_SERVER_PORT = String(await freePort());
process.env.LLAMA_BINARY_PATH = path.join(here, 'fixtures', 'fakeLlamaServer.mjs');

// The cloud stand-in: every answer names the model it was asked for.
const cloud = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const json = JSON.parse(body || '{}');
    const content = `I am ${json.model}.`;
    if (json.stream) {
      const chunk = (choices, extra = {}) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: json.model, choices, ...extra })}\n\n`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(chunk([{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }]));
      res.write(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]));
      res.write(chunk([], { usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }));
      res.end('data: [DONE]\n\n');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: json.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
  });
});
await new Promise((resolve) => cloud.listen(0, '127.0.0.1', resolve));
const cloudUrl = `http://127.0.0.1:${cloud.address().port}/v1`;

const { default: express } = await import('express');
const { default: db } = await import('../src/db/client.js');
const { chatService } = await import('../src/ai/controllers/ai/chatService.js');
const { default: providerRoutes } = await import('../src/ai/routes/providerRoutes.js');
const { default: aiAgentRoutes } = await import('../src/ai/routes/aiAgentRoutes.js');
const { createProfile } = await import('../src/agent/ProfileManager.js');
const { insertCat, hydrateCat, ownedCatRow } = await import('../src/cats/catStore.js');
const { runCat } = await import('../src/cats/catRunner.js');
const llama = await import('../src/ai/controllers/ai/llamaServerManager.js');
const { getModelsDir } = await import('../src/ai/controllers/ai/modelManager.js');
const refs = await import('../src/ai/controllers/ai/modelRefs.js');

const userId = randomUUID();
const workspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'demo@example.test', 'Demo')").run(userId);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Home', ?)").run(workspaceId, userId);

function savedModel(name, model, extra = {}) {
  const id = randomUUID();
  db.prepare(`INSERT INTO ai_provider_profiles (id, user_id, name, provider_type, provider_id, base_url, model, api_key, settings, supports_tools)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 0)`)
    .run(id, userId, name, extra.providerType || 'custom', extra.providerId || 'custom', cloudUrl, model, extra.apiKey === undefined ? 'test-key' : extra.apiKey);
  return { kind: 'profile', profileId: id };
}
const apple = savedModel('Apple', 'apple-model');
const berry = savedModel('Berry', 'berry-model');
const cherry = savedModel('Cherry', 'cherry-model');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; req.db = null; next(); });
app.use('/api/ai/providers', providerRoutes);
app.use('/api/ai', aiAgentRoutes);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  await llama.stopServer();
  server.close();
  cloud.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

function sse(text) {
  return text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
}

/** A run of the chat's agent, as the composer sends one. */
async function run(conversationId, extra = {}) {
  const res = await fetch(`${base}/api/ai/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal: 'Which model are you?', conversationId, workspaceId, ...extra }),
  });
  const events = sse(await res.text());
  const done = events.find((event) => event.type === 'done');
  return { status: res.status, events, answer: done?.data?.answer || '', used: events.find((event) => event.type === 'chat_model')?.data };
}

/** A plain chat (Chat mode, Quick ask). */
async function chat(body = {}) {
  const res = await fetch(`${base}/api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Which model are you?', ...body }),
  });
  const events = sse(await res.text());
  return { events, answer: events.filter((event) => event.type === 'delta').map((event) => event.data.content).join('') };
}

async function newChat(title = 'A chat') {
  const saved = await chatService.saveConversation(userId, [{ id: `u-${randomUUID()}`, type: 'user', content: title }], { workspaceId, title });
  return saved.conversationId;
}

const storedModel = (conversationId) => chatService.readStoredConversation(conversationId, userId).metadata.model || null;
const defaultModel = async () => (await call('GET', '/api/ai/providers/default-model')).body.model;

test('model references: the composer\'s spellings, sameness, and the default\'s', () => {
  assert.deepEqual(refs.normalizeModelRef(`provider:${apple.profileId}`), apple);
  assert.deepEqual(refs.normalizeModelRef('local:qwen-1.5b.gguf'), { kind: 'local', file: 'qwen-1.5b.gguf' });
  assert.equal(refs.normalizeModelRef({ kind: 'profile' }), null);
  assert.equal(refs.normalizeModelRef('gpt'), null);
  assert.ok(refs.sameModelRef({ ...apple, name: 'Old name' }, apple), 'names do not count');
  assert.ok(!refs.sameModelRef(apple, berry));
  assert.ok(refs.sameModelRef(null, undefined));
  assert.deepEqual(refs.modelRefFromConfig({ profile_id: apple.profileId }), apple);
  assert.deepEqual(refs.modelRefFromConfig({ provider_id: 'llamacpp-builtin', model: 'qwen-1.5b.gguf' }), { kind: 'local', file: 'qwen-1.5b.gguf', name: 'qwen-1.5b' });
  assert.equal(refs.modelRefFromConfig({ provider_id: 'mlx-builtin', model: '/models/mlx' }), null, 'MLX has no reference: its chats follow the default');
});

test('two chats on two models stay on their own, and the last pick is the default for new chats', async () => {
  const first = await newChat('Apples');
  const second = await newChat('Berries');
  assert.equal((await call('PUT', `/api/ai/chats/${first}/model`, { model: apple })).status, 200);
  const picked = await call('PUT', `/api/ai/chats/${second}/model`, { model: `provider:${berry.profileId}` });
  assert.equal(picked.status, 200);
  assert.equal(picked.body.name, 'Berry · berry-model');

  assert.equal((await run(first)).answer, 'I am apple-model.');
  assert.equal((await run(second)).answer, 'I am berry-model.');
  const again = await run(first);
  assert.equal(again.answer, 'I am apple-model.', "picking a model in another chat didn't move this one");
  assert.deepEqual(again.used, { model: { ...apple, name: 'Apple · apple-model' }, name: 'Apple · apple-model', source: 'chat' });
  assert.equal(storedModel(first).profileId, apple.profileId);

  // New chats start with the model used last, and Models shows it as the default.
  assert.deepEqual(await defaultModel(), berry);
  assert.equal((await call('GET', '/api/ai/providers/config')).body.profile_id, berry.profileId);
  const fresh = await newChat('Fresh');
  const freshRun = await run(fresh);
  assert.equal(freshRun.answer, 'I am berry-model.');
  assert.equal(freshRun.used.source, 'default');
  assert.equal(storedModel(fresh).profileId, berry.profileId, 'it keeps the model it started with');

  // Changing the default moves new chats, not ones that already ran.
  assert.equal((await call('PUT', '/api/ai/providers/default-model', { model: cherry })).status, 200);
  assert.equal((await run(fresh)).answer, 'I am berry-model.');
  assert.equal((await run(await newChat('Another'))).answer, 'I am cherry-model.');

  // Picking without making it the default.
  await call('PUT', `/api/ai/chats/${second}/model`, { model: apple, makeDefault: false });
  assert.deepEqual(await defaultModel(), cherry);
  assert.equal((await run(second)).answer, 'I am apple-model.');

  // Usage is counted against the model each chat used.
  const used = db.prepare('SELECT DISTINCT model, provider_profile_id FROM ai_model_usage_events WHERE conversation_id = ?').all(first);
  assert.deepEqual(used, [{ model: 'apple-model', provider_profile_id: apple.profileId }]);
});

test('the model the app sends for a chat is used and remembered; temporary chats remember nothing', async () => {
  const chatId = await newChat('Switching');
  await call('PUT', `/api/ai/chats/${chatId}/model`, { model: apple, makeDefault: false });
  assert.equal((await run(chatId, { model: berry })).answer, 'I am berry-model.');
  assert.equal(storedModel(chatId).profileId, berry.profileId);
  assert.equal((await run(chatId)).answer, 'I am berry-model.');

  const temporary = await newChat('Off the record');
  assert.equal((await run(temporary, { model: apple, ephemeral: true })).answer, 'I am apple-model.');
  assert.equal(storedModel(temporary), null);
});

test("an agent's own model wins over the chat's", async () => {
  const agent = createProfile({ userId, name: 'Gardener', instructions: 'Help with the garden.', modelProfileId: cherry.profileId });
  const chatId = await newChat('Garden');
  await call('PUT', `/api/ai/chats/${chatId}/model`, { model: apple, makeDefault: false });
  const result = await run(chatId, { profileId: agent.id });
  assert.equal(result.answer, 'I am cherry-model.');
  assert.equal(result.used.source, 'agent');
  assert.equal(storedModel(chatId).profileId, apple.profileId, "the chat's own model stays");
});

test('a chat whose model is gone says which, so another can be picked', async () => {
  const old = savedModel('Old', 'old-model');
  const chatId = await newChat('Old times');
  await call('PUT', `/api/ai/chats/${chatId}/model`, { model: old, makeDefault: false });
  db.prepare('DELETE FROM ai_provider_profiles WHERE id = ?').run(old.profileId);
  const result = await run(chatId);
  const error = result.events.find((event) => event.type === 'error');
  assert.equal(error.data.code, 'model_unavailable');
  assert.equal(error.data.modelName, 'Old · old-model');
  assert.match(error.data.message, /^Old · old-model was removed from your models\. Pick another model\.$/);
  assert.equal(result.events.at(-1).data.stopReason, 'error');

  const keyless = savedModel('OpenAI', 'gpt-demo', { providerType: 'cloud', providerId: 'openai', apiKey: null });
  const keylessChat = await newChat('No key');
  await call('PUT', `/api/ai/chats/${keylessChat}/model`, { model: keyless, makeDefault: false });
  const noKey = (await run(keylessChat)).events.find((event) => event.type === 'error');
  assert.match(noKey.data.message, /^OpenAI · gpt-demo has no API key\./);

  const refused = await call('PUT', `/api/ai/chats/${chatId}/model`, { model: { kind: 'profile', profileId: 'nope' } });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, 'model_unavailable');
  assert.equal((await call('PUT', `/api/ai/chats/${randomUUID()}/model`, { model: apple })).status, 404);
});

test('plain chats use their own model too; Quick ask uses the default', async () => {
  await call('PUT', '/api/ai/providers/default-model', { model: cherry });
  const chatId = await newChat('Plain');
  await call('PUT', `/api/ai/chats/${chatId}/model`, { model: apple, makeDefault: false });
  assert.equal((await chat({ conversationId: chatId })).answer, 'I am apple-model.');
  const quick = await chat();
  assert.equal(quick.answer, 'I am cherry-model.');
  assert.equal(quick.events.find((event) => event.type === 'chat_model').data.source, 'default');
});

test("a Cat without a model follows the default; one with its own doesn't move", async () => {
  await call('PUT', '/api/ai/providers/default-model', { model: apple });
  const follower = hydrateCat(ownedCatRow(userId, insertCat(userId, { name: 'Follower', mission: 'Say which model you are.' }, { workspaceId })));
  assert.equal(follower.providerProfileId, null, 'nothing is kept at creation');
  assert.equal(follower.modelSource, 'default');
  const own = hydrateCat(ownedCatRow(userId, insertCat(userId, { name: 'Own', mission: 'Say which model you are.', providerProfileId: berry.profileId }, { workspaceId })));
  assert.equal(own.modelSource, 'own');

  const wake = { kind: 'manual' };
  assert.equal((await runCat({ cat: follower, wake })).answer, 'I am apple-model.');
  assert.equal((await runCat({ cat: own, wake })).answer, 'I am berry-model.');

  // Picking a model in a chat changes the default, so the follower follows.
  await call('PUT', `/api/ai/chats/${await newChat('Moves the default')}/model`, { model: cherry });
  assert.equal((await runCat({ cat: follower, wake })).answer, 'I am cherry-model.');
  assert.equal((await runCat({ cat: own, wake })).answer, 'I am berry-model.');
});

test('chats on different local models load theirs in turn; cloud models leave llama-server alone', async () => {
  const modelsDir = getModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });
  for (const file of ['apple-3b.gguf', 'berry-7b.gguf']) fs.writeFileSync(path.join(modelsDir, file), 'GGUF stand-in');

  const first = await newChat('Local apple');
  const second = await newChat('Local berry');
  await call('PUT', `/api/ai/chats/${first}/model`, { model: { kind: 'local', file: 'apple-3b.gguf' } });
  await call('PUT', `/api/ai/chats/${second}/model`, { model: 'local:berry-7b.gguf' });
  assert.equal(llama.getStatus().status, 'idle', 'picking a model loads nothing');
  assert.deepEqual(await defaultModel(), { kind: 'local', file: 'berry-7b.gguf', name: 'berry-7b' });

  const onApple = await run(first, { ctxSize: 2048 });
  assert.match(onApple.answer, /\[apple-3b\.gguf\]$/);
  const loading = onApple.events.find((event) => event.type === 'model_loading');
  assert.equal(loading.data.name, 'apple-3b');
  assert.ok(onApple.events.some((event) => event.type === 'model_ready'));
  assert.equal(llama.getStatus().ctxSize, 2048);

  assert.match((await run(second)).answer, /\[berry-7b\.gguf\]$/);
  const backToApple = await run(first);
  assert.match(backToApple.answer, /\[apple-3b\.gguf\]$/, 'it loads its own again');
  const loadedAgain = await run(first);
  assert.ok(!loadedAgain.events.some((event) => event.type === 'model_loading'), 'no load when it is already loaded');

  const cloudChat = await newChat('Cloud');
  await call('PUT', `/api/ai/chats/${cloudChat}/model`, { model: apple, makeDefault: false });
  const onCloud = await run(cloudChat);
  assert.equal(onCloud.answer, 'I am apple-model.');
  assert.ok(!onCloud.events.some((event) => event.type === 'model_loading'));
  assert.equal(llama.getStatus().model, 'apple-3b.gguf', 'a provider model never touches llama-server');

  const used = db.prepare('SELECT DISTINCT model FROM ai_model_usage_events WHERE conversation_id = ?').all(second);
  assert.deepEqual(used, [{ model: 'berry-7b.gguf' }]);

  fs.rmSync(path.join(modelsDir, 'berry-7b.gguf'));
  const gone = (await run(second)).events.find((event) => event.type === 'error');
  assert.equal(gone.data.code, 'model_unavailable');
  assert.match(gone.data.message, /^berry-7b isn't on this computer any more\. Pick another model\.$/);
  assert.equal(llama.getStatus().model, 'apple-3b.gguf');
});

test('a run waiting for the user lets other chats use llama-server, then loads its model again', async () => {
  const { openModel } = await import('../src/ai/controllers/ai/chatModel.js');
  const modelsDir = getModelsDir();
  for (const file of ['apple-3b.gguf', 'cherry-1b.gguf']) fs.writeFileSync(path.join(modelsDir, file), 'GGUF stand-in');
  const apple3b = { kind: 'local', file: 'apple-3b.gguf' };
  const cherry1b = { kind: 'local', file: 'cherry-1b.gguf' };
  const state = (promise) => Promise.race([promise.then(() => 'done'), new Promise((resolve) => setTimeout(() => resolve('waiting'), 50))]);

  const phases = [];
  const run = await openModel(userId, apple3b, { waitGraceMs: 10, onProgress: ({ phase }) => phases.push(phase) });
  phases.length = 0;
  const otherChat = openModel(userId, cherry1b);
  assert.equal(await state(otherChat), 'waiting', 'the run holds its model');

  // The run asks for an approval; while the user decides, the other chat runs.
  const answer = await run.whileWaiting(async () => {
    const other = await otherChat;
    assert.equal(llama.getStatus().model, 'cherry-1b.gguf');
    other.release();
    return 'approved';
  });
  assert.equal(answer, 'approved');
  assert.equal(llama.getStatus().model, 'apple-3b.gguf', 'its model is loaded again before it goes on');
  assert.deepEqual(phases, ['loading', 'ready']);
  run.release();

  // A wait that ends at once (a Cat's freedom allowing a step) keeps the model.
  const quick = await openModel(userId, apple3b, { waitGraceMs: 1000 });
  const queued = openModel(userId, cherry1b);
  assert.equal(await quick.whileWaiting(async () => 'allowed'), 'allowed');
  assert.equal(await state(queued), 'waiting');
  assert.equal(llama.getStatus().model, 'apple-3b.gguf');
  quick.release();
  (await queued).release();
  assert.equal(llama.getStatus().model, 'cherry-1b.gguf');
});
