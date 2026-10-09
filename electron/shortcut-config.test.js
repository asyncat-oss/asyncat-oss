import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHORTCUT_DEFAULTS,
  normalizeAccelerator,
  mergeShortcutConfig,
  applyShortcutUpdate,
} from './shortcut-config.js';

test('accelerators are normalized to canonical Electron names', () => {
  assert.equal(normalizeAccelerator('CmdOrCtrl+Shift+Space'), 'CommandOrControl+Shift+Space');
  assert.equal(normalizeAccelerator('shift + ctrl + a'), 'Control+Shift+A');
  assert.equal(normalizeAccelerator('Option+Meta+f12'), 'Alt+Super+F12');
  assert.equal(normalizeAccelerator('Ctrl+Alt+/'), 'Control+Alt+/');
});

test('bare keys, Shift-only and malformed shortcuts are rejected', () => {
  for (const bad of ['A', 'Shift+A', 'Ctrl+', 'Ctrl+Ctrl+A', 'Ctrl+Banana', 'Hyper+A', '', null, 42]) {
    assert.equal(normalizeAccelerator(bad), null, String(bad));
  }
});

test('saved settings merge over defaults and invalid entries fall back', () => {
  assert.deepEqual(mergeShortcutConfig(null), {
    quickAsk: { ...SHORTCUT_DEFAULTS.quickAsk },
    toggleWindow: { ...SHORTCUT_DEFAULTS.toggleWindow },
  });
  const merged = mergeShortcutConfig({
    quickAsk: { accelerator: 'ctrl+alt+k', enabled: false },
    toggleWindow: { accelerator: 'not a shortcut', enabled: 'yes' },
  });
  assert.deepEqual(merged.quickAsk, { accelerator: 'Control+Alt+K', enabled: false });
  assert.deepEqual(merged.toggleWindow, { ...SHORTCUT_DEFAULTS.toggleWindow });
});

test('updates can rebind or turn off a shortcut', () => {
  const config = mergeShortcutConfig(null);
  const off = applyShortcutUpdate(config, 'toggleWindow', { enabled: false });
  assert.equal(off.config.toggleWindow.enabled, false);

  const rebound = applyShortcutUpdate(config, 'quickAsk', { accelerator: 'Alt+Space' });
  assert.equal(rebound.config.quickAsk.accelerator, 'Alt+Space');
  assert.equal(config.quickAsk.accelerator, SHORTCUT_DEFAULTS.quickAsk.accelerator, 'input config is not mutated');
});

test('updates that would break things are refused with a reason', () => {
  const config = mergeShortcutConfig(null);
  assert.match(applyShortcutUpdate(config, 'nope', {}).error, /Unknown/);
  assert.match(applyShortcutUpdate(config, 'quickAsk', { accelerator: 'Shift+K' }).error, /at least one/);
  assert.match(applyShortcutUpdate(config, 'quickAsk', { accelerator: 'CmdOrCtrl+Shift+A' }).error, /already used/);
  // Clashing with a shortcut that is turned off is fine.
  const offConfig = applyShortcutUpdate(config, 'toggleWindow', { enabled: false }).config;
  assert.ok(applyShortcutUpdate(offConfig, 'quickAsk', { accelerator: 'CmdOrCtrl+Shift+A' }).config);
});
