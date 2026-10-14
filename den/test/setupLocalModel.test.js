import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

// First-run setup, "Run a model on this computer" (den/src/setup/): the
// starter models and how they fit, the engine build it picks, and whole
// download runs against a fake Hugging Face and a fake engine installer.
// Nothing is downloaded from the internet and no engine is started.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-setup-'));
process.env.ASYNCAT_HOME = path.join(scratch, 'home');

const MODEL_BYTES = Buffer.alloc(4096, 7);
const hfRequests = [];
const hf = http.createServer((req, res) => {
  hfRequests.push(req.url);
  if (req.url === '/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf') {
    res.setHeader('content-length', MODEL_BYTES.length);
    res.end(MODEL_BYTES);
    return;
  }
  res.statusCode = 404;
  res.end('missing');
});
hf.listen(0, '127.0.0.1');
await once(hf, 'listening');
process.env.HF_ENDPOINT = `http://127.0.0.1:${hf.address().port}`;

const { default: db } = await import('../src/db/client.js');
const { MODELS_DIR } = await import('../src/ai/controllers/ai/modelManager.js');
const { GUIDED_MODELS } = await import('../src/training/trainingPlan.js');
const starter = await import('../src/setup/starterModels.js');
const local = await import('../src/setup/localModelSetup.js');
const setupJobs = await import('../src/media/setupJobs.js');

const GB = 1024 ** 3;
const USER = 'setup-test-user';

test.after(() => {
  hf.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function waitFor(check, { timeoutMs = 5000 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function addUser(id) {
  db.prepare("INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, 'User')").run(id, `${id}@asyncat`);
}

test('the starter models are the guided-training GGUFs, smallest first, with their sizes', () => {
  assert.equal(starter.STARTER_MODELS.length, GUIDED_MODELS.length);
  for (const model of starter.STARTER_MODELS) {
    const source = GUIDED_MODELS.find((item) => item.id === model.id);
    assert.equal(model.file, source.gguf.file);
    assert.equal(model.bytes, source.gguf.bytes);
    assert.ok(model.note.length > 10, model.id);
  }
  const sizes = starter.STARTER_MODELS.map((model) => model.bytes);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
});

test('how a model fits: graphics card, processor, tight, too big', () => {
  const small = starter.starterModel('qwen3-1.7b');
  assert.equal(starter.chatFit(small, { gpuBytes: 6 * GB, ramBytes: 16 * GB }), 'gpu');
  assert.equal(starter.chatFit(small, { gpuBytes: 0, ramBytes: 16 * GB }), 'cpu');
  assert.equal(starter.chatFit(small, { ramBytes: 4 * GB }), 'tight');
  assert.equal(starter.chatFit(small, { ramBytes: 2 * GB }), 'too_big');
  assert.equal(starter.chatFit(small, {}), 'cpu', 'unknown memory is taken as enough');
  // A card too small for the model falls back to memory.
  assert.equal(starter.chatFit(starter.starterModel('qwen3-4b-instruct'), { gpuBytes: 2 * GB, ramBytes: 32 * GB }), 'cpu');
});

test('suggestions: the best that runs well, and the smallest as the lighter choice', () => {
  const ids = (list) => list.map((model) => `${model.id}${model.recommended ? '*' : ''}`);
  // A 6 GB graphics card the engine uses.
  assert.deepEqual(ids(starter.suggestStarterModels({ gpuBytes: 6 * GB, ramBytes: 16 * GB })), ['qwen3-4b-instruct*', 'qwen3-1.7b']);
  // The processor alone: nothing above 3B, however much memory.
  assert.deepEqual(ids(starter.suggestStarterModels({ ramBytes: 64 * GB })), ['llama-3.2-3b*', 'qwen3-1.7b']);
  assert.deepEqual(ids(starter.suggestStarterModels({ ramBytes: 8 * GB })), ['llama-3.2-3b*', 'qwen3-1.7b']);
  // Too little memory for any to run well: only the smallest, not recommended, saying why.
  const tight = starter.suggestStarterModels({ ramBytes: 4 * GB });
  assert.deepEqual(ids(tight), ['qwen3-1.7b']);
  assert.equal(tight[0].fit, 'tight');
});

test('graphics memory counts only when the engine uses the card', () => {
  const nvidia = { vendor: 'NVIDIA', name: 'RTX', vramGb: 6 };
  assert.equal(local.usableGpuBytes(nvidia, { engineGpu: true }), 6 * GB);
  assert.equal(local.usableGpuBytes(nvidia, { engineGpu: false }), 0);
  assert.equal(local.usableGpuBytes(null, { engineGpu: true }), 0);
  assert.equal(local.usableGpuBytes({ vendor: 'Apple', name: 'M3' }, { engineGpu: true, ramBytes: 16 * GB }), 16 * GB * 0.65);
  assert.equal(local.usableGpuBytes({ vendor: 'AMD', name: 'ROCm', vramGb: null }, { engineGpu: true }), 0);
});

const RELEASES = [
  {
    tagName: 'b9000',
    assets: [
      { name: 'llama-b9000-bin-ubuntu-vulkan-x64.zip', compatible: true, supportedProfiles: ['vulkan'], profileScores: { vulkan: 109 }, sizeBytes: 52_000_000 },
      { name: 'llama-b9000-bin-ubuntu-x64-noavx.zip', compatible: true, supportedProfiles: ['cpu_safe'], profileScores: { cpu_safe: 67 }, sizeBytes: 30_000_000 },
      { name: 'llama-b9000-bin-ubuntu-x64.zip', compatible: true, supportedProfiles: ['cpu_safe'], profileScores: { cpu_safe: 69 }, sizeBytes: 31_000_000 },
    ],
  },
];

// The same release without its Vulkan build.
const CPU_ONLY = RELEASES.map((release) => ({ ...release, assets: release.assets.filter((asset) => !asset.supportedProfiles.includes('vulkan')) }));

test('the engine build: for the graphics card when there is one to download, else Vulkan, else the processor', () => {
  assert.deepEqual(local.pickEngineBuild(RELEASES, 'vulkan'), { profile: 'vulkan', releaseTag: 'b9000', bytes: 52_000_000 });
  // No CUDA build is published for Linux: the Vulkan one runs on NVIDIA cards too.
  assert.deepEqual(local.pickEngineBuild(RELEASES, 'nvidia_gpu'), { profile: 'vulkan', releaseTag: 'b9000', bytes: 52_000_000 });
  assert.equal(local.pickEngineBuild(RELEASES, 'amd_rocm').profile, 'vulkan');
  // Apple chips don't take Vulkan; with no GPU build at all, the best-scored processor build.
  assert.deepEqual(local.pickEngineBuild(RELEASES, 'apple_metal'), { profile: 'cpu_safe', releaseTag: 'b9000', bytes: 31_000_000 });
  assert.deepEqual(local.pickEngineBuild(CPU_ONLY, 'nvidia_gpu'), { profile: 'cpu_safe', releaseTag: 'b9000', bytes: 31_000_000 });
  assert.equal(local.pickEngineBuild([], 'cpu_safe'), null);
});

test('the plan: hardware, the engine and the models offered, with what is already here', async () => {
  const modelsDir = path.join(scratch, 'plan-models');
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.writeFileSync(path.join(modelsDir, 'Qwen3-1.7B-Q4_K_M.gguf'), 'x');
  const gpu = { vendor: 'NVIDIA', name: 'GeForce RTX 4050', vramGb: 6 };

  // No engine yet: the Vulkan build for the card, sized, and the biggest model that fits on it.
  const fresh = await local.localModelPlan({
    advisor: async () => ({ current: null, hardware: { gpu }, recommendation: { recommendedInstallProfile: 'nvidia_gpu' } }),
    catalog: async () => ({ releases: RELEASES }),
    ramBytes: 16 * GB,
    modelsDir,
  });
  assert.deepEqual(fresh.engine, { installed: false, gpu: true, profile: 'vulkan', releaseTag: 'b9000', bytes: 52_000_000 });
  assert.deepEqual(fresh.hardware, { ramBytes: 16 * GB, gpu: { vendor: 'NVIDIA', name: 'GeForce RTX 4050', vramGb: 6 } });
  assert.deepEqual(fresh.models.map((model) => [model.id, model.fit, model.recommended, model.installed]), [
    ['qwen3-4b-instruct', 'gpu', true, false],
    ['qwen3-1.7b', 'gpu', false, true],
  ]);

  // No GPU build to download: the processor one, and models by memory.
  const cpuOnly = await local.localModelPlan({
    advisor: async () => ({ current: null, hardware: { gpu }, recommendation: { recommendedInstallProfile: 'nvidia_gpu' } }),
    catalog: async () => ({ releases: CPU_ONLY }),
    ramBytes: 16 * GB,
    modelsDir,
  });
  assert.deepEqual(cpuOnly.engine, { installed: false, gpu: false, profile: 'cpu_safe', releaseTag: 'b9000', bytes: 31_000_000 });
  assert.deepEqual(cpuOnly.models.map((model) => [model.id, model.fit, model.recommended, model.installed]), [
    ['llama-3.2-3b', 'cpu', true, false],
    ['qwen3-1.7b', 'cpu', false, true],
  ]);

  // A GPU engine already in use, with layers to put on the card: the bigger model, on the card.
  const ready = await local.localModelPlan({
    advisor: async () => ({ current: { capabilityHint: 'nvidia' }, configured: { LLAMA_GPU_LAYERS: '20' }, hardware: { gpu } }),
    catalog: async () => { throw new Error('not asked for'); },
    ramBytes: 16 * GB,
    modelsDir,
  });
  assert.deepEqual(ready.engine, { installed: true, gpu: true });
  assert.equal(ready.models[0].id, 'qwen3-4b-instruct');
  assert.equal(ready.models[0].fit, 'gpu');

  // A GPU build only found on this computer runs with no layers on the card: sized for the processor.
  const found = await local.localModelPlan({
    advisor: async () => ({ current: { capabilityHint: 'nvidia' }, configured: { LLAMA_GPU_LAYERS: '' }, hardware: { gpu } }),
    catalog: async () => { throw new Error('not asked for'); },
    ramBytes: 16 * GB,
    modelsDir,
  });
  assert.deepEqual(found.engine, { installed: true, gpu: false });
  assert.deepEqual(found.models.map((model) => [model.id, model.fit]), [['llama-3.2-3b', 'cpu'], ['qwen3-1.7b', 'cpu']]);

  // Offline with no engine: the models are still offered, and the engine says why it can't be had.
  const offline = await local.localModelPlan({
    advisor: async () => ({ current: null, hardware: { gpu: null }, recommendation: { recommendedInstallProfile: 'cpu_safe' } }),
    catalog: async () => { throw new Error('fetch failed'); },
    ramBytes: 8 * GB,
    modelsDir,
  });
  assert.match(offline.engine.error, /Couldn't find the llama\.cpp engine to download \(fetch failed\)/);
  assert.equal(offline.models.length, 2);
});

function fakeInstaller() {
  const calls = { started: 0, cancelled: [] };
  let polls = 0;
  const installer = () => ({
    start: async () => { calls.started += 1; return { id: 'engine-job' }; },
    get: () => {
      polls += 1;
      if (calls.cancelled.length) return { status: 'cancelled', progress: { percent: 10 } };
      return polls < 3
        ? { status: 'running', progress: { percent: 40, message: 'Downloading llama.cpp', downloadedBytes: 12, totalBytes: 30 } }
        : { status: 'complete', progress: { percent: 100 } };
    },
    cancel: (id) => { calls.cancelled.push(id); },
  });
  return { calls, installer };
}

test('a local model setup installs the engine, downloads the model, then loads it', async () => {
  const target = path.join(MODELS_DIR, 'Qwen3-1.7B-Q4_K_M.gguf');
  fs.rmSync(target, { force: true });
  const { calls, installer } = fakeInstaller();
  const loads = [];
  const job = await local.startLocalModelSetup({ modelId: 'qwen3-1.7b', userId: USER }, {
    plan: async () => ({ engine: { installed: false, profile: 'cpu_safe', releaseTag: 'b9000', bytes: 31_000_000 } }),
    installer,
    engineFound: async () => false,
    load: async (userId, file) => { loads.push([userId, file]); return { loaded: true, path: file }; },
  });
  assert.equal(job.kind, local.SETUP_KIND);
  assert.deepEqual(job.steps.map((step) => [step.key, step.type, step.total]), [['engine', 'engine', 31_000_000], ['model', 'download', 1_110_000_000]]);
  for (const step of job.steps) {
    for (const hidden of ['installer', 'check', 'headers']) assert.equal(step[hidden], undefined, `${step.key} doesn't send ${hidden}`);
  }

  const done = await waitFor(() => {
    const now = setupJobs.getSetupJob(job.id);
    return now.status !== 'running' ? now : null;
  });
  assert.equal(done.status, 'complete', done.error);
  assert.equal(calls.started, 1);
  assert.deepEqual(done.steps.map((step) => step.status), ['done', 'done']);
  assert.deepEqual(fs.readFileSync(target), MODEL_BYTES);
  assert.ok(hfRequests.includes('/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf'));
  assert.deepEqual(loads, [[USER, target]]);
  assert.deepEqual(done.result, { loaded: true, path: target });
  assert.deepEqual(setupJobs.latestSetupJob(local.SETUP_KIND).options, { modelId: 'qwen3-1.7b' });
});

test('an engine already there and a model already downloaded are skipped; Cancel stops an engine install', async () => {
  const { calls, installer } = fakeInstaller();
  const job = await local.startLocalModelSetup({ modelId: 'qwen3-1.7b', userId: USER }, {
    plan: async () => ({ engine: { installed: false, profile: 'cpu_safe', releaseTag: 'b9000', bytes: 1 } }),
    installer,
    engineFound: async () => true,
    load: async (_userId, file) => ({ loaded: false, path: file, reason: 'in_use' }),
  });
  const done = await waitFor(() => {
    const now = setupJobs.getSetupJob(job.id);
    return now.status !== 'running' ? now : null;
  });
  assert.equal(done.status, 'complete');
  assert.deepEqual(done.steps.map((step) => [step.status, step.detail]), [['skipped', 'Already installed'], ['skipped', 'Already on this computer']]);
  assert.equal(calls.started, 0);
  assert.equal(done.result.reason, 'in_use');

  const second = fakeInstaller();
  const cancelled = await local.startLocalModelSetup({ modelId: 'llama-3.2-3b', userId: USER }, {
    plan: async () => ({ engine: { installed: false, profile: 'cpu_safe', releaseTag: 'b9000', bytes: 1 } }),
    installer: second.installer,
    engineFound: async () => false,
    load: async () => assert.fail('nothing to load after a cancel'),
  });
  await waitFor(() => second.calls.started === 1);
  setupJobs.cancelSetupJob(cancelled.id);
  const after = await waitFor(() => {
    const now = setupJobs.getSetupJob(cancelled.id);
    return now.status !== 'running' ? now : null;
  });
  assert.equal(after.status, 'cancelled');
  assert.deepEqual(second.calls.cancelled, ['engine-job']);
  assert.equal(fs.existsSync(path.join(MODELS_DIR, 'Llama-3.2-3B-Instruct-Q4_K_M.gguf')), false);
});

test("a model that isn't offered, or no engine to be had, is refused before anything downloads", async () => {
  await assert.rejects(local.startLocalModelSetup({ modelId: 'gpt-huge' }, { plan: async () => assert.fail('not planned') }), { status: 400 });
  await assert.rejects(
    local.startLocalModelSetup({ modelId: 'qwen3-1.7b' }, { plan: async () => ({ engine: { installed: false, error: "Couldn't find the llama.cpp engine to download (fetch failed)." } }) }),
    { status: 502, message: /fetch failed/ },
  );
});

test('the downloaded model loads only when nothing else answers chats', async () => {
  addUser('load-user');
  const started = [];
  const saved = [];
  const deps = (status = 'idle') => ({
    status: () => ({ status }),
    start: async (file, _dir, ctx) => { started.push([file, ctx]); },
    save: (userId, file, ctx) => { saved.push([userId, file, ctx]); },
  });
  assert.deepEqual(await local.loadWhenIdle('load-user', '/models/a.gguf', deps()), { loaded: true, path: '/models/a.gguf' });
  assert.deepEqual(started, [['/models/a.gguf', local.CTX_SIZE]]);
  assert.deepEqual(saved, [['load-user', '/models/a.gguf', local.CTX_SIZE]]);

  assert.equal((await local.loadWhenIdle('load-user', '/models/a.gguf', deps('loading'))).reason, 'in_use');
  db.prepare("INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model) VALUES ('load-user', 'cloud', 'openai', 'https://api.openai.com/v1', 'gpt-test')").run();
  assert.equal((await local.loadWhenIdle('load-user', '/models/a.gguf', deps())).reason, 'in_use', 'a provider connected meanwhile stays');
  assert.equal(started.length, 1);

  const failing = { ...deps(), start: async () => { throw new Error('llama-server not found'); } };
  db.prepare("DELETE FROM ai_provider_config WHERE user_id = 'load-user'").run();
  assert.deepEqual(await local.loadWhenIdle('load-user', '/models/a.gguf', failing), { loaded: false, path: '/models/a.gguf', error: 'llama-server not found' });
});

test('GET /api/setup brings the latest download, so a setup opened again can show it', async () => {
  const { default: express } = await import('express');
  const { default: setupRouter } = await import('../src/setup/setupRoutes.js');
  addUser(USER);
  const app = express();
  app.use((req, _res, next) => { req.user = { id: USER }; next(); });
  app.use('/api/setup', setupRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/setup`).then((r) => r.json());
    assert.equal(res.job.id, setupJobs.latestSetupJob(local.SETUP_KIND).id);
    assert.equal(res.job.kind, local.SETUP_KIND);
    assert.equal(typeof res.setup.show, 'boolean');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
