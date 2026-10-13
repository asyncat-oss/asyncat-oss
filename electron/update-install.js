// Download, verify and install helpers for in-app updates. Plain Node.js (no
// Electron imports) so the updater's riskiest steps can be tested directly.
//
// How an update is applied depends on how Asyncat was installed:
//   replace-appimage  Linux AppImage: the new file replaces the old one, then restart.
//   run-installer     Windows: the downloaded installer runs silently, then reopens Asyncat.
//   open-installer    macOS (.dmg) and Linux .deb: the file is saved to Downloads and
//                     shown; the last step is the user's (unsigned builds, or root needed).
//   browser           Nothing to download for this platform: open the release page.

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

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

/** `sha256sum` output as a Map of file name → lowercase hex digest. */
export function parseChecksums(text) {
  const sums = new Map();
  for (const line of String(text || '').split('\n')) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

/**
 * Stream `url` to `destination`, reporting { received, total } as it goes.
 * Writes to a `.part` file first so a failed or cancelled download never
 * leaves a half-written file under the real name. Resolves { bytes, sha256 }.
 */
export async function downloadFile(url, destination, { fetchImpl = fetch, onProgress = null, signal = null } = {}) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok || !response.body) throw new Error(`The download failed (HTTP ${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  const hash = createHash('sha256');
  const partial = `${destination}.part`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const out = fs.createWriteStream(partial);
  let received = 0;
  let lastReport = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.length;
      if (!out.write(value)) await new Promise((resolve) => out.once('drain', resolve));
      const now = Date.now();
      if (onProgress && now - lastReport > 150) {
        lastReport = now;
        onProgress({ received, total });
      }
    }
    await new Promise((resolve, reject) => {
      out.once('error', reject);
      out.end(resolve);
    });
  } catch (error) {
    out.destroy();
    fs.rmSync(partial, { force: true });
    throw signal?.aborted ? Object.assign(new Error('The download was cancelled.'), { cancelled: true }) : error;
  }
  if (total && received !== total) {
    fs.rmSync(partial, { force: true });
    throw new Error('The download was incomplete. Try again.');
  }
  onProgress?.({ received, total: total || received });
  fs.renameSync(partial, destination);
  return { bytes: received, sha256: hash.digest('hex') };
}

/**
 * Check a download against the release's SHA256SUMS.txt. Releases made before
 * checksums were published have none; then only the size check applies.
 */
export function verifyChecksum({ sums, assetName, sha256 }) {
  const expected = sums?.get(assetName);
  if (!expected) return { verified: false, reason: 'no-checksum' };
  if (expected !== sha256) {
    throw new Error("The download doesn't match the release's checksum, so it wasn't installed.");
  }
  return { verified: true };
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
  fs.chmodSync(downloaded, 0o755);
  fs.renameSync(downloaded, appImagePath);
}

/** Arguments for electron-builder's NSIS installer: silent update, then start the app. */
export const WINDOWS_INSTALLER_ARGS = ['--updated', '/S', '--force-run'];
