import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';

import { extractArchive, findOnPath, runProcess } from '../src/lib/engineArchive.js';

const hasTar = Boolean(process.platform !== 'win32' && (() => {
  try { execFileSync('tar', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})());

test('a zip unpacks into the folder, nested folders included', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-archive-'));
  try {
    const zip = new JSZip();
    zip.file('build/bin/llama-server', '#!/bin/sh\necho ok\n');
    zip.file('build/bin/libllama.so.1.0.0', 'lib');
    const archive = path.join(dir, 'llama.zip');
    fs.writeFileSync(archive, await zip.generateAsync({ type: 'nodebuffer' }));
    const out = path.join(dir, 'staging');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'stale'), 'from an earlier try');
    await extractArchive(archive, out);
    assert.equal(fs.readFileSync(path.join(out, 'build', 'bin', 'libllama.so.1.0.0'), 'utf8'), 'lib');
    assert.equal(fs.existsSync(path.join(out, 'stale')), false, 'the folder is emptied first');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a .tar.gz unpacks too', { skip: !hasTar }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-archive-'));
  try {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(src, 'bin', 'whisper-server'), 'w');
    const archive = path.join(dir, 'whisper.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', src, '.']);
    const out = path.join(dir, 'out');
    await extractArchive(archive, out);
    assert.equal(fs.readFileSync(path.join(out, 'bin', 'whisper-server'), 'utf8'), 'w');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a broken archive fails with the tool\'s message', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-archive-'));
  try {
    const archive = path.join(dir, 'broken.zip');
    fs.writeFileSync(archive, 'not a zip');
    await assert.rejects(extractArchive(archive, path.join(dir, 'out')), /exited with code|unzip is needed|Expand-Archive/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unpacking runs beside the server, not instead of it, and can be cancelled', async () => {
  // A child process that takes a while: the event loop keeps ticking.
  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; }, 10);
  try {
    await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 300)']);
    assert.ok(ticks >= 5, `the event loop ran ${ticks} times while waiting`);
  } finally {
    clearInterval(timer);
  }

  const controller = new AbortController();
  const started = Date.now();
  const pending = runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(pending, (error) => error.cancelled === true);
  assert.ok(Date.now() - started < 5000);

  await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(3)']), /exited with code 3/);
});

test('programs are found on PATH without a shell', async () => {
  const found = await findOnPath(path.basename(process.execPath, '.exe'), { ...process.env, PATH: path.dirname(process.execPath) });
  assert.equal(found && path.resolve(found).toLowerCase(), path.resolve(process.execPath).toLowerCase());
  assert.equal(await findOnPath('surely-not-a-real-program-asyncat'), null);
});
