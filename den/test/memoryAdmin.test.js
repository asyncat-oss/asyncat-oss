import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// The Memory page: whose a memory is (a project's, an agent's, a Cat's or
// shared), one owner's memories, and editing or adding memories by hand.

const { default: db } = await import('../src/db/client.js');
await import('../src/cats/catStore.js'); // makes the cats table
const { addMemory, nameOwners, ownedBy, ownerFilter, updateMemory } = await import('../src/agent/memoryAdmin.js');
const { listMemories, normalizeMemoryRow, ALL_PROJECTS, ALL_CATS } = await import('../src/agent/tools/memoryTools.js');
const { createProfile } = await import('../src/agent/ProfileManager.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
const catId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);
db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, ?, ?, ?, ?)').run(projectId, 'Balcony garden', userId, userId, workspaceId);
db.prepare("INSERT INTO cats (id, user_id, name, mission) VALUES (?, ?, 'Seed price Cat', 'Watch seed prices')").run(catId, userId);
const agent = createProfile({ userId, name: 'Garden helper' });

test('memories can be added for anyone, then found by whose they are', () => {
  const shared = addMemory({ userId, workspaceId, content: 'Prefers metric units.', kind: 'preference' });
  const forProject = addMemory({ userId, workspaceId, content: 'Pots are on the south rail.', scope: `project:${projectId}` });
  const forAgent = addMemory({ userId, workspaceId, content: 'Answer in short lists.', kind: 'feedback', scope: `agent:${agent.id}` });
  const forCat = addMemory({ userId, workspaceId, content: 'Seeds cost 3.20 last week.', scope: `cat:${catId}` });
  assert.equal(shared.source, 'user');
  assert.throws(() => addMemory({ userId, workspaceId, content: '   ' }), /needs some text/);

  const all = listMemories({ userId, workspaceId, projectId: ALL_PROJECTS, catId: ALL_CATS, limit: 50 });
  const named = nameOwners(all);
  const byContent = Object.fromEntries(named.map((row) => [row.content, row]));
  assert.equal(byContent['Pots are on the south rail.'].project_name, 'Balcony garden');
  assert.equal(byContent['Answer in short lists.'].agent_name, 'Garden helper');
  assert.equal(byContent['Seeds cost 3.20 last week.'].cat_name, 'Seed price Cat', 'the Cat a memory belongs to is kept');

  const owned = (scope) => {
    const filter = ownerFilter(scope);
    return db.prepare(`SELECT * FROM agent_memory WHERE user_id = ? ${filter.sql}`).all(userId, ...filter.params).map((row) => row.content);
  };
  assert.deepEqual(owned(`project:${projectId}`), ['Pots are on the south rail.']);
  assert.deepEqual(owned(`agent:${agent.id}`), ['Answer in short lists.']);
  assert.deepEqual(owned(`cat:${catId}`), ['Seeds cost 3.20 last week.']);
  assert.deepEqual(owned('shared'), ['Prefers metric units.']);
  assert.equal(owned('all').length, 4);
  assert.equal(ownedBy(normalizeMemoryRow(forCat), `cat:${catId}`), true);
  assert.equal(ownedBy(normalizeMemoryRow(forCat), 'shared'), false);
  assert.equal(ownedBy(normalizeMemoryRow(forProject), `project:${projectId}`), true);
  assert.equal(ownedBy(normalizeMemoryRow(forAgent), `agent:${agent.id}`), true);
});

test('editing a memory changes its text and drops the stale embedding', () => {
  const row = addMemory({ userId, workspaceId, content: 'Waters at 7.' });
  db.prepare("UPDATE agent_memory SET embedding = '[1,2]', embedding_model = 'm', embedding_dim = 2 WHERE id = ?").run(row.id);
  const kindOnly = updateMemory({ userId, id: row.id, kind: 'preference' });
  assert.equal(kindOnly.memory_type, 'preference');
  assert.equal(kindOnly.embedding, '[1,2]', 'same text keeps its embedding');
  const edited = updateMemory({ userId, id: row.id, content: 'Waters at 6 in summer.', importance: 2 });
  assert.equal(edited.content, 'Waters at 6 in summer.');
  assert.equal(edited.importance, 1);
  assert.equal(edited.embedding, null);
  assert.throws(() => updateMemory({ userId: randomUUID(), id: row.id, content: 'x' }), /not found/);
  // The search index follows the edit.
  const hit = db.prepare('SELECT memory_id FROM agent_memory_fts WHERE agent_memory_fts MATCH ?').all('summer');
  assert.ok(hit.some((item) => item.memory_id === row.id));
});

test('Consolidate never merges memories you wrote, and its plain merge keeps one per line', async () => {
  const { memoryConsolidator } = await import('../src/agent/MemoryConsolidator.js');
  const ws = randomUUID();
  db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Garden', ?)").run(ws, userId);
  for (const content of ['The water tank holds 200 litres.', 'The basil is on the left shelf.', 'Tomatoes get water every two days.']) {
    addMemory({ userId, workspaceId: ws, content, importance: 0.5 });
  }
  assert.deepEqual(memoryConsolidator.preview({ userId, workspaceId: ws }), { clusters: 0, memories: 0 }, 'hand-written ones are left alone');

  const agentNote = (content) => db.prepare(`
    INSERT INTO agent_memory (id, user_id, workspace_id, memory_type, key, content, tags, importance, source)
    VALUES (?, ?, ?, 'fact', ?, ?, '[]', 0.4, 'auto')
  `).run(randomUUID(), userId, ws, `fact_${randomUUID().slice(0, 6)}`, content);
  ['Mint is in the blue pot.', 'The hose is by the door.', 'Compost is turned on Sundays.'].forEach(agentNote);
  assert.deepEqual(memoryConsolidator.preview({ userId, workspaceId: ws }), { clusters: 1, memories: 3 });

  const result = await memoryConsolidator.consolidate({ userId, workspaceId: ws });
  assert.deepEqual([result.merged, result.deleted], [1, 3]);
  const rows = db.prepare('SELECT content, source FROM agent_memory WHERE workspace_id = ? ORDER BY created_at').all(ws);
  assert.equal(rows.filter((row) => row.source === 'user').length, 3, 'yours stay as they were');
  const merged = rows.find((row) => row.content.includes('Mint'));
  assert.equal(merged.content, 'Mint is in the blue pot.\nThe hose is by the door.\nCompost is turned on Sundays.');
});
