import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// A chat's artifact cards (/api/agent/artifacts) find files by name in the
// folders agents work in, resolved by den from a root id. A folder sent in
// the X-Workspace-Root header is ignored, so it can't list, read or delete
// files anywhere else.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-artifacts-'));
const chatsRoot = path.join(scratch, 'chats-root');
const projectDir = path.join(scratch, 'garden');
const outside = path.join(scratch, 'outside');
process.env.ASYNCAT_WORKSPACE_ROOT = chatsRoot;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
write(path.join(chatsRoot, '.asyncat', 'artifacts', 'report_a1.md'), '# Report');
write(path.join(projectDir, '.asyncat', 'artifacts', 'plan_b2.md'), '# Plan');
write(path.join(projectDir, '.asyncat', 'artifacts', 'page_c3.html'), '<script>alert(1)</script>');
write(path.join(outside, '.asyncat', 'artifacts', 'secret_d4.md'), 'not yours');

const { default: db } = await import('../src/db/client.js');
const { default: express } = await import('express');
const { default: router } = await import('../src/ai/routes/aiAgentRoutes.js');
const { labelArtifactRoots } = await import('../src/made/madeIndex.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
const folderId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);
db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, ?, ?, ?, ?)').run(projectId, 'Balcony garden', userId, userId, workspaceId);
db.prepare("INSERT INTO project_folders (id, project_id, name, path, path_key) VALUES (?, ?, 'Garden', ?, ?)").run(folderId, projectId, projectDir, projectDir.toLowerCase());

const app = express();
app.use((req, _res, next) => { req.user = { id: userId }; next(); });
app.use('/api/agent', router);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/agent/artifacts`;
const elsewhere = { 'X-Workspace-Root': outside };

test.after(() => {
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('X-Workspace-Root has no effect', async () => {
  const listed = await (await fetch(base, { headers: elsewhere })).json();
  assert.deepEqual(listed.artifacts.map((item) => item.filename), ['report_a1.md'], 'the Chats folder, not the header\'s');
  assert.equal((await fetch(`${base}/secret_d4.md`, { headers: elsewhere })).status, 404);
  assert.equal((await fetch(`${base}/secret_d4.md?download=1`, { headers: elsewhere })).status, 404);
  assert.equal((await fetch(`${base}/secret_d4.md?root=chats`, { method: 'DELETE', headers: elsewhere })).status, 404);
  assert.equal(fs.existsSync(path.join(outside, '.asyncat', 'artifacts', 'secret_d4.md')), true);
});

test('a card finds a file saved in a project folder by its name', async () => {
  const plan = await (await fetch(`${base}/plan_b2.md`)).json();
  assert.equal(plan.content, '# Plan');
  assert.equal(plan.root, `project:${folderId}`);
  assert.equal((await fetch(`${base}/plan_b2.md?root=chats`)).status, 404, 'a root id keeps the look-up there');
  const listed = await (await fetch(`${base}?root=project:${folderId}`)).json();
  assert.deepEqual(listed.artifacts.map((item) => item.filename).sort(), ['page_c3.html', 'plan_b2.md']);
  assert.equal((await fetch(`${base}?root=project:nope`)).status, 404);
  assert.equal((await fetch(`${base}/..%2F..%2Foutside%2F.asyncat%2Fartifacts%2Fsecret_d4.md`)).status, 404);
});

test('downloads are plain bytes in a sandbox', async () => {
  const page = await fetch(`${base}/page_c3.html?download=1`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-type'), 'application/octet-stream');
  assert.equal(page.headers.get('content-security-policy'), 'sandbox');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await page.text(), '<script>alert(1)</script>');
});

test('deleting says which folder, and removes only that file', async () => {
  assert.equal((await fetch(`${base}/plan_b2.md`, { method: 'DELETE' })).status, 400);
  assert.equal((await fetch(`${base}/plan_b2.md?root=project:${folderId}`, { method: 'DELETE' })).status, 200);
  assert.equal(fs.existsSync(path.join(projectDir, '.asyncat', 'artifacts', 'plan_b2.md')), false);
  assert.equal(fs.existsSync(path.join(projectDir, '.asyncat', 'artifacts', 'page_c3.html')), true);
});

test('a name two folders share is read from the folder the card names, never guessed', async () => {
  const inChats = path.join(chatsRoot, '.asyncat', 'artifacts', 'chart.png');
  const inGarden = path.join(projectDir, '.asyncat', 'artifacts', 'chart.png');
  write(inChats, 'chats chart');
  write(inGarden, 'garden chart');
  try {
    const guessed = await fetch(`${base}/chart.png`);
    assert.equal(guessed.status, 409);
    assert.equal((await guessed.json()).code, 'AMBIGUOUS');
    assert.equal((await fetch(`${base}/chart.png?download=1`)).status, 409);
    assert.equal((await (await fetch(`${base}/chart.png?root=chats`)).json()).content, 'chats chart');
    assert.equal(await (await fetch(`${base}/chart.png?download=1&root=project:${folderId}`)).text(), 'garden chart');

    // The run labels a tool's result with the folder its file was saved in.
    const result = labelArtifactRoots(userId, {
      artifact: { filename: 'chart.png', absolutePath: inGarden },
      relatedArtifacts: [{ filename: 'chart.png', absolutePath: inChats }],
    });
    assert.equal(result.artifact.root, `project:${folderId}`);
    assert.equal(result.relatedArtifacts[0].root, 'chats');
    const stray = labelArtifactRoots(userId, { artifact: { absolutePath: path.join(outside, '.asyncat', 'artifacts', 'secret_d4.md') } });
    assert.equal(stray.artifact.root, undefined, 'a folder agents don\'t work in gets no id');
  } finally {
    fs.rmSync(inChats);
    fs.rmSync(inGarden);
  }
});
