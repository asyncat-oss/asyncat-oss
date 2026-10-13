// electron/browserTabsStore.js
// ─── The built-in browser's tabs, kept across restarts ───────────────────────
// Only the user's own Standard-profile tabs are saved: never Incognito tabs,
// tabs the agent opened, hidden tabs, pop-up windows or a Cat's tabs. Each
// is saved as its address and title, in tab-strip order, with which one was
// active. On the next start they come back as sleeping tabs (browserHost.js):
// only a tab that is shown loads its page.

import fs from 'fs';
import path from 'path';

export const SAVED_TABS_VERSION = 1;
export const MAX_SAVED_TABS = 40;
const MAX_TITLE = 300;
const MAX_URL = 4096;

/** The tabs worth saving, from browserHost's tab records. */
export function savableTabs(tabs) {
  return [...tabs].filter((tab) => (
    tab
    && tab.profile === 'standard'
    && !tab.agent
    && !tab.hidden
    && !tab.popup
    && !tab.catProfile
    && typeof tab.url === 'string'
    && /^https?:\/\//i.test(tab.url)
  ));
}

/** What goes in the file: { version, tabs: [{ url, title }], activeIndex }. */
export function serializeTabs(tabs, activeTabId = null) {
  const kept = savableTabs(tabs).slice(-MAX_SAVED_TABS);
  const activeIndex = kept.findIndex((tab) => tab.id === activeTabId);
  return {
    version: SAVED_TABS_VERSION,
    savedAt: new Date().toISOString(),
    activeIndex: activeIndex >= 0 ? activeIndex : (kept.length ? kept.length - 1 : -1),
    tabs: kept.map((tab) => ({
      url: tab.url.slice(0, MAX_URL),
      title: String(tab.title || '').slice(0, MAX_TITLE),
    })),
  };
}

/**
 * The tabs to reopen from what the file held. `isAllowed(url)` is the
 * browser's address policy; anything it refuses is skipped.
 */
export function parseSavedTabs(data, isAllowed = () => true) {
  if (!data || typeof data !== 'object' || data.version !== SAVED_TABS_VERSION || !Array.isArray(data.tabs)) {
    return { tabs: [], activeIndex: -1 };
  }
  const wantedActive = Number.isInteger(data.activeIndex) ? data.activeIndex : -1;
  const tabs = [];
  let activeIndex = -1;
  data.tabs.slice(0, MAX_SAVED_TABS).forEach((entry, index) => {
    const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
    if (!url || url.length > MAX_URL || !/^https?:\/\//i.test(url)) return;
    let allowed = false;
    try { allowed = Boolean(isAllowed(url)); } catch { allowed = false; }
    if (!allowed) return;
    if (index === wantedActive) activeIndex = tabs.length;
    tabs.push({ url, title: typeof entry.title === 'string' ? entry.title.slice(0, MAX_TITLE) : '' });
  });
  if (activeIndex < 0 && tabs.length) activeIndex = tabs.length - 1;
  return { tabs, activeIndex };
}

export function readSavedTabsFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Write the file whole or not at all. */
export function writeSavedTabsFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 1), { mode: 0o600 });
  fs.renameSync(temp, file);
}
