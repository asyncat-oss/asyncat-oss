import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// den writes its logs where ASYNCAT_LOG_DIR says (the desktop app sets it),
// not in a folder next to den's own code. Files → Logs & caches reads them
// from there (files.test.js).

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-logs-'));
process.env.ASYNCAT_LOG_DIR = path.join(scratch, 'logs');

const { logRoot } = await import('../src/logger.js');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test('den writes its logs under ASYNCAT_LOG_DIR/backend', () => {
  assert.equal(logRoot(), path.join(process.env.ASYNCAT_LOG_DIR, 'backend'));
  assert.ok(fs.statSync(path.join(logRoot(), 'app')).isDirectory(), 'the logger made its folder there');
});
