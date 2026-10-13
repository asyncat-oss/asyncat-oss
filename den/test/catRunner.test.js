import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// A Cat runs with what a chat in its project, with its brain agent, would
// have (instructions, files, the agent's own model) plus its briefing: its
// mission, what woke it, its freedom, folder and sites.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-cat-runner-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');

const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const json = JSON.parse(body || '{}');
    requests.push(json);
    const usage = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 };
    if (json.stream) {
      const chunk = (choices, extra = {}) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: json.model, choices, ...extra })}\n\n`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(chunk([{ index: 0, delta: { role: 'assistant', content: 'Watered the beds.' }, finish_reason: null }]));
      res.write(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]));
      res.write(chunk([], { usage }));
      res.end('data: [DONE]\n\n');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'x', object: 'chat.completion', model: json.model,
      choices: [{ index: 0, message: { role: 'assistant', content: 'Watered the beds.' }, finish_reason: 'stop' }],
      usage,
    }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

const { default: db } = await import('../src/db/client.js');
const { seed } = await import('../src/db/seed.js');
const { initializeAgent } = await import('../src/agent/index.js');
const profiles = await import('../src/agent/ProfileManager.js');
const store = await import('../src/knowledge/knowledgeStore.js');
const { runCat, buildCatBriefing, buildCatGoal } = await import('../src/cats/catRunner.js');

await seed();
await initializeAgent();
const user = db.prepare('SELECT id FROM users LIMIT 1').get();
const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get();

db.prepare(`INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model, api_key, settings, supports_tools)
  VALUES (?, 'custom', 'custom', ?, 'everyday-model', 'test-key', '{}', 0)
  ON CONFLICT(user_id) DO UPDATE SET base_url = excluded.base_url, model = excluded.model`).run(user.id, baseUrl);
const agentModelId = randomUUID();
db.prepare(`INSERT INTO ai_provider_profiles (id, user_id, name, provider_type, provider_id, base_url, model, api_key, settings, supports_tools)
  VALUES (?, ?, 'Gardener model', 'custom', 'custom', ?, 'gardener-model', 'test-key', '{}', 0)`).run(agentModelId, user.id, baseUrl);

const projectId = randomUUID();
db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id, instructions) VALUES (?, ?, ?, ?, ?, ?)')
  .run(projectId, 'Garden planner', user.id, user.id, workspace.id, 'Always answer in metric units.');
await store.addKnowledgeFile({
  ownerType: 'project', ownerId: projectId, userId: user.id, fileName: 'beds.md',
  buffer: Buffer.from('Bed two holds the tomatoes and needs 5 litres a day.'),
});
const agent = profiles.createProfile({
  userId: user.id, name: 'Gardener', instructions: 'You are a careful gardening helper.', modelProfileId: agentModelId,
});

test.after(() => {
  server.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const cat = (overrides = {}) => ({
  id: randomUUID(), userId: user.id, workspaceId: workspace.id, name: 'Garden Cat',
  mission: 'Keep the beds watered: say how much water each needs.', projectId, profileId: agent.id,
  providerProfileId: null, providerSnapshot: {}, allowedTools: [], allowedSites: [], timezone: 'UTC',
  freedom: 'ask_risky', approvalTimeoutMinutes: 120, folder: path.join(scratch, 'cat-folder'),
  limits: { runsPerDay: 10, tokensPerDay: null, minutesPerDay: null, costPerDay: null, pricePerMillion: null },
  usageToday: { runs: 2, tokens: 0, minutes: 0, costUsd: 0 }, ...overrides,
});
const wake = { kind: 'schedule', reason: 'Daily at 7:00' };

test('the briefing has the mission, what woke it, its freedom, folder and sites', () => {
  const briefing = buildCatBriefing({
    cat: cat({ allowedSites: ['example.com'], freedom: 'alone' }), wake, folder: '/tmp/cat', project: { name: 'Garden planner' },
  });
  assert.match(briefing, /You are Garden Cat, a Cat/);
  assert.match(briefing, /Keep the beds watered/);
  assert.match(briefing, /Work alone/);
  assert.match(briefing, /Your working folder is \/tmp\/cat\./);
  assert.match(briefing, /only visit these sites: example\.com/);
  assert.match(briefing, /You share the project "Garden planner"/);
  assert.match(briefing, /Used today: 2 of 10 runs/);
  assert.match(briefing, /What woke you: Daily at 7:00\./);
  assert.match(buildCatGoal({ cat: cat(), wake }), /^It's time for your scheduled run \(Daily at 7:00\)\. Do your mission\./);
  assert.equal(buildCatGoal({ cat: cat(), wake: { kind: 'chat', message: 'How is bed two?' } }), 'How is bed two?');
  assert.match(buildCatGoal({ cat: cat(), wake: { kind: 'rss', reason: 'New post on Garden blog', details: '- Mulch tips' } }), /New post on Garden blog\. Do what your mission needs about it\.\n\n- Mulch tips/);
});

test("the run gets the project and brain instructions, the files, and the brain's model", async () => {
  requests.length = 0;
  const result = await runCat({ cat: cat(), wake });
  assert.equal(result.answer, 'Watered the beds.');
  const run = requests.find((request) => request.messages?.some((m) => m.role === 'system' && String(m.content).includes('Garden planner')));
  assert.ok(run, 'a request carried the project context');
  const system = run.messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n');
  assert.match(system, /Always answer in metric units\./);
  assert.match(system, /You are a careful gardening helper\./);
  assert.match(system, /5 litres a day/);
  assert.match(system, /You are Garden Cat, a Cat/);
  assert.equal(run.model, 'gardener-model');
  assert.ok(fs.existsSync(path.join(scratch, 'cat-folder')), 'its folder is made when it first runs');
});

test("a model picked for the Cat wins over the brain's model", async () => {
  requests.length = 0;
  await runCat({ cat: cat({ providerSnapshot: { provider_type: 'custom', provider_id: 'custom', base_url: baseUrl, model: 'cat-model', api_key: 'test-key' } }), wake });
  assert.ok(requests.length > 0);
  assert.ok(requests.every((request) => request.model === 'cat-model'), requests.map((r) => r.model).join(','));
});
