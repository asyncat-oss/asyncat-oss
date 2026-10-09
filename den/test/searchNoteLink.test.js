import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Notes have no page of their own; the command palette opens one in the chat
// that created it. Search must return that chat id, or the palette has nowhere
// valid to go (it used to navigate to /notes/:id, which does not exist).

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-search-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

const { default: express } = await import('express');
const { default: db } = await import('../src/db/client.js');
const { default: searchRouter } = await import('../src/search/searchRouter.js');

after(() => {
  try { db.close(); } catch { /* already closed */ }
  fs.rmSync(scratch, { recursive: true, force: true });
});

function getJson(app, url) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get(`http://127.0.0.1:${port}${url}`, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => { server.close(); resolve(JSON.parse(body)); });
      }).on('error', (err) => { server.close(); reject(err); });
    });
  });
}

test('note search results carry the chat they were created in', async () => {
  const userId = randomUUID();
  db.prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)').run(userId, `${userId}@example.test`, 'Test');
  const linked = randomUUID();
  const unlinked = randomUUID();
  const insert = db.prepare('INSERT INTO notes (id, title, content, createdby, conversation_id) VALUES (?, ?, ?, ?, ?)');
  insert.run(linked, 'Quarterly zebra plan', 'zebra details', userId, 'conv-123');
  insert.run(unlinked, 'Old zebra note', 'zebra', userId, null);

  const app = express();
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.use('/api/search', searchRouter);

  const data = await getJson(app, '/api/search?q=zebra&types=notes&limit=10');
  const byId = Object.fromEntries(data.results.map((r) => [r.id, r]));

  assert.equal(byId[linked]._type, 'note');
  assert.equal(byId[linked].conversationId, 'conv-123');
  assert.equal(byId[unlinked].conversationId, null);
});
