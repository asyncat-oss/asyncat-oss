// Settings → General → "New chats start in": the last mode used,
// or always Plan, or always Action.

const KEY = 'asyncat_new_chat_mode';
export const ALWAYS_ALLOW_KEY = 'asyncat_always_allow_tools';
export const ALWAYS_ALLOW_EVENT = 'asyncat:always-allow-changed';

export function newChatMode() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'plan' || value === 'action' ? value : 'last';
  } catch {
    return 'last';
  }
}

export function setNewChatMode(mode) {
  try {
    if (mode === 'plan' || mode === 'action') localStorage.setItem(KEY, mode);
    else localStorage.removeItem(KEY);
  } catch { /* localStorage may be unavailable */ }
}

/** Whether a new chat starts with tools on, or null to keep the last mode. */
export function newChatToolsEnabled() {
  const mode = newChatMode();
  return mode === 'plan' ? false : mode === 'action' ? true : null;
}

/** Tools the user chose "Always allow" for in chats. */
export function alwaysAllowedChatTools() {
  try {
    const list = JSON.parse(localStorage.getItem(ALWAYS_ALLOW_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function setAlwaysAllowedChatTools(list) {
  try {
    localStorage.setItem(ALWAYS_ALLOW_KEY, JSON.stringify([...new Set(list)]));
  } catch { /* localStorage may be unavailable */ }
  window.dispatchEvent(new Event(ALWAYS_ALLOW_EVENT));
}
