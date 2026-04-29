const DEFAULT_SHORTCUTS = {
  search: { key: 'k', ctrl: true, meta: true, label: 'Search', action: 'openSearch' },
  settings: { key: ',', ctrl: true, meta: true, label: 'Settings', action: 'openSettings' },
  newChat: { key: 'n', ctrl: true, meta: true, label: 'New Chat', action: 'newChat' },
  dock1: { key: '1', ctrl: true, meta: true, label: 'New Chat', action: 'navHome' },
  dock2: { key: '2', ctrl: true, meta: true, label: 'Chat History', action: 'navChat' },
  dock3: { key: '3', ctrl: true, meta: true, label: 'Workspace', action: 'navWorkspace' },
  dock4: { key: '4', ctrl: true, meta: true, label: 'Calendar', action: 'navCalendar' },
  dock5: { key: '5', ctrl: true, meta: true, label: 'Files', action: 'navFiles' },
  dock6: { key: '6', ctrl: true, meta: true, label: 'Models', action: 'navModels' },
  dock7: { key: '7', ctrl: true, meta: true, label: 'Tools & Skills', action: 'navTools' },
  dock8: { key: '8', ctrl: true, meta: true, label: 'Scheduler', action: 'navScheduler' },
  dock9: { key: '9', ctrl: true, meta: true, label: 'Profiles', action: 'navProfiles' },
};

export const loadKeyboardShortcuts = () => {
  try {
    const saved = localStorage.getItem('keyboardShortcuts');
    if (saved) {
      return { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) };
    }
  } catch (e) {}
  return DEFAULT_SHORTCUTS;
};

export const saveKeyboardShortcuts = (shortcuts) => {
  localStorage.setItem('keyboardShortcuts', JSON.stringify(shortcuts));
  window.dispatchEvent(new Event('keyboard-shortcuts-changed'));
};

export const DEFAULT_KEYBOARD_SHORTCUTS = DEFAULT_SHORTCUTS;
