import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadProgressText, formatBytes } from './engineProgress.js';

test('install progress shows bytes only while a file downloads', () => {
  const mb = 1024 * 1024;
  assert.equal(downloadProgressText({ phase: 'downloading', downloadedBytes: 12.4 * mb, totalBytes: 340 * mb }), '12.4 MB of 340.0 MB');
  assert.equal(downloadProgressText({ phase: 'downloading', downloadedBytes: 5 * mb, totalBytes: 0 }), '5.00 MB downloaded');
  assert.equal(downloadProgressText({ phase: 'extracting', downloadedBytes: 5 * mb, totalBytes: 9 * mb }), '');
  assert.equal(downloadProgressText({ phase: 'downloading', downloadedBytes: 0, totalBytes: 9 * mb }), '');
  assert.equal(downloadProgressText(null), '');
  assert.equal(formatBytes(512), '512 B');
});
