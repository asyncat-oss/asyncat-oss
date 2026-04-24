// Adds a persistent allowlist for agent tool permissions and rebuilds
// agent_memory with enrichment columns (tags, importance, recency) and no
// narrow CHECK on memory_type so the redesigned memory tools can use the
// wider user/feedback/project/reference taxonomy.

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  );
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false;
  return db.prepare(`PRAGMA table_info("${tableName}")`).all()
    .some(col => col.name === columnName);
}

export function up(db) {
  // ── permission_rules ───────────────────────────────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS permission_rules (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      tool_name     TEXT NOT NULL,                 -- exact name or '*'
      arg_field     TEXT,                          -- e.g. 'command' for run_command
      arg_pattern   TEXT,                          -- JS regex source (null = match any)
      action        TEXT NOT NULL
                      CHECK (action IN ('allow','deny')),
      scope         TEXT NOT NULL DEFAULT 'workspace'
                      CHECK (scope IN ('workspace','global')),
      note          TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_permission_rules_lookup ON permission_rules(user_id, tool_name)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_permission_rules_workspace ON permission_rules(workspace_id)').run();

  // ── agent_memory rebuild ───────────────────────────────────────────────────
  // The original schema had CHECK (memory_type IN ('fact','preference','context','task_state')).
  // Rebuild to drop that CHECK and add the enrichment columns the new memory
  // tools rely on. Idempotent: skip if `tags` column already exists.
  const needsRebuild = tableExists(db, 'agent_memory') && !columnExists(db, 'agent_memory', 'tags');

  if (needsRebuild) {
    // Drop triggers first so the rename doesn't dangle them.
    db.exec(`
      DROP TRIGGER IF EXISTS agent_memory_ai;
      DROP TRIGGER IF EXISTS agent_memory_ad;
      DROP TRIGGER IF EXISTS agent_memory_au;
    `);

    db.exec(`
      CREATE TABLE agent_memory_new (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        memory_type      TEXT NOT NULL DEFAULT 'fact',
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
    `);

    db.exec(`
      INSERT INTO agent_memory_new
        (id, user_id, workspace_id, memory_type, key, content, relevance, created_at, updated_at)
      SELECT
        id, user_id, workspace_id, memory_type, key, content, relevance, created_at, updated_at
      FROM agent_memory;
    `);

    db.exec(`DROP TABLE agent_memory;`);
    db.exec(`ALTER TABLE agent_memory_new RENAME TO agent_memory;`);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_memory_user       ON agent_memory(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace  ON agent_memory(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_key        ON agent_memory(user_id, workspace_id, key);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_type       ON agent_memory(memory_type);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_importance ON agent_memory(importance DESC);
    `);

    db.exec(`
      CREATE TRIGGER agent_memory_ai AFTER INSERT ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(memory_id, key, content)
        VALUES (new.id, new.key, new.content);
      END;
      CREATE TRIGGER agent_memory_ad AFTER DELETE ON agent_memory BEGIN
        DELETE FROM agent_memory_fts WHERE memory_id = old.id;
      END;
      CREATE TRIGGER agent_memory_au AFTER UPDATE ON agent_memory BEGIN
        DELETE FROM agent_memory_fts WHERE memory_id = old.id;
        INSERT INTO agent_memory_fts(memory_id, key, content)
        VALUES (new.id, new.key, new.content);
      END;
    `);
  }
}
