// den/src/storage/places/system.js
// System: where Asyncat keeps its own files (privacyService's dataLocations,
// plus skills, Claude Code's folder and the logs folder). Rows to see and
// copy; each is changed from the page it names, never removed here. Its size
// in the places column is what no other place counts (places.js).

import fs from 'fs';
import path from 'path';
import { runtimeDataPath, runtimeDataRoot, runtimeHome } from '../../config/runtimeConfig.js';
import { dataLocations } from '../../privacy/privacyService.js';
import { logRoot } from '../../logger.js';
import { makeId } from '../itemIds.js';
import { fileBytes, usageWithin } from '../diskUsage.js';
import { makeItem } from '../fileItems.js';

// Labels and links Files uses for dataLocations' rows.
const ROWS = {
  uploads: { route: '/files/uploads' },
  models: { route: '/models' },
  home: { label: 'Engines and Python environments', note: 'Change in Settings → Engines', route: '/settings/runtime' },
};

function rows() {
  return [
    ...dataLocations().map((row) => ({ ...row, ...ROWS[row.id] })),
    // Two files in the data folder: their own size, not the folder's.
    {
      id: 'connections', label: 'Connector and agent settings', note: 'In mcp.json and acp-agents.json', path: runtimeDataRoot(), route: '/settings/connections',
      files: ['mcp.json', 'acp-agents.json'],
    },
    { id: 'skills', label: 'Skills', note: 'Manage in Tools & Skills', path: path.join(runtimeHome(), 'skills'), route: '/tools' },
    { id: 'agent-workspace', label: 'Claude Code and Codex folder', note: 'Where they work when a chat has no project', path: runtimeDataPath('agent-workspace') },
    { id: 'logs-folder', label: 'Logs folder', note: 'Clear old logs in Logs & caches', path: logRoot(), route: '/files/logs' },
  ];
}

async function rowItem(row, { sizes = true } = {}) {
  let stat = null;
  try { stat = fs.statSync(row.path); } catch { /* not made yet */ }
  const isFolder = Boolean(stat?.isDirectory());
  let bytes = null;
  if (row.files) {
    const files = row.files.map((name) => path.join(row.path, name)).filter((file) => fs.existsSync(file));
    bytes = files.length ? files.reduce((sum, file) => sum + fileBytes(file), 0) : null;
  } else if (stat && !isFolder) {
    // The database with its -wal and -shm.
    bytes = row.id === 'database' ? ['', '-wal', '-shm'].reduce((sum, end) => sum + fileBytes(`${row.path}${end}`), 0) : stat.size;
  } else if (stat && sizes) {
    bytes = (await usageWithin(row.path))?.bytes ?? null;
  }
  return makeItem({
    id: makeId('system', row.id),
    place: 'system',
    kind: 'system',
    kindLabel: isFolder ? 'Folder' : 'File',
    title: row.label,
    hint: row.note || '',
    where: row.note || '',
    whereId: row.id,
    bytes,
    modifiedAt: stat?.mtime.toISOString() || null,
    path: row.path,
    isFolder,
    exists: Boolean(stat),
    can: { reveal: Boolean(stat), open: isFolder },
    manageRoute: row.route || null,
  });
}

export const system = {
  id: 'system',
  label: 'System',
  hint: "Asyncat's own files. You can see where they are; change them from the page named on each row.",

  // Counted as what is left of Asyncat's folders (places.js).
  pieces() {
    return [];
  },

  async list(_userId, options = {}) {
    return Promise.all(rows().map((row) => rowItem(row, options)));
  },

  resolve: {
    async system(_userId, [id]) {
      const row = rows().find((candidate) => candidate.id === id);
      if (!row) return null;
      const item = await rowItem(row);
      return { item, target: item.exists ? row.path : null };
    },
  },
};
