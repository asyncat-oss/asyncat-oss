import test from 'node:test';
import assert from 'node:assert/strict';

import { pauseForEngineSwap, selectionVerificationTimeout, verifyEngineSelection } from '../src/ai/controllers/ai/llamaServerManager.js';

function fakeServer(initial) {
  const calls = [];
  let current = { ...initial };
  return {
    calls,
    status: () => current,
    stop: async () => { calls.push(['stop']); current = { status: 'idle' }; },
    start: async (model, modelsDir, ctxSize) => { calls.push(['start', model, modelsDir, ctxSize]); },
  };
}

test('the model keeps running until the swap and comes back after a successful install', async () => {
  const server = fakeServer({ status: 'ready', model: 'qwen.gguf', modelPath: '/models/elsewhere/qwen.gguf', ctxSize: 8192 });
  const pause = pauseForEngineSwap(server);
  assert.deepEqual(server.calls, [], 'nothing stops while downloading');
  await pause.stop();
  const retry = await pause.restart({ modelsDir: '/models' });
  assert.deepEqual(server.calls, [['stop'], ['start', '/models/elsewhere/qwen.gguf', '/models', 8192]]);
  assert.equal(retry.success, true);
  assert.equal(retry.restoredPrevious, true);
});

test('a failed install brings back the model it stopped, and only that', async () => {
  const running = fakeServer({ status: 'ready', model: 'a.gguf', modelPath: '/m/a.gguf', ctxSize: 4096 });
  const pause = pauseForEngineSwap(running);
  await pause.stop();
  pause.restoreAfterFailure('/m');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(running.calls.at(-1), ['start', '/m/a.gguf', '/m', 4096]);

  // Failed before the swap: nothing was stopped, so nothing is started.
  const untouched = fakeServer({ status: 'ready', model: 'a.gguf', modelPath: '/m/a.gguf' });
  pauseForEngineSwap(untouched).restoreAfterFailure('/m');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(untouched.calls, []);
});

test('a model asked for with the install is started; with nothing running, nothing is', async () => {
  const idle = fakeServer({ status: 'idle' });
  const pause = pauseForEngineSwap(idle);
  await pause.stop();
  assert.equal((await pause.restart({ modelsDir: '/m' })).attempted, false);

  const retry = await pauseForEngineSwap(idle).restart({ retryModel: 'b.gguf', ctxSize: 2048, modelsDir: '/m' });
  assert.equal(retry.attempted, true);
  assert.deepEqual(idle.calls.at(-1), ['start', 'b.gguf', '/m', 2048]);

  const failing = { ...fakeServer({ status: 'ready', model: 'c.gguf' }), start: async () => { throw new Error('OOM'); } };
  const pausedFailing = pauseForEngineSwap(failing);
  await pausedFailing.stop();
  const result = await pausedFailing.restart({ modelsDir: '/m' });
  assert.equal(result.success, false);
  assert.equal(result.error, 'OOM');
});

test('switching engines checks the binary like an install does, without blocking', async () => {
  // Same allowance as at install: CUDA builds get longer to start.
  assert.equal(selectionVerificationTimeout('/x/llama-server', { install: { metadata: { asset: 'llama-b1-bin-win-cuda-12.4-x64.zip' } }, env: {} }), 120000);
  assert.equal(selectionVerificationTimeout('/usr/bin/llama-server', { install: null, env: {} }), 30000);
  assert.equal(selectionVerificationTimeout('/opt/llama-cuda/bin/llama-server', { install: null, env: {} }), 120000);
  assert.equal(selectionVerificationTimeout('/usr/bin/llama-server', { install: null, env: { ASYNCAT_LLAMA_VERIFY_TIMEOUT_MS: '45000' } }), 45000);

  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; }, 5);
  try {
    const ok = await verifyEngineSelection('binary', process.execPath);
    assert.equal(ok.path, process.execPath);
  } finally {
    clearInterval(timer);
  }
  assert.ok(ticks >= 1, 'the event loop kept running during the check');

  await assert.rejects(verifyEngineSelection('binary', '/no/such/llama-server'), /not found/);
});
