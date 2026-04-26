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
  ensureColumn(db, 'ai_provider_config', 'profile_id', 'TEXT');
  ensureColumn(db, 'ai_provider_config', 'settings', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'ai_provider_config', 'supports_tools', 'INTEGER NOT NULL DEFAULT 0');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_provider_profiles (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      provider_type    TEXT NOT NULL DEFAULT 'cloud'
                         CHECK (provider_type IN ('cloud', 'local', 'custom')),
      provider_id      TEXT NOT NULL,
      base_url         TEXT NOT NULL,
      model            TEXT NOT NULL,
      api_key          TEXT,
      settings         TEXT NOT NULL DEFAULT '{}',
      supports_tools   INTEGER NOT NULL DEFAULT 0,
      last_test_status TEXT,
      last_test_message TEXT,
      last_test_at     TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_profiles_user ON ai_provider_profiles(user_id, updated_at)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_profiles_provider ON ai_provider_profiles(user_id, provider_id)').run();
}
