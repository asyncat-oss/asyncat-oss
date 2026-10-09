import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Globe2 } from 'lucide-react';

// System-wide shortcuts work in every app while Asyncat runs, and the app in
// front never sees the key press, so they can block shortcuts in an editor or
// browser. This card lets people rebind or turn them off. Desktop app only.

const SHORTCUTS = [
  { id: 'quickAsk', label: 'Quick ask', description: 'Open the quick-ask popup from any app.' },
  { id: 'toggleWindow', label: 'Show or hide Asyncat', description: 'Bring the Asyncat window forward, or hide it.' },
];

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

function acceleratorFromEvent(event, isMac) {
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

function formatAccelerator(accelerator, isMac) {
  const names = isMac
    ? { CommandOrControl: '⌘', Command: '⌘', Control: '⌃', Alt: '⌥', AltGr: '⌥', Shift: '⇧', Super: '⌘' }
    : { CommandOrControl: 'Ctrl', Command: 'Cmd', Control: 'Ctrl', Alt: 'Alt', AltGr: 'AltGr', Shift: 'Shift', Super: 'Win' };
  return String(accelerator || '').split('+').map(part => names[part] || part);
}

function Keys({ accelerator, isMac }) {
  return (
    <span className="inline-flex items-center gap-1">
      {formatAccelerator(accelerator, isMac).map((part, index) => (
        <kbd
          key={`${part}-${index}`}
          className="min-w-[1.5rem] rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-center font-sans text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-200"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

Keys.propTypes = {
  accelerator: PropTypes.string,
  isMac: PropTypes.bool,
};

const STATUS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
  off: { label: 'Off', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  unavailable: { label: 'Taken by another app', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
};

export default function GlobalShortcutsSection() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const available = Boolean(api?.getGlobalShortcuts);
  const [shortcuts, setShortcuts] = useState(null);
  const [isMac, setIsMac] = useState(false);
  const [recording, setRecording] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!available) return;
    api.getGlobalShortcuts().then(setShortcuts).catch(() => setError('Could not read the shortcut settings.'));
    api.getPlatform?.().then(platform => setIsMac(platform === 'darwin')).catch(() => {});
  }, [api, available]);

  const update = useCallback(async (id, patch) => {
    setError('');
    const result = await api.setGlobalShortcut(id, patch).catch(() => null);
    if (!result) {
      setError('Could not save the shortcut.');
      return;
    }
    setShortcuts(result.shortcuts);
    if (!result.ok) setError(result.error);
  }, [api]);

  useEffect(() => {
    if (!recording) return undefined;
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setRecording(null);
        return;
      }
      const accelerator = acceleratorFromEvent(event, isMac);
      if (!accelerator) return; // still holding modifiers only
      setRecording(null);
      update(recording, { accelerator });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, isMac, update]);

  if (!available) return null;

  const reset = async () => {
    setError('');
    const result = await api.resetGlobalShortcuts().catch(() => null);
    if (result) setShortcuts(result.shortcuts);
  };

  return (
    <section className="rounded-xl border border-gray-200/80 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 size={18} className="text-gray-500 dark:text-gray-400 midnight:text-slate-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">System-wide Shortcuts</h3>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Reset to Default
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
        These work in every app while Asyncat is running, and that app won&apos;t receive the keys. Turn one off or pick another combination if it clashes with your editor or browser.
      </p>

      <div className="space-y-1">
        {SHORTCUTS.map(({ id, label, description }) => {
          const entry = shortcuts?.[id];
          const status = STATUS[entry?.status] || STATUS.off;
          const isRecording = recording === id;
          return (
            <div key={id} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/50 py-3 last:border-0 dark:border-gray-700/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-200">{label}</span>
                  {entry && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
              </div>
              <div className="flex items-center gap-3">
                {entry && (isRecording
                  ? <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Press a key combination… (Esc to cancel)</span>
                  : <Keys accelerator={entry.accelerator} isMac={isMac} />)}
                <button
                  type="button"
                  onClick={() => setRecording(isRecording ? null : id)}
                  disabled={!entry}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {isRecording ? 'Cancel' : 'Change'}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(entry?.enabled)}
                  aria-label={`${label} shortcut`}
                  onClick={() => entry && update(id, { enabled: !entry.enabled })}
                  disabled={!entry}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${entry?.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${entry?.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
