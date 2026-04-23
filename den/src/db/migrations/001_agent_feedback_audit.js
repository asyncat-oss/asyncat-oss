// Adds feedback/correction columns and first-class agent tool audit storage.

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

function ensureColumn(db, tableName, columnName, definition) {
  if (!columnExists(db, tableName, columnName)) {
    db.prepare(`ALTER TABLE "${tableName}" ADD COLUMN ${columnName} ${definition}`).run();
  }
}

export function up(db) {
  ensureColumn(db, 'agent_sessions', 'feedback_rating', 'INTEGER');
  ensureColumn(db, 'agent_sessions', 'feedback_comment', 'TEXT');
  ensureColumn(db, 'agent_sessions', 'was_helpful', 'INTEGER');
  ensureColumn(db, 'agent_sessions', 'corrections', "TEXT NOT NULL DEFAULT '[]'");

  db.prepare(`
    CREATE TABLE IF NOT EXISTS agent_patterns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT,
      pattern_hash TEXT NOT NULL,
      pattern_summary TEXT NOT NULL,
      tool_sequence TEXT NOT NULL,
      success_count INTEGER DEFAULT 1,
      failure_count INTEGER DEFAULT 0,
      last_seen_at TEXT NOT NULL,
      last_failure_at TEXT,
      created_at TEXT NOT NULL,
      auto_skill_created INTEGER DEFAULT 0,
      corrections TEXT NOT NULL DEFAULT '[]'
    )
  `).run();
  ensureColumn(db, 'agent_patterns', 'corrections', "TEXT NOT NULL DEFAULT '[]'");
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_patterns_user_pattern
    ON agent_patterns(user_id, pattern_hash)
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS agent_tool_audit (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT,
      tool_name TEXT NOT NULL,
      permission_level TEXT NOT NULL,
      permission_decision TEXT NOT NULL,
      permission_reason TEXT,
      working_dir TEXT,
      args TEXT NOT NULL DEFAULT '{}',
      result TEXT,
      success INTEGER,
      round INTEGER,
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_session ON agent_tool_audit(session_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_user ON agent_tool_audit(user_id, started_at)').run();
}
