// Display helpers for keyboard shortcuts (see utils/keyboardShortcutsUtils.js).

export function isMacPlatform() {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  return /mac/i.test(platform);
}

/** "⌘K" on macOS, "Ctrl+K" elsewhere; '' when there is no shortcut. */
export function formatShortcut(shortcut) {
  if (!shortcut?.key) return '';
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  if (!shortcut.ctrl) return key;
  return isMacPlatform() ? `⌘${key}` : `Ctrl+${key}`;
}
