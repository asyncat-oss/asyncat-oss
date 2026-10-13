// Shared names for the update screen (components/UpdateScreen.jsx).
export const OPEN_UPDATE_EVENT = 'asyncat:open-update';
export const SKIPPED_UPDATE_KEY = 'asyncat_skipped_update';

export function openUpdateScreen() {
  window.dispatchEvent(new CustomEvent(OPEN_UPDATE_EVENT));
}

/** Whether the user chose "Skip this version" for `version`. */
export function isSkippedUpdate(version) {
  try { return Boolean(version) && localStorage.getItem(SKIPPED_UPDATE_KEY) === version; } catch { return false; }
}
