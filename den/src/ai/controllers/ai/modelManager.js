// modelManager.js — Built-in GGUF model manager
// Downloads, lists, and deletes GGUF models stored in data/models/
// Serves models via llama.cpp server (if installed) or reports them for use with Ollama

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// Resolve data/models relative to this file so it's always den/data/models
// regardless of what directory the server is started from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = process.env.MODELS_PATH
  ? path.resolve(process.env.MODELS_PATH)
  : path.resolve(__dirname, '../../../../data/models');
// __dirname = den/src/ai/controllers/ai  →  ../../../../  = den/  →  den/data/models

// Ensure models directory exists
fs.mkdirSync(MODELS_DIR, { recursive: true });

/**
 * Lightweight pure-JS GGUF metadata parser.
 * Reads just enough of the binary header to extract key metadata like context_length.
 */
function extractGgufMetadata(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024 * 512); // read first 512KB
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    if (bytesRead < 4 || buffer.toString('utf8', 0, 4) !== 'GGUF') {
      return null;
    }

    let offset = 4;
    const version = buffer.readUInt32LE(offset);
    offset += 4;
    
    const tensorCount = Number(buffer.readBigUInt64LE(offset));
    offset += 8;
    
    const kvCount = Number(buffer.readBigUInt64LE(offset));
    offset += 8;

    const metadata = {};

    for (let i = 0; i < kvCount; i++) {
      if (offset + 8 > bytesRead) break;
      const keyLen = Number(buffer.readBigUInt64LE(offset));
      offset += 8;
      
      if (offset + keyLen > bytesRead) break;
      const key = buffer.toString('utf8', offset, offset + keyLen);
      offset += keyLen;

      if (offset + 4 > bytesRead) break;
      const valueType = buffer.readUInt32LE(offset);
      offset += 4;

      let value = null;
      switch (valueType) {
        case 0: value = buffer.readUInt8(offset); offset += 1; break;
        case 1: value = buffer.readInt8(offset); offset += 1; break;
        case 2: value = buffer.readUInt16LE(offset); offset += 2; break;
        case 3: value = buffer.readInt16LE(offset); offset += 2; break;
        case 4: value = buffer.readUInt32LE(offset); offset += 4; break;
        case 5: value = buffer.readInt32LE(offset); offset += 4; break;
        case 6: value = buffer.readFloatLE(offset); offset += 4; break;
        case 7: value = buffer.readUInt8(offset) === 1; offset += 1; break;
        case 8: // string
          const strLen = Number(buffer.readBigUInt64LE(offset));
          offset += 8;
          if (offset + strLen <= bytesRead) {
            value = buffer.toString('utf8', offset, offset + strLen);
          }
          offset += strLen;
          break;
        case 9: // array
          const arrType = buffer.readUInt32LE(offset);
          offset += 4;
          const arrLen = Number(buffer.readBigUInt64LE(offset));
          offset += 8;
          if (arrType < 8) {
            let itemSize = 1;
            if (arrType === 2 || arrType === 3) itemSize = 2;
            if (arrType >= 4 && arrType <= 6) itemSize = 4;
            if (arrType >= 10) itemSize = 8;
            offset += arrLen * itemSize;
          } else if (arrType === 8) {
            for (let j = 0; j < arrLen; j++) {
              if (offset + 8 > bytesRead) break;
              const slen = Number(buffer.readBigUInt64LE(offset));
              offset += 8 + slen;
            }
          }
          break;
        case 10: value = Number(buffer.readBigUInt64LE(offset)); offset += 8; break;
        case 11: value = Number(buffer.readBigInt64LE(offset)); offset += 8; break;
        case 12: value = buffer.readDoubleLE(offset); offset += 8; break;
        default: break;
      }
      
      if (value !== null) {
        metadata[key] = value;
      }
    }
    return metadata;
  } catch (err) {
    return null;
  }
}

function getContextLength(meta = {}) {
  const preferredKeys = [
    'llama.context_length',
    'qwen2.context_length',
    'qwen3.context_length',
    'qwen3moe.context_length',
    'gemma.context_length',
    'gemma2.context_length',
    'gemma3.context_length',
    'phi3.context_length',
    'phi4.context_length',
    'mistral.context_length',
    'deepseek2.context_length',
    'general.context_length',
  ];

  for (const key of preferredKeys) {
    const value = Number(meta[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  for (const [key, raw] of Object.entries(meta)) {
    if (!key.endsWith('.context_length')) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return null;
}

// Active downloads map: { downloadId -> { progress, total, status, abortController } }
const activeDownloads = new Map();

/**
 * List all GGUF models in the models directory.
 */
export function listModels() {
  try {
    const files = fs.readdirSync(MODELS_DIR);
    return files
      .filter(f => f.endsWith('.gguf') || f.endsWith('.bin'))
      .map(filename => {
        const filePath = path.join(MODELS_DIR, filename);
        const stat = fs.statSync(filePath);
        const meta = extractGgufMetadata(filePath) || {};
        return {
          id: filename,
          name: filename.replace(/\.(gguf|bin)$/, ''),
          filename,
          path: filePath,
          sizeBytes: stat.size,
          sizeGb: +(stat.size / 1024 ** 3).toFixed(2),
          sizeFormatted: formatBytes(stat.size),
          contextLength: getContextLength(meta),
          architecture: meta['general.architecture'] || 'unknown',
          parameterCount: meta['general.parameter_count'] ? formatBytes(meta['general.parameter_count']).replace(/B/g, '') + ' Params' : '',
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.error('Failed to list models:', err);
    return [];
  }
}

/**
 * Get info about a single model file.
 */
export function getModel(filename) {
  const filePath = path.join(MODELS_DIR, path.basename(filename));
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const meta = extractGgufMetadata(filePath) || {};
  return {
    id: filename,
    name: filename.replace(/\.(gguf|bin)$/, ''),
    filename,
    path: filePath,
    sizeBytes: stat.size,
    sizeGb: +(stat.size / 1024 ** 3).toFixed(2),
    sizeFormatted: formatBytes(stat.size),
    contextLength: getContextLength(meta),
    architecture: meta['general.architecture'] || 'unknown',
    parameterCount: meta['general.parameter_count'] ? formatBytes(meta['general.parameter_count']).replace(/B/g, '') + ' Params' : '',
    createdAt: stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
  };
}

/**
 * Delete a model file.
 */
export function deleteModel(filename) {
  const filePath = path.join(MODELS_DIR, path.basename(filename));
  if (!fs.existsSync(filePath)) {
    throw new Error(`Model not found: ${filename}`);
  }
  fs.unlinkSync(filePath);
  return { success: true };
}

/**
 * Start downloading a model from a URL.
 * Returns a downloadId that can be used to track progress.
 * Progress is streamed via SSE from the route handler.
 */
export async function startDownload(url, filename, onProgress) {
  // Sanitize filename
  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeFilename.endsWith('.gguf') && !safeFilename.endsWith('.bin')) {
    throw new Error('Only .gguf and .bin model files are supported');
  }

  const destPath = path.join(MODELS_DIR, safeFilename);
  const downloadId = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const abortController = new AbortController();
  activeDownloads.set(downloadId, {
    filename: safeFilename,
    url,
    progress: 0,
    total: 0,
    downloaded: 0,
    status: 'downloading',
    abortController,
    startedAt: new Date().toISOString(),
  });

  // Run download in background
  (async () => {
    try {
      const response = await fetch(url, { signal: abortController.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const total = parseInt(response.headers.get('content-length') || '0', 10);
      const dl = activeDownloads.get(downloadId);
      if (dl) dl.total = total;

      const writer = createWriteStream(destPath);
      let downloaded = 0;
      let lastProgressReport = 0;

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        writer.write(Buffer.from(value));
        downloaded += value.length;

        const dl = activeDownloads.get(downloadId);
        if (dl) {
          dl.downloaded = downloaded;
          dl.progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        }

        // Call progress callback every 1MB or 1%
        const now = Date.now();
        if (now - lastProgressReport > 500) {
          lastProgressReport = now;
          onProgress?.({
            downloadId,
            filename: safeFilename,
            downloaded,
            total,
            progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            downloadedFormatted: formatBytes(downloaded),
            totalFormatted: total > 0 ? formatBytes(total) : 'unknown',
            status: 'downloading',
          });
        }
      }

      writer.end();
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const finalDl = activeDownloads.get(downloadId);
      if (finalDl) {
        finalDl.status = 'complete';
        finalDl.progress = 100;
      }

      onProgress?.({
        downloadId,
        filename: safeFilename,
        downloaded,
        total,
        progress: 100,
        status: 'complete',
      });

    } catch (err) {
      // Clean up partial file
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch {}
      }

      const dl = activeDownloads.get(downloadId);
      if (dl) dl.status = err.name === 'AbortError' ? 'cancelled' : 'error';

      onProgress?.({
        downloadId,
        filename: safeFilename,
        status: err.name === 'AbortError' ? 'cancelled' : 'error',
        error: err.message,
      });
    } finally {
      // Keep in map for 30s so client can read final status, then clean up
      setTimeout(() => activeDownloads.delete(downloadId), 30000);
    }
  })();

  return downloadId;
}

/**
 * Cancel an active download.
 */
export function cancelDownload(downloadId) {
  const dl = activeDownloads.get(downloadId);
  if (!dl) throw new Error('Download not found');
  dl.abortController.abort();
  dl.status = 'cancelled';
  return { success: true };
}

/**
 * Get status of an active download.
 */
export function getDownloadStatus(downloadId) {
  const dl = activeDownloads.get(downloadId);
  if (!dl) return null;
  return {
    downloadId,
    filename: dl.filename,
    url: dl.url,
    progress: dl.progress,
    downloaded: dl.downloaded,
    total: dl.total,
    downloadedFormatted: formatBytes(dl.downloaded),
    totalFormatted: dl.total > 0 ? formatBytes(dl.total) : 'unknown',
    status: dl.status,
    startedAt: dl.startedAt,
  };
}

/**
 * List all active downloads.
 */
export function listActiveDownloads() {
  return Array.from(activeDownloads.entries()).map(([id, dl]) => ({
    downloadId: id,
    filename: dl.filename,
    progress: dl.progress,
    downloaded: dl.downloaded,
    total: dl.total,
    downloadedFormatted: formatBytes(dl.downloaded),
    totalFormatted: dl.total > 0 ? formatBytes(dl.total) : 'unknown',
    status: dl.status,
    startedAt: dl.startedAt,
  }));
}

/**
 * Get the models directory path.
 */
export function getModelsDir() {
  return MODELS_DIR;
}

/**
 * Get disk usage info for the models directory.
 */
export function getStorageInfo() {
  const models = listModels();
  const totalBytes = models.reduce((sum, m) => sum + m.sizeBytes, 0);
  let disk = null;

  try {
    const stat = fs.statfsSync(MODELS_DIR);
    const blockSize = Number(stat.bsize || stat.frsize || 0);
    const blocks = Number(stat.blocks || 0);
    const availableBlocks = Number(stat.bavail || stat.bfree || 0);
    const freeBlocks = Number(stat.bfree || availableBlocks || 0);
    const diskTotalBytes = blockSize * blocks;
    const diskAvailableBytes = blockSize * availableBlocks;
    const diskFreeBytes = blockSize * freeBlocks;
    const diskUsedBytes = Math.max(0, diskTotalBytes - diskFreeBytes);

    if (Number.isFinite(diskTotalBytes) && diskTotalBytes > 0) {
      disk = {
        totalBytes: diskTotalBytes,
        availableBytes: diskAvailableBytes,
        freeBytes: diskFreeBytes,
        usedBytes: diskUsedBytes,
        totalFormatted: formatBytes(diskTotalBytes),
        availableFormatted: formatBytes(diskAvailableBytes),
        freeFormatted: formatBytes(diskFreeBytes),
        usedFormatted: formatBytes(diskUsedBytes),
        usedPercent: Math.round((diskUsedBytes / diskTotalBytes) * 100),
        modelPercent: Math.round((totalBytes / diskTotalBytes) * 1000) / 10,
      };
    }
  } catch {
    disk = null;
  }

  return {
    modelsDir: MODELS_DIR,
    modelCount: models.length,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    totalGb: +(totalBytes / 1024 ** 3).toFixed(2),
    disk,
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1e6;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1e3;
  return `${kb.toFixed(0)} KB`;
}

export { MODELS_DIR };
