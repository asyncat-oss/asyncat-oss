import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Guided training, step 2: what fits the GPU, roughly how long it takes,
// and what has to be downloaded first.

const { GUIDED_MODELS, fitFor, guidedModel, hfModelCached, planFor, recommendModel, suggestedEpochs } = await import('../src/training/trainingPlan.js');

const laptop = { backend: 'cuda', vramGb: 6 };

test('a 6 GB GPU fits the small models, and the 4B one only just', () => {
  assert.equal(fitFor(guidedModel('qwen3-1.7b'), laptop), 'ok');
  assert.equal(fitFor(guidedModel('llama-3.2-3b'), laptop), 'ok');
  assert.equal(fitFor(guidedModel('qwen3-4b-instruct'), laptop), 'no');
  assert.equal(fitFor(guidedModel('qwen3-4b-instruct'), { backend: 'cuda', vramGb: 8 }), 'ok');
  assert.equal(fitFor(guidedModel('qwen3-1.7b'), { backend: 'cpu' }), 'cpu');
  assert.equal(recommendModel(laptop), 'llama-3.2-3b');
  assert.equal(recommendModel({ backend: 'cuda', vramGb: 4 }), 'qwen3-1.7b');
  assert.equal(recommendModel(null), 'qwen3-1.7b');
  for (const model of GUIDED_MODELS) {
    assert.match(model.gguf.file, /\.gguf$/);
    assert.ok(model.train.bytes > 1e9 && model.gguf.bytes > 1e9);
  }
});

test('a plan says how long, and lists only the downloads still needed', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-hf-'));
  const previous = process.env.HF_HUB_CACHE;
  process.env.HF_HUB_CACHE = cache;
  try {
    const model = guidedModel('qwen3-1.7b');
    const data = { examples: 120, tokens: 60_000 };
    const fresh = planFor(model, { gpu: laptop, data, have: {} });
    assert.equal(fresh.epochs, 3);
    assert.equal(fresh.tokens, 180_000);
    assert.ok(fresh.minutes[0] >= 1 && fresh.minutes[1] > fresh.minutes[0]);
    assert.ok(fresh.minutes[1] < 15, `small data trains in minutes, not ${fresh.minutes[1]}`);
    assert.equal(fresh.downloads.length, 3);

    // The model to train on is already downloaded, and so is the GGUF.
    const snapshot = path.join(cache, `models--${model.train.repo.replace('/', '--')}`, 'snapshots', 'abc');
    fs.mkdirSync(snapshot, { recursive: true });
    fs.writeFileSync(path.join(snapshot, 'config.json'), '{}');
    assert.equal(hfModelCached(model.train.repo), true);
    const ready = planFor(model, { gpu: laptop, data, have: { envReady: true, ggufPath: '/models/x.gguf' } });
    assert.deepEqual(ready.downloads, []);
    assert.equal(ready.downloadBytes, 0);

    const cpu = planFor(model, { gpu: { backend: 'cpu' }, data, have: {} });
    assert.equal(cpu.fit, 'cpu');
    assert.ok(cpu.minutes[0] > fresh.minutes[1] * 5, 'without a GPU it takes far longer');
  } finally {
    if (previous === undefined) delete process.env.HF_HUB_CACHE;
    else process.env.HF_HUB_CACHE = previous;
    fs.rmSync(cache, { recursive: true, force: true });
  }
  assert.equal(suggestedEpochs(5000), 1);
});
