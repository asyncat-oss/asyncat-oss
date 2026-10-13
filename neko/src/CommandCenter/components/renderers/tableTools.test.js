import test from 'node:test';
import assert from 'node:assert/strict';
import { cellNumber, cellText, filterRows, sortRows, toCsv } from './tableTools.js';

test('cells are read as plain text, and numbers as numbers', () => {
  assert.equal(cellText('**Basil** [guide](https://example.com) `x`'), 'Basil guide x');
  assert.equal(cellNumber('$1,200.50'), 1200.5);
  assert.equal(cellNumber('12%'), 12);
  assert.equal(cellNumber('-3'), -3);
  assert.equal(cellNumber('Q1'), null);
  assert.equal(cellNumber('3 cm'), null);
});

test('tables sort by a column: numbers by size, words naturally, blanks last', () => {
  const rows = [['Tomato', '12'], ['basil', '3'], ['Mint', ''], ['Chive', '100']];
  assert.deepEqual(sortRows(rows, 1, 'asc').map((r) => r[0]), ['basil', 'Tomato', 'Chive', 'Mint']);
  assert.deepEqual(sortRows(rows, 1, 'desc').map((r) => r[0]), ['Chive', 'Tomato', 'basil', 'Mint']);
  assert.deepEqual(sortRows(rows, 0, 'asc').map((r) => r[0]), ['basil', 'Chive', 'Mint', 'Tomato']);
  assert.deepEqual(sortRows([['item 10'], ['item 2']], 0).map((r) => r[0]), ['item 2', 'item 10']);
  assert.equal(sortRows(rows, null), rows);
});

test('tables filter by words in any cell, and copy as CSV', () => {
  const rows = [['Tomato', 'sun, water'], ['Basil', 'warm "sun"'], ['Mint', 'shade']];
  assert.deepEqual(filterRows(rows, 'SUN').map((r) => r[0]), ['Tomato', 'Basil']);
  assert.deepEqual(filterRows(rows, 'sun warm').map((r) => r[0]), ['Basil']);
  assert.equal(filterRows(rows, '  ').length, 3);
  assert.equal(toCsv(['Plant', 'Needs'], rows.slice(0, 2)), 'Plant,Needs\nTomato,"sun, water"\nBasil,"warm ""sun"""');
});
