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
    const report = (force = false) => {
      const now = Date.now();
      if (!onProgress || (!force && now - lastReport < PROGRESS_INTERVAL_MS)) return;
      lastReport = now;
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
