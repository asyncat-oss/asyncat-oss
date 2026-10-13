import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// What the agent remembers inside a project stays with that project, while
// memories about the person (and ones saved outside projects) apply everywhere.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-memory-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');

const { default: db } = await import('../src/db/client.js');
const { seed } = await import('../src/db/seed.js');
const memory = await import('../src/agent/tools/memoryTools.js');

await seed();
const user = db.prepare('SELECT id FROM users LIMIT 1').get();
const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get();

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const context = (projectId = null, profileId = null) => ({ userId: user.id, workspaceId: workspace.id, projectId, profileId });
const save = (args, ctx) => memory.saveMemoryTool.execute(args, ctx);
const keys = (rows) => rows.map(row => row.key).sort();

test('the kind of memory decides where it lives unless scope says otherwise', () => {
  assert.equal(memory.memoryProjectFor({ kind: 'project', projectId: 'p1' }), 'p1');
  assert.equal(memory.memoryProjectFor({ kind: 'reference', projectId: 'p1' }), 'p1');
  assert.equal(memory.memoryProjectFor({ kind: 'user', projectId: 'p1' }), null);
  assert.equal(memory.memoryProjectFor({ kind: 'preference', projectId: 'p1' }), null);
  assert.equal(memory.memoryProjectFor({ kind: 'feedback', projectId: 'p1', scope: 'project' }), 'p1');
  assert.equal(memory.memoryProjectFor({ kind: 'project', projectId: 'p1', scope: 'everywhere' }), null);
  assert.equal(memory.memoryProjectFor({ kind: 'project', projectId: null }), null);
});

test('project memories are seen only inside their project', async () => {
  const garden = context('garden');
  const kitchen = context('kitchen');
  const outside = context();

  assert.equal((await save({ kind: 'project', key: 'garden_beds', content: 'The garden has four raised beds of tomatoes.' }, garden)).scope, 'project');
  assert.equal((await save({ kind: 'user', key: 'user_name_pref', content: 'Call the user Sam; Sam likes tomatoes.' }, garden)).scope, 'everywhere');
  await save({ kind: 'project', key: 'kitchen_oven', content: 'The kitchen oven runs hot; tomatoes roast in 20 minutes.' }, kitchen);
  await save({ kind: 'fact', key: 'loose_fact', content: 'Tomatoes were first grown in South America.' }, outside);

  const base = { userId: user.id, workspaceId: workspace.id };
  assert.deepEqual(keys(memory.listMemories({ ...base, projectId: 'garden' })), ['garden_beds', 'loose_fact', 'user_name_pref']);
  assert.deepEqual(keys(memory.listMemories({ ...base, projectId: 'kitchen' })), ['kitchen_oven', 'loose_fact', 'user_name_pref']);
  assert.deepEqual(keys(memory.listMemories({ ...base })), ['loose_fact', 'user_name_pref']);
  assert.deepEqual(keys(memory.listMemories({ ...base, projectId: memory.ALL_PROJECTS })),
    ['garden_beds', 'kitchen_oven', 'loose_fact', 'user_name_pref']);

  assert.deepEqual(keys(memory.searchMemories({ ...base, projectId: 'garden', query: 'tomatoes' })), ['garden_beds', 'loose_fact', 'user_name_pref']);
  assert.deepEqual(keys(memory.searchMemories({ ...base, query: 'tomatoes' })), ['loose_fact', 'user_name_pref']);

  const recalled = await memory.hybridRecall(kitchen, { query: 'tomatoes' });
  assert.deepEqual(keys(recalled.memories), ['kitchen_oven', 'loose_fact', 'user_name_pref']);
});

test('the same key in two projects is two memories, and forgetting removes only the visible one', async () => {
  await save({ kind: 'project', key: 'deadline', content: 'Garden plan due in May.' }, context('garden'));
  await save({ kind: 'project', key: 'deadline', content: 'Kitchen plan due in June.' }, context('kitchen'));
  await save({ kind: 'project', key: 'deadline', content: 'Garden plan due in April.' }, context('garden'));

  const rows = db.prepare("SELECT project_id, content FROM agent_memory WHERE key = 'deadline' ORDER BY project_id").all();
  assert.deepEqual(rows, [
    { project_id: 'garden', content: 'Garden plan due in April.' },
    { project_id: 'kitchen', content: 'Kitchen plan due in June.' },
  ]);

  assert.equal((await memory.forgetMemoryTool.execute({ key: 'deadline' }, context())).success, false);
  assert.equal((await memory.forgetMemoryTool.execute({ key: 'deadline' }, context('garden'))).success, true);
  assert.deepEqual(db.prepare("SELECT project_id FROM agent_memory WHERE key = 'deadline'").all(), [{ project_id: 'kitchen' }]);
});

test('an agent sees its own memories and shared ones, never another agent\'s', async () => {
  await save({ kind: 'reference', key: 'writer_style', content: 'Drafts use short paragraphs about tomatoes.' }, context(null, 'writer'));
  await save({ kind: 'reference', key: 'coder_style', content: 'Code about tomatoes uses two-space indents.' }, context(null, 'coder'));

  const base = { userId: user.id, workspaceId: workspace.id };
  const seen = keys(memory.listMemories({ ...base, profileId: 'writer' }));
  assert.ok(seen.includes('writer_style'));
  assert.ok(seen.includes('loose_fact'));
  assert.ok(!seen.includes('coder_style'));
});
