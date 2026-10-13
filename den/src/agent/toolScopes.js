// den/src/agent/toolScopes.js
// Which tools a run may use when it has no Project folder, and which tools a
// scheduled task's unattended run may use.

import { toolRegistry } from './tools/toolRegistry.js';

// Tools that never touch local files, code or the shell. Chats without a
// Project get only these.
export const NO_PROJECT_TOOL_CATEGORIES = new Set([
  'interaction',
  'planning',
  'search',
  'browser',
  'integrations',
  'memory',
  'notes',
  'schedule',
]);

export function noProjectToolNames() {
  const names = toolRegistry
    .all()
    .filter(tool => NO_PROJECT_TOOL_CATEGORIES.has(tool.category))
    .map(tool => tool.name);
  // AgentRuntime treats an empty list as "no restriction", so retain a hard
  // minimal allow-list even during an unusual partial-initialization state.
  return names.length ? names : ['todo_write', 'list_plan', 'ask_user'];
}

/**
 * Tools for a scheduled task's run: everything a chat in the same place could
 * use, minus the scheduling tools, so a task can't create, change or start
 * other tasks.
 */
export function scheduledRunToolNames({ hasProject = false } = {}) {
  const base = hasProject ? toolRegistry.all().map(tool => tool.name) : noProjectToolNames();
  const allowed = base.filter(name => toolRegistry.get(name)?.category !== 'schedule');
  return allowed.length ? allowed : ['todo_write', 'list_plan'];
}
