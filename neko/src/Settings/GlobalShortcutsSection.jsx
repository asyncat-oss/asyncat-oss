// Settings → Shortcuts → System-wide: shortcuts that work in every app while
// Asyncat runs. The app in front never sees the key press, so they can block
// shortcuts in an editor or browser; this lets people change them or turn
// them off. Desktop app only (electron/shortcuts.js).

import { useCallback, useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import Switch from '../components/ui/Switch.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import Keys from './Keys.jsx';
import { acceleratorFromEvent, formatAccelerator, shortcutStatus } from './globalShortcutText.js';

const SHORTCUTS = [
  { id: 'quickAsk', label: 'Quick ask', description: 'Open Quick ask from any app.' },
  { id: 'toggleWindow', label: 'Show or hide Asyncat', description: 'Bring the Asyncat window forward, or hide it.' },
];

const TITLE = 'System-wide';

export default function GlobalShortcutsSection() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const available = Boolean(api?.getGlobalShortcuts);
  const [shortcuts, setShortcuts] = useState(null);
  const [isMac, setIsMac] = useState(false);
  const [recording, setRecording] = useState(null);
  const [error, setError] = useState('');
  // Wayland desktops may never pass a global shortcut on (it can still show
  // as on), so Quick ask also opens with `<command> --quick-ask`.
  const [quickAskCommand, setQuickAskCommand] = useState(null);

  useEffect(() => {
    if (!available) return;
    api.getGlobalShortcuts().then(setShortcuts).catch(() => setError("Couldn't read the shortcut settings."));
    api.getPlatform?.().then((platform) => setIsMac(platform === 'darwin')).catch(() => {});
    api.getQuickAskCommand?.().then((info) => setQuickAskCommand(info?.wayland ? info.command : null)).catch(() => {});
  }, [api, available]);

  const update = useCallback(async (id, patch) => {
    setError('');
    const result = await api.setGlobalShortcut(id, patch).catch(() => null);
    if (!result) {
      setError("Couldn't save the shortcut.");
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

  if (!available) {
    return (
      <SettingsSection icon={Globe2} title={TITLE} data-settings-section="system-wide" className="scroll-mt-6">
        <Notice>System-wide shortcuts come with the Asyncat desktop app.</Notice>
      </SettingsSection>
    );
  }

  const reset = async () => {
    setError('');
    setRecording(null);
    const result = await api.resetGlobalShortcuts().catch(() => null);
    if (result) setShortcuts(result.shortcuts);
  };

  return (
    <SettingsSection
      icon={Globe2}
      title={TITLE}
      hint="These work in every app while Asyncat runs, and that app won't get the keys. Change one or turn it off if it clashes with your editor or browser."
      aside={<Button size="xs" variant="ghost" onClick={reset}>Reset</Button>}
      data-global-shortcuts
      data-settings-section="system-wide"
      className="scroll-mt-6"
    >
      <RowGroup>
        {SHORTCUTS.map(({ id, label, description }) => {
          const entry = shortcuts?.[id];
          const status = shortcutStatus(entry);
          const isRecording = recording === id;
          return (
            <SettingsRow
              key={id}
              label={label}
              data-global-shortcut={id}
              hint={(
                <>
                  <span className="block">{description}</span>
                  {status.tone === 'warning' ? <span className="block text-amber-700 dark:text-amber-400">{status.text}. Pick other keys.</span> : null}
                  {id === 'quickAsk' && quickAskCommand && entry?.enabled ? (
                    <span className="mt-1 block">
                      On Wayland, bind <code className="select-all break-all rounded bg-hover px-1 py-0.5 font-mono text-[11px] text-fg">{quickAskCommand}</code> in your desktop&apos;s keyboard settings.
                    </span>
                  ) : null}
                </>
              )}
            >
              <div className="flex items-center gap-2">
                {entry ? (isRecording
                  ? <span className="text-[12px] text-fg-muted" aria-live="polite">Press the keys… (Esc cancels)</span>
                  : <Keys keys={formatAccelerator(entry.accelerator, isMac)} />) : null}
                <Button size="xs" variant="ghost" onClick={() => setRecording(isRecording ? null : id)} disabled={!entry} aria-label={isRecording ? 'Cancel' : `Change the keys for ${label}`}>
                  {isRecording ? 'Cancel' : 'Change'}
                </Button>
                <Switch
                  checked={Boolean(entry?.enabled)}
                  onChange={(enabled) => entry && update(id, { enabled })}
                  disabled={!entry}
                  label={`${label} shortcut`}
                />
              </div>
            </SettingsRow>
          );
        })}
      </RowGroup>
      {error ? <Notice tone="error" className="mt-3">{error}</Notice> : null}
    </SettingsSection>
  );
}
