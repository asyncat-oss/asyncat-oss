// db/sealSecrets.js — keep saved secrets encrypted in the database.
//
// Every query opens sealed values (openingStatements), so code reads plain
// keys; code that saves a secret seals it with sealSecret(). At startup,
// sealStoredSecrets() encrypts anything still saved in plain text (from older
// versions, or a write that forgot) and moves values sealed with an old key
// onto the current one.

import { isSealed, isSealedWithCurrentKey, openRow, openSecret, sealSecret } from '../lib/secretBox.js';

// Settings (app_config) that hold secrets.
export const SECRET_CONFIG_KEYS = [
  'HF_TOKEN',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'STABILITY_API_KEY',
  'FAL_KEY',
  'GEMINI_API_KEY',
  'MINIMAX_API_KEY',
  'MAIL_IMAP_PASSWORD',
  'MAIL_SMTP_PASSWORD',
  'NOTIFY_DISCORD_WEBHOOK',
  'NOTIFY_SLACK_WEBHOOK',
  'NOTIFY_TELEGRAM_BOT_TOKEN',
];

const SECRET_COLUMNS = [
  ['ai_provider_config', 'api_key'],
  ['ai_provider_profiles', 'api_key'],
  ['user_integrations', 'access_token'],
  ['user_integrations', 'refresh_token'],
];

const SECRET_CONFIG_SET = new Set(SECRET_CONFIG_KEYS);

export function isSecretConfigKey(key) {
  return SECRET_CONFIG_SET.has(key);
}

/** Wrap db.prepare so every row a query returns has its secrets opened. */
export function openingStatements(db) {
  const prepare = db.prepare.bind(db);
  const chainable = new Set(['pluck', 'expand', 'raw', 'safeIntegers', 'bind']);
  db.prepare = (source) => {
    const statement = prepare(source);
    if (!statement.reader) return statement;
    const proxy = new Proxy(statement, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== 'function') return value;
        if (prop === 'get') return (...args) => openRow(target.get(...args));
        if (prop === 'all') return (...args) => target.all(...args).map(openRow);
        if (prop === 'iterate') {
          return function* iterate(...args) {
            for (const row of target.iterate(...args)) yield openRow(row);
          };
        }
        if (chainable.has(prop)) {
          return (...args) => {
            const result = value.apply(target, args);
            return result === target ? proxy : result;
          };
        }
        return value.bind(target);
      },
    });
    return proxy;
  };
  return prepare;
}

/**
 * Seal plain-text secrets and re-seal ones sealed with an old key. Values
 * that can't be opened (their key is gone) are left alone. `prepare` must be
 * the unwrapped db.prepare so sealed values are seen as stored.
 */
export function sealStoredSecrets(prepare) {
  let sealed = 0;
  const reseal = (value) => {
    if (!value || isSealedWithCurrentKey(value)) return null;
    const plain = isSealed(value) ? openSecret(value) : value;
    if (!plain || isSealed(plain)) return null;
    const next = sealSecret(plain);
    return next === value || !isSealed(next) ? null : next;
  };

  const tableExists = prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");
  for (const [table, column] of SECRET_COLUMNS) {
    if (!tableExists.get(table)) continue;
    const rows = prepare(`SELECT rowid AS rid, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`).all();
    const update = prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
    for (const row of rows) {
      const next = reseal(row.value);
      if (next) {
        update.run(next, row.rid);
        sealed += 1;
      }
    }
  }

  if (tableExists.get('app_config')) {
    const rows = prepare(`SELECT key, value FROM app_config WHERE key IN (${SECRET_CONFIG_KEYS.map(() => '?').join(',')})`).all(...SECRET_CONFIG_KEYS);
    const update = prepare('UPDATE app_config SET value = ? WHERE key = ?');
    for (const row of rows) {
      const next = reseal(row.value);
      if (next) {
        update.run(next, row.key);
        sealed += 1;
      }
    }
  }
  return sealed;
}
