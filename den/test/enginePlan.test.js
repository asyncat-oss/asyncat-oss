import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { managedEnginesDiskUsage, planManagedRuntimeInstall } from '../src/lib/localEngine.js';

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

test('the install plan names the file and size for this computer, without downloading it', async (t) => {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    t.skip('the fake release only has a Linux x64 build');
    return;
  }
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return new Response(JSON.stringify({
      tag_name: 'v1.8.0',
      assets: [
        { name: 'whisper-bin-x64.zip', size: 4_000_000 },
        { name: 'whisper-linux-x64.tar.gz', size: 12_582_912 },
        { name: 'whisper-linux-x64-cuda.tar.gz', size: 90_000_000 },
        { name: 'whisper-macos-arm64.zip', size: 3_000_000 },
        { name: 'SHA256SUMS', size: 300 },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const plan = await planManagedRuntimeInstall('whisper', { capability: 'cpu_safe' });
    assert.equal(plan.version, 'v1.8.0');
    assert.equal(plan.assetName, 'whisper-linux-x64.tar.gz');
    assert.equal(plan.downloadBytes, 12_582_912);
    assert.equal(plan.downloadSize, '12.0 MB');
    assert.equal(plan.estimated, false);
    assert.deepEqual(asked, ['https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Python engines give an estimate and ask nothing online', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('no network in this test'); };
  try {
    const plan = await planManagedRuntimeInstall('piper');
    assert.equal(plan.installer, 'python');
    assert.equal(plan.estimated, true);
    assert.ok(plan.downloadBytes > 10 * 1024 * 1024);
    assert.deepEqual(plan.packages, ['piper-tts']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('an unknown engine has no plan', async () => {
  await assert.rejects(() => planManagedRuntimeInstall('nope'), /Unknown runtime/);
});

test('disk use is counted per engine folder', async () => {
  const env = withHome();
  try {
    fs.mkdirSync(path.join(env.home, 'whisper.cpp', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(env.home, 'whisper.cpp', 'bin', 'whisper-server'), Buffer.alloc(2048));
    fs.writeFileSync(path.join(env.home, 'whisper.cpp', 'ggml.so'), Buffer.alloc(1024));
    fs.mkdirSync(path.join(env.home, 'downloads'), { recursive: true });
    fs.writeFileSync(path.join(env.home, 'downloads', 'x.part'), Buffer.alloc(512));
    const usage = await managedEnginesDiskUsage();
    const byId = Object.fromEntries(usage.map((entry) => [entry.id, entry]));
    assert.equal(byId.whisper.bytes, 3072);
    assert.equal(byId.whisper.exists, true);
    assert.equal(byId.downloads.bytes, 512);
    assert.equal(byId.sd.exists, false);
    assert.equal(byId.sd.bytes, 0);
    assert.ok(byId.llama);
  } finally {
    env.cleanup();
  }
});
