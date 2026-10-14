import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Pinned chats: the chat list (the sidebar, All chats) puts them first, and
// pinning or unpinning doesn't count as activity, so a chat keeps its place
// among recents.

const { default: db } = await import('../src/db/client.js');
const { chatService } = await import('../src/ai/controllers/ai/chatService.js');
const { searchChats } = await import('../src/search/messageIndex.js');

const userId = randomUUID();
const workspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);

const save = (messages, options = {}) => chatService.saveConversation(userId, messages, { workspaceId, ...options });
const updatedAt = (id) => db.prepare('SELECT updated_at FROM conversations WHERE id = ?').get(id).updated_at;

test('pinned chats come first in the chat list, and pinning is not activity', async () => {
  const older = await save([{ id: 'pin-u1', type: 'user', content: 'An older chat', timestamp: '2026-01-01T00:00:00.000Z' }], { title: 'Older' });
  await save([{ id: 'pin-u2', type: 'user', content: 'A newer chat', timestamp: '2026-10-10T00:00:00.000Z' }], { title: 'Newer' });
  const before = updatedAt(older.conversationId);

  const updated = await chatService.updateConversation(userId, older.conversationId, { is_pinned: true }, workspaceId);
  assert.ok(updated.is_pinned);
  assert.equal(updatedAt(older.conversationId), before);

  const { conversations } = await chatService.getUserConversations(userId, { workspaceId, mode: 'all' });
  assert.equal(conversations[0].id, older.conversationId);
  assert.ok(conversations[0].is_pinned);
  assert.ok(conversations.slice(1).every((c) => !c.is_pinned));
  assert.equal(searchChats(db, { userId, query: 'Older' })[0].is_pinned, true, 'search results say so too');

  // A string from a form is read as what it says, not as "truthy".
  await chatService.updateConversation(userId, older.conversationId, { is_pinned: 'false' }, workspaceId);
  const again = await chatService.getUserConversations(userId, { workspaceId, mode: 'all' });
  assert.ok(again.conversations.every((c) => !c.is_pinned));
  assert.equal(again.conversations[0].title, 'Newer');
});

test('renaming still counts as a change', async () => {
  const chat = await save([{ id: 'ren-u1', type: 'user', content: 'Rename me' }], { title: 'Before' });
  db.prepare("UPDATE conversations SET updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(chat.conversationId);
  await chatService.updateConversation(userId, chat.conversationId, { title: 'After', is_pinned: true }, workspaceId);
  assert.notEqual(updatedAt(chat.conversationId), '2026-01-01T00:00:00.000Z');
});
