import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// Saved API keys and tokens are encrypted in the database; the code reading
// them still gets plain values, and the key itself can live in the keychain.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-secrets-${crypto.randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
delete process.env.ASYNCAT_SECRET_KEY;

const { default: db } = await import('../src/db/client.js');
const { seed } = await import('../src/db/seed.js');
const box = await import('../src/lib/secretBox.js');
const { sealStoredSecrets } = await import('../src/db/sealSecrets.js');
const { setConfigValue, getConfigValue } = await import('../src/config/appConfig.js');

await seed();
const user = db.prepare('SELECT id FROM users LIMIT 1').get();
const rawPrepare = (sql) => Database.prototype.prepare.call(db, sql);
const keyFile = path.join(scratch, 'data', 'secret.key');

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function addProfile(apiKey) {
  const id = crypto.randomUUID();
  rawPrepare(`INSERT INTO ai_provider_profiles (id, user_id, name, provider_type, provider_id, base_url, model, api_key, settings, supports_tools)
    VALUES (?, ?, 'Demo', 'cloud', 'openai', 'https://api.example.test/v1', 'demo-model', ?, '{}', 1)`).run(id, user.id, apiKey);
  return id;
}
const storedKey = (id) => rawPrepare('SELECT api_key FROM ai_provider_profiles WHERE id = ?').get(id).api_key;

test('without the desktop app a private key file is made', () => {
  assert.deepEqual(box.secretStatus(), { encrypted: true, keySource: 'file' });
  assert.ok(fs.existsSync(keyFile));
  if (process.platform !== 'win32') assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600);
});

test('secrets round-trip and each sealing is different', () => {
  const a = box.sealSecret('sk-demo-123456');
  const b = box.sealSecret('sk-demo-123456');
  assert.match(a, /^enc1:[0-9a-f]{8}:/);
  assert.notEqual(a, b);
  assert.ok(!a.includes('sk-demo'));
  assert.equal(box.openSecret(a), 'sk-demo-123456');
  assert.equal(box.sealSecret(a), a, 'sealing twice changes nothing');
  assert.equal(box.openSecret('plain value'), 'plain value');
  assert.equal(box.sealSecret(''), '');
  assert.equal(box.sealSecret(null), null);
});

test('queries return opened values in every result mode', () => {
  const id = addProfile(box.sealSecret('sk-demo-reads'));
  assert.match(storedKey(id), /^enc1:/);
  const sql = 'SELECT id, api_key FROM ai_provider_profiles WHERE id = ?';
  assert.equal(db.prepare(sql).get(id).api_key, 'sk-demo-reads');
  assert.equal(db.prepare(sql).all(id)[0].api_key, 'sk-demo-reads');
  assert.equal([...db.prepare(sql).iterate(id)][0].api_key, 'sk-demo-reads');
  assert.equal(db.prepare('SELECT api_key FROM ai_provider_profiles WHERE id = ?').pluck().get(id), 'sk-demo-reads');
  assert.deepEqual(db.prepare(sql).raw().get(id), [id, 'sk-demo-reads']);
  assert.equal(db.prepare('UPDATE ai_provider_profiles SET name = ? WHERE id = ?').run('Renamed', id).changes, 1);
});

test('keys saved in plain text by older versions are encrypted at startup', () => {
  const id = addProfile('sk-demo-legacy');
  rawPrepare("INSERT INTO app_config (key, value) VALUES ('HF_TOKEN', 'hf_demo_legacy') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  assert.ok(sealStoredSecrets(rawPrepare) >= 2);
  assert.match(storedKey(id), /^enc1:/);
  assert.match(rawPrepare("SELECT value FROM app_config WHERE key = 'HF_TOKEN'").get().value, /^enc1:/);
  assert.equal(db.prepare('SELECT api_key FROM ai_provider_profiles WHERE id = ?').get(id).api_key, 'sk-demo-legacy');
  assert.equal(sealStoredSecrets(rawPrepare), 0, 'a second pass has nothing to do');
});

test('secret settings are stored sealed but read and applied plain', () => {
  setConfigValue('OPENAI_API_KEY', 'sk-demo-setting');
  assert.match(rawPrepare("SELECT value FROM app_config WHERE key = 'OPENAI_API_KEY'").get().value, /^enc1:/);
  assert.equal(getConfigValue('OPENAI_API_KEY'), 'sk-demo-setting');
  assert.equal(process.env.OPENAI_API_KEY, 'sk-demo-setting');
  setConfigValue('LLAMA_CTX_SIZE', '8192');
  assert.equal(rawPrepare("SELECT value FROM app_config WHERE key = 'LLAMA_CTX_SIZE'").get().value, '8192');
});

test('moving to a keychain key re-seals old values; a lost key empties them', () => {
  const id = addProfile(box.sealSecret('sk-demo-move'));
  const fileSealed = storedKey(id);

  // The desktop app starts passing a keychain key.
  const keychainKey = crypto.randomBytes(32).toString('base64');
  process.env.ASYNCAT_SECRET_KEY = keychainKey;
  box.resetSecretKeys();
  assert.equal(box.secretStatus().keySource, 'keychain');
  assert.equal(process.env.ASYNCAT_SECRET_KEY, undefined, 'the key is taken out of the environment');
  assert.equal(box.openSecret(fileSealed), 'sk-demo-move', 'the old file key still opens its values');
  assert.ok(sealStoredSecrets(rawPrepare) >= 1);
  assert.notEqual(storedKey(id), fileSealed);
  assert.ok(box.isSealedWithCurrentKey(storedKey(id)));

  // The keychain key is gone and so is the file: nothing can open the value.
  fs.rmSync(keyFile);
  box.resetSecretKeys();
  const keychainSealed = storedKey(id);
  assert.equal(db.prepare('SELECT api_key FROM ai_provider_profiles WHERE id = ?').get(id).api_key, '');
  sealStoredSecrets(rawPrepare);
  assert.equal(storedKey(id), keychainSealed, 'an unreadable value is left for when the key comes back');

  process.env.ASYNCAT_SECRET_KEY = keychainKey;
  box.resetSecretKeys();
  assert.equal(db.prepare('SELECT api_key FROM ai_provider_profiles WHERE id = ?').get(id).api_key, 'sk-demo-move');
});
