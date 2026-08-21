import test from 'node:test';
import assert from 'node:assert/strict';

import { getModelCapabilities } from '../src/ai/controllers/ai/modelCapabilities.js';

test('detects image input from provider model metadata', () => {
  const capabilities = getModelCapabilities('openrouter', 'vendor/new-model', {
    architecture: { input_modalities: ['text', 'image'] },
  });

  assert.equal(capabilities.supportsImageInput, true);
  assert.deepEqual(capabilities.inputModalities, ['text', 'image']);
});

test('honors explicit text-only metadata before name heuristics', () => {
  const capabilities = getModelCapabilities('openrouter', 'vendor/gpt-5-custom', {
    capabilities: { supportsImageInput: false },
  });

  assert.equal(capabilities.supportsImageInput, false);
  assert.deepEqual(capabilities.inputModalities, ['text']);
});

test('detects common multimodal language model names', () => {
  assert.equal(getModelCapabilities('llamacpp-builtin', 'Qwen2.5-VL-7B-Q4_K_M.gguf').supportsImageInput, true);
  assert.equal(getModelCapabilities('openai', 'gpt-4o-mini').supportsImageInput, true);
  assert.equal(getModelCapabilities('custom', 'plain-text-model').supportsImageInput, false);
});

test('does not advertise images for adapters that currently flatten multimodal input', () => {
  assert.equal(getModelCapabilities('openai-codex', 'gpt-5.5').supportsImageInput, false);
  assert.equal(getModelCapabilities('codex-cli', 'gpt-5.5').supportsImageInput, false);
});

