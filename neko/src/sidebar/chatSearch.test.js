import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARK_START, MARK_END, snippetParts, plainSnippet, markTitle, chatLink, linkedMessageId,
  isPinned, sidebarChatLists, withPinned, hitMessageId,
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

test("a chat found by its name has the typed words marked in it, where they start", () => {
  assert.equal(markTitle('Rosemary cuttings', 'rosemary'), `${marked('Rosemary')} cuttings`);
  assert.equal(markTitle('Plan my week', 'week pl'), `${marked('Pl')}an my ${marked('week')}`);
  assert.equal(markTitle('Explanation of plans', 'plan'), `Explanation of ${marked('plan')}s`, 'not inside a word');
  assert.equal(markTitle('Café plans', 'cafe'), `${marked('Café')} plans`, 'accents and case do not count');
  assert.equal(markTitle("Don't panic", "don't"), `${marked('Don')}'${marked('t')} panic`);
  assert.equal(markTitle('C++ and Coastal walks', 'c++'), `${marked('C')}++ and Coastal walks`, 'one letter is a whole word');
  assert.equal(markTitle('Vitamin cocktails', 'vitamin c'), `${marked('Vitamin')} ${marked('c')}ocktails`, 'unless it is still being typed');
  assert.equal(markTitle('東京タワー', 'タワー'), `東京${marked('タワー')}`);
  assert.equal(markTitle('ﬁsh pie', 'f'), `${marked('ﬁ')}sh pie`, 'a character folded into several is marked whole');
  assert.equal(markTitle('Garden', 'zz'), 'Garden');
  assert.equal(markTitle('Garden', ''), 'Garden');
  assert.equal(markTitle(`odd${MARK_START}title`, 'odd'), `${marked('odd')}title`, 'no stray markers');
  assert.deepEqual(snippetParts(markTitle('<b>Plans</b>', 'plans')).map((p) => p.text), ['<b>', 'Plans', '</b>'], 'text, never HTML');
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

test('a search result opens at the message it shows; one found only by its name opens as usual', () => {
  const hits = [{ message_id: 'm2' }, { message_id: 'm1' }];
  assert.equal(hitMessageId({ title_match: false, hits }), 'm2');
  assert.equal(hitMessageId({ title_match: true, hits }), 'm2', 'its name matched too, but the row shows m2');
  assert.equal(hitMessageId({ title_match: true, hits: [] }), null);
  assert.equal(hitMessageId({ title_match: false, hits: [] }), null);
  assert.equal(hitMessageId({ id: 'c1' }), null, 'a plain chat from the list');
  assert.equal(hitMessageId(null), null);
});
