import test from 'node:test';
import assert from 'node:assert/strict';
import { applySkillEvent, markSaved, placeSkillSuggestions } from './skillSuggestions.js';

const draft = (id, messageId = null) => ({ id, conversationId: 'chat-1', messageId, name: `skill-${id}`, description: '' });

test('a suggestion for this chat is added once; other chats are ignored', () => {
  const added = applySkillEvent([], { type: 'skill.suggested', data: { conversationId: 'chat-1', suggestion: draft('a') } }, 'chat-1');
  assert.deepEqual(added.map((item) => item.id), ['a']);
  const again = applySkillEvent(added, { type: 'skill.suggested', data: { conversationId: 'chat-1', suggestion: draft('a') } }, 'chat-1');
  assert.equal(again.length, 1);
  const elsewhere = applySkillEvent(added, { type: 'skill.suggested', data: { conversationId: 'chat-2', suggestion: draft('b') } }, 'chat-1');
  assert.equal(elsewhere, added);
  assert.deepEqual(applySkillEvent([], { type: 'skill.suggested', data: { conversationId: 'chat-1', suggestion: draft('a') } }, null), []);
});

test('Not now removes the card; Save keeps it, marked saved', () => {
  const list = [draft('a'), draft('b')];
  const dropped = applySkillEvent(list, { type: 'skill.closed', data: { conversationId: 'chat-1', id: 'a' } }, 'chat-1');
  assert.deepEqual(dropped.map((item) => item.id), ['b']);
  const saved = applySkillEvent(list, { type: 'skill.closed', data: { conversationId: 'chat-1', id: 'b', saved: true } }, 'chat-1');
  assert.deepEqual(saved.map((item) => Boolean(item.saved)), [false, true]);
  assert.equal(markSaved(list, 'a')[0].saved, true);
  assert.equal(applySkillEvent(list, { type: 'conversation.updated', data: { conversationId: 'chat-1' } }, 'chat-1'), list);
});

test('cards follow the answer they came from; the last one goes at the end', () => {
  const answers = ['m1', null, 'm2', 'm3'];
  const { bySegment, atEnd } = placeSkillSuggestions(answers, [draft('a', 'm2'), draft('b', 'm3'), draft('c', 'gone'), draft('d')]);
  assert.deepEqual([...bySegment.entries()].map(([index, items]) => [index, items.map((item) => item.id)]), [[2, ['a']]]);
  assert.deepEqual(atEnd.map((item) => item.id), ['b', 'c', 'd']);
  assert.deepEqual(placeSkillSuggestions([], []).atEnd, []);
});

test('once a newer message starts, the card stays with its answer', () => {
  const { bySegment, atEnd } = placeSkillSuggestions(['m1', null], [draft('a', 'm1')]);
  assert.deepEqual(bySegment.get(0).map((item) => item.id), ['a']);
  assert.deepEqual(atEnd, []);
});
