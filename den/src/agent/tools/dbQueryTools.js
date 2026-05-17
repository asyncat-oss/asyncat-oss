// den/src/agent/tools/dbQueryTools.js
// ─── Database Query Tools ──────────────────────────────────────────────────
// Query the workspace SQLite database for analytics, debugging, and reporting.
// SELECT-only by default; writes require DANGEROUS permission.

import { PermissionLevel } from './toolRegistry.js';
import db from '../../db/client.js';

const DANGEROUS_KEYWORDS = /\b(DROP|TRUNCATE|ALTER|CREATE\s+INDEX|DETACH|REINDEX|VACUUM)\b/i;
const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE\s+TABLE|CREATE\s+VIEW|CREATE\s+TRIGGER|ALTER|DROP|ATTACH|PRAGMA)\b/i;

function classifyQuery(sql) {
  const normalized = sql.trim().toUpperCase();
  if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) return 'read';
  if (WRITE_KEYWORDS.test(normalized)) return 'write';
  if (DANGEROUS_KEYWORDS.test(normalized)) return 'dangerous';
  return 'unknown';
}

function formatRows(rows, limit = 200) {
  if (!rows || rows.length === 0) return { columns: [], rows: [], count: 0, truncated: false };
  const columns = Object.keys(rows[0]);
  const sliced = rows.slice(0, limit);
  const stringified = sliced.map(row => {
    const out = {};
    for (const col of columns) {
      const val = row[col];
      if (val === null) out[col] = null;
      else if (typeof val === 'string' && val.length > 500) out[col] = val.slice(0, 500) + '...';
      else out[col] = val;
    }
    return out;
  });
  return { columns, rows: stringified, count: rows.length, truncated: rows.length > limit };
}

export const dbQueryTool = {
  name: 'db_query',
  description:
    'Run a SQL query against the workspace database. SELECT queries are safe; ' +
    'INSERT/UPDATE/DELETE require DANGEROUS permission. Use for analytics, debugging, ' +
    'reporting, or understanding workspace data (conversations, tasks, notes, events, memory).',
  category: 'data',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'SQL query to execute. Supports SQLite syntax.' },
      limit: { type: 'number', description: 'Max rows to return (default: 200, max: 1000)' },
    },
    required: ['sql'],
  },
  execute: async (args, context) => {
    const sql = String(args.sql || '').trim();
    if (!sql) return { success: false, error: 'sql is required' };

    const limit = Math.max(1, Math.min(1000, args.limit || 200));
    const classification = classifyQuery(sql);

    if (classification === 'dangerous') {
      return {
        success: false,
        error: 'This query contains dangerous SQL keywords (DROP, TRUNCATE, ALTER, etc.) that are not allowed.',
        classification,
      };
    }

    if (classification === 'write') {
      return {
        success: false,
        error: 'This is a write query (INSERT/UPDATE/DELETE/etc.). Use db_write for write operations.',
        classification,
      };
    }

    try {
      const rows = db.prepare(sql).all();
      const result = formatRows(rows, limit);
      return {
        success: true,
        classification,
        ...result,
      };
    } catch (err) {
      return {
        success: false,
        error: `SQL error: ${err.message}`,
        classification,
      };
    }
  },
};

export const dbWriteTool = {
  name: 'db_write',
  description:
    'Execute a write query (INSERT, UPDATE, DELETE) against the workspace database. ' +
    'Use with extreme caution — this modifies workspace data. Requires DANGEROUS permission.',
  category: 'data',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'SQL write query (INSERT, UPDATE, or DELETE only)' },
    },
    required: ['sql'],
  },
  execute: async (args, context) => {
    const sql = String(args.sql || '').trim();
    if (!sql) return { success: false, error: 'sql is required' };

    const classification = classifyQuery(sql);

    if (classification === 'dangerous') {
      return {
        success: false,
        error: 'This query contains dangerous SQL keywords (DROP, TRUNCATE, ALTER, etc.) that are not allowed.',
        classification,
      };
    }

    if (classification === 'read') {
      return {
        success: false,
        error: 'This appears to be a read query. Use db_query instead.',
        classification,
      };
    }

    try {
      const result = db.prepare(sql).run();
      return {
        success: true,
        classification,
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid || null,
      };
    } catch (err) {
      return {
        success: false,
        error: `SQL error: ${err.message}`,
        classification,
      };
    }
  },
};

export const dbSchemaTool = {
  name: 'db_schema',
  description:
    'List the tables and their columns in the workspace database. Use this to discover ' +
    'what data is available before writing queries.',
  category: 'data',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string', description: 'Optional: show schema for a specific table only' },
    },
    required: [],
  },
  execute: async (args) => {
    try {
      if (args.table) {
        const tableName = String(args.table).replace(/[^a-zA-Z0-9_]/g, '');
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
        return {
          success: true,
          table: tableName,
          columns: columns.map(c => ({
            name: c.name,
            type: c.type,
            notnull: Boolean(c.notnull),
            default: c.dflt_value,
            primaryKey: Boolean(c.pk),
          })),
          rowCount: rowCount.count,
        };
      }

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      const schema = {};
      for (const t of tables) {
        if (t.name.startsWith('sqlite_') || t.name.startsWith('_')) continue;
        const columns = db.prepare(`PRAGMA table_info(${t.name})`).all();
        const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get();
        schema[t.name] = {
          columns: columns.map(c => `${c.name} ${c.type}${c.pk ? ' PK' : ''}${c.notnull ? ' NOT NULL' : ''}`),
          rowCount: rowCount.count,
        };
      }
      return { success: true, tables: Object.keys(schema).length, schema };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const dbQueryTools = [dbQueryTool, dbWriteTool, dbSchemaTool];
export default dbQueryTools;
