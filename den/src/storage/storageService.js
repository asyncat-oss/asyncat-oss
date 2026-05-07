import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/client.js';
import { getModelsDir } from '../ai/controllers/ai/modelManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOGS_ROOT = path.join(PROJECT_ROOT, 'logs');

const LOG_CATEGORIES = {
  'backend-app': { dir: 'backend/app', label: 'Backend App' },
  'backend-error': { dir: 'backend/error', label: 'Backend Error' },
  'backend-http': { dir: 'backend/http', label: 'Backend HTTP' },
  'backend-process': { dir: 'backend/process', label: 'Backend Process' },
  'cli': { dir: 'cli', label: 'CLI' },
  'other': { dir: '.', label: 'Other Logs' },
};

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

function getDbPath() {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve('data', 'asyncat.db');
}

function getStoragePath() {
  return process.env.STORAGE_PATH
    ? path.resolve(process.env.STORAGE_PATH)
    : path.resolve('data', 'uploads');
}

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
  const asyncatHome = process.env.ASYNCAT_HOME || path.join(os.homedir(), '.asyncat');

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
      label: 'Asyncat home',
      description: 'Local agent/runtime data under ASYNCAT_HOME.',
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

function listFilesInDir(dirPath, recursive = true) {
  const files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && recursive) {
        files.push(...listFilesInDir(entryPath, recursive));
      } else if (entry.isFile()) {
        const stat = safeStat(entryPath);
        if (stat) {
          files.push({
            name: entry.name,
            relativePath: path.relative(LOGS_ROOT, entryPath),
            bytes: stat.size,
            formatted: formatBytes(stat.size),
            modifiedAt: stat.mtime.toISOString(),
          });
        }
      }
    }
  } catch {
    // ignore
  }
  return files;
}

export function getLogsSummary() {
  const categories = Object.keys(LOG_CATEGORIES).map((id) => {
    const config = LOG_CATEGORIES[id];
    const dirPath = path.join(LOGS_ROOT, config.dir);
    const usage = directoryUsage(dirPath);

    const fileList =
      id === 'other'
        ? listFilesInDir(dirPath, false)
        : listFilesInDir(dirPath, true);

    fileList.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

    return {
      id,
      label: config.label,
      ...usage,
      latestModifiedAt: fileList[0]?.modifiedAt || null,
      recentFiles: fileList.slice(0, 10),
    };
  });

  const rootUsage = directoryUsage(LOGS_ROOT);

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    totalBytes: rootUsage.bytes,
    totalFormatted: formatBytes(rootUsage.bytes),
    categories,
  };
}

export async function clearLogs() {
  const before = directoryUsage(LOGS_ROOT);

  async function clearDir(dirPath) {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await clearDir(entryPath);
      } else {
        await fsp.unlink(entryPath);
      }
    }
  }

  if (fs.existsSync(LOGS_ROOT)) {
    await clearDir(LOGS_ROOT);
  }

  const after = directoryUsage(LOGS_ROOT);
  const deletedBytes = Math.max(0, (before.bytes || 0) - (after.bytes || 0));
  const deletedFiles = Math.max(0, (before.files || 0) - (after.files || 0));

  return {
    success: true,
    action: 'clear-logs',
    path: LOGS_ROOT,
    deletedBytes,
    deletedFormatted: formatBytes(deletedBytes),
    deletedFiles,
    before,
    after,
  };
}

export function readLogFile(category, filename, lines = 200) {
  const config = LOG_CATEGORIES[category];
  if (!config) {
    throw new Error('Invalid log category');
  }

  const sanitized = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
  if (sanitized.includes('..') || path.isAbsolute(sanitized)) {
    throw new Error('Invalid filename');
  }

  const categoryDir = path.join(LOGS_ROOT, config.dir);
  const filePath = path.join(categoryDir, sanitized);

  if (!assertInside(categoryDir, filePath)) {
    throw new Error('Invalid file path');
  }

  const stat = safeStat(filePath);
  if (!stat || !stat.isFile()) {
    throw new Error('Log file not found');
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const allLines = content.split('\n');
  const start = Math.max(0, allLines.length - Math.min(1000, lines));
  const tail = allLines.slice(start).join('\n');

  return {
    success: true,
    category,
    filename: sanitized,
    lines: allLines.length,
    returnedLines: tail.split('\n').length,
    content: tail,
  };
}
