// den/src/agent/childEnv.js
// The environment for programs the agent starts. At startup every saved
// setting is copied into den's own environment, decrypted (db/client.js), so a
// command that inherited it could print every saved API key, password and
// webhook. Programs get den's environment without those, and without anything
// else whose name says it is a secret (GITHUB_TOKEN, AWS_SECRET_ACCESS_KEY…).

import { SECRET_CONFIG_KEYS } from '../db/sealSecrets.js';

// den's own keys: the one that opens saved secrets and the desktop bridge's.
const ALWAYS_SECRET = new Set([...SECRET_CONFIG_KEYS, 'ASYNCAT_SECRET_KEY', 'ASYNCAT_HOST_TOKEN']);
const SECRET_ENDINGS = ['TOKEN', 'SECRET', 'PASSWORD', 'PASSWD'];

/**
 * True for a variable name that holds a secret: one of Asyncat's saved
 * secrets, or a name ending in _KEY, _API_KEY, _TOKEN, _SECRET or _PASSWORD,
 * or mentioning a webhook. Matching whole words keeps TOKENIZERS_PARALLELISM
 * and SSH_AUTH_SOCK.
 */
export function isSecretEnvName(name) {
  const upper = String(name || '').toUpperCase();
  if (!upper) return false;
  if (ALWAYS_SECRET.has(upper)) return true;
  if (upper.includes('WEBHOOK')) return true;
  const words = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  const last = words.at(-1) || '';
  if (last === 'KEY' || last === 'APIKEY') return true;
  if (SECRET_ENDINGS.some((ending) => last.endsWith(ending))) return true;
  return words.includes('SECRET') || words.includes('PASSWORD');
}

/**
 * den's environment without secrets, for a program the agent runs. `keep`
 * names secrets a program needs for itself (a coding agent's own provider
 * key); `extra` is added on top, after the filtering.
 */
export function childEnv({ source = process.env, keep = [], extra = {} } = {}) {
  const kept = new Set(keep.map((name) => String(name).toUpperCase()));
  const env = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isSecretEnvName(name) && !kept.has(name.toUpperCase())) continue;
    env[name] = value;
  }
  for (const [name, value] of Object.entries(extra || {})) {
    if (value === undefined || value === null) delete env[name];
    else env[name] = String(value);
  }
  return env;
}

export default childEnv;
