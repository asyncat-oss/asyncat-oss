import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

// llama-server holds one local model; chats on different local models take
// turns. These drive the switch against a stand-in server whose loads finish
// when the test says so.

const { createLocalModelSwitch, loadErrorText } = await import('../src/ai/controllers/ai/localModelSwitch.js');

const A = '/models/apple-3b.gguf';
const B = '/models/berry-7b.gguf';

function fakeServer() {
  let status = { status: 'idle', model: null, modelPath: null, error: null, ctxSize: null };
  const subscribers = new Set();
  const loads = [];
  const emit = (patch) => {
    status = { ...status, ...patch };
    for (const fn of subscribers) fn(status);
  };
  return {
    loads,
    getStatus: () => status,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    // Like llamaServerManager.startServer: stops what runs, then loads.
    async startServer(modelPath, ctxSize) {
      if (status.status === 'loading') throw new Error('A model is already loading. Please wait.');
      if (modelPath.includes('missing')) throw new Error('Model file not found: missing.gguf');
      loads.push({ model: path.basename(modelPath), ctxSize });
      if (status.modelPath) emit({ status: 'idle', model: null, modelPath: null });
      emit({ status: 'loading', model: path.basename(modelPath), modelPath, error: null, ctxSize });
    },
    ready: () => emit({ status: 'ready' }),
    crash: (error) => emit({ status: 'error', error }),
    stop: () => emit({ status: 'idle', model: null, modelPath: null }),
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** A promise's state without waiting for it. */
async function settled(promise) {
  let state = 'pending';
  promise.then(() => { state = 'resolved'; }, () => { state = 'rejected'; });
  await tick();
  return state;
}

test('a run loads its model on an idle server, and runs on it share it', async () => {
  const server = fakeServer();
  const local = createLocalModelSwitch(server);
  const loading = [];
  const first = local.acquire(A, { ctxSize: 4096, onLoad: () => loading.push('first') });
  const second = local.acquire(A, { onLoad: () => loading.push('second') });
  await tick();
  assert.deepEqual(server.loads, [{ model: 'apple-3b.gguf', ctxSize: 4096 }]);
  assert.deepEqual(loading, ['first', 'second'], 'both are told it is loading');
  assert.equal(await settled(first), 'pending');

  server.ready();
  const [releaseFirst, releaseSecond] = await Promise.all([first, second]);
  const third = await local.acquire(A);
  assert.equal(server.loads.length, 1, 'no reload for runs on the loaded model');
  assert.deepEqual(local.state().leases, { [path.resolve(A)]: 3 });
  releaseFirst();
  releaseFirst();
  releaseSecond();
  third();
  assert.deepEqual(local.state().leases, {}, 'releasing twice counts once');
});

test('a run on another model waits for the runs on the loaded one, then loads its own', async () => {
  const server = fakeServer();
  const local = createLocalModelSwitch(server);
  const onA = local.acquire(A);
  await tick();
  server.ready();
  const releaseA = await onA;

  const waits = [];
  const onB = local.acquire(B, { onWait: (busy) => waits.push(busy) });
  assert.equal(await settled(onB), 'pending');
  assert.deepEqual(waits, [path.resolve(A)]);
  assert.equal(server.loads.length, 1, 'the loaded model is not pulled from under a run');

  releaseA();
  await tick();
  assert.deepEqual(server.loads.map((load) => load.model), ['apple-3b.gguf', 'berry-7b.gguf']);
  server.ready();
  const releaseB = await onB;
  assert.equal(server.getStatus().model, 'berry-7b.gguf');
  releaseB();
});

test('runs are served in the order they asked, so a waiting chat is not starved', async () => {
  const server = fakeServer();
  const local = createLocalModelSwitch(server);
  const onA = local.acquire(A);
  await tick();
  server.ready();
  const releaseA = await onA;

  const order = [];
  const onB = local.acquire(B).then((release) => { order.push('B'); return release; });
  const laterA = local.acquire(A).then((release) => { order.push('A again'); return release; });
  assert.equal(await settled(laterA), 'pending', 'it queues behind the chat waiting for B');

  releaseA();
  await tick();
  server.ready();
  const releaseB = await onB;
  assert.equal(await settled(laterA), 'pending');
  releaseB();
  await tick();
  server.ready();
  (await laterA)();
  assert.deepEqual(order, ['B', 'A again']);
  assert.deepEqual(server.loads.map((load) => load.model), ['apple-3b.gguf', 'berry-7b.gguf', 'apple-3b.gguf']);
});

test('a model that fails to load fails the runs waiting for it, not the others', async () => {
  const server = fakeServer();
  const local = createLocalModelSwitch(server);
  const onA = local.acquire(A);
  const alsoA = local.acquire(A);
  const onB = local.acquire(B);
  await tick();
  server.crash('OOM: Not enough VRAM/RAM to load this model.');
  await assert.rejects(onA, /^Error: Not enough VRAM\/RAM to load this model\.$/);
  await assert.rejects(alsoA, /Not enough VRAM/);
  await tick();
  assert.equal(server.loads.at(-1).model, 'berry-7b.gguf', 'the next run loads its own');
  server.ready();
  (await onB)();

  await assert.rejects(local.acquire('/models/missing.gguf'), /Model file not found/);
  assert.equal(loadErrorText('CORRUPTED: The model file is incomplete.'), 'The model file is incomplete.');
});

test('a run stopped while it waits leaves the queue', async () => {
  const server = fakeServer();
  const local = createLocalModelSwitch(server);
  const onA = local.acquire(A);
  await tick();
  server.ready();
  const releaseA = await onA;

  const stop = new AbortController();
  const onB = local.acquire(B, { signal: stop.signal });
  stop.abort();
  await assert.rejects(onB, { name: 'AbortError' });
  assert.deepEqual(local.state().waiting, []);
  releaseA();
  await tick();
  assert.equal(server.loads.length, 1, 'nothing loads for a run that stopped');

  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(local.acquire(B, { signal: stopped.signal }), { name: 'AbortError' });
});

test('a load started from the Models page is waited for, and stopping one tells the run why', async () => {
  const server = fakeServer();
  const local = createLocalModelSwitch(server);
  await server.startServer(A, 2048); // the user loads it themselves
  const onA = local.acquire(A);
  assert.equal(await settled(onA), 'pending', 'it waits for the load under way');
  server.ready();
  (await onA)();
  assert.equal(server.loads.length, 1, 'and uses it');

  // Stopped from the Models page while a chat's model loads: the run hears why.
  const onB = local.acquire(B);
  await tick();
  server.stop();
  await assert.rejects(onB, /stopped loading/);

  // A load from the Models page that begins just before the run's: the run
  // waits for it, then loads its own.
  const racing = fakeServer();
  let first = true;
  const raced = createLocalModelSwitch({
    ...racing,
    async startServer(modelPath, ctxSize) {
      if (!first) return racing.startServer(modelPath, ctxSize);
      first = false;
      await racing.startServer(A, 2048);
      throw new Error('A model is already loading. Please wait.');
    },
  }).acquire(B);
  await tick();
  assert.equal(await settled(raced), 'pending');
  racing.ready();
  await tick();
  racing.ready();
  (await raced)();
  assert.equal(racing.getStatus().model, 'berry-7b.gguf');
});
