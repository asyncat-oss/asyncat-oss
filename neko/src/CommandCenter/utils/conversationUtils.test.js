import test from 'node:test';
import assert from 'node:assert/strict';

import { getRelativeConversationTime, getRelativeTime } from './conversationUtils.js';

const now = Date.parse('2026-10-15T12:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();

test('chat times count minutes under an hour, the same words everywhere', () => {
  assert.equal(getRelativeTime(ago(20_000), now), 'Just now');
  assert.equal(getRelativeTime(ago(5 * 60_000), now), '5 min ago');
  assert.equal(getRelativeTime(ago(25 * 60_000), now), '25 min ago');
  assert.equal(getRelativeTime(ago(3 * 3_600_000), now), '3 h ago');
  assert.equal(getRelativeConversationTime(ago(2 * 86_400_000), now), '2 d ago');
});

test('SQLite times without a zone are read as UTC', () => {
  assert.equal(getRelativeTime('2026-10-15 11:50:00', now), '10 min ago');
});
