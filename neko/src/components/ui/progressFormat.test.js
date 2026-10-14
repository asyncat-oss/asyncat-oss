import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDuration, trackRate, transferDetail } from './progressFormat.js';

test('sizes read in the largest unit that fits', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1500), '1.5 KB');
  assert.equal(formatBytes(24e6), '24 MB');
  assert.equal(formatBytes(1.25e9), '1.3 GB');
  assert.equal(formatBytes(2e9), '2 GB');
  assert.equal(formatBytes(-1), '');
});

test('durations read as seconds, minutes or hours', () => {
  assert.equal(formatDuration(0.2), '1 s');
  assert.equal(formatDuration(20), '20 s');
  assert.equal(formatDuration(200), '3 min');
  assert.equal(formatDuration(4020), '1 h 7 min');
  assert.equal(formatDuration(7200), '2 h');
  assert.equal(formatDuration(Infinity), '');
});

test('a transfer line shows amounts in the total unit, speed and time left', () => {
  assert.equal(transferDetail({ done: 24e6, total: 60e6, rate: 3e6 }), '24 of 60 MB · 3 MB/s · 12 s left');
  assert.equal(transferDetail({ done: 0.5e9, total: 1.5e9 }), '0.5 of 1.5 GB');
  assert.equal(transferDetail({ done: 9e6, total: 1.76e9 }), '9 MB of 1.8 GB');
  assert.equal(transferDetail({ done: 0, total: 1.76e9 }), '0 of 1.8 GB');
  assert.equal(transferDetail({ done: 5e6 }), '5 MB');
  assert.equal(transferDetail({ done: 60e6, total: 60e6, rate: 3e6 }), '60 of 60 MB · 3 MB/s');
  assert.equal(transferDetail({}), '');
});

test('speed comes from recent samples and starts over after a restart', () => {
  let state = trackRate([], { bytes: 0, at: 0 });
  assert.equal(state.rate, null);
  state = trackRate(state.samples, { bytes: 1e6, at: 500 });
  assert.equal(state.rate, null);
  state = trackRate(state.samples, { bytes: 4e6, at: 2000 });
  assert.equal(state.rate, 2e6);
  // Old samples fall out of the window.
  state = trackRate(state.samples, { bytes: 20e6, at: 10000 }, 8000);
  assert.equal(state.samples[0].at, 2000);
  assert.equal(state.rate, 2e6);
  // Fewer bytes than before: the download restarted.
  state = trackRate(state.samples, { bytes: 1e6, at: 11000 });
  assert.deepEqual(state.samples, [{ bytes: 1e6, at: 11000 }]);
  assert.equal(state.rate, null);
});
