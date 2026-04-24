// den/src/agent/tools/memoryTools.js
// ─── Agent Memory Tools ─────────────────────────────────────────────────────
// Store and retrieve persistent facts/preferences across sessions.

import { PermissionLevel } from './toolRegistry.js';
import db from '../../db/client.js';
import { randomUUID } from 'crypto';

export const MEMORY_KINDS = ['user', 'feedback', 'project', 'reference', 'fact', 'preference', 'context', 'task_state'];

const memoryColumnNames = [
  'id', 'key', 'content', 'memory_type', 'tags', 'importance',
  'last_accessed_at', 'access_count', 'created_at', 'updated_at',
];
const memoryColumns = memoryColumnNames.join(', ');
const prefixedMemoryColumns = memoryColumnNames.map(name => `m.${name}`).join(', ');

function normalizeKind(kind) {
  return MEMORY_KINDS.includes(kind) ? kind : 'fact';
}

function normalizeImportance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return '[]';
  return JSON.stringify(tags.map(t => String(t).trim()).filter(Boolean).slice(0, 20));
}

function parseTags(tags) {
  try {
    const parsed = JSON.parse(tags || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function slugifyKey(content) {
  return String(content || 'memory')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'memory';
}

export function buildMemoryKey(args = {}) {
  if (args.key) return String(args.key).trim();
  const base = slugifyKey(args.content);
  return `${normalizeKind(args.kind || args.memory_type)}_${base}_${randomUUID().slice(0, 8)}`;
}

export function buildFtsQuery(query) {
  const terms = String(query || '')
    .trim()
    .split(/\s+/)
    .map(t => t.replace(/[^a-zA-Z0-9_:-]/g, ''))
    .filter(Boolean)
    .slice(0, 8);
  return terms.length > 0 ? terms.map(t => `${t}*`).join(' OR ') : '';
}

function recencyScore(row) {
  const iso = row.last_accessed_at || row.updated_at || row.created_at;
  const ms = iso ? Date.now() - new Date(`${iso}Z`).getTime() : Number.POSITIVE_INFINITY;
  const days = Math.max(0, ms / 86400000);
  if (!Number.isFinite(days)) return 0;
  return Math.max(0, 0.2 - Math.min(days, 30) / 150);
}

export function normalizeMemoryRow(row) {
  return {
    id: row.id,
    key: row.key,
    content: row.content,
    kind: row.memory_type,
    memory_type: row.memory_type,
    tags: parseTags(row.tags),
    importance: Number(row.importance ?? 0.5),
    last_accessed_at: row.last_accessed_at,
    access_count: Number(row.access_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    score: row.score === undefined ? undefined : Number(row.score),
  };
}

export function scoreMemoryRows(rows) {
  return rows.map(row => {
    const textMatch = row.rank === undefined ? 0 : Math.max(0, -Number(row.rank || 0));
    const importance = Number(row.importance ?? 0.5) * 0.3;
    return { ...row, score: textMatch + importance + recencyScore(row) };
  }).sort((a, b) => b.score - a.score);
}

export function bumpMemoryAccess(rows) {
  const ids = [...new Set(rows.map(r => r.id).filter(Boolean))];
  if (ids.length === 0) return;
  const bump = db.prepare(
    "UPDATE agent_memory SET access_count = access_count + 1, last_accessed_at = datetime('now') WHERE id = ?"
  );
  const tx = db.transaction(() => {
    for (const id of ids) bump.run(id);
  });
  tx();
}

export function searchMemories({ userId, workspaceId, query, kind = 'all', limit = 10, bumpAccess = false }) {
  const ftsQuery = buildFtsQuery(query);
  const params = [ftsQuery, userId, workspaceId];
  let kindClause = '';
  if (kind && kind !== 'all') {
    kindClause = 'AND m.memory_type = ?';
    params.push(kind);
  }
  params.push(limit);

  let rows = [];
  if (ftsQuery) {
    try {
      rows = db.prepare(`
        SELECT ${prefixedMemoryColumns}, bm25(agent_memory_fts) AS rank
        FROM agent_memory_fts fts
        JOIN agent_memory m ON m.id = fts.memory_id
        WHERE fts.agent_memory_fts MATCH ? AND m.user_id = ? AND m.workspace_id = ? ${kindClause}
        ORDER BY rank
        LIMIT ?
      `).all(...params);
    } catch {
      rows = [];
    }
  }

  if (rows.length === 0) {
    const like = `%${query || ''}%`;
    const fallbackParams = [userId, workspaceId];
    let fallbackKind = '';
    if (kind && kind !== 'all') {
      fallbackKind = 'AND memory_type = ?';
      fallbackParams.push(kind);
    }
    fallbackParams.push(like, like, limit);
    rows = db.prepare(`
      SELECT ${memoryColumns}
      FROM agent_memory
      WHERE user_id = ? AND workspace_id = ? ${fallbackKind}
        AND (key LIKE ? OR content LIKE ?)
      LIMIT ?
    `).all(...fallbackParams);
  }

  let scored = scoreMemoryRows(rows).slice(0, limit);
  if (bumpAccess) {
    bumpMemoryAccess(scored);
    const accessedAt = new Date().toISOString();
    scored = scored.map(row => ({
      ...row,
      access_count: Number(row.access_count || 0) + 1,
      last_accessed_at: row.last_accessed_at || accessedAt,
    }));
  }
  return scored.map(normalizeMemoryRow);
}

export function listMemories({ userId, workspaceId, limit = 50, kind = 'all' }) {
  const params = [userId, workspaceId];
  let kindClause = '';
  if (kind && kind !== 'all') {
    kindClause = 'AND memory_type = ?';
    params.push(kind);
  }
  params.push(limit);
  return db.prepare(`
    SELECT ${memoryColumns}
    FROM agent_memory
    WHERE user_id = ? AND workspace_id = ? ${kindClause}
    ORDER BY importance DESC, COALESCE(last_accessed_at, updated_at) DESC
    LIMIT ?
  `).all(...params).map(normalizeMemoryRow);
}

export const saveMemoryTool = {
  name: 'save_memory',
  description: 'Save durable memory across sessions. Use for stable user facts, corrections, project state, references, preferences, or reusable context.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: MEMORY_KINDS, description: 'Memory kind: user, feedback, project, reference, fact, preference, context, or task_state.' },
      key: { type: 'string', description: 'Optional stable lookup key. If omitted, one is generated from the content.' },
      content: { type: 'string', description: 'The durable content to remember.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional short tags for filtering and review.' },
      importance: { type: 'number', description: '0.0 to 1.0 importance. Default 0.5.' },
    },
    required: ['kind', 'content'],
  },
  execute: async (args, context) => {
    try {
      const kind = normalizeKind(args.kind || args.memory_type);
      const key = buildMemoryKey(args);
      const tags = normalizeTags(args.tags);
      const importance = normalizeImportance(args.importance);

      const existing = db.prepare(
        'SELECT id FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ?'
      ).get(context.userId, context.workspaceId, key);

      if (existing) {
        db.prepare(`
          UPDATE agent_memory
          SET content = ?, memory_type = ?, tags = ?, importance = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(args.content, kind, tags, importance, existing.id);
        return { success: true, action: 'updated', key, kind, importance };
      }

      db.prepare(`
        INSERT INTO agent_memory
          (id, user_id, workspace_id, memory_type, key, content, tags, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), context.userId, context.workspaceId, kind, key, args.content, tags, importance);
      return { success: true, action: 'stored', key, kind, importance };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const recallMemoryTool = {
  name: 'recall_memory',
  description: 'Search durable memories by text, optionally filtered by kind. Results are ranked by text match, importance, and recency.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query to match against memory keys and content.' },
      kind: { type: 'string', enum: [...MEMORY_KINDS, 'all'], description: 'Optional kind filter. Default all.' },
      limit: { type: 'number', description: 'Maximum number of memories to return. Default 10.' },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    try {
      const kind = args.kind || args.memory_type || 'all';
      const limit = Math.max(1, Math.min(25, Number(args.limit || 10)));
      const memories = searchMemories({
        userId: context.userId,
        workspaceId: context.workspaceId,
        query: args.query,
        kind,
        limit,
        bumpAccess: true,
      });
      return { success: true, query: args.query, count: memories.length, memories };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const listMemoryTool = {
  name: 'list_memories',
  description: 'List stored memories for the current workspace, sorted by importance and recent access.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: [...MEMORY_KINDS, 'all'], description: 'Optional kind filter. Default all.' },
      limit: { type: 'number', description: 'Maximum number of memories to return. Default 50.' },
    },
    required: [],
  },
  execute: async (args = {}, context) => {
    try {
      const memories = listMemories({
        userId: context.userId,
        workspaceId: context.workspaceId,
        kind: args.kind || args.memory_type || 'all',
        limit: Math.max(1, Math.min(100, Number(args.limit || 50))),
      });
      return { success: true, count: memories.length, memories };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const forgetMemoryTool = {
  name: 'forget_memory',
  description: 'Delete one stored memory by key.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Exact memory key to delete.' },
    },
    required: ['key'],
  },
  execute: async (args, context) => {
    try {
      const result = db.prepare(
        'DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ?'
      ).run(context.userId, context.workspaceId, args.key);
      return result.changes > 0
        ? { success: true, key: args.key, action: 'deleted' }
        : { success: false, error: `No memory found with key: ${args.key}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const memoryTools = [saveMemoryTool, recallMemoryTool, listMemoryTool, forgetMemoryTool];
export default memoryTools;
