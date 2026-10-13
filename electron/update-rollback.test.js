import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  dismissRollback,
  installAppImageUpdate,
  markBooted,
  noteLaunch,
  previousCopyPath,
  readUpdateState,
  rollBack,
} from './update-rollback.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-rollback-'));
  const appImage = path.join(dir, 'Asyncat.AppImage');
  const stateFile = path.join(dir, 'update-state.json');
  fs.writeFileSync(appImage, 'version 8');
  const download = (text) => {
    const file = path.join(dir, '.Asyncat.AppImage.update');
    fs.writeFileSync(file, text, { mode: 0o644 });
    return file;
  };
  return { dir, appImage, stateFile, download, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('an AppImage update keeps the running version as .previous', () => {
  const t = setup();
  try {
    const previous = installAppImageUpdate({
      downloaded: t.download('version 9'),
      appImagePath: t.appImage,
      stateFile: t.stateFile,
      newVersion: '0.8.0-beta.9',
      currentVersion: '0.8.0-beta.8',
    });
    assert.equal(previous, previousCopyPath(t.appImage));
    assert.equal(fs.readFileSync(t.appImage, 'utf8'), 'version 9');
    assert.equal(fs.statSync(t.appImage).mode & 0o111, 0o111);
    assert.equal(fs.readFileSync(previous, 'utf8'), 'version 8');
    const { pending } = readUpdateState(t.stateFile);
    assert.equal(pending.version, '0.8.0-beta.9');
    assert.equal(pending.previousVersion, '0.8.0-beta.8');

    // A second update before restarting keeps the version that actually runs.
    installAppImageUpdate({
      downloaded: t.download('version 10'),
      appImagePath: t.appImage,
      stateFile: t.stateFile,
      newVersion: '0.8.0-beta.10',
      currentVersion: '0.8.0-beta.8',
    });
    assert.equal(fs.readFileSync(t.appImage, 'utf8'), 'version 10');
    assert.equal(fs.readFileSync(previous, 'utf8'), 'version 8');
    assert.equal(readUpdateState(t.stateFile).pending.previousVersion, '0.8.0-beta.8');
  } finally {
    t.cleanup();
  }
});

test('a new version that starts properly drops the previous copy', () => {
  const t = setup();
  try {
    installAppImageUpdate({ downloaded: t.download('version 9'), appImagePath: t.appImage, stateFile: t.stateFile, newVersion: '0.9.0', currentVersion: '0.8.0' });
    // The old version, still running, starts nothing new.
    assert.equal(noteLaunch(t.stateFile, { currentVersion: '0.8.0', appImagePath: t.appImage }).action, 'none');
    assert.ok(readUpdateState(t.stateFile).pending, 'the swap stays recorded until the new version runs');

    const first = noteLaunch(t.stateFile, { currentVersion: '0.9.0', appImagePath: t.appImage });
    assert.equal(first.action, 'watch');
    assert.equal(first.canRollBack, true);
    assert.equal(markBooted(t.stateFile, { currentVersion: '0.9.0' }), true);
    assert.equal(fs.existsSync(previousCopyPath(t.appImage)), false);
    assert.deepEqual(readUpdateState(t.stateFile), {});
    assert.equal(noteLaunch(t.stateFile, { currentVersion: '0.9.0', appImagePath: t.appImage }).action, 'none');
  } finally {
    t.cleanup();
  }
});

test('a new version that never finished starting is offered a way back', () => {
  const t = setup();
  try {
    installAppImageUpdate({ downloaded: t.download('version 9'), appImagePath: t.appImage, stateFile: t.stateFile, newVersion: '0.9.0', currentVersion: '0.8.0' });
    assert.equal(noteLaunch(t.stateFile, { currentVersion: '0.9.0', appImagePath: t.appImage }).action, 'watch');
    // No "booted" mark, and it is started again.
    assert.equal(noteLaunch(t.stateFile, { currentVersion: '0.9.0', appImagePath: t.appImage }).action, 'offer-rollback');

    assert.equal(rollBack(t.stateFile), t.appImage);
    assert.equal(fs.readFileSync(t.appImage, 'utf8'), 'version 8');
    assert.equal(fs.existsSync(previousCopyPath(t.appImage)), false);
    assert.deepEqual(readUpdateState(t.stateFile), {});
    assert.throws(() => rollBack(t.stateFile), /no longer there/);
    // The old version starts normally afterwards.
    assert.equal(noteLaunch(t.stateFile, { currentVersion: '0.8.0', appImagePath: t.appImage }).action, 'none');
  } finally {
    t.cleanup();
  }
});

test('"Keep this version" stops asking but keeps the copy until it boots', () => {
  const t = setup();
  try {
    installAppImageUpdate({ downloaded: t.download('version 9'), appImagePath: t.appImage, stateFile: t.stateFile, newVersion: '0.9.0', currentVersion: '0.8.0' });
    noteLaunch(t.stateFile, { currentVersion: '0.9.0', appImagePath: t.appImage });
    dismissRollback(t.stateFile);
    assert.equal(noteLaunch(t.stateFile, { currentVersion: '0.9.0', appImagePath: t.appImage }).action, 'watch');
    assert.equal(fs.existsSync(previousCopyPath(t.appImage)), true);
    markBooted(t.stateFile, { currentVersion: '0.9.0' });
    assert.equal(fs.existsSync(previousCopyPath(t.appImage)), false);
  } finally {
    t.cleanup();
  }
});
