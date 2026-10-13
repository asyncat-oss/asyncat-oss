import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { mergeStaleMessages, knownMessageIds } from '../src/ai/controllers/ai/messageMerge.js';

const msg = (id, minute, role = 'user') => ({
  id,
  [role === 'user' ? 'user' : 'cat']: `${id} text`,
  timestamp: new Date(Date.UTC(2026, 9, 14, 9, minute)).toISOString(),
});
const ids = (list) => list.map((message) => message.id);

test('a stale save keeps messages the server added since', () => {
  const stored = [msg('u1', 0), msg('a1', 1, 'cat'), msg('run-u', 5), msg('run-a', 6, 'cat')];
  const posted = [msg('u1', 0), msg('a1', 1, 'cat'), msg('u2', 10), msg('a2', 11, 'cat')];
  const { messages, kept } = mergeStaleMessages({ stored, posted, knownIds: ['u1', 'a1'] });
  assert.equal(kept, 2);
  assert.deepEqual(ids(messages), ['u1', 'a1', 'run-u', 'run-a', 'u2', 'a2']);
});

test('messages the sender saw and dropped stay dropped', () => {
  // Regenerating the first answer drops the turns after it on purpose.
  const stored = [msg('u1', 0), msg('a1', 1, 'cat'), msg('u2', 2), msg('a2', 3, 'cat')];
  const posted = [msg('u1', 0), { ...msg('a1', 4, 'cat'), cat: 'new answer' }];
  const { messages, kept } = mergeStaleMessages({ stored, posted, knownIds: ['u1', 'a1', 'u2', 'a2'] });
  assert.equal(kept, 0);
  assert.deepEqual(ids(messages), ['u1', 'a1']);
  assert.equal(messages[1].cat, 'new answer');
});

test('messages kept in another branch count as seen', () => {
  const stored = [msg('u1', 0), msg('a1', 1, 'cat'), msg('u2', 2)];
  const posted = [msg('u1', 0), msg('u2b', 5)];
  const metadata = { branches: [{ id: 'main', messages: [msg('u1', 0), msg('a1', 1, 'cat'), msg('u2', 2)] }] };
  const { messages, kept } = mergeStaleMessages({ stored, posted, knownIds: [], metadata });
  assert.equal(kept, 0);
  assert.deepEqual(ids(messages), ['u1', 'u2b']);
});

test('a sender that lists nothing it has seen loses nothing', () => {
  const stored = [msg('u1', 0), msg('a1', 1, 'cat'), msg('u2', 2), msg('a2', 3, 'cat')];
  const posted = [msg('u1', 0), msg('a1', 1, 'cat')];
  const { messages, kept } = mergeStaleMessages({ stored, posted });
  assert.equal(kept, 2);
  assert.deepEqual(ids(messages), ['u1', 'a1', 'u2', 'a2']);
});

test('unseen messages go after own messages that are older than them', () => {
  const stored = [msg('u1', 0), msg('a1', 1, 'cat'), msg('late', 9, 'cat')];
  const posted = [msg('u1', 0), msg('a1', 1, 'cat'), msg('mine', 5), msg('mine-a', 6, 'cat'), msg('next', 12)];
  const { messages } = mergeStaleMessages({ stored, posted, knownIds: ['u1', 'a1'] });
  assert.deepEqual(ids(messages), ['u1', 'a1', 'mine', 'mine-a', 'late', 'next']);
});

test('unseen messages before anything the sender has go first', () => {
  const stored = [msg('s1', 0), msg('s2', 1, 'cat')];
  const posted = [msg('c1', 5)];
  const { messages } = mergeStaleMessages({ stored, posted, knownIds: [] });
  assert.deepEqual(ids(messages), ['s1', 's2', 'c1']);
});

test('stored messages without ids are never duplicated', () => {
  const stored = [{ user: 'old', timestamp: '2026-01-01T00:00:00Z' }, msg('a1', 1, 'cat')];
  const posted = [msg('msg_0', 0), msg('a1', 1, 'cat')];
  const { messages, kept } = mergeStaleMessages({ stored, posted, knownIds: [] });
  assert.equal(kept, 0);
  assert.equal(messages.length, 2);
});

test('knownMessageIds collects every source', () => {
  const known = knownMessageIds({
    posted: [msg('p', 0)],
    knownIds: ['k', 7, null],
    metadata: { branches: [{ messages: [msg('b', 0)] }] },
  });
  assert.deepEqual([...known].sort(), ['b', 'k', 'p']);
});

test('saving a stale chat through the chat service keeps the run it missed', async () => {
  const { default: db } = await import('../src/db/client.js');
  const { chatService } = await import('../src/ai/controllers/ai/chatService.js');
  const { subscribeAppEvents } = await import('../src/lib/appEvents.js');

  const userId = randomUUID();
  const workspaceId = randomUUID();
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Test')").run(userId, `${userId}@example.test`);
  db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Mine', ?)").run(workspaceId, userId);

  const events = [];
  const off = subscribeAppEvents((event) => events.push(event));
  try {
    const first = [
      { id: 'u1', type: 'user', content: 'hello', timestamp: '2026-10-14T09:00:00.000Z' },
      { id: 'a1', type: 'assistant', content: 'hi', timestamp: '2026-10-14T09:00:01.000Z' },
    ];
    const created = await chatService.saveConversation(userId, first, { workspaceId, title: 'Stale test' });
    const conversationId = created.conversationId;

    // The window loads the chat; then a run adds two messages on the server.
    const seen = (await chatService.getConversation(userId, conversationId)).messages.map((m) => m.id);
    const run = [
      { id: 'run-u', type: 'user', content: 'Scheduled run', timestamp: '2026-10-14T09:05:00.000Z' },
      { id: 'run-a', type: 'assistant', content: 'Done', timestamp: '2026-10-14T09:05:30.000Z' },
    ];
    await chatService.saveConversation(userId, [...first, ...run], {
      workspaceId, conversationId, metadata: { scheduledTaskId: 'task-1' }, knownMessageIds: seen,
    });

    // The window, still showing the old chat, saves a new turn.
    const stale = [
      ...first,
      { id: 'u2', type: 'user', content: 'and now?', timestamp: '2026-10-14T09:10:00.000Z' },
      { id: 'a2', type: 'assistant', content: 'here', timestamp: '2026-10-14T09:10:05.000Z' },
    ];
    const saved = await chatService.saveConversation(userId, stale, {
      workspaceId, conversationId, metadata: { engine: 'asyncat' }, knownMessageIds: seen, origin: 'window-1',
    });
    assert.equal(saved.keptMessages, 2);

    const after = await chatService.getConversation(userId, conversationId);
    assert.deepEqual(after.messages.map((m) => m.id), ['u1', 'a1', 'run-u', 'run-a', 'u2', 'a2']);
    assert.equal(after.metadata.scheduledTaskId, 'task-1');
    assert.equal(after.metadata.engine, 'asyncat');

    const updates = events.filter((event) => event.type === 'conversation.updated' && event.data.conversationId === conversationId);
    assert.equal(updates.length, 3);
    assert.equal(updates.at(-1).data.origin, 'window-1');
    assert.equal(updates.at(-1).userId, userId);
  } finally {
    off();
  }
});
