// System-wide shortcuts in Electron's accelerator form ("Control+Shift+Space"):
// reading one from a key press, and the key names to show for one.

const CODE_KEYS = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`',
};

// The non-modifier key of a key press, in Electron's accelerator naming, or
// null while only modifiers are held.
function keyFromEvent(event) {
  const { code } = event;
  let match = /^Key([A-Z])$/.exec(code);
  if (match) return match[1];
  match = /^Digit([0-9])$/.exec(code);
  if (match) return match[1];
  match = /^F([0-9]{1,2})$/.exec(code);
  if (match) return `F${match[1]}`;
  return CODE_KEYS[code] || null;
}

/** The accelerator a key press makes, or null while only modifiers are held. */
export function acceleratorFromEvent(event, isMac) {
  const key = keyFromEvent(event);
  if (!key) return null;
  const parts = [];
  if (isMac) {
    if (event.metaKey) parts.push('Command');
    if (event.ctrlKey) parts.push('Control');
  } else {
    if (event.ctrlKey) parts.push('Control');
    if (event.metaKey) parts.push('Super');
  }
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

/** The keys of an accelerator, as people know them on this computer. */
export function formatAccelerator(accelerator, isMac) {
  const names = isMac
    ? { CommandOrControl: '⌘', Command: '⌘', Control: '⌃', Alt: '⌥', AltGr: '⌥', Shift: '⇧', Super: '⌘' }
    : { CommandOrControl: 'Ctrl', Command: 'Cmd', Control: 'Ctrl', Alt: 'Alt', AltGr: 'AltGr', Shift: 'Shift', Super: 'Win' };
  return String(accelerator || '').split('+').filter(Boolean).map((part) => names[part] || part);
}

/** A shortcut's state in words: { tone, text } for its status line. */
export function shortcutStatus(entry) {
  if (!entry) return { tone: 'off', text: 'Checking…' };
  if (!entry.enabled || entry.status === 'off') return { tone: 'off', text: 'Off' };
  if (entry.status === 'unavailable') return { tone: 'warning', text: 'Another app has these keys' };
  return { tone: 'ok', text: 'On' };
}
