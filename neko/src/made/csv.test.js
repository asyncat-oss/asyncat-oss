import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './csv.js';

test('CSV and TSV files read into rows, quotes and all', () => {
  assert.deepEqual(parseCsv('seed,price\nbasil,2.10\n"mint, wild","say ""hi"""\n\n'), [['seed', 'price'], ['basil', '2.10'], ['mint, wild', 'say "hi"']]);
  assert.deepEqual(parseCsv('a\tb\r\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('"multi\nline",x'), [['multi\nline', 'x']]);
});
