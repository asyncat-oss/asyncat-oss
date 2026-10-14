import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCount, defaultFileName, fileFilters, fileUse, hfFilesFor, monthYear, repoMeta } from './filesFormat.js';

test('search results read short', () => {
  assert.equal(compactCount(1_234_567), '1.2M');
  assert.equal(compactCount(12_345_678), '12M');
  assert.equal(compactCount(48_210), '48k');
  assert.equal(compactCount(1_000), '1k');
  assert.equal(compactCount(950), '950');
  assert.equal(compactCount(undefined), '0');
  assert.equal(monthYear('2026-08-14T10:00:00Z', 'en-GB'), 'Aug 2026');
  assert.equal(monthYear('not a date'), '');
  assert.equal(repoMeta({ downloads: 48_210, updated: '2026-06-02T00:00:00Z' }, 'en-GB'), '48k downloads · Jun 2026');
  assert.equal(repoMeta({ downloads: 3 }), '3 downloads');
});

test('a repo offers only the files a scope can use, with sizes', () => {
  const files = [
    { rfilename: 'ggml-medium-q5_0.bin', size: 539_000_000, url: 'u1' },
    { rfilename: 'ggml-tiny.en.bin', size: 77_700_000, url: 'u2' },
    { rfilename: 'README.md', size: 2_000, url: 'u3' },
    { rfilename: 'models/coreml.zip', size: 10, url: 'u4' },
    { rfilename: 'ggml-small.bin', size: 0, url: 'u5' },
  ];
  assert.deepEqual(hfFilesFor(files, 'listening').map((file) => [file.filename, file.meta]), [
    ['ggml-medium-q5_0.bin', 'Listening · 539 MB'],
    ['ggml-small.bin', 'Listening · Size unknown'],
    ['ggml-tiny.en.bin', 'Listening · 78 MB'],
  ]);

  const voices = [
    { rfilename: 'en/en_GB/alan/medium/en_GB-alan-medium.onnx', size: 63_200_000, url: 'v1' },
    { rfilename: 'en/en_GB/alan/medium/en_GB-alan-medium.onnx.json', size: 5_000, url: 'v2' },
    { rfilename: 'en/en_GB/alan/medium/MODEL_CARD', size: 300, url: 'v3' },
  ];
  const [alan] = hfFilesFor(voices, 'speaking');
  assert.equal(alan.filename, 'en_GB-alan-medium.onnx');
  assert.deepEqual(alan.companion, { filename: 'en_GB-alan-medium.onnx.json', url: 'v2' });
  assert.equal(alan.meta, 'Speaking · 63 MB');

  const images = [{ rfilename: 'sd.safetensors', size: 2_100_000_000 }, { rfilename: 'sd.gguf', size: 1_800_000_000 }, { rfilename: 'vae.pt', size: 1 }];
  assert.deepEqual(hfFilesFor(images, 'images').map((file) => file.filename), ['sd.gguf', 'sd.safetensors']);
});

test('a picked file says what it will be used for', () => {
  assert.deepEqual(fileUse('/home/sam/ggml-medium.bin', 'voice'), { type: 'whisper', text: 'Used for listening. Asyncat uses it where it is; nothing is copied.', error: null });
  assert.equal(fileUse('/home/sam/alan.onnx', 'voice').type, 'tts');
  assert.equal(fileUse('C:\\models\\dream.safetensors', 'images').type, 'image');
  assert.equal(fileUse('/home/sam/alan.onnx', 'listening').error, "Asyncat can't use this kind of file here. Choose a .bin or .gguf file.");
  assert.equal(fileUse('/x/notes.txt', 'images').error, "Asyncat can't use this kind of file here. Choose a .gguf, .safetensors or .ckpt file.");
  assert.deepEqual(fileUse('  ', 'voice'), { type: null, text: null, error: null });
  assert.equal(defaultFileName('/home/sam/ggml-medium.bin'), 'ggml-medium');
  assert.deepEqual(fileFilters('listening'), [{ name: 'Whisper models', extensions: ['bin'] }]);
  assert.equal(fileFilters('voice')[0].extensions.join(), 'bin,onnx');
  assert.deepEqual(fileFilters('images')[0].extensions, ['gguf', 'safetensors', 'ckpt']);
});
