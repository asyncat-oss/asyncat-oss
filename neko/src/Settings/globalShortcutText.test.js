import test from 'node:test';
import assert from 'node:assert/strict';
import { acceleratorFromEvent, formatAccelerator, shortcutStatus } from './globalShortcutText.js';

const press = (code, mods = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test('a key press becomes an Electron accelerator', () => {
  assert.equal(acceleratorFromEvent(press('Space', { ctrlKey: true, shiftKey: true }), false), 'Control+Shift+Space');
  assert.equal(acceleratorFromEvent(press('KeyA', { metaKey: true }), true), 'Command+A');
  assert.equal(acceleratorFromEvent(press('KeyA', { metaKey: true }), false), 'Super+A');
  assert.equal(acceleratorFromEvent(press('Digit7', { altKey: true }), false), 'Alt+7');
  assert.equal(acceleratorFromEvent(press('F5'), false), 'F5');
  assert.equal(acceleratorFromEvent(press('ShiftLeft', { shiftKey: true }), false), null, 'only a modifier so far');
});

test('accelerators show the key names of this computer', () => {
  assert.deepEqual(formatAccelerator('Control+Shift+Space', false), ['Ctrl', 'Shift', 'Space']);
  assert.deepEqual(formatAccelerator('CommandOrControl+Shift+Space', true), ['⌘', '⇧', 'Space']);
  assert.deepEqual(formatAccelerator('', false), []);
});

test('a shortcut says whether it is on, off or taken', () => {
  assert.deepEqual(shortcutStatus({ enabled: true, status: 'active' }), { tone: 'ok', text: 'On' });
  assert.equal(shortcutStatus({ enabled: false, status: 'off' }).text, 'Off');
  assert.equal(shortcutStatus({ enabled: true, status: 'unavailable' }).tone, 'warning');
  assert.equal(shortcutStatus(null).text, 'Checking…');
});
