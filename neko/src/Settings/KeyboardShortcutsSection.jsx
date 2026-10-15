// Settings → Shortcuts → In Asyncat: the keys for getting around the app.
// Change one by pressing Ctrl (⌘ on a Mac) and a key; taking keys another
// shortcut has swaps the two. The sidebar listens for them.

import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { RowGroup, SettingsSection } from '../components/ui/Rows.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { formatShortcut, isMacPlatform } from '../components/ui/shortcuts.js';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  assignShortcut,
  findConflict,
  keysFromEvent,
  loadKeyboardShortcuts,
  saveKeyboardShortcuts,
  shortcutRefusal,
} from '../utils/keyboardShortcutsUtils.js';
import Keys from './Keys.jsx';

function shortcutKeys(shortcut, isMac) {
  if (!shortcut?.key) return [];
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  return shortcut.ctrl ? [isMac ? '⌘' : 'Ctrl', key] : [key];
}

export default function KeyboardShortcutsSection() {
  const confirm = useConfirm();
  const [shortcuts, setShortcuts] = useState(loadKeyboardShortcuts);
  const [recording, setRecording] = useState(null);
  // Why the last key pressed while recording can't be used.
  const [refusal, setRefusal] = useState('');
  const isMac = isMacPlatform();

  useEffect(() => { setRefusal(''); }, [recording]);

  useEffect(() => {
    const reload = () => setShortcuts(loadKeyboardShortcuts());
    window.addEventListener('keyboard-shortcuts-changed', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('keyboard-shortcuts-changed', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  useEffect(() => {
    if (!recording) return undefined;
    // Before the sidebar's own listener, so the keys being recorded don't
    // also open search or a page.
    const onKey = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }
      const refused = shortcutRefusal(event, { mac: isMac });
      if (refused) {
        setRefusal(refused);
        return;
      }
      const keys = keysFromEvent(event);
      if (!keys) return;
      const id = recording;
      setRecording(null);
      const other = findConflict(shortcuts, id, keys);
      if (other) {
        const ok = await confirm({
          title: `${formatShortcut(keys)} is taken`,
          message: `${shortcuts[other].label} uses it. Use it for ${shortcuts[id].label}, and give ${shortcuts[other].label} ${formatShortcut(shortcuts[id])}?`,
          confirmLabel: 'Swap them',
        });
        if (!ok) return;
      }
      const next = assignShortcut(shortcuts, id, keys);
      setShortcuts(next);
      saveKeyboardShortcuts(next);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, shortcuts, confirm, isMac]);

  const reset = () => {
    setRecording(null);
    setShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
    saveKeyboardShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
  };

  return (
    <SettingsSection
      icon={Keyboard}
      title="In Asyncat"
      hint={`To change one, choose Change, then press ${isMac ? '⌘' : 'Ctrl'} and a key. Escape cancels.`}
      aside={<Button size="xs" variant="ghost" onClick={reset}>Reset</Button>}
      data-app-shortcuts
    >
      <RowGroup>
        {Object.entries(shortcuts).map(([id, shortcut]) => {
          const isRecording = recording === id;
          return (
            <div key={id} className="flex min-h-11 items-center justify-between gap-4 px-4 py-1.5" data-shortcut={id}>
              <span className="min-w-0 text-[13px] font-medium text-fg">{shortcut.label}</span>
              <div className="flex shrink-0 items-center gap-2">
                {isRecording
                  ? (
                    <span className={`text-right text-[12px] ${refusal ? 'text-amber-700 dark:text-amber-400' : 'text-fg-muted'}`} aria-live="polite">
                      {refusal || `Press ${isMac ? '⌘' : 'Ctrl'} and a key…`}
                    </span>
                  )
                  : <Keys keys={shortcutKeys(shortcut, isMac)} />}
                <Button size="xs" variant="ghost" onClick={() => setRecording(isRecording ? null : id)} aria-label={isRecording ? 'Cancel' : `Change the shortcut for ${shortcut.label}`}>
                  {isRecording ? 'Cancel' : 'Change'}
                </Button>
              </div>
            </div>
          );
        })}
      </RowGroup>
    </SettingsSection>
  );
}
