import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConversationMode } from '../src/ai/controllers/ai/conversationModes.js';
import { buildConversationContinuation } from '../src/ai/controllers/ai/conversationContinuation.js';

test('conversation modes map UI experience names to database values', () => {
  assert.equal(normalizeConversationMode('chat'), 'chat');
  assert.equal(normalizeConversationMode('work'), 'build');
  assert.equal(normalizeConversationMode('build'), 'build');
  assert.equal(normalizeConversationMode('visual'), 'chat');
  assert.equal(normalizeConversationMode('image'), 'image');
});

test('conversation mode filters can allow all without weakening persisted values', () => {
  assert.equal(normalizeConversationMode('all', { allowAll: true }), 'all');
  assert.throws(() => normalizeConversationMode('all'), /Unsupported conversation mode/);
  assert.throws(() => normalizeConversationMode('unknown'), /Unsupported conversation mode/);
});

test('continuing a chat in Work copies only the readable transcript into a new branch', () => {
  let sequence = 0;
  const continuation = buildConversationContinuation({
    id: 'source-chat',
    title: 'Investigate the bug',
    mode: 'chat',
    project_ids: ['project-1'],
    metadata: {},
    messages: [
      { id: 'old-user', type: 'user', content: 'Can you explain this?', timestamp: '2026-08-13T10:00:00.000Z', fileAttachments: [{ path: 'secret.txt' }] },
      { id: 'old-assistant', type: 'assistant', content: 'Here is the explanation.', agentSessionId: 'old-session', agentEvents: [{ type: 'tool_start' }] },
    ],
  }, 'work', { createId: () => `new-${++sequence}` });

  assert.equal(continuation.mode, 'work');
  assert.equal(continuation.title, 'Investigate the bug (Work)');
  assert.deepEqual(continuation.projectIds, []);
  assert.equal(continuation.metadata.experienceMode, 'work');
  assert.equal(continuation.metadata.workingContext, undefined);
  assert.equal(continuation.metadata.continuedFrom.conversationId, 'source-chat');
  assert.equal(continuation.messages.length, 2);
  assert.equal(continuation.messages[0].branchId, continuation.messages[1].branchId);
  assert.notEqual(continuation.messages[0].id, 'old-user');
  assert.equal(continuation.messages[0].fileAttachments, undefined);
  assert.equal(continuation.messages[1].agentEvents, undefined);
});

test('continuing Work in Chat drops workspace context and rejects same-mode copies', () => {
  const source = {
    id: 'source-work',
    title: 'Implement feature (Work)',
    mode: 'build',
    metadata: { workingContext: { rootId: 'workspace', relativePath: 'neko' } },
    messages: [{ type: 'assistant', content: 'Implementation summary' }],
  };

  const continuation = buildConversationContinuation(source, 'chat', { createId: () => 'copy' });
  assert.equal(continuation.title, 'Implement feature (Chat)');
  assert.deepEqual(continuation.projectIds, []);
  assert.equal(continuation.metadata.experienceMode, 'chat');
  assert.equal(continuation.metadata.workingContext, undefined);
  assert.throws(
    () => buildConversationContinuation(source, 'work', { createId: () => 'copy' }),
    /already in Work mode/,
  );
});
