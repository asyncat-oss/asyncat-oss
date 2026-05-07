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

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_memory_user       ON agent_memory(user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace  ON agent_memory(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_key        ON agent_memory(user_id, workspace_id, key);

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

ensureCalendarSchema();
ensureAgentMemorySchema();

logger.info(`Database: SQLite at ${DB_PATH}`);

export default db;
