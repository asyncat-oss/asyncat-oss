import test from 'node:test';
import assert from 'node:assert/strict';
import { keepTabInside, nextStop } from './focusLoop.js';

test('Tab goes round the stops and Shift+Tab goes back', () => {
  assert.equal(nextStop(2, 0), 1);
  assert.equal(nextStop(2, 1), 0);
  assert.equal(nextStop(2, 0, true), 1);
  assert.equal(nextStop(3, 2, true), 1);
  assert.equal(nextStop(1, 0), 0);
});

test('from outside the stops, Tab starts at the first and Shift+Tab at the last', () => {
  assert.equal(nextStop(3, -1), 0);
  assert.equal(nextStop(3, -1, true), 2);
  assert.equal(nextStop(0, -1), -1);
});

function fakePanel(names) {
  const focused = [];
  const stops = names.map((name) => ({ name, focus: () => focused.push(name) }));
  return { stops, focused, panel: { querySelectorAll: () => stops } };
}

test('a Tab from the last control in the panel lands on the first, not the page behind', () => {
  const { stops, focused, panel } = fakePanel(['field', 'clear']);
  let prevented = false;
  const handled = keepTabInside({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true; } }, panel, stops[1]);
  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.deepEqual(focused, ['field']);

  keepTabInside({ key: 'Tab', shiftKey: true, preventDefault() {} }, panel, stops[0]);
  assert.deepEqual(focused, ['field', 'clear']);
});

test('other keys pass through untouched', () => {
  const { focused, panel } = fakePanel(['field']);
  let prevented = false;
  assert.equal(keepTabInside({ key: 'Enter', preventDefault: () => { prevented = true; } }, panel, null), false);
  assert.equal(prevented, false);
  assert.deepEqual(focused, []);
});
