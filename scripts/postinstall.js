#!/usr/bin/env node
// Postinstall script — creates .env files from .env.example if missing
// and hardens first-run local credentials when examples are still in place.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envFiles = [
  { source: 'den/.env.example', target: 'den/.env' },
  { source: 'neko/.env.example', target: 'neko/.env' },
];

for (const { source, target } of envFiles) {
  const sourcePath = path.join(ROOT, source);
  const targetPath = path.join(ROOT, target);

  if (!fs.existsSync(sourcePath)) {
    console.log(`[postinstall] ${source} not found, skipping ${target}`);
    continue;
  }

  if (fs.existsSync(targetPath)) {
    console.log(`[postinstall] ${target} already exists, skipping`);
    continue;
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(`[postinstall] Created ${target} from ${source}`);
  console.log(`[postinstall] Tip: Edit ${target} to customize settings`);
}

const denEnvPath = path.join(ROOT, 'den/.env');

function isWeakSecret(value) {
  if (!value) return true;
  const v = value.toLowerCase();
  return value === 'change-this-to-a-long-random-string' ||
    value === 'change_me_please' ||
    value === 'your-secret-here' ||
    value === 'changeme' ||
    v.includes('example') ||
    (v.includes('secret') && value.length < 32);
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const entries = new Map();
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

function setEnvKey(filePath, key, value) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(text)
    ? text.replace(pattern, line)
    : `${text}${text.endsWith('\n') || text.length === 0 ? '' : '\n'}${line}\n`;
  fs.writeFileSync(filePath, next);
}

if (fs.existsSync(denEnvPath)) {
  const env = readEnvFile(denEnvPath);
  if (isWeakSecret(env.get('JWT_SECRET') || '')) {
    setEnvKey(denEnvPath, 'JWT_SECRET', crypto.randomBytes(32).toString('hex'));
    console.log('[postinstall] Generated den/.env JWT_SECRET');
  }
  if (!env.get('LOCAL_PASSWORD') || env.get('LOCAL_PASSWORD') === 'changeme') {
    const password = [
      crypto.randomBytes(2).toString('hex'),
      crypto.randomBytes(2).toString('hex'),
      crypto.randomBytes(2).toString('hex'),
    ].join('-');
    setEnvKey(denEnvPath, 'LOCAL_PASSWORD', password);
    console.log('[postinstall] Generated den/.env LOCAL_PASSWORD');
  }
}
