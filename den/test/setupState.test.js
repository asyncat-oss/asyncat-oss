import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';

// First-run setup (den/src/setup/): the app opens it on a fresh install
// only (no model chosen, no saved provider, nothing downloaded, no chats)
// until it is finished or skipped, and /api/setup reads and marks that.

const { default: db } = await import('../src/db/client.js');
const { getConfigValue } = await import('../src/config/appConfig.js');
const state = await import('../src/setup/setupState.js');
const { default: setupRouter } = await import('../src/setup/setupRoutes.js');

test.after(() => db.close());

function addUser(id) {
  db.prepare("INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, 'User')").run(id, `${id}@asyncat`);
}

test('the setup shows on a fresh install only, until it is finished or skipped', () => {
  addUser('fresh-user');
  const none = { localModels: () => [] };
  assert.deepEqual(state.setupStatus('fresh-user', none), { done: false, hasModel: false, hasChats: false, show: true });

  // People who used Asyncat before: a chosen model, a saved provider, or a downloaded model.
  assert.equal(state.setupStatus('fresh-user', { localModels: () => [{ filename: 'x.gguf' }] }).show, false);
  assert.equal(state.setupStatus('fresh-user', { localModels: () => [{ filename: 'y.gguf', source: 'huggingface-cache' }] }).show, true, "another app's cache doesn't count");
  db.prepare("INSERT INTO ai_provider_profiles (id, user_id, name, provider_type, provider_id, base_url, model) VALUES ('p1', 'fresh-user', 'OpenAI', 'cloud', 'openai', 'https://api.openai.com/v1', 'gpt-test')").run();
  assert.deepEqual(state.setupStatus('fresh-user', none), { done: false, hasModel: true, hasChats: false, show: false });
  db.prepare("DELETE FROM ai_provider_profiles WHERE user_id = 'fresh-user'").run();
  db.prepare("INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model) VALUES ('fresh-user', 'cloud', 'openai', 'https://api.openai.com/v1', 'gpt-test')").run();
  assert.equal(state.setupStatus('fresh-user', none).show, false);
  db.prepare("UPDATE ai_provider_config SET provider_type = 'local', provider_id = 'llamacpp-builtin', model = '' WHERE user_id = 'fresh-user'").run();
  assert.equal(state.setupStatus('fresh-user', none).show, true, 'a built-in engine with no model is no model');
  db.prepare("DELETE FROM ai_provider_config WHERE user_id = 'fresh-user'").run();
  assert.equal(state.setupStatus('fresh-user', { localModels: () => { throw new Error('unreadable'); } }).show, true);

  // Chats without a model: Claude Code, Codex or an ACP agent answered them.
  db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES ('fresh-ws', 'Mine', 'fresh-user')").run();
  db.prepare("INSERT INTO conversations (id, user_id, workspace_id, title) VALUES ('fresh-chat', 'fresh-user', 'fresh-ws', 'Plans')").run();
  assert.deepEqual(state.setupStatus('fresh-user', none), { done: false, hasModel: false, hasChats: true, show: false });
  db.prepare("DELETE FROM conversations WHERE user_id = 'fresh-user'").run();

  state.markSetupDone(true);
  assert.equal(getConfigValue(state.SETUP_DONE_KEY), '1');
  assert.deepEqual(state.setupStatus('fresh-user', none), { done: true, hasModel: false, hasChats: false, show: false });
  state.markSetupDone(false);
  assert.equal(getConfigValue(state.SETUP_DONE_KEY), null);
  assert.equal(state.setupStatus('fresh-user', none).show, true);
  assert.throws(() => state.markSetupDone('yes'), { status: 400 });
});

test('/api/setup: read it, mark it done, and refuse anything but true or false', async () => {
  addUser('route-user');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'route-user' }; next(); });
  app.use('/api/setup', setupRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/setup`;
  const call = (method, body) => fetch(base, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: await res.json() }));
  try {
    state.markSetupDone(false);
    const first = await call('GET');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.setup, { done: false, hasModel: false, hasChats: false, show: true });

    const done = await call('PUT', { done: true });
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.setup, { done: true, hasModel: false, hasChats: false, show: false });

    const bad = await call('PUT', { done: 'sure' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /true or false/);
    assert.equal((await call('GET')).body.setup.done, true, 'a bad request changes nothing');

    const again = await call('PUT', { done: false });
    assert.equal(again.body.setup.show, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
