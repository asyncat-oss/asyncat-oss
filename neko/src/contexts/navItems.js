// Which destinations the sidebar shows (Settings → Appearance → Navigation).

export const DEFAULT_NAV_ITEMS = Object.freeze({
  projects: true,
  tasks: true,
  automations: true,
  models: true,
  tools: true,
  agent: true,
  trash: true,
});

// Workflows, Schedules and Activity used to be separate sidebar entries and
// are now one, Automations. Keep it hidden for people who had hidden all three.
const LEGACY_AUTOMATION_KEYS = ['workflows', 'schedules', 'activity'];

/** Saved visibility settings merged over the defaults; unknown keys are dropped. */
export function migrateNavItems(stored) {
  const saved = stored && typeof stored === 'object' ? stored : {};
  const next = { ...DEFAULT_NAV_ITEMS };
  for (const key of Object.keys(DEFAULT_NAV_ITEMS)) {
    if (typeof saved[key] === 'boolean') next[key] = saved[key];
  }
  if (typeof saved.automations !== 'boolean'
    && LEGACY_AUTOMATION_KEYS.every((key) => saved[key] === false)) {
    next.automations = false;
  }
  return next;
}
