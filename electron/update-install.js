// Download, verify and install helpers for in-app updates. Plain Node.js (no
// Electron imports) so the updater's riskiest steps can be tested directly.
//
// How an update is applied depends on how Asyncat was installed:
//   replace-appimage  Linux AppImage: the new file replaces the old one, then restart.
//   save-appimage     Linux AppImage in a folder Asyncat can't write to: the new
//                     AppImage is saved to Downloads, made executable, and started
//                     from there.
//   run-installer     Windows: the downloaded installer runs silently, then reopens Asyncat.
//   open-installer    macOS (.dmg, kept in the app's own update folder) and Linux .deb
//                     (saved to Downloads); the last step is the user's (unsigned
//                     builds, or root needed).
//   browser           Nothing to download for this platform: open the release page.

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * The AppImage this process runs from, or null. APPIMAGE alone can't be
 * trusted: an app started from a terminal inside another AppImage inherits
 * that app's APPIMAGE and APPDIR. So require that this executable really
 * lives in the mounted APPDIR and that APPIMAGE is an existing file.
 */
export function detectAppImage({ env = process.env, execPath = process.execPath, platform = process.platform, statImpl = fs.statSync } = {}) {
  if (platform !== 'linux') return null;
  const appImage = String(env.APPIMAGE || '');
  const appDir = String(env.APPDIR || '');
  if (!appImage || !appDir || !path.isAbsolute(appImage) || !path.isAbsolute(appDir)) return null;
  if (!execPath || !isInside(execPath, appDir)) return null;
  try {
    return statImpl(appImage).isFile() ? appImage : null;
  } catch {
    return null;
  }
}

export function installStrategy({ platform, appImagePath = null, assetName = null }) {
  if (!assetName) return 'browser';
  if (platform === 'linux' && appImagePath && assetName.endsWith('.AppImage')) return 'replace-appimage';
  if (platform === 'win32' && assetName.endsWith('.exe')) return 'run-installer';
  return 'open-installer';
}

/**
 * Where an update is downloaded, and the strategy that then applies.
 * `updateDir` is the app's own folder for updates (in its temp folder):
 * the Windows installer and the macOS disk image go there, so macOS doesn't
 * ask for access to Downloads. A .deb goes to Downloads, where the user
 * installs it from.
 */
export function planDownload({ strategy, assetName, platform, appImagePath = null, updateDir, downloadsDir, canWrite = canWriteNextTo }) {
  if (strategy === 'replace-appimage') {
    if (appImagePath && canWrite(appImagePath)) return { strategy, destination: appImageStagingPath(appImagePath) };
    // A read-only folder (/opt, a mounted drive): keep the new AppImage in
    // Downloads and start it from there.
    return { strategy: 'save-appimage', destination: path.join(downloadsDir, assetName) };
  }
  if (strategy === 'run-installer' || (strategy === 'open-installer' && platform === 'darwin')) {
    return { strategy, destination: path.join(updateDir, assetName) };
  }
  return { strategy: 'open-installer', destination: path.join(downloadsDir, assetName) };
}

/** Make a downloaded AppImage runnable. */
export function makeExecutable(file) {
  fs.chmodSync(file, 0o755);
}

/** `sha256sum` output as a Map of file name → lowercase hex digest. */
export function parseChecksums(text) {
  const sums = new Map();
  for (const line of String(text || '').split('\n')) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

function cancelledError() {
  return Object.assign(new Error('The download was cancelled.'), { cancelled: true });
}

/** A plain-words error for a failed write (full disk, no permission, ...). */
export function friendlyWriteError(error) {
  if (error?.code === 'ENOSPC') {
    return new Error('The disk is full, so the update could not be saved. Free up some space and try again.');
  }
  if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EROFS') {
    return new Error("Asyncat isn't allowed to save the update in that folder. Try again, or download it from the release page.");
  }
  return error;
}

/**
 * Stream `url` to `destination`, reporting { received, total } as it goes.
 * Writes to a `.part` file first so a failed or cancelled download never
 * leaves a half-written file under the real name; the `.part` file is
 * removed on any failure, so a retry starts clean. A write error (a full
 * disk) fails the download instead of hanging it. Resolves { bytes, sha256 }.
 */
export async function downloadFile(url, destination, { fetchImpl = fetch, onProgress = null, signal = null, openWrite = (file) => fs.createWriteStream(file) } = {}) {
  const partial = `${destination}.part`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(partial, { force: true });

  let response;
  try {
    response = await fetchImpl(url, { signal });
  } catch (error) {
    throw signal?.aborted ? cancelledError() : error;
  }
  if (!response.ok || !response.body) throw new Error(`The download failed (HTTP ${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  const hash = createHash('sha256');
  let received = 0;
  let lastReport = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      received += chunk.length;
      const now = Date.now();
      if (onProgress && now - lastReport > 150) {
        lastReport = now;
        onProgress({ received, total });
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      meter,
      openWrite(partial),
      ...(signal ? [{ signal }] : []),
    );
    if (signal?.aborted) throw cancelledError();
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw signal?.aborted ? cancelledError() : friendlyWriteError(error);
  }
  if (total && received !== total) {
    fs.rmSync(partial, { force: true });
    throw new Error('The download was incomplete. Try again.');
  }
  onProgress?.({ received, total: total || received });
  fs.renameSync(partial, destination);
  return { bytes: received, sha256: hash.digest('hex') };
}

/** GitHub's asset `digest` ("sha256:<hex>") as lowercase hex, or null. */
export function digestSha256(digest) {
  const match = String(digest || '').trim().match(/^sha256:([0-9a-f]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check a download against the release: the asset's SHA-256 `digest` from the
 * GitHub API and the line for it in SHA256SUMS.txt. Every source we have must
 * match, and at least one must exist. An update that can't be checked is
 * refused instead of being installed unverified.
 */
export function verifyChecksum({ sums = null, digest = null, assetName, sha256 }) {
  const actual = String(sha256 || '').toLowerCase();
  const expected = [
    ['GitHub', digestSha256(digest)],
    ['SHA256SUMS.txt', sums?.get(assetName) || null],
  ].filter(([, value]) => value);
  if (expected.length === 0) {
    throw Object.assign(
      new Error("This update can't be checked: the release has no checksum for it, so it wasn't installed. You can download it from the release page instead."),
      { code: 'NO_CHECKSUM' },
    );
  }
  if (expected.some(([, value]) => value !== actual)) {
    throw Object.assign(
      new Error("The download doesn't match the release's checksum, so it wasn't installed. Try again, or download it from the release page."),
      { code: 'CHECKSUM_MISMATCH' },
    );
  }
  return { verified: true, sources: expected.map(([source]) => source) };
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// A small record of the last verified download, so a finished update is not
// downloaded again (after closing the update screen, or a restart).

export function readDownloadRecord(file) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

export function writeDownloadRecord(file, record) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (record) fs.writeFileSync(file, JSON.stringify(record, null, 2));
    else fs.rmSync(file, { force: true });
  } catch (error) {
    console.warn('[updater] could not save the download record:', error.message);
  }
}

/**
 * `record` when it is a verified download of this exact update that is still
 * on disk unchanged (its SHA-256 is checked again), otherwise null.
 */
export async function verifiedDownloadFor(record, { version, assetName, strategy }) {
  if (!record || record.version !== version || record.assetName !== assetName || record.strategy !== strategy) return null;
  if (!record.file || !/^[0-9a-f]{64}$/.test(String(record.sha256 || ''))) return null;
  try {
    return (await sha256File(record.file)) === record.sha256 ? record : null;
  } catch {
    return null;
  }
}

/**
 * Remove what earlier updates left behind: partial downloads anywhere we
 * download to, an interrupted AppImage swap, and installers in the app's
 * update folder other than a verified update that is still to be installed.
 * Files the user may want (a .deb or AppImage in Downloads) are left alone.
 * Returns { removed, keepRecord }.
 */
export function cleanupUpdateFiles({ updateDir = null, downloadsDir = null, appImagePath = null, record = null, isPending = () => false }) {
  const removed = [];
  const remove = (file) => {
    try {
      fs.rmSync(file, { force: true });
      removed.push(file);
    } catch { /* in use or gone */ }
  };
  const keepRecord = Boolean(record?.version && isPending(record.version));
  const keepFile = keepRecord && record.file ? path.resolve(record.file) : null;

  if (updateDir) {
    let entries = [];
    try { entries = fs.readdirSync(updateDir, { withFileTypes: true }); } catch { /* not created yet */ }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(updateDir, entry.name);
      if (entry.name.endsWith('.part') || path.resolve(file) !== keepFile) remove(file);
    }
  }
  if (downloadsDir) {
    let entries = [];
    try { entries = fs.readdirSync(downloadsDir, { withFileTypes: true }); } catch { /* none */ }
    for (const entry of entries) {
      if (entry.isFile() && /^Asyncat-.+\.part$/.test(entry.name)) remove(path.join(downloadsDir, entry.name));
    }
  }
  if (appImagePath) {
    const staging = appImageStagingPath(appImagePath);
    for (const file of [staging, `${staging}.part`]) {
      if (fs.existsSync(file)) remove(file);
    }
  }
  return { removed, keepRecord };
}

/** Where the AppImage update is downloaded: next to the running file, so the swap is a rename. */
export function appImageStagingPath(appImagePath) {
  return path.join(path.dirname(appImagePath), `.${path.basename(appImagePath)}.update`);
}

export function canWriteNextTo(file) {
  try {
    fs.accessSync(path.dirname(file), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Put a downloaded AppImage in place of the running one. Linux keeps the old
 * file open for the running app, so replacing it is safe; the next start runs
 * the new version.
 */
export function replaceAppImage(downloaded, appImagePath) {
  makeExecutable(downloaded);
  fs.renameSync(downloaded, appImagePath);
}

/** Arguments for electron-builder's NSIS installer: silent update, then start the app. */
export const WINDOWS_INSTALLER_ARGS = ['--updated', '/S', '--force-run'];

/**
 * Whether Asyncat is installed for all users (Program Files). Then Windows
 * asks for permission (UAC) before the installer can update it.
 */
export function isPerMachineInstall({ execPath = process.execPath, env = process.env, canWrite = canWriteNextTo } = {}) {
  const win = path.win32;
  const exe = win.resolve(execPath).toLowerCase();
  const roots = [env.ProgramFiles, env.ProgramW6432, env['ProgramFiles(x86)']]
    .filter(Boolean)
    .map((root) => win.resolve(root).toLowerCase());
  if (roots.some((root) => exe.startsWith(`${root}\\`))) return true;
  return !canWrite(execPath);
}

/**
 * Start a program on its own and wait until it is really running. Rejects
 * when the file is missing or can't be started, so the caller can stay
 * open and say so instead of quitting into nothing.
 */
export function launchDetached(file, args = [], { spawnImpl = spawn, existsImpl = fs.existsSync, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !existsImpl(file)) {
      reject(new Error('The downloaded installer is missing. Download the update again.'));
      return;
    }
    let child;
    try {
      child = spawnImpl(file, args, { detached: true, stdio: 'ignore' });
    } catch (error) {
      reject(error);
      return;
    }
    let timer = null;
    const onSpawn = () => finish(null);
    const onError = (error) => finish(error);
    function finish(error) {
      clearTimeout(timer);
      child.removeListener('spawn', onSpawn);
      child.removeListener('error', onError);
      // A late error must never become an uncaught exception in the app.
      child.on('error', () => {});
      if (error) {
        reject(error);
      } else {
        child.unref();
        resolve(child);
      }
    }
    child.once('spawn', onSpawn);
    child.once('error', onError);
    timer = setTimeout(() => finish(new Error('The installer did not start.')), timeoutMs);
  });
}
