// config/appConfig.js — DB-backed runtime configuration.
//
// Most settings that used to live in den/.env are now stored in the `app_config`
// table and hydrated into process.env at boot (see hydrateConfigIntoEnv, called
// from db/client.js right after the schema is applied). This keeps the huge number
// of existing `process.env.X` reads across the codebase working untouched — they
// just get their values from the DB instead of the file.
//
// BOOTSTRAP_KEYS are the chicken-and-egg values needed before the DB is open
// (or to verify auth on every request). Those stay in den/.env and are never
// written here.
import db from '../db/client.js';

// Values that must remain in den/.env (read before the DB exists, or every request).
export const BOOTSTRAP_KEYS = new Set([
  'DB_PATH',
  'PORT',
  'NODE_ENV',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'ASYNCAT_HOME',
  'ASYNCAT_LOG_DIR',
  'STORAGE_DRIVER',
  'STORAGE_PATH',
  'FRONTEND_URL',
  'PUBLIC_URL',
  // First-run seed only; harmless to keep in .env.
  'LOCAL_EMAIL',
  'LOCAL_PASSWORD',
]);

export function isBootstrapKey(key) {
  return BOOTSTRAP_KEYS.has(key);
}

// Read every stored key/value pair from the DB.
export function getAllConfig() {
  const result = {};
  try {
    for (const row of db.prepare('SELECT key, value FROM app_config').all()) {
      result[row.key] = row.value;
    }
  } catch {
    // Table may not exist yet during very early boot — treated as empty.
  }
  return result;
}

export function getConfigValue(key) {
  try {
    return db.prepare('SELECT value FROM app_config WHERE key = ?').get(key)?.value ?? null;
  } catch {
    return null;
  }
}

// Upsert a runtime config value into the DB and mirror it into the live process
// so the change takes effect immediately without a restart.
export function setConfigValue(key, value) {
  if (BOOTSTRAP_KEYS.has(key)) {
    throw new Error(`${key} is a bootstrap value and must be set in den/.env, not the database.`);
  }
  db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value));
  process.env[key] = String(value);
  return true;
}

export function deleteConfigValue(key) {
  db.prepare('DELETE FROM app_config WHERE key = ?').run(key);
  return true;
}

// Hydrate DB config into process.env. The DB is authoritative for any key it
// holds (a value edited in the UI wins over a stale .env entry); keys only
// present in .env are left as dotenv loaded them. Called once at boot.
export function hydrateConfigIntoEnv() {
  const config = getAllConfig();
  for (const [key, value] of Object.entries(config)) {
    process.env[key] = value;
  }
  return Object.keys(config).length;
}
