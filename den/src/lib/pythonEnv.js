// den/src/lib/pythonEnv.js — Asyncat-managed Python environments (Piper, MLX
// and llama-cpp-python) built beside the working one and swapped in at the end.
//
// A rebuild used to move the working environment aside and build the new one
// in its place for 10–30 minutes; quitting in between left neither working.
// Now the new environment is built in `python.install-<id>` next to the live
// `python`, checked, and only then swapped in, so the working one is untouched
// until the very end (startup clean-up removes an abandoned build).
//
// A venv records its own path in a few files (console-script shebangs, the
// activate scripts, pyvenv.cfg; on Windows inside the .exe launchers pip
// writes), so before the swap those are rewritten from the build folder to
// the final one.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { cancelledError, throwIfAborted } from './engineDownload.js';

const isWin = process.platform === 'win32';
export const VENV_MARKER_FILE = 'asyncat-venv.json';

export function pythonInVenv(venvDir, platform = process.platform) {
  return platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

/**
 * pip's Windows launchers (piper.exe, pip.exe) are a small program, then a
 * `#!"C:\...\python.exe"` line, then a zip with the script. The zip's offsets
 * are counted from its end, so the shebang line can change length safely.
 * Returns the rewritten launcher, or null when it isn't one or doesn't name
 * `from`.
 */
export function rewriteLauncherShebang(buffer, from, to) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) return null;
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const zipStart = eocd - cdSize - cdOffset;
  if (zipStart <= 0) return null;
  const shebangStart = buffer.lastIndexOf(Buffer.from('#!'), zipStart - 1);
  if (shebangStart < 0) return null;
  const shebang = buffer.subarray(shebangStart, zipStart).toString('utf8');
  if (!shebang.includes(from)) return null;
  return Buffer.concat([
    buffer.subarray(0, shebangStart),
    Buffer.from(shebang.split(from).join(to), 'utf8'),
    buffer.subarray(zipStart),
  ]);
}

/**
 * Rewrite the build folder's path to the final one inside a venv (scripts
 * folder and pyvenv.cfg). Returns the files changed.
 */
export async function relocateVenv(venvDir, fromDir, toDir) {
  const variants = [[fromDir, toDir]];
  if (fromDir.includes('\\')) variants.push([fromDir.replace(/\\/g, '/'), toDir.replace(/\\/g, '/')]);
  const changed = [];
  const scriptsDir = path.join(venvDir, isWin ? 'Scripts' : 'bin');
  const files = [path.join(venvDir, 'pyvenv.cfg')];
  try {
    for (const entry of await fs.promises.readdir(scriptsDir, { withFileTypes: true })) {
      if (entry.isFile()) files.push(path.join(scriptsDir, entry.name));
    }
  } catch { /* no scripts folder */ }

  for (const file of files) {
    let stat;
    try {
      stat = await fs.promises.lstat(file);
    } catch {
      continue;
    }
    // The interpreter itself is a link or a copy of the base Python: leave it.
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) continue;
    const buffer = await fs.promises.readFile(file);
    let next = null;
    if (/\.exe$/i.test(file)) {
      next = buffer;
      for (const [from, to] of variants) next = rewriteLauncherShebang(next, from, to) || next;
      if (next === buffer) next = null;
    } else if (!buffer.subarray(0, 8000).includes(0)) {
      let text = buffer.toString('utf8');
      const before = text;
      for (const [from, to] of variants) text = text.split(from).join(to);
      if (text !== before) next = Buffer.from(text, 'utf8');
    }
    if (next) {
      await fs.promises.writeFile(file, next);
      await fs.promises.chmod(file, stat.mode);
      changed.push(file);
    }
  }
  return changed;
}

/** Run a command, stream its lines, and stop it on cancel or timeout. */
export function runPythonCommand(command, args, { env = process.env, timeoutMs = 20 * 60 * 1000, onLine = null, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }
    let settled = false;
    let tail = '';
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(tail);
    };
    const onAbort = () => {
      try { child.kill(); } catch { /* gone */ }
      finish(cancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* gone */ }
      finish(new Error(`Timed out while running ${path.basename(command)}.`));
    }, timeoutMs);
    const onChunk = (chunk) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-1500);
      if (onLine) text.split(/[\r\n]+/).map(line => line.trim()).filter(Boolean).forEach(onLine);
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.once('error', finish);
    child.once('close', (code) => {
      if (code === 0) finish(null);
      else finish(new Error(`${path.basename(command)} exited with code ${code}: ${tail.trim().slice(-800)}`));
    });
  });
}

/**
 * Build a managed environment beside `finalDir` and swap it in.
 *   build(stagingDir)  creates and fills the venv at stagingDir and checks it
 *   swap(staging, final)  puts it in place (swapManagedDirectory)
 *   beforeSwap()       optional: stop whatever runs from the live one
 * Nothing at `finalDir` changes until build() has succeeded. Resolves with
 * build()'s result.
 */
export async function buildManagedVenv({ finalDir, build, swap, beforeSwap = null, signal = null, marker = {} }) {
  const stagingDir = path.join(path.dirname(finalDir), `${path.basename(finalDir)}.install-${randomUUID()}`);
  await fs.promises.mkdir(path.dirname(finalDir), { recursive: true });
  try {
    const result = await build(stagingDir);
    throwIfAborted(signal);
    await relocateVenv(stagingDir, stagingDir, finalDir);
    await fs.promises.writeFile(
      path.join(stagingDir, VENV_MARKER_FILE),
      `${JSON.stringify({ complete: true, builtAt: new Date().toISOString(), ...marker }, null, 2)}\n`,
    );
    throwIfAborted(signal);
    if (beforeSwap) await beforeSwap();
    swap(stagingDir, finalDir);
    return result;
  } finally {
    await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The first Python 3 with the venv module, checked without blocking. */
export async function findPythonWithVenv({ candidates = null, signal = null } = {}) {
  const list = candidates || (isWin
    ? ['python', 'python3', 'py']
    : ['python3', 'python', '/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3']);
  const results = await Promise.all(list.map(candidate => runPythonCommand(candidate, ['-c', 'import venv, sys; print(sys.executable)'], { timeoutMs: 8000, signal })
    .then(() => candidate)
    .catch(() => null)));
  return results.find(Boolean) || null;
}

/** The installed version of `packageName` in a Python, or null. */
export async function pythonPackageVersion(python, packageName) {
  try {
    const out = await runPythonCommand(python, ['-c', `import importlib.metadata; print(importlib.metadata.version(${JSON.stringify(packageName)}))`], { timeoutMs: 15000 });
    return out.trim().split(/\r?\n/).pop() || null;
  } catch {
    return null;
  }
}
