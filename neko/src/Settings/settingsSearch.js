// The words each Settings page answers to, so the search box at the top of
// Settings finds "quiet hours" or "MCP" without knowing where they live. An
// entry with a `section` scrolls to that part of its page; one with a
// `route` lives outside Settings now (engines in Models, logs in Files).

export const SETTINGS_INDEX = [
  { tab: 'general', label: 'Profile', terms: ['profile', 'name', 'display name', 'avatar', 'picture', 'photo'] },
  { tab: 'general', section: 'new-chats', label: 'New chats', terms: ['new chats', 'default mode', 'plan mode', 'action mode', 'plan or action', 'start in'] },
  { tab: 'general', section: 'window', label: 'Closing the window', terms: ['background', 'tray', 'close window', 'closing the window', 'quit', 'keep running', 'start at login', 'log in', 'autostart'] },
  { tab: 'general', section: 'setup', label: 'First-run setup', terms: ['setup', 'run setup again', 'first-run setup', 'welcome', 'onboarding'] },
  { tab: 'appearance', terms: ['appearance', 'theme', 'dark mode', 'light mode', 'midnight', 'system theme', 'colour', 'color', 'motion', 'animation', 'fade', 'sidebar', 'navigation', 'compact', 'icons only', 'hide from sidebar'] },
  { tab: 'shortcuts', terms: ['shortcuts', 'keyboard', 'keys', 'hotkeys', 'key bindings', 'system-wide shortcuts', 'global shortcuts', 'quick ask shortcut', 'show or hide asyncat', 'wayland'] },
  { tab: 'notifications', terms: ['notifications', 'notify', 'alerts', 'quiet hours', 'do not disturb', 'sounds', 'desktop notification'] },
  { tab: 'connections', view: 'services', label: 'Services', terms: ['services', 'rss', 'feeds', 'read later', 'email', 'mail', 'imap', 'smtp', 'discord', 'slack', 'telegram', 'webhook', 'hugging face', 'hf token'] },
  { tab: 'connections', view: 'connectors', label: 'Connectors', terms: ['connectors', 'mcp', 'model context protocol', 'notion', 'github', 'linear', 'sentry', 'stripe', 'supabase', 'context7', 'oauth', 'sign in', 'npx', 'tools from apps'] },
  { tab: 'privacy', terms: ['privacy', 'safety', 'security', 'always allowed', 'always allow', 'approvals', 'permissions', 'revoke', 'sandbox', 'command sandbox', 'network', 'registries', 'browser rules', 'blocked sites', 'learning', 'memories', 'suggest skills', 'keychain', 'encryption', 'secret key', 'saved keys'] },
  { tab: 'privacy', section: 'data', label: 'Your data', terms: ['where data lives', 'data folder', 'export', 'backup', 'import', 'chatgpt', 'claude', 'bring chats', 'delete everything', 'erase'] },
  { tab: 'workbench', terms: ['workbench', 'browser', 'terminal', 'shell', 'panel', 'layout', 'tabs', 'reopen tabs', 'search engine', 'links', 'history', 'browsing data', 'cookies'] },
  { tab: 'desktop', section: 'pet', label: 'Pet', terms: ['desktop', 'pet', 'cat on screen', 'sprite'] },
  { tab: 'desktop', section: 'quick-ask', label: 'Quick ask', terms: ['quick ask', 'popup', 'tray menu'] },
  { tab: 'desktop', section: 'app-data', label: 'App data', terms: ['app data', 'data folder', 'uninstall'] },
  { tab: 'about', terms: ['about', 'version', 'update', 'updates', 'release', 'beta', 'channel'] },
  { tab: 'about', section: 'developer', label: 'Developer options', terms: ['developer options', 'advanced', 'server', 'ports', 'paths', 'restart server', 'database', 'comfyui', 'models folder'] },
  { route: '/files/logs', icon: 'files', label: 'Files · Logs & caches', terms: ['storage', 'logs', 'caches', 'disk space', 'clear logs'] },
  { route: '/models?view=local', icon: 'models', label: 'Models · Local models', terms: ['engines', 'llama.cpp', 'whisper', 'piper', 'stable diffusion', 'mlx', 'versions'] },
];

/**
 * Settings matching `query`: [{ tab, view, section, route, label, term }],
 * best first. `tabs` gives the page labels ({ id, label, description }).
 */
export function searchSettings(query, tabs = []) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const results = [];
  for (const entry of SETTINGS_INDEX) {
    const tab = entry.route ? null : byId.get(entry.tab);
    if (!entry.route && !tab) continue;
    const label = entry.route ? entry.label : entry.label ? `${tab.label} · ${entry.label}` : tab.label;
    let score = 0;
    let term = null;
    if (label.toLowerCase().startsWith(q) || (entry.label && entry.label.toLowerCase().startsWith(q))) score = 4;
    for (const candidate of entry.terms) {
      const s = candidate === q ? 5 : candidate.startsWith(q) ? 3 : candidate.includes(q) ? 2 : 0;
      if (s > score) { score = s; term = candidate; }
    }
    if (!score && String(tab?.description || '').toLowerCase().includes(q)) score = 1;
    if (score) {
      results.push({
        tab: entry.tab || entry.icon || null,
        view: entry.view || null,
        section: entry.section || null,
        route: entry.route || null,
        label,
        term,
        score,
      });
    }
  }
  return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).map(({ score, ...rest }) => rest);
}

/** The address a search result opens. */
export function resultRoute(result) {
  if (result.route) return result.route;
  if (result.view === 'connectors') return '/settings/connectors';
  if (result.view === 'services') return '/settings/integrations';
  return `/settings/${result.tab}${result.section ? `#${result.section}` : ''}`;
}
