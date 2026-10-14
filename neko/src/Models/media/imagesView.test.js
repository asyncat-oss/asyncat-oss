import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardIsSmall, checkpointLabel, cleanComfyAddress, comfyStatusText, failedImageRow, firstRunImagePick, firstRunSetupModel, imageDraftChoice,
  imageInUse, imageRowSteps, imageRunsOnChange, imagesHint, imagesProblem, imagesSetupOutcome, imagesStatusLines, imagesSwitchedText,
  isImagesFirstRun, pickedImage, serviceModel, serviceModelName, setupEngineBlocked, setupModelName,
} from './imagesView.js';

const catalog = {
  gpu: { name: 'Demo GPU', vramGb: 6 },
  models: [
    { id: 'sd15-q8', title: 'Stable Diffusion 1.5', file: 'sd15-Q8_0.gguf', bytes: 1_760_000_000, recommended: true, fit: 'fits' },
    { id: 'sdxl-turbo-q8', title: 'SDXL Turbo', file: 'sdxl-turbo.q8_0.gguf', bytes: 4_100_000_000, fit: 'tight' },
  ],
  cloud: {
    openai: { title: 'OpenAI', keyName: 'OPENAI_API_KEY', hasKey: false, defaultModel: 'gpt-image-a', models: [{ id: 'gpt-image-a', name: 'GPT Image A' }, { id: 'gpt-image-b', name: 'GPT Image B' }], edits: true },
    gemini: { title: 'Gemini', keyName: 'GEMINI_API_KEY', hasKey: true, defaultModel: 'gemini-image', models: [{ id: 'gemini-image', name: 'Gemini Image' }], edits: true },
    fal: { title: 'fal', keyName: 'FAL_KEY', hasKey: false, defaultModel: null, models: [{ id: 'flux-schnell', name: 'FLUX.1 schnell' }], edits: false },
  },
};

const library = {
  image: [
    { filename: 'sd15-Q8_0.gguf', path: '/m/image/sd15-Q8_0.gguf', sizeBytes: 1_760_000_000, assetKind: 'Image model' },
    { filename: 'dreamshaper_8.safetensors', path: '/data/sd/dreamshaper_8.safetensors', sizeBytes: 2_130_000_000, assetKind: 'Image model', isExternal: true },
    { filename: 'add_detail_lora.safetensors', path: '/m/image/add_detail_lora.safetensors', sizeBytes: 144_000_000, assetKind: 'LoRA' },
  ],
};

const fresh = { provider: 'local', engine: false, model: null, ready: false, reason: 'needs_engine', comfyui: false };
const ready = { provider: 'local', engine: true, model: { path: '/m/image/sd15-Q8_0.gguf', name: 'Stable Diffusion 1.5' }, ready: true, reason: null };

test('the first run is images on this computer with nothing to draw with and no setup running', () => {
  assert.equal(isImagesFirstRun(fresh), true);
  assert.equal(isImagesFirstRun({ ...fresh, engine: true, reason: 'needs_model' }), true);
  assert.equal(isImagesFirstRun(fresh, { status: 'running' }), false);
  assert.equal(isImagesFirstRun(ready), false);
  // A model already here only needs its engine, which its row installs.
  assert.equal(isImagesFirstRun({ ...fresh, model: { path: '/data/sd/dreamshaper_8.safetensors' } }), false);
  // ComfyUI answering makes images work without a model.
  assert.equal(isImagesFirstRun({ ...fresh, ready: true, comfyui: true }), false);
  assert.equal(isImagesFirstRun({ provider: 'openai', ready: false, reason: 'needs_key', title: 'OpenAI' }), false);
  assert.equal(isImagesFirstRun(null), false);
});

test('what images still need, in a line', () => {
  assert.equal(imagesProblem(ready), null);
  assert.equal(imagesProblem({ provider: 'openai', title: 'OpenAI', ready: false, reason: 'needs_key' }), 'Images need your OpenAI key.');
  assert.equal(imagesProblem({ provider: 'stability', ready: false, reason: 'needs_key' }), 'Images need your Stability AI key.');
  assert.equal(imagesProblem({ ...ready, engine: false, ready: false, reason: 'needs_engine' }), 'Images need their engine.');
  assert.equal(imagesProblem({ ...fresh }), 'Images need their engine and a model.');
  assert.equal(imagesProblem({ ...fresh, engine: true, reason: 'needs_model' }), 'Images need a model.');
  assert.equal(imagesProblem({ provider: 'comfyui', ready: false, reason: 'needs_engine' }), "ComfyUI isn't running.");
});

test('status lines: loading failed, setting up, outcomes and problems', () => {
  assert.deepEqual(imagesStatusLines({ loadError: 'boom' }).map((line) => [line.text, line.action]), [["Couldn't load image settings.", 'reload']]);
  assert.deepEqual(imagesStatusLines({}), []);

  const job = { status: 'running', steps: [{ key: 'sd-engine', status: 'done', total: 30 }, { key: 'image-model', status: 'running', total: 100, progress: 52 }] };
  assert.deepEqual(imagesStatusLines({ status: fresh, job }).map((line) => [line.tone, line.text, line.percent, line.action]), [
    ['progress', 'Setting up images · 63%', 63, 'cancel'],
  ]);
  assert.deepEqual(imagesStatusLines({ status: ready, outcome: 'complete' }).map((line) => [line.tone, line.text]), [['ok', 'Images are set up']]);
  assert.deepEqual(imagesStatusLines({ status: ready, outcome: 'error' }).map((line) => [line.text, line.action]), [["Setup didn't finish.", 'retry']]);
  assert.deepEqual(imagesStatusLines({ status: ready, outcome: 'cancelled' }).map((line) => [line.tone, line.action]), [['off', 'setup']]);
  // On the first run the download button under the group starts it again.
  assert.deepEqual(imagesStatusLines({ status: fresh, outcome: 'error', firstRun: true }).map((line) => line.action), [undefined]);
  assert.deepEqual(imagesStatusLines({ status: fresh, firstRun: true, planError: 'offline' }).map((line) => [line.text, line.action]), [["Couldn't check download sizes.", 'plan']]);
  // The first run has its own words, not problems.
  assert.deepEqual(imagesStatusLines({ status: fresh, firstRun: true }), []);

  const noEngine = { ...ready, engine: false, ready: false, reason: 'needs_engine' };
  assert.deepEqual(imagesStatusLines({ status: noEngine }).map((line) => [line.tone, line.text]), [['warning', 'Images need their engine.']]);
  // A change being made speaks for itself, and a setup that stopped has said so.
  assert.deepEqual(imagesStatusLines({ status: noEngine, draft: { provider: 'openai' } }), []);
  assert.deepEqual(imagesStatusLines({ status: noEngine, outcome: 'error' }).map((line) => line.text), ["Setup didn't finish."]);
});

test('a finished setup is reported where it was followed, or when it failed and images still do not work', () => {
  assert.equal(imagesSetupOutcome({ id: 'a', status: 'complete' }, { followedId: 'a' }), 'complete');
  assert.equal(imagesSetupOutcome({ id: 'a', status: 'complete' }, { followedId: 'a', quietId: 'a' }), null);
  assert.equal(imagesSetupOutcome({ id: 'b', status: 'error' }, { status: fresh }), 'error');
  assert.equal(imagesSetupOutcome({ id: 'b', status: 'error' }, { status: ready }), null);
  assert.equal(imagesSetupOutcome({ id: 'c', status: 'running' }, { followedId: 'c' }), null);
});

test('setup steps land on the Engine and Model rows', () => {
  const plan = imageRowSteps([{ key: 'sd-engine', done: false, bytes: 30_000_000 }, { key: 'image-model', done: true, bytes: 1 }]);
  assert.equal(plan.engine.bytes, 30_000_000);
  assert.equal(plan.model.done, true);
  // A step that found its file already here leaves its row alone.
  assert.equal(imageRowSteps([{ key: 'sd-engine', status: 'skipped' }]).engine, null);
  const job = { status: 'error', steps: [{ key: 'sd-engine', status: 'done' }, { key: 'image-model', status: 'error', error: 'HF answered 500' }] };
  assert.deepEqual(failedImageRow(job), { row: 'model', step: job.steps[1] });
  assert.equal(failedImageRow({ status: 'error', steps: [{ key: 'sd-engine', status: 'error' }] }).row, 'engine');
  assert.equal(failedImageRow({ status: 'cancelled', steps: [] }), null);
  assert.equal(setupModelName(catalog, { modelId: 'sdxl-turbo-q8' }), 'SDXL Turbo');
});

test('the first run sets up what suits the graphics card, or what was picked', () => {
  assert.equal(firstRunImagePick({ status: fresh, catalog }), 'catalog:sd15-q8');
  assert.equal(firstRunSetupModel({ status: fresh, catalog }), 'sd15-q8');
  assert.equal(firstRunSetupModel({ status: fresh, catalog, pick: 'catalog:sdxl-turbo-q8' }), 'sdxl-turbo-q8');
  // A service waiting for its key, or a file already here: nothing to set up.
  assert.equal(firstRunSetupModel({ status: fresh, catalog, draft: { provider: 'openai' } }), null);
  assert.equal(firstRunSetupModel({ status: fresh, catalog, pick: 'file:/data/sd/dreamshaper_8.safetensors' }), null);
  // Too big for the card: the first one that isn't.
  const big = { ...catalog, models: [{ ...catalog.models[0], fit: 'too_big' }, { ...catalog.models[1], recommended: true, fit: 'fits' }] };
  assert.equal(firstRunImagePick({ status: fresh, catalog: big }), 'catalog:sdxl-turbo-q8');

  // An engine that can't be downloaded here stops the download before it starts.
  const engine = { key: 'sd-engine', done: false, bytes: null, error: 'No prebuilt Image (stable-diffusion.cpp) download is available for linux-x64.', unavailable: true };
  assert.deepEqual(setupEngineBlocked({ steps: [engine] }), { unavailable: true, text: 'Images need stable-diffusion.cpp installed on this computer first.' });
  assert.equal(setupEngineBlocked({ steps: [{ ...engine, unavailable: false }] }).text, 'Images can be set up once the engine can be checked.');
  assert.equal(setupEngineBlocked({ steps: [{ key: 'sd-engine', done: false, bytes: 31_000_000 }] }), null);
  assert.equal(setupEngineBlocked(null), null);
});

test('picks and the model in use read with their catalog name, size and fit', () => {
  assert.deepEqual(pickedImage(catalog, library, 'catalog:sd15-q8'), {
    id: 'sd15-q8', name: 'Stable Diffusion 1.5', recommended: true, bytes: 1_760_000_000, path: '/m/image/sd15-Q8_0.gguf', fit: 'fits',
  });
  assert.equal(pickedImage(catalog, library, 'catalog:sdxl-turbo-q8').path, null);
  assert.deepEqual(pickedImage(catalog, library, 'file:/data/sd/dreamshaper_8.safetensors'), {
    id: null, name: 'dreamshaper_8.safetensors', recommended: false, bytes: 2_130_000_000, path: '/data/sd/dreamshaper_8.safetensors', fit: null,
  });
  assert.deepEqual(imageInUse(ready, catalog, library), { name: 'Stable Diffusion 1.5', bytes: 1_760_000_000, path: '/m/image/sd15-Q8_0.gguf' });
  assert.equal(imageInUse({ provider: 'openai', model: 'gpt-image-a' }, catalog, library), null);
  assert.equal(imageInUse(fresh, catalog, library), null);
});

test('a small graphics card, or none, is said once', () => {
  assert.equal(cardIsSmall(catalog), false);
  assert.equal(cardIsSmall({ models: catalog.models.map((model) => ({ ...model, fit: 'too_big' })) }), true);
  assert.equal(cardIsSmall({ models: catalog.models.map((model) => ({ ...model, fit: 'cpu' })) }), true);
  assert.equal(cardIsSmall({ models: [{ ...catalog.models[0], fit: 'unknown' }] }), false);
  assert.equal(cardIsSmall({ models: [] }), false);
});

test('Runs on: a service without a key or a ComfyUI that does not answer waits, anything else happens at once', () => {
  assert.deepEqual(imageRunsOnChange('local', { saved: 'local', cloud: catalog.cloud }), { type: 'clear' });
  assert.deepEqual(imageRunsOnChange('openai', { saved: 'local', cloud: catalog.cloud }), { type: 'draft', draft: { provider: 'openai', model: 'gpt-image-a' } });
  assert.deepEqual(imageRunsOnChange('gemini', { saved: 'local', cloud: catalog.cloud }), { type: 'choose', choice: { provider: 'gemini' } });
  assert.deepEqual(imageRunsOnChange('comfyui', { saved: 'local', cloud: catalog.cloud }), { type: 'draft', draft: { provider: 'comfyui', model: null } });
  assert.deepEqual(imageRunsOnChange('comfyui', { saved: 'local', cloud: catalog.cloud, comfyFound: true }), { type: 'choose', choice: { provider: 'comfyui' } });
  assert.deepEqual(imageRunsOnChange('local', { saved: 'openai', cloud: catalog.cloud }), { type: 'choose', choice: { provider: 'local' } });
  assert.deepEqual(imageDraftChoice({ provider: 'openai', model: 'gpt-image-b' }), { provider: 'openai', model: 'gpt-image-b' });
  assert.deepEqual(imageDraftChoice({ provider: 'comfyui', model: null }), { provider: 'comfyui' });
  assert.equal(imageDraftChoice(null), null);
  assert.equal(imagesSwitchedText('openai', catalog.cloud), 'Images now use OpenAI');
  assert.equal(imagesSwitchedText('comfyui', catalog.cloud), 'Images now use ComfyUI');
  assert.equal(imagesSwitchedText('local', catalog.cloud), 'Images are now made on this computer');
});

test('hints and service models', () => {
  assert.equal(imagesHint('local'), 'On your graphics card, or by a service you have a key for.');
  assert.equal(imagesHint('openai', catalog.cloud), 'Each image is billed to your OpenAI account.');
  assert.equal(imagesHint('fal', catalog.cloud), "Each image is billed to your fal account. It makes new images but can't change them.");
  assert.equal(imagesHint('comfyui'), 'By a ComfyUI you run yourself.');
  assert.equal(serviceModelName(catalog.cloud.openai, 'gpt-image-b'), 'GPT Image B');
  assert.equal(serviceModelName(catalog.cloud.openai, 'gpt-unknown'), 'gpt-unknown');
  assert.equal(serviceModel(catalog.cloud.openai, { saved: 'gpt-image-b' }), 'gpt-image-b');
  assert.equal(serviceModel(catalog.cloud.openai, { draft: { model: null }, saved: 'gpt-image-b' }), 'gpt-image-a');
  assert.equal(serviceModel(catalog.cloud.fal, {}), 'flux-schnell');
});

test('ComfyUI: its status in a line, checkpoint names and the address', () => {
  assert.deepEqual(comfyStatusText(null), { text: 'Checking…', tone: null });
  assert.deepEqual(comfyStatusText({ found: true, checkpoints: ['a', 'b'] }), { text: 'Connected · 2 checkpoints', tone: null });
  assert.equal(comfyStatusText({ found: true, checkpoints: ['a'] }).text, 'Connected · 1 checkpoint');
  assert.equal(comfyStatusText({ found: true, checkpoints: [] }).text, 'Connected · no checkpoints yet');
  assert.deepEqual(comfyStatusText({ found: false }), { text: 'Not reachable. Start ComfyUI, then check again.', tone: 'warning' });
  assert.equal(comfyStatusText({ found: false }, { fallback: 'Stable Diffusion 1.5' }).text, "ComfyUI isn't running. Images use Stable Diffusion 1.5 until it is.");
  assert.equal(checkpointLabel('dreamshaper_8.safetensors'), 'dreamshaper_8');
  assert.equal(checkpointLabel('SD1.5/v1-5-pruned.ckpt'), 'SD1.5/v1-5-pruned');
  assert.deepEqual(cleanComfyAddress(' http://192.168.1.20:8188/ '), { value: 'http://192.168.1.20:8188' });
  assert.ok(cleanComfyAddress('192.168.1.20:8188').error);
  assert.ok(cleanComfyAddress('').error);
  assert.ok(cleanComfyAddress('ftp://host').error);
});
