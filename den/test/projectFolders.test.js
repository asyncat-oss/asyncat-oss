import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
const tempDb = path.join(os.tmpdir(), `asyncat-project-folders-${suffix}.db`);
const projectRoot = path.join(os.tmpdir(), `asyncat-project-root-${suffix}`);
process.env.DB_PATH = tempDb;
fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
fs.writeFileSync(path.join(projectRoot, 'src', 'index.js'), 'export const ready = true;\n');

const { default: db } = await import('../src/db/client.js');
const {
  publicRoots,
  resolveWorkingDirectoryContext,
} = await import('../src/files/fileExplorerService.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
const folderId = randomUUID();

db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Test')")
  .run(userId, `${suffix}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Internal', ?)")
  .run(workspaceId, userId);
db.prepare(`
  INSERT INTO projects (id, name, created_by, owner_id, team_id)
  VALUES (?, 'Project', ?, ?, ?)
`).run(projectId, userId, userId, workspaceId);
db.prepare(`
  INSERT INTO project_folders (id, project_id, name, path, path_key, is_primary)
  VALUES (?, ?, 'Source', ?, ?, 1)
`).run(folderId, projectId, projectRoot, projectRoot.toLowerCase());

after(() => {
  db.close();
  fs.rmSync(projectRoot, { recursive: true, force: true });
  for (const file of [tempDb, `${tempDb}-wal`, `${tempDb}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('Project folders are exposed as opaque roots and resolve inside their saved boundary', () => {
  const [root] = publicRoots({ userId });
  assert.equal(root.id, `project:${folderId}`);
  assert.equal(root.projectId, projectId);

  const context = resolveWorkingDirectoryContext({
    rootId: root.id,
    projectId,
    relativePath: 'src',
  }, { userId });
  assert.equal(context.workingDir, path.join(projectRoot, 'src'));
  assert.equal(context.projectId, projectId);
});

test('Work rejects legacy roots and paths above the attached Project folder', () => {
  assert.throws(
    () => resolveWorkingDirectoryContext({ rootId: 'workspace', relativePath: '.' }, { userId }),
    error => error?.code === 'PROJECT_FOLDER_REQUIRED',
  );
  assert.throws(
    () => resolveWorkingDirectoryContext({ rootId: `project:${folderId}`, projectId, relativePath: '..' }, { userId }),
    error => error?.code === 'OUTSIDE_ROOT',
  );
});

test('Project roots cannot be resolved through another owner', () => {
  assert.throws(
    () => resolveWorkingDirectoryContext({ rootId: `project:${folderId}`, projectId }, { userId: randomUUID() }),
    error => error?.code === 'ROOT_NOT_FOUND',
  );
});
