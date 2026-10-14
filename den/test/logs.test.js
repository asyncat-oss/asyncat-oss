import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Logs are listed, read and cleared where den writes them: ASYNCAT_LOG_DIR in
// the desktop app, not a folder next to den's own code.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-logs-'));
process.env.ASYNCAT_LOG_DIR = path.join(scratch, 'logs');

const { logRoot } = await import('../src/logger.js');
const { getLogsSummary, readLogFile, clearLogs } = await import('../src/storage/storageService.js');

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const logs = process.env.ASYNCAT_LOG_DIR;

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test('den writes its logs under ASYNCAT_LOG_DIR/backend', () => {
  assert.equal(logRoot(), path.join(logs, 'backend'));
  assert.ok(fs.statSync(path.join(logRoot(), 'app')).isDirectory(), 'the logger made its folder there');
});

test('the log list reads that folder, and the desktop log beside it', () => {
  write(path.join(logRoot(), 'app', 'app-2026-10-01.log'), 'started\nready\n');
  write(path.join(logRoot(), 'error', 'error-2026-10-01.log'), 'oops\n');
  write(path.join(logs, 'backend-process.log'), 'den said hello\n');
  write(path.join(logs, 'notes.txt'), 'not a log');
  write(path.join(scratch, 'secret.txt'), 'not yours');
  fs.symlinkSync(path.join(scratch, 'secret.txt'), path.join(logRoot(), 'app', 'link.log'));

  const summary = getLogsSummary();
  const byId = Object.fromEntries(summary.categories.map((category) => [category.id, category]));
  assert.deepEqual(byId['backend-app'].recentFiles.map((file) => file.name).filter((name) => name.startsWith('app-2026')), ['app-2026-10-01.log']);
  assert.ok(!byId['backend-app'].recentFiles.some((file) => file.name === 'link.log'), 'links are not listed');
  assert.deepEqual(byId.other.recentFiles.map((file) => file.name), ['backend-process.log']);
  assert.equal(readLogFile('backend-app', 'app-2026-10-01.log').content, 'started\nready\n');
  assert.equal(readLogFile('other', 'backend-process.log').content, 'den said hello\n');
});

test('reading takes a listed file name only', () => {
  assert.throws(() => readLogFile('backend-app', '../../../secret.txt'), /Invalid filename/);
  assert.throws(() => readLogFile('backend-app', 'link.log'), /not found/);
  assert.throws(() => readLogFile('other', 'notes.txt'), /not found/);
  assert.throws(() => readLogFile('__proto__', 'x.log'), /Invalid log category/);
});

test('clearing removes the listed logs and nothing else', async () => {
  const result = await clearLogs();
  assert.ok(result.deletedFiles >= 3);
  assert.equal(fs.existsSync(path.join(logRoot(), 'app', 'app-2026-10-01.log')), false);
  assert.equal(fs.existsSync(path.join(logs, 'backend-process.log')), false);
  assert.equal(fs.readFileSync(path.join(logs, 'notes.txt'), 'utf8'), 'not a log');
  assert.equal(fs.readFileSync(path.join(scratch, 'secret.txt'), 'utf8'), 'not yours', 'a link\'s target survives');
});
