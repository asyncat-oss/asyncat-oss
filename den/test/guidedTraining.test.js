import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Models → Training as guided steps, end to end with stand-ins: a fake
// training environment (fixtures/fakeTrainingPython.mjs) and a fake
// llama-server (fixtures/fakeLlamaServer.mjs). The adapter conversion is the
// real one. Rated chat answers, a note and a project file become training
// data; training runs; the adapter loads with its model (--lora); the same
// question is answered with the adapter off and on.

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-guided-'));
const python = ['python3', 'python'].find((cmd) => spawnSync(cmd, ['--version']).status === 0);
const skip = process.platform !== 'linux' || !python ? 'needs Linux and Python 3' : false;

async function freePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

process.env.ASYNCAT_HOME = path.join(scratch, 'home');
process.env.HF_HUB_CACHE = path.join(scratch, 'hf');
process.env.LLAMA_SERVER_PORT = String(await freePort());
process.env.LLAMA_BINARY_PATH = path.join(here, 'fixtures', 'fakeLlamaServer.mjs');
const venvBin = path.join(process.env.ASYNCAT_HOME, 'training', 'python', 'bin');
fs.mkdirSync(venvBin, { recursive: true });
fs.writeFileSync(path.join(venvBin, 'python'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(here, 'fixtures', 'fakeTrainingPython.mjs')}" "$@"\n`, { mode: 0o755 });

const { default: db } = await import('../src/db/client.js');
const { chatService } = await import('../src/ai/controllers/ai/chatService.js');
const { default: guideRouter } = await import('../src/training/guideRoutes.js');
const { getTrainingJob } = await import('../src/ai/controllers/ai/trainingJobManager.js');
const llama = await import('../src/ai/controllers/ai/llamaServerManager.js');
const { getModelsDir } = await import('../src/ai/controllers/ai/modelManager.js');
const { activeAdapterFor } = await import('../src/training/adapters.js');
const { htmlToText, chunkText } = await import('../src/training/trainingData.js');
const express = (await import('express')).default;

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
const projectRoot = path.join(scratch, 'garden-notes');
fs.mkdirSync(path.join(projectRoot, 'node_modules', 'x'), { recursive: true });
fs.writeFileSync(path.join(projectRoot, 'watering.md'), '# Watering\n\nTomatoes on a balcony dry out fast in summer. Water deeply in the morning, twice a week, more in a heatwave.\n');
fs.writeFileSync(path.join(projectRoot, 'node_modules', 'x', 'README.md'), 'Not mine, and never read for training. '.repeat(10));
fs.writeFileSync(path.join(projectRoot, 'photo.png'), 'not text');

db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);
db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, ?, ?, ?, ?)').run(projectId, 'Balcony garden', userId, userId, workspaceId);
db.prepare("INSERT INTO project_folders (id, project_id, name, path, path_key, is_primary) VALUES (?, ?, 'Notes', ?, ?, 1)").run(randomUUID(), projectId, projectRoot, projectRoot.toLowerCase());
db.prepare('INSERT INTO notes (id, title, content, createdby) VALUES (?, ?, ?, ?)').run(randomUUID(), 'Basil', '<p>Basil likes <b>warm</b> sun &amp; damp soil.</p><ul><li>Pinch the tops</li><li>Never let it flower</li></ul>', userId);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; next(); });
app.use('/api/training/guide', guideRouter);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/training/guide`;
const call = (method, suffix, body) => fetch(`${base}${suffix}`, {
  method,
  headers: { 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (res) => ({ status: res.status, body: await res.json() }));

async function until(check, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test.after(async () => {
  await llama.stopServer().catch(() => {});
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('ratings are kept with the answer they belong to', async () => {
  const saved = await chatService.saveConversation(userId, [
    { id: 'msg_1_user_a', type: 'user', content: 'How often should I water tomatoes on a balcony?' },
    { id: 'msg_2_assistant_a', type: 'assistant', content: 'Water them deeply twice a week, in the morning.', rating: 1, ratedVariant: 0 },
    { id: 'msg_3_user_a', type: 'user', content: 'And basil?' },
    { id: 'msg_4_assistant_a', type: 'assistant', content: 'No idea.', rating: -1 },
    { id: 'msg_5_user_a', type: 'user', content: 'Thanks' },
    { id: 'msg_6_assistant_a', type: 'assistant', content: 'Anytime.', rating: 7 },
  ], { workspaceId, mode: 'chat', title: 'Balcony tomatoes' });
  const loaded = await chatService.getConversation(userId, saved.conversationId);
  const messages = (loaded.conversation || loaded).messages;
  assert.equal(messages[1].rating, 1);
  assert.equal(messages[1].ratedVariant, 0);
  assert.equal(messages[3].rating, -1);
  assert.equal(messages[5].rating, undefined, 'only 👍 and 👎 are kept');
});

test('notes turn into plain text, and long text into pieces', () => {
  assert.equal(htmlToText('<p>Basil likes <b>warm</b> sun &amp; damp soil.</p><ul><li>Pinch</li></ul>'), 'Basil likes warm sun & damp soil.\n\n- Pinch');
  const pieces = chunkText(`${'a'.repeat(30)}\n\n${'b'.repeat(30)}\n\n${'c'.repeat(90)}`, 70);
  assert.deepEqual(pieces.map((p) => p.length), [62, 70, 20]);
});

test('guided training: data, plan, train, load with --lora, compare', { skip }, async () => {
  const sources = await call('GET', '/sources');
  assert.equal(sources.body.sources.ratedAnswers, 1, 'only the 👍 answer');
  assert.equal(sources.body.sources.notes, 1);
  assert.deepEqual(sources.body.sources.projects.map((p) => [p.name, p.files]), [['Balcony garden', 1]], 'node_modules and pictures are left out');

  assert.equal((await call('POST', '/dataset', { name: 'nothing' })).status, 400, 'nothing picked');
  const built = await call('POST', '/dataset', { ratedChats: true, notes: true, projectIds: [projectId], name: 'Garden voice' });
  assert.equal(built.status, 200);
  const dataset = built.body.dataset;
  assert.deepEqual(dataset.bySource, { chats: 1, notes: 1, files: 1 });
  const rows = fs.readFileSync(dataset.path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(rows[0].messages.map((m) => m.role), ['user', 'assistant']);
  assert.match(rows[0].messages[1].content, /twice a week/);
  assert.match(rows[1].text, /^# Basil\n\nBasil likes warm sun & damp soil\./);
  assert.match(rows[2].text, /^# watering\.md/);
  assert.equal((fs.statSync(dataset.path).mode & 0o777).toString(8), '600', 'your data stays yours');

  const plan = await call('GET', `/plan?examples=${dataset.examples}&tokens=${dataset.tokens}`);
  assert.equal(plan.body.models.length, 3);
  const llamaPlan = plan.body.models.find((m) => m.id === 'llama-3.2-3b');
  assert.ok(llamaPlan.plan.downloads.some((d) => /GGUF/.test(d.what)), 'the chat model still has to be downloaded');
  assert.match(llamaPlan.gguf.url, /^https:\/\/huggingface\.co\/unsloth\/Llama-3\.2-3B-Instruct-GGUF\/resolve\/main\//);

  assert.equal((await call('POST', '/train', { modelId: 'llama-3.2-3b', datasetPath: '/etc/passwd' })).status, 400);
  const started = await call('POST', '/train', { modelId: 'llama-3.2-3b', datasetPath: dataset.path, name: 'Garden voice' });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const job = await until(() => {
    const current = getTrainingJob(started.body.job.id, userId);
    return current.status === 'completed' || current.status === 'failed' ? current : null;
  });
  assert.equal(job.status, 'completed', job.error);
  assert.equal(job.hyperparams.guidedModel, 'llama-3.2-3b');
  assert.equal(job.hyperparams.maxSeqLen, 1024);

  const made = await call('POST', '/adapters', { jobId: job.id, name: 'Garden voice' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const adapter = made.body.adapter;
  assert.equal(fs.readFileSync(adapter.file).toString('latin1', 0, 4), 'GGUF');
  assert.equal(adapter.baseGguf, 'Llama-3.2-3B-Instruct-Q4_K_M.gguf');
  assert.equal(adapter.arch, 'llama');

  // Switched on, it loads whenever its model does.
  await call('POST', `/adapters/${adapter.id}/active`, { active: true });
  const modelFile = path.join(getModelsDir(), 'Llama-3.2-3B-Instruct-Q4_K_M.gguf');
  fs.mkdirSync(path.dirname(modelFile), { recursive: true });
  fs.writeFileSync(modelFile, 'GGUF stand-in');
  assert.equal(activeAdapterFor(modelFile).id, adapter.id);
  assert.equal((await call('POST', `/adapters/${adapter.id}/compare`, { prompt: 'Hi' })).status, 409, 'not loaded yet');

  await llama.startServer(path.basename(modelFile), getModelsDir(), 2048);
  const status = await until(() => (llama.getStatus().status === 'ready' ? llama.getStatus() : null));
  assert.deepEqual(status.adapter, { id: adapter.id, name: 'Garden voice' });
  const listed = await call('GET', '/adapters');
  assert.equal(listed.body.adapters[0].loaded, true);

  const compared = await call('POST', `/adapters/${adapter.id}/compare`, { prompt: 'How often should I water tomatoes?' });
  assert.equal(compared.status, 200, JSON.stringify(compared.body));
  assert.match(compared.body.before, /^It depends/);
  assert.match(compared.body.after, /^Water them deeply/);
  assert.equal(compared.body.same, false);

  assert.equal((await call('DELETE', `/adapters/${adapter.id}`)).status, 409, 'not while loaded');
  await llama.stopServer();
  await call('POST', `/adapters/${adapter.id}/active`, { active: false });
  assert.equal(activeAdapterFor(modelFile), null);
  assert.equal((await call('DELETE', `/adapters/${adapter.id}`)).status, 200);
  assert.equal(fs.existsSync(adapter.file), false);
});
