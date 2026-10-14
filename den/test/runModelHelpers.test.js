import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// What a run does on the side (sub-agents, describing a picture, saying what
// it can see) uses the run's own model, not the app's default: a chat on a
// model that reads images can look at one even when the default can't.

const { default: db } = await import('../src/db/client.js');
const { clientForToolContext } = await import('../src/ai/controllers/ai/clientFactory.js');
const { getMultimodalCapabilities } = await import('../src/agent/multimodalCapabilities.js');

const userId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'demo@example.test', 'Demo')").run(userId);
db.prepare(`INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model, api_key, settings, supports_tools)
  VALUES (?, 'custom', 'custom', 'http://127.0.0.1:9/v1', 'plain-model', 'test-key', '{}', 0)`).run(userId);

test.after(() => db.close());

const runModel = {
  client: { name: 'the run\'s client' },
  model: 'gpt-4o',
  isLocal: false,
  supportsNativeTools: true,
  providerInfo: { providerId: 'openai', model: 'gpt-4o', name: 'OpenAI', settings: {} },
};

test("a tool inside a run calls the run's model; outside one, the default", () => {
  const inside = clientForToolContext({
    userId, aiClient: runModel.client, model: runModel.model, isLocal: false, supportsNativeTools: true, providerInfo: runModel.providerInfo,
  });
  assert.equal(inside.client, runModel.client);
  assert.equal(inside.model, 'gpt-4o');
  assert.equal(inside.providerInfo.name, 'OpenAI');
  assert.equal(clientForToolContext({ userId }).model, 'plain-model');
});

test("what a run can see follows the run's model", async () => {
  const byDefault = await getMultimodalCapabilities(userId);
  assert.equal(byDefault.vision.ready, false);
  assert.equal(byDefault.vision.model, 'plain-model');
  const forRun = await getMultimodalCapabilities(userId, { resolvedClient: runModel });
  assert.equal(forRun.vision.ready, true);
  assert.equal(forRun.vision.model, 'gpt-4o');
  assert.equal(runModel.providerInfo.providerId, 'openai', "the run's own details are left as they were");
});
