// den/src/db/sqlite.js
// SQLite query builder — provides a Supabase-compatible API over better-sqlite3.
//
// Exposes the subset of the Supabase JS client API used by den's controllers:
//   .schema(name)  .from(table)  .select(cols)  .eq/neq/gt/gte/lt/lte/in/is/ilike
//   .order()  .limit()  .single()
//   .insert(data).select().single()
//   .update(data).eq(...).select().single()
//   .upsert(data, opts)
//   .delete().eq(...)
//
// All methods return { data, error } objects exactly as the Supabase client does,
// so no changes are needed in controllers that follow the standard pattern:
//   const { data, error } = await db.from("Cards").select("*").eq("id", id);
//
// JSON serialisation: object/array values are JSON.stringify'd on write and
// JSON.parse'd on read (any string that starts with { or [).

import db from './client.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Coerce JS booleans to SQLite integers (SQLite has no native boolean type)
function sqlVal(v) {
  if (v === true)  return 1;
  if (v === false) return 0;
  return v;
}

function serializeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (Array.isArray(v) || (v !== null && typeof v === 'object')) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = sqlVal(v);
    }
  }
  return out;
}

function deserializeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.length > 0 && (v[0] === '[' || v[0] === '{')) {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deserializeRows(rows) {
  if (!rows) return rows;
  if (Array.isArray(rows)) return rows.map(deserializeRow);
  return deserializeRow(rows);
}

function quotedCols(cols) {
  if (!cols || cols === '*') return '*';
  return cols.split(',').map(c => {
    const t = c.trim();
    if (t === '*') return '*';
    if (t.includes('(')) return t; // aggregate functions — leave as-is
    return quoteIdent(t);
  }).join(', ');
}

function quoteIdent(col) {
  const raw = String(col).trim().replace(/^"+|"+$/g, '').replace(/"/g, '""');
  return `"${raw}"`;
}

// ─── QueryBuilder ─────────────────────────────────────────────────────────────

class QueryBuilder {
  constructor(table) {
    this._table       = table;
    this._selectCols  = '*';
    this._conditions  = [];
    this._condParams  = [];
    this._orderClauses = [];   // multiple .order() calls are stacked
    this._limitVal    = null;
    this._offsetVal   = null;
    this._isSingle    = false;
    this._op          = 'select';
    this._writeData   = null;
    this._returning   = false;
    this._conflictCol = null;
    this._headOnly    = false;
  }

  // ── Filter ──────────────────────────────────────────────────────────────────

  eq(col, val) {
    this._conditions.push(`${quoteIdent(col)} = ?`);
    this._condParams.push(sqlVal(val));
    return this;
  }

  neq(col, val) {
    this._conditions.push(`${quoteIdent(col)} != ?`);
    this._condParams.push(sqlVal(val));
    return this;
  }

  gt(col, val) {
    this._conditions.push(`${quoteIdent(col)} > ?`);
    this._condParams.push(sqlVal(val));
    return this;
  }

  gte(col, val) {
    this._conditions.push(`${quoteIdent(col)} >= ?`);
    this._condParams.push(sqlVal(val));
    return this;
  }

  lt(col, val) {
    this._conditions.push(`${quoteIdent(col)} < ?`);
    this._condParams.push(sqlVal(val));
    return this;
  }

  lte(col, val) {
    this._conditions.push(`${quoteIdent(col)} <= ?`);
    this._condParams.push(sqlVal(val));
    return this;
  }

  in(col, vals) {
    if (!Array.isArray(vals) || vals.length === 0) {
      this._conditions.push('0 = 1'); // empty IN → always false
      return this;
    }
    this._conditions.push(`${quoteIdent(col)} IN (${vals.map(() => '?').join(', ')})`);
    this._condParams.push(...vals.map(sqlVal));
    return this;
  }

  is(col, val) {
    if (val === null || val === undefined) {
      this._conditions.push(`${quoteIdent(col)} IS NULL`);
    } else {
      this._conditions.push(`${quoteIdent(col)} IS NOT NULL`);
    }
    return this;
  }

  ilike(col, pattern) {
    this._conditions.push(`lower(${quoteIdent(col)}) LIKE lower(?)`);
    this._condParams.push(pattern);
    return this;
  }

  not(col, operator, val) {
    if (operator === 'is' && (val === null || val === undefined)) {
      this._conditions.push(`${quoteIdent(col)} IS NOT NULL`);
    } else if (operator === 'eq') {
      this._conditions.push(`${quoteIdent(col)} != ?`);
      this._condParams.push(sqlVal(val));
    } else {
      this._conditions.push(`${quoteIdent(col)} IS NOT NULL`);
    }
    return this;
  }

  // maybeSingle: like single() but returns { data: null } instead of error when no row found
  maybeSingle() {
    this._isSingle   = true;
    this._isMaybe    = true;
    this._limitVal   = 1;
    return this;
  }

  // ── Modifier ────────────────────────────────────────────────────────────────

  order(col, opts = {}) {
    const raw = col.replace(/"/g, '');
    const dir = opts.ascending === false ? 'DESC' : 'ASC';
    // Use NULLS LAST by default so NULL values don't bubble to the top
    const nulls = opts.nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';
    this._orderClauses.push(`"${raw}" ${dir} ${nulls}`);
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  // .range(from, to) → LIMIT (to-from+1) OFFSET from
  range(from, to) {
    this._offsetVal = from;
    this._limitVal  = to - from + 1;
    return this;
  }

  // .or('col1.ilike.%x%,col2.eq.y') — basic OR support for common patterns
  or(filterStr) {
    const parts = filterStr.split(',').map(part => {
      const m = part.trim().match(/^(\w+)\.(ilike|eq|neq|is|gt|gte|lt|lte)\.(.*)$/i);
      if (!m) return null;
      const [, col, op, val] = m;
      if (op === 'ilike') return [`lower("${col}") LIKE lower(?)`, val];
      if (op === 'is' && val === 'null') return [`"${col}" IS NULL`, null];
      if (op === 'eq')  return [`"${col}" = ?`, val];
      if (op === 'neq') return [`"${col}" != ?`, val];
      if (op === 'gt')  return [`"${col}" > ?`, val];
      if (op === 'gte') return [`"${col}" >= ?`, val];
      if (op === 'lt')  return [`"${col}" < ?`, val];
      if (op === 'lte') return [`"${col}" <= ?`, val];
      return null;
    }).filter(Boolean);

    if (parts.length === 0) return this;
    const sql = parts.map(([s]) => s).join(' OR ');
    const params = parts.map(([, p]) => p).filter(p => p !== null);
    this._conditions.push(`(${sql})`);
    this._condParams.push(...params);
    return this;
  }

  single() {
    this._isSingle = true;
    this._limitVal = 1;
    return this;
  }

  // ── Write operations ────────────────────────────────────────────────────────

  /**
   * select(cols) serves dual purpose:
   *   - on a fresh builder: sets which columns to fetch
   *   - chained after insert/update/upsert: means "return the written rows"
   */
  select(cols = '*', opts = {}) {
    if (this._op !== 'select') {
      // After a write op — signal that we want the rows back
      this._returning = true;
      this._selectCols = cols;
    } else {
      this._selectCols = cols;
      if (opts.head) this._headOnly = true;
    }
    return this;
  }

  insert(data) {
    this._op        = 'insert';
    this._writeData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data) {
    this._op        = 'update';
    this._writeData = data;
    return this;
  }

  upsert(data, opts = {}) {
    this._op          = 'upsert';
    this._writeData   = Array.isArray(data) ? data : [data];
    this._conflictCol = opts.onConflict || null;
    return this;
  }

  delete() {
    this._op = 'delete';
    return this;
  }

  // ── Execution ────────────────────────────────────────────────────────────────

  _where() {
    return this._conditions.length ? ' WHERE ' + this._conditions.join(' AND ') : '';
  }

  _execSelect() {
    const where = this._where();
    let sql = `SELECT ${quotedCols(this._selectCols)} FROM "${this._table}"${where}`;
    if (this._orderClauses.length) sql += ` ORDER BY ${this._orderClauses.join(', ')}`;
    if (this._limitVal  != null) sql += ` LIMIT ${this._limitVal}`;
    if (this._offsetVal != null) sql += ` OFFSET ${this._offsetVal}`;

    if (this._headOnly) {
      // COUNT only — used by projectComponentController
      const countSql = `SELECT COUNT(*) as count FROM "${this._table}"${where}`;
      const row = db.prepare(countSql).get(...this._condParams);
      return { data: null, count: row.count, error: null };
    }

    const stmt = db.prepare(sql);
    if (this._isSingle) {
      const row = stmt.get(...this._condParams);
      if (!row) {
        if (this._isMaybe) return { data: null, error: null };
        // Mimic Supabase PGRST116 "no rows returned"
        return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
      }
      return { data: deserializeRow(row), error: null };
    }
    return { data: deserializeRows(stmt.all(...this._condParams)), error: null };
  }

  _execInsert() {
    const results = [];
    for (const row of this._writeData) {
      const processed = serializeRow(row);
      const cols  = Object.keys(processed);
      const phs   = cols.map(() => '?').join(', ');
      const sql   = `INSERT INTO "${this._table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${phs})`;
      const info  = db.prepare(sql).run(...Object.values(processed));

      if (this._returning) {
        // Fetch by id (UUID PK) if provided, otherwise use lastInsertRowid
        const fetchedRow = processed.id
          ? db.prepare(`SELECT * FROM "${this._table}" WHERE id = ?`).get(processed.id)
          : db.prepare(`SELECT * FROM "${this._table}" WHERE rowid = ?`).get(info.lastInsertRowid);
        results.push(deserializeRow(fetchedRow));
      }
    }

    if (!this._returning) return { data: null, error: null };
    return this._isSingle
      ? { data: results[0] || null, error: null }
      : { data: results, error: null };
  }

  _execUpdate() {
    const processed = serializeRow(this._writeData);
    const keys = Object.keys(processed);
    if (keys.length === 0) return { data: null, error: null };

    const setClauses = keys.map(k => `"${k}" = ?`).join(', ');
    const where      = this._where();
    db.prepare(`UPDATE "${this._table}" SET ${setClauses}${where}`)
      .run(...Object.values(processed), ...this._condParams);

    if (!this._returning) return { data: null, error: null };

    let sql = `SELECT ${quotedCols(this._selectCols)} FROM "${this._table}"${where}`;
    if (this._limitVal) sql += ` LIMIT ${this._limitVal}`;
    const stmt = db.prepare(sql);

    if (this._isSingle) {
      return { data: deserializeRow(stmt.get(...this._condParams)), error: null };
    }
    return { data: deserializeRows(stmt.all(...this._condParams)), error: null };
  }

  _execUpsert() {
    const results = [];
    for (const row of this._writeData) {
      const processed = serializeRow(row);
      const cols = Object.keys(processed);
      const phs  = cols.map(() => '?').join(', ');

      // Build ON CONFLICT clause
      let conflictTarget;
      if (this._conflictCol) {
        conflictTarget = this._conflictCol.split(',').map(c => `"${c.trim()}"`).join(', ');
      } else {
        conflictTarget = '"id"';
      }
      const updateCols = cols.filter(c => c !== 'id' && !this._conflictCol?.split(',').includes(c));
      const updateSet  = updateCols.length
        ? updateCols.map(k => `"${k}" = excluded."${k}"`).join(', ')
        : `"${cols[0]}" = excluded."${cols[0]}"`;

      const sql = `INSERT INTO "${this._table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${phs}) ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updateSet}`;
      db.prepare(sql).run(...Object.values(processed));

      const fetchKey = this._conflictCol
        ? this._conflictCol.split(',')[0].trim()
        : 'id';
      const fetchedRow = db.prepare(`SELECT * FROM "${this._table}" WHERE "${fetchKey}" = ?`).get(processed[fetchKey]);
      if (fetchedRow) results.push(deserializeRow(fetchedRow));
    }
    return { data: results.length === 1 ? results[0] : results, error: null };
  }

  _execDelete() {
    db.prepare(`DELETE FROM "${this._table}"${this._where()}`).run(...this._condParams);
    return { data: [], error: null };
  }

  _run() {
    try {
      switch (this._op) {
        case 'select': return this._execSelect();
        case 'insert': return this._execInsert();
        case 'update': return this._execUpdate();
        case 'upsert': return this._execUpsert();
        case 'delete': return this._execDelete();
        default: throw new Error(`Unknown operation: ${this._op}`);
      }
    } catch (err) {
      console.error(`[db:compat] ${this._op} "${this._table}":`, err.message);
      return { data: null, error: { message: err.message, code: 'SQLITE_ERROR' } };
    }
  }

  // Thenable — controllers always `await` the builder
  then(resolve, reject) {
    try {
      resolve(this._run());
    } catch (e) {
      reject(e);
    }
  }
}

// ─── CompatClient ─────────────────────────────────────────────────────────────
//
// Exposes the same top-level API as the Supabase JS client:
//   supabase.schema("kanban").from("Cards")  →  QueryBuilder("Cards")
//   supabase.from("notes")                   →  QueryBuilder("notes")
//   supabase.auth.getUser()                  →  { data: { user: req.user } }
//                                               (populated by attachDb middleware)

class CompatClient {
  constructor(user = null) {
    this._user = user;
    // Minimal auth shim — controllers that call supabase.auth.getUser()
    // will receive the user injected at middleware time.
    this.auth = {
      getUser: async () => ({ data: { user: this._user }, error: null }),
    };
  }

  schema(_name) {
    // No-op: SQLite has no schemas. All tables are flat.
    return this;
  }

  from(table) {
    return new QueryBuilder(table);
  }

  // RPC is used only for Supabase row-level security context — silently no-op in SQLite.
  async rpc(_fn, _args) {
    return { data: null, error: null };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Singleton SQLite client (no user context). Use for server-side operations. */
export const sqliteDb = new CompatClient();

/**
 * Creates a user-scoped SQLite client.
 * Replaces createAuthenticatedClient(token) calls.
 */
export const createDbClient = (user) => new CompatClient(user);

/**
 * Express middleware: attaches a CompatClient as req.db.
 * Drop-in replacement for the old "inject authenticated Supabase client" middleware.
 */
export const attachDb = (req, _res, next) => {
  req.db = new CompatClient(req.user || null);
  next();
};

export default sqliteDb;
