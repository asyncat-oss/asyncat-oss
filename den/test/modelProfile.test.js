import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-modelprofile-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

const { describeModel } = await import('../src/ai/controllers/ai/modelProfile.js');
const { findVisionProjector } = await import('../src/ai/controllers/ai/llamaServerManager.js');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test("a local server's real context size and image support win over name guesses", () => {
  const profile = describeModel({
    model: 'gemma-3-4b-it-Q4_K_M.gguf',
    isLocal: true,
    providerInfo: {
      providerId: 'llamacpp-builtin',
      settings: { context_window: 32768, model_capabilities: { supportsImageInput: false } },
    },
  });
  assert.equal(profile.contextWindow, 32768);
  assert.equal(profile.contextSource, 'settings');
  assert.equal(profile.supportsImages, false, 'no projector loaded, so no images, despite the name');
});

test('cloud models fall back to the known-model registry', () => {
  const profile = describeModel({ model: 'claude-sonnet-4-5', providerInfo: { providerId: 'anthropic', settings: {} } });
  assert.ok(profile.contextWindow >= 200000);
  assert.equal(profile.supportsImages, true);
});

test('the vision projector next to a model is found, preferring the matching one', () => {
  const dir = fs.mkdtempSync(path.join(scratch, 'models-'));
  for (const name of ['Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf', 'mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf', 'mmproj-gemma-3-4b-f16.gguf']) {
    fs.writeFileSync(path.join(dir, name), '');
  }
  assert.equal(path.basename(findVisionProjector(path.join(dir, 'Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf'))), 'mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf');
  const lone = fs.mkdtempSync(path.join(scratch, 'plain-'));
  fs.writeFileSync(path.join(lone, 'llama-3.2-3b.gguf'), '');
  assert.equal(findVisionProjector(path.join(lone, 'llama-3.2-3b.gguf')), null);
});
