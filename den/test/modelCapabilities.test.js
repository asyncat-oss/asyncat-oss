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


test('current Claude model names are recognised as seeing images', async () => {
  const { getModelCapabilities } = await import('../src/ai/controllers/ai/modelCapabilities.js');
  for (const model of ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5', 'claude-3-5-sonnet-latest', 'claude-fable-5-1']) {
    assert.equal(getModelCapabilities('anthropic', model).supportsImageInput, true, model);
  }
});

test('GPT-6 models: a 1.05M context, image input, five reasoning levels', async () => {
  const { inferContextWindowFromModel } = await import('../src/ai/controllers/ai/modelContextResolver.js');
  const { getProviderPreset } = await import('../src/ai/controllers/ai/providerCatalog.js');
  for (const model of ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna']) {
    const capabilities = getModelCapabilities('openai', model);
    assert.equal(capabilities.supportsImageInput, true, model);
    assert.equal(capabilities.reasoningType, 'effort_string', model);
    assert.ok(capabilities.reasoningTiers.includes('max'), model);
    assert.equal(inferContextWindowFromModel('openai', model), 1050000, model);
  }
  assert.equal(getProviderPreset('openai').model, 'gpt-6-astra');
  assert.equal(getProviderPreset('openai').contextWindow, 1050000);
});

test('reasoning levels map to the nearest one a model has', async () => {
  const { normalizeReasoningEffort } = await import('../src/ai/controllers/ai/modelCapabilities.js');
  const astra = getModelCapabilities('openai', 'gpt-6-astra');
  const gpt5 = getModelCapabilities('openai', 'gpt-5.2');
  const luna = getModelCapabilities('openai', 'gpt-6-luna');
  assert.equal(normalizeReasoningEffort('max', astra), 'max');
  assert.equal(normalizeReasoningEffort('xhigh', astra), 'xhigh');
  assert.equal(normalizeReasoningEffort('max', gpt5), 'high', 'models without max get their strongest level');
  assert.equal(normalizeReasoningEffort('off', astra), null, 'astra has no "none": nothing is sent');
  assert.equal(normalizeReasoningEffort('off', luna), 'none');
  assert.equal(normalizeReasoningEffort('auto', luna), null);
});

test('GPT-6 Sol and Luna fall back to text tool calls where Chat Completions has none', async () => {
  const { nativeToolsAllowed } = await import('../src/ai/controllers/ai/modelCapabilities.js');
  assert.equal(nativeToolsAllowed(getModelCapabilities('openai', 'gpt-6-astra'), 'high'), true);
  assert.equal(nativeToolsAllowed(getModelCapabilities('openai', 'gpt-6.1-sol'), 'auto'), false);
  assert.equal(nativeToolsAllowed(getModelCapabilities('openai', 'gpt-6-luna'), 'auto'), false, 'luna reasons by default');
  assert.equal(nativeToolsAllowed(getModelCapabilities('openai', 'gpt-6-luna'), 'off'), true);
  assert.equal(nativeToolsAllowed(getModelCapabilities('openai', 'gpt-5.2'), 'high'), true);

  const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');
  const sol = new AgentRuntime({ aiClient: {}, model: 'gpt-6.1-sol', supportsNativeTools: true, providerInfo: { providerId: 'openai' } });
  assert.equal(sol.supportsNativeTools, false);
  const astra = new AgentRuntime({ aiClient: {}, model: 'gpt-6-astra', supportsNativeTools: true, providerInfo: { providerId: 'openai' } });
  assert.equal(astra.supportsNativeTools, true);
});

test('Claude 5 models get their 1M context; older Haiku keeps 200K', async () => {
  const { inferContextWindowFromModel } = await import('../src/ai/controllers/ai/modelContextResolver.js');
  for (const model of ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) {
    assert.equal(inferContextWindowFromModel('anthropic', model), 1000000, model);
    assert.equal(getModelCapabilities('anthropic', model).supportsImageInput, true, model);
  }
  assert.equal(inferContextWindowFromModel('anthropic', 'claude-haiku-4-5'), 200000);
});
