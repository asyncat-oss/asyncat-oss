import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openFolderOnly } from './folder-open.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-folder-open-'));
const folder = path.join(scratch, 'Garden');
const script = path.join(scratch, 'run.sh');
const app = path.join(scratch, 'Calculator.app');
fs.mkdirSync(folder);
fs.mkdirSync(app);
fs.writeFileSync(script, '#!/bin/sh\necho hi\n', { mode: 0o755 });
fs.symlinkSync(script, path.join(scratch, 'looks-like-a-folder'));
fs.symlinkSync(folder, path.join(scratch, 'garden-link'));
fs.symlinkSync(app, path.join(scratch, 'Tools'));

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function recorder() {
  const opened = [];
  return { opened, openPath: async (target) => { opened.push(target); return ''; } };
}

test('a folder opens in the file manager', async () => {
  const shell = recorder();
  assert.equal(await openFolderOnly(folder, shell), '');
  assert.equal(await openFolderOnly(path.join(scratch, 'garden-link'), shell), '');
  assert.deepEqual(shell.opened, [folder, folder], 'a link opens where it leads');
});

test('files, missing paths and relative paths are refused', async () => {
  const shell = recorder();
  assert.equal(await openFolderOnly(script, shell), 'Only folders can be opened.');
  assert.equal(await openFolderOnly(path.join(scratch, 'looks-like-a-folder'), shell), 'Only folders can be opened.');
  assert.equal(await openFolderOnly(path.join(scratch, 'missing'), shell), 'That folder was not found.');
  assert.equal(await openFolderOnly('Garden', shell), 'Only folders can be opened.');
  assert.equal(await openFolderOnly(`${folder}\0`, shell), 'Only folders can be opened.');
  assert.equal(await openFolderOnly(undefined, shell), 'Only folders can be opened.');
  assert.deepEqual(shell.opened, []);
});

test('on macOS an app is a folder that runs, so it is refused, also through a link', async () => {
  const shell = recorder();
  assert.equal(await openFolderOnly(app, { ...shell, platform: 'darwin' }), 'Only folders can be opened.');
  assert.equal(await openFolderOnly(path.join(scratch, 'Tools'), { ...shell, platform: 'darwin' }), 'Only folders can be opened.');
  assert.equal(await openFolderOnly(folder, { ...shell, platform: 'darwin' }), '');
  assert.equal(await openFolderOnly(app, { ...shell, platform: 'linux' }), '', 'elsewhere it is just a folder');
  assert.deepEqual(shell.opened, [folder, app]);
});
