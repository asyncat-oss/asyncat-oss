// den/src/lib/engineDownload.js — downloads for managed engines (llama.cpp,
// Whisper, stable-diffusion.cpp and the CUDA runtime that goes with them).
//
// - No total time limit: a slow but working connection may take as long as it
//   needs. A download fails only when no bytes arrive for a while.
// - Interrupted downloads resume: bytes go to `<file>.part`, which is kept
//   when a download fails or is cancelled, and the next attempt asks the
//   server for the rest (HTTP Range).
// - Writes go through stream/promises pipeline, so a full disk fails the
//   download with a clear message instead of crashing the backend.

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

export const DOWNLOAD_INACTIVITY_MS = 60_000;
const PROGRESS_INTERVAL_MS = 250;

export function cancelledError(message = 'The install was cancelled.') {
  return Object.assign(new Error(message), { code: 'CANCELLED', cancelled: true });
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw cancelledError();
}

/** A plain-words error for a failed write, or the error itself. */
export function friendlyWriteError(error) {
  if (error?.code === 'ENOSPC') {
    return Object.assign(new Error('The disk is full, so the download could not be saved. Free up some space and try again.'), { code: 'DISK_FULL' });
  }
  if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EROFS') {
    return Object.assign(new Error(`Asyncat isn't allowed to write to ${path.dirname(error.path || '') || 'its engine folder'}.`), { code: error.code });
  }
  return error;
}

function retryable(message, code) {
  return Object.assign(new Error(message), { code, retryable: true });
}

function isRetryable(error) {
  if (error?.retryable) return true;
  // fetch() network failures ("fetch failed", connection reset, DNS hiccup).
  const code = error?.cause?.code || error?.code;
  return error?.name === 'TypeError'
    || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code);
}

function contentRange(header) {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(String(header || '').trim());
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: match[3] === '*' ? 0 : Number(match[3]) };
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

async function partialSize(file) {
  try {
    return (await fs.promises.stat(file)).size;
  } catch {
    return 0;
  }
}

async function downloadOnce(url, destination, { signal, onProgress, inactivityMs, fetchImpl, headers, expectedSize }) {
  const partial = `${destination}.part`;
  let start = await partialSize(partial);
  if (expectedSize && start > expectedSize) {
    await fs.promises.rm(partial, { force: true });
    start = 0;
  }
  if (expectedSize && start === expectedSize) {
    await fs.promises.rename(partial, destination);
    onProgress?.({ downloadedBytes: start, totalBytes: expectedSize, percent: 100 });
    return { bytes: start, resumedFrom: start };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let stalled = false;
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, inactivityMs);
  };

  try {
    arm();
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'asyncat-installer', ...headers, ...(start > 0 ? { Range: `bytes=${start}-` } : {}) },
      signal: controller.signal,
    });

    if (response.status === 416 && start > 0) {
      // Nothing past what we already have: the partial file is either the
      // whole file or doesn't belong to this one.
      const total = contentRange(response.headers.get('content-range'))?.total || 0;
      if (total && total === start) {
        await fs.promises.rename(partial, destination);
        return { bytes: start, resumedFrom: start };
      }
      await fs.promises.rm(partial, { force: true });
      throw retryable('The partial download did not match; starting it again.', 'RESTART');
    }
    if (!response.ok) {
      const message = `Download failed: HTTP ${response.status}`;
      if (response.status >= 500 || response.status === 429 || response.status === 408) throw retryable(message, 'HTTP');
      throw Object.assign(new Error(message), { code: 'HTTP', status: response.status });
    }
    if (!response.body) throw retryable('Download failed: empty response body', 'EMPTY');

    let append = false;
    let total = 0;
    if (start > 0 && response.status === 206) {
      const range = contentRange(response.headers.get('content-range'));
      if (!range || range.start !== start) {
        await fs.promises.rm(partial, { force: true });
        throw retryable('The server sent a different part of the file; starting it again.', 'RESTART');
      }
      append = true;
      total = range.total || (start + (Number(response.headers.get('content-length')) || 0));
    } else {
      // The server ignored the range (200): start from the beginning.
      start = 0;
      total = Number(response.headers.get('content-length')) || 0;
    }
    if (!total && expectedSize) total = expectedSize;

    let received = start;
    let lastReport = 0;
    let reportedBytes = -1;
    const report = (force = false) => {
      const now = Date.now();
      // Always report the first bytes of a response, then at most every 250 ms.
      const firstData = reportedBytes <= start && received > start;
      if (!onProgress || (!force && !firstData && now - lastReport < PROGRESS_INTERVAL_MS)) return;
      lastReport = now;
      reportedBytes = received;
      onProgress({ downloadedBytes: received, totalBytes: total, percent: total ? Math.min(100, (received / total) * 100) : null });
    };
    report(true);
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        arm();
        report();
        callback(null, chunk);
      },
    });

    await pipeline(
      Readable.fromWeb(response.body),
      meter,
      fs.createWriteStream(partial, { flags: append ? 'a' : 'w' }),
    );
    if (total && received !== total) throw retryable('The download ended early.', 'INCOMPLETE');
    report(true);
    await fs.promises.rename(partial, destination);
    return { bytes: received, resumedFrom: append ? start : 0 };
  } catch (error) {
    if (signal?.aborted) throw cancelledError();
    if (stalled) {
      throw retryable(`The download stalled: nothing arrived for ${Math.round(inactivityMs / 1000)} seconds.`, 'STALLED');
    }
    throw friendlyWriteError(error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Download `url` to `destination`. Resumes from `<destination>.part` when an
 * earlier attempt left one, retries network hiccups and stalls (resuming each
 * time), and fails when nothing arrives for `inactivityMs`. The `.part` file is
 * kept on failure or cancel so the next attempt can resume.
 * Resolves { bytes, resumedFrom }.
 */
export async function downloadWithResume(url, destination, {
  signal = null,
  onProgress = null,
  inactivityMs = DOWNLOAD_INACTIVITY_MS,
  retries = 3,
  fetchImpl = fetch,
  headers = {},
  expectedSize = 0,
} = {}) {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await downloadOnce(url, destination, { signal, onProgress, inactivityMs, fetchImpl, headers, expectedSize });
    } catch (error) {
      if (error.cancelled) throw error;
      if (!isRetryable(error) || attempt >= retries) {
        if (isRetryable(error) && await partialSize(`${destination}.part`) > 0) {
          error.message = `${error.message} The part already downloaded is kept, so trying again continues from there.`;
        }
        throw error;
      }
      await sleep(Math.min(8000, 1000 * 2 ** attempt), signal);
    }
  }
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// ─── Free space ───────────────────────────────────────────────────────────────

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 * 1024 * 1024) return `${Math.round(value / (1024 * 1024))} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Free bytes for this user on the disk holding `dir` (or its nearest existing parent). */
export async function freeBytes(dir, { statfs = fs.promises.statfs } = {}) {
  let current = path.resolve(dir);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const stats = await statfs(current);
  return Number(stats.bavail) * Number(stats.bsize);
}

/**
 * Room an engine install needs at its peak: the rest of the download, the
 * unpacked files (archives here unpack to about three times their size) and
 * some headroom.
 */
export function installSpaceNeeded(archiveBytes, alreadyDownloaded = 0) {
  const size = Math.max(0, Number(archiveBytes) || 0);
  return Math.max(0, size - (Number(alreadyDownloaded) || 0)) + size * 3 + 100 * 1024 * 1024;
}

/**
 * Stop before writing anything when the disk can't hold `neededBytes`. When
 * free space can't be read (an unusual filesystem), the install goes ahead.
 */
export async function ensureFreeSpace(dir, neededBytes, what, { statfs } = {}) {
  let free;
  try {
    free = await freeBytes(dir, statfs ? { statfs } : undefined);
  } catch {
    return null;
  }
  if (free < neededBytes) {
    throw Object.assign(
      new Error(`There isn't enough free disk space for ${what}: it needs about ${formatBytes(neededBytes)}, and ${formatBytes(free)} is free on the disk that holds ${dir}. Free up some space and try again.`),
      { code: 'NO_SPACE', neededBytes, freeBytes: free },
    );
  }
  return free;
}

// ─── Checksums ────────────────────────────────────────────────────────────────

/** GitHub's asset `digest` ("sha256:<hex>") as lowercase hex, or null. */
export function digestSha256(digest) {
  const match = String(digest || '').trim().match(/^sha256:([0-9a-f]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * The SHA-256 for `assetName` in a checksum file: `sha256sum` output
 * ("<hex>  name" or "<hex> *name"), BSD style ("SHA256 (name) = <hex>"), or a
 * per-file `.sha256` holding just the hex.
 */
export function parseChecksumFile(text, assetName) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    const gnu = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line);
    if (gnu && path.basename(gnu[2].trim()) === assetName) return gnu[1].toLowerCase();
    const bsd = /^SHA256\s*\((.+)\)\s*=\s*([0-9a-f]{64})$/i.exec(line);
    if (bsd && path.basename(bsd[1].trim()) === assetName) return bsd[2].toLowerCase();
  }
  if (lines.length === 1 && /^[0-9a-f]{64}$/i.test(lines[0])) return lines[0].toLowerCase();
  return null;
}

/** Checksum files in a release that may list `assetName`, the most specific first. */
export function findChecksumAssets(release, assetName) {
  const assets = (release?.assets || []).filter(asset => asset?.browser_download_url && asset.name !== assetName);
  const lower = String(assetName || '').toLowerCase();
  const own = assets.filter(asset => {
    const name = String(asset.name).toLowerCase();
    return name === `${lower}.sha256` || name === `${lower}.sha256sum` || name === `${lower}.sha256.txt`;
  });
  const shared = assets.filter(asset => !own.includes(asset)
    && /(sha256sums?|checksums?)(\.txt)?$|sha256.*\.txt$/i.test(String(asset.name))
    && (Number(asset.size) || 0) < 1024 * 1024);
  return [...own, ...shared];
}

async function fetchSmallText(url, signal) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'asyncat-installer' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return text.slice(0, 1024 * 1024);
}

/**
 * Check a downloaded release asset against GitHub's SHA-256 `digest` for it
 * or, when GitHub has none, a checksum file published in the same release.
 * On a mismatch the file is deleted and the install refused. Without any
 * published checksum, resolves { verified: false } and the caller decides.
 */
export async function verifyDownloadedAsset({ file, asset, release, signal = null, fetchText = fetchSmallText }) {
  let expected = digestSha256(asset?.digest);
  let source = expected ? 'GitHub' : null;
  if (!expected) {
    for (const checksumAsset of findChecksumAssets(release, asset?.name)) {
      try {
        expected = parseChecksumFile(await fetchText(checksumAsset.browser_download_url, signal), asset.name);
      } catch (error) {
        if (signal?.aborted) throw cancelledError();
        console.warn(`[runtime] Could not read ${checksumAsset.name}: ${error.message}`);
      }
      if (expected) {
        source = checksumAsset.name;
        break;
      }
    }
  }
  if (!expected) return { verified: false, source: null, sha256: null };

  const actual = await sha256File(file);
  if (actual !== expected) {
    await fs.promises.rm(file, { force: true });
    await fs.promises.rm(`${file}.part`, { force: true });
    throw Object.assign(
      new Error(`The download of ${asset.name} doesn't match its published checksum, so it was deleted and not installed. Try again; if it keeps happening, tell the Asyncat developers.`),
      { code: 'CHECKSUM_MISMATCH', expected, actual },
    );
  }
  return { verified: true, source, sha256: actual };
}
