// The app's keyboard shortcuts (Settings → Shortcuts; the sidebar listens for
// them). Each is Ctrl (⌘ on a Mac) and one key. People can change the key;
// the labels and what each one does always come from the defaults here.

const DEFAULT_SHORTCUTS = {
  search: { key: 'k', ctrl: true, meta: true, label: 'Search', action: 'openSearch' },
  settings: { key: ',', ctrl: true, meta: true, label: 'Settings', action: 'openSettings' },
  newChat: { key: 'n', ctrl: true, meta: true, label: 'New chat', action: 'newChat' },
  dock1: { key: '1', ctrl: true, meta: true, label: 'Chat', action: 'navHome' },
  dock2: { key: '2', ctrl: true, meta: true, label: 'All chats', action: 'navChat' },
  dock3: { key: '3', ctrl: true, meta: true, label: 'Projects', action: 'navWorkspace' },
  dock4: { key: '4', ctrl: true, meta: true, label: 'Cats', action: 'navScheduled' },
  dock5: { key: '5', ctrl: true, meta: true, label: 'Models', action: 'navModels' },
  dock6: { key: '6', ctrl: true, meta: true, label: 'Tools & Skills', action: 'navTools' },
  dock8: { key: '8', ctrl: true, meta: true, label: 'Agents', action: 'navAgent' },
};

const STORAGE_KEY = 'keyboardShortcuts';

// Ctrl (⌘) with these edits text or runs the window everywhere, so no
// shortcut may take it: Ctrl+C on Projects stopped copying in every field.
const RESERVED = {
  a: 'selecting all',
  c: 'copying',
  v: 'pasting',
  x: 'cutting',
  z: 'undoing',
  y: 'redoing',
  w: 'closing the window',
  q: 'quitting',
  r: 'reloading',
  f: 'finding text',
};

const MODIFIERS = ['Control', 'Meta', 'Shift', 'Alt', 'AltGraph', 'OS'];

/** Whether Ctrl (⌘) with `key` belongs to editing or the window. */
export function isReservedKey(key) {
  return Object.hasOwn(RESERVED, String(key || '').toLowerCase());
}

/**
 * The shortcuts with the keys someone saved. Only the keys are taken from
 * what was saved: older versions saved whole entries, with labels such as
 * "Command Center" that are gone now, and ids no longer here are dropped.
 */
export function mergeSavedShortcuts(saved) {
  const merged = {};
  for (const [id, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
    const own = saved && typeof saved === 'object' ? saved[id] : null;
    // A saved key that copying, pasting and the like need goes back to the default.
    merged[id] = own && typeof own.key === 'string' && own.key && !isReservedKey(own.key)
      ? { ...shortcut, key: own.key, ctrl: own.ctrl !== false, meta: own.meta !== false }
      : shortcut;
  }
  return merged;
}

export const loadKeyboardShortcuts = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return mergeSavedShortcuts(saved ? JSON.parse(saved) : null);
  } catch {
    return DEFAULT_SHORTCUTS;
  }
};

export const saveKeyboardShortcuts = (shortcuts) => {
  const keys = Object.fromEntries(Object.entries(shortcuts).map(([id, { key, ctrl, meta }]) => [id, { key, ctrl, meta }]));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch { /* localStorage may be unavailable */ }
  window.dispatchEvent(new Event('keyboard-shortcuts-changed'));
};

/** Whether two shortcuts are the same keys (the sidebar treats Ctrl and ⌘ alike). */
export function sameKeys(a, b) {
  return Boolean(a && b) && String(a.key).toLowerCase() === String(b.key).toLowerCase() && Boolean(a.ctrl) === Boolean(b.ctrl);
}

/** The id of another shortcut already on these keys, or null. */
export function findConflict(shortcuts, id, keys) {
  const match = Object.entries(shortcuts).find(([otherId, shortcut]) => otherId !== id && sameKeys(shortcut, keys));
  return match ? match[0] : null;
}

/**
 * Put `keys` on shortcut `id`. A shortcut that had them takes `id`'s old
 * keys, so the two swap and none is left without one.
 */
export function assignShortcut(shortcuts, id, keys) {
  const next = { ...shortcuts, [id]: { ...shortcuts[id], key: keys.key, ctrl: true, meta: true } };
  const other = findConflict(shortcuts, id, keys);
  if (other) {
    const previous = shortcuts[id];
    next[other] = { ...shortcuts[other], key: previous.key, ctrl: previous.ctrl, meta: previous.meta };
  }
  return next;
}

/**
 * The keys a key press records: Ctrl or ⌘ and one other key, or null while
 * only modifiers are held or no Ctrl/⌘ is down (a plain key would fire while
 * typing).
 */
export function keysFromEvent(event) {
  if (!event.ctrlKey && !event.metaKey) return null;
  if (MODIFIERS.includes(event.key)) return null;
  if (!event.key || event.key === 'Dead' || event.key === 'Unidentified') return null;
  if (shortcutRefusal(event)) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return { key, ctrl: true, meta: true };
}

/**
 * Why a key press being recorded can't be a shortcut, in a sentence, or
 * null: Shift or Alt with it (they would be ignored), or a key that edits
 * text or runs the window.
 *   "Ctrl+C is for copying. Pick another key."
 */
export function shortcutRefusal(event, { mac = false } = {}) {
  if (!event?.ctrlKey && !event?.metaKey) return null;
  if (!event.key || MODIFIERS.includes(event.key)) return null;
  if (event.shiftKey || event.altKey) {
    return `Shortcuts are ${mac ? '⌘' : 'Ctrl'} and one key, without Shift or ${mac ? 'Option' : 'Alt'}. Pick another.`;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (isReservedKey(key)) return `${mac ? '⌘' : 'Ctrl+'}${key.toUpperCase()} is for ${RESERVED[key]}. Pick another key.`;
  return null;
}

/** How a shortcut's key reads on a key cap: "K", "Space", "ArrowUp". */
export function keyName(key) {
  if (key === ' ') return 'Space';
  return String(key || '').length === 1 ? String(key).toUpperCase() : String(key || '');
}

export const DEFAULT_KEYBOARD_SHORTCUTS = DEFAULT_SHORTCUTS;
