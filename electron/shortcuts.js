// electron/shortcuts.js — Registers the system-wide shortcuts from the user's
// settings (Settings → Appearance) and reports which ones took effect.
// Validation and defaults live in shortcut-config.js.

import { globalShortcut } from 'electron';
import fs from 'fs';
import path from 'path';
import { USER_DATA } from './constants.js';
import { SHORTCUT_DEFAULTS, mergeShortcutConfig, applyShortcutUpdate } from './shortcut-config.js';

const CONFIG_PATH = path.join(USER_DATA, 'shortcuts.json');

let config = null;
let handlers = {};
const registered = new Map(); // id → accelerator currently registered by us
const status = {};            // id → 'active' | 'off' | 'unavailable'

function load() {
  try {
    return mergeShortcutConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    return mergeShortcutConfig(null);
  }
}

function save() {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* best effort */ }
}

function ensureLoaded() {
  if (!config) config = load();
}

function apply() {
  for (const accelerator of registered.values()) {
    try { globalShortcut.unregister(accelerator); } catch { /* already gone */ }
  }
  registered.clear();

  for (const [id, entry] of Object.entries(config)) {
    if (!entry.enabled) {
      status[id] = 'off';
      continue;
    }
    let ok = false;
    try {
      // false when another app already owns this combination.
      ok = globalShortcut.register(entry.accelerator, () => handlers[id]?.());
    } catch {
      ok = false;
    }
    if (ok) registered.set(id, entry.accelerator);
    status[id] = ok ? 'active' : 'unavailable';
  }
}

export function getShortcutState() {
  ensureLoaded();
  return Object.fromEntries(Object.entries(config).map(([id, entry]) => [id, {
    ...entry,
    defaultAccelerator: SHORTCUT_DEFAULTS[id].accelerator,
    status: status[id] || (entry.enabled ? 'unavailable' : 'off'),
  }]));
}

/** Call once the app is ready; `nextHandlers` maps shortcut id → action. */
export function initShortcuts(nextHandlers) {
  handlers = nextHandlers;
  ensureLoaded();
  apply();
}

export function updateShortcut(id, patch) {
  ensureLoaded();
  const { config: next, error } = applyShortcutUpdate(config, id, patch);
  if (error) return { ok: false, error, shortcuts: getShortcutState() };
  config = next;
  save();
  apply();
  return { ok: true, shortcuts: getShortcutState() };
}

export function resetShortcuts() {
  config = mergeShortcutConfig(null);
  save();
  apply();
  return { ok: true, shortcuts: getShortcutState() };
}

export function registerShortcutIPC(ipcMain) {
  ipcMain.handle('shortcuts:get', () => getShortcutState());
  ipcMain.handle('shortcuts:set', (_event, id, patch) => updateShortcut(String(id), patch || {}));
  ipcMain.handle('shortcuts:reset', () => resetShortcuts());
}
