import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..', '..');

export function readEnv(file) {
  const full = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(full)) return {};
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  const result = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

export function writeEnv(file, obj) {
  const full = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const lines = existing.split('\n');
  const written = new Set();

  const updated = lines.map(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return raw;
    const idx = line.indexOf('=');
    if (idx < 0) return raw;
    const key = line.slice(0, idx).trim();
    if (key in obj) {
      written.add(key);
      return `${key}=${obj[key]}`;
    }
    return raw;
  });

  for (const [k, v] of Object.entries(obj)) {
    if (!written.has(k)) updated.push(`${k}=${v}`);
  }

  fs.writeFileSync(full, updated.join('\n'), 'utf8');
}

export function setKey(file, key, value) {
  const full = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, `${key}=${value}\n`, 'utf8');
    return;
  }
  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split('\n');
  let found = false;
  const updated = lines.map(raw => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return raw;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return raw;
    const k = trimmed.slice(0, idx).trim();
    if (k === key) { found = true; return `${key}=${value}`; }
    return raw;
  });
  if (!found) updated.push(`${key}=${value}`);
  fs.writeFileSync(full, updated.join('\n'), 'utf8');
}
