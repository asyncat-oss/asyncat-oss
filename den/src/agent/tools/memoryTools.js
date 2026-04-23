// den/src/agent/tools/memoryTools.js
// ─── Agent Memory Tools ─────────────────────────────────────────────────────
// Store and retrieve persistent facts/preferences across sessions.

import { PermissionLevel } from './toolRegistry.js';
import db from '../../db/client.js';
import { randomUUID } from 'crypto';

export const storeMemoryTool = {
  name: 'store_memory',
  description: 'Store a fact, preference, or piece of context that should be remembered across conversations. Use for user preferences, project conventions, or important discoveries.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Short key/label for this memory, e.g. "preferred_language", "project_structure"' },
      content: { type: 'string', description: 'The content to remember' },
      memory_type: { type: 'string', enum: ['fact', 'preference', 'context', 'task_state'], description: 'Type of memory (default: fact)' },
    },
    required: ['key', 'content'],
  },
  execute: async (args, context) => {
    try {
      const type = args.memory_type || 'fact';
      // Upsert: update if key exists for this user/workspace
      const existing = db.prepare(
        'SELECT id FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ?'
      ).get(context.userId, context.workspaceId, args.key);

      if (existing) {
        db.prepare(
          'UPDATE agent_memory SET content = ?, memory_type = ?, updated_at = datetime("now") WHERE id = ?'
        ).run(args.content, type, existing.id);
        return { success: true, action: 'updated', key: args.key };
      } else {
        db.prepare(
          'INSERT INTO agent_memory (id, user_id, workspace_id, memory_type, key, content) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(randomUUID(), context.userId, context.workspaceId, type, args.key, args.content);
        return { success: true, action: 'stored', key: args.key };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const recallMemoryTool = {
  name: 'recall_memory',
  description: 'Search for stored memories by key or content. Use to retrieve previously stored facts, preferences, or context.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query to match against memory keys and content' },
      memory_type: { type: 'string', enum: ['fact', 'preference', 'context', 'task_state', 'all'], description: 'Filter by type (default: all)' },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    try {
      const type = args.memory_type || 'all';
      let rows;
      if (type === 'all') {
        rows = db.prepare(
          `SELECT key, content, memory_type, updated_at FROM agent_memory
           WHERE user_id = ? AND workspace_id = ? AND (key LIKE ? OR content LIKE ?)
           ORDER BY updated_at DESC LIMIT 10`
        ).all(context.userId, context.workspaceId, `%${args.query}%`, `%${args.query}%`);
      } else {
        rows = db.prepare(
          `SELECT key, content, memory_type, updated_at FROM agent_memory
           WHERE user_id = ? AND workspace_id = ? AND memory_type = ? AND (key LIKE ? OR content LIKE ?)
           ORDER BY updated_at DESC LIMIT 10`
        ).all(context.userId, context.workspaceId, type, `%${args.query}%`, `%${args.query}%`);
      }
      return {
        success: true,
        query: args.query,
        count: rows.length,
        memories: rows,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const listMemoryTool = {
  name: 'list_memories',
  description: 'List all stored memories for the current workspace.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context) => {
    try {
      const rows = db.prepare(
        'SELECT key, content, memory_type, updated_at FROM agent_memory WHERE user_id = ? AND workspace_id = ? ORDER BY updated_at DESC LIMIT 50'
      ).all(context.userId, context.workspaceId);
      return { success: true, count: rows.length, memories: rows };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const memoryTools = [storeMemoryTool, recallMemoryTool, listMemoryTool];
export default memoryTools;
