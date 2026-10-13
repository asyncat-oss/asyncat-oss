// den/src/lib/engineArchive.js — unpacking engine archives without blocking
// the backend. Extraction runs as a child process (unzip, tar, or PowerShell
// on Windows) awaited as a promise, so chats, the UI and other requests keep
// working while a large CUDA build unpacks. A cancel stops the child.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { cancelledError } from './engineDownload.js';

const isWin = process.platform === 'win32';

/** The full path of `command` on PATH (with PATHEXT on Windows), or null. */
export async function findOnPath(command, env = process.env) {
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = isWin ? ['', ...String(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      try {
        await fs.promises.access(candidate, isWin ? fs.constants.F_OK : fs.constants.X_OK);
        const stat = await fs.promises.stat(candidate);
        if (stat.isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return null;
}

/**
 * Run a program and wait for it without blocking the event loop. Rejects
 * with the end of its output when it fails, times out, or is cancelled.
 */
export function runProcess(command, args, { signal = null, timeoutMs = 10 * 60 * 1000, env = process.env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }
    let tail = '';
    let settled = false;
    const child = spawn(command, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const keep = (chunk) => { tail = (tail + chunk.toString()).slice(-2000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(tail);
    };
    const onAbort = () => {
      try { child.kill(); } catch { /* already gone */ }
      finish(cancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish(new Error(`${path.basename(command)} took longer than ${Math.round(timeoutMs / 60000)} minutes.`));
    }, timeoutMs);
    timer.unref?.();
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) finish(null);
      else finish(new Error(`${path.basename(command)} exited with code ${code}${tail.trim() ? `: ${tail.trim().slice(-600)}` : ''}`));
    });
  });
}

/**
 * Unpack a .zip, .tar.gz or .tgz into `destination` (created, emptied first).
 */
export async function extractArchive(archivePath, destination, { signal = null, timeoutMs = 10 * 60 * 1000 } = {}) {
  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.mkdir(destination, { recursive: true });
  const lower = archivePath.toLowerCase();

  if (lower.endsWith('.zip')) {
    if (isWin) {
      await runProcess('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        'Expand-Archive -LiteralPath $env:ASYNCAT_ARCHIVE_PATH -DestinationPath $env:ASYNCAT_ARCHIVE_DESTINATION -Force',
      ], {
        signal,
        timeoutMs,
        env: { ...process.env, ASYNCAT_ARCHIVE_PATH: archivePath, ASYNCAT_ARCHIVE_DESTINATION: destination },
      });
      return;
    }
    const unzip = await findOnPath('unzip');
    if (unzip) {
      await runProcess(unzip, ['-q', '-o', archivePath, '-d', destination], { signal, timeoutMs });
      return;
    }
    // macOS (and many Linux systems) ship bsdtar, which reads zip files too.
    const bsdtar = process.platform === 'darwin' ? await findOnPath('tar') : await findOnPath('bsdtar');
    if (bsdtar) {
      await runProcess(bsdtar, ['-xf', archivePath, '-C', destination], { signal, timeoutMs });
      return;
    }
    throw new Error('unzip is needed to unpack this engine. Install it with your package manager (for example "sudo apt install unzip") and try again.');
  }

  const tar = await findOnPath('tar');
  if (!tar) throw new Error('tar is needed to unpack this engine. Install it with your package manager and try again.');
  await runProcess(tar, ['-xf', archivePath, '-C', destination], { signal, timeoutMs });
}
