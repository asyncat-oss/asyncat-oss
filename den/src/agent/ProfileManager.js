// den/src/agent/ProfileManager.js
// ─── Agent Profiles ───────────────────────────────────────────────────────────
// Named configuration bundles: each profile has a soul, working dir,
// permission behavior, and tool allowlist. Profiles are user-scoped.

import db from '../db/client.js';
import { randomUUID } from 'crypto';

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_profiles (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    handle              TEXT,
    name                TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    icon                TEXT NOT NULL DEFAULT '🤖',
    color               TEXT NOT NULL DEFAULT 'indigo',
    soul_name           TEXT NOT NULL DEFAULT 'default',
    soul_override       TEXT,
    working_dir         TEXT,
    max_rounds          INTEGER NOT NULL DEFAULT 25,
    auto_approve        INTEGER NOT NULL DEFAULT 0,
    always_allowed_tools TEXT NOT NULL DEFAULT '[]',
    is_default          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

if (!columnExists('agent_profiles', 'handle')) {
  db.prepare('ALTER TABLE agent_profiles ADD COLUMN handle TEXT').run();
}

db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_user_handle ON agent_profiles(user_id, handle)').run();

function slugifyHandle(value) {
  const base = String(value || 'agent')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'agent';
}

function uniqueHandle(userId, desired, excludeId = null) {
  const base = slugifyHandle(desired);
  let handle = base;
  let suffix = 2;
  const exists = db.prepare(`
    SELECT id FROM agent_profiles
    WHERE user_id = ? AND handle = ? AND (? IS NULL OR id != ?)
    LIMIT 1
  `);
  while (exists.get(userId, handle, excludeId, excludeId)) {
    handle = `${base}-${suffix++}`;
  }
  return handle;
}

function backfillHandles() {
  const rows = db.prepare('SELECT id, user_id, name, handle FROM agent_profiles ORDER BY created_at ASC').all();
  const update = db.prepare('UPDATE agent_profiles SET handle = ?, updated_at = datetime(\'now\') WHERE id = ?');
  for (const row of rows) {
    if (row.handle) continue;
    update.run(uniqueHandle(row.user_id, row.name, row.id), row.id);
  }
}

backfillHandles();

function parseProfile(row) {
  if (!row) return null;
  return {
    ...row,
    auto_approve: Boolean(row.auto_approve),
    is_default: Boolean(row.is_default),
    always_allowed_tools: JSON.parse(row.always_allowed_tools || '[]'),
  };
}

export function listProfiles(userId) {
  return db.prepare(
    'SELECT * FROM agent_profiles WHERE user_id = ? ORDER BY is_default DESC, created_at ASC'
  ).all(userId).map(parseProfile);
}

export function getProfile(id, userId) {
  return parseProfile(
    db.prepare('SELECT * FROM agent_profiles WHERE id = ? AND user_id = ?').get(id, userId)
  );
}

export function getProfileByHandle(handle, userId) {
  return parseProfile(
    db.prepare('SELECT * FROM agent_profiles WHERE handle = ? AND user_id = ?').get(slugifyHandle(handle), userId)
  );
}

export function createProfile({ userId, name, handle = null, description = '', icon = '🤖', color = 'indigo', soulName = 'default', soulOverride = null, workingDir = null, maxRounds = 25, autoApprove = false, alwaysAllowedTools = [], isDefault = false }) {
  const id = randomUUID();
  const resolvedHandle = uniqueHandle(userId, handle || name, id);
  if (isDefault) {
    db.prepare('UPDATE agent_profiles SET is_default = 0 WHERE user_id = ?').run(userId);
  }
  db.prepare(`
    INSERT INTO agent_profiles (id, user_id, handle, name, description, icon, color, soul_name, soul_override, working_dir, max_rounds, auto_approve, always_allowed_tools, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, resolvedHandle, name, description, icon, color,
    soulName, soulOverride || null, workingDir || null,
    maxRounds, autoApprove ? 1 : 0,
    JSON.stringify(alwaysAllowedTools),
    isDefault ? 1 : 0
  );
  return getProfile(id, userId);
}

export function updateProfile(id, userId, updates) {
  const allowed = ['name', 'handle', 'description', 'icon', 'color', 'soul_name', 'soul_override', 'working_dir', 'max_rounds', 'auto_approve', 'always_allowed_tools', 'is_default'];
  const fields = [];
  const values = [];

  if (updates.isDefault) {
    db.prepare('UPDATE agent_profiles SET is_default = 0 WHERE user_id = ?').run(userId);
  }

  for (const [k, v] of Object.entries(updates)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (!allowed.includes(col)) continue;
    fields.push(`${col} = ?`);
    if (col === 'handle') values.push(uniqueHandle(userId, v, id));
    else if (col === 'always_allowed_tools') values.push(JSON.stringify(Array.isArray(v) ? v : []));
    else if (col === 'auto_approve' || col === 'is_default') values.push(v ? 1 : 0);
    else values.push(v ?? null);
  }
  if (!fields.length) return getProfile(id, userId);

  fields.push("updated_at = datetime('now')");
  values.push(id, userId);
  db.prepare(`UPDATE agent_profiles SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
  return getProfile(id, userId);
}

export function deleteProfile(id, userId) {
  db.prepare('DELETE FROM agent_profiles WHERE id = ? AND user_id = ?').run(id, userId);
}

export function getDefaultProfile(userId) {
  return parseProfile(
    db.prepare('SELECT * FROM agent_profiles WHERE user_id = ? AND is_default = 1 LIMIT 1').get(userId)
  );
}

export default { listProfiles, getProfile, getProfileByHandle, createProfile, updateProfile, deleteProfile, getDefaultProfile };
