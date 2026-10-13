import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

import {
  appImageStagingPath,
  detectAppImage,
  downloadFile,
  installStrategy,
  parseChecksums,
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
    assert.deepEqual(verifyChecksum({ sums, assetName: 'Asyncat.AppImage', sha256: result.sha256 }), { verified: true });
    assert.throws(() => verifyChecksum({ sums, assetName: 'Asyncat.AppImage', sha256: 'f'.repeat(64) }), /checksum/);
    assert.equal(verifyChecksum({ sums: new Map(), assetName: 'x', sha256: 'y' }).verified, false);

    replaceAppImage(staging, appImage);
    assert.equal(fs.readFileSync(appImage).length, body.length);
    assert.equal(fs.statSync(appImage).mode & 0o111, 0o111);
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
