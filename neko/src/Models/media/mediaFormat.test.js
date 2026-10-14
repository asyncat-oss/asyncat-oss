import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIT, buildImageFiles, buildVoiceFiles, downloadsFor, engineState, engineSummary, enginePlanText, filesCountText, folderOf,
  gpuLine, installText, jobPercent, sizeText, stepProgressText, stepSizeText, totalText, versionText, voicesByLanguage,
} from './mediaFormat.js';

test('sizes and step states read plainly', () => {
  assert.equal(totalText(0), 'nothing to download');
  assert.equal(totalText(157_000_000, { estimated: true }), 'about 157 MB');
  assert.equal(sizeText(59_700_000), '60 MB');
  assert.equal(sizeText(0), 'Size unknown');
  assert.equal(stepSizeText({ done: true, bytes: 5 }), 'Already on this computer');
  assert.equal(stepSizeText({ bytes: 1_760_000_000 }), '1.8 GB');
  assert.equal(stepSizeText({ bytes: null }), 'Size unknown');
  assert.equal(stepSizeText({ bytes: null, small: true }), 'tiny');
  assert.equal(stepProgressText({ status: 'running', downloaded: 24_000_000, total: 60_000_000 }), '24 of 60 MB');
  assert.equal(stepProgressText({ status: 'skipped' }), 'Already here');
  assert.equal(stepProgressText({ status: 'waiting' }), 'Waiting');
});

test('overall progress weighs big downloads more', () => {
  const job = { steps: [
    { status: 'done', bytes: 1_000_000 },
    { status: 'running', progress: 50, total: 9_000_000 },
  ] };
  assert.equal(jobPercent(job), 55);
  assert.equal(jobPercent({ steps: [] }), 0);
});

test('voices group by language, the user’s first', () => {
  const voices = [
    { id: 'de', language: 'German', locale: 'de-DE' },
    { id: 'a', language: 'English (US)', locale: 'en-US' },
    { id: 'fr', language: 'French', locale: 'fr-FR' },
  ];
  assert.deepEqual(voicesByLanguage(voices, 'fr-FR').map((group) => group.language), ['French', 'English (US)', 'German']);
  assert.equal(gpuLine({ vendor: 'NVIDIA', name: 'RTX 4050 Laptop', vramGb: 6 }), 'RTX 4050 Laptop · 6 GB');
  assert.equal(gpuLine(null), 'No graphics card found');
});

test('only a model too big for the card stands out', () => {
  assert.match(FIT.too_big.className, /amber/);
  for (const key of ['fits', 'tight', 'unknown', 'cpu']) assert.equal(FIT[key].className, 'text-fg-subtle');
});

test('folders outside Asyncat read from home', () => {
  assert.equal(folderOf('/home/sam/models/ggml-medium.bin'), '~/models');
  assert.equal(folderOf('/Users/sam/ggml-medium.bin'), '~');
  assert.equal(folderOf('C:\\Users\\sam\\models\\a.bin'), '~\\models');
  assert.equal(folderOf('/opt/models/a.bin'), '/opt/models');
});

const voiceCatalog = {
  whisper: [
    { id: 'base', title: 'Base', file: 'ggml-base-q5_1.bin', englishFile: 'ggml-base.en-q5_1.bin' },
    { id: 'small', title: 'Small', file: 'ggml-small-q5_1.bin', englishFile: 'ggml-small.en-q5_1.bin' },
  ],
  voices: [
    { id: 'en_US-lessac-medium', name: 'Lessac', language: 'English (US)', locale: 'en-US' },
    { id: 'en_US-amy-medium', name: 'Amy', language: 'English (US)', locale: 'en-US' },
  ],
};

const audioLibrary = {
  whisper: [
    { id: 7, isExternal: true, filename: 'ggml-medium.bin', path: '/home/sam/models/ggml-medium.bin', sizeBytes: 1_530_000_000 },
    { id: 'ggml-small-q5_1.bin', filename: 'ggml-small-q5_1.bin', path: '/data/models/audio/whisper/ggml-small-q5_1.bin', sizeBytes: 190_100_000 },
    { id: 'ggml-base.en-q5_1.bin', filename: 'ggml-base.en-q5_1.bin', path: '/data/models/audio/whisper/ggml-base.en-q5_1.bin', sizeBytes: 59_700_000 },
    { id: 9, isExternal: true, isMissing: true, filename: 'gone.bin', path: '/mnt/usb/gone.bin' },
  ],
  tts: [
    { id: 'en_US-lessac-medium.onnx', filename: 'en_US-lessac-medium.onnx', path: '/data/models/audio/tts/en_US-lessac-medium.onnx', sizeBytes: 63_200_000, languageName: 'English' },
    { id: 'de_DE-kerstin-low.onnx', filename: 'de_DE-kerstin-low.onnx', path: '/data/models/audio/tts/de_DE-kerstin-low.onnx', sizeBytes: 20_000_000, languageName: 'German', missingConfig: true },
  ],
};

test('voice files: catalog names, what is in use, and what can be done', () => {
  const status = {
    stt: { provider: 'local', model: { path: '/data/models/audio/whisper/ggml-base.en-q5_1.bin' } },
    tts: { provider: 'local', voice: { path: '/data/models/audio/tts/en_US-lessac-medium.onnx' } },
  };
  const { groups, count, downloads } = buildVoiceFiles(status, voiceCatalog, audioLibrary, []);
  const rows = groups[0].rows;
  assert.equal(count, 6);
  assert.deepEqual(downloads, []);
  // Listening first (catalog order, then by name), then voices.
  assert.deepEqual(rows.map((row) => row.name), ['Base (English)', 'Small', 'ggml-medium.bin', 'gone.bin', 'Lessac', 'de_DE-kerstin-low.onnx']);

  const [base, small, medium, gone, lessac, kerstin] = rows;
  assert.equal(base.meta, 'Listening · 60 MB');
  assert.deepEqual(base.state, { text: 'In use', tone: 'accent' });
  assert.equal(base.canDelete, false);
  assert.equal(base.domId, 'voice-file-whisper-ggml-base.en-q5_1.bin');
  assert.equal(small.state, null);
  assert.equal(small.canUse, true);
  assert.equal(small.useLabel, 'Use for listening');
  assert.equal(small.deleteLabel, 'Delete file');
  assert.equal(medium.meta, 'Listening · 1.5 GB · ~/models');
  assert.equal(medium.deleteLabel, 'Remove from list');
  assert.equal(medium.domId, 'voice-file-whisper-7');
  assert.deepEqual(gone.state, { text: 'File not found', tone: 'error' });
  assert.equal(gone.canUse, false);
  assert.equal(gone.meta, 'Listening · /mnt/usb');
  assert.equal(lessac.meta, 'Speaking · English (US) · 63 MB');
  assert.equal(lessac.catalogId, 'en_US-lessac-medium');
  assert.equal(lessac.inUse, true);
  assert.deepEqual(kerstin.state, { text: 'Settings file missing', tone: 'warning' });
  assert.equal(kerstin.canUse, false);
  assert.equal(kerstin.meta, 'Speaking · German · 20 MB');
});

test('a service in use leaves every file free', () => {
  const status = { stt: { provider: 'openai', model: 'gpt-4o-transcribe' }, tts: { provider: 'off' } };
  const { groups } = buildVoiceFiles(status, voiceCatalog, audioLibrary, []);
  assert.equal(groups[0].rows.filter((row) => row.inUse).length, 0);
});

test('image files split into models and other files', () => {
  const catalog = { models: [{ id: 'sd15-q8', title: 'Stable Diffusion 1.5', file: 'sd15.gguf' }] };
  const library = { image: [
    { id: 'sd15.gguf', filename: 'sd15.gguf', path: '/data/models/image/sd15.gguf', sizeBytes: 1_760_000_000, assetKind: 'Image model', drawable: true },
    { id: 3, isExternal: true, filename: 'dreamshaper_8.safetensors', path: '/home/sam/sd/dreamshaper_8.safetensors', sizeBytes: 2_100_000_000, assetKind: 'Image model', drawable: true },
    { id: 'add_detail_lora.safetensors', filename: 'add_detail_lora.safetensors', path: '/data/models/image/add_detail_lora.safetensors', sizeBytes: 144_000_000, assetKind: 'LoRA', drawable: false },
  ] };
  const local = buildImageFiles({ provider: 'local', model: { path: '/data/models/image/sd15.gguf' } }, catalog, library);
  assert.equal(local.count, 3);
  const [models, other] = local.groups;
  assert.equal(models.label, 'Image models');
  assert.deepEqual(models.rows.map((row) => row.name), ['Stable Diffusion 1.5', 'dreamshaper_8.safetensors']);
  assert.equal(models.rows[0].inUse, true);
  assert.equal(models.rows[0].meta, 'Image model · 1.8 GB');
  assert.equal(models.rows[1].meta, 'Image model · 2.1 GB · ~/sd');
  assert.equal(models.rows[1].canUse, true);
  assert.equal(models.rows[1].domId, 'image-file-3');
  assert.equal(other.label, 'Other files');
  assert.equal(other.rows[0].meta, 'LoRA · 144 MB');
  assert.equal(other.rows[0].canUse, false);
  assert.equal(other.rows[0].useLabel, null);

  // ComfyUI draws with a checkpoint of the same name.
  const comfy = buildImageFiles({ provider: 'comfyui', model: { path: '/data/models/image/sd15.gguf' }, checkpoint: 'dreamshaper_8.safetensors' }, catalog, library);
  assert.deepEqual(comfy.groups[0].rows.map((row) => row.inUse), [false, true]);
  assert.equal(filesCountText(1), '1 file');
  assert.equal(filesCountText(3), '3 files');
});

test('a tab shows its own downloads, not the ones setup shows', () => {
  const list = [
    { downloadId: 'a', filename: 'ggml-small-q5_1.bin', subDir: 'audio/whisper', status: 'downloading', downloaded: 24_000_000, total: 190_000_000, progress: 12 },
    { downloadId: 'b', filename: 'en_US-amy-medium.onnx', subDir: 'audio/tts', status: 'downloading' },
    { downloadId: 'c', filename: 'en_US-amy-medium.onnx.json', subDir: 'audio/tts', status: 'downloading' },
    { downloadId: 'd', filename: 'model.gguf', subDir: '', status: 'downloading' },
    { downloadId: 'e', filename: 'sd15.gguf', subDir: 'image', status: 'downloading' },
    { downloadId: 'f', filename: 'ggml-base-q5_1.bin', subDir: 'audio/whisper', status: 'complete' },
    { downloadId: 'g', filename: 'ggml-tiny.bin', subDir: 'audio/whisper', status: 'error', error: 'HTTP 404' },
    { downloadId: 'h', filename: 'ggml-base.en-q5_1.bin', subDir: 'audio/whisper', status: 'downloading' },
  ];
  const job = { status: 'running', steps: [{ key: 'whisper-model', filename: 'ggml-base.en-q5_1.bin', subDir: 'audio/whisper' }] };
  assert.deepEqual(downloadsFor(list, 'audio/', job).map((item) => item.downloadId), ['a', 'b', 'g']);
  assert.deepEqual(downloadsFor(list, 'audio/', null).map((item) => item.downloadId), ['a', 'b', 'g', 'h']);
  assert.deepEqual(downloadsFor(list, 'image').map((item) => item.downloadId), ['e']);

  const { downloads } = buildVoiceFiles({}, voiceCatalog, { whisper: [], tts: [] }, downloadsFor(list, 'audio/', job));
  assert.deepEqual(downloads.map((item) => item.name), ['Small', 'Amy', 'ggml-tiny.bin']);
  assert.equal(downloads[0].bytes, 24_000_000);
  assert.equal(downloads[2].error, 'HTTP 404');
});

test('the engine row says which copy runs, and the plan says what an update costs', () => {
  const managed = { id: 'whisper', supported: true, managedInstalled: true, version: 'v1.7.6', capability: 'nvidia', managedPath: '/data/runtimes/whisper/whisper-server' };
  assert.deepEqual(engineSummary('whisper', managed, { bytes: 48_000_000, loaded: true }), {
    state: 'managed', value: 'whisper.cpp', meta: ['1.7.6', 'CUDA build', '48 MB', 'loaded'], path: '/data/runtimes/whisper/whisper-server',
  });
  const outside = { id: 'piper', supported: true, managedInstalled: false, configuredPath: null };
  assert.deepEqual(engineSummary('piper', outside, { enginePath: '/usr/bin/piper' }), {
    state: 'external', value: 'Piper', meta: ['found on this computer'], path: '/usr/bin/piper',
  });
  assert.equal(engineSummary('piper', outside).value, 'Not installed');
  assert.equal(engineSummary('sd', { supported: false, unsupportedReason: 'Not built for this processor.' }).value, 'Not built for this processor.');
  assert.equal(engineState(managed, { job: { status: 'running' } }), 'installing');
  assert.equal(engineState(null), 'loading');
  assert.equal(versionText('v1.7.6'), '1.7.6');
  assert.equal(versionText('2023.11.14-2'), '2023.11.14-2');

  const plan = { downloadBytes: 24_000_000, version: 'v1.7.7', capability: 'nvidia', assetName: 'whisper-cuda.zip', license: 'MIT' };
  assert.deepEqual(enginePlanText('whisper', plan, { installedVersion: 'v1.7.6' }), {
    line: 'Download 24 MB · version 1.7.7 · CUDA build',
    detail: 'whisper-cuda.zip · MIT. Listening keeps working while it downloads.',
    newest: false,
  });
  assert.equal(enginePlanText('whisper', plan, { installedVersion: '1.7.7' }).newest, true);
  assert.equal(enginePlanText('sd', { estimated: true, downloadBytes: 30_000_000 }).line, 'Download about 30 MB');
  assert.equal(installText({ progress: { downloadedBytes: 4_000_000, totalBytes: 12_000_000 } }), 'Installing · 4 of 12 MB');
  assert.equal(installText({ progress: { percent: 2 } }), 'Installing');
});
