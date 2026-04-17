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
        return {
          id: filename,
          name: filename.replace(/\.(gguf|bin)$/, ''),
          filename,
          path: filePath,
          sizeBytes: stat.size,
          sizeGb: +(stat.size / 1024 ** 3).toFixed(2),
          sizeFormatted: formatBytes(stat.size),
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
  return {
    id: filename,
    name: filename.replace(/\.(gguf|bin)$/, ''),
    filename,
    path: filePath,
    sizeBytes: stat.size,
    sizeGb: +(stat.size / 1024 ** 3).toFixed(2),
    sizeFormatted: formatBytes(stat.size),
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

  return {
    modelsDir: MODELS_DIR,
    modelCount: models.length,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    totalGb: +(totalBytes / 1024 ** 3).toFixed(2),
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

export { MODELS_DIR };
