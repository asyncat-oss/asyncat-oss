import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
const tempDb = path.join(os.tmpdir(), `asyncat-conversation-project-${suffix}.db`);
process.env.DB_PATH = tempDb;

const { default: rawDb } = await import('../src/db/client.js');
const { chatService } = await import('../src/ai/controllers/ai/chatService.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();

rawDb.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Test')")
  .run(userId, `${suffix}@example.test`);
rawDb.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Internal', ?)")
  .run(workspaceId, userId);
rawDb.prepare(`
  INSERT INTO projects (id, name, created_by, owner_id, team_id)
  VALUES (?, 'Project', ?, ?, ?)
`).run(projectId, userId, userId, workspaceId);

after(() => {
  rawDb.close();
  for (const file of [tempDb, `${tempDb}-wal`, `${tempDb}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('a conversation can clear its Project instead of retaining stale global context', async () => {
  const created = await chatService.saveConversation(userId, [
    { id: 'user-1', type: 'user', content: 'Start in this Project' },
  ], {
    workspaceId,
    mode: 'work',
    projectIds: [projectId],
    metadata: {
      projectScope: 'project',
      workingContext: { rootId: 'project:folder-1', projectId, relativePath: '.' },
    },
  });

  await chatService.saveConversation(userId, [
    { id: 'user-1', type: 'user', content: 'Start in this Project' },
    { id: 'assistant-1', type: 'assistant', content: 'Done' },
  ], {
    workspaceId,
    conversationId: created.conversationId,
    projectIds: [],
    metadata: { projectScope: 'none', workingContext: null },
  });

  const row = rawDb.prepare('SELECT project_ids, metadata FROM conversations WHERE id = ?')
    .get(created.conversationId);
  assert.deepEqual(JSON.parse(row.project_ids), []);
  assert.deepEqual(JSON.parse(row.metadata), { projectScope: 'none', workingContext: null });
});
