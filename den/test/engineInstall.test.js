// End to end: a llama.cpp "release" served from this machine is downloaded,
// checked, unpacked, verified and swapped in, all inside a temp Asyncat home
// and a temp database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-install-e2e-'));
process.env.ASYNCAT_HOME = path.join(root, 'home');
process.env.DB_PATH = path.join(root, 'test.db');
process.env.LLAMA_BINARY_PATH = '';

const { installManagedAsset, managedEngineDir, managedDownloadsDir, readManagedEngineMetadata } = await import('../src/lib/localEngine.js');

const skip = process.platform === 'win32' ? 'the fake engine is a shell script' : false;

async function fakeLlamaZip(versionLine) {
  const zip = new JSZip();
  const script = `#!/bin/sh\necho "${versionLine}"\nexit 0\n`;
  zip.file('build/bin/llama-server', script, { unixPermissions: 0o755 });
  zip.file('build/bin/libggml.so.0.9.1', 'lib', { unixPermissions: 0o644 });
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

function serve(files) {
  const server = http.createServer((req, res) => {
    const body = files[req.url];
    if (!body) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Length': String(body.length) });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('an engine release is downloaded, checked, unpacked and swapped in', { skip }, async () => {
  const zip = await fakeLlamaZip('version: 6500 (abc1234)');
  const server = await serve({ '/llama.zip': zip });
  try {
    const asset = {
      name: 'llama-b6500-bin-ubuntu-x64.zip',
      browser_download_url: `http://127.0.0.1:${server.address().port}/llama.zip`,
      size: zip.length,
      digest: `sha256:${createHash('sha256').update(zip).digest('hex')}`,
    };
    const release = { tag_name: 'b6500', assets: [asset] };
    const phases = [];
    const result = await installManagedAsset(asset, release, 'cpu_safe', (p) => phases.push(p));

    const dir = managedEngineDir('cpu_safe');
    assert.equal(result.binary, path.join(dir, 'llama-server'));
    assert.equal(readManagedEngineMetadata(dir).checksum.source, 'GitHub');
    assert.equal(readManagedEngineMetadata(dir).version, 'b6500');
    assert.ok(fs.existsSync(path.join(dir, 'build', 'bin', 'libggml.so.0')), 'library links are made');
    assert.equal(fs.realpathSync(managedEngineDir()), fs.realpathSync(dir), '"current" points at the new build');
    assert.deepEqual(
      [...new Set(phases.map((p) => p.phase))],
      ['downloading', 'extracting', 'installing', 'verifying', 'complete'],
    );
    assert.ok(phases.some((p) => p.downloadedBytes === zip.length && p.totalBytes === zip.length));
    // Nothing is left behind: no archive, no staging folder.
    assert.deepEqual(fs.readdirSync(managedDownloadsDir()), []);
    assert.deepEqual(fs.readdirSync(path.dirname(dir)).filter((name) => name.startsWith('.')), []);
  } finally {
    server.close();
  }
});

test('a download that fails its checksum changes nothing', { skip }, async () => {
  const zip = await fakeLlamaZip('version: 6600 (def5678)');
  const server = await serve({ '/llama.zip': zip });
  try {
    const asset = {
      name: 'llama-b6600-bin-ubuntu-x64.zip',
      browser_download_url: `http://127.0.0.1:${server.address().port}/llama.zip`,
      size: zip.length,
      digest: `sha256:${'0'.repeat(64)}`,
    };
    await assert.rejects(
      installManagedAsset(asset, { tag_name: 'b6600', assets: [asset] }, 'cpu_safe'),
      (error) => error.code === 'CHECKSUM_MISMATCH',
    );
    const dir = managedEngineDir('cpu_safe');
    assert.equal(readManagedEngineMetadata(dir).version, 'b6500', 'the installed engine is untouched');
    assert.deepEqual(fs.readdirSync(path.dirname(dir)).filter((name) => name.startsWith('.')), []);
  } finally {
    server.close();
  }
});

test('cancelling an install keeps the engine you had and the bytes downloaded so far', { skip }, async () => {
  const zip = await fakeLlamaZip('version: 6800 (aaa1111)');
  // Sends part of the file, then waits.
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Length': String(zip.length) });
    res.write(zip.subarray(0, Math.floor(zip.length / 2)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const asset = {
      name: 'llama-b6800-bin-ubuntu-x64.zip',
      browser_download_url: `http://127.0.0.1:${server.address().port}/llama.zip`,
      size: zip.length,
      digest: `sha256:${createHash('sha256').update(zip).digest('hex')}`,
    };
    const controller = new AbortController();
    const pending = installManagedAsset(asset, { tag_name: 'b6800', assets: [asset] }, 'cpu_safe', (p) => {
      if (p.phase === 'downloading' && p.downloadedBytes > 0) setTimeout(() => controller.abort(), 50);
    }, { signal: controller.signal });
    await assert.rejects(pending, (error) => error.cancelled === true);
    assert.equal(readManagedEngineMetadata(managedEngineDir('cpu_safe')).version, 'b6500');
    const part = path.join(managedDownloadsDir(), 'ggml-org_llama.cpp', 'b6800', `${asset.name}.part`);
    assert.ok(fs.statSync(part).size > 0, 'the partial download is kept for next time');
    assert.deepEqual(fs.readdirSync(path.dirname(managedEngineDir('cpu_safe'))).filter((name) => name.startsWith('.')), []);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a build that does not run is never swapped in', { skip }, async () => {
  const zip = new JSZip();
  zip.file('llama-server', '#!/bin/sh\necho "illegal instruction" >&2\nexit 132\n', { unixPermissions: 0o755 });
  const body = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
  const server = await serve({ '/llama.zip': body });
  try {
    const asset = {
      name: 'llama-b6700-bin-ubuntu-x64.zip',
      browser_download_url: `http://127.0.0.1:${server.address().port}/llama.zip`,
      size: body.length,
      digest: `sha256:${createHash('sha256').update(body).digest('hex')}`,
    };
    await assert.rejects(
      installManagedAsset(asset, { tag_name: 'b6700', assets: [asset] }, 'cpu_safe'),
      (error) => error.diagnostics?.type === 'llama-server-verification',
    );
    assert.equal(readManagedEngineMetadata(managedEngineDir('cpu_safe')).version, 'b6500');
  } finally {
    server.close();
  }
});
