import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateModelFit,
  estimateModelMemory,
  extractParamsBillions,
  extractQuantization,
} from '../src/ai/controllers/ai/modelFitEstimator.js';

const gib = 1024 ** 3;

const nvidiaMachine = {
  ram: { totalGb: 32, freeGb: 26 },
  gpu: [{ vendor: 'NVIDIA', name: 'Test GPU', vramTotalGb: 8, vramFreeGb: 7.5 }],
};

test('parses total parameters and quantization from common model names', () => {
  assert.equal(extractParamsBillions('Qwen3.5-35B-A3B-Q4_K_M.gguf'), 35);
  assert.equal(extractParamsBillions('Mixtral-8x7B-Instruct-Q5_K_M.gguf'), 56);
  assert.equal(extractQuantization('model-Q5_K_M.gguf'), 'q5_k_m');
});

test('prefers concrete file size and grows with selected context', () => {
  const at4k = estimateModelMemory({ modelName: 'model-7B-Q4_K_M.gguf', sizeBytes: 5 * gib, contextLength: 4096 });
  const at16k = estimateModelMemory({ modelName: 'model-7B-Q4_K_M.gguf', sizeBytes: 5 * gib, contextLength: 16384 });

  assert.equal(at4k.estimateSource, 'file_size');
  assert.equal(at4k.weightsGb, 5);
  assert.ok(at16k.totalGb > at4k.totalGb);
});

test('classifies a comfortable full-GPU fit', () => {
  const fit = estimateModelFit({ modelName: 'model-7B-Q4_K_M.gguf', sizeBytes: 5 * gib }, nvidiaMachine);
  assert.equal(fit.status, 'great');
  assert.equal(fit.placement, 'gpu');
});

test('classifies system-RAM spill as partial GPU offload', () => {
  const fit = estimateModelFit({ modelName: 'model-20B-Q4_K_M.gguf', sizeBytes: 12 * gib }, nvidiaMachine);
  assert.equal(fit.status, 'partial');
  assert.equal(fit.placement, 'partial_gpu');
});

test('uses combined discrete VRAM and RAM capacity for partial offload', () => {
  const fit = estimateModelFit(
    { modelName: 'model-30B-Q4_K_M.gguf', sizeBytes: 17 * gib },
    { ...nvidiaMachine, ram: { totalGb: 16, freeGb: 14 } },
  );
  assert.equal(fit.status, 'partial');
  assert.ok(fit.estimatedMemoryGb > 16);
});

test('understands Apple-style unified memory', () => {
  const fit = estimateModelFit(
    { modelName: 'model-20B-Q4_K_M.gguf', sizeBytes: 12 * gib },
    {
      ram: { totalGb: 16, freeGb: 15 },
      gpu: [{ vendor: 'Apple', name: 'Apple Silicon', vramTotalGb: 16, unifiedMemory: true }],
    },
  );
  assert.equal(fit.placement, 'unified');
  assert.ok(['fits', 'tight'].includes(fit.status));
});

test('marks models larger than both VRAM and RAM as too large', () => {
  const fit = estimateModelFit(
    { modelName: 'model-70B-Q4_K_M.gguf', sizeBytes: 30 * gib },
    { ...nvidiaMachine, ram: { totalGb: 16, freeGb: 14 } },
  );
  assert.equal(fit.status, 'too_large');
});
