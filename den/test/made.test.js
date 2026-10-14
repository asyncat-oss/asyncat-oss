import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// "Made by agents": pictures, files agents saved in project, Cat, agent and
// chat folders, and notes they wrote, in one list; files are reached by a
// folder id and a name, never by a path, and pages come back as text.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-made-'));
process.env.ASYNCAT_WORKSPACE_ROOT = path.join(scratch, 'chats-root');
process.env.IMAGEGEN_OUTPUT_PATH = path.join(scratch, 'pictures');
fs.mkdirSync(process.env.ASYNCAT_WORKSPACE_ROOT, { recursive: true });

const { default: db } = await import('../src/db/client.js');
await import('../src/cats/catStore.js');
const { listMade, madeFile, kindOf } = await import('../src/made/madeIndex.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
const folderId = randomUUID();
const catId = randomUUID();
const projectDir = path.join(scratch, 'garden');
const catDir = path.join(scratch, 'cat-folder');
const write = (file, text = 'x') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);
db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, ?, ?, ?, ?)').run(projectId, 'Balcony garden', userId, userId, workspaceId);
db.prepare("INSERT INTO project_folders (id, project_id, name, path, path_key) VALUES (?, ?, 'Garden', ?, ?)").run(folderId, projectId, projectDir, projectDir.toLowerCase());
db.prepare("INSERT INTO cats (id, user_id, name, mission, folder) VALUES (?, ?, 'Seed price Cat', 'Watch prices', ?)").run(catId, userId, catDir);
db.prepare("INSERT INTO notes (id, title, content, createdby, conversation_id) VALUES (?, 'Watering plan', '<p>Twice a week</p>', ?, 'conv-1')").run(randomUUID(), userId);
db.prepare("INSERT INTO notes (id, title, content, createdby) VALUES (?, 'My own note', '<p>Mine</p>', ?)").run(randomUUID(), userId);

write(path.join(projectDir, '.asyncat', 'artifacts', 'plan.md'), '# Plan');
write(path.join(projectDir, '.asyncat', 'artifacts', 'page.html'), '<script>alert(1)</script>');
write(path.join(catDir, '.asyncat', 'artifacts', 'prices.csv'), 'seed,price\nbasil,2.10');
write(path.join(process.env.ASYNCAT_WORKSPACE_ROOT, '.asyncat-artifacts', 'old.svg'), '<svg/>');
write(path.join(process.env.IMAGEGEN_OUTPUT_PATH, 'basil.png'), 'png');
write(path.join(scratch, 'secret.txt'), 'not yours');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test('everything agents made, in one list with where it is from', () => {
  const made = listMade(userId);
  const byTitle = Object.fromEntries(made.items.map((item) => [item.title, item]));
  assert.equal(byTitle['plan.md'].kind, 'document');
  assert.equal(byTitle['plan.md'].where, 'Balcony garden');
  assert.equal(byTitle['page.html'].kind, 'page');
  assert.equal(byTitle['prices.csv'].where, 'Seed price Cat');
  assert.equal(byTitle['old.svg'].where, 'Chats');
  assert.equal(byTitle['basil.png'].kind, 'picture');
  assert.equal(byTitle['Watering plan'].conversationId, 'conv-1');
  assert.equal(byTitle['My own note'], undefined, 'notes you wrote yourself are not listed');
  assert.equal(made.counts.document, 1);
  assert.equal(kindOf('x.py'), 'code');
});

test('pictures carry what they were made from, and page past the first ones', () => {
  for (let i = 0; i < 205; i += 1) {
    const file = path.join(process.env.IMAGEGEN_OUTPUT_PATH, `made_${String(i).padStart(3, '0')}.png`);
    write(file, 'png');
    fs.utimesSync(file, new Date(Date.now() - (300 - i) * 60_000), new Date(Date.now() - (300 - i) * 60_000));
  }
  fs.writeFileSync(path.join(process.env.IMAGEGEN_OUTPUT_PATH, 'basil.png.json'), JSON.stringify({
    prompt: 'Basil on a sunny sill', runtime: 'stable-diffusion.cpp', model: 'dreamshaper_8.safetensors', width: 512, height: 768, seed: 4113, editedFrom: 'mint.png',
  }));
  const pictures = listMade(userId, { kind: 'picture', limit: 100 });
  assert.equal(pictures.total, 206, 'every picture, not only the first 200');
  assert.ok(pictures.counts.document >= 1, 'counts stay of everything');
  assert.ok(pictures.items.every((item) => item.kind === 'picture'));
  const basil = pictures.items.find((item) => item.name === 'basil.png');
  assert.deepEqual(
    [basil.title, basil.runtime, basil.model, basil.width, basil.height, basil.seed, basil.editedFrom],
    ['Basil on a sunny sill', 'stable-diffusion.cpp', 'dreamshaper_8.safetensors', 512, 768, 4113, 'mint.png'],
  );
  const pages = [0, 100, 200].map((offset) => listMade(userId, { kind: 'picture', limit: 100, offset }).items);
  assert.deepEqual(pages.map((page) => page.length), [100, 100, 6]);
  assert.equal(new Set(pages.flat().map((item) => item.name)).size, 206, 'no picture twice');

  // A page looks for the notes of its own pictures only, not all 206.
  const { readFileSync, lstatSync } = fs;
  const notesLookedFor = new Set();
  const counting = (original) => function countNotes(file, ...rest) {
    if (String(file).endsWith('.png.json')) notesLookedFor.add(String(file));
    return original.call(this, file, ...rest);
  };
  fs.readFileSync = counting(readFileSync);
  fs.lstatSync = counting(lstatSync);
  try {
    assert.equal(listMade(userId, { kind: 'picture', limit: 10 }).items.length, 10);
  } finally {
    Object.assign(fs, { readFileSync, lstatSync });
  }
  assert.equal(notesLookedFor.size, 10);
});

test('files are found by folder id and name only', () => {
  assert.ok(madeFile(userId, `project:${folderId}`, 'plan.md'));
  assert.equal(madeFile(userId, `project:${folderId}`, '../../secret.txt'), null);
  assert.equal(madeFile(userId, `project:${folderId}`, 'missing.md'), null);
  assert.equal(madeFile(userId, 'project:nope', 'plan.md'), null);
  assert.equal(madeFile(randomUUID(), `project:${folderId}`, 'plan.md'), null, 'not another user\'s folders');
});

test('the file route sends pages as sandboxed text', async () => {
  const express = (await import('express')).default;
  const { default: router } = await import('../src/made/madeRoutes.js');
  const app = express();
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.use('/api/made', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/made`;
  try {
    const page = await fetch(`${base}/file?root=project:${folderId}&name=page.html`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/plain/);
    assert.equal(page.headers.get('content-security-policy'), 'sandbox');
    assert.equal(await page.text(), '<script>alert(1)</script>');
    const listed = await (await fetch(base)).json();
    assert.ok(listed.items.length >= 6);
    const pictures = await (await fetch(`${base}?kind=picture&offset=200&limit=50`)).json();
    assert.equal(pictures.items.length, 6);
    assert.equal(pictures.total, 206);
    assert.equal((await fetch(`${base}/file?root=project:${folderId}&name=..%2F..%2Fsecret.txt`)).status, 404);
  } finally {
    server.close();
  }
});

test('links in artifact and picture folders lead nowhere', async () => {
  const secret = path.join(scratch, 'secret.txt');
  const artifacts = path.join(projectDir, '.asyncat', 'artifacts');
  fs.symlinkSync(secret, path.join(artifacts, 'hosts.md'));

  // A Cat whose .asyncat is a link to a folder elsewhere.
  const linkedCatId = randomUUID();
  const linkedCatDir = path.join(scratch, 'linked-cat');
  const elsewhere = path.join(scratch, 'elsewhere');
  write(path.join(elsewhere, 'artifacts', 'leak.md'), 'from elsewhere');
  fs.mkdirSync(linkedCatDir, { recursive: true });
  fs.symlinkSync(elsewhere, path.join(linkedCatDir, '.asyncat'));
  db.prepare("INSERT INTO cats (id, user_id, name, mission, folder) VALUES (?, ?, 'Linked Cat', 'x', ?)").run(linkedCatId, userId, linkedCatDir);

  const pictures = process.env.IMAGEGEN_OUTPUT_PATH;
  fs.symlinkSync(secret, path.join(pictures, 'leak.png'));
  write(path.join(pictures, 'mint.png'), 'png');
  fs.symlinkSync(secret, path.join(pictures, 'mint.png.json'));

  const titles = listMade(userId, { limit: 1000 }).items.map((item) => item.name || item.title);
  assert.ok(!titles.includes('hosts.md'), 'a linked artifact is not listed');
  assert.ok(!titles.includes('leak.md'), 'nor one behind a linked .asyncat');
  assert.ok(!titles.includes('leak.png'), 'nor a linked picture');
  assert.ok(titles.includes('plan.md'), 'real files still are');
  assert.equal(madeFile(userId, `project:${folderId}`, 'hosts.md'), null);
  assert.equal(madeFile(userId, `cat:${linkedCatId}`, 'leak.md'), null);

  const gallery = await import('../src/media/gallery.js');
  assert.equal(gallery.galleryFile('leak.png'), null);
  assert.equal(gallery.galleryFile('mint.png'), path.join(pictures, 'mint.png'));
  const mint = gallery.galleryPictures().find((picture) => picture.name === 'mint.png');
  assert.equal(mint.describe().prompt, null, 'a linked notes file is not read');
  assert.equal(gallery.recordGalleryImage(path.join(pictures, 'mint.png'), { prompt: 'Mint' }), null);
  assert.equal(fs.readFileSync(secret, 'utf8'), 'not yours', 'nor written through');

  // The picture route serves only real pictures.
  const express = (await import('express')).default;
  const { default: mediaRouter } = await import('../src/media/mediaRoutes.js');
  const app = express();
  app.use('/api/media', mediaRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/media/gallery/file`;
    assert.equal((await fetch(`${base}/leak.png`)).status, 404);
    assert.equal((await fetch(`${base}/mint.png`)).status, 200);
  } finally {
    server.close();
  }
});
