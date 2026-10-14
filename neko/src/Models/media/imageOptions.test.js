import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_OPTIONS, changedCount, imagesMadeText, optionFields, optionsSummary, picturesUrl, resultMeta, saveOptions, savedOptions, shapeSize, tryOptions,
} from './imageOptions.js';

test('shapes follow the model’s own size', () => {
  assert.deepEqual(shapeSize('square', { width: 512, height: 512 }), { width: 512, height: 512 });
  assert.deepEqual(shapeSize('wide', { width: 512, height: 512 }), { width: 768, height: 512 });
  assert.deepEqual(shapeSize('tall', { width: 1024, height: 1024 }), { width: 1024, height: 1536 });
  assert.deepEqual(shapeSize('wide', { width: 768, height: 768 }), { width: 1152, height: 768 });
  assert.deepEqual(shapeSize('square', {}), { width: 512, height: 512 });
});

test('each engine gets only the options it honours', () => {
  assert.deepEqual(optionFields('openai'), { size: false, avoid: false, seed: false, steps: false, sampler: false, scheduler: false, checkpoint: false });
  assert.equal(optionFields('fal').seed, true);
  assert.equal(optionFields('local').scheduler, false);
  assert.equal(optionFields('comfyui').checkpoint, true);

  const options = { ...EMPTY_OPTIONS, shape: 'wide', negativePrompt: ' blurry ', seed: '42', steps: '30', cfg: '6.5', sampler: 'euler_a', scheduler: 'karras', checkpoint: 'dreamshaper_8.safetensors' };
  assert.deepEqual(tryOptions(options, 'local', { width: 512, height: 512 }), {
    width: 768, height: 512, negativePrompt: 'blurry', seed: 42, steps: 30, cfg: 6.5, sampler: 'euler_a',
  });
  assert.deepEqual(tryOptions(options, 'comfyui', { width: 768, height: 768 }), {
    width: 1152, height: 768, negativePrompt: 'blurry', seed: 42, steps: 30, cfg: 6.5, sampler: 'euler_a', scheduler: 'karras', checkpoint: 'dreamshaper_8.safetensors',
  });
  assert.deepEqual(tryOptions(options, 'stability', { width: 1024, height: 1024 }), { width: 1536, height: 1024, negativePrompt: 'blurry', seed: 42 });
  assert.deepEqual(tryOptions(options, 'openai', { width: 1024, height: 1024 }), { width: 1536, height: 1024 });
  // Empty or nonsense means "the default".
  assert.deepEqual(tryOptions({ ...EMPTY_OPTIONS, seed: 'abc', steps: '' }, 'local', { width: 512, height: 512 }), { width: 512, height: 512 });
});

test('the summary line and the result line', () => {
  assert.equal(optionsSummary(EMPTY_OPTIONS, 'local', { width: 512, height: 512, steps: 24 }), 'Square · 512 × 512 · 24 steps · random seed');
  assert.equal(optionsSummary({ ...EMPTY_OPTIONS, shape: 'wide', seed: '42', steps: '8' }, 'local', { width: 512, height: 512, steps: 24 }), 'Wide · 768 × 512 · 8 steps · seed 42');
  // A service makes its own size for the shape: the line doesn't promise one.
  assert.equal(optionsSummary(EMPTY_OPTIONS, 'openai', {}), 'Square');
  assert.equal(optionsSummary({ ...EMPTY_OPTIONS, shape: 'wide' }, 'gemini', {}), 'Wide');
  assert.equal(optionsSummary(EMPTY_OPTIONS, 'fal', {}), 'Square · random seed');
  assert.equal(optionsSummary(EMPTY_OPTIONS, 'comfyui', { width: 768, height: 768, steps: 20 }), 'Square · 768 × 768 · 20 steps · random seed');
  assert.equal(changedCount({ ...EMPTY_OPTIONS, seed: '1', sampler: 'euler', scheduler: 'karras' }, 'local'), 2);
  assert.equal(changedCount({ ...EMPTY_OPTIONS, seed: '1' }, 'openai'), 0);
  assert.equal(resultMeta({ width: 512, height: 512, seed: 4113 }, 6.2), '512 × 512 · seed 4113 · 6 s');
  assert.equal(resultMeta({ width: 1024, height: 1024, seed: null }, 0.3), '1024 × 1024 · 1 s');
  assert.equal(picturesUrl(), '/files/made?kind=picture');
  assert.equal(picturesUrl('cat 1.png'), '/files/made?kind=picture&open=cat%201.png');
  assert.equal(imagesMadeText(1), '1 image made');
  assert.equal(imagesMadeText(34), '34 images made');
});

test('options last for the session', () => {
  saveOptions({ shape: 'tall', seed: '7' });
  assert.equal(savedOptions().shape, 'tall');
  assert.equal(savedOptions().steps, '');
  saveOptions(EMPTY_OPTIONS);
  assert.equal(savedOptions().shape, 'square');
});
