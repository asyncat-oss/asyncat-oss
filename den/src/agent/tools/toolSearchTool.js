// den/src/agent/tools/toolSearchTool.js
// ─── Tool discovery ─────────────────────────────────────────────────────────
// The agent's prompt carries a core set of tools picked for the current task,
// not all ~220: sending every definition on every step cost ~60k tokens with
// native tool calling (the list was sent twice) and ~28k as text, which local
// models could barely fit, and OpenAI-style APIs reject more than 128 tools.
// This tool lets the agent find the rest by keyword. The runtime decides which
// tools may be returned (the same mode/permission scope as before) and makes
// them callable on the next step.

import { PermissionLevel } from './toolRegistry.js';

export const toolSearchTool = {
  name: 'tool_search',
  description: 'Find more tools by keyword. Your tool list is a core set chosen for this task; many more exist (git, browser automation, docker, databases, screenshots, scheduling, notes, image generation, model management, …). Call this with a few words describing what you need, then call the returned tools by name with the parameters shown.',
  category: 'plan',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A few keywords for the capability you need, e.g. "git commit", "take screenshot", "sql query".' },
      limit: { type: 'number', description: 'Maximum number of tools to return (default 8, max 15).' },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    const query = String(args?.query || '').trim();
    if (!query) return { success: false, error: 'query is required' };
    if (typeof context?.discoverTools !== 'function') {
      return { success: false, error: 'Tool search is not available in this context.' };
    }
    const requested = Number.isFinite(args?.limit) ? Math.trunc(args.limit) : 8;
    const limit = Math.min(15, Math.max(1, requested));
    const tools = context.discoverTools(query, limit);
    if (!tools.length) {
      return {
        success: true,
        query,
        count: 0,
        tools: [],
        note: 'No matching tools. Try different or broader words (e.g. "git", "browser", "docker", "pdf", "schedule").',
      };
    }
    return {
      success: true,
      query,
      count: tools.length,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        permission: t.permission,
        parameters: t.parameters,
      })),
      note: 'These tools are now available. Call them by name with the parameters shown.',
    };
  },
};

export const toolSearchTools = [toolSearchTool];
