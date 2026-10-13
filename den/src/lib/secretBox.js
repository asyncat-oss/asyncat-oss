/**
 * Encrypt saved secrets (API keys, sign-in tokens, passwords) so the database
 * file alone gives nothing away: copying it, syncing it or attaching it to a
 * bug report no longer leaks your keys.
 *
 * The desktop app keeps the encryption key in the system keychain (macOS
 * Keychain, Windows DPAPI, GNOME Keyring or KWallet) and passes it in
 * ASYNCAT_SECRET_KEY. Without the desktop app, or on Linux without a keyring,
 * the key lives in data/secret.key, readable only by you.
 *
 * Sealed values look like enc1:<key id>:<iv>:<tag>:<ciphertext>. Reads open
 * them automatically (see db/client.js), so only writes call sealSecret().
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { runtimeDataPath } from '../config/runtimeConfig.js';

const PREFIX = 'enc1:';
const SEALED = /^enc1:([0-9a-f]{8}):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]*)$/;

let keys = null;       // [{ id, key, source }], the first one seals
let warnedLost = false;

function keyId(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

function parseKey(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  return key.length === 32 ? key : null;
}

function keyFilePath() {
  return runtimeDataPath('secret.key');
}

function readKeyFile() {
  try {
    return parseKey(fs.readFileSync(keyFilePath(), 'utf8'));
  } catch {
    return null;
  }
}

function createKeyFile() {
  const key = crypto.randomBytes(32);
  const file = keyFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, key.toString('base64'), { mode: 0o600, flag: 'wx' });
  return key;
}

/**
 * The keys this process can use. The keychain key (from the desktop app)
 * seals new values; a key file left from running without it still opens
 * what it sealed, so those values can be moved over.
 */
export function loadSecretKeys({ env = process.env } = {}) {
  if (keys) return keys;
  const found = [];
  const fromEnv = parseKey(env.ASYNCAT_SECRET_KEY);
  // Child processes (the agent's commands) must not inherit the key.
  delete env.ASYNCAT_SECRET_KEY;
  if (fromEnv) found.push({ id: keyId(fromEnv), key: fromEnv, source: 'keychain' });

  let fileKey = readKeyFile();
  if (!fileKey && !fromEnv) {
    try {
      fileKey = createKeyFile();
    } catch {
      fileKey = readKeyFile(); // another process made it first
    }
  }
  if (fileKey && !found.some((k) => k.id === keyId(fileKey))) {
    found.push({ id: keyId(fileKey), key: fileKey, source: 'file' });
  }
  keys = found;
  return keys;
}

/** Forget loaded keys (tests). */
export function resetSecretKeys() {
  keys = null;
  warnedLost = false;
}

export function secretStatus() {
  const [primary] = loadSecretKeys();
  return { encrypted: Boolean(primary), keySource: primary?.source || null };
}

export function isSealed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** True when a value is sealed with the key new values are sealed with. */
export function isSealedWithCurrentKey(value) {
  const [primary] = loadSecretKeys();
  const match = typeof value === 'string' ? SEALED.exec(value) : null;
  return Boolean(match && primary && match[1] === primary.id);
}

/** Encrypt a secret for saving. Empty values and sealed values pass through. */
export function sealSecret(value) {
  if (value === null || value === undefined || value === '') return value;
  const text = String(value);
  if (isSealed(text)) return text;
  const [primary] = loadSecretKeys();
  if (!primary) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', primary.key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${primary.id}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * The plain value of a saved secret. Anything that isn't sealed comes back
 * unchanged. A value sealed with a key this computer no longer has comes
 * back empty, so the app asks for the key again instead of sending garbage.
 */
export function openSecret(value) {
  if (!isSealed(value)) return value;
  const match = SEALED.exec(value);
  if (!match) return value;
  const entry = loadSecretKeys().find((k) => k.id === match[1]);
  if (!entry) {
    if (!warnedLost) {
      warnedLost = true;
      console.warn('[secrets] Some saved keys were encrypted with a key this computer no longer has. Enter them again in Settings.');
    }
    return '';
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', entry.key, Buffer.from(match[2], 'base64'));
    decipher.setAuthTag(Buffer.from(match[3], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(match[4], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

function openValue(value) {
  return typeof value === 'string' && value.startsWith(PREFIX) ? openSecret(value) : value;
}

/** Open every sealed value in a result row (object, array or single value). */
export function openRow(row) {
  if (typeof row === 'string') return openValue(row);
  if (!row || typeof row !== 'object') return row;
  if (Array.isArray(row)) {
    let copy = null;
    for (let i = 0; i < row.length; i += 1) {
      const value = row[i];
      if (typeof value === 'string' && value.startsWith(PREFIX)) {
        copy ||= row.slice();
        copy[i] = openSecret(value);
      }
    }
    return copy || row;
  }
  for (const key in row) {
    const value = row[key];
    if (typeof value === 'string' && value.startsWith(PREFIX)) row[key] = openSecret(value);
  }
  return row;
}
