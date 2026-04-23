import path from 'path';
import { ROOT, readEnv, setKey } from '../lib/env.js';
import { log, ok, err, warn, col } from '../lib/colors.js';

const SECRET_KEYS = ['JWT_SECRET', 'API_KEY', 'PASSWORD', 'SECRET'];
const DEN_ENV = path.join(ROOT, 'den/.env');

function isSecret(key) {
  return SECRET_KEYS.some(s => key.toUpperCase().includes(s));
}

function maskValue(key, value) {
  if (!isSecret(key)) return value;
  if (!value || value.length < 4) return '****';
  return value.slice(0, 4) + '***';
}

function show() {
  const env = readEnv('den/.env');
  const keys = Object.keys(env);

  if (keys.length === 0) {
    warn(`den/.env is empty or not found.`);
    return;
  }

  log('');
  log(`  ${col('bold', 'den/.env')}`);
  log(col('dim', '  ' + '─'.repeat(50)));

  const maxLen = Math.max(...keys.map(k => k.length));
  for (const k of keys) {
    const valDisplay = maskValue(k, env[k]);
    const keyStr = col('cyan', k.padEnd(maxLen));
    const valStr = isSecret(k) ? col('dim', valDisplay) : col('white', valDisplay || col('dim', '(empty)'));
    log(`  ${keyStr}  ${valStr}`);
  }
  log('');
}

function get(key) {
  if (!key) { warn('Usage: config get <KEY>'); return; }
  const env = readEnv('den/.env');
  if (!(key in env)) {
    warn(`Key not found: ${col('white', key)}`);
    return;
  }
  const valDisplay = maskValue(key, env[key]);
  log(`  ${col('cyan', key)} = ${col('white', valDisplay)}`);
}

function set(keyval) {
  if (!keyval) { warn('Usage: config set KEY=VALUE'); return; }
  const idx = keyval.indexOf('=');
  if (idx < 0) { warn(`Expected KEY=VALUE, got: ${col('white', keyval)}`); return; }
  const key   = keyval.slice(0, idx).trim();
  const value = keyval.slice(idx + 1).trim();
  if (!key) { warn('Key cannot be empty.'); return; }

  try {
    setKey('den/.env', key, value);
    ok(`Set ${col('cyan', key)} = ${maskValue(key, value)}`);
  } catch (e) {
    err(`Failed to write den/.env: ${e.message}`);
  }
}

export function run(args) {
  const sub = (args && args[0]) || 'show';

  if (sub === 'show') {
    show();
  } else if (sub === 'get') {
    get(args[1]);
  } else if (sub === 'set') {
    set(args[1]);
  } else {
    warn(`Unknown config subcommand: ${col('white', sub)}`);
    log(`  Usage: ${col('cyan', 'config')} ${col('dim', '<show|get <KEY>|set KEY=VALUE>')}`);
  }
}
