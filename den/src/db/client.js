// den/src/db/client.js
// SQLite database client for Asyncat OSS.
// Opens (or creates) the database, applies schema.sql on every boot
// (all statements are CREATE TABLE IF NOT EXISTS — safe to re-run),
// and exports the better-sqlite3 db instance.
//
// Usage:
//   import db from '../db/client.js';
//   const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default: data/asyncat.db next to the project root.
// Override with DB_PATH in .env.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve('data', 'asyncat.db');

// Ensure parent directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// ─── Pragmas ──────────────────────────────────────────────────────────────────
db.pragma('journal_mode = WAL');   // concurrent reads while writing
db.pragma('foreign_keys = ON');    // enforce FK constraints
db.pragma('synchronous = NORMAL'); // safe + fast (WAL mode)
db.pragma('cache_size = -64000');  // 64 MB page cache
db.pragma('temp_store = MEMORY');

// ─── Apply schema ─────────────────────────────────────────────────────────────
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

function tableColumns(tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(col => col.name));
}

function ensureCalendarSchema() {
  const eventsTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Events'").get();
  if (!eventsTable) return;

  const columns = tableColumns('Events');

  if (columns.has('projectId') || columns.has('attendees')) {
    db.exec(`
      DROP INDEX IF EXISTS idx_events_projectId;
      DROP TABLE IF EXISTS event_attendees;

      CREATE TABLE IF NOT EXISTS Events_next (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        description TEXT,
        startTime   TEXT NOT NULL,
        endTime     TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT 'purple',
        location    TEXT,
        isAllDay    INTEGER NOT NULL DEFAULT 0,
        recurrence  TEXT,
        reminders   TEXT NOT NULL DEFAULT '[]',
        status      TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed','tentative','cancelled')),
        timezone    TEXT NOT NULL DEFAULT 'UTC',
        createdBy   TEXT NOT NULL REFERENCES users(id),
        createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT OR REPLACE INTO Events_next (
        id, title, description, startTime, endTime, color, location, isAllDay,
        recurrence, reminders, status, timezone, createdBy, createdAt, updatedAt
      )
      SELECT
        id, title, description, startTime, endTime, color, location, isAllDay,
        recurrence, COALESCE(reminders, '[]'),
        COALESCE(status, 'confirmed'), COALESCE(timezone, 'UTC'), createdBy, createdAt, updatedAt
      FROM Events;

      DROP TABLE Events;
      ALTER TABLE Events_next RENAME TO Events;
      CREATE INDEX IF NOT EXISTS idx_events_createdBy ON Events(createdBy);
    `);
  } else {
    db.exec(`
      DROP INDEX IF EXISTS idx_events_projectId;
      DROP TABLE IF EXISTS event_attendees;
      CREATE INDEX IF NOT EXISTS idx_events_createdBy ON Events(createdBy);
    `);
  }
}

function ensureNotesSchema() {
  const notesTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notes'").get();
  if (!notesTable) return;

  const createSql = notesTable.sql || '';
  const isProjectLinked =
    createSql.includes('projectid   TEXT NOT NULL') ||
    createSql.includes('projectid TEXT NOT NULL') ||
    createSql.includes('REFERENCES projects');

  if (isProjectLinked) {
    db.exec(`
      DROP INDEX IF EXISTS idx_notes_projectid;

      CREATE TABLE IF NOT EXISTS notes_next (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL DEFAULT 'Untitled Note',
        content     TEXT,
        projectid   TEXT,
        createdby   TEXT REFERENCES users(id),
        updated_by  TEXT REFERENCES users(id),
        createdat   TEXT NOT NULL DEFAULT (datetime('now')),
        updatedat   TEXT NOT NULL DEFAULT (datetime('now')),
        isarchived  INTEGER NOT NULL DEFAULT 0,
        isstarred   INTEGER NOT NULL DEFAULT 0,
        metadata    TEXT NOT NULL DEFAULT '{}'
      );

      INSERT OR REPLACE INTO notes_next (
        id, title, content, projectid, createdby, updated_by, createdat,
        updatedat, isarchived, isstarred, metadata
      )
      SELECT
        id, title, content, projectid, createdby, updated_by, createdat,
        updatedat, isarchived, isstarred, COALESCE(metadata, '{}')
      FROM notes;

      DROP TABLE notes;
      ALTER TABLE notes_next RENAME TO notes;
    `);
  }

  db.exec(`
    DROP INDEX IF EXISTS idx_notes_projectid;
    CREATE INDEX IF NOT EXISTS idx_notes_createdby ON notes(createdby);
  `);

  // ── Add conversation tracking columns (idempotent) ───────────────────────
  const noteCols = tableColumns('notes');
  if (!noteCols.has('conversation_id')) {
    db.exec(`ALTER TABLE notes ADD COLUMN conversation_id TEXT`);
  }
  if (!noteCols.has('agent_session_id')) {
    db.exec(`ALTER TABLE notes ADD COLUMN agent_session_id TEXT`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_conversation_id
      ON notes(conversation_id) WHERE conversation_id IS NOT NULL;
  `);

  // ── One-time orphan cleanup ───────────────────────────────────────────────
  // Delete agent-created notes whose agent session no longer exists.
  // This safely removes notes left behind by previously deleted conversations.
  // json_extract works on the metadata TEXT column (stored as valid JSON).
  try {
    db.prepare(`
      DELETE FROM notes
      WHERE json_extract(metadata, '$.source') = 'agent'
        AND conversation_id IS NULL
        AND json_extract(metadata, '$.sessionId') IS NOT NULL
        AND json_extract(metadata, '$.sessionId') NOT IN (SELECT id FROM agent_sessions)
    `).run();
  } catch {
    // Non-fatal: agent_sessions may not exist yet on very first boot
  }
}

function ensureAgentMemorySchema() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_memory'").get();
  if (!table) return;

  const createSql = table.sql || '';
  const hasOldMemoryTypeCheck = createSql.includes("memory_type IN ('fact','preference','context','task_state')");
  let columns = tableColumns('agent_memory');

  if (hasOldMemoryTypeCheck) {
    db.exec(`
      DROP TRIGGER IF EXISTS agent_memory_ai;
      DROP TRIGGER IF EXISTS agent_memory_ad;
      DROP TRIGGER IF EXISTS agent_memory_au;

      CREATE TABLE IF NOT EXISTS agent_memory_next (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        memory_type      TEXT NOT NULL DEFAULT 'fact'
                           CHECK (memory_type IN ('user','feedback','project','reference','fact','preference','context','task_state')),
        key              TEXT,
        content          TEXT NOT NULL,
        relevance        REAL NOT NULL DEFAULT 1.0,
        tags             TEXT NOT NULL DEFAULT '[]',
        importance       REAL NOT NULL DEFAULT 0.5,
        last_accessed_at TEXT,
        access_count     INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO agent_memory_next (
        id, user_id, workspace_id, memory_type, key, content, relevance,
        tags, importance, last_accessed_at, access_count, created_at, updated_at
      )
      SELECT
        id, user_id, workspace_id, memory_type, key, content, relevance,
        '[]', 0.5, NULL, 0, created_at, updated_at
      FROM agent_memory;

      DROP TABLE agent_memory;
      ALTER TABLE agent_memory_next RENAME TO agent_memory;
    `);
    columns = tableColumns('agent_memory');
  }

  const addColumn = (name, definition) => {
    if (columns.has(name)) return;
    db.exec(`ALTER TABLE agent_memory ADD COLUMN ${name} ${definition}`);
    columns.add(name);
  };

  addColumn('tags', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('importance', 'REAL NOT NULL DEFAULT 0.5');
  addColumn('last_accessed_at', 'TEXT');
  addColumn('access_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('embedding', 'TEXT'); // JSON float array for vector similarity search
  addColumn('embedding_model', 'TEXT'); // embedding model that produced `embedding` — only same-model vectors are compared
  addColumn('embedding_dim', 'INTEGER'); // vector dimensionality, for fast same-space filtering
  addColumn('profile_id', 'TEXT'); // agent profile namespace — NULL means shared across all profiles
  addColumn('expires_at', 'TEXT'); // ISO datetime; NULL = permanent; set for transient types (task_state, context)
  addColumn("source", "TEXT NOT NULL DEFAULT 'agent'"); // 'agent'=explicit tool call, 'auto'=post-run extraction, 'correction'=correction detection

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_memory_user       ON agent_memory(user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace  ON agent_memory(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_key        ON agent_memory(user_id, workspace_id, key);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_profile    ON agent_memory(user_id, workspace_id, profile_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS agent_memory_fts USING fts5(
      memory_id UNINDEXED,
      key,
      content,
      tokenize='unicode61'
    );

    DELETE FROM agent_memory_fts;
    INSERT INTO agent_memory_fts(memory_id, key, content)
    SELECT id, key, content FROM agent_memory;

    CREATE TRIGGER IF NOT EXISTS agent_memory_ai AFTER INSERT ON agent_memory BEGIN
      INSERT INTO agent_memory_fts(memory_id, key, content)
      VALUES (new.id, new.key, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS agent_memory_ad AFTER DELETE ON agent_memory BEGIN
      DELETE FROM agent_memory_fts WHERE memory_id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS agent_memory_au AFTER UPDATE ON agent_memory BEGIN
      DELETE FROM agent_memory_fts WHERE memory_id = old.id;
      INSERT INTO agent_memory_fts(memory_id, key, content)
      VALUES (new.id, new.key, new.content);
    END;
  `);
}

function cleanupDeadTables() {
  db.exec(`
    DROP TABLE IF EXISTS project_folder_items;
    DROP TABLE IF EXISTS project_folders;
    DROP TABLE IF EXISTS project_members;
    DROP TABLE IF EXISTS note_versions;
    DROP TABLE IF EXISTS note_operations;
    DROP TABLE IF EXISTS mcp_auth_codes;
    DROP TABLE IF EXISTS mcp_access_tokens;
    DROP TABLE IF EXISTS TaskDependencies;
  `);
}

function dropColumnIfPresent(table, column) {
  const columns = tableColumns(table);
  if (!columns.has(column)) return;
  try {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch (err) {
    logger.warn(`Database: could not drop ${table}.${column}: ${err.message}`);
  }
}

function ensureProjectSchema() {
  dropColumnIfPresent('projects', 'enabled_views');
  dropColumnIfPresent('projects', 'enabled_widgets');
}

function ensureKanbanSchema() {
  dropColumnIfPresent('Columns', 'isCompletionColumn');
  dropColumnIfPresent('Cards', 'dependencies');
  dropColumnIfPresent('Cards', 'completedAt');
}

function ensureModelPathsSchema() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'custom_model_paths'").get();
  if (!table) return;

  const createSql = table.sql || '';
  // Check if the table already supports every model asset type.
  if (
    createSql.includes("'whisper'") &&
    createSql.includes("'tts'") &&
    createSql.includes("'vision'") &&
    createSql.includes("'image'")
  ) return;

  // Recreate table with expanded CHECK constraint
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_model_paths_next (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name        TEXT NOT NULL,
      path        TEXT NOT NULL UNIQUE,
      type        TEXT NOT NULL CHECK (type IN ('gguf', 'mlx', 'whisper', 'tts', 'vision', 'image')),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO custom_model_paths_next (id, name, path, type, created_at)
    SELECT id, name, path, type, created_at FROM custom_model_paths;

    DROP TABLE custom_model_paths;
    ALTER TABLE custom_model_paths_next RENAME TO custom_model_paths;
  `);
}

cleanupDeadTables();
ensureProjectSchema();
ensureKanbanSchema();
ensureCalendarSchema();
ensureNotesSchema();
ensureAgentMemorySchema();
ensureModelPathsSchema();
ensureCheckpointSchema();
ensureConversationFts();
ensureSemanticSchema();

// Delete expired transient memories on every server boot
try {
  const expired = db.prepare("DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").run();
  if (expired.changes > 0) logger.info(`[memory] Removed ${expired.changes} expired memories at startup`);
} catch { /* non-critical */ }

// Decay importance for zero-access memories older than 14 days (−10% per boot, floor 0.1)
// Protected types (user, feedback) are never decayed.
try {
  const decayed = db.prepare(`
    UPDATE agent_memory
    SET importance = MAX(0.1, ROUND(importance * 0.9, 4))
    WHERE access_count = 0
      AND julianday('now') - julianday(COALESCE(last_accessed_at, created_at)) > 14
      AND importance > 0.1
      AND memory_type NOT IN ('user', 'feedback')
  `).run();
  if (decayed.changes > 0) logger.info(`[memory] Decayed importance for ${decayed.changes} zero-access memories`);
} catch { /* non-critical */ }

function ensureSemanticSchema() {
  // Shared embedding cache — keyed by sha256(model + text). Carries dim so the
  // embedding service can report the active vector space, and created_at so the
  // cache can be pruned oldest-first when it grows past its cap.
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      hash        TEXT PRIMARY KEY,
      model       TEXT NOT NULL,
      dim         INTEGER NOT NULL,
      vector      TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_embedding_cache_created ON embedding_cache(created_at);
    CREATE INDEX IF NOT EXISTS idx_embedding_cache_model   ON embedding_cache(model);
  `);
}

function ensureCheckpointSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_checkpoints (
      id          TEXT PRIMARY KEY,
      kind        TEXT NOT NULL,
      workspace   TEXT NOT NULL,
      message     TEXT,
      ref         TEXT,
      dir         TEXT,
      baseline    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_workspace ON agent_checkpoints(workspace);
  `);
}

function ensureConversationFts() {
  const hasFts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations_fts'").get();
  if (hasFts) return;

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
      conversation_id UNINDEXED,
      title,
      tokenize='unicode61'
    );

    INSERT INTO conversations_fts(conversation_id, title)
    SELECT id, title FROM conversations WHERE deleted_at IS NULL;

    CREATE TRIGGER IF NOT EXISTS conversations_fts_ai AFTER INSERT ON conversations BEGIN
      INSERT INTO conversations_fts(conversation_id, title) VALUES (new.id, new.title);
    END;

    CREATE TRIGGER IF NOT EXISTS conversations_fts_ad AFTER DELETE ON conversations BEGIN
      DELETE FROM conversations_fts WHERE conversation_id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS conversations_fts_au AFTER UPDATE OF title ON conversations BEGIN
      DELETE FROM conversations_fts WHERE conversation_id = old.id;
      INSERT INTO conversations_fts(conversation_id, title) VALUES (new.id, new.title);
    END;
  `);
}

// ─── Hydrate DB-backed config into process.env ───────────────────────────────
// app_config holds settings that used to live in den/.env (local-AI engine
// paths/ports, capability providers, integration creds, …). The DB is
// authoritative for any key it stores, so a value edited in the UI wins over a
// stale .env entry. Inlined here (rather than importing config/appConfig.js) so
// the very first import of this module hydrates env before any manager reads it,
// and to avoid a circular import. See config/appConfig.js.
try {
  let hydrated = 0;
  for (const row of db.prepare('SELECT key, value FROM app_config').all()) {
    process.env[row.key] = row.value;
    hydrated += 1;
  }
  if (hydrated > 0) logger.info(`Config: hydrated ${hydrated} setting(s) from app_config`);
} catch (err) {
  logger.warn('Config: could not hydrate app_config into env:', err.message);
}

logger.info(`Database: SQLite at ${DB_PATH}`);

export default db;
