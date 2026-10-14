import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUICK_WIDTH, QUICK_MIN_HEIGHT, QUICK_MAX_HEIGHT, BLUR_GRACE_MS,
  maxQuickHeight, clampQuickHeight, quickBounds, toggleAction, shouldHideOnBlur,
  hiddenTimerAction, normalizeQuickState, normalizeBackground,
} from './quick-geometry.js';

const FULL_HD = { x: 0, y: 0, width: 1920, height: 1080 };

test('the window is centred on the display, its top 22% down the work area', () => {
  assert.deepEqual(quickBounds(FULL_HD), { x: 620, y: 238, width: QUICK_WIDTH, height: QUICK_MIN_HEIGHT });
  // A second display to the right, below a top bar.
  assert.deepEqual(quickBounds({ x: 1920, y: 32, width: 2560, height: 1408 }, 300), { x: 2860, y: 342, width: 680, height: 300 });
});

test('the top edge stays put whatever the height', () => {
  const short = quickBounds(FULL_HD, 56);
  const tall = quickBounds(FULL_HD, 500);
  assert.equal(short.y, tall.y);
  assert.equal(short.x, tall.x);
});

test('narrow screens get a narrower window with space at the sides', () => {
  const phoneish = quickBounds({ x: 0, y: 0, width: 600, height: 900 });
  assert.equal(phoneish.width, 568);
  assert.equal(phoneish.x, 16);
});

test('heights are rounded up and kept between one input row and 560', () => {
  assert.equal(clampQuickHeight(10), QUICK_MIN_HEIGHT);
  assert.equal(clampQuickHeight(200.2), 201);
  assert.equal(clampQuickHeight(5000), QUICK_MAX_HEIGHT);
  assert.equal(clampQuickHeight(Number.NaN), QUICK_MIN_HEIGHT);
  assert.equal(clampQuickHeight('300'), 300);
  assert.equal(clampQuickHeight(undefined), QUICK_MIN_HEIGHT);
  assert.equal(clampQuickHeight(400, 320), 320);
});

test('a short screen lowers the maximum so the window never runs off the bottom', () => {
  assert.equal(maxQuickHeight(FULL_HD), QUICK_MAX_HEIGHT);
  const small = { x: 0, y: 0, width: 1280, height: 600 };
  assert.equal(maxQuickHeight(small), 600 - 132 - 16);
  const bounds = quickBounds(small, 900);
  assert.ok(bounds.y + bounds.height <= small.height);
  assert.equal(maxQuickHeight({ height: 40 }), QUICK_MIN_HEIGHT);
});

test('missing display data falls back to sensible numbers', () => {
  const bounds = quickBounds(null);
  assert.equal(bounds.width, QUICK_WIDTH);
  assert.ok(Number.isFinite(bounds.x) && Number.isFinite(bounds.y));
});

test('the shortcut hides a focused popup, focuses a visible one, else shows it', () => {
  assert.equal(toggleAction({ visible: true, focused: true }), 'hide');
  assert.equal(toggleAction({ visible: true, focused: false }), 'focus');
  assert.equal(toggleAction({ visible: false, focused: false }), 'show');
  assert.equal(toggleAction(), 'show');
});

test('on Linux an unfocused popup is shown again, so it comes to the workspace in use', () => {
  assert.equal(toggleAction({ visible: true, focused: false, linux: true }), 'reshow');
  assert.equal(toggleAction({ visible: true, focused: true, linux: true }), 'hide');
  assert.equal(toggleAction({ visible: false, linux: true }), 'show');
});

test('only an empty popup hides on blur, and not in its first moments', () => {
  const shownAt = 1_000;
  assert.equal(shouldHideOnBlur({ state: 'empty', shownAt, now: shownAt + BLUR_GRACE_MS }), true);
  assert.equal(shouldHideOnBlur({ state: 'empty', shownAt, now: shownAt + 100 }), false);
  assert.equal(shouldHideOnBlur({ state: 'thread', shownAt, now: shownAt + 10_000 }), false);
  assert.equal(shouldHideOnBlur({ state: 'busy', shownAt, now: shownAt + 10_000 }), false);
});

test('a long-hidden popup is closed, but not while it is still answering', () => {
  assert.equal(hiddenTimerAction({ exists: true, visible: false, state: 'empty' }), 'close');
  assert.equal(hiddenTimerAction({ exists: true, visible: false, state: 'thread' }), 'close');
  assert.equal(hiddenTimerAction({ exists: true, visible: false, state: 'busy' }), 'wait');
  assert.equal(hiddenTimerAction({ exists: true, visible: true, state: 'empty' }), null);
  assert.equal(hiddenTimerAction({ exists: false }), null);
  assert.equal(hiddenTimerAction(), null);
});

test('renderer messages are checked before use', () => {
  assert.equal(normalizeQuickState('busy'), 'busy');
  assert.equal(normalizeQuickState('closed'), null);
  assert.equal(normalizeBackground(' #1F2937 '), '#1f2937');
  assert.equal(normalizeBackground('red'), null);
  assert.equal(normalizeBackground('#fff'), null);
  assert.equal(normalizeBackground(null), null);
});
