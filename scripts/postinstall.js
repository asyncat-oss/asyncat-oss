#!/usr/bin/env node
// Postinstall script — creates .env files from .env.example if missing
// for local development when they are missing.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envFiles = [
  { source: 'den/.env.example', target: 'den/.env' },
  { source: 'neko/.env.example', target: 'neko/.env' },
];

const OBSOLETE_LOCAL_LOGIN_KEYS = new Set([
  'LOCAL_EMAIL',
  'LOCAL_PASSWORD',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'SOLO_EMAIL',
  'SOLO_PASSWORD',
]);

function removeObsoleteLocalLoginConfig(filePath) {
  if (!fs.existsSync(filePath)) return;
  const current = fs.readFileSync(filePath, 'utf8');
  const lines = current.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/);
    return !match || !OBSOLETE_LOCAL_LOGIN_KEYS.has(match[1]);
  });
  if (filtered.length !== lines.length) fs.writeFileSync(filePath, filtered.join('\n'));
}

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

removeObsoleteLocalLoginConfig(path.join(ROOT, 'den/.env'));
