import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// Files attached in a project chat land in the folder's .asyncat/attachments
// under a name den picks; a path sent by the client can't put them anywhere
// else, and neither can a link in the project.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-attach-'));
const projectDir = path.join(scratch, 'garden');
const linkedDir = path.join(scratch, 'linked');
const outside = path.join(scratch, 'outside');
fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(linkedDir, { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.symlinkSync(outside, path.join(linkedDir, '.asyncat'));

const { default: db } = await import('../src/db/client.js');
const { writeAttachment, attachmentName } = await import('../src/files/fileExplorerService.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
const folderId = randomUUID();
const linkedFolderId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);
db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, ?, ?, ?, ?)').run(projectId, 'Balcony garden', userId, userId, workspaceId);
const addFolder = db.prepare("INSERT INTO project_folders (id, project_id, name, path, path_key) VALUES (?, ?, ?, ?, ?)");
addFolder.run(folderId, projectId, 'Garden', projectDir, projectDir.toLowerCase());
addFolder.run(linkedFolderId, projectId, 'Linked', linkedDir, linkedDir.toLowerCase());

const attachments = path.join(projectDir, '.asyncat', 'attachments');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test('a plain name is all that is kept of what the client sent', () => {
  assert.equal(attachmentName('../../etc/passwd'), 'passwd');
  assert.equal(attachmentName('C:\\Users\\demo\\notes.txt'), 'notes.txt');
  assert.equal(attachmentName('.bashrc'), 'bashrc');
  assert.equal(attachmentName('seed list (final).pdf'), 'seed-list-final.pdf');
  assert.equal(attachmentName('été.md'), 'été.md');
  assert.equal(attachmentName('..'), 'attachment');
  assert.equal(attachmentName(''), 'attachment');
});

test('attachments go to .asyncat/attachments under a name den picks', () => {
  const first = writeAttachment({ rootId: `project:${folderId}`, name: 'plan.md', content: Buffer.from('# Plan'), userId });
  const second = writeAttachment({ rootId: `project:${folderId}`, name: 'plan.md', content: Buffer.from('# Other'), userId });
  assert.match(first.path, /^\.asyncat\/attachments\/\d+-[0-9a-f]{6}-plan\.md$/);
  assert.notEqual(first.path, second.path, 'the same name twice keeps both');
  assert.equal(fs.readFileSync(path.join(projectDir, first.path), 'utf8'), '# Plan');
  assert.equal(fs.readFileSync(path.join(projectDir, second.path), 'utf8'), '# Other');
});

test('only folders of your own projects, and never through a link', () => {
  assert.throws(
    () => writeAttachment({ rootId: 'home', name: 'a.txt', content: Buffer.from('x'), userId }),
    (err) => err.code === 'PROJECT_FOLDER_REQUIRED',
  );
  assert.throws(
    () => writeAttachment({ rootId: `project:${folderId}`, name: 'a.txt', content: Buffer.from('x'), userId: randomUUID() }),
    (err) => err.code === 'ROOT_NOT_FOUND',
  );
  assert.throws(
    () => writeAttachment({ rootId: `project:${linkedFolderId}`, name: 'a.txt', content: Buffer.from('x'), userId }),
    (err) => err.code === 'OUTSIDE_ROOT',
  );
  assert.deepEqual(fs.readdirSync(outside), [], 'nothing was made where the link leads');
});

test('POST /api/files/upload saves the file and says where', async () => {
  const express = (await import('express')).default;
  const { default: router } = await import('../src/files/fileRoutes.js');
  const app = express();
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.use('/api/files', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/files/upload`;
  const send = (fields, fileName = 'notes.txt') => {
    const form = new FormData();
    form.append('file', new Blob(['seed list']), fileName);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return fetch(url, { method: 'POST', body: form });
  };
  try {
    const res = await send({ rootId: `project:${folderId}`, name: 'seeds.txt' });
    assert.equal(res.status, 200);
    const saved = await res.json();
    assert.match(saved.path, /^\.asyncat\/attachments\/.+-seeds\.txt$/);
    assert.equal(fs.readFileSync(path.join(projectDir, saved.path), 'utf8'), 'seed list');

    // An older client's whole path: only its name is used.
    const before = new Set(fs.readdirSync(attachments));
    const old = await (await send({ rootId: `project:${folderId}`, path: '../../../escape.txt' }, '../../../escape.txt')).json();
    assert.match(old.path, /^\.asyncat\/attachments\/.+-escape\.txt$/);
    assert.equal(fs.existsSync(path.join(scratch, 'escape.txt')), false);
    assert.equal(fs.readdirSync(attachments).filter((name) => !before.has(name)).length, 1);

    assert.equal((await send({ rootId: 'workspace', name: 'a.txt' })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', body: new FormData() })).status, 400);
  } finally {
    server.close();
  }
});
