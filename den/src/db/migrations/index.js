import { up as agentFeedbackAudit } from './001_agent_feedback_audit.js';
import { up as permissionRules } from './002_permission_rules.js';
import { up as aiProviderProfiles } from './003_ai_provider_profiles.js';

const migrations = [
  ['001_agent_feedback_audit', agentFeedbackAudit],
  ['002_permission_rules', permissionRules],
  ['003_ai_provider_profiles', aiProviderProfiles],
];

export function runMigrations(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  for (const [version, up] of migrations) {
    const existing = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
    if (existing) continue;

    db.transaction(() => {
      up(db);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    })();

    console.log(`Database: migration applied ${version}`);
  }
}
