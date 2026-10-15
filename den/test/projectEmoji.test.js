import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';

// A project keeps the emoji the user picked, or none: den no longer stores the
// folder emoji when nothing was picked (the app shows a plain folder glyph).

const { default: db } = await import('../src/db/client.js');
const { seed } = await import('../src/db/seed.js');
const { attachDb } = await import('../src/db/sqlite.js');
const { default: projectRouter } = await import('../src/users/routes/projectRouters.js');
const { sanitizeEmoji } = await import('../src/users/controllers/project/projectPermissionHelpers.js');

await seed();
const user = db.prepare('SELECT id FROM users LIMIT 1').get();
const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get();

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: user.id }; next(); });
app.use(attachDb);
app.use('/api/projects', projectRouter);
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/api/projects`;
test.after(() => server.close());

const send = (method, url, body) => fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const stored = (id) => db.prepare('SELECT emoji FROM projects WHERE id = ?').get(id).emoji;

test('an emoji is kept only when it is one emoji', () => {
  assert.equal(sanitizeEmoji('🌱'), '🌱');
  assert.equal(sanitizeEmoji(' 🚀 '), '🚀');
  for (const value of [undefined, null, '', 'garden', '<b>', '🌱🌱']) assert.equal(sanitizeEmoji(value), '', String(value));
});

test('a new project without an emoji gets none, not the folder emoji', async () => {
  const plain = await send('POST', base, { name: 'Plain project' });
  assert.equal(plain.success, true, plain.error);
  assert.equal(plain.data.emoji, '');
  assert.equal(stored(plain.data.id), '');

  const picked = await send('POST', base, { name: 'Garden', emoji: '🌱' });
  assert.equal(picked.data.emoji, '🌱');
  assert.equal(stored(picked.data.id), '🌱');

  const junk = await send('POST', base, { name: 'Junk', emoji: 'not an emoji' });
  assert.equal(junk.data.emoji, '');
});

test('the emoji can be taken off again', async () => {
  const project = await send('POST', base, { name: 'Kitchen', emoji: '🍳' });
  const updated = await send('PATCH', `${base}/${project.data.id}/update`, { emoji: '' });
  assert.equal(updated.success, true, updated.error);
  assert.equal(stored(project.data.id), '');
});

test('an older project keeps the folder emoji it was given (the app shows it as none)', async () => {
  const id = randomUUID();
  db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id, emoji) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, 'Old project', user.id, user.id, workspace.id, '📁');
  const { data } = await fetch(base).then((r) => r.json());
  assert.equal(data.find((project) => project.id === id)?.emoji, '📁');
});
