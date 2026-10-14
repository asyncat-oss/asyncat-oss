import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadLabel, imageChoices, initialImageChoice, initialVoiceChoice, initialWhisperChoice, planBlocked, voiceChoices, whisperChoices,
} from './choices.js';

const catalog = {
  whisper: [
    { id: 'base', title: 'Base', file: 'ggml-base-q5_1.bin', englishFile: 'ggml-base.en-q5_1.bin', bytes: 59_700_000, note: 'Quick.', recommended: true },
    { id: 'small', title: 'Small', file: 'ggml-small-q5_1.bin', englishFile: 'ggml-small.en-q5_1.bin', bytes: 190_100_000 },
    { id: 'large-turbo', title: 'Large v3 Turbo', file: 'ggml-large-v3-turbo-q5_0.bin', englishFile: null, bytes: 574_000_000 },
  ],
  voices: [
    { id: 'en_US-lessac-medium', name: 'Lessac', language: 'English (US)', locale: 'en-US', recommended: true, bytes: 63_200_000 },
    { id: 'en_GB-alan-medium', name: 'Alan', language: 'English (UK)', locale: 'en-GB', bytes: 63_200_000 },
    { id: 'de_DE-thorsten-medium', name: 'Thorsten', language: 'German', locale: 'de-DE', bytes: 63_200_000 },
  ],
};

const library = {
  whisper: [
    { filename: 'ggml-base.en-q5_1.bin', path: '/m/audio/whisper/ggml-base.en-q5_1.bin', sizeBytes: 59_700_000 },
    { filename: 'ggml-medium.bin', path: '/home/sam/ggml-medium.bin', sizeBytes: 1_530_000_000, isExternal: true },
    { filename: 'gone.bin', path: '/mnt/gone.bin', isExternal: true, isMissing: true },
  ],
  tts: [
    { filename: 'en_GB-alan-medium.onnx', path: '/m/audio/tts/en_GB-alan-medium.onnx', sizeBytes: 63_200_000 },
    { filename: 'de_DE-thorsten-medium.onnx', path: '/m/audio/tts/de_DE-thorsten-medium.onnx', sizeBytes: 63_200_000, missingConfig: true },
    { filename: 'my-voice.onnx', path: '/m/audio/tts/my-voice.onnx', sizeBytes: 20_000_000 },
  ],
};

test('listening models know which file of theirs is here', () => {
  const english = whisperChoices(catalog, library, { english: true });
  assert.deepEqual(english.models.map((model) => [model.name, model.path]), [
    ['Base (English)', '/m/audio/whisper/ggml-base.en-q5_1.bin'],
    ['Small (English)', null],
    ['Large v3 Turbo', null],
  ]);
  // The multilingual Base isn't here, only the English one.
  assert.equal(whisperChoices(catalog, library, { english: false }).models[0].path, null);
  assert.deepEqual(english.others.map((file) => [file.name, file.path, file.missing]), [
    ['ggml-medium.bin', '/home/sam/ggml-medium.bin', false],
    ['gone.bin', null, true],
  ]);
});

test('a chooser opens on what is in use, or the recommended one', () => {
  const inUse = { stt: { provider: 'local', model: { path: '/m/audio/whisper/ggml-base.en-q5_1.bin' } } };
  assert.deepEqual(initialWhisperChoice(catalog, inUse, 'de-DE'), { value: 'catalog:base', english: true });
  assert.deepEqual(initialWhisperChoice(catalog, { stt: { provider: 'local', model: { path: '/home/sam/ggml-medium.bin' } } }, 'en-GB'), { value: 'file:/home/sam/ggml-medium.bin', english: true });
  assert.deepEqual(initialWhisperChoice(catalog, { stt: { provider: 'openai', model: 'gpt-4o-transcribe' } }, 'fr-FR'), { value: 'catalog:base', english: false });

  assert.equal(initialVoiceChoice(catalog, { tts: { provider: 'local', voice: { path: '/m/audio/tts/en_GB-alan-medium.onnx' } } }), 'catalog:en_GB-alan-medium');
  assert.equal(initialVoiceChoice(catalog, { tts: { provider: 'off' } }, 'de-AT'), 'catalog:de_DE-thorsten-medium');
  assert.equal(initialVoiceChoice(catalog, {}, 'en-GB'), 'catalog:en_GB-alan-medium');
  assert.equal(initialVoiceChoice(catalog, {}, 'ja-JP'), 'catalog:en_US-lessac-medium');
});

test('voices: the user’s language first, a voice without its settings file isn’t ready', () => {
  const { voices, others } = voiceChoices(catalog, library, 'de-DE');
  assert.deepEqual(voices.map((voice) => [voice.name, voice.group, voice.path]), [
    ['Thorsten', 'German', null],
    ['Alan', 'English (UK)', '/m/audio/tts/en_GB-alan-medium.onnx'],
    ['Lessac', 'English (US)', null],
  ]);
  assert.deepEqual(others.map((file) => [file.name, file.path]), [['my-voice.onnx', '/m/audio/tts/my-voice.onnx']]);
});

test('image models never offer a LoRA, and open on one that fits', () => {
  const images = {
    models: [
      { id: 'sd15', title: 'Stable Diffusion 1.5', file: 'sd15.gguf', bytes: 1_760_000_000, recommended: true, fit: 'too_big' },
      { id: 'sdxl', title: 'SDXL Turbo', file: 'sdxl.gguf', bytes: 4_100_000_000, fit: 'fits' },
    ],
  };
  const files = { image: [
    { filename: 'sdxl.gguf', path: '/m/image/sdxl.gguf', assetKind: 'Image model', drawable: true },
    { filename: 'dreamshaper.safetensors', path: '/home/sam/dreamshaper.safetensors', assetKind: 'Image model', drawable: true, sizeBytes: 2_100_000_000 },
    { filename: 'detail_lora.safetensors', path: '/m/image/detail_lora.safetensors', assetKind: 'LoRA', drawable: false },
  ] };
  const { models, others } = imageChoices(images, files);
  assert.deepEqual(models.map((model) => model.path), [null, '/m/image/sdxl.gguf']);
  assert.deepEqual(others.map((file) => file.name), ['dreamshaper.safetensors']);
  assert.equal(initialImageChoice(images, { provider: 'openai' }), 'catalog:sd15');
  assert.equal(initialImageChoice({ models: [{ ...images.models[0], fit: 'fits' }] }, {}), 'catalog:sd15');
  assert.equal(initialImageChoice(images, { provider: 'local', model: { path: '/m/image/sdxl.gguf' } }), 'catalog:sdxl');
  assert.equal(initialImageChoice(images, { provider: 'local', model: { path: '/home/sam/dreamshaper.safetensors' } }), 'file:/home/sam/dreamshaper.safetensors');
});

test('the download button says how much', () => {
  assert.equal(downloadLabel({ totalBytes: 190_100_000 }), 'Download 190 MB and use it');
  assert.equal(downloadLabel({ totalBytes: 157_000_000, estimated: true }, null, 'set up'), 'Download about 157 MB and set up');
  assert.equal(downloadLabel(null, 63_200_000), 'Download about 63 MB and use it');
  assert.equal(downloadLabel(null, null), 'Download and use it');
  assert.equal(downloadLabel({ totalBytes: 0 }), null);

  // An engine the plan can't get stops the download before it starts.
  const engine = { key: 'whisper-engine', done: false, error: 'No prebuilt Whisper (Speech-to-Text) download is available for linux-x64.', unavailable: true };
  assert.deepEqual(planBlocked({ steps: [engine, { key: 'whisper-model', bytes: 190_100_000 }] }), {
    button: "Its engine can't be downloaded here.",
    detail: 'No prebuilt Whisper (Speech-to-Text) download is available for linux-x64.',
  });
  assert.equal(planBlocked({ steps: [{ ...engine, unavailable: false }] }).button, "Couldn't check its engine.");
  assert.equal(planBlocked({ steps: [{ ...engine, done: true }] }), null);
  assert.equal(planBlocked(null), null);
});
