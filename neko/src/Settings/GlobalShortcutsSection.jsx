import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Globe2 } from 'lucide-react';
import Switch from '../components/ui/Switch.jsx';
import { acceleratorFromEvent, formatAccelerator } from './globalShortcutText.js';

// System-wide shortcuts work in every app while Asyncat runs, and the app in
// front never sees the key press, so they can block shortcuts in an editor or
// browser. This card lets people rebind or turn them off. Desktop app only.

const SHORTCUTS = [
  { id: 'quickAsk', label: 'Quick ask', description: 'Open Quick ask from any app.' },
  { id: 'toggleWindow', label: 'Show or hide Asyncat', description: 'Bring the Asyncat window forward, or hide it.' },
];

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
  // Wayland desktops may never pass a global shortcut on (it can still show
  // as active), so Quick ask also opens with `<command> --quick-ask`.
  const [quickAskCommand, setQuickAskCommand] = useState(null);

  useEffect(() => {
    if (!available) return;
    api.getGlobalShortcuts().then(setShortcuts).catch(() => setError('Could not read the shortcut settings.'));
    api.getPlatform?.().then(platform => setIsMac(platform === 'darwin')).catch(() => {});
    api.getQuickAskCommand?.().then((info) => setQuickAskCommand(info?.wayland ? info.command : null)).catch(() => {});
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
            <div key={id} className="border-b border-gray-200/50 py-3 last:border-0 dark:border-gray-700/50">
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <Switch
                    checked={Boolean(entry?.enabled)}
                    onChange={(enabled) => entry && update(id, { enabled })}
                    disabled={!entry}
                    label={`${label} shortcut`}
                  />
                </div>
              </div>
              {id === 'quickAsk' && quickAskCommand && entry?.enabled && (
                <p className="mt-2 text-xs text-fg-muted">
                  On Wayland, bind <code className="select-all break-all rounded bg-hover px-1 py-0.5 font-mono text-[11px] text-fg">{quickAskCommand}</code> in your desktop&apos;s keyboard settings.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
