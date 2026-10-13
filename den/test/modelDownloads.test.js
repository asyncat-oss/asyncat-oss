import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

// Model downloads land in the models folder, or a folder inside it; a
// sub-folder that climbs out ("../..") is refused before anything starts.

const { MODELS_DIR, modelsSubdir, startDownload } = await import('../src/ai/controllers/ai/modelManager.js');

test('downloads stay inside the models folder', async () => {
  assert.equal(modelsSubdir(''), MODELS_DIR);
  assert.equal(modelsSubdir('vision'), path.join(MODELS_DIR, 'vision'));
  assert.equal(modelsSubdir('image/sd'), path.join(MODELS_DIR, 'image', 'sd'));
  for (const bad of ['..', '../..', '../escape', '/etc', 'vision/../../x']) {
    assert.throws(() => modelsSubdir(bad), /inside the models folder/, bad);
  }
  await assert.rejects(startDownload('https://example.invalid/model.gguf', 'model.gguf', '../../outside'), /inside the models folder/);
});
