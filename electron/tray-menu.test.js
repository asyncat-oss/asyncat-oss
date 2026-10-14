import test from 'node:test';
import assert from 'node:assert/strict';

import { trayMenuTemplate } from './tray-menu.js';

const labels = (template) => template.filter((item) => item.label).map((item) => item.label);

test('the Linux menu opens Quick ask, called with no arguments', () => {
  const calls = [];
  const template = trayMenuTemplate({ showQuickAsk: true, onQuickAsk: (...args) => calls.push(args) });
  const item = template.find((entry) => entry.label === 'Quick ask');
  assert.ok(item);
  item.click({ label: 'Quick ask' }, null, {});
  assert.deepEqual(calls, [[]]);
});

test('other platforms open Quick ask from a left-click, so the menu leaves it out', () => {
  assert.ok(!labels(trayMenuTemplate({ showQuickAsk: false, onQuickAsk: () => {} })).includes('Quick ask'));
  assert.ok(!labels(trayMenuTemplate({ showQuickAsk: true })).includes('Quick ask'));
});

test('the server row is plain words', () => {
  assert.ok(labels(trayMenuTemplate({ backendRunning: true })).includes('Asyncat is running'));
  assert.ok(labels(trayMenuTemplate({ backendRunning: false })).includes("Asyncat's server is stopped"));
});

test('Cats opens its page and Quit quits', () => {
  const shown = [];
  let quit = 0;
  const template = trayMenuTemplate({ onShow: (route) => shown.push(route), onQuit: () => { quit += 1; } });
  template.find((entry) => entry.label === 'Cats').click();
  template.find((entry) => entry.label === 'Quit Asyncat').click();
  assert.deepEqual(shown, ['/cats']);
  assert.equal(quit, 1);
});
