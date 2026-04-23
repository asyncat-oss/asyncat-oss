#!/usr/bin/env node
// Postinstall script — creates .env files from .env.example if missing
import fs from 'fs';
import path from 'path';
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