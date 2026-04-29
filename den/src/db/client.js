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

logger.info(`Database: SQLite at ${DB_PATH}`);

export default db;
