import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// A model that is loaded, drawing a picture or still downloading can't be
// deleted (storage/modelLocks.js): the Models pages' delete routes answer
// 409 IN_USE. The engines are stand-ins on this computer: the fake
// llama-server, and small whisper-server, piper and stable-diffusion.cpp
// scripts.

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-model-locks-'));
const bin = path.join(scratch, 'bin');
fs.mkdirSync(bin, { recursive: true });
const skip = process.platform === 'win32' ? 'the stand-in engines are shell scripts' : false;

async function freePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function until(check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const script = (name, body) => {
  const file = path.join(bin, name);
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}`, { mode: 0o755 });
  return file;
};

process.env.ASYNCAT_HOME = path.join(scratch, 'home');
process.env.LLAMA_SERVER_PORT = String(await freePort());
process.env.LLAMA_BINARY_PATH = path.join(here, 'fixtures', 'fakeLlamaServer.mjs');
process.env.WHISPER_SERVER_PORT = String(await freePort());
process.env.WHISPER_BINARY_PATH = script('whisper-server', `
const http = require('node:http');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
http.createServer((req, res) => res.end('{"status":"ok"}'))
  .listen(port, '127.0.0.1', () => console.error('server is listening on port ' + port));
`);
process.env.PIPER_BINARY_PATH = script('piper', "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(Buffer.alloc(320)));\n");
// Draws only once the test says so, so a picture is "being made" meanwhile.
const release = path.join(scratch, 'release');
process.env.IMAGEGEN_BINARY_PATH = script('sd', `
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('usage: sd [options]'); process.exit(0); }
const timer = setInterval(() => {
  if (!fs.existsSync(${JSON.stringify(release)})) return;
  clearInterval(timer);
  fs.writeFileSync(args[args.indexOf('-o') + 1], Buffer.from('89504e470d0a1a0a', 'hex'));
}, 20);
`);

const { default: db } = await import('../src/db/client.js');
const { default: express } = await import('express');
const { default: providerRoutes } = await import('../src/ai/routes/providerRoutes.js');
const llama = await import('../src/ai/controllers/ai/llamaServerManager.js');
const whisper = await import('../src/ai/controllers/ai/whisperServerManager.js');
const tts = await import('../src/ai/controllers/ai/ttsServerManager.js');
const sd = await import('../src/ai/controllers/ai/sdCppManager.js');
const { MODELS_DIR, startDownload, cancelDownload, listActiveDownloads } = await import('../src/ai/controllers/ai/modelManager.js');
const locks = await import('../src/storage/modelLocks.js');
const { modelInUse, MODEL_LOADED, ADAPTER_LOADED, MODEL_DRAWING, MODEL_DOWNLOADING } = locks;

const userId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);

const write = (file, data = 'x') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); return file; };
const model = write(path.join(MODELS_DIR, 'garden-Q4_K_M.gguf'), 'GGUF');
const projector = write(path.join(MODELS_DIR, 'mmproj-garden-f16.gguf'), 'GGUF');
const other = write(path.join(MODELS_DIR, 'other.gguf'), 'GGUF');
const listener = write(path.join(MODELS_DIR, 'audio', 'whisper', 'ggml-base.bin'), 'bin');
const voice = write(path.join(MODELS_DIR, 'audio', 'tts', 'en_US-demo.onnx'), 'onnx');
write(`${voice}.json`, JSON.stringify({ audio: { sample_rate: 16000 } }));
const painter = write(path.join(MODELS_DIR, 'image', 'painter.safetensors'), 'st');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; next(); });
app.use('/api/ai/providers', providerRoutes);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/ai/providers`;
const del = async (suffix) => {
  const res = await fetch(`${base}${suffix}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
};

test.after(async () => {
  await llama.stopServer().catch(() => {});
  await whisper.stopWhisper().catch(() => {});
  await tts.stopTts().catch(() => {});
  await sd.stopSdCpp({ graceMs: 200 }).catch(() => {});
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('every engine is asked, whatever kind of model it is', () => {
  const idle = { status: 'idle' };
  const quiet = {
    llama: () => idle, mlx: () => idle, whisper: () => idle, tts: () => idle,
    drawing: () => [], downloads: () => [], adapterFile: () => null,
  };
  const busy = (patch) => ({ ...quiet, ...patch });
  assert.equal(modelInUse('llm', model, quiet), null);

  const loaded = busy({ llama: () => ({ status: 'ready', modelPath: model, mmproj: path.basename(projector), adapter: { id: 'a1' } }), adapterFile: () => path.join(scratch, 'tone.gguf') });
  assert.equal(modelInUse('llm', model, loaded), MODEL_LOADED);
  assert.equal(modelInUse('vision', projector, loaded), MODEL_LOADED, 'its projector too');
  assert.equal(modelInUse('llm', other, loaded), null);
  assert.equal(modelInUse('adapter', 'a1', loaded), ADAPTER_LOADED);
  assert.equal(modelInUse('adapter', 'a2', loaded), null);
  assert.equal(modelInUse('llm', path.join(scratch, 'tone.gguf'), loaded), ADAPTER_LOADED);
  assert.equal(modelInUse('llm', model, busy({ llama: () => ({ status: 'error', modelPath: model }) })), null, 'a model that failed to load is not in use');

  const mlxFolder = path.join(scratch, 'mlx-model');
  fs.mkdirSync(mlxFolder, { recursive: true });
  assert.equal(modelInUse('llm', path.join(mlxFolder, 'weights.safetensors'), busy({ mlx: () => ({ status: 'ready', modelPath: mlxFolder }) })), MODEL_LOADED);
  assert.equal(modelInUse('whisper', listener, busy({ whisper: () => ({ status: 'loading', modelPath: listener }) })), MODEL_LOADED);
  assert.equal(modelInUse('tts', `${voice}.json`, busy({ tts: () => ({ status: 'ready', modelPath: voice }) })), MODEL_LOADED, 'a voice\'s settings too');
  assert.equal(modelInUse('image', painter, busy({ drawing: () => [painter] })), MODEL_DRAWING);
  const downloading = busy({ downloads: () => [{ status: 'downloading', filename: 'new.gguf', subDir: 'vision' }] });
  assert.equal(modelInUse('vision', path.join(MODELS_DIR, 'vision', 'new.gguf'), downloading), MODEL_DOWNLOADING);
  assert.equal(modelInUse('vision', path.join(MODELS_DIR, 'vision', 'new.gguf.part'), downloading), MODEL_DOWNLOADING);
  assert.equal(modelInUse('llm', path.join(MODELS_DIR, 'new.gguf'), downloading), null, 'only in the folder it goes to');
  assert.equal(modelInUse('llm', path.join(MODELS_DIR, 'new.gguf'), busy({ downloads: () => [{ status: 'complete', filename: 'new.gguf', subDir: '' }] })), null);

  // A link to the loaded model is the loaded model.
  const link = path.join(scratch, 'link.gguf');
  fs.symlinkSync(model, link);
  assert.equal(modelInUse('llm', link, loaded), MODEL_LOADED);
});

test('a loaded language model and its projector are not deleted', { skip }, async () => {
  await llama.startServer(path.basename(model), MODELS_DIR, 2048);
  await until(() => llama.getStatus().status === 'ready');
  assert.equal(llama.getStatus().mmproj, path.basename(projector));

  const refused = await del(`/local-models/${path.basename(model)}`);
  assert.equal(refused.status, 409);
  assert.deepEqual([refused.body.code, refused.body.error], ['IN_USE', MODEL_LOADED]);
  assert.equal((await del(`/local-models/${path.basename(projector)}`)).status, 409);
  assert.ok(fs.existsSync(model) && fs.existsSync(projector));

  await llama.stopServer();
  assert.equal((await del(`/local-models/${path.basename(model)}`)).status, 200);
  assert.equal(fs.existsSync(model), false);
});

test('listening and speaking models are not deleted while loaded', { skip }, async () => {
  await whisper.startWhisper(listener);
  await until(() => whisper.getStatus().status === 'ready');
  assert.equal((await del(`/audio/models/${path.basename(listener)}?type=whisper`)).status, 409);
  await whisper.stopWhisper();
  assert.equal((await del(`/audio/models/${path.basename(listener)}?type=whisper`)).status, 200);

  await tts.startTts(voice);
  assert.equal((await del(`/audio/models/${path.basename(voice)}?type=tts`)).status, 409);
  assert.ok(fs.existsSync(`${voice}.json`));
  await tts.stopTts();
  assert.equal((await del(`/audio/models/${path.basename(voice)}?type=tts`)).status, 200);
  assert.equal(fs.existsSync(`${voice}.json`), false, 'its settings go with it');
});

test('an image model is not deleted while a picture is made with it', { skip }, async () => {
  const drawing = sd.generateSdCppImage({ prompt: 'A basil plant', modelPath: painter, steps: 1 });
  await until(() => sd.imageModelsInUse().length > 0);
  assert.deepEqual(sd.imageModelsInUse(), [painter]);
  const refused = await del(`/visual/models/${path.basename(painter)}?type=image`);
  assert.deepEqual([refused.status, refused.body.error], [409, MODEL_DRAWING]);

  fs.writeFileSync(release, '');
  assert.equal((await drawing).success, true);
  assert.deepEqual(sd.imageModelsInUse(), []);
  assert.equal((await del(`/visual/models/${path.basename(painter)}?type=image`)).status, 200);
});

test('a model that is still downloading is not deleted', { skip }, async () => {
  let respond;
  const source = http.createServer((req, res) => {
    res.writeHead(200, { 'content-length': '1000' });
    res.write(Buffer.alloc(10));
    respond = res;
  }).listen(0, '127.0.0.1');
  await once(source, 'listening');
  try {
    const id = await startDownload(`http://127.0.0.1:${source.address().port}/slow.gguf`, 'slow.gguf');
    const part = path.join(MODELS_DIR, 'slow.gguf.part');
    await until(() => fs.existsSync(part));
    assert.equal(modelInUse('llm', part), MODEL_DOWNLOADING);
    write(path.join(MODELS_DIR, 'slow.gguf'), 'an older copy');
    const refused = await del('/local-models/slow.gguf');
    assert.deepEqual([refused.status, refused.body.error], [409, MODEL_DOWNLOADING]);

    cancelDownload(id);
    await until(() => !listActiveDownloads().some((d) => d.downloadId === id && d.status === 'downloading'));
    assert.equal(modelInUse('llm', part), null);
    assert.equal((await del('/local-models/slow.gguf')).status, 200);
  } finally {
    respond?.destroy();
    source.close();
  }
});
