import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { downloadWithResume, sha256File } from '../src/lib/engineDownload.js';

const BODY = Buffer.from(Array.from({ length: 200_000 }, (_, i) => i % 251));

/**
 * A server that honours Range requests. `behaviour(req, res, range)` may take
 * over a request (to stall or cut it short); return true when it did.
 */
function rangeServer(behaviour = () => false) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const match = /^bytes=(\d+)-$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    requests.push({ range: req.headers.range || null });
    if (behaviour(req, res, start, requests.length)) return;
    if (start >= BODY.length) {
      res.writeHead(416, { 'Content-Range': `bytes */${BODY.length}` });
      res.end();
      return;
    }
    const chunk = BODY.subarray(start);
    res.writeHead(match ? 206 : 200, {
      'Content-Length': String(chunk.length),
      ...(match ? { 'Content-Range': `bytes ${start}-${BODY.length - 1}/${BODY.length}` } : {}),
    });
    res.end(chunk);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    server,
    requests,
    url: `http://127.0.0.1:${server.address().port}/llama.zip`,
    close: () => { server.closeAllConnections?.(); server.close(); },
  })));
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-dl-'));
}

test('a download writes the whole file and reports bytes as it goes', async () => {
  const srv = await rangeServer();
  const dir = tempDir();
  try {
    const target = path.join(dir, 'llama.zip');
    const progress = [];
    const result = await downloadWithResume(srv.url, target, { onProgress: (p) => progress.push(p) });
    assert.equal(result.bytes, BODY.length);
    assert.deepEqual(fs.readFileSync(target), BODY);
    assert.equal(fs.existsSync(`${target}.part`), false);
    assert.equal(progress.at(-1).downloadedBytes, BODY.length);
    assert.equal(progress.at(-1).totalBytes, BODY.length);
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an interrupted download resumes from the kept .part file', async () => {
  const srv = await rangeServer();
  const dir = tempDir();
  try {
    const target = path.join(dir, 'llama.zip');
    fs.writeFileSync(`${target}.part`, BODY.subarray(0, 70_000));
    const result = await downloadWithResume(srv.url, target);
    assert.equal(result.resumedFrom, 70_000);
    assert.deepEqual(srv.requests.map((r) => r.range), ['bytes=70000-']);
    assert.equal(await sha256File(target), await sha256File(await (async () => {
      const whole = path.join(dir, 'whole.bin');
      fs.writeFileSync(whole, BODY);
      return whole;
    })()));
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a stalled connection is dropped and the download continues where it was', async () => {
  // The first response sends part of the file and then goes silent.
  const srv = await rangeServer((req, res, start, count) => {
    if (count !== 1) return false;
    res.writeHead(200, { 'Content-Length': String(BODY.length) });
    res.write(BODY.subarray(0, 50_000));
    return true;
  });
  const dir = tempDir();
  try {
    const target = path.join(dir, 'llama.zip');
    const result = await downloadWithResume(srv.url, target, { inactivityMs: 300 });
    assert.deepEqual(fs.readFileSync(target), BODY);
    assert.equal(srv.requests[1].range, 'bytes=50000-');
    assert.equal(result.resumedFrom, 50_000);
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a server that ignores Range starts the file again', async () => {
  const srv = await rangeServer((req, res) => {
    res.writeHead(200, { 'Content-Length': String(BODY.length) });
    res.end(BODY);
    return true;
  });
  const dir = tempDir();
  try {
    const target = path.join(dir, 'llama.zip');
    fs.writeFileSync(`${target}.part`, Buffer.alloc(1000, 9));
    await downloadWithResume(srv.url, target);
    assert.deepEqual(fs.readFileSync(target), BODY);
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cancelling stops the transfer and keeps what arrived for next time', async () => {
  const srv = await rangeServer((req, res, start, count) => {
    if (count !== 1) return false;
    res.writeHead(200, { 'Content-Length': String(BODY.length) });
    res.write(BODY.subarray(0, 64_000));
    return true;
  });
  const dir = tempDir();
  try {
    const target = path.join(dir, 'llama.zip');
    const controller = new AbortController();
    const pending = downloadWithResume(srv.url, target, { signal: controller.signal });
    const started = Date.now();
    while (!(fs.existsSync(`${target}.part`) && fs.statSync(`${target}.part`).size > 0) && Date.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    controller.abort();
    await assert.rejects(pending, (error) => error.cancelled === true);
    assert.ok(Date.now() - started < 5000, 'cancel takes effect at once');
    assert.equal(fs.existsSync(target), false);
    assert.ok(fs.statSync(`${target}.part`).size > 0, 'the partial file is kept for a resume');
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing file is not retried, and a full disk fails cleanly', async () => {
  const srv = await rangeServer((req, res) => {
    res.writeHead(404);
    res.end();
    return true;
  });
  const dir = tempDir();
  try {
    await assert.rejects(downloadWithResume(srv.url, path.join(dir, 'x.zip')), /HTTP 404/);
    assert.equal(srv.requests.length, 1);

    // Linux has a device that is always full.
    if (process.platform === 'linux' && fs.existsSync('/dev/full')) {
      const ok = await rangeServer();
      const full = path.join(dir, 'full.zip');
      fs.symlinkSync('/dev/full', `${full}.part`);
      try {
        await assert.rejects(downloadWithResume(ok.url, full, { retries: 0 }), /disk is full/);
      } finally {
        ok.close();
      }
    }
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
