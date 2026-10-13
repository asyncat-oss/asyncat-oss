import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Agents work like GPTs/Gems: instructions, starters, knowledge, a model of
// their own and capability switches that really limit their tools.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-agents-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');

const { default: db } = await import('../src/db/client.js');
const { seed } = await import('../src/db/seed.js');
const profiles = await import('../src/agent/ProfileManager.js');
const { addKnowledgeFile } = await import('../src/knowledge/knowledgeStore.js');
const { buildChatContext } = await import('../src/knowledge/chatContext.js');

await seed();
const user = db.prepare('SELECT id FROM users LIMIT 1').get();

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('agents keep instructions, starters, capabilities and an avatar; junk is cleaned', () => {
  const agent = profiles.createProfile({
    userId: user.id,
    name: 'Writing coach',
    instructions: 'Give feedback in three bullet points.',
    starterPrompts: ['Review my intro', '', 'x'.repeat(500), 'Tighten this', 'Fifth', 'Sixth'],
    capabilities: ['web', 'memory', 'made-up'],
    avatarImage: 'javascript:alert(1)',
  });
  assert.equal(agent.instructions, 'Give feedback in three bullet points.');
  assert.equal(agent.starter_prompts.length, 4);
  assert.equal(agent.starter_prompts[1].length, 200);
  assert.deepEqual(agent.capabilities, ['web', 'memory']);
  assert.equal(agent.avatar_image, null);

  const updated = profiles.updateProfile(agent.id, user.id, { capabilities: null, starterPrompts: ['One'] });
  assert.equal(updated.capabilities, null, 'null means every capability');
  assert.deepEqual(updated.starter_prompts, ['One']);
});

test('capabilities turn into an allow-list of tools', () => {
  const tools = [
    { name: 'web_search', category: 'search' },
    { name: 'read_file', category: 'file' },
    { name: 'run_command', category: 'shell' },
    { name: 'save_memory', category: 'memory' },
    { name: 'todo_write', category: 'planning' },
    { name: 'knowledge_search', category: 'search' },
  ];
  assert.equal(profiles.toolsForCapabilities(null, tools), null);
  assert.deepEqual(profiles.toolsForCapabilities(['memory'], tools), ['save_memory', 'todo_write', 'knowledge_search']);
  assert.deepEqual(profiles.toolsForCapabilities([], tools), ['todo_write', 'knowledge_search']);
  assert.ok(profiles.toolsForCapabilities(['files'], tools).includes('run_command'));
});

test('an old custom soul becomes the agent instructions on upgrade', async () => {
  const id = randomUUID();
  db.prepare("INSERT INTO agent_profiles (id, user_id, handle, name, soul_override, instructions) VALUES (?, ?, ?, ?, ?, '')")
    .run(id, user.id, `legacy-${id.slice(0, 6)}`, 'Legacy', '  Always speak like a pirate.  ');
  // Re-run the module's upgrade step on a fresh import.
  await import(`../src/agent/ProfileManager.js?again=${id}`);
  assert.equal(profiles.getProfile(id, user.id).instructions, 'Always speak like a pirate.');
});

test("an agent's instructions and knowledge reach its chats", async () => {
  const agent = profiles.createProfile({ userId: user.id, name: 'Chef', instructions: 'Suggest one wine pairing.' });
  await addKnowledgeFile({ ownerType: 'agent', ownerId: agent.id, userId: user.id, fileName: 'pantry.txt', buffer: Buffer.from('Pantry: rice, lentils, saffron.') });
  const context = buildChatContext({ agent, query: 'What can I cook?', resolvedClient: { model: 'gpt-4.1', providerInfo: { providerId: 'openai', settings: {} } } });
  assert.match(context.prompt, /Instructions for this agent “Chef”/);
  assert.match(context.prompt, /Suggest one wine pairing/);
  assert.match(context.prompt, /saffron/);
  assert.deepEqual(context.sources, [{ type: 'agent', id: agent.id }]);
});
