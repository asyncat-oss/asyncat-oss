import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARK_START, MARK_END, snippetParts, plainSnippet, chatLink, linkedMessageId,
  isPinned, sidebarChatLists, withPinned,
} from './chatSearch.js';

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

test('the sidebar shows each chat once: pinned, else in its project, else in recents', () => {
  const chats = [
    { id: 'a', is_pinned: 0 },
    { id: 'b', is_pinned: 1, project: 'p1' },
    { id: 'c', is_pinned: 0, project: 'p1' },
    { id: 'd', is_pinned: true },
    { id: 'e' },
    { id: 'f' },
    { id: 'g', project: 'p2' },
  ];
  const { pinned, recents, byProject, pinnedInProject } = sidebarChatLists(chats, {
    projectOf: (c) => c.project || null,
    recentLimit: 2,
  });
  assert.deepEqual(pinned.map((c) => c.id), ['b', 'd'], "a project's pinned chat goes to Pinned");
  assert.deepEqual(recents.map((c) => c.id), ['a', 'e']);
  assert.deepEqual([...byProject].map(([id, list]) => [id, list.map((c) => c.id)]), [['p1', ['c']], ['p2', ['g']]]);
  assert.deepEqual([...pinnedInProject], [['p1', 1]]);
  const shown = [...pinned, ...recents, ...[...byProject.values()].flat()].map((c) => c.id);
  assert.equal(new Set(shown).size, shown.length, 'never twice');

  assert.ok(isPinned({ is_pinned: '1' }));
  assert.ok(!isPinned({ is_pinned: 'false' }));
  assert.deepEqual(withPinned(chats, 'a', true)[0], { id: 'a', is_pinned: true });
  assert.equal(withPinned(chats, 'a', true)[1], chats[1], 'others are left alone');
});
