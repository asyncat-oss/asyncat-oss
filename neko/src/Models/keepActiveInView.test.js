import test from 'node:test';
import assert from 'node:assert/strict';
import { keepActiveInView, scrollToShow } from './keepActiveInView.js';

const rect = (left, right) => ({ left, right });

test('a switch scrolls only as far as it takes to show the chosen item', () => {
  const track = rect(20, 280);
  assert.equal(scrollToShow(track, rect(40, 120)), 0, 'an item that shows stays put');
  assert.equal(scrollToShow(track, rect(220, 340)), 60, 'cut off on the right scrolls right');
  assert.equal(scrollToShow(track, rect(-30, 60)), -50, 'cut off on the left scrolls left');
  assert.equal(scrollToShow(track, rect(100, 500)), 80, 'an item wider than the track lines up on its left edge');
});

test('keepActiveInView moves the track, and leaves one that fits alone', () => {
  const makeTrack = (scrollWidth) => {
    const track = { scrollLeft: 0, scrollWidth, clientWidth: 260, getBoundingClientRect: () => rect(20, 280) };
    const item = { parentElement: track, getBoundingClientRect: () => rect(220, 340) };
    return { track, container: { querySelector: () => item } };
  };

  const narrow = makeTrack(340);
  keepActiveInView(narrow.container);
  assert.equal(narrow.track.scrollLeft, 60);

  const wide = makeTrack(260);
  keepActiveInView(wide.container);
  assert.equal(wide.track.scrollLeft, 0);

  assert.doesNotThrow(() => keepActiveInView(null));
  assert.doesNotThrow(() => keepActiveInView({ querySelector: () => null }));
});
