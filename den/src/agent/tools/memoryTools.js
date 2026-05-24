// den/src/agent/tools/memoryTools.js
// ─── Agent Memory Tools ─────────────────────────────────────────────────────
// Store and retrieve persistent facts/preferences across sessions.

import { PermissionLevel } from './toolRegistry.js';
import db from '../../db/client.js';
import { randomUUID } from 'crypto';
import { memoryConsolidator } from '../MemoryConsolidator.js';

export const MEMORY_KINDS = ['user', 'feedback', 'project', 'reference', 'fact', 'preference', 'context', 'task_state'];

// ── Memory cap & eviction ─────────────────────────────────────────────────────
const MAX_MEMORIES_PER_WORKSPACE = 750;
const EVICT_PROTECT_IMPORTANCE = 0.8; // never auto-evict high-importance memories
const EVICT_PROTECT_ACCESS = 5;       // never auto-evict well-used memories
// Types always protected from eviction regardless of score
const EVICT_PROTECTED_TYPES = new Set(['user', 'feedback']);

// ── TTL by memory type ────────────────────────────────────────────────────────
const MEMORY_TTL_DAYS = {
  task_state: 7,
  context: 30,
};

function computeExpiresAt(kind) {
  const days = MEMORY_TTL_DAYS[kind];
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Enforce per-workspace memory cap via scored eviction.
 * Protected: importance >= 0.8 OR access_count >= 5 OR type in (user, feedback).
 * Returns the number of rows deleted.
 */
export function enforceMemoryCap(userId, workspaceId) {
  try {
    const count = db.prepare(
      'SELECT COUNT(*) AS cnt FROM agent_memory WHERE user_id = ? AND workspace_id = ?'
    ).get(userId, workspaceId)?.cnt || 0;

    if (count <= MAX_MEMORIES_PER_WORKSPACE) return 0;

    const excess = count - MAX_MEMORIES_PER_WORKSPACE;
    // Select eviction candidates — lowest composite score, excluding protected rows
    const victims = db.prepare(`
      SELECT id,
        (importance * 0.5
          + MIN(CAST(access_count AS REAL) / 10.0, 1.0) * 0.3
          + CASE WHEN last_accessed_at IS NOT NULL
                 THEN MAX(0.0, 0.2 - MIN(CAST((julianday('now') - julianday(last_accessed_at)) AS REAL), 30.0) / 150.0)
                 ELSE 0.0 END
        ) AS eviction_score
      FROM agent_memory
      WHERE user_id = ? AND workspace_id = ?
        AND importance < ? AND access_count < ?
        AND memory_type NOT IN ('user', 'feedback')
      ORDER BY eviction_score ASC
      LIMIT ?
    `).all(userId, workspaceId, EVICT_PROTECT_IMPORTANCE, EVICT_PROTECT_ACCESS, excess + 20);

    if (!victims.length) return 0;
    const toDelete = victims.slice(0, excess);
    const ids = toDelete.map(v => v.id);
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM agent_memory WHERE id IN (${placeholders})`).run(...ids);
    if (result.changes > 0) {
      console.log(`[memory] Evicted ${result.changes} low-score memories for ${userId} (cap: ${MAX_MEMORIES_PER_WORKSPACE})`);
    }
    return result.changes;
  } catch { return 0; }
}

const memoryColumnNames = [
  'id', 'key', 'content', 'memory_type', 'tags', 'importance',
  'last_accessed_at', 'access_count', 'created_at', 'updated_at', 'source',
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

const KEY_STOP_WORDS = new Set([
  'a','an','the','to','of','and','or','in','on','at','is','it','that','this',
  'i','you','me','we','they','my','your','our','their','be','do','have','was',
  'are','has','had','not','but','by','for','with','as','from','user','agent',
]);

function slugifyKey(content) {
  return String(content || 'memory')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !KEY_STOP_WORDS.has(w))
    .slice(0, 6)
    .join('_')
    .slice(0, 52) || 'memory';
}

export function buildMemoryKey(args = {}) {
  if (args.key) return String(args.key).trim().slice(0, 80);
  const base = slugifyKey(args.content);
  return `${normalizeKind(args.kind || args.memory_type)}_${base}`;
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
    source: row.source || 'agent',
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

// ── Vector similarity helpers ─────────────────────────────────────────────────

/**
 * Cosine similarity between two float arrays. Returns 0 for null/mismatched inputs.
 */
function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag < 1e-8 ? 0 : dot / mag;
}

/**
 * In-process vector search over all memories that have embeddings.
 * Safe for up to ~50,000 memories (O(n) cosine pass, well under 10ms at that scale).
 */
function _vectorSearch({ userId, workspaceId, profileId, queryVec, kind, limit = 10 }) {
  const params = [userId, workspaceId];
  let profileClause = '';
  if (profileId) {
    profileClause = 'AND (profile_id = ? OR profile_id IS NULL)';
    params.push(profileId);
  }
  let kindClause = '';
  if (kind && kind !== 'all') {
    kindClause = 'AND memory_type = ?';
    params.push(kind);
  }

  // Load all embedded memories — embedding column excluded from standard memoryColumns
  const rows = db.prepare(`
    SELECT ${memoryColumns}, embedding
    FROM agent_memory
    WHERE user_id = ? AND workspace_id = ? ${profileClause} ${kindClause} AND embedding IS NOT NULL
    LIMIT 2000
  `).all(...params);

  if (!rows.length) return [];

  return rows
    .map(row => {
      try {
        const vec = JSON.parse(row.embedding);
        const sim = cosineSim(queryVec, vec);
        return { ...row, score: sim + Number(row.importance ?? 0.5) * 0.15 };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(normalizeMemoryRow);
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

export function searchMemories({ userId, workspaceId, profileId, query, kind = 'all', limit = 10, bumpAccess = false }) {
  const ftsQuery = buildFtsQuery(query);
  const profileClause = profileId ? 'AND (m.profile_id = ? OR m.profile_id IS NULL)' : '';
  const ftsParams = ftsQuery ? [ftsQuery, userId, workspaceId] : [];
  if (ftsQuery && profileId) ftsParams.push(profileId);
  let kindClause = '';
  if (kind && kind !== 'all') {
    kindClause = 'AND m.memory_type = ?';
    if (ftsQuery) ftsParams.push(kind);
  }
  if (ftsQuery) ftsParams.push(limit);

  let rows = [];
  if (ftsQuery) {
    try {
      rows = db.prepare(`
        SELECT ${prefixedMemoryColumns}, bm25(agent_memory_fts) AS rank
        FROM agent_memory_fts fts
        JOIN agent_memory m ON m.id = fts.memory_id
        WHERE fts.agent_memory_fts MATCH ? AND m.user_id = ? AND m.workspace_id = ? ${profileClause} ${kindClause}
        ORDER BY rank
        LIMIT ?
      `).all(...ftsParams);
    } catch {
      rows = [];
    }
  }

  if (rows.length === 0) {
    const like = `%${query || ''}%`;
    const fallbackParams = [userId, workspaceId];
    const fallbackProfileClause = profileId ? 'AND (profile_id = ? OR profile_id IS NULL)' : '';
    if (profileId) fallbackParams.push(profileId);
    let fallbackKind = '';
    if (kind && kind !== 'all') {
      fallbackKind = 'AND memory_type = ?';
      fallbackParams.push(kind);
    }
    fallbackParams.push(like, like, limit);
    rows = db.prepare(`
      SELECT ${memoryColumns}
      FROM agent_memory
      WHERE user_id = ? AND workspace_id = ? ${fallbackProfileClause} ${fallbackKind}
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

export function listMemories({ userId, workspaceId, profileId, limit = 50, kind = 'all' }) {
  const params = [userId, workspaceId];
  let profileClause = '';
  if (profileId) {
    profileClause = 'AND (profile_id = ? OR profile_id IS NULL)';
    params.push(profileId);
  }
  let kindClause = '';
  if (kind && kind !== 'all') {
    kindClause = 'AND memory_type = ?';
    params.push(kind);
  }
  params.push(limit);
  return db.prepare(`
    SELECT ${memoryColumns}
    FROM agent_memory
    WHERE user_id = ? AND workspace_id = ? ${profileClause} ${kindClause}
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

      const profileId = context.profileId || null;

      const existing = db.prepare(
        'SELECT id FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ? AND (profile_id = ? OR (profile_id IS NULL AND ? IS NULL))'
      ).get(context.userId, context.workspaceId, key, profileId, profileId);

      let memoryId;
      let action;

      if (existing) {
        db.prepare(`
          UPDATE agent_memory
          SET content = ?, memory_type = ?, tags = ?, importance = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(args.content, kind, tags, importance, existing.id);
        memoryId = existing.id;
        action = 'updated';
      } else {
        memoryId = randomUUID();
        const expiresAt = computeExpiresAt(kind);
        db.prepare(`
          INSERT INTO agent_memory
            (id, user_id, workspace_id, memory_type, key, content, tags, importance, profile_id, expires_at, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent')
        `).run(memoryId, context.userId, context.workspaceId, kind, key, args.content, tags, importance, profileId, expiresAt);
        action = 'stored';
        // Enforce cap asynchronously so the tool call doesn't block
        setImmediate(() => enforceMemoryCap(context.userId, context.workspaceId));
      }

      // Fire-and-forget embedding computation — stored asynchronously, won't block the agent
      if (typeof context.computeEmbedding === 'function') {
        context.computeEmbedding(args.content).then(vec => {
          if (vec) {
            try {
              db.prepare('UPDATE agent_memory SET embedding = ? WHERE id = ?')
                .run(JSON.stringify(vec), memoryId);
            } catch { /* non-critical */ }
          }
        }).catch(() => {});
      }

      if (typeof context.emitEvent === 'function') {
        context.emitEvent({ type: 'memory_saved', data: { action, key, kind, importance } });
      }

      return { success: true, action, key, kind, importance };
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

      const profileId = context.profileId || null;

      // Primary: BM25 full-text search (fast, keyword-accurate)
      const bm25Results = searchMemories({
        userId: context.userId,
        workspaceId: context.workspaceId,
        profileId,
        query: args.query,
        kind,
        limit,
        bumpAccess: true,
      });

      // Vector augmentation: kicks in when keyword search finds < 3 results.
      // Catches semantic matches that BM25 misses (e.g. "API key" vs "credentials").
      if (bm25Results.length < 3 && typeof context.computeEmbedding === 'function') {
        try {
          const queryVec = await context.computeEmbedding(args.query);
          if (queryVec) {
            const vectorResults = _vectorSearch({
              userId: context.userId,
              workspaceId: context.workspaceId,
              profileId,
              queryVec,
              kind,
              limit,
            });
            // Merge: BM25 results first (higher confidence), then vector extras
            const seen = new Set(bm25Results.map(r => r.id));
            const extras = vectorResults.filter(r => !seen.has(r.id));
            const memories = [...bm25Results, ...extras].slice(0, limit);
            return { success: true, query: args.query, count: memories.length, memories, method: 'hybrid' };
          }
        } catch { /* fallback to BM25 results below */ }
      }

      return { success: true, query: args.query, count: bm25Results.length, memories: bm25Results, method: 'bm25' };
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
        profileId: context.profileId || null,
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
      const profileId = context.profileId || null;
      const result = db.prepare(
        'DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND key = ? AND (profile_id = ? OR (profile_id IS NULL AND ? IS NULL))'
      ).run(context.userId, context.workspaceId, args.key, profileId, profileId);
      return result.changes > 0
        ? { success: true, key: args.key, action: 'deleted' }
        : { success: false, error: `No memory found with key: ${args.key}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

/**
 * Decay importance for zero-access memories older than 14 days.
 * Protected: user + feedback types. Floor: 0.1. Rate: −10% per call.
 */
export function decayMemoryImportance(userId, workspaceId) {
  try {
    const result = db.prepare(`
      UPDATE agent_memory
      SET importance = MAX(0.1, ROUND(importance * 0.9, 4))
      WHERE user_id = ? AND workspace_id = ?
        AND access_count = 0
        AND julianday('now') - julianday(COALESCE(last_accessed_at, created_at)) > 14
        AND importance > 0.1
        AND memory_type NOT IN ('user', 'feedback')
    `).run(userId, workspaceId);
    if (result.changes > 0) {
      console.log(`[memory] Decayed importance for ${result.changes} zero-access memories`);
    }
    return result.changes;
  } catch { return 0; }
}

export const optimizeMemoryTool = {
  name: 'optimize_memory',
  description: 'Run a memory maintenance pass: evict over-limit/expired entries, then consolidate low-value clusters into compact summaries. Call when the agent feels bloated or when memory quality seems degraded.',
  category: 'memory',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context) => {
    try {
      // Delete expired transient memories
      const expired = db.prepare(
        "DELETE FROM agent_memory WHERE user_id = ? AND workspace_id = ? AND expires_at IS NOT NULL AND expires_at < datetime('now')"
      ).run(context.userId, context.workspaceId);

      // Decay importance for stale zero-access memories
      const decayed = decayMemoryImportance(context.userId, context.workspaceId);

      // Enforce hard cap
      const evicted = enforceMemoryCap(context.userId, context.workspaceId);

      // Consolidate low-importance clusters
      const consolidation = await memoryConsolidator.consolidate({
        userId: context.userId,
        workspaceId: context.workspaceId,
        aiClient: context.aiClient,
        model: context.model,
      });

      return {
        success: true,
        expired: expired.changes,
        decayed,
        evicted,
        merged: consolidation?.merged ?? 0,
        deleted: consolidation?.deleted ?? 0,
        skipped: consolidation?.skipped ?? false,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const memoryTools = [saveMemoryTool, recallMemoryTool, listMemoryTool, forgetMemoryTool, optimizeMemoryTool];
export default memoryTools;
