import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyHuggingFaceFile,
  normalizeHuggingFaceModelSort,
  summarizeHuggingFaceModel,
} from '../src/ai/controllers/ai/huggingFaceModelCompatibility.js';

test('allows supported Hugging Face sorts and rejects arbitrary values', () => {
  assert.equal(normalizeHuggingFaceModelSort('downloads'), 'downloads');
  assert.equal(normalizeHuggingFaceModelSort('trendingScore'), 'trendingScore');
  assert.equal(normalizeHuggingFaceModelSort('lastModified'), 'lastModified');
  assert.equal(normalizeHuggingFaceModelSort('createdAt'), 'createdAt');
  assert.equal(normalizeHuggingFaceModelSort('likes'), 'likes');
  assert.equal(normalizeHuggingFaceModelSort('unexpected'), 'downloads');
  assert.equal(normalizeHuggingFaceModelSort(), 'downloads');
});

test('excludes generic Transformers repositories from local-model search', () => {
  const summary = summarizeHuggingFaceModel({
    id: 'Qwen/Qwen3-8B',
    pipeline_tag: 'text-generation',
    tags: ['transformers', 'safetensors'],
    siblings: [
      { rfilename: 'config.json' },
      { rfilename: 'model-00001-of-00004.safetensors' },
    ],
  });

  assert.equal(summary.compatible, false);
  assert.equal(summary.compatibleFileCount, 0);
});

test('detects GGUF repositories as runnable local models', () => {
  const summary = summarizeHuggingFaceModel({
    id: 'unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF',
    pipeline_tag: 'text-generation',
    siblings: [
      { rfilename: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf' },
      { rfilename: 'README.md' },
    ],
  });

  assert.equal(summary.compatible, true);
  assert.deepEqual(summary.targetKinds, ['model']);
  assert.deepEqual(summary.formats, ['GGUF']);
});

test('classifies Whisper files separately from general LLM files', () => {
  assert.deepEqual(
    classifyHuggingFaceFile('ggml-large-v3.bin', { repoId: 'ggerganov/whisper.cpp' }),
    ['whisper'],
  );
  assert.deepEqual(
    classifyHuggingFaceFile('ggml-model-q4_0.bin', { repoId: 'legacy/llama.cpp-model' }),
    ['model'],
  );
});

test('requires a Piper model file, not only its JSON config', () => {
  const configOnly = summarizeHuggingFaceModel({
    id: 'rhasspy/piper-voices',
    siblings: [{ rfilename: 'en_US-lessac-medium.onnx.json' }],
  });
  const completeVoice = summarizeHuggingFaceModel({
    id: 'rhasspy/piper-voices',
    siblings: [
      { rfilename: 'en_US-lessac-medium.onnx' },
      { rfilename: 'en_US-lessac-medium.onnx.json' },
    ],
  });

  assert.equal(configOnly.compatible, false);
  assert.equal(completeVoice.compatible, true);
  assert.deepEqual(completeVoice.targetKinds, ['tts']);
});

test('allows image weights only when repository metadata is image-specific', () => {
  const imageModel = summarizeHuggingFaceModel({
    id: 'black-forest-labs/FLUX.1-dev',
    pipeline_tag: 'text-to-image',
    siblings: [{ rfilename: 'flux1-dev.safetensors' }],
  });
  const textModel = summarizeHuggingFaceModel({
    id: 'acme/text-model',
    pipeline_tag: 'text-generation',
    siblings: [{ rfilename: 'model.safetensors' }],
  });

  assert.equal(imageModel.compatible, true);
  assert.deepEqual(imageModel.targetKinds, ['image']);
  assert.equal(textModel.compatible, false);
});
