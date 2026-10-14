import test from 'node:test';
import assert from 'node:assert/strict';
import { MARK_START, MARK_END, snippetParts, plainSnippet, chatLink, linkedMessageId } from './chatSearch.js';

const marked = (word) => `${MARK_START}${word}${MARK_END}`;

test('a snippet splits into plain text and matches, never HTML', () => {
  assert.deepEqual(snippetParts(`…try the ${marked('lungwort')} in shade…`), [
    { text: '…try the ', match: false },
    { text: 'lungwort', match: true },
    { text: ' in shade…', match: false },
  ]);
  assert.deepEqual(snippetParts(`${marked('a')} and ${marked('b')}`).map((p) => p.match), [true, false, true]);
  assert.deepEqual(snippetParts('<img src=x onerror=alert(1)>'), [{ text: '<img src=x onerror=alert(1)>', match: false }]);
  assert.deepEqual(snippetParts(''), []);
  assert.deepEqual(snippetParts(null), []);
  assert.equal(plainSnippet(`one ${marked('two')} three`), 'one two three');
});

test('links open a chat at a message, and read back', () => {
  assert.equal(chatLink('c1'), '/conversations/c1');
  assert.equal(chatLink('c1', 'msg 1&x'), '/conversations/c1?message=msg%201%26x');
  assert.equal(linkedMessageId('?message=msg%201%26x'), 'msg 1&x');
  assert.equal(linkedMessageId('?other=1'), null);
  assert.equal(linkedMessageId(''), null);
});
