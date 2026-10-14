import test from 'node:test';
import assert from 'node:assert/strict';

import { TEMPORARY_CHAT, engineForChat, withConversationId } from './temporaryChat.js';

test('a temporary chat is always answered by Asyncat itself', () => {
  assert.equal(engineForChat('claude-code', true), 'asyncat');
  assert.equal(engineForChat('codex', true), 'asyncat');
  assert.equal(engineForChat('claude-code', false), 'claude-code');
  assert.equal(engineForChat(null, false), 'asyncat');
});

test('opening a saved chat ends a temporary chat and keeps the messages being loaded', () => {
  const temporary = { isTemporaryChat: true, currentConversationId: null, conversationTitle: TEMPORARY_CHAT.title, messages: [] };
  // What loading a saved chat does: its messages first, then its id.
  const loading = { ...temporary, messages: [{ id: 'm1', type: 'user', content: 'When do plums ripen?' }] };
  const opened = withConversationId(loading, 'chat-7');
  assert.equal(opened.isTemporaryChat, false);
  assert.equal(opened.currentConversationId, 'chat-7');
  assert.deepEqual(opened.messages, loading.messages);

  assert.equal(withConversationId(temporary, null).isTemporaryChat, true, 'no id: still temporary');
  assert.equal(withConversationId({ isTemporaryChat: false }, 'chat-7').isTemporaryChat, false);
});

test('its words are plain, sentence case and emoji-free', () => {
  for (const text of Object.values(TEMPORARY_CHAT)) {
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, text);
    assert.doesNotMatch(text, /ghost/i, text);
    assert.equal(text[0], text[0].toUpperCase(), text);
  }
  assert.equal(TEMPORARY_CHAT.start, 'Chat without saving it');
});
