// electron/secretKey.js
// ─── The key that encrypts saved API keys and tokens ─────────────────────────
// Asyncat's backend encrypts saved secrets (den/src/lib/secretBox.js). The key
// for that is kept here, locked by the system keychain through Electron's
// safeStorage: macOS Keychain, Windows DPAPI, or GNOME Keyring / KWallet on
// Linux. The backend gets it in ASYNCAT_SECRET_KEY. Where no real keychain is
// available (Linux without a keyring), this returns null and the backend keeps
// its own key file instead.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';

let cached;

function keychainUsable() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // 'basic_text' means no keyring: the "encryption" uses a fixed password.
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false;
    return true;
  } catch {
    return false;
  }
}

/** The base64 key for ASYNCAT_SECRET_KEY, or null to let the backend use its key file. */
export function loadSecretKey() {
  if (cached !== undefined) return cached;
  cached = null;
  if (!keychainUsable()) return cached;

  const file = path.join(app.getPath('userData'), 'secret-key.bin');
  try {
    if (fs.existsSync(file)) {
      const key = safeStorage.decryptString(fs.readFileSync(file));
      if (Buffer.from(key, 'base64').length === 32) cached = key;
      return cached;
    }
    const key = crypto.randomBytes(32).toString('base64');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, safeStorage.encryptString(key), { mode: 0o600 });
    cached = key;
  } catch (err) {
    // Never replace a key file we can't read: the secrets it protects would
    // be lost. The backend falls back to its own key until this works again.
    console.warn('[Asyncat] Could not use the system keychain for saved keys:', err.message);
  }
  return cached;
}
