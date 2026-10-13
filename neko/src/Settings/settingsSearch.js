// The words each Settings page answers to, so the search box at the top of
// Settings finds "quiet hours" or "MCP" without knowing where they live.

export const SETTINGS_INDEX = [
  { tab: 'profile', terms: ['profile', 'name', 'display name', 'avatar', 'picture', 'photo'] },
  { tab: 'appearance', terms: ['appearance', 'theme', 'dark mode', 'light mode', 'midnight', 'colour', 'color', 'font', 'motion', 'sidebar', 'navigation', 'keyboard', 'shortcuts', 'hotkeys', 'pet', 'cat on screen'] },
  { tab: 'connections', view: 'services', label: 'Services', terms: ['services', 'rss', 'feeds', 'read later', 'email', 'mail', 'imap', 'smtp', 'discord', 'slack', 'telegram', 'webhook', 'hugging face', 'hf token'] },
  { tab: 'connections', view: 'connectors', label: 'Connectors', terms: ['connectors', 'mcp', 'model context protocol', 'notion', 'github', 'linear', 'sentry', 'stripe', 'supabase', 'context7', 'oauth', 'sign in', 'npx', 'tools from apps'] },
  { tab: 'privacy', terms: ['privacy', 'safety', 'security', 'default mode', 'plan mode', 'action mode', 'always allowed', 'always allow', 'approvals', 'permissions', 'revoke', 'sandbox', 'command sandbox', 'browser rules', 'blocked sites', 'keychain', 'encryption', 'secret key', 'where data lives', 'data folder', 'export', 'backup', 'import', 'chatgpt', 'claude', 'bring chats', 'delete everything', 'erase'] },
  { tab: 'notifications', terms: ['notifications', 'notify', 'alerts', 'quiet hours', 'do not disturb', 'sounds', 'desktop notification'] },
  { tab: 'workbench', terms: ['workbench', 'browser', 'terminal', 'panel', 'layout', 'tabs', 'reopen tabs', 'search engine', 'downloads', 'browsing data', 'cookies'] },
  { tab: 'background', terms: ['background', 'tray', 'close window', 'start at login', 'autostart', 'keep running'] },
  { tab: 'runtime', terms: ['engines', 'llama.cpp', 'whisper', 'piper', 'stable diffusion', 'mlx', 'disk space', 'versions'] },
  { tab: 'advanced', terms: ['advanced', 'storage', 'logs', 'server', 'ports', 'paths', 'developer options', 'restart server', 'models folder'] },
  { tab: 'about', terms: ['about', 'version', 'update', 'updates', 'release', 'beta'] },
];

/**
 * Settings pages matching `query`: [{ tab, view, label, term }], best first.
 * `tabs` gives the page labels ({ id, label, description }).
 */
export function searchSettings(query, tabs = []) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const results = [];
  for (const entry of SETTINGS_INDEX) {
    const tab = byId.get(entry.tab);
    if (!tab) continue;
    const label = entry.label ? `${tab.label} · ${entry.label}` : tab.label;
    let score = 0;
    let term = null;
    if (label.toLowerCase().startsWith(q)) { score = 4; term = null; }
    for (const candidate of entry.terms) {
      const s = candidate === q ? 5 : candidate.startsWith(q) ? 3 : candidate.includes(q) ? 2 : 0;
      if (s > score) { score = s; term = candidate; }
    }
    if (!score && String(tab.description || '').toLowerCase().includes(q)) score = 1;
    if (score) results.push({ tab: entry.tab, view: entry.view || null, label, term, score });
  }
  return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).map(({ score, ...rest }) => rest);
}

/** The Settings address a search result opens. */
export function resultRoute(result) {
  if (result.view === 'connectors') return 'connectors';
  if (result.view === 'services') return 'integrations';
  return result.tab;
}
