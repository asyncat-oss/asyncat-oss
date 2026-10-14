import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import db from '../db/client.js';
import { getModelsDir } from '../ai/controllers/ai/modelManager.js';
import { runtimeDbPath, runtimeHome, runtimeUploadsPath } from '../config/runtimeConfig.js';
import { logRoot } from '../logger.js';

// den's logs are in logRoot(), one folder per kind. The folder above it holds
// other .log files, such as the desktop app's backend-process.log.
const LOG_CATEGORIES = {
  'backend-app': { dir: 'app', label: 'Backend App' },
  'backend-error': { dir: 'error', label: 'Backend Error' },
  'backend-http': { dir: 'http', label: 'Backend HTTP' },
  'other': { dir: null, label: 'Other Logs', match: /\.log$/i },
};

function logCategoryDir(config) {
  return config.dir ? path.join(logRoot(), config.dir) : path.dirname(logRoot());
}

const DEFAULT_SCAN_LIMIT = 25000;
const MANAGED_UPLOAD_CONTAINERS = ['notes', 'kanban-attachments'];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = index === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function safeStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function safeLstat(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

function getDiskInfo(targetPath) {
  const fallbackPath = fs.existsSync(targetPath) ? targetPath : process.cwd();
  try {
    const stat = fs.statfsSync(fallbackPath);
    const blockSize = Number(stat.bsize || stat.frsize || 0);
    const totalBytes = blockSize * Number(stat.blocks || 0);
    const freeBytes = blockSize * Number(stat.bfree || 0);
    const availableBytes = blockSize * Number(stat.bavail || stat.bfree || 0);
    const usedBytes = Math.max(0, totalBytes - freeBytes);

    return {
      path: fallbackPath,
      totalBytes,
      usedBytes,
      freeBytes,
      availableBytes,
      totalFormatted: formatBytes(totalBytes),
      usedFormatted: formatBytes(usedBytes),
      freeFormatted: formatBytes(freeBytes),
      availableFormatted: formatBytes(availableBytes),
      usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
    };
  } catch {
    return null;
  }
}

function directoryUsage(rootPath, limit = DEFAULT_SCAN_LIMIT) {
  const rootStat = safeLstat(rootPath);
  if (!rootStat) {
    return {
      exists: false,
      path: rootPath,
      bytes: 0,
      formatted: '0 B',
      files: 0,
      directories: 0,
      truncated: false,
    };
  }

  if (!rootStat.isDirectory()) {
    const bytes = rootStat.size || 0;
    return {
      exists: true,
      path: rootPath,
      bytes,
      formatted: formatBytes(bytes),
      files: 1,
      directories: 0,
      truncated: false,
    };
  }

  const stack = [rootPath];
  let bytes = 0;
  let files = 0;
  let directories = 0;
  let visited = 0;
  let truncated = false;

  while (stack.length > 0) {
    if (visited >= limit) {
      truncated = true;
      break;
    }

    const current = stack.pop();
    visited += 1;

    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (visited >= limit) {
        truncated = true;
        break;
      }

      const entryPath = path.join(current, entry.name);
      const stat = safeLstat(entryPath);
      if (!stat || stat.isSymbolicLink()) continue;

      visited += 1;
      bytes += stat.size || 0;

      if (stat.isDirectory()) {
        directories += 1;
        stack.push(entryPath);
      } else {
        files += 1;
      }
    }
  }

  return {
    exists: true,
    path: rootPath,
    bytes,
    formatted: formatBytes(bytes),
    files,
    directories,
    truncated,
  };
}

const getDbPath = () => runtimeDbPath();
const getStoragePath = () => runtimeUploadsPath();

function assertInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function fileUsage(filePath) {
  const stat = safeStat(filePath);
  const bytes = stat?.size || 0;
  return {
    exists: Boolean(stat),
    path: filePath,
    bytes,
    formatted: formatBytes(bytes),
    modifiedAt: stat?.mtime?.toISOString() || null,
  };
}

function getDatabaseSummary() {
  const mainPath = getDbPath();
  const files = [
    { id: 'main', label: 'SQLite database', ...fileUsage(mainPath) },
    { id: 'wal', label: 'Write-ahead log', ...fileUsage(`${mainPath}-wal`) },
    { id: 'shm', label: 'Shared memory', ...fileUsage(`${mainPath}-shm`) },
  ];
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  let tables = [];
  try {
    const tableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();

    tables = tableRows.map(({ name }) => {
      try {
        const quotedName = `"${String(name).replace(/"/g, '""')}"`;
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quotedName}`).get();
        return { name, rows: row?.count || 0 };
      } catch {
        return { name, rows: null };
      }
    });
  } catch {
    tables = [];
  }

  return {
    path: mainPath,
    files,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    tableCount: tables.length,
    tables,
  };
}

function getPathSummaries() {
  const modelsPath = getModelsDir();
  const uploadsPath = getStoragePath();
  const asyncatHome = runtimeHome();

  return [
    {
      id: 'models',
      label: 'Local AI models',
      description: 'Downloaded GGUF/bin model files used by the built-in local runtime.',
      ...directoryUsage(modelsPath),
    },
    {
      id: 'uploads',
      label: 'Uploads and attachments',
      description: 'Local app uploads such as kanban card attachments.',
      ...directoryUsage(uploadsPath),
    },
    {
      id: 'asyncat-home',
      label: 'Managed runtime home',
      description: 'Asyncat-owned inference engines and isolated Python environments.',
      ...directoryUsage(asyncatHome),
    },
  ];
}

export function getStorageSummary() {
  const paths = getPathSummaries();
  const database = getDatabaseSummary();
  const appDataBytes = database.totalBytes + paths.reduce((sum, item) => sum + item.bytes, 0);
  const disk = getDiskInfo(database.path);

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    machine: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      homeDir: os.homedir(),
      cwd: process.cwd(),
      disk,
    },
    appData: {
      totalBytes: appDataBytes,
      totalFormatted: formatBytes(appDataBytes),
      paths,
    },
    database,
  };
}

export async function clearManagedUploads() {
  const uploadsPath = getStoragePath();
  const before = directoryUsage(uploadsPath);

  await fsp.mkdir(uploadsPath, { recursive: true });

  for (const container of MANAGED_UPLOAD_CONTAINERS) {
    const containerPath = path.join(uploadsPath, container);
    if (!assertInside(uploadsPath, containerPath)) {
      throw new Error(`Refusing to clear unsafe storage path: ${containerPath}`);
    }
    await fsp.rm(containerPath, { recursive: true, force: true });
    await fsp.mkdir(containerPath, { recursive: true });
  }

  const after = directoryUsage(uploadsPath);
  const deletedBytes = Math.max(0, (before.bytes || 0) - (after.bytes || 0));
  const deletedFiles = Math.max(0, (before.files || 0) - (after.files || 0));

  return {
    success: true,
    action: 'clear-managed-uploads',
    path: uploadsPath,
    containers: MANAGED_UPLOAD_CONTAINERS,
    deletedBytes,
    deletedFormatted: formatBytes(deletedBytes),
    deletedFiles,
    before,
    after,
  };
}

// The log files of one category: plain files only (no links, no folders).
function listLogFiles(config) {
  const dirPath = logCategoryDir(config);
  const files = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (!entry.isFile() || (config.match && !config.match.test(entry.name))) continue;
    const stat = safeLstat(path.join(dirPath, entry.name));
    if (!stat?.isFile()) continue;
    files.push({
      name: entry.name,
      relativePath: path.relative(path.dirname(logRoot()), path.join(dirPath, entry.name)),
      bytes: stat.size,
      formatted: formatBytes(stat.size),
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  return files;
}

export function getLogsSummary() {
  const categories = Object.entries(LOG_CATEGORIES).map(([id, config]) => {
    const fileList = listLogFiles(config);
    fileList.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    const bytes = fileList.reduce((sum, file) => sum + file.bytes, 0);

    return {
      id,
      label: config.label,
      exists: fs.existsSync(logCategoryDir(config)),
      path: logCategoryDir(config),
      bytes,
      formatted: formatBytes(bytes),
      files: fileList.length,
      directories: 0,
      truncated: false,
      latestModifiedAt: fileList[0]?.modifiedAt || null,
      recentFiles: fileList.slice(0, 10),
    };
  });

  const totalBytes = categories.reduce((sum, category) => sum + category.bytes, 0);

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    path: logRoot(),
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    categories,
  };
}

// Removes the files getLogsSummary lists, and nothing else in those folders.
export async function clearLogs() {
  let deletedBytes = 0;
  let deletedFiles = 0;
  for (const config of Object.values(LOG_CATEGORIES)) {
    const dirPath = logCategoryDir(config);
    for (const file of listLogFiles(config)) {
      try {
        await fsp.unlink(path.join(dirPath, file.name));
        deletedBytes += file.bytes;
        deletedFiles += 1;
      } catch {
        // gone already, or not ours to remove
      }
    }
  }

  return {
    success: true,
    action: 'clear-logs',
    path: logRoot(),
    deletedBytes,
    deletedFormatted: formatBytes(deletedBytes),
    deletedFiles,
  };
}

export function readLogFile(category, filename, lines = 200) {
  const config = Object.hasOwn(LOG_CATEGORIES, category) ? LOG_CATEGORIES[category] : null;
  if (!config) {
    throw new Error('Invalid log category');
  }

  const name = String(filename || '');
  if (!name || path.basename(name) !== name || name.includes('\0') || name === '.' || name === '..') {
    throw new Error('Invalid filename');
  }

  const listed = listLogFiles(config).some((file) => file.name === name);
  if (!listed) {
    throw new Error('Log file not found');
  }
  const filePath = path.join(logCategoryDir(config), name);

  const content = fs.readFileSync(filePath, 'utf-8');
  const allLines = content.split('\n');
  const start = Math.max(0, allLines.length - Math.min(1000, lines));
  const tail = allLines.slice(start).join('\n');

  return {
    success: true,
    category,
    filename: name,
    lines: allLines.length,
    returnedLines: tail.split('\n').length,
    content: tail,
  };
}
