// Automations groups three pages that keep their own URLs: Workflows,
// Schedules and Activity. The sidebar shows one entry for all three and
// reopens whichever page was used last.

export const AUTOMATION_PAGES = [
  { path: '/workflows', label: 'Workflows' },
  { path: '/schedules', label: 'Schedules' },
  { path: '/activity', label: 'Activity' },
];

const STORAGE_KEY = 'automationsPage';
const DEFAULT_PATH = AUTOMATION_PAGES[0].path;

// Older URLs that still open one of these pages.
const ALIASES = ['/automations', '/scheduler', '/agent/scheduler'];

export function isAutomationPath(pathname = '') {
  return [...AUTOMATION_PAGES.map((page) => page.path), ...ALIASES]
    .some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function lastAutomationPath() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return AUTOMATION_PAGES.some((page) => page.path === stored) ? stored : DEFAULT_PATH;
  } catch {
    return DEFAULT_PATH;
  }
}

export function rememberAutomationPath(pathname) {
  const page = AUTOMATION_PAGES.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  if (!page) return;
  try {
    localStorage.setItem(STORAGE_KEY, page.path);
  } catch {
    // Storage can be unavailable (private window); the default page is fine.
  }
}
