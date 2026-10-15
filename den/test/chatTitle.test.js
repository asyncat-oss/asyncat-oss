import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanChatTitle } from '../src/ai/chatTitle.js';

test('a generated title loses markdown, a Title: label and quotes', () => {
  assert.equal(cleanChatTitle('**Zebra Stripes Explained**'), 'Zebra Stripes Explained');
  assert.equal(cleanChatTitle('Title: "Trip to Lisbon"'), 'Trip to Lisbon');
  assert.equal(cleanChatTitle('**Title:** `npm` install help'), 'npm install help');
  assert.equal(cleanChatTitle('# Bakery launch plan\n\nMore text'), 'Bakery launch plan');
  assert.equal(cleanChatTitle('<think>hmm</think>Garden watering'), 'Garden watering');
});

test('a long title is cut at a word with an ellipsis, a short one is kept whole', () => {
  const long = 'Zebras have stripes. The word **quokkafern** is a made-up mash of words';
  const title = cleanChatTitle(long);
  assert.ok(title.length <= 61, title);
  assert.ok(title.endsWith('…'), title);
  assert.equal(title, 'Zebras have stripes. The word quokkafern is a made-up mash…');
  assert.equal(cleanChatTitle('Short and sweet'), 'Short and sweet');
  assert.equal(cleanChatTitle('   '), null);
});
