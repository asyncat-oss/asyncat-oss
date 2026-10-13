import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { Writable } from 'stream';

import {
  appImageStagingPath,
  detectAppImage,
  digestSha256,
  downloadFile,
  installStrategy,
  makeExecutable,
  parseChecksums,
  planDownload,
  replaceAppImage,
  verifyChecksum,
} from './update-install.js';

function serve(body, { status = 200, length = body.length } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(status, { 'Content-Length': String(length) });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('picks how to install for each platform and package', () => {
  assert.equal(installStrategy({ platform: 'linux', appImagePath: '/home/u/Asyncat.AppImage', assetName: 'Asyncat-1.0.0-linux-x64.AppImage' }), 'replace-appimage');
  assert.equal(installStrategy({ platform: 'linux', appImagePath: null, assetName: 'Asyncat-1.0.0-linux-x64.deb' }), 'open-installer');
  assert.equal(installStrategy({ platform: 'win32', assetName: 'Asyncat-1.0.0-windows-x64.exe' }), 'run-installer');
  assert.equal(installStrategy({ platform: 'darwin', assetName: 'Asyncat-1.0.0-macos-arm64.dmg' }), 'open-installer');
  assert.equal(installStrategy({ platform: 'linux', assetName: null }), 'browser');
});

test('installers go to the app\'s own update folder; a .deb to Downloads', () => {
  const dirs = { updateDir: '/tmp/asyncat-update', downloadsDir: '/home/u/Downloads' };
  assert.deepEqual(
    planDownload({ strategy: 'open-installer', assetName: 'Asyncat-1.0.0-macos-arm64.dmg', platform: 'darwin', ...dirs }),
    { strategy: 'open-installer', destination: path.join('/tmp/asyncat-update', 'Asyncat-1.0.0-macos-arm64.dmg') },
  );
  assert.deepEqual(
    planDownload({ strategy: 'run-installer', assetName: 'Asyncat-1.0.0-windows-x64.exe', platform: 'win32', ...dirs }),
    { strategy: 'run-installer', destination: path.join('/tmp/asyncat-update', 'Asyncat-1.0.0-windows-x64.exe') },
  );
  assert.deepEqual(
    planDownload({ strategy: 'open-installer', assetName: 'Asyncat-1.0.0-linux-x64.deb', platform: 'linux', ...dirs }),
    { strategy: 'open-installer', destination: path.join('/home/u/Downloads', 'Asyncat-1.0.0-linux-x64.deb') },
  );
  assert.deepEqual(
    planDownload({ strategy: 'replace-appimage', assetName: 'Asyncat-1.0.0-linux-x64.AppImage', platform: 'linux', appImagePath: '/home/u/Apps/Asyncat.AppImage', canWrite: () => true, ...dirs }),
    { strategy: 'replace-appimage', destination: '/home/u/Apps/.Asyncat.AppImage.update' },
  );
  // An AppImage in a folder Asyncat can't write to is saved to Downloads and
  // started from there, not "installed" like a .deb.
  assert.deepEqual(
    planDownload({ strategy: 'replace-appimage', assetName: 'Asyncat-1.0.0-linux-x64.AppImage', platform: 'linux', appImagePath: '/opt/Asyncat.AppImage', canWrite: () => false, ...dirs }),
    { strategy: 'save-appimage', destination: path.join('/home/u/Downloads', 'Asyncat-1.0.0-linux-x64.AppImage') },
  );
});

test('a saved AppImage is made executable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-appimage-'));
  try {
    const file = path.join(dir, 'Asyncat.AppImage');
    fs.writeFileSync(file, 'x', { mode: 0o644 });
    makeExecutable(file);
    assert.equal(fs.statSync(file).mode & 0o111, 0o111);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only an app running from its own AppImage is treated as an AppImage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-appimage-'));
  try {
    const appImage = path.join(dir, 'Asyncat.AppImage');
    fs.writeFileSync(appImage, 'x');
    const env = { APPIMAGE: appImage, APPDIR: '/tmp/.mount_AsyncaXYZ' };
    const own = { env, execPath: '/tmp/.mount_AsyncaXYZ/asyncat', platform: 'linux' };
    assert.equal(detectAppImage(own), appImage);
    // A .deb install started from a terminal inside another AppImage app
    // inherits that app's variables; its executable is elsewhere.
    assert.equal(detectAppImage({ ...own, execPath: '/opt/Asyncat/asyncat' }), null);
    assert.equal(detectAppImage({ ...own, env: { APPIMAGE: path.join(dir, 'gone.AppImage'), APPDIR: env.APPDIR } }), null);
    assert.equal(detectAppImage({ ...own, env: { APPIMAGE: dir, APPDIR: env.APPDIR } }), null, 'a folder is not an AppImage');
    assert.equal(detectAppImage({ ...own, env: { APPIMAGE: appImage } }), null);
    assert.equal(detectAppImage({ ...own, platform: 'darwin' }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reads sha256sum output', () => {
  const sums = parseChecksums(`${'a'.repeat(64)}  Asyncat-1.0.0-linux-x64.AppImage\n${'B'.repeat(64)} *Asyncat-1.0.0-windows-x64.exe\nnot a line\n`);
  assert.equal(sums.get('Asyncat-1.0.0-linux-x64.AppImage'), 'a'.repeat(64));
  assert.equal(sums.get('Asyncat-1.0.0-windows-x64.exe'), 'b'.repeat(64));
  assert.equal(sums.size, 2);
});

test('downloads with progress, verifies, and swaps an AppImage in place', async () => {
  const body = Buffer.alloc(300 * 1024, 7);
  const server = await serve(body);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-update-'));
  try {
    const appImage = path.join(dir, 'Asyncat.AppImage');
    fs.writeFileSync(appImage, 'old version');
    const staging = appImageStagingPath(appImage);
    const progress = [];
    const result = await downloadFile(`http://127.0.0.1:${server.address().port}/a`, staging, {
      onProgress: (p) => progress.push(p),
    });
    assert.equal(result.bytes, body.length);
    assert.equal(result.sha256, createHash('sha256').update(body).digest('hex'));
    assert.deepEqual(progress.at(-1), { received: body.length, total: body.length });
    assert.equal(fs.existsSync(`${staging}.part`), false);

    const sums = new Map([['Asyncat.AppImage', result.sha256]]);
    assert.equal(verifyChecksum({ sums, assetName: 'Asyncat.AppImage', sha256: result.sha256 }).verified, true);

    replaceAppImage(staging, appImage);
    assert.equal(fs.readFileSync(appImage).length, body.length);
    assert.equal(fs.statSync(appImage).mode & 0o111, 0o111);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an update is installed only when a checksum proves the download', () => {
  const good = 'a'.repeat(64);
  const bad = 'b'.repeat(64);
  const sums = new Map([['Asyncat.AppImage', good]]);
  assert.deepEqual(verifyChecksum({ sums, assetName: 'Asyncat.AppImage', sha256: good }).sources, ['SHA256SUMS.txt']);
  assert.deepEqual(verifyChecksum({ digest: `sha256:${good.toUpperCase()}`, assetName: 'x', sha256: good }).sources, ['GitHub']);
  assert.deepEqual(verifyChecksum({ sums, digest: `sha256:${good}`, assetName: 'Asyncat.AppImage', sha256: good }).sources, ['GitHub', 'SHA256SUMS.txt']);
  // Missing checksums no longer let an update through unverified.
  assert.throws(() => verifyChecksum({ sums: new Map(), assetName: 'x', sha256: good }), (error) => error.code === 'NO_CHECKSUM' && /release page/.test(error.message));
  assert.throws(() => verifyChecksum({ assetName: 'x', sha256: good, digest: 'md5:123' }), { code: 'NO_CHECKSUM' });
  assert.throws(() => verifyChecksum({ sums, assetName: 'Asyncat.AppImage', sha256: bad }), { code: 'CHECKSUM_MISMATCH' });
  // Both sources must agree when both exist.
  assert.throws(() => verifyChecksum({ sums, digest: `sha256:${bad}`, assetName: 'Asyncat.AppImage', sha256: good }), { code: 'CHECKSUM_MISMATCH' });
  assert.equal(digestSha256('sha256:' + good), good);
  assert.equal(digestSha256('nope'), null);
});

test('Cancel stops the transfer and removes the partial file; a retry starts clean', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-update-'));
  // Sends one chunk, then stalls as a slow mirror would.
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Length': String(1024 * 1024) });
    res.write(Buffer.alloc(64 * 1024, 1));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = path.join(dir, 'Asyncat.exe');
    const controller = new AbortController();
    const pending = downloadFile(`http://127.0.0.1:${server.address().port}/`, target, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await assert.rejects(pending, (error) => error.cancelled === true);
    assert.deepEqual(fs.readdirSync(dir), []);

    // A leftover .part from an earlier crash does not get in the way.
    fs.writeFileSync(`${target}.part`, 'stale');
    const body = Buffer.alloc(2048, 3);
    const fresh = await serve(body);
    try {
      const result = await downloadFile(`http://127.0.0.1:${fresh.address().port}/`, target);
      assert.equal(result.bytes, body.length);
      assert.deepEqual(fs.readdirSync(dir), ['Asyncat.exe']);
    } finally {
      fresh.close();
    }
  } finally {
    server.closeAllConnections?.();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a full disk fails the download with a clear message instead of hanging', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-update-'));
  const server = await serve(Buffer.alloc(512 * 1024, 5));
  try {
    const target = path.join(dir, 'Asyncat.dmg');
    const fullDisk = () => new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }));
      },
    });
    await assert.rejects(
      downloadFile(`http://127.0.0.1:${server.address().port}/`, target, { openWrite: fullDisk }),
      /disk is full/,
    );
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a short download or HTTP error leaves no file behind', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-update-'));
  const short = await serve(Buffer.alloc(10), { length: 10 });
  const missing = await serve(Buffer.from('nope'), { status: 404 });
  try {
    const target = path.join(dir, 'file.bin');
    // A response that reports more bytes than it sends.
    const fakeFetch = async () => new Response(new Blob([Buffer.alloc(10)]).stream(), { headers: { 'content-length': '20' } });
    await assert.rejects(downloadFile('http://x', target, { fetchImpl: fakeFetch }), /incomplete/);
    await assert.rejects(downloadFile(`http://127.0.0.1:${missing.address().port}/`, target), /HTTP 404/);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    short.close();
    missing.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
