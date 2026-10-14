import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// Files (/api/storage): every place lists what Asyncat keeps, items are
// named by ids den made and found again on each request, links lead
// nowhere, nothing outside Asyncat's folders and nothing PROTECTED is ever
// removed, things in use stay, and the places' sizes add up to what Asyncat
// uses, each byte counted once.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-files-'));
const dataRoot = path.join(scratch, 'data');
const home = path.join(scratch, 'home');
const logs = path.join(scratch, 'logs');
const chatsRoot = path.join(scratch, 'chats-root');
const downloads = path.join(scratch, 'Downloads');
const outside = path.join(scratch, 'outside');
const trashDir = path.join(scratch, 'Trash');
process.env.ASYNCAT_DATA_PATH = dataRoot;
process.env.ASYNCAT_HOME = home;
process.env.ASYNCAT_LOG_DIR = logs;
process.env.ASYNCAT_WORKSPACE_ROOT = chatsRoot;
process.env.ASYNCAT_EXPORT_DIR = downloads;
process.env.STORAGE_PATH = path.join(dataRoot, 'uploads');
for (const name of ['MODELS_PATH', 'IMAGEGEN_OUTPUT_PATH', 'ASYNCAT_SANDBOX_DIR']) delete process.env[name];
// The database sits where den's app logs go, so "Clear old logs" and a log
// id built by hand meet it: it must survive them.
process.env.DB_PATH = path.join(logs, 'backend', 'app', 'asyncat.db');

const write = (file, data = 'x', ageDays = 0) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  if (ageDays) {
    const when = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    fs.utimesSync(file, when, when);
  }
  return file;
};
const exists = (file) => {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
};
for (const dir of [chatsRoot, downloads, trashDir]) fs.mkdirSync(dir, { recursive: true });

const { default: db } = await import('../src/db/client.js');
await import('../src/cats/catStore.js');
const { default: express } = await import('express');
const { default: filesRouter } = await import('../src/storage/filesRoutes.js');
const { default: providerRoutes } = await import('../src/ai/routes/providerRoutes.js');
const { default: fileRoutes } = await import('../src/files/fileRoutes.js');
const { default: agentRoutes } = await import('../src/ai/routes/aiAgentRoutes.js');
const locks = await import('../src/storage/modelLocks.js');
const bridge = await import('../src/lib/hostBridge.js');
const { removeInside, PROTECTED } = await import('../src/storage/safeFs.js');
const { makeId, parseId } = await import('../src/storage/itemIds.js');
const { folderUsage, forgetUsage, peekUsage } = await import('../src/storage/diskUsage.js');
const { sizePlan } = await import('../src/storage/places.js');
const { deleteNote } = await import('../src/notes/service/noteService.js');
const { dateStamp } = await import('../src/logger.js');
const { runtimeDbPath, runtimeUploadsPath } = await import('../src/config/runtimeConfig.js');
const { MODELS_DIR } = await import('../src/ai/controllers/ai/modelManager.js');

// ── What there is ────────────────────────────────────────────────────────────

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const folderId = randomUUID();
const otherFolderId = randomUUID();
const catId = randomUUID();
const goneCatId = randomUUID();
const gardenDir = path.join(scratch, 'garden');
const otherGardenDir = path.join(scratch, 'garden-two');
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);
const addProject = db.prepare('INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, ?, ?, ?, ?)');
addProject.run(projectId, 'Balcony garden', userId, userId, workspaceId);
addProject.run(otherProjectId, 'Balcony garden', userId, userId, workspaceId);
const addFolder = db.prepare("INSERT INTO project_folders (id, project_id, name, path, path_key) VALUES (?, ?, 'Garden', ?, ?)");
addFolder.run(folderId, projectId, gardenDir, gardenDir.toLowerCase());
addFolder.run(otherFolderId, otherProjectId, otherGardenDir, otherGardenDir.toLowerCase());
db.prepare("INSERT INTO cats (id, user_id, name, mission) VALUES (?, ?, 'Seed price Cat', 'Watch prices')").run(catId, userId);

// Made by agents
const artifacts = path.join(gardenDir, '.asyncat', 'artifacts');
write(path.join(artifacts, 'plan.md'), '# Plan');
write(path.join(artifacts, 'page.html'), '<script>alert(1)</script>');
write(path.join(artifacts, 'report.pdf'), '%PDF-1.4');
write(path.join(artifacts, 'run.sh'), 'echo hi');
write(path.join(otherGardenDir, '.asyncat', 'artifacts', 'other-plan.md'), '# Other');
write(path.join(chatsRoot, '.asyncat-artifacts', 'old.svg'), '<svg/>');
write(path.join(dataRoot, 'cats', catId, '.asyncat', 'artifacts', 'prices.csv'), 'seed,price');
write(path.join(dataRoot, 'cats', goneCatId, '.asyncat', 'artifacts', 'old-prices.csv'), 'seed,price');
write(path.join(dataRoot, 'agent-workspace', '.asyncat', 'artifacts', 'claude-notes.md'), '# Notes');
const hostsTarget = write(path.join(outside, 'hosts'), '127.0.0.1 localhost');
fs.symlinkSync(hostsTarget, path.join(artifacts, 'hosts.md'));
db.prepare("INSERT INTO notes (id, title, content, createdby, conversation_id) VALUES (?, 'Watering plan', '<p>Twice a week</p>', ?, 'conv-1')").run(randomUUID(), userId);
const pictures = path.join(dataRoot, 'generated', 'images');
for (let i = 0; i < 249; i += 1) write(path.join(pictures, `made_${String(i).padStart(3, '0')}.png`), 'png', 1 + i / 1000);
write(path.join(pictures, 'basil.png'), 'png');
write(path.join(pictures, 'basil.png.json'), JSON.stringify({ prompt: 'Basil on a sunny sill', model: 'dreamshaper_8.safetensors' }));

// Uploads
const keptNoteId = randomUUID();
const stillNoteId = randomUUID();
const goneNoteId = randomUUID();
const addNote = db.prepare("INSERT INTO notes (id, title, content, createdby) VALUES (?, ?, '<p>x</p>', ?)");
addNote.run(keptNoteId, 'Seed list', userId);
addNote.run(stillNoteId, 'Harvest log', userId);
const noteFiles = path.join(dataRoot, 'uploads', 'notes');
const keptAttachment = write(path.join(noteFiles, `note-${keptNoteId}`, '1700000000000_plan.pdf'), '%PDF');
const stillAttachment = write(path.join(noteFiles, `note-${stillNoteId}`, '1700000000001_tomato.png'), 'png');
const goneAttachment = write(path.join(noteFiles, `note-${goneNoteId}`, '1700000000002_old.png'), 'png');
const legacyAttachment = write(path.join(noteFiles, `project-${projectId}`, `note-${goneNoteId}`, 'older.txt'), 'old');
write(path.join(gardenDir, '.asyncat', 'attachments', '1700000000000-abc123-seeds.csv'), 'seed');
const knowledgeId = randomUUID();
write(path.join(dataRoot, 'knowledge', 'project', projectId, `${knowledgeId}-spec.md`), '# Spec');
db.prepare(`INSERT INTO knowledge_files (id, owner_type, owner_id, user_id, name, kind, size_bytes, storage_path)
  VALUES (?, 'project', ?, ?, 'spec.md', 'text', 6, ?)`).run(knowledgeId, projectId, userId, path.join('project', projectId, `${knowledgeId}-spec.md`));

// Models
const languageModel = write(path.join(MODELS_DIR, 'garden-Q4_K_M.gguf'), 'GGUF');
const projector = write(path.join(MODELS_DIR, 'mmproj-garden-f16.gguf'), 'GGUF');
const freeModel = write(path.join(MODELS_DIR, 'other.gguf'), 'GGUF');
const listener = write(path.join(MODELS_DIR, 'audio', 'whisper', 'ggml-base.bin'), 'bin');
const voice = write(path.join(MODELS_DIR, 'audio', 'tts', 'en_US-demo.onnx'), 'onnx');
write(`${voice}.json`, JSON.stringify({ audio: { sample_rate: 16000 } }));
const painter = write(path.join(MODELS_DIR, 'image', 'painter.safetensors'), 'st');
const downloading = write(path.join(MODELS_DIR, 'new.gguf.part'), 'half');
const stale = write(path.join(MODELS_DIR, 'image', 'stale.safetensors.part'), 'half');
const externalModel = write(path.join(scratch, 'llms', 'my-llama.gguf'), 'GGUF');
db.prepare("INSERT INTO custom_model_paths (name, path, type) VALUES ('My llama', ?, 'gguf')").run(externalModel);

// Training
const dataset = write(path.join(dataRoot, 'training', 'datasets', 'chats-oct-20261001.jsonl'), '{"text":"hi"}\n');
const adapters = path.join(dataRoot, 'adapters');
write(path.join(adapters, 'a1.gguf'), 'lora');
write(path.join(adapters, 'a2.gguf'), 'lora');
write(path.join(adapters, 'adapters.json'), JSON.stringify([
  { id: 'a1', name: 'Friendly tone', file: path.join(adapters, 'a1.gguf'), baseGguf: 'garden-Q4_K_M.gguf' },
  { id: 'a2', name: 'Short answers', file: path.join(adapters, 'a2.gguf'), baseGguf: 'garden-Q4_K_M.gguf' },
  { id: 'a3', name: 'Elsewhere', file: path.join(outside, 'hosts'), baseGguf: 'garden-Q4_K_M.gguf' },
]));
const outputs = path.join(home, 'training', 'outputs');
const result = path.join(outputs, 'abcd1234-tone-v2');
write(path.join(result, 'adapter', 'adapter_model.safetensors'), 'weights');
write(path.join(outputs, 'deadbeef-old', 'checkpoint', 'state.bin'), 'state');
db.prepare("INSERT INTO training_jobs (id, user_id, name, base_model, dataset_path, backend, output_dir) VALUES (?, ?, 'tone-v2', 'base', ?, 'cpu', ?)")
  .run(randomUUID(), userId, dataset, result);

// Exports, logs, caches, undo points
const exportZip = write(path.join(downloads, 'Asyncat export 2026-10-01 0930.zip'), 'PK');
write(path.join(downloads, 'passwords.zip'), 'not ours');
const today = dateStamp();
const backendLogs = path.join(logs, 'backend');
const oldApp = write(path.join(backendLogs, 'app', 'app-2026-01-01.log'), 'one\ntwo\nthree\n');
const oldError = write(path.join(backendLogs, 'error', 'error-2026-01-01.log'), 'oops\n');
const oldHttp = write(path.join(backendLogs, 'http', 'http-2026-01-01.log'), 'GET /\n');
const todayLog = path.join(backendLogs, 'app', `app-${today}.log`);
fs.appendFileSync(todayLog, 'started\n');
const processLog = write(path.join(logs, 'backend-process.log'), 'den said hello\n');
write(path.join(logs, 'notes.txt'), 'not a log');
const voiceSample = write(path.join(dataRoot, 'cache', 'voice-samples', 'amy.mp3'), 'mp3');
const oldTmp = write(path.join(dataRoot, 'tmp', 'claude-approval-old.json'), '{}', 10);
const newTmp = write(path.join(dataRoot, 'tmp', 'claude-approval-new.json'), '{}');
const oldAgentTmp = write(path.join(chatsRoot, '.asyncat', 'tmp', 'script_1.py'), 'print(1)', 10);
const newAgentTmp = write(path.join(gardenDir, '.asyncat', 'tmp', 'script_2.py'), 'print(2)');
write(path.join(gardenDir, '.asyncat', 'snapshots', 'cp-1', 'plan.md'), '# Plan, before');

// What no route may remove.
for (const name of ['mcp.json', 'acp-agents.json', 'external-agent-usage.json', 'host-token', '.reset-requested.json', 'secret.key']) {
  if (!exists(path.join(dataRoot, name))) write(path.join(dataRoot, name), '{}');
}
const engineBinary = write(path.join(home, 'llama.cpp', 'current', 'llama-server'), 'bin');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; next(); });
app.use('/api/storage', filesRouter);
app.use('/api/ai/providers', providerRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/agent', agentRoutes);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

const items = async (query) => (await fetch(`${base}/api/storage/items?${new URLSearchParams({ limit: '500', ...query })}`)).json();
const itemUrl = (id, suffix = '') => `${base}/api/storage/items/${encodeURIComponent(id)}${suffix}`;
const remove = async (id, query = '') => {
  const res = await fetch(`${itemUrl(id)}${query}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
};
const clean = async (action) => (await fetch(`${base}/api/storage/clean`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
})).json();
const byName = (page, name) => page.items.find((item) => item.name === name);

// A stand-in for the desktop app: it polls, moves files to a Trash folder
// in scratch, and says what it was asked to do.
function fakeDesktop({ fail = false } = {}) {
  let running = true;
  const asked = [];
  (async () => {
    while (running) {
      const messages = await bridge.waitForHostMessages({ waitMs: 20, capabilities: ['files'] });
      for (const message of messages) {
        if (!message.expectsReply) continue;
        asked.push(message);
        if (fail) {
          bridge.settleHostRequest(message.id, { ok: false, error: 'Not on this computer.' });
          continue;
        }
        if (message.type === 'files.trash') fs.renameSync(message.payload.path, path.join(trashDir, path.basename(message.payload.path)));
        bridge.settleHostRequest(message.id, { ok: true });
      }
    }
  })();
  return {
    asked,
    stop: () => {
      running = false;
      bridge.resetHostBridge();
    },
  };
}

test.after(() => {
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

// ── Pieces ───────────────────────────────────────────────────────────────────

test('ids are made of encoded parts and checked before anything is looked up', () => {
  const id = makeId('made', `project:${folderId}`, 'a:b c.md');
  assert.deepEqual(parseId(id), { type: 'made', parts: [`project:${folderId}`, 'a:b c.md'] });
  assert.deepEqual(parseId(makeId('partial', 'audio/whisper', 'x.bin.part')).parts, ['audio/whisper', 'x.bin.part']);
  for (const bad of ['made:chats:..%2F..%2Fsecret.key', 'made:chats', 'nonsense:x', 'picture:..', 'model:exe:x.gguf', 'log:other:x.log', 'made:%E0%A4%A:x', 'made:..%2Fx:y']) {
    assert.equal(parseId(bad), null, bad);
  }
});

test('the scanner counts files once, never through links, within a budget, and remembers a minute', async () => {
  const dir = path.join(scratch, 'scan');
  write(path.join(dir, 'a.txt'), '12345');
  write(path.join(dir, 'inner', 'b.txt'), '123');
  write(path.join(dir, 'skip', 'c.txt'), '1234567');
  fs.symlinkSync(path.join(outside, 'hosts'), path.join(dir, 'link.txt'));
  assert.deepEqual(await folderUsage(dir, { exclude: [path.join(dir, 'skip')] }), { bytes: 8, files: 2, partial: false });
  write(path.join(dir, 'd.txt'), '1');
  assert.equal((await folderUsage(dir, { exclude: [path.join(dir, 'skip')] })).bytes, 8, 'remembered');
  forgetUsage(path.join(dir, 'd.txt'));
  assert.equal(peekUsage(dir, { exclude: [path.join(dir, 'skip')] }).value, null, 'forgotten after a change');
  assert.equal((await folderUsage(dir, { exclude: [path.join(dir, 'skip')] })).bytes, 9);
  assert.equal((await folderUsage(dir, { budget: 2, fresh: true })).partial, true);
});

test('the uploads folder and database have one definition', () => {
  const srv = path.resolve('/srv');
  assert.equal(runtimeUploadsPath({ ASYNCAT_DATA_PATH: path.join(srv, 'data') }, srv), path.join(srv, 'data', 'uploads'));
  assert.equal(runtimeUploadsPath({ STORAGE_PATH: './up' }, srv), path.join(srv, 'up'));
  assert.equal(runtimeDbPath({}, srv), path.join(srv, 'data', 'asyncat.db'));
  assert.equal(runtimeDbPath({ DB_PATH: './db/asyncat.db' }, srv), path.join(srv, 'db', 'asyncat.db'));
  assert.equal(db.name, process.env.DB_PATH);
});

// ── 1. Links ─────────────────────────────────────────────────────────────────

test('a link in an artifacts folder is listed but leads nowhere, and only it is removed', async () => {
  const page = await items({ place: 'made' });
  const link = byName(page, 'hosts.md');
  assert.ok(link, 'listed, so it can be cleaned up');
  assert.deepEqual([link.can.preview, link.can.open, link.can.download, link.can.delete], [false, false, false, true]);
  assert.ok(link.badges.some((badge) => badge.label === 'Link'));
  assert.equal((await fetch(itemUrl(link.id, '/content'))).status, 404);
  assert.equal((await fetch(itemUrl(link.id, '/download'))).status, 404);
  assert.equal((await fetch(itemUrl(link.id, '/open'), { method: 'POST' })).status, 415);

  const removed = await remove(link.id);
  assert.deepEqual([removed.status, removed.body.mode], [200, 'delete']);
  assert.equal(exists(path.join(artifacts, 'hosts.md')), false);
  assert.equal(fs.readFileSync(hostsTarget, 'utf8'), '127.0.0.1 localhost', 'what it pointed at is untouched');

  // Pages come back as text in a sandbox, downloads as plain bytes.
  const plan = byName(page, 'page.html');
  const content = await fetch(itemUrl(plan.id, '/content'));
  assert.match(content.headers.get('content-type'), /^text\/plain/);
  assert.equal(content.headers.get('content-security-policy'), 'sandbox');
  assert.equal(await content.text(), '<script>alert(1)</script>');
  const download = await fetch(itemUrl(plan.id, '/download'));
  assert.equal(download.headers.get('content-type'), 'application/octet-stream');
  assert.match(download.headers.get('content-disposition'), /^attachment; filename="page.html"/);
  assert.equal((await fetch(itemUrl(byName(page, 'report.pdf').id, '/content'))).status, 415, 'a PDF opens in another app');
});

// ── 2. Ids built by hand ─────────────────────────────────────────────────────

test('ids built by hand reach nothing outside the places', async () => {
  const before = fs.readFileSync(path.join(dataRoot, 'secret.key'));
  const ids = [
    'made:chats:..%2F..%2Fsecret.key',
    'log:backend-app:..%2F..%2Fdata%2Fasyncat.db',
    'export:passwords.zip',
    `made:project%3A${folderId}:..%2F..%2F..%2Foutside%2Fhosts`,
    `made:project%3A${randomUUID()}:plan.md`,
    'picture:..%2F..%2Fsecret.key',
    'model:llm:..%2F..%2Fsecret.key',
    'note-file:x:..%2F..%2F..%2Fsecret.key',
    'dataset:..',
    'result:..',
    'cache:everything',
    'undo:chats',
  ];
  for (const id of ids) {
    const { status } = await remove(id);
    assert.ok([403, 404].includes(status), `${id}: ${status}`);
    assert.ok([403, 404, 415].includes((await fetch(itemUrl(id, '/content'))).status), id);
  }
  // Real items that are never removed here.
  for (const id of ['system:data', 'system:database', 'process-log', 'cache:voice-samples']) {
    assert.equal((await remove(id)).status, 403, id);
  }
  assert.deepEqual(fs.readFileSync(path.join(dataRoot, 'secret.key')), before);
  assert.ok(exists(path.join(downloads, 'passwords.zip')), 'not named like an export, so not ours');
  assert.ok(exists(hostsTarget) && exists(runtimeDbPath()));
  assert.ok(exists(path.join(artifacts, 'plan.md')));
});

// ── 4. In use ────────────────────────────────────────────────────────────────

test('models, adapters and downloads in use are refused, here and through Models', async () => {
  const original = { ...locks.engines };
  Object.assign(locks.engines, {
    llama: () => ({ status: 'ready', modelPath: languageModel, mmproj: path.basename(projector), adapter: { id: 'a1' } }),
    mlx: () => ({ status: 'idle' }),
    whisper: () => ({ status: 'ready', modelPath: listener }),
    tts: () => ({ status: 'ready', modelPath: voice }),
    drawing: () => [painter],
    downloads: () => [{ status: 'downloading', filename: 'new.gguf', subDir: '', progress: 42 }],
  });
  try {
    const page = await items({ place: 'models' });
    const refused = {
      [makeId('model', 'llm', 'garden-Q4_K_M.gguf')]: locks.MODEL_LOADED,
      [makeId('model', 'llm', 'mmproj-garden-f16.gguf')]: locks.MODEL_LOADED,
      [makeId('model', 'whisper', 'ggml-base.bin')]: locks.MODEL_LOADED,
      [makeId('model', 'tts', 'en_US-demo.onnx')]: locks.MODEL_LOADED,
      [makeId('model', 'image', 'painter.safetensors')]: locks.MODEL_DRAWING,
      [makeId('partial', '', 'new.gguf.part')]: locks.MODEL_DOWNLOADING,
      [makeId('adapter', 'a1')]: locks.ADAPTER_LOADED,
    };
    for (const [id, reason] of Object.entries(refused)) {
      const listed = page.items.find((item) => item.id === id) || (await items({ place: 'training' })).items.find((item) => item.id === id);
      assert.ok(listed, id);
      assert.deepEqual([listed.can.delete, listed.lockedReason], [false, reason], id);
      const answer = await remove(id);
      assert.deepEqual([answer.status, answer.body.code, answer.body.error], [409, 'IN_USE', reason], id);
    }
    assert.equal(page.items.find((item) => item.id === makeId('model', 'llm', 'garden-Q4_K_M.gguf')).badges[0].label, 'Loaded');
    assert.equal(page.items.find((item) => item.id === makeId('partial', '', 'new.gguf.part')).badges[0].label, 'Downloading 42%');

    // The Models page's own delete asks the same.
    const old = await fetch(`${base}/api/ai/providers/local-models/garden-Q4_K_M.gguf`, { method: 'DELETE' });
    assert.deepEqual([old.status, (await old.json()).code], [409, 'IN_USE']);
    for (const file of [languageModel, projector, listener, voice, `${voice}.json`, painter, downloading, path.join(adapters, 'a1.gguf')]) {
      assert.ok(exists(file), file);
    }

    // Others go: a model, an unfinished download, an adapter.
    assert.deepEqual((await remove(makeId('model', 'llm', 'other.gguf'))).body, { success: true, freedBytes: 4, mode: 'delete' });
    assert.equal(exists(freeModel), false);
    assert.equal((await remove(makeId('partial', 'image', 'stale.safetensors.part'))).status, 200);
    assert.equal(exists(stale), false);
    assert.equal((await remove(makeId('adapter', 'a2'))).status, 200);
    assert.equal(exists(path.join(adapters, 'a2.gguf')), false);
    // An adapter whose entry names a file elsewhere: forgotten, the file left alone.
    assert.equal((await remove(makeId('adapter', 'a3'))).status, 200);
    assert.ok(exists(hostsTarget));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(adapters, 'adapters.json'), 'utf8')).map((adapter) => adapter.id), ['a1']);

    // A model added from another folder is never removed here.
    const external = page.items.find((item) => item.path === externalModel);
    assert.deepEqual([external.can.delete, external.lockedReason, external.badges[0].label], [false, 'Added from another folder', 'Another folder']);
    assert.deepEqual([(await remove(external.id)).status, (await remove(external.id)).body.code], [403, 'PROTECTED']);
    assert.ok(exists(externalModel));
  } finally {
    Object.assign(locks.engines, original);
  }
});

test('a running training run keeps its dataset and folder; a run that is gone says so', async () => {
  const page = await items({ place: 'training' });
  const run = page.items.find((item) => item.id === makeId('result', 'abcd1234-tone-v2'));
  assert.deepEqual([run.title, run.isFolder, run.bytes, run.badges.length], ['tone-v2', true, 7, 0]);
  const orphan = page.items.find((item) => item.id === makeId('result', 'deadbeef-old'));
  assert.equal(orphan.badges[0].label, 'Training deleted');
  assert.deepEqual((await remove(orphan.id)).body, { success: true, freedBytes: 5, mode: 'delete' });
  assert.equal(exists(path.join(outputs, 'deadbeef-old')), false);
  assert.ok(byName(page, path.basename(dataset)).can.preview);
});

// ── 5. Note attachments ──────────────────────────────────────────────────────

test("a note's attachment stays while the note does; unused ones are cleared, and only they", async () => {
  let page = await items({ place: 'uploads' });
  const kept = page.items.find((item) => item.path === keptAttachment);
  assert.deepEqual([kept.title, kept.where, kept.can.delete, kept.lockedReason], ['plan.pdf', 'Seed list', false, 'Its note still uses it.']);
  assert.equal((await remove(kept.id)).status, 409);
  assert.equal(page.counts.unused, 2, 'the deleted note\'s two files, in its folder and an older project folder');

  await deleteNote(keptNoteId, userId);
  page = await items({ place: 'uploads' });
  const unused = page.items.find((item) => item.path === keptAttachment);
  assert.deepEqual([unused.where, unused.can.delete, unused.badges[0].label], ['Deleted note', true, 'Not used']);
  assert.equal(page.counts.unused, 3);
  assert.deepEqual((await items({ place: 'uploads', kind: 'unused' })).items.map((item) => item.path).sort(), [goneAttachment, keptAttachment, legacyAttachment].sort());
  assert.deepEqual(page.wheres.find((where) => where.id === 'notes'), { id: 'notes', label: 'Notes' });

  const cleared = await clean('unused-attachments');
  assert.deepEqual([cleared.files, cleared.freedBytes], [3, 4 + 3 + 3]);
  assert.ok(!exists(keptAttachment) && !exists(goneAttachment) && !exists(legacyAttachment));
  assert.ok(exists(stillAttachment), 'a note that is still there keeps its files');

  // Knowledge is removed with its rows.
  const knowledge = page.items.find((item) => item.kind === 'knowledge');
  assert.deepEqual([knowledge.title, knowledge.where, knowledge.whereId, knowledge.deleteVerb], ['spec.md', 'Balcony garden', `project:${projectId}`, 'remove']);
  assert.equal((await remove(knowledge.id)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge_files WHERE id = ?').get(knowledgeId).n, 0);
});

// ── 6. Logs ──────────────────────────────────────────────────────────────────

test("logs are read from ASYNCAT_LOG_DIR/backend; clearing old ones leaves today's", async () => {
  const page = await items({ place: 'logs' });
  const old = byName(page, 'app-2026-01-01.log');
  assert.ok(old.path.startsWith(path.join(logs, 'backend')));
  const current = byName(page, `app-${today}.log`);
  assert.deepEqual([current.can.delete, current.badges[0].label], [false, 'Today']);
  assert.equal((await remove(current.id)).status, 409);
  const desktopLog = page.items.find((item) => item.id === 'process-log');
  assert.deepEqual([desktopLog.can.delete, (await remove('process-log')).status], [false, 403]);
  assert.equal(await (await fetch(itemUrl(old.id, '/content?tail=2'))).text(), 'two\nthree');
  assert.deepEqual(page.items.filter((item) => item.kind === 'cache').map((item) => item.title).sort(), ["Agents' temporary files", 'Temporary files', 'Voice samples']);
  assert.ok(page.items.some((item) => item.kind === 'undo' && item.where === 'Balcony garden' && !item.can.delete));

  const cleared = await clean('old-logs');
  assert.ok(cleared.files >= 3);
  assert.ok(!exists(oldApp) && !exists(oldError) && !exists(oldHttp));
  assert.ok(exists(todayLog) && exists(processLog) && exists(runtimeDbPath()));
  assert.ok(exists(path.join(logs, 'notes.txt')));

  const caches = await clean('caches');
  assert.equal(caches.files, 3);
  assert.ok(!exists(voiceSample) && !exists(oldTmp) && !exists(oldAgentTmp));
  assert.ok(exists(newTmp) && exists(newAgentTmp), 'a week old or newer stays');
});

test('clearing caches skips a cache folder that is a link', async () => {
  const voices = path.join(dataRoot, 'cache', 'voice-samples');
  const elsewhere = write(path.join(outside, 'voices', 'kept.mp3'), 'mp3');
  fs.rmSync(voices, { recursive: true, force: true });
  fs.symlinkSync(path.dirname(elsewhere), voices);
  try {
    await clean('caches');
    assert.ok(exists(elsewhere), 'what the link points at stays');
  } finally {
    fs.rmSync(voices);
    fs.mkdirSync(voices);
  }
});

// ── 7. Counts and paging ─────────────────────────────────────────────────────

test('counts are of everything, pages come 100 at a time, and places stay apart by id', async () => {
  const all = await items({ place: 'made', limit: '100' });
  assert.equal(all.counts.picture, 250);
  assert.ok(all.total > 250);
  assert.equal(all.items.length, 100);
  const pages = await Promise.all([0, 100, 200].map((offset) => items({ place: 'made', kind: 'picture', offset: String(offset), limit: '100' })));
  assert.deepEqual(pages.map((page) => page.items.length), [100, 100, 50]);
  assert.equal(new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size, 250);

  const gardens = all.wheres.filter((where) => where.label === 'Balcony garden');
  assert.deepEqual(gardens.map((where) => where.id).sort(), [`project:${otherProjectId}`, `project:${projectId}`].sort());
  const one = await items({ place: 'made', where: `project:${projectId}` });
  assert.ok(byName(one, 'plan.md') && !byName(one, 'other-plan.md'));

  const everything = await items({ place: 'made' });
  assert.equal(byName(everything, 'old-prices.csv').where, 'Deleted Cat');
  assert.equal(byName(everything, 'old-prices.csv').badges[0].label, 'Deleted Cat');
  assert.equal(byName(everything, 'claude-notes.md').where, 'Claude Code and Codex');
  assert.equal(byName(everything, 'prices.csv').where, 'Seed price Cat');
  assert.equal(everything.items.find((item) => item.kind === 'note').conversationId, 'conv-1');

  const found = await items({ place: 'made', q: 'sunny sill' });
  assert.deepEqual(found.items.map((item) => item.name), ['basil.png'], 'search reads pictures\' prompts');
  assert.equal(found.items[0].title, 'Basil on a sunny sill');
  const largest = await items({ place: 'made', sort: 'largest', limit: '3' });
  assert.ok(largest.items[0].bytes >= largest.items[1].bytes);
});

// ── 8. Composer uploads ──────────────────────────────────────────────────────

test('a file attached in a project chat lands in .asyncat/attachments and shows in Uploads', async () => {
  const form = new FormData();
  form.append('rootId', `project:${folderId}`);
  form.append('path', '../../../outside/evil.txt');
  form.append('file', new Blob(['hello']), '../../outside/evil.txt');
  const res = await fetch(`${base}/api/files/upload`, { method: 'POST', body: form });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.match(body.path, /^\.asyncat\/attachments\/\d+-[0-9a-f]{6}-evil\.txt$/);
  assert.equal(fs.readFileSync(path.join(gardenDir, body.path), 'utf8'), 'hello');
  assert.equal(exists(path.join(outside, 'evil.txt')), false);
  const attached = (await items({ place: 'uploads', kind: 'chat-file' })).items.find((item) => item.name === body.name);
  assert.deepEqual([attached.title, attached.where, attached.whereId, attached.deleteVerb], ['evil.txt', 'Balcony garden', `project:${projectId}`, 'trash']);
});

// ── 10. X-Workspace-Root ─────────────────────────────────────────────────────

test('X-Workspace-Root on /api/agent/artifacts has no effect', async () => {
  write(path.join(outside, '.asyncat', 'artifacts', 'secret_d4.md'), 'not yours');
  const headers = { 'X-Workspace-Root': outside };
  const listed = await (await fetch(`${base}/api/agent/artifacts`, { headers })).json();
  assert.ok(!listed.artifacts.some((artifact) => artifact.filename === 'secret_d4.md'));
  assert.equal((await fetch(`${base}/api/agent/artifacts/secret_d4.md`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/api/agent/artifacts/secret_d4.md?root=chats`, { method: 'DELETE', headers })).status, 404);
  assert.ok(exists(path.join(outside, '.asyncat', 'artifacts', 'secret_d4.md')));
  assert.equal(byName(await items({ place: 'made' }), 'secret_d4.md'), undefined);
});

// ── Trash, Show in folder, Open ──────────────────────────────────────────────

test('Trash, Show in folder and Open go through the desktop app, after den checks the item', async () => {
  const basil = makeId('picture', 'basil.png');
  assert.equal((await (await fetch(`${base}/api/storage/places`)).json()).desktop, false);
  assert.equal((await remove(basil)).body.code, 'NO_DESKTOP');
  assert.equal((await fetch(itemUrl(basil, '/reveal'), { method: 'POST' })).status, 409);

  const desktop = fakeDesktop();
  try {
    assert.equal((await (await fetch(`${base}/api/storage/places`)).json()).desktop, true);
    assert.deepEqual((await remove(basil)).body, { success: true, freedBytes: 3, mode: 'trash' });
    assert.deepEqual(fs.readdirSync(trashDir).sort(), ['basil.png', 'basil.png.json'], 'with its prompt and settings');

    const plan = makeId('made', `project:${folderId}`, 'plan.md');
    assert.equal((await fetch(itemUrl(plan, '/reveal'), { method: 'POST' })).status, 200);
    assert.deepEqual(desktop.asked.at(-1).type, 'files.reveal');
    assert.equal(desktop.asked.at(-1).payload.path, path.join(artifacts, 'plan.md'));
    for (const name of ['page.html', 'run.sh', 'plan.md']) {
      const opened = await fetch(itemUrl(makeId('made', `project:${folderId}`, name), '/open'), { method: 'POST' });
      assert.equal(opened.status, name === 'plan.md' ? 200 : 415, name);
    }
    assert.equal((await fetch(itemUrl(makeId('made', `project:${folderId}`, 'report.pdf'), '/open'), { method: 'POST' })).status, 200);
    assert.deepEqual(desktop.asked.filter((message) => message.type === 'files.open').map((message) => path.basename(message.payload.path)), ['plan.md', 'report.pdf']);
    assert.equal((await fetch(itemUrl(makeId('result', 'abcd1234-tone-v2'), '/open'), { method: 'POST' })).status, 200, 'a folder opens');
  } finally {
    desktop.stop();
  }

  const failing = fakeDesktop({ fail: true });
  try {
    const plan = makeId('made', `project:${folderId}`, 'plan.md');
    const opened = await fetch(itemUrl(plan, '/open'), { method: 'POST' });
    assert.deepEqual([opened.status, (await opened.json()).error], [502, 'Not on this computer.'], "the desktop app's reason");
    const answer = await remove(plan);
    assert.deepEqual([answer.status, answer.body.code], [409, 'TRASH_FAILED']);
    assert.ok(exists(path.join(artifacts, 'plan.md')));
    assert.deepEqual((await remove(plan, '?permanent=1')).body, { success: true, freedBytes: 6, mode: 'delete' });
    assert.equal(exists(path.join(artifacts, 'plan.md')), false);
  } finally {
    failing.stop();
  }
});

// ── 9. Sizes ─────────────────────────────────────────────────────────────────

// Every regular file under `dir` (or `dir` itself), never through a link.
function walk(dir, exclude = []) {
  const skip = new Set(exclude.map((file) => path.resolve(file)));
  const found = [];
  let top;
  try { top = fs.statSync(dir); } catch { return found; }
  if (!top.isDirectory()) return [path.resolve(dir)];
  const stack = [path.resolve(dir)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (skip.has(full)) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) found.push(full);
    }
  }
  return found;
}

test('the places add up to what Asyncat uses, each file counted once', async () => {
  const places = await (await fetch(`${base}/api/storage/places?wait=1`)).json();
  assert.deepEqual(places.places.map((place) => place.id), ['made', 'uploads', 'models', 'training', 'exports', 'logs', 'system']);
  assert.ok(places.places.every((place) => place.partial === false && Number.isInteger(place.bytes) && Number.isInteger(place.count)));
  assert.equal(places.places.reduce((sum, place) => sum + place.bytes, 0), places.appBytes);
  assert.equal(places.scanning, false);
  assert.ok(places.disk.totalBytes > 0);

  // Every file in Asyncat's folders, and in the .asyncat folders agents use, once.
  const counted = new Map();
  for (const scan of sizePlan(userId)) {
    for (const file of walk(scan.dir, scan.exclude)) {
      assert.ok(!counted.has(file), `${file} counted for ${counted.get(file)} and ${scan.place}`);
      counted.set(file, scan.place);
    }
  }
  const agentFolders = [chatsRoot, gardenDir, otherGardenDir].flatMap((root) => [
    ...['artifacts', 'attachments', 'tmp', 'snapshots'].map((name) => path.join(root, '.asyncat', name)),
    path.join(root, '.asyncat-artifacts'),
  ]);
  const expected = new Set([
    ...walk(dataRoot), ...walk(home), ...walk(backendLogs), processLog, exportZip,
    ...agentFolders.flatMap((dir) => walk(dir)),
  ]);
  assert.deepEqual([...counted.keys()].sort(), [...expected].sort());
  assert.deepEqual(
    [path.join(pictures, 'made_000.png'), path.join(dataRoot, 'secret.key'), languageModel, stillAttachment, result, runtimeDbPath(), newAgentTmp, exportZip]
      .map((file) => counted.get(file) ?? counted.get(walk(file)[0])),
    ['made', 'system', 'models', 'uploads', 'training', 'logs', 'logs', 'exports'],
  );
});

// ── 3. PROTECTED ─────────────────────────────────────────────────────────────

test("System's settings row is the size of its two files, not of the data folder", async () => {
  const rows = (await items({ place: 'system' })).items;
  const settings = rows.find((item) => item.whereId === 'connections');
  const data = rows.find((item) => item.whereId === 'data');
  const expected = ['mcp.json', 'acp-agents.json'].reduce((sum, name) => sum + fs.statSync(path.join(dataRoot, name)).size, 0);
  assert.equal(settings.bytes, expected);
  assert.ok(data.bytes > settings.bytes);
});

test('nothing PROTECTED is removed, by any route or clean-up', async () => {
  const kept = [...PROTECTED.files().filter(exists), engineBinary];
  assert.ok(kept.includes(runtimeDbPath()) && kept.includes(path.join(dataRoot, 'secret.key')));
  for (const file of PROTECTED.files().filter(exists)) {
    await assert.rejects(removeInside(path.dirname(path.dirname(file)), file), { code: 'PROTECTED' }, file);
  }
  await assert.rejects(removeInside(scratch, dataRoot, { folder: true }), { code: 'PROTECTED' }, 'nor a folder that holds them');
  await assert.rejects(removeInside(path.join(logs, 'backend'), path.join(logs, 'backend', 'app'), { folder: true }), { code: 'PROTECTED' });
  await assert.rejects(removeInside(home, path.join(home, 'llama.cpp'), { folder: true }), { code: 'PROTECTED' });
  await assert.rejects(removeInside(home, engineBinary), { code: 'PROTECTED' });
  await assert.rejects(removeInside(outputs, outputs, { folder: true }), { code: 'PROTECTED' }, 'nor a place\'s own folder');
  await assert.rejects(removeInside(outputs, hostsTarget), { code: 'PROTECTED' }, 'nor anything outside it');

  // The database is listed with the app logs here, and still can't go.
  const database = byName(await items({ place: 'logs' }), 'asyncat.db');
  assert.deepEqual([(await remove(database.id)).status, (await remove(database.id)).body.code], [403, 'PROTECTED']);
  for (const action of ['old-logs', 'unfinished-downloads', 'unused-attachments', 'caches']) {
    assert.equal((await clean(action)).success, true, action);
  }
  for (const file of kept) assert.ok(exists(file), file);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(userId).n, 1, 'the database still works');
});
