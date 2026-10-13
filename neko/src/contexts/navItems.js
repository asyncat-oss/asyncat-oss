// Which destinations the sidebar shows (Settings → Appearance → Navigation).

export const DEFAULT_NAV_ITEMS = Object.freeze({
  projects: true,
  scheduled: true,
  models: true,
  tools: true,
  agent: true,
  trash: true,
});

// Workflows, Schedules and Activity were once separate sidebar entries, then
// one entry, Automations; now they are the Scheduled page. Whoever hid
// Automations, or all three old entries, keeps Scheduled hidden.
const LEGACY_AUTOMATION_KEYS = ['workflows', 'schedules', 'activity'];

/** Saved visibility settings merged over the defaults; unknown keys are dropped. */
export function migrateNavItems(stored) {
  const saved = stored && typeof stored === 'object' ? stored : {};
  const next = { ...DEFAULT_NAV_ITEMS };
  for (const key of Object.keys(DEFAULT_NAV_ITEMS)) {
    if (typeof saved[key] === 'boolean') next[key] = saved[key];
  }
  if (typeof saved.scheduled !== 'boolean') {
    if (typeof saved.automations === 'boolean') next.scheduled = saved.automations;
    else if (LEGACY_AUTOMATION_KEYS.every((key) => saved[key] === false)) next.scheduled = false;
  }
  return next;
}
