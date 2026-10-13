import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

import { fetchReleasesCached, trimReleases } from './update-check.js';

const RELEASES = [{
  tag_name: 'v0.8.0-beta.8',
  prerelease: true,
  draft: false,
  body: 'Notes',
  html_url: 'https://github.com/asyncat-oss/asyncat-oss/releases/tag/v0.8.0-beta.8',
  author: { login: 'someone' },
  assets: [{ name: 'Asyncat-0.8.0-beta.8-linux-x64.AppImage', browser_download_url: 'https://github.com/x', size: 10, digest: 'sha256:abc', uploader: {} }],
}];

function githubLike() {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.headers['if-none-match'] || null);
    if (req.headers['if-none-match'] === '"v1"') {
      res.writeHead(304, { ETag: '"v1"' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"v1"' });
    res.end(JSON.stringify(RELEASES));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests })));
}

test('update checks reuse a fresh answer and send the ETag when they do ask', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-check-'));
  const { server, requests } = await githubLike();
  try {
    const url = `http://127.0.0.1:${server.address().port}/repos/a/b/releases`;
    const cacheFile = path.join(dir, 'update-check.json');
    const start = 1_000_000;

    const first = await fetchReleasesCached({ url, cacheFile, now: start });
    assert.equal(first.source, 'network');
    assert.equal(first.releases[0].tag_name, 'v0.8.0-beta.8');
    assert.equal(first.releases[0].assets[0].digest, 'sha256:abc');
    assert.equal(first.releases[0].author, undefined, 'only the fields the updater reads are kept');

    // Opening Settings a minute later costs no request.
    const second = await fetchReleasesCached({ url, cacheFile, now: start + 60_000 });
    assert.equal(second.source, 'cache');
    assert.equal(requests.length, 1);

    // "Check again" asks, with the ETag, and an unchanged list is a 304.
    const third = await fetchReleasesCached({ url, cacheFile, now: start + 61_000, force: true });
    assert.equal(third.source, 'not-modified');
    assert.deepEqual(requests, [null, '"v1"']);
    assert.equal(third.releases[0].tag_name, 'v0.8.0-beta.8');

    // Pressing it again right away doesn't ask again.
    assert.equal((await fetchReleasesCached({ url, cacheFile, now: start + 62_000, force: true })).source, 'cache');

    // An old answer is checked again on its own.
    assert.equal((await fetchReleasesCached({ url, cacheFile, now: start + 61_000 + 16 * 60_000 })).source, 'not-modified');
    assert.equal(requests.length, 3);

    // A different repository (ASYNCAT_UPDATE_REPO) never reuses the cache.
    const other = await fetchReleasesCached({ url: `${url}?other`, cacheFile, now: start + 61_000 + 16 * 60_000 + 1 });
    assert.equal(other.source, 'network');
    assert.equal(requests.at(-1), null);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed check reports the rate limit in plain words', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-check-'));
  try {
    const fetchImpl = async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    await assert.rejects(
      fetchReleasesCached({ url: 'https://api.github.com/x', cacheFile: path.join(dir, 'c.json'), fetchImpl }),
      /rate limit/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('trimReleases tolerates odd input', () => {
  assert.deepEqual(trimReleases(null), []);
  assert.equal(trimReleases([{ tag_name: 'v1.0.0' }])[0].assets.length, 0);
});
