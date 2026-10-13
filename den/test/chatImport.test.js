import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import JSZip from 'jszip';

// Chats and memories from ChatGPT and Claude data exports, with made-up
// conversations shaped like theirs: ChatGPT's message tree (with an edited
// branch, a hidden system message and a tool call to leave out) and
// Claude's flat list.

const { default: db } = await import('../src/db/client.js');
const { readExport, summarize, importChats, importMemories, parseMemories, fromChatGPT } = await import('../src/importers/chatImport.js');

const userId = randomUUID();
const workspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);

const node = (id, parent, children, role, parts, extra = {}) => ({
  id,
  parent,
  children,
  message: role ? { id, author: { role }, create_time: 1_760_000_000 + Number(id.replace(/\D/g, '') || 0), content: { content_type: 'text', parts }, recipient: 'all', ...extra } : null,
});

const chatgpt = [{
  title: 'Balcony tomatoes',
  conversation_id: 'cg-1',
  create_time: 1_760_000_000,
  update_time: 1_760_000_100,
  current_node: 'n6',
  mapping: {
    root: node('root', null, ['n1'], null),
    n1: node('n1', 'root', ['n2'], 'system', ['You are helpful.'], { metadata: { is_visually_hidden_from_conversation: true } }),
    n2: node('n2', 'n1', ['n3', 'n3b'], 'user', ['Which tomatoes for a balcony?']),
    n3b: node('n3b', 'n2', [], 'assistant', ['An answer from a branch that was replaced.']),
    n3: node('n3', 'n2', ['n4'], 'assistant', ['Cherry tomatoes like ', 'Sungold.']),
    n4: node('n4', 'n3', ['n5'], 'assistant', ['search("tomato")'], { recipient: 'browser' }),
    n5: node('n5', 'n4', ['n6'], 'user', ['How much water?']),
    n6: node('n6', 'n5', [], 'assistant', ['Deeply, twice a week.']),
  },
}];

const claude = [{
  uuid: 'cl-1',
  name: 'Basil care',
  created_at: '2025-05-01T09:00:00Z',
  updated_at: '2025-05-01T09:05:00Z',
  chat_messages: [
    { uuid: 'a', sender: 'human', text: 'How do I keep basil bushy?', created_at: '2025-05-01T09:00:00Z' },
    { uuid: 'b', sender: 'assistant', text: '', content: [{ type: 'text', text: 'Pinch the tops every week.' }, { type: 'tool_use', name: 'x' }], created_at: '2025-05-01T09:00:05Z' },
  ],
}, { uuid: 'cl-2', name: 'Empty', chat_messages: [] }];

test('a ChatGPT export: the branch that was showing, without hidden or tool messages', async () => {
  const zip = new JSZip();
  zip.file('conversations.json', JSON.stringify(chatgpt));
  zip.file('chat.html', '<html></html>');
  const data = await readExport(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(data.format, 'chatgpt');
  const chat = data.chats[0];
  assert.deepEqual(chat.messages.map((m) => [m.role, m.content]), [
    ['user', 'Which tomatoes for a balcony?'],
    ['assistant', 'Cherry tomatoes like \nSungold.'],
    ['user', 'How much water?'],
    ['assistant', 'Deeply, twice a week.'],
  ]);
  assert.equal(chat.createdAt, new Date(1_760_000_000 * 1000).toISOString());
  assert.equal(fromChatGPT({ mapping: {} }).messages.length, 0);

  const preview = summarize(userId, data);
  assert.equal(preview.newChats, 1);
  assert.deepEqual(preview.sample, ['Balcony tomatoes']);

  const result = importChats(userId, data, { workspaceId });
  assert.deepEqual(result, { imported: 1, skipped: 0, messages: 4 });
  const row = db.prepare("SELECT * FROM conversations WHERE user_id = ? AND title = 'Balcony tomatoes'").get(userId);
  assert.equal(row.created_at, new Date(1_760_000_000 * 1000).toISOString(), 'keeps its date');
  const stored = JSON.parse(row.messages);
  assert.equal(stored[0].user, 'Which tomatoes for a balcony?');
  assert.equal(stored[3].cat, 'Deeply, twice a week.');
  assert.equal(JSON.parse(row.metadata).importedFrom.id, 'cg-1');
  assert.ok(db.prepare("SELECT 1 FROM conversations_fts WHERE conversations_fts MATCH 'tomatoes'").get(), 'searchable by title');

  assert.deepEqual(importChats(userId, data, { workspaceId }), { imported: 0, skipped: 1, messages: 0 }, 'not twice');
  assert.equal(summarize(userId, data).newChats, 0);
});

test('a Claude export, its conversations.json on its own', async () => {
  const data = await readExport(Buffer.from(JSON.stringify(claude)));
  assert.equal(data.format, 'claude');
  assert.equal(data.chats.length, 1, 'empty chats are left out');
  assert.deepEqual(data.chats[0].messages.map((m) => m.content), ['How do I keep basil bushy?', 'Pinch the tops every week.']);
  assert.equal(importChats(userId, data, { workspaceId }).imported, 1);
  await assert.rejects(readExport(Buffer.from('{"nope": 1}')), /doesn't look like/);
  await assert.rejects(readExport(Buffer.from('not json')), /isn't JSON/);
  const zip = new JSZip();
  zip.file('other.json', '[]');
  await assert.rejects(readExport(await zip.generateAsync({ type: 'nodebuffer' })), /no conversations\.json/);
});

test('memories: pasted lines or a memories.json, without repeats', async () => {
  assert.deepEqual(parseMemories('- Lives in a flat with a south balcony\n- Prefers metric units\n\n2. Grows basil'), [
    'Lives in a flat with a south balcony', 'Prefers metric units', 'Grows basil',
  ]);
  assert.deepEqual(parseMemories('[{"content":"Likes short answers"},"Uses Linux"]'), ['Likes short answers', 'Uses Linux']);
  const first = importMemories(userId, ['Prefers metric units', 'Grows basil'], { workspaceId });
  assert.deepEqual(first, { added: 2, skipped: 0 });
  assert.deepEqual(importMemories(userId, ['Grows basil'], { workspaceId }), { added: 0, skipped: 1 });
  const zip = new JSZip();
  zip.file('conversations.json', JSON.stringify(claude));
  zip.file('memories.json', JSON.stringify({ memories: [{ text: 'Waters at 7' }] }));
  assert.deepEqual((await readExport(await zip.generateAsync({ type: 'nodebuffer' }))).memories, ['Waters at 7']);
});

test('the import routes: preview, import, paste memories', async () => {
  const express = (await import('express')).default;
  const { default: router } = await import('../src/importers/importRoutes.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.use('/api/import', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/import`;
  try {
    const fresh = [{ ...claude[0], uuid: 'cl-9', name: 'Strawberries' }];
    const form = new FormData();
    form.append('file', new Blob([JSON.stringify(fresh)]), 'conversations.json');
    const preview = await (await fetch(`${base}/chats/preview`, { method: 'POST', body: form })).json();
    assert.equal(preview.preview.format, 'claude');
    assert.equal(preview.preview.newChats, 1);
    const done = await (await fetch(`${base}/chats?workspaceId=${workspaceId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: preview.token }) })).json();
    assert.equal(done.chats.imported, 1);
    const again = await fetch(`${base}/chats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: preview.token }) });
    assert.equal(again.status, 410, 'a read file is used once');
    const pasted = await (await fetch(`${base}/memories`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '• Has a cat called Miso' }) })).json();
    assert.equal(pasted.added, 1);
  } finally {
    server.close();
  }
});
