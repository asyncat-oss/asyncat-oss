import test from 'node:test';
import assert from 'node:assert/strict';
import { imagesSummary, listeningSummary, speakingSummary } from './mediaSummary.js';

const voiceCatalog = {
  whisper: [{ id: 'base', title: 'Base', file: 'ggml-base-q5_1.bin', englishFile: 'ggml-base.en-q5_1.bin' }],
  voices: [{ id: 'en_US-lessac-medium', name: 'Lessac', language: 'English (US)' }],
  cloud: {
    openai: { title: 'OpenAI', hasKey: true },
    elevenlabs: { title: 'ElevenLabs', hasKey: true },
  },
};

const imageCatalog = {
  models: [{ id: 'sd15-q8', title: 'Stable Diffusion 1.5', file: 'sd-v1-5-q8_0.gguf' }],
  cloud: {
    openai: { title: 'OpenAI', hasKey: true, models: [{ id: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare' }] },
    stability: { title: 'Stability AI', hasKey: false, models: [{ id: 'stable-image-ultra', name: 'Stable Image Ultra' }] },
  },
};

const voice = (stt, tts) => ({ status: { stt, tts }, catalog: voiceCatalog });
const images = (status) => ({ status, catalog: imageCatalog });

test('nothing loaded yet reads Checking…, and a failed load says so', () => {
  assert.deepEqual(listeningSummary(null), { value: 'Checking…', tone: 'idle' });
  assert.deepEqual(speakingSummary(null), { value: 'Checking…', tone: 'idle' });
  assert.deepEqual(imagesSummary(null), { value: 'Checking…', tone: 'idle' });
  assert.deepEqual(listeningSummary({ error: true }), { value: "Couldn't check", tone: 'idle' });
  assert.deepEqual(imagesSummary({ error: true }), { value: "Couldn't check", tone: 'idle' });
});

test('listening set up on this computer names its model, loaded or not', () => {
  const stt = { provider: 'local', engine: true, model: { path: '/m/audio/whisper/ggml-base.en-q5_1.bin', name: 'Base (English)' }, ready: true, running: 'idle' };
  // Set up but not loaded yet is still ready: the first recording loads it.
  assert.deepEqual(listeningSummary(voice(stt, null)), { value: 'Base (English)', tone: 'ready' });
  assert.equal(listeningSummary(voice({ ...stt, running: 'loading' }, null)).tone, 'loading');
  assert.equal(listeningSummary(voice({ ...stt, running: 'error' }, null)).tone, 'error');
  // A file outside the catalog shows by its name.
  const other = { ...stt, model: { path: '/data/ggml-medium.bin', name: 'ggml-medium.bin' } };
  assert.equal(listeningSummary(voice(other, null)).value, 'ggml-medium.bin');
});

test('a part on this computer that is not ready says what it needs', () => {
  assert.deepEqual(listeningSummary(voice({ provider: 'local', engine: false, model: null, ready: false, reason: 'needs_engine' }, null)), { value: 'Not set up', tone: 'idle' });
  assert.deepEqual(listeningSummary(voice({ provider: 'local', engine: true, model: null, ready: false, reason: 'needs_model' }, null)), { value: 'Needs a model', tone: 'warning' });
  assert.deepEqual(
    listeningSummary(voice({ provider: 'local', engine: false, model: { path: '/m/a.bin' }, ready: false, reason: 'needs_engine' }, null)),
    { value: 'Needs its engine', tone: 'warning' },
  );
  assert.deepEqual(speakingSummary(voice(null, { provider: 'local', engine: true, voice: null, ready: false, reason: 'needs_voice' })), { value: 'Needs a voice', tone: 'warning' });
});

test('a part that is off reads Off', () => {
  const off = { provider: 'off', ready: false, reason: 'off' };
  assert.deepEqual(listeningSummary(voice(off, off)), { value: 'Off', tone: 'idle' });
  assert.deepEqual(speakingSummary(voice(off, off)), { value: 'Off', tone: 'idle' });
});

test('a service names itself and its model or voice, or that it needs a key', () => {
  assert.deepEqual(
    listeningSummary(voice({ provider: 'openai', title: 'OpenAI', model: 'gpt-4o-transcribe', ready: true, reason: null }, null)),
    { value: 'OpenAI · GPT-4o Transcribe', tone: 'ready' },
  );
  assert.deepEqual(
    listeningSummary(voice({ provider: 'openai', title: 'OpenAI', model: 'gpt-4o-transcribe', ready: false, reason: 'needs_key' }, null)),
    { value: 'OpenAI · needs a key', tone: 'warning' },
  );
  assert.deepEqual(
    speakingSummary(voice(null, { provider: 'openai', title: 'OpenAI', voice: { id: 'coral', name: 'Coral' }, ready: true })),
    { value: 'OpenAI · Coral', tone: 'ready' },
  );
  // A voice from the person's ElevenLabs account is known only by its id.
  assert.equal(
    speakingSummary(voice(null, { provider: 'elevenlabs', title: 'ElevenLabs', voice: { id: 'pNInz6obpgDQGcFmaJgB', name: 'pNInz6obpgDQGcFmaJgB' }, ready: true })).value,
    'ElevenLabs',
  );
});

test('speaking on this computer names the voice without its language', () => {
  const tts = { provider: 'local', engine: true, voice: { path: '/m/audio/tts/en_US-lessac-medium.onnx', id: 'en_US-lessac-medium', name: 'Lessac (English (US))' }, ready: true, running: 'ready' };
  assert.deepEqual(speakingSummary(voice(null, tts)), { value: 'Lessac', tone: 'ready' });
  const other = { ...tts, voice: { path: '/data/my-voice.onnx', id: null, name: 'my-voice' } };
  assert.equal(speakingSummary(voice(null, other)).value, 'my-voice');
});

test('making images names the engine that draws and its model', () => {
  const local = { provider: 'local', engine: true, model: { path: '/m/image/sd-v1-5-q8_0.gguf', name: 'Stable Diffusion 1.5' }, ready: true, comfyui: false };
  assert.deepEqual(imagesSummary(images(local)), { value: 'stable-diffusion.cpp · Stable Diffusion 1.5', tone: 'ready' });
  // A model file outside the catalog loses its extension.
  const other = { ...local, model: { path: '/data/dreamshaper_8.safetensors', name: 'dreamshaper_8.safetensors' } };
  assert.equal(imagesSummary(images(other)).value, 'stable-diffusion.cpp · dreamshaper_8');
  const comfy = { provider: 'comfyui', engine: false, model: null, ready: true, comfyui: true, checkpoint: 'dreamshaper_8.safetensors' };
  assert.deepEqual(imagesSummary(images(comfy)), { value: 'ComfyUI · dreamshaper_8', tone: 'ready' });
  assert.deepEqual(imagesSummary(images({ ...comfy, checkpoint: null })), { value: 'ComfyUI', tone: 'ready' });
});

test('when the chosen engine cannot draw, the one images fall back to is named', () => {
  // ComfyUI chosen but stopped, with a model on this computer: that draws.
  const comfyDown = { provider: 'comfyui', engine: true, model: { path: '/m/image/sd-v1-5-q8_0.gguf' }, ready: true, comfyui: false };
  assert.equal(imagesSummary(images(comfyDown)).value, 'stable-diffusion.cpp · Stable Diffusion 1.5');
  assert.deepEqual(imagesSummary(images({ ...comfyDown, engine: false, model: null, ready: false })), { value: "ComfyUI isn't running", tone: 'warning' });
  // This computer chosen but nothing to draw with, and ComfyUI answers.
  const localEmpty = { provider: 'local', engine: true, model: null, ready: true, comfyui: true, checkpoint: 'v1-5.ckpt' };
  assert.equal(imagesSummary(images(localEmpty)).value, 'ComfyUI · v1-5');
});

test('images not set up on this computer say what they need', () => {
  assert.deepEqual(imagesSummary(images({ provider: 'local', engine: false, model: null, ready: false, comfyui: false })), { value: 'Not set up', tone: 'idle' });
  assert.deepEqual(imagesSummary(images({ provider: 'local', engine: true, model: null, ready: false, comfyui: false })), { value: 'Needs a model', tone: 'warning' });
  assert.deepEqual(
    imagesSummary(images({ provider: 'local', engine: false, model: { path: '/m/image/sd-v1-5-q8_0.gguf' }, ready: false, comfyui: false })),
    { value: 'Needs its engine', tone: 'warning' },
  );
});

test('images made by a service name it and its model, or that it needs a key', () => {
  assert.deepEqual(
    imagesSummary(images({ provider: 'openai', title: 'OpenAI', model: 'gpt-image-2.5-flare', ready: true, reason: null })),
    { value: 'OpenAI · GPT Image 2.5 Flare', tone: 'ready' },
  );
  assert.deepEqual(
    imagesSummary(images({ provider: 'stability', title: 'Stability AI', model: 'stable-image-ultra', ready: false, reason: 'needs_key' })),
    { value: 'Stability AI · needs a key', tone: 'warning' },
  );
});
