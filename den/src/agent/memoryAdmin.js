// den/src/agent/memoryAdmin.js
// The Memory page (Tools & Skills → Memory): which project, agent or Cat a
// memory belongs to, the memories of one of them, and editing or adding a
// memory by hand.

import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { MEMORY_KINDS, buildMemoryKey, enforceMemoryCap } from './tools/memoryTools.js';

/**
 * "project:<id>", "agent:<id>", "cat:<id>", "shared" (nobody's own) or
 * "all", as SQL on agent_memory.
 */
export function ownerFilter(scope) {
  const [kind, id] = String(scope || 'all').split(':');
  if (kind === 'project' && id) return { sql: 'AND project_id = ?', params: [id] };
  if (kind === 'agent' && id) return { sql: 'AND profile_id = ?', params: [id] };
  if (kind === 'cat' && id) return { sql: 'AND cat_id = ?', params: [id] };
  if (kind === 'shared') return { sql: 'AND project_id IS NULL AND profile_id IS NULL AND cat_id IS NULL', params: [] };
  return { sql: '', params: [] };
}

/** Does a memory row belong to `scope`? (for search results) */
export function ownedBy(row, scope) {
  const [kind, id] = String(scope || 'all').split(':');
  if (kind === 'project' && id) return row.project_id === id;
  if (kind === 'agent' && id) return row.profile_id === id;
  if (kind === 'cat' && id) return row.cat_id === id;
  if (kind === 'shared') return !row.project_id && !row.profile_id && !row.cat_id;
  return true;
}

function namesFor(table, ids) {
  if (!ids.length) return new Map();
  return new Map(db.prepare(`SELECT id, name FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((row) => [row.id, row.name]));
}

/** Add project_name, agent_name and cat_name to memory rows. */
export function nameOwners(rows) {
  const unique = (field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))];
  const projects = namesFor('projects', unique('project_id'));
  const agents = namesFor('agent_profiles', unique('profile_id'));
  const cats = namesFor('cats', unique('cat_id'));
  return rows.map((row) => ({
    ...row,
    project_name: row.project_id ? projects.get(row.project_id) || null : null,
    agent_name: row.profile_id ? agents.get(row.profile_id) || null : null,
    cat_name: row.cat_id ? cats.get(row.cat_id) || null : null,
  }));
}

function ownerColumns(scope) {
  const [kind, id] = String(scope || '').split(':');
  return {
    project_id: kind === 'project' && id ? id : null,
    profile_id: kind === 'agent' && id ? id : null,
    cat_id: kind === 'cat' && id ? id : null,
  };
}

function cleanContent(content) {
  const text = String(content ?? '').trim();
  if (!text) throw Object.assign(new Error('A memory needs some text.'), { status: 400 });
  return text.slice(0, 4000);
}

/**
 * Change a memory's text, kind or importance. The stored embedding is
 * cleared, since it no longer matches the text; keyword search still finds it.
 */
export function updateMemory({ userId, id, content, kind, importance }) {
  const row = db.prepare('SELECT id, content, memory_type, importance FROM agent_memory WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw Object.assign(new Error('That memory was not found.'), { status: 404 });
  const nextContent = content === undefined ? row.content : cleanContent(content);
  const nextKind = kind === undefined ? row.memory_type : (MEMORY_KINDS.includes(kind) ? kind : row.memory_type);
  const nextImportance = importance === undefined ? row.importance : Math.max(0, Math.min(1, Number(importance) || 0));
  db.prepare(`
    UPDATE agent_memory
    SET content = ?, memory_type = ?, importance = ?, updated_at = datetime('now'),
        embedding = CASE WHEN ? THEN NULL ELSE embedding END,
        embedding_model = CASE WHEN ? THEN NULL ELSE embedding_model END,
        embedding_dim = CASE WHEN ? THEN NULL ELSE embedding_dim END
    WHERE id = ?
  `).run(nextContent, nextKind, nextImportance, ...Array(3).fill(nextContent !== row.content ? 1 : 0), id);
  return db.prepare('SELECT * FROM agent_memory WHERE id = ?').get(id);
}

/** A memory you write yourself, for everyone or one project, agent or Cat. */
export function addMemory({ userId, workspaceId, content, kind = 'fact', scope = 'shared', importance = 0.6 }) {
  const text = cleanContent(content);
  const memoryKind = MEMORY_KINDS.includes(kind) ? kind : 'fact';
  const owner = ownerColumns(scope);
  const id = randomUUID();
  db.prepare(`
    INSERT INTO agent_memory
      (id, user_id, workspace_id, memory_type, key, content, tags, importance, profile_id, project_id, cat_id, source)
    VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, 'user')
  `).run(id, userId, workspaceId, memoryKind, buildMemoryKey({ kind: memoryKind, content: text }), text,
    Math.max(0, Math.min(1, Number(importance) || 0.6)), owner.profile_id, owner.project_id, owner.cat_id);
  setImmediate(() => enforceMemoryCap(userId, workspaceId));
  return db.prepare('SELECT * FROM agent_memory WHERE id = ?').get(id);
}
