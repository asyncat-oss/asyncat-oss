import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  cleanupManagedEngineLeftovers,
  listManagedEngineInstalls,
  swapManagedDirectory,
} from '../src/lib/localEngine.js';

// Every managed path must live inside Asyncat's home; point it at a temp dir.
function withHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-home-'));
  const previous = process.env.ASYNCAT_HOME;
  process.env.ASYNCAT_HOME = home;
  return {
    home,
    cleanup() {
      if (previous === undefined) delete process.env.ASYNCAT_HOME;
      else process.env.ASYNCAT_HOME = previous;
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

function makeDir(dir, marker) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'llama-server'), marker);
}

const read = (dir) => fs.readFileSync(path.join(dir, 'llama-server'), 'utf8');
const leftovers = (root) => fs.readdirSync(root).filter((name) => /\.(backup|install)-/.test(name));

test('a swap replaces the engine and removes the backup', () => {
  const t = withHome();
  try {
    const root = path.join(t.home, 'llama.cpp', 'profiles');
    const target = path.join(root, 'cpu-safe');
    const staging = path.join(root, '.cpu-safe.install-1');
    makeDir(target, 'old');
    makeDir(staging, 'new');
    swapManagedDirectory(staging, target);
    assert.equal(read(target), 'new');
    assert.deepEqual(leftovers(root), []);
  } finally {
    t.cleanup();
  }
});

test('the live engine survives when it cannot be moved aside', () => {
  const t = withHome();
  try {
    const root = path.join(t.home, 'llama.cpp', 'profiles');
    const target = path.join(root, 'cpu-safe');
    const staging = path.join(root, '.cpu-safe.install-1');
    makeDir(target, 'old');
    makeDir(staging, 'new');
    // Windows: a running llama-server.exe keeps its folder from being renamed.
    const rename = (from, to) => {
      if (from === target) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      fs.renameSync(from, to);
    };
    assert.throws(() => swapManagedDirectory(staging, target, { rename }), /still using it/);
    assert.equal(read(target), 'old', 'the working engine is untouched');
    assert.equal(fs.existsSync(staging), false, 'the unused new copy is removed');
    assert.deepEqual(leftovers(root), []);
  } finally {
    t.cleanup();
  }
});

test('the backup is put back when the new copy cannot be moved in', () => {
  const t = withHome();
  try {
    const root = path.join(t.home, 'whisper.cpp-parent');
    const target = path.join(root, 'whisper.cpp');
    const staging = path.join(root, '.whisper.cpp.install-1');
    makeDir(target, 'old');
    makeDir(staging, 'new');
    const rename = (from, to) => {
      if (from === staging) throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
      fs.renameSync(from, to);
    };
    assert.throws(() => swapManagedDirectory(staging, target, { rename }), /EXDEV/);
    assert.equal(read(target), 'old');
    assert.deepEqual(leftovers(root), []);
  } finally {
    t.cleanup();
  }
});

test('install and backup folders are never listed as engines', () => {
  const t = withHome();
  try {
    const profiles = path.join(t.home, 'llama.cpp', 'profiles');
    makeDir(path.join(profiles, 'cpu-safe'), 'engine');
    makeDir(path.join(profiles, '.cpu-safe.install-0f3c9a2e-1111-2222-3333-444455556666'), 'half');
    makeDir(path.join(profiles, 'cpu-safe.backup-0f3c9a2e-1111-2222-3333-444455556666'), 'old');
    const roots = listManagedEngineInstalls().map((item) => path.basename(item.root));
    assert.deepEqual(roots, ['cpu-safe']);
  } finally {
    t.cleanup();
  }
});

test('startup clean-up removes half-made copies and puts back stranded ones', async () => {
  const t = withHome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-tmp-'));
  try {
    const id = '0f3c9a2e-1111-2222-3333-444455556666';
    const profiles = path.join(t.home, 'llama.cpp', 'profiles');
    // A finished swap whose backup could not be deleted.
    makeDir(path.join(profiles, 'cpu-safe'), 'new');
    makeDir(path.join(profiles, `cpu-safe.backup-${id}`), 'old');
    // Interrupted between "old aside" and "new in": only the backup exists.
    makeDir(path.join(profiles, `vulkan.backup-${id}`), 'vulkan');
    // A copy that was still being prepared.
    makeDir(path.join(profiles, `.nvidia-gpu.install-${id}`), 'half');
    makeDir(path.join(t.home, `.whisper.cpp.install-${id}`), 'half');

    // An older Asyncat rebuilt a Python environment in place and was stopped:
    // the half-made one has no marker, the moved-aside one finished.
    const venv = path.join(t.home, 'llama.cpp', 'python');
    fs.mkdirSync(venv, { recursive: true });
    fs.writeFileSync(path.join(venv, 'pyvenv.cfg'), 'home = /usr/bin');
    const oldVenv = path.join(t.home, 'llama.cpp', `python.backup-${id}`);
    fs.mkdirSync(oldVenv, { recursive: true });
    fs.writeFileSync(path.join(oldVenv, 'asyncat-engine.json'), '{"profile":"nvidia_gpu"}');

    const legacyTmp = path.join(tmp, 'asyncat-llama-abc');
    fs.mkdirSync(legacyTmp);
    const recentTmp = path.join(tmp, 'asyncat-sd-def');
    fs.mkdirSync(recentTmp);
    const old = Date.now() / 1000 - 24 * 60 * 60;
    fs.utimesSync(legacyTmp, old, old);

    const report = await cleanupManagedEngineLeftovers({ tmpDir: tmp });
    assert.equal(read(path.join(profiles, 'cpu-safe')), 'new');
    assert.equal(read(path.join(profiles, 'vulkan')), 'vulkan');
    assert.deepEqual(fs.readdirSync(profiles).sort(), ['cpu-safe', 'vulkan']);
    assert.equal(fs.existsSync(path.join(t.home, `.whisper.cpp.install-${id}`)), false);
    assert.equal(fs.existsSync(path.join(venv, 'asyncat-engine.json')), true, 'the finished environment is back');
    assert.equal(fs.existsSync(oldVenv), false);
    assert.equal(fs.existsSync(legacyTmp), false);
    assert.equal(fs.existsSync(recentTmp), true, 'a temp folder in use by a running install is left alone');
    assert.equal(report.restored.length, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    t.cleanup();
  }
});

test('a first install has nothing to back up', () => {
  const t = withHome();
  try {
    const root = path.join(t.home, 'llama.cpp', 'profiles');
    const staging = path.join(root, '.vulkan.install-1');
    makeDir(staging, 'new');
    swapManagedDirectory(staging, path.join(root, 'vulkan'));
    assert.equal(read(path.join(root, 'vulkan')), 'new');
    assert.throws(() => swapManagedDirectory(path.join(os.tmpdir(), 'x'), path.join(root, 'vulkan')), /outside Asyncat home/);
  } finally {
    t.cleanup();
  }
});
