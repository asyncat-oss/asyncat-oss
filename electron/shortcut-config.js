// electron/shortcut-config.js — Settings logic for the system-wide shortcuts.
//
// No Electron imports, so it can be unit-tested with plain node. The shortcuts
// themselves are registered by shortcuts.js.
//
// These shortcuts are global: while Asyncat runs they work in every app and
// the app that has focus never sees the key press. The defaults collide with
// common editor and browser shortcuts (Cmd/Ctrl+Shift+A is "Find Action" in
// JetBrains IDEs and tab search in Chrome), so users can rebind or turn off
// each one.

export const SHORTCUT_DEFAULTS = Object.freeze({
  quickAsk: Object.freeze({ accelerator: 'CommandOrControl+Shift+Space', enabled: true }),
  toggleWindow: Object.freeze({ accelerator: 'CommandOrControl+Shift+A', enabled: true }),
});

// Canonical Electron names for each spelling a user (or older config) might use.
const MODIFIER_ALIASES = {
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  command: 'Command',
  cmd: 'Command',
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'AltGr',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
};
// Order modifiers are written in, so equal shortcuts compare equal.
const MODIFIER_ORDER = ['CommandOrControl', 'Command', 'Control', 'Alt', 'AltGr', 'Super', 'Shift'];

const NAMED_KEYS = new Map([
  'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Escape', 'Esc',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Plus',
].map(key => [key.toLowerCase(), key]));
const PUNCTUATION = new Set([...')!@#$%^&*(:;=<,_-.>?/~`{][|\\}"\'']);

function normalizeKey(raw) {
  if (/^[a-z0-9]$/i.test(raw)) return raw.toUpperCase();
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(raw);
  if (fn) return `F${fn[1]}`;
  if (NAMED_KEYS.has(raw.toLowerCase())) return NAMED_KEYS.get(raw.toLowerCase());
  if (raw.length === 1 && PUNCTUATION.has(raw)) return raw;
  return null;
}

/**
 * Return the canonical Electron accelerator for `value`, or null if it is not
 * a usable global shortcut. A usable one is one key plus at least one modifier
 * other than Shift; a bare key or Shift+key would swallow normal typing in
 * every app.
 */
export function normalizeAccelerator(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('+').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const keyPart = parts[parts.length - 1];
  const key = normalizeKey(keyPart);
  if (!key) return null;

  const modifiers = new Set();
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (!modifier || modifiers.has(modifier)) return null;
    modifiers.add(modifier);
  }
  if (![...modifiers].some(modifier => modifier !== 'Shift')) return null;

  const ordered = MODIFIER_ORDER.filter(modifier => modifiers.has(modifier));
  return [...ordered, key].join('+');
}

/** Saved settings merged over the defaults; anything invalid falls back. */
export function mergeShortcutConfig(saved) {
  const merged = {};
  for (const [id, defaults] of Object.entries(SHORTCUT_DEFAULTS)) {
    const entry = saved && typeof saved === 'object' ? saved[id] : null;
    merged[id] = {
      accelerator: normalizeAccelerator(entry?.accelerator) || defaults.accelerator,
      enabled: typeof entry?.enabled === 'boolean' ? entry.enabled : defaults.enabled,
    };
  }
  return merged;
}

/**
 * Apply a change from Settings. Returns { config } with the new settings, or
 * { error } with a message to show (the old settings stay in effect).
 */
export function applyShortcutUpdate(config, id, patch = {}) {
  if (!Object.hasOwn(SHORTCUT_DEFAULTS, id)) return { error: 'Unknown shortcut.' };
  const current = config[id];
  const next = { ...current };

  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') return { error: 'Invalid setting.' };
    next.enabled = patch.enabled;
  }
  if (patch.accelerator !== undefined) {
    const accelerator = normalizeAccelerator(patch.accelerator);
    if (!accelerator) {
      return { error: 'Use a key with at least one of Ctrl, Cmd, Alt or Super, e.g. Ctrl+Alt+Space.' };
    }
    next.accelerator = accelerator;
  }

  const clash = Object.entries(config).find(([otherId, other]) => (
    otherId !== id && other.enabled && next.enabled && other.accelerator === next.accelerator
  ));
  if (clash) return { error: 'That shortcut is already used by the other Asyncat shortcut.' };

  return { config: { ...config, [id]: next } };
}
