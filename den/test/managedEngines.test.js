import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { swapManagedDirectory } from '../src/lib/localEngine.js';

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
