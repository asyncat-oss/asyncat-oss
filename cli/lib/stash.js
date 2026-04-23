import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';

const STASH_FILE = path.join(os.homedir(), '.asyncat_stash.json');

function load() {
  try { return JSON.parse(fs.readFileSync(STASH_FILE, 'utf8')); } catch { return []; }
}

function save(items) {
  fs.writeFileSync(STASH_FILE, JSON.stringify(items, null, 2));
}

export function stashAdd(text) {
  const items = load();
  const id    = randomBytes(3).toString('hex');
  items.unshift({ id, text, ts: Date.now() });
  save(items);
  return id;
}

export function stashList() {
  return load();
}

export function stashRm(id) {
  const items = load();
  const before = items.length;
  const after  = items.filter(i => !i.id.startsWith(id));
  if (after.length === before) return false;
  save(after);
  return true;
}

export function stashClear() {
  save([]);
}
