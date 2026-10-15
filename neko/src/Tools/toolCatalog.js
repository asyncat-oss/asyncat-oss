// The Tools tab's catalog: group names, which systems a tool runs on (and
// what it needs there), the search and system filter, and the groups the
// list shows.

export const ALL_OS = ['mac', 'linux', 'win'];
export const OS_LABELS = { mac: 'macOS', linux: 'Linux', win: 'Windows' };

// Tools with platform notes. A tool not listed runs everywhere and needs
// nothing extra.
const TOOL_OS_INFO = {
  // macOS and Linux only: there is no Windows version.
  screen_key:         { platforms: ['mac', 'linux'], deps: { mac: 'osascript (built-in)', linux: 'xdotool (apt install xdotool)' } },
  // Everywhere, but some systems need a program installed.
  take_screenshot:    { platforms: ALL_OS, deps: { mac: 'screencapture (built-in)', linux: 'scrot or gnome-screenshot', win: 'PowerShell (built-in)' } },
  screen_read:        { platforms: ALL_OS, deps: { mac: 'Tesseract (brew install tesseract)', linux: 'Tesseract (apt install tesseract-ocr)', win: 'Tesseract (installer)' } },
  screen_click:       { platforms: ALL_OS, deps: { mac: 'cliclick (brew install cliclick)', linux: 'xdotool (apt install xdotool)', win: 'PowerShell (built-in)' } },
  screen_type:        { platforms: ALL_OS, deps: { mac: 'cliclick (brew install cliclick)', linux: 'xdotool (apt install xdotool)', win: 'PowerShell (built-in)' } },
  window_list:        { platforms: ALL_OS, deps: { mac: 'osascript (built-in)', linux: 'xdotool (apt install xdotool)', win: 'PowerShell (built-in)' } },
  window_focus:       { platforms: ALL_OS, deps: { mac: 'osascript (built-in)', linux: 'xdotool (apt install xdotool)', win: 'PowerShell (built-in)' } },
  active_app:         { platforms: ALL_OS, deps: { mac: 'osascript (built-in)', linux: 'xdotool (apt install xdotool)', win: 'PowerShell (built-in)' } },
  notify:             { platforms: ALL_OS, deps: { mac: 'osascript — grant Notifications in System Settings', linux: 'notify-send (apt install libnotify-bin)', win: 'PowerShell (built-in)' } },
  app_open:           { platforms: ALL_OS, deps: { mac: 'open (built-in)', linux: 'xdg-open (built-in)', win: 'Start-Process (built-in)' } },
  app_list:           { platforms: ALL_OS, deps: { mac: '/Applications (built-in)', linux: '.desktop files (built-in)', win: 'Get-StartApps (built-in)' } },
};

/** { platforms, deps, restricted }: deps is null when the tool needs nothing extra anywhere. */
export function toolPlatforms(name) {
  const info = TOOL_OS_INFO[name];
  const platforms = info?.platforms || ALL_OS;
  return { platforms, deps: info?.deps || null, restricted: platforms.length < ALL_OS.length };
}

// den's group keys, as the list names them. Two keys can share a name
// ("plan" and "planning"), and then they share a group.
const GROUP_NAMES = {
  ai: 'AI and models',
  agent: 'Agents',
  artifact: 'Documents and pages',
  file: 'Files',
  interaction: 'Asking you',
  plan: 'Planning',
  planning: 'Planning',
  rag: 'Document search',
  visual: 'Images',
};

/** "git" → "Git", "rag" → "Document search"; no group → "General". */
export function toolGroupLabel(category) {
  const key = String(category || '').trim().toLowerCase() || 'general';
  if (GROUP_NAMES[key]) return GROUP_NAMES[key];
  const text = key.replace(/[_-]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Tools that run on `os` ('all' for any) and have the query in their name, description or group. */
export function filterTools(tools = [], { query = '', os = 'all' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return tools.filter((tool) => {
    if (os !== 'all' && !toolPlatforms(tool.name).platforms.includes(os)) return false;
    if (!q) return true;
    return [tool.name, tool.description, tool.category, toolGroupLabel(tool.category)]
      .some((text) => String(text || '').toLowerCase().includes(q));
  });
}

/** [{ label, tools }] in the order the groups first appear, each group's tools by name. */
export function groupTools(tools = []) {
  const groups = new Map();
  for (const tool of tools) {
    const label = toolGroupLabel(tool.category);
    if (!groups.has(label)) groups.set(label, { label, tools: [] });
    groups.get(label).tools.push(tool);
  }
  for (const group of groups.values()) group.tools.sort((a, b) => a.name.localeCompare(b.name));
  return [...groups.values()];
}

/** How many tools have each permission: { safe, moderate, dangerous }. */
export function permissionCounts(tools = []) {
  const counts = { safe: 0, moderate: 0, dangerous: 0 };
  for (const tool of tools) if (tool.permission in counts) counts[tool.permission] += 1;
  return counts;
}
