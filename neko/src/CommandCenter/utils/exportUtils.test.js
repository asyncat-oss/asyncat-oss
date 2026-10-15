import test from 'node:test';
import assert from 'node:assert/strict';

import { ASSISTANT_NAME, buildConversationExportEntries, buildExportHtmlDocument } from './exportUtils.js';

test('an export names the speakers You and Asyncat', () => {
  const entries = buildConversationExportEntries([
    { type: 'user', content: 'Plan a picnic', timestamp: '2026-10-01T10:00:00Z' },
    { type: 'assistant', content: 'Bread, cheese and a blanket.', timestamp: '2026-10-01T10:00:05Z' },
  ]);
  assert.deepEqual(entries.map((entry) => entry.role), ['You', ASSISTANT_NAME]);
  assert.equal(ASSISTANT_NAME, 'Asyncat');
});

test('an answer still streaming is exported as a draft by Asyncat', () => {
  const entries = buildConversationExportEntries([], [{ type: 'user_goal', data: { goal: 'Hi' } }], 'Half an ans');
  assert.deepEqual(entries.map((entry) => [entry.role, entry.kind]), [['You', 'message'], [ASSISTANT_NAME, 'draft']]);
});

test('the HTML export marks the answers and writes labels as they are', () => {
  const html = buildExportHtmlDocument('Picnic <plan>', 'October 1, 2026', [
    { role: ASSISTANT_NAME, kind: 'message', content: 'Bread' },
  ]);
  assert.match(html, /<section class="entry assistant">/);
  assert.match(html, /<title>Picnic &lt;plan&gt;<\/title>/);
  assert.doesNotMatch(html, /text-transform:\s*uppercase/);
});
