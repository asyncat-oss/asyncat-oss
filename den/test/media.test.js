import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

// Voice and image setup (den/src/media/): the catalogs, the gallery, a
// whole "Set up voice" run, the voice engines and trying images, against
// fakes on this computer: a fake Hugging Face server (HF_ENDPOINT), a fake
// whisper-server, piper and stable-diffusion.cpp, and a fake ComfyUI.
// Nothing is downloaded from the internet.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-media-'));
const bin = path.join(scratch, 'bin');
fs.mkdirSync(bin, { recursive: true });
// Engines Asyncat installs live here, not in the real ~/.asyncat.
process.env.ASYNCAT_HOME = path.join(scratch, 'home');

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// A whisper-server stand-in: says it is listening, answers /health and
// /inference (with how many bytes it got).
const whisperPort = await freePort();
const fakeWhisper = path.join(bin, 'whisper-server');
fs.writeFileSync(fakeWhisper, `#!/usr/bin/env node
const http = require('node:http');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
http.createServer((req, res) => {
  if (req.url === '/health') { res.end('{"status":"ok"}'); return; }
  if (req.url.startsWith('/inference')) {
    let size = 0;
    req.on('data', (chunk) => { size += chunk.length; });
    req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ text: ' heard you' , size })); });
    return;
  }
  res.statusCode = 404; res.end();
}).listen(port, '127.0.0.1', () => console.error('server is listening on port ' + port));
`, { mode: 0o755 });

// A piper stand-in: reads the text and writes 0.1 s of silence (raw PCM).
const fakePiper = path.join(bin, 'piper');
fs.writeFileSync(fakePiper, `#!/usr/bin/env node
let text = '';
process.stdin.on('data', (d) => { text += d; });
process.stdin.on('end', () => { process.stdout.write(Buffer.alloc(text.length ? 3200 : 0)); });
`, { mode: 0o755 });

// A stable-diffusion.cpp stand-in: notes its arguments and writes a PNG
// where -o says.
const fakeSd = path.join(bin, 'sd');
const sdLog = path.join(scratch, 'sd-args.json');
fs.writeFileSync(fakeSd, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('usage: sd [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(sdLog)}, JSON.stringify(args));
fs.writeFileSync(args[args.indexOf('-o') + 1], Buffer.from('89504e470d0a1a0a', 'hex'));
`, { mode: 0o755 });

process.env.WHISPER_SERVER_PORT = String(whisperPort);
process.env.WHISPER_BINARY_PATH = fakeWhisper;
process.env.PIPER_BINARY_PATH = fakePiper;
process.env.IMAGEGEN_BINARY_PATH = fakeSd;

// A Hugging Face stand-in with the files "Set up voice" asks for.
const FILES = {
  'ggerganov/whisper.cpp/ggml-base.en-q5_1.bin': Buffer.alloc(2048, 1),
  'rhasspy/piper-voices/en/en_US/lessac/medium/en_US-lessac-medium.onnx': Buffer.alloc(4096, 2),
  'rhasspy/piper-voices/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json': Buffer.from(JSON.stringify({ audio: { sample_rate: 16000 } })),
  'rhasspy/piper-voices/en/en_US/lessac/medium/samples/speaker_0.mp3': Buffer.from('ID3fake-mp3'),
};
const requests = [];
const hf = http.createServer((req, res) => {
  requests.push(req.url);
  const tree = /^\/api\/models\/([^/]+\/[^/]+)\/tree\/main\/?(.*)$/.exec(req.url);
  if (tree) {
    const [, repo, dir] = tree;
    const prefix = `${repo}/${dir ? `${decodeURIComponent(dir)}/` : ''}`;
    const list = Object.entries(FILES)
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(([key, body]) => ({ type: 'file', path: key.slice(repo.length + 1), size: body.length }));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(list));
    return;
  }
  const file = /^\/([^/]+\/[^/]+)\/resolve\/main\/(.+)$/.exec(req.url);
  const body = file ? FILES[`${file[1]}/${decodeURIComponent(file[2])}`] : null;
  if (!body) { res.statusCode = 404; res.end('missing'); return; }
  res.setHeader('content-length', body.length);
  res.end(body);
});
hf.listen(0, '127.0.0.1');
await once(hf, 'listening');
process.env.HF_ENDPOINT = `http://127.0.0.1:${hf.address().port}`;

// A ComfyUI stand-in with two checkpoints; it keeps the workflows it is sent.
const comfyPrompts = [];
const comfy = http.createServer((req, res) => {
  const send = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
  if (req.url === '/system_stats') return send({ system: {}, devices: [] });
  if (req.url === '/object_info') {
    return send({
      CheckpointLoaderSimple: { input: { required: { ckpt_name: [['dreamshaper_8.safetensors', 'juggernaut.safetensors']] } } },
      KSampler: { input: { required: { sampler_name: [['euler', 'dpmpp_2m']], scheduler: [['normal', 'karras']] } } },
    });
  }
  if (req.url === '/prompt' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { comfyPrompts.push(JSON.parse(body).prompt); send({ prompt_id: `p${comfyPrompts.length}` }); });
    return undefined;
  }
  if (req.url.startsWith('/history/')) {
    const id = decodeURIComponent(req.url.slice('/history/'.length));
    return send({ [id]: { outputs: { 9: { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } } } });
  }
  if (req.url.startsWith('/view')) {
    res.setHeader('content-type', 'image/png');
    return res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  res.statusCode = 404;
  return res.end();
});
comfy.listen(0, '127.0.0.1');
await once(comfy, 'listening');
process.env.COMFYUI_BASE_URL = `http://127.0.0.1:${comfy.address().port}`;

const { default: db } = await import('../src/db/client.js');
const whisper = await import('../src/ai/controllers/ai/whisperServerManager.js');
const voiceCatalog = await import('../src/media/voiceCatalog.js');
const imageCatalog = await import('../src/media/imageCatalog.js');
const gallery = await import('../src/media/gallery.js');
const voice = await import('../src/media/voiceService.js');
const images = await import('../src/media/imageService.js');
const setupJobs = await import('../src/media/setupJobs.js');
const visualModels = await import('../src/ai/controllers/ai/visualModelManager.js');
const { default: mediaRouter } = await import('../src/media/mediaRoutes.js');
const { default: providerRouter } = await import('../src/ai/routes/providerRoutes.js');
const audioTools = await import('../src/agent/tools/audioTools.js');
const tts = await import('../src/ai/controllers/ai/ttsServerManager.js');

test.after(async () => {
  await whisper.stopWhisper().catch(() => {});
  hf.close();
  comfy.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function wav({ rate = 16000, channels = 1, bits = 16, samples = 1600 } = {}) {
  const data = Buffer.alloc(samples * channels * (bits / 8));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * (bits / 8), 28);
  header.writeUInt16LE(channels * (bits / 8), 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Serve a router on a free port, as the app mounts it, for one test. */
async function serve(mount, router) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'media-test-user' }; next(); });
  app.use(mount, router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}${mount}`;
  return {
    base,
    get: (route) => fetch(`${base}${route}`).then(async (res) => ({ status: res.status, body: await res.json() })),
    post: (route, body = {}) => fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() })),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function until(check, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

// ── Catalogs ─────────────────────────────────────────────────────────────────

test('16 kHz mono WAV goes to whisper as it is; other audio needs converting', () => {
  assert.equal(whisper.isWhisperReadyWav(wav()), true);
  assert.equal(whisper.isWhisperReadyWav(wav({ rate: 44100 })), false);
  assert.equal(whisper.isWhisperReadyWav(wav({ channels: 2 })), false);
  assert.equal(whisper.isWhisperReadyWav(Buffer.from('\x1aE\xdf\xa3webm-ish data that is long enough to check')), false);
  assert.equal(whisper.isWhisperReadyWav(Buffer.alloc(10)), false);
});

test('Piper voices map to their files and samples in the repo', () => {
  assert.equal(voiceCatalog.piperVoiceBase('en_GB-jenny_dioco-medium'), 'en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium');
  assert.equal(voiceCatalog.piperSamplePath('en_US-lessac-medium'), 'en/en_US/lessac/medium/samples/speaker_0.mp3');
  assert.equal(voiceCatalog.recommendedVoiceSetup('de-DE').voice.id, 'de_DE-thorsten-medium');
  assert.equal(voiceCatalog.recommendedVoiceSetup('en-GB').voice.locale, 'en-GB');
  assert.equal(voiceCatalog.recommendedVoiceSetup('xx').voice.id, 'en_US-lessac-medium', 'unknown languages get the default voice');
  assert.equal(voiceCatalog.recommendedVoiceSetup('en').whisper.chosenFile, 'ggml-base.en-q5_1.bin');
  assert.equal(voiceCatalog.recommendedVoiceSetup('fr').whisper.chosenFile, 'ggml-base-q5_1.bin', 'other languages get the multilingual model');
});

test('image models get settings that suit them, and a fit for the graphics card', () => {
  assert.deepEqual(imageCatalog.imageModelDefaults('/m/sd_xl_turbo_1.0.q8_0.gguf'), { width: 512, height: 512, steps: 4, cfg: 1, sampler: 'euler_a' });
  assert.equal(imageCatalog.imageModelDefaults('/m/sd_xl_base_1.0.safetensors').width, 1024);
  assert.equal(imageCatalog.imageModelDefaults('/m/stable-diffusion-v1-5-pruned-emaonly-Q8_0.gguf').steps, 24);
  const [sd15, sdxl] = imageCatalog.IMAGE_MODELS;
  const rtx4050 = { vendor: 'NVIDIA', name: 'RTX 4050 Laptop', vramGb: 6 };
  assert.equal(imageCatalog.fitForGpu(sd15, rtx4050), 'fits');
  assert.equal(imageCatalog.fitForGpu(sdxl, rtx4050), 'fits');
  assert.equal(imageCatalog.fitForGpu(sdxl, { vendor: 'NVIDIA', vramGb: 4 }), 'too_big');
  assert.equal(imageCatalog.fitForGpu(sd15, null), 'cpu');
  assert.equal(imageCatalog.fitForGpu(sd15, { vendor: 'AMD', vramGb: null }), 'unknown');
  assert.equal(imageCatalog.fitForGpu(sdxl, { vendor: 'Apple', vramGb: null }, { ramGb: 16 }), 'fits');
});

// ── Gallery ──────────────────────────────────────────────────────────────────

test('the gallery lists pictures newest first, with what they were made from', () => {
  const dir = gallery.galleryDir();
  fs.mkdirSync(dir, { recursive: true });
  const older = path.join(dir, 'asyncat_old.png');
  const newer = path.join(dir, 'agent_new.png');
  fs.writeFileSync(older, 'png');
  fs.utimesSync(older, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  fs.writeFileSync(newer, 'png');
  gallery.recordGalleryImage(newer, { prompt: 'a cat on a balcony', runtime: 'openai', model: '/x/model.gguf', width: 1024, height: 1024 });
  gallery.recordGalleryImage('/etc/passwd', { prompt: 'nope' });

  const { images, total } = gallery.listGallery();
  assert.equal(total, 2);
  assert.equal(images[0].name, 'agent_new.png');
  assert.equal(images[0].prompt, 'a cat on a balcony');
  assert.equal(images[0].model, 'model.gguf');
  assert.equal(images[0].url, '/api/media/gallery/file/agent_new.png');
  assert.equal(gallery.galleryFile('../asyncat.db'), null, 'only pictures in the gallery folder');
  assert.equal(gallery.galleryFile('agent_new.png'), newer);

  assert.equal(gallery.deleteGalleryImage('agent_new.png'), true);
  assert.equal(fs.existsSync(`${newer}.json`), false);
  assert.equal(gallery.listGallery().total, 1);
});

// ── Set up voice ─────────────────────────────────────────────────────────────

test('the voice plan shows what downloads and how big, before anything starts', async () => {
  const plan = await voice.planVoiceSetup({ language: 'en' });
  const byKey = Object.fromEntries(plan.steps.map((step) => [step.key, step]));
  assert.equal(byKey['whisper-engine'].done, true, 'the engines are found, nothing to install');
  assert.equal(byKey['whisper-model'].bytes, 2048, 'sizes come from the repo listing');
  assert.equal(byKey.voice.bytes, 4096);
  assert.equal(plan.totalBytes, 2048 + 4096 + FILES['rhasspy/piper-voices/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json'].length);
  assert.equal(requests.some((url) => url.includes('/resolve/')), false, 'planning downloads nothing');
});

test('"Set up voice" downloads the models, then listening and speaking are ready', async () => {
  const before = await voice.voiceStatus();
  assert.equal(before.stt.reason, 'needs_model');
  assert.equal(before.tts.reason, 'needs_voice');

  const job = await voice.startVoiceSetup({ language: 'en' });
  const done = await until(() => {
    const now = setupJobs.getSetupJob(job.id);
    return now.status !== 'running' ? now : null;
  });
  assert.equal(done.status, 'complete', JSON.stringify(done.steps.map((step) => [step.key, step.status, step.error])));
  assert.deepEqual(done.steps.filter((step) => step.type === 'engine').map((step) => step.status), ['skipped', 'skipped']);
  assert.ok(fs.existsSync(path.join(voice.WHISPER_DIR, 'ggml-base.en-q5_1.bin')));
  assert.ok(fs.existsSync(path.join(voice.VOICES_DIR, 'en_US-lessac-medium.onnx.json')));
  assert.equal(fs.readdirSync(voice.WHISPER_DIR).some((name) => name.endsWith('.part')), false, 'no half files left');

  const after = await voice.voiceStatus();
  assert.equal(after.setUp, true);
  assert.equal(after.stt.model.name, 'Base (English)');
  assert.equal(after.tts.voice.name, 'Lessac (English (US))');
  assert.equal(process.env.ASYNCAT_STT_MODEL, path.join(voice.WHISPER_DIR, 'ggml-base.en-q5_1.bin'), 'the choice is saved');

  const again = await voice.startVoiceSetup({ language: 'en' });
  const second = await until(() => {
    const now = setupJobs.getSetupJob(again.id);
    return now.status !== 'running' ? now : null;
  });
  assert.ok(second.steps.every((step) => step.status === 'skipped'), 'a second run downloads nothing');
});

test('listening starts on first use and takes the mic recording without ffmpeg', async () => {
  assert.equal(whisper.getStatus().status, 'idle');
  await voice.ensureLocalListening();
  assert.equal(whisper.getStatus().status, 'ready');
  const result = await whisper.transcribe(wav());
  assert.equal(result.text, ' heard you');
});

test('a voice can be heard before choosing it, and a sample comes from the repo once', async () => {
  const preview = await voice.previewVoice({ provider: 'local', voice: 'en_US-lessac-medium', text: 'Hello there' });
  assert.equal(preview.mime, 'audio/wav');
  assert.equal(preview.buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(preview.buffer.readUInt32LE(24), 16000, 'at the voice’s own sample rate');

  const first = await voice.voiceSample('en_US-lessac-medium');
  const fetched = requests.filter((url) => url.includes('speaker_0.mp3')).length;
  const second = await voice.voiceSample('en_US-lessac-medium');
  assert.equal(first.toString(), 'ID3fake-mp3');
  assert.equal(second.toString(), 'ID3fake-mp3');
  assert.equal(requests.filter((url) => url.includes('speaker_0.mp3')).length, fetched, 'played again from the cache');
  await assert.rejects(voice.voiceSample('xx_XX-nobody-low'), /No such voice/);
});

test('cloud speech needs its key; choosing it saves the voice', async () => {
  const status = await voice.chooseVoice({ tts: { provider: 'openai', voice: 'nova' } });
  assert.equal(status.tts.provider, 'openai');
  assert.equal(status.tts.ready, false);
  assert.equal(status.tts.reason, 'needs_key');
  assert.equal(process.env.OPENAI_TTS_VOICE, 'nova');
  await assert.rejects(voice.previewVoice({ provider: 'openai', voice: 'nova' }), /Add your OpenAI key/);
  await voice.chooseVoice({ tts: { provider: 'local' } });
  assert.equal((await voice.voiceStatus()).tts.ready, true);
});

test('fal can listen and speak, and choosing it saves only the settings it has (B2)', async () => {
  const { cloud } = voice.voiceCatalog();
  assert.equal(cloud.fal.stt.defaultModel, 'whisper');
  assert.deepEqual(cloud.fal.tts.voices.map((item) => item.id), ['af_bella']);

  let status = await voice.chooseVoice({ stt: { provider: 'fal', model: 'whisper' }, tts: { provider: 'fal', voice: 'af_bella' } });
  assert.equal(status.stt.provider, 'fal');
  assert.equal(status.stt.model, 'whisper');
  assert.equal(status.stt.reason, 'needs_key');
  assert.equal(status.tts.voice.name, 'Bella');
  const stray = db.prepare("SELECT COUNT(*) AS n FROM app_config WHERE key IS NULL OR key = 'null'").get().n;
  assert.equal(stray, 0, 'no setting is written for a model fal has no setting for');
  assert.equal(process.env.FAL_TTS_VOICE, 'af_bella');

  process.env.FAL_KEY = 'fal-test-key';
  status = await voice.voiceStatus();
  assert.equal(status.stt.ready && status.tts.ready, true);
  delete process.env.FAL_KEY;
  await voice.chooseVoice({ stt: { provider: 'local' }, tts: { provider: 'local' } });
});

test('listening or speaking can be turned off, and nothing tries to use it (B3)', async () => {
  await voice.ensureLocalListening();
  await voice.ensureLocalSpeaking();
  let status = await voice.chooseVoice({ stt: { provider: 'off' } });
  assert.deepEqual(status.stt, { provider: 'off', ready: false, reason: 'off' });
  assert.equal(status.setUp, true, 'speaking ready and listening off still counts as set up');
  assert.equal(whisper.getStatus().status, 'idle', 'turning listening off frees its memory');

  const api = await serve('/api/ai/providers', providerRouter);
  try {
    const heard = await fetch(`${api.base}/audio/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav() });
    assert.equal(heard.status, 409);
    assert.match((await heard.json()).error, /Listening is off/);
    const tool = await audioTools.transcribeAudioTool.execute({ path: 'clip.wav' }, { workingDir: scratch });
    assert.match(tool.error, /Listening is off/);

    status = await voice.chooseVoice({ tts: { provider: 'off' } });
    assert.equal(status.tts.reason, 'off');
    assert.equal(status.setUp, false, 'both off is not set up');
    assert.equal(tts.getStatus().status, 'idle');
    const spoken = await api.post('/audio/speak', { text: 'Hello' });
    assert.equal(spoken.status, 409);
    assert.match(spoken.body.error, /Speaking is off/);
    assert.match((await audioTools.speakTextTool.execute({ text: 'Hello' }, { workingDir: scratch })).error, /Speaking is off/);
  } finally {
    await api.close();
  }

  status = await voice.chooseVoice({ stt: { provider: 'local' }, tts: { provider: 'local' } });
  assert.equal(status.setUp, true, 'turning them back on uses the same models');
});

test('status says whether each local engine has its model loaded (B4)', async () => {
  await voice.ensureLocalListening();
  await voice.ensureLocalSpeaking();
  let status = await voice.voiceStatus();
  assert.equal(status.stt.running, 'ready');
  assert.equal(status.tts.running, 'ready');
  await tts.stopTts();
  status = await voice.voiceStatus();
  assert.equal(status.tts.running, 'idle', 'freed, and still chosen');
  assert.equal(status.tts.ready, true);
});

test('the engine list carries a running install, so a page can pick it up again (B5)', async () => {
  // GitHub never answers, so the install stays at "finding a build" until cancelled.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, options = {}) => (String(url).startsWith('https://api.github.com/')
    ? new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    : realFetch(url, options));
  const api = await serve('/api/ai/providers', providerRouter);
  try {
    const before = await api.get('/runtimes');
    assert.ok(before.body.runtimes.every((runtime) => runtime.installJob === null));

    const started = await api.post('/runtimes/whisper/install-jobs');
    assert.equal(started.status, 202);
    const listed = await api.get('/runtimes');
    const whisperRuntime = listed.body.runtimes.find((runtime) => runtime.id === 'whisper');
    assert.equal(whisperRuntime.installJob.id, started.body.job.id);
    assert.equal(whisperRuntime.installJob.status, 'running');
    assert.equal(listed.body.runtimes.find((runtime) => runtime.id === 'sd').installJob, null);

    await fetch(`${api.base}/runtimes/install-jobs/${started.body.job.id}`, { method: 'DELETE' });
    const after = await until(async () => {
      const { body } = await api.get('/runtimes');
      return body.runtimes.find((runtime) => runtime.id === 'whisper').installJob === null ? body : null;
    }, 5000);
    assert.ok(after, 'a finished install is no longer listed');
  } finally {
    globalThis.fetch = realFetch;
    await api.close();
  }
});

// ── Keys ─────────────────────────────────────────────────────────────────────

test('saving an empty key removes it, also a copy in .env (B6)', async () => {
  const config = await import('../src/config/configController.js');
  const call = (handler, body = {}) => {
    let out = null;
    const res = {
      code: 200,
      status(code) { this.code = code; return this; },
      json(data) { out = { status: this.code, ...data }; return this; },
    };
    handler({ body }, res);
    return out;
  };
  const envFile = process.env.ASYNCAT_ENV_PATH;

  assert.equal(call(config.updateSecret, { key: 'OPENAI_API_KEY', value: 'sk-test-0123456789abcdef' }).success, true);
  assert.equal(process.env.OPENAI_API_KEY, 'sk-test-0123456789abcdef');
  assert.equal(call(config.updateSecret, { key: 'OPENAI_API_KEY' }).status, 400, 'no value at all is a mistake');
  assert.equal(process.env.OPENAI_API_KEY, 'sk-test-0123456789abcdef', 'and keeps the key');
  // An older version kept keys in the runtime .env.
  fs.writeFileSync(envFile, 'PORT=8716\nOPENAI_API_KEY=sk-old-0123456789abcdef\n');

  const removed = call(config.updateSecret, { key: 'OPENAI_API_KEY', value: '' });
  assert.equal(removed.status, 200);
  assert.equal(removed.removed, true);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM app_config WHERE key = ?').get('OPENAI_API_KEY').n, 0);
  const env = fs.readFileSync(envFile, 'utf8');
  assert.match(env, /^OPENAI_API_KEY=$/m, 'blanked in .env, so it stays gone after a restart');
  assert.match(env, /^PORT=8716$/m, 'other lines are kept');
  assert.equal(call(config.getSecrets).secrets.OPENAI_API_KEY, '');
  assert.equal(voice.voiceCatalog().cloud.openai.hasKey, false);

  assert.equal(call(config.updateSecret, { key: 'HF_TOKEN', value: '' }).success, true, 'removing a key that isn\'t saved is fine');
  assert.equal(call(config.updateSecret, { key: 'PORT', value: '' }).status, 400, 'only secrets');
});

// ── Images ───────────────────────────────────────────────────────────────────

function addImageFile(name, body = 'weights') {
  const file = path.join(images.IMAGE_DIR, name);
  fs.mkdirSync(images.IMAGE_DIR, { recursive: true });
  fs.writeFileSync(file, body);
  visualModels.clearCache();
  return file;
}

test('trying an image takes its options and says what it made (B1)', async () => {
  const model = addImageFile('dreamshaper_8.safetensors');
  await images.chooseImage({ provider: 'local', model });
  const api = await serve('/api/media', mediaRouter);
  try {
    const { status, body } = await api.post('/images/try', {
      prompt: 'A red bicycle by a canal',
      negativePrompt: 'blurry',
      width: 768,
      height: 512,
      steps: '8',
      cfg: '',
      sampler: 'euler',
      seed: 42,
    });
    assert.equal(status, 200, JSON.stringify(body));
    const { image } = body;
    assert.equal(image.runtime, 'stable-diffusion.cpp');
    assert.equal(image.model, 'dreamshaper_8.safetensors');
    assert.deepEqual([image.width, image.height, image.seed, image.steps], [768, 512, 42, 8]);
    assert.match(image.name, /^asyncat_.+\.png$/);
    assert.equal(image.url, `/api/media/gallery/file/${image.name}`);

    const args = JSON.parse(fs.readFileSync(sdLog, 'utf8'));
    const arg = (flag) => args[args.indexOf(flag) + 1];
    assert.equal(arg('-n'), 'blurry', 'the negative prompt reaches the engine');
    assert.equal(arg('--steps'), '8');
    assert.equal(arg('--cfg-scale'), '7', 'an empty field takes the default');
    assert.equal(arg('--sampling-method'), 'euler');

    const saved = gallery.listGallery().images.find((item) => item.name === image.name);
    assert.equal(saved.prompt, 'A red bicycle by a canal', 'it is in the gallery with what it was made from');
    assert.equal(saved.seed, 42);

    const empty = await api.post('/images/try', {});
    assert.equal(empty.body.image.prompt, images.TRY_PROMPT, 'no prompt tries the default one');
  } finally {
    await api.close();
  }
});
