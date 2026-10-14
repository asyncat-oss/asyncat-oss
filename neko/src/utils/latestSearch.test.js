import test from 'node:test';
import assert from 'node:assert/strict';
import { latestSearch } from './latestSearch.js';

test('starting a search cancels the one before it', () => {
  const searches = latestSearch();
  const first = searches.start();
  const second = searches.start();
  assert.equal(first.aborted, true);
  assert.equal(second.aborted, false);
  searches.cancel();
  assert.equal(second.aborted, true);
  searches.cancel();
});

test('a slow answer for an older query never replaces a newer one', async () => {
  const searches = latestSearch();
  let shown = null;
  const search = async (query, ms) => {
    const signal = searches.start();
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (!signal.aborted) shown = query;
  };
  await Promise.all([search('heron', 30), search('pademelon', 5)]);
  assert.equal(shown, 'pademelon');
});
