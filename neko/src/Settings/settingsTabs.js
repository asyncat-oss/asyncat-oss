// The Settings pages, in the order the left column lists them, and where the
// old page addresses lead now (links in older builds, den and notifications
// still use some of them). `sections` are the parts of a page a link or a
// search result can scroll to (data-settings-section on the page).

export const SETTINGS_TABS = [
  { id: 'general', group: 'App', label: 'General', description: 'Your name and picture, how new chats start, and what closing the window does.', sections: ['new-chats', 'window', 'setup'] },
  { id: 'appearance', group: 'App', label: 'Appearance', description: 'Theme, motion and what the sidebar shows.' },
  { id: 'personalization', group: 'App', label: 'Personalization', description: 'What Asyncat should know about you, how it answers, and its instructions file.', sections: ['instructions'] },
  { id: 'shortcuts', group: 'App', label: 'Shortcuts', description: 'Keys for getting around Asyncat, and the ones that work from any app.' },
  { id: 'notifications', group: 'App', label: 'Notifications', description: 'What shows a notification, for chats and Cats, and quiet hours.' },
  { id: 'connections', group: 'Agents', label: 'Connections', description: 'Connectors that give agents tools from other apps, and the services Asyncat uses.' },
  { id: 'privacy', group: 'Agents', label: 'Privacy & safety', description: 'What agents may do and where they may go, your saved keys, and your data: where it lives, export it, delete it.', sections: ['data'] },
  { id: 'workbench', group: 'Agents', label: 'Workbench', description: 'The browser and terminal beside your chats.' },
  { id: 'desktop', group: 'System', label: 'Desktop', description: "The pet, Quick ask and Asyncat's data folder.", sections: ['pet', 'quick-ask', 'app-data'] },
  { id: 'about', group: 'System', label: 'About', description: 'Version, updates and developer options.', sections: ['developer'] },
];

export const DEFAULT_TAB = 'general';

/**
 * Old addresses: the page (and Connections view, or section to scroll to)
 * each one opens now, or a `redirect` out of Settings.
 */
export const TAB_ALIASES = {
  // Ctrl+, and the sidebar's Settings item still open /settings/profile.
  profile: { tab: 'general' },
  account: { tab: 'general' },
  background: { tab: 'general', section: 'window' },
  security: { tab: 'privacy' },
  safety: { tab: 'privacy' },
  data: { tab: 'privacy', section: 'data' },
  notify: { tab: 'notifications' },
  integrations: { tab: 'connections', view: 'services' },
  services: { tab: 'connections', view: 'services' },
  connectors: { tab: 'connections', view: 'connectors' },
  mcp: { tab: 'connections', view: 'connectors' },
  keyboard: { tab: 'shortcuts' },
  hotkeys: { tab: 'shortcuts' },
  personalisation: { tab: 'personalization' },
  preferences: { tab: 'personalization' },
  // The instructions file was the Soul tab in Tools & Skills.
  soul: { tab: 'personalization', section: 'instructions' },
  instructions: { tab: 'personalization', section: 'instructions' },
  pet: { tab: 'desktop', section: 'pet' },
  tray: { tab: 'general', section: 'window' },
  'quick-ask': { tab: 'desktop', section: 'quick-ask' },
  updates: { tab: 'about' },
  advanced: { tab: 'about', section: 'developer' },
  server: { tab: 'about', section: 'developer' },
  // Engines are installed and updated on the Models page; their disk use is in Files.
  runtime: { redirect: '/models?view=local' },
  engines: { redirect: '/models?view=local' },
  storage: { redirect: '/files/logs' },
  projects: { redirect: '/projects' },
  workspace: { redirect: '/projects' },
};

/**
 * What a /settings/<tab> address opens: { tab, view, section } or
 * { redirect }. Unknown and missing tabs open General.
 */
export function resolveTab(raw) {
  const id = String(raw || '').toLowerCase();
  if (SETTINGS_TABS.some((tab) => tab.id === id)) return { tab: id, view: null, section: null };
  const alias = TAB_ALIASES[id];
  if (alias?.redirect) return { redirect: alias.redirect };
  if (alias) return { tab: alias.tab, view: alias.view || null, section: alias.section || null };
  return { tab: DEFAULT_TAB, view: null, section: null };
}
