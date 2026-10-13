// den/src/agent/scheduledRunContext.js
// Marks code running on behalf of a Cat (an agent working on its own),
// including any helper agents it starts, so tools can tell an unattended run
// from a chat: scheduling tools refuse to run, memories stay the Cat's own,
// web tools keep to its sites and the browser uses its profile.

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/**
 * Run `fn` as part of an unattended run: { catId, runId, trigger,
 * allowedSites, browserPartition, ... }.
 */
export function runInScheduledContext(info, fn) {
  return storage.run({ ...info }, fn);
}

/** The unattended run this code belongs to, or null in a normal chat. */
export function currentScheduledRun() {
  return storage.getStore() || null;
}

/** The Cat this code runs for, or null. */
export function currentCatRun() {
  const store = storage.getStore();
  return store?.catId ? store : null;
}
