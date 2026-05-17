// integrations/obsidian/obsidianService.js
import fs from 'fs';
import path from 'path';

export function getVaultPath() {
  return process.env.OBSIDIAN_VAULT_PATH || '';
}

export function isConfigured() {
  const vaultPath = getVaultPath();
  if (!vaultPath) return false;
  try {
    return fs.statSync(vaultPath).isDirectory();
  } catch {
    return false;
  }
}

export function getVaultStats() {
  const vaultPath = getVaultPath();
  if (!vaultPath) return { notes: 0, folders: 0 };

  let notes = 0;
  let folders = 0;

  function walk(dir, depth = 0) {
    if (depth > 10) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        folders++;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        notes++;
      }
    }
  }

  walk(vaultPath);
  return { notes, folders };
}

export function listVaultFiles(maxFiles = 300) {
  const vaultPath = getVaultPath();
  if (!vaultPath) throw new Error('Vault path not configured');

  const files = [];

  function walk(dir, base = '', depth = 0) {
    if (depth > 10 || files.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = path.join(dir, entry.name);
        let size = 0;
        let modified = null;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          modified = stat.mtime.toISOString();
        } catch { /* ignore */ }
        files.push({
          path: rel,
          name: entry.name.replace(/\.md$/, ''),
          size,
          modified,
        });
        if (files.length >= maxFiles) break;
      }
    }
  }

  walk(vaultPath);
  return files;
}
