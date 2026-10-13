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

// Agents work like GPTs and Gems: instructions, a picture, conversation
// starters, knowledge files (knowledge_files with owner_type 'agent'), an
// optional model of their own and the capabilities they may use.
const AGENT_COLUMNS = {
  instructions: "TEXT NOT NULL DEFAULT ''",
  avatar_image: 'TEXT',
  starter_prompts: "TEXT NOT NULL DEFAULT '[]'",
  model_profile_id: 'TEXT',
  capabilities: 'TEXT',
  // Which connectors (MCP servers) it may use, as a JSON list of names; NULL
  // means all of them.
  connectors: 'TEXT',
};
for (const [column, definition] of Object.entries(AGENT_COLUMNS)) {
  if (!columnExists('agent_profiles', column)) {
    db.prepare(`ALTER TABLE agent_profiles ADD COLUMN ${column} ${definition}`).run();
  }
}

// A custom "soul" text was the old way to give an agent instructions.
db.prepare(`
  UPDATE agent_profiles SET instructions = trim(soul_override), updated_at = datetime('now')
  WHERE (instructions IS NULL OR instructions = '') AND soul_override IS NOT NULL AND trim(soul_override) != ''
`).run();

/**
 * What an agent may do, as switches. Each maps to tool categories; an agent
 * with no capabilities list may use everything.
 */
export const AGENT_CAPABILITIES = {
  web: { label: 'Web search and browsing', categories: ['search', 'browser', 'general'] },
  files: { label: 'Files and code', categories: ['file', 'shell', 'git', 'code', 'dev', 'workspace', 'data', 'rag'] },
  documents: { label: 'Documents and images', categories: ['artifact', 'notes', 'visual', 'design', 'audio'] },
  memory: { label: 'Memory', categories: ['memory'] },
  integrations: { label: 'Email and feeds', categories: ['integrations'] },
  computer: { label: 'This computer and Asyncat', categories: ['screen', 'desktop', 'system', 'ai', 'schedule', 'agent'] },
};
// Planning, asking the user and searching the agent's own knowledge are
// always allowed. Connector tools ('mcp') are chosen per connector instead
// (the agent's `connectors` list), so capabilities leave them alone.
const ALWAYS_ALLOWED_CATEGORIES = ['planning', 'plan', 'interaction', 'mcp'];
const ALWAYS_ALLOWED_TOOLS = ['knowledge_search', 'tool_search'];

/**
 * Tool names an agent may use, or null for no limit. `tools` is the full
 * registry list ({ name, category }).
 */
export function toolsForCapabilities(capabilities, tools) {
  if (!Array.isArray(capabilities)) return null;
  const categories = new Set(ALWAYS_ALLOWED_CATEGORIES);
  for (const key of capabilities) {
    for (const category of AGENT_CAPABILITIES[key]?.categories || []) categories.add(category);
  }
  return tools
    .filter((tool) => categories.has(tool.category) || ALWAYS_ALLOWED_TOOLS.includes(tool.name))
    .map((tool) => tool.name);
}

const MAX_STARTERS = 4;
const MAX_AVATAR_CHARS = 400_000;

function cleanStarters(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((s) => String(s || '').trim().slice(0, 200)).filter(Boolean).slice(0, MAX_STARTERS);
}

function cleanCapabilities(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((key) => Object.hasOwn(AGENT_CAPABILITIES, key)))];
}

/** A list of connector names, or null for "all connectors". */
export function cleanConnectorList(value) {
  if (value === null || value === undefined || !Array.isArray(value)) return null;
  return [...new Set(value.map((name) => String(name || '').trim()).filter(Boolean))].slice(0, 100);
}

function cleanAvatar(value) {
  if (!value) return null;
  const text = String(value);
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(text)) return null;
  return text.length <= MAX_AVATAR_CHARS ? text : null;
}

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

function parseJson(value, fallback) {
  try {
    return value === null || value === undefined ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseProfile(row) {
  if (!row) return null;
  return {
    ...row,
    instructions: row.instructions || '',
    auto_approve: Boolean(row.auto_approve),
    is_default: Boolean(row.is_default),
    always_allowed_tools: parseJson(row.always_allowed_tools, []),
    starter_prompts: parseJson(row.starter_prompts, []),
    capabilities: parseJson(row.capabilities, null),
    connectors: parseJson(row.connectors, null),
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

export function createProfile({
  userId, name, handle = null, description = '', icon = '🤖', color = 'indigo', soulName = 'default',
  soulOverride = null, workingDir = null, maxRounds = 25, autoApprove = false, alwaysAllowedTools = [],
  isDefault = false, instructions = '', avatarImage = null, starterPrompts = [], modelProfileId = null,
  capabilities = null, connectors = null,
}) {
  const id = randomUUID();
  const resolvedHandle = uniqueHandle(userId, handle || name, id);
  if (isDefault) {
    db.prepare('UPDATE agent_profiles SET is_default = 0 WHERE user_id = ?').run(userId);
  }
  const cleanCaps = cleanCapabilities(capabilities);
  const cleanConnectors = cleanConnectorList(connectors);
  db.prepare(`
    INSERT INTO agent_profiles (
      id, user_id, handle, name, description, icon, color, soul_name, soul_override, working_dir, max_rounds,
      auto_approve, always_allowed_tools, is_default, instructions, avatar_image, starter_prompts,
      model_profile_id, capabilities, connectors
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, resolvedHandle, name, description, icon, color,
    soulName, soulOverride || null, workingDir || null,
    maxRounds, autoApprove ? 1 : 0,
    JSON.stringify(alwaysAllowedTools),
    isDefault ? 1 : 0,
    String(instructions || '').slice(0, 20000),
    cleanAvatar(avatarImage),
    JSON.stringify(cleanStarters(starterPrompts)),
    modelProfileId || null,
    cleanCaps === null ? null : JSON.stringify(cleanCaps),
    cleanConnectors === null ? null : JSON.stringify(cleanConnectors),
  );
  return getProfile(id, userId);
}

export function updateProfile(id, userId, updates) {
  const allowed = [
    'name', 'handle', 'description', 'icon', 'color', 'soul_name', 'soul_override', 'working_dir', 'max_rounds',
    'auto_approve', 'always_allowed_tools', 'is_default', 'instructions', 'avatar_image', 'starter_prompts',
    'model_profile_id', 'capabilities', 'connectors',
  ];
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
    else if (col === 'starter_prompts') values.push(JSON.stringify(cleanStarters(v)));
    else if (col === 'capabilities') {
      const caps = cleanCapabilities(v);
      values.push(caps === null ? null : JSON.stringify(caps));
    } else if (col === 'connectors') {
      const list = cleanConnectorList(v);
      values.push(list === null ? null : JSON.stringify(list));
    } else if (col === 'avatar_image') values.push(cleanAvatar(v));
    else if (col === 'instructions') values.push(String(v || '').slice(0, 20000));
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

export default { listProfiles, getProfile, getProfileByHandle, createProfile, updateProfile, deleteProfile, getDefaultProfile, toolsForCapabilities, AGENT_CAPABILITIES };
