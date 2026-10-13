// den/src/agent/scheduledRunContext.js
// Marks code running on behalf of a scheduled task, including any helper
// agents it starts, so tools can tell an unattended run from a chat.

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** Run `fn` as part of a scheduled task run ({ taskId, runId }). */
export function runInScheduledContext(info, fn) {
  return storage.run({ ...info }, fn);
}

/** The scheduled run this code belongs to, or null in a normal chat. */
export function currentScheduledRun() {
  return storage.getStore() || null;
}
