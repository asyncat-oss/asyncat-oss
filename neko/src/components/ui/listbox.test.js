import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTypeahead,
  filterOptions,
  indexOfValue,
  keyClosesSuggestions,
  listName,
  matchTypeahead,
  moveActive,
  normalizeOptions,
  optionSections,
  optionText,
  searchFieldName,
  suggestionMatches,
} from './listbox.js';

const fruit = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot', disabled: true },
  { value: 'avocado', label: 'Avocado' },
  { separator: true },
  { value: 'banana', label: 'Banana', description: 'Yellow and soft' },
  { value: 'blueberry', label: 'Blueberry', hint: '200 g' },
  { value: 'cherry', label: 'Cherry', group: 'Stone fruit' },
];

test('plain strings become options and empty entries are dropped', () => {
  assert.deepEqual(normalizeOptions(['a', null, 'b']), [{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]);
  assert.equal(optionText({ value: 3, label: { type: 'span' }, text: 'Three' }), 'Three');
  assert.equal(optionText({ value: 3, label: { type: 'span' } }), '3');
});

test('a value is found exactly, or by its text form', () => {
  assert.equal(indexOfValue(fruit, 'banana'), 4);
  const minutes = [{ value: 15, label: '15 minutes' }, { value: 60, label: 'An hour' }];
  assert.equal(indexOfValue(minutes, '60'), 1);
  assert.equal(indexOfValue(minutes, null), -1);
  assert.equal(indexOfValue([{ value: '', label: 'None' }], ''), 0);
});

test('filtering matches every word across label, description and group, and drops separators', () => {
  assert.deepEqual(filterOptions(fruit, '').length, fruit.length);
  assert.deepEqual(filterOptions(fruit, 'yellow').map((o) => o.value), ['banana']);
  assert.deepEqual(filterOptions(fruit, 'a').some((o) => o.separator), false);
  assert.deepEqual(filterOptions(fruit, 'stone CHER').map((o) => o.value), ['cherry']);
  // Not hints or values, which are often sizes and ids.
  assert.deepEqual(filterOptions(fruit, '200'), []);
  assert.deepEqual(filterOptions([{ value: 'a1b2', label: 'First' }], '1'), []);
});

test('suggestions put options starting with the text first', () => {
  const tools = [
    { value: 'web_search' },
    { value: 'mail_send_message' },
    { value: 'search_files' },
  ];
  assert.deepEqual(suggestionMatches(tools, 'search').map((o) => o.value), ['search_files', 'web_search']);
  assert.equal(suggestionMatches(tools, '').length, 3);
  assert.equal(suggestionMatches(tools, '', 2).length, 2);
  assert.deepEqual(suggestionMatches(tools, 'nothing'), []);
});

test('a combobox list closes on Tab, Enter and keys the caller takes', () => {
  assert.equal(keyClosesSuggestions({ key: 'Enter' }), true);
  assert.equal(keyClosesSuggestions({ key: 'Tab' }), true);
  // Chips adds its text on a comma and clears the field: no list of every suggestion after.
  assert.equal(keyClosesSuggestions({ key: ',', defaultPrevented: true }), true);
  assert.equal(keyClosesSuggestions({ key: 'a' }), false);
  assert.equal(keyClosesSuggestions({ key: 'Backspace', defaultPrevented: false }), false);
});

test('a list is named by aria-label, then its label, then the placeholder', () => {
  assert.equal(listName('Kind', 'Ignored', 'Choose…'), 'Kind');
  assert.equal(listName(undefined, '  Wait\n  between runs ', 'Choose…'), 'Wait between runs');
  assert.equal(listName(undefined, '', 'Choose…'), 'Choose…');
  assert.equal(listName(undefined, null, { type: 'span' }), 'Options');
  assert.equal(searchFieldName('Model'), 'Search model');
  assert.equal(searchFieldName('API key'), 'Search API key');
  assert.equal(searchFieldName('A model'), 'Search a model');
});

test('arrow keys skip disabled options and separators and stop at the ends', () => {
  assert.equal(moveActive(fruit, 0, 'ArrowDown'), 2);
  assert.equal(moveActive(fruit, 2, 'ArrowDown'), 4);
  assert.equal(moveActive(fruit, 6, 'ArrowDown'), 6);
  assert.equal(moveActive(fruit, 4, 'ArrowUp'), 2);
  assert.equal(moveActive(fruit, 0, 'ArrowUp'), 0);
  assert.equal(moveActive(fruit, -1, 'ArrowDown'), 0);
  assert.equal(moveActive(fruit, -1, 'ArrowUp'), 6);
  assert.equal(moveActive(fruit, 4, 'Home'), 0);
  assert.equal(moveActive(fruit, 0, 'End'), 6);
  assert.equal(moveActive(fruit, 2, 'Tab'), 2);
  assert.equal(moveActive([{ value: 'x', disabled: true }], -1, 'ArrowDown'), -1);
});

test('with wrap, arrow keys go round from the last option to the first and back', () => {
  assert.equal(moveActive(fruit, 6, 'ArrowDown', { wrap: true }), 0);
  assert.equal(moveActive(fruit, 0, 'ArrowUp', { wrap: true }), 6);
  assert.equal(moveActive(fruit, 2, 'ArrowDown', { wrap: true }), 4);
  // A disabled option at the end is skipped on the way round.
  const sizes = [{ value: 'tiny' }, { value: 'large' }, { value: 'huge', disabled: true }];
  assert.equal(moveActive(sizes, 1, 'ArrowDown', { wrap: true }), 0);
  assert.equal(moveActive(sizes, 0, 'ArrowUp', { wrap: true }), 1);
  assert.equal(moveActive(sizes, 1, 'ArrowDown'), 1);
});

test('page keys move ten at a time', () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ value: index, label: `Item ${index}` }));
  assert.equal(moveActive(many, 0, 'PageDown'), 10);
  assert.equal(moveActive(many, 25, 'PageDown'), 29);
  assert.equal(moveActive(many, 15, 'PageUp'), 5);
  assert.equal(moveActive(many, 3, 'PageUp'), 0);
});

test('type-ahead collects keys and starts over after a pause', () => {
  const typeahead = createTypeahead(500);
  assert.equal(typeahead.type('b', 1000), 'b');
  assert.equal(typeahead.type('l', 1200), 'bl');
  assert.equal(typeahead.active(1600), true);
  assert.equal(typeahead.active(1800), false);
  assert.equal(typeahead.type('c', 1900), 'c');
  typeahead.reset();
  assert.equal(typeahead.active(1900), false);
});

test('type-ahead finds the next match, cycles on a repeated letter and skips disabled ones', () => {
  assert.equal(matchTypeahead(fruit, 'b', -1), 4);
  assert.equal(matchTypeahead(fruit, 'bl', 4), 5);
  assert.equal(matchTypeahead(fruit, 'ba', 4), 4);
  assert.equal(matchTypeahead(fruit, 'a', 0), 2);
  assert.equal(matchTypeahead(fruit, 'aa', 2), 0);
  assert.equal(matchTypeahead(fruit, 'apr', -1), -1);
  assert.equal(matchTypeahead(fruit, 'z', 0), -1);
});

test('sections group runs of options and keep separators apart', () => {
  const sections = optionSections(fruit);
  assert.equal(sections.length, 4);
  assert.deepEqual(sections[0].items.map((item) => item.index), [0, 1, 2]);
  assert.equal(sections[1].separator, true);
  assert.deepEqual(sections[2].items.map((item) => item.index), [4, 5]);
  assert.equal(sections[3].group, 'Stone fruit');
  assert.deepEqual(sections[3].items.map((item) => item.index), [6]);
});
