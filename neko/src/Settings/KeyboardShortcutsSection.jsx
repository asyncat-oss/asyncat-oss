import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Keyboard, AlertTriangle } from 'lucide-react';
import { DEFAULT_KEYBOARD_SHORTCUTS, loadKeyboardShortcuts, saveKeyboardShortcuts } from '../utils/keyboardShortcutsUtils.js';

const DEFAULT_SHORTCUTS = DEFAULT_KEYBOARD_SHORTCUTS;

const loadShortcuts = loadKeyboardShortcuts;
const saveShortcuts = saveKeyboardShortcuts;

const normalizeKey = (key) => {
  if (key === ' ') return 'Space';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  if (key === 'Escape') return 'Esc';
  if (key === 'Backspace') return '⌫';
  if (key === 'Delete') return 'Del';
  if (key === 'Enter') return '↵';
  if (key === 'Tab') return '⇥';
  if (key.length === 1) return key.toUpperCase();
  return key;
};

const KeyRecorder = ({ shortcut, onSave, onCancel }) => {
  const [recording, setRecording] = useState(false);
  const [keys, setKeys] = useState({ ctrl: shortcut.ctrl, meta: shortcut.meta, key: shortcut.key });
  const [modifierWarning, setModifierWarning] = useState(false);
  const inputRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setRecording(false);
      onCancel();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      setRecording(false);
      return;
    }

    const hasCtrl = e.ctrlKey || e.metaKey;
    const hasMeta = e.metaKey;

    if (!hasCtrl && !hasMeta && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      setKeys({ ctrl: false, meta: false, key: e.key });
      setModifierWarning(false);
    } else if ((e.ctrlKey || e.metaKey) && e.key !== 'Control' && e.key !== 'Meta') {
      setKeys({ ctrl: e.ctrlKey || hasMeta, meta: hasMeta || e.metaKey, key: e.key });
      setModifierWarning(false);
    }
  }, [onCancel]);

  useEffect(() => {
    if (recording) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [recording, handleKeyDown]);

  useEffect(() => {
    if (recording && inputRef.current) {
      inputRef.current.focus();
    }
  }, [recording]);

  const handleSave = () => {
    if (!keys.key) return;
    onSave({ ...shortcut, ...keys });
    setRecording(false);
  };

  const handleCancel = () => {
    setKeys({ ctrl: shortcut.ctrl, meta: shortcut.meta, key: shortcut.key });
    setRecording(false);
  };

  const displayKey = () => {
    const parts = [];
    if (keys.ctrl) parts.push('Ctrl');
    if (keys.meta) parts.push('Cmd');
    if (keys.key) parts.push(normalizeKey(keys.key));
    return parts.length > 0 ? parts.join(' + ') : 'Press keys...';
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <div
          ref={inputRef}
          tabIndex={0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/50 midnight:bg-blue-900/50 border-2 border-blue-500 focus:outline-none"
        >
          <input type="text" readOnly value={displayKey()} className="bg-transparent text-blue-600 dark:text-blue-400 font-mono text-sm w-32" />
          <span className="text-xs text-blue-500 dark:text-blue-400 animate-pulse">Recording...</span>
        </div>
        <button onClick={handleSave} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">Save</button>
        <button onClick={handleCancel} className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setRecording(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 transition-colors"
    >
      <kbd className="font-mono text-xs bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 px-1.5 py-0.5 rounded">{displayKey()}</kbd>
      <span className="text-xs text-gray-500">Click to change</span>
    </button>
  );
};

const KeyboardShortcutsSection = () => {
  const [shortcuts, setShortcuts] = useState(loadShortcuts);
  const [conflicts, setConflicts] = useState([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingShortcut, setPendingShortcut] = useState(null);

  useEffect(() => {
    const handleStorageChange = () => {
      setShortcuts(loadShortcuts());
    };
    window.addEventListener('keyboard-shortcuts-changed', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('keyboard-shortcuts-changed', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const findConflicts = (shortcutId, newCombo) => {
    const conflictsList = [];
    Object.entries(shortcuts).forEach(([id, shortcut]) => {
      if (id === shortcutId) return;
      if (shortcut.key === newCombo.key && shortcut.ctrl === newCombo.ctrl && shortcut.meta === newCombo.meta) {
        conflictsList.push({ id, shortcut });
      }
    });
    return conflictsList;
  };

  const handleSaveShortcut = (shortcutId, newShortcut) => {
    const conflictsList = findConflicts(shortcutId, newShortcut);
    if (conflictsList.length > 0) {
      setConflicts(conflictsList.map(c => ({ ...c, newShortcut })));
      setPendingShortcut(shortcutId);
      setShowConflictModal(true);
    } else {
      const newShortcuts = { ...shortcuts, [shortcutId]: newShortcut };
      setShortcuts(newShortcuts);
      saveShortcuts(newShortcuts);
    }
  };

  const forceSaveShortcut = () => {
    if (!pendingShortcut) return;
    const conflictShortcut = conflicts[0];
    const newShortcuts = { ...shortcuts, [pendingShortcut]: conflicts[0].newShortcut };
    setShortcuts(newShortcuts);
    saveShortcuts(newShortcuts);
    setShowConflictModal(false);
    setPendingShortcut(null);
    setConflicts([]);
  };

  const cancelConflict = () => {
    setShowConflictModal(false);
    setPendingShortcut(null);
    setConflicts([]);
  };

  const handleReset = () => {
    setShortcuts(DEFAULT_SHORTCUTS);
    saveShortcuts(DEFAULT_SHORTCUTS);
  };

  return (
    <div className="space-y-6">
      <div className="backdrop-blur-md bg-white/90 dark:bg-gray-800/90 midnight:bg-gray-900/90 p-6 rounded-xl shadow-sm border border-gray-200/50 dark:border-gray-600/50 midnight:border-gray-500/40">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard size={20} className="text-gray-700 dark:text-gray-200 midnight:text-blue-300" />
            <h3 className="text-base font-medium text-gray-700 dark:text-gray-200 midnight:text-blue-200">
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Reset to Default
          </button>
        </div>

        <div className="space-y-3">
          {Object.entries(shortcuts).map(([id, shortcut]) => (
            <div key={id} className="flex items-center justify-between py-2 border-b border-gray-200/50 dark:border-gray-700/50 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-300 min-w-[140px]">
                  {shortcut.label}
                </span>
              </div>
              <KeyRecorder shortcut={shortcut} onSave={(s) => handleSaveShortcut(id, s)} onCancel={() => {}} />
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-300 midnight:text-gray-200 mt-4">
          Click on a shortcut to record a new key combination. Press Escape to cancel recording.
        </p>
      </div>

      {showConflictModal && conflicts.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-2 mb-4 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={20} />
              <h3 className="text-lg font-semibold">Shortcut Conflict</h3>
            </div>

            <p className="text-gray-600 dark:text-gray-300 mb-4">
              This key combination is already used for:
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/30 rounded-lg p-4 mb-4 border border-amber-200/50 dark:border-amber-700/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{conflicts[0].shortcut.label}</span>
                <kbd className="font-mono text-xs bg-amber-200 dark:bg-amber-800 px-2 py-1 rounded">
                  {(conflicts[0].shortcut.ctrl ? 'Ctrl + ' : '') + (conflicts[0].shortcut.meta ? 'Cmd + ' : '') + normalizeKey(conflicts[0].shortcut.key)}
                </kbd>
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Do you want to replace it with the new shortcut?
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelConflict}
                className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={forceSaveShortcut}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeyboardShortcutsSection;