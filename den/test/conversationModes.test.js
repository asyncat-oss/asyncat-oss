import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConversationMode } from '../src/ai/controllers/ai/conversationModes.js';

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
