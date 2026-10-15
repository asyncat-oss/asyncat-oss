import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

// Settings → Privacy & safety: "Delete everything" (asked for now, carried
// out at the next start) and "Export everything" (one zip, without models
// or the key that opens saved secrets). All on scratch folders.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-privacy-'));

const { applyReset, pendingReset, requestReset, cancelReset, safeTarget, RESET_MARKER } = await import('../src/privacy/resetData.js');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function makeTree(root) {
  const write = (file, text = 'x') => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const data = path.join(root, 'data');
  const home = path.join(root, 'home');
  const uploads = path.join(root, 'uploads');
  write(path.join(data, 'asyncat.db'));
  write(path.join(data, 'mcp.json'), '{}');
  write(path.join(data, 'generated', 'images', 'a.png'));
  write(path.join(data, 'models', 'm.gguf'), 'model');
  write(path.join(home, 'skills', 'mine.md'));
  write(path.join(home, 'souls', 'default.md'), '# My edited instructions');
  write(path.join(home, 'llama.cpp', 'current', 'llama-server'));
  write(path.join(home, 'training', 'outputs', 'job-1', 'final-adapter', 'adapter_model.safetensors'));
  write(path.join(home, 'training', 'python', 'bin', 'python'));
  write(path.join(uploads, 'chat', 'photo.jpg'));
  return { data, home, uploads };
}

test('a reset waits for the next start, keeps models unless asked, and takes your skills and instructions file', () => {
  const { data, home, uploads } = makeTree(path.join(scratch, 'one'));
  assert.equal(applyReset({ dataRoot: data, home }), null, 'nothing asked, nothing done');

  requestReset(data, { includeModels: false });
  assert.equal(pendingReset(data).includeModels, false);
  const result = applyReset({ dataRoot: data, home, storagePath: uploads });
  assert.ok(result.removed.length >= 4);
  assert.deepEqual(fs.readdirSync(data), ['models'], 'only the models are left');
  assert.equal(fs.existsSync(path.join(home, 'skills')), false, 'your own skills go');
  assert.equal(fs.existsSync(path.join(home, 'souls')), false, 'your edited instructions file goes');
  assert.equal(fs.existsSync(path.join(home, 'llama.cpp')), true, 'engines stay');
  assert.equal(fs.existsSync(path.join(home, 'training', 'outputs')), false, 'what training made from your data goes');
  assert.equal(fs.existsSync(path.join(home, 'training', 'python')), true, 'the training tools stay');
  assert.deepEqual(fs.readdirSync(uploads), [], 'uploads kept elsewhere go too');
  assert.equal(fs.existsSync(path.join(data, RESET_MARKER)), false, 'done once');
});

test('with models: models and engines go too', () => {
  const { data, home } = makeTree(path.join(scratch, 'two'));
  requestReset(data, { includeModels: true });
  applyReset({ dataRoot: data, home });
  assert.deepEqual(fs.readdirSync(data), []);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('a reset can be called off, and it never touches a top-level or home folder', () => {
  const { data, home } = makeTree(path.join(scratch, 'three'));
  requestReset(data);
  cancelReset(data);
  assert.equal(applyReset({ dataRoot: data, home }), null);
  assert.ok(fs.existsSync(path.join(data, 'asyncat.db')));

  // Checked without touching anything: top-level folders and the home
  // folder are never wiped.
  assert.equal(safeTarget('/'), null);
  assert.equal(safeTarget('/tmp'), null);
  assert.equal(safeTarget(os.homedir()), null);
  assert.equal(safeTarget(''), null);
  assert.equal(safeTarget(path.join(scratch, 'data')), path.join(scratch, 'data'));
});

test('export everything: the database, files, skills and the edited instructions file; no models and no key', async () => {
  // The isolate helper gives this file its own data folder and database.
  const dataRoot = process.env.ASYNCAT_DATA_PATH;
  fs.mkdirSync(path.join(dataRoot, 'models'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'models', 'big.gguf'), 'model bytes');
  fs.writeFileSync(path.join(dataRoot, 'mcp.json'), '{"mcpServers":{}}');
  fs.writeFileSync(path.join(dataRoot, 'secret.key'), 'not for export');
  fs.mkdirSync(path.join(dataRoot, 'generated', 'images'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'generated', 'images', 'cat.png'), 'png');
  process.env.ASYNCAT_HOME = path.join(scratch, 'export-home');
  fs.mkdirSync(path.join(process.env.ASYNCAT_HOME, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(process.env.ASYNCAT_HOME, 'skills', 'mine.md'), '# mine');
  fs.mkdirSync(path.join(process.env.ASYNCAT_HOME, 'souls'), { recursive: true });
  fs.writeFileSync(path.join(process.env.ASYNCAT_HOME, 'souls', 'default.md'), '# My edited instructions');

  const { exportEverything, exportEstimate, dataLocations } = await import('../src/privacy/privacyService.js');
  const estimate = await exportEstimate();
  assert.ok(estimate.bytes > 0);
  // The database counts with its write-ahead log, where most of it can be.
  const dbFile = process.env.DB_PATH;
  const onDisk = ['', '-wal'].reduce((sum, suffix) => sum + (fs.existsSync(`${dbFile}${suffix}`) ? fs.statSync(`${dbFile}${suffix}`).size : 0), 0);
  assert.ok(estimate.bytes >= onDisk, `${estimate.bytes} < ${onDisk}`);
  assert.ok(estimate.leftOut.modelsBytes >= 11);
  assert.ok(dataLocations().some((item) => item.id === 'database' && item.exists));

  const out = path.join(scratch, 'exports');
  const result = await exportEverything({ destDir: out });
  assert.ok(fs.existsSync(result.path));
  const zip = await JSZip.loadAsync(fs.readFileSync(result.path));
  const names = Object.keys(zip.files);
  assert.ok(names.includes('README.txt'));
  assert.ok(names.includes('database/asyncat.db'));
  assert.ok(names.includes('data/mcp.json'));
  assert.ok(names.includes('data/generated/images/cat.png'));
  assert.ok(names.includes('skills/mine.md'));
  assert.ok(names.includes('souls/default.md'), 'the edited instructions file');
  assert.equal(names.some((name) => name.includes('models/')), false, 'models are left out');
  assert.equal(names.some((name) => name.endsWith('secret.key')), false, 'the key is left out');
  const sqliteHeader = (await zip.file('database/asyncat.db').async('nodebuffer')).toString('latin1', 0, 15);
  assert.equal(sqliteHeader, 'SQLite format 3');
});

test('the privacy routes: the phrase is needed, a reset can be called off, and blocked sites are cleaned', async () => {
  const express = (await import('express')).default;
  const { once } = await import('node:events');
  const { default: privacyRouter } = await import('../src/privacy/privacyRoutes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/privacy', privacyRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/privacy`;
  const call = (method, suffix = '', body) => fetch(`${base}${suffix}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, body: await res.json() }));
  try {
    const dataRoot = process.env.ASYNCAT_DATA_PATH;
    assert.equal((await call('POST', '/reset', { confirm: 'yes' })).status, 400);
    assert.equal(pendingReset(dataRoot), null, 'nothing asked without the phrase');
    const asked = await call('POST', '/reset', { confirm: ' Delete Everything ', includeModels: true });
    assert.equal(asked.status, 200);
    assert.equal(pendingReset(dataRoot).includeModels, true);
    assert.equal((await call('GET')).body.pendingReset.includeModels, true);
    await call('DELETE', '/reset');
    assert.equal(pendingReset(dataRoot), null, 'called off');

    assert.equal((await call('PUT', '/blocked-sites', { sites: 'bank.example' })).status, 400);
    const saved = await call('PUT', '/blocked-sites', { sites: ['Bank.example', 'not a site'] });
    assert.deepEqual(saved.body.blockedSites, ['bank.example']);
    const overview = (await call('GET')).body;
    assert.deepEqual(overview.blockedSites, ['bank.example']);
    assert.ok(overview.locations.some((item) => item.id === 'data'));
    assert.equal(typeof overview.secrets.encrypted, 'boolean');
  } finally {
    server.close();
  }
});
