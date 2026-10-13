import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStaleMessages } from './messageMerge.js';

const msg = (id, minute) => ({ id, content: id, timestamp: new Date(Date.UTC(2026, 9, 14, 9, minute)).toISOString() });
const ids = (list) => list.map((message) => message.id);

test('refreshing an open chat adds what the server added', () => {
  const server = [msg('u1', 0), msg('a1', 1), msg('run-u', 5), msg('run-a', 6)];
  const local = [msg('u1', 0), msg('a1', 1)];
  const { messages, kept } = mergeStaleMessages({ stored: server, posted: local, knownIds: ['u1', 'a1'] });
  assert.equal(kept, 2);
  assert.deepEqual(ids(messages), ['u1', 'a1', 'run-u', 'run-a']);
});

test('refreshing changes nothing when the window has seen everything', () => {
  const server = [msg('u1', 0), msg('a1', 1)];
  const local = [msg('u1', 0), msg('a1', 1), msg('draft', 3)];
  const { messages, kept } = mergeStaleMessages({ stored: server, posted: local, knownIds: ['u1', 'a1'] });
  assert.equal(kept, 0);
  assert.equal(messages, local);
});
