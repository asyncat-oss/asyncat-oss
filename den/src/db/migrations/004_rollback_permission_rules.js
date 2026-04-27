// Down migration for 002_permission_rules
// Drops the permission_rules table and its indexes

export function down(db) {
  db.prepare('DROP TABLE IF EXISTS permission_rules').run();
}
