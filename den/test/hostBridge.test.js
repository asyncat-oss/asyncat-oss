import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.ASYNCAT_HOST_TOKEN = 'test-host-token';

const bridge = await import('../src/lib/hostBridge.js');
const { default: hostRouter } = await import('../src/lib/hostBridgeRouter.js');

test.afterEach(() => bridge.resetHostBridge());

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/host', hostRouter);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/host`);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

const auth = { 'x-asyncat-host-token': 'test-host-token', 'content-type': 'application/json' };

test('requests fail at once when no desktop app is connected', async () => {
  await assert.rejects(bridge.requestFromHost('browser.command', {}), /not connected/);
});

test('the desktop app receives messages and its replies settle requests', async () => {
  await withServer(async (base) => {
    // First poll marks the host as connected.
    const first = await fetch(`${base}/next?wait=0&capabilities=browser`, { headers: auth }).then(r => r.json());
    assert.deepEqual(first.messages, []);
    assert.equal(bridge.isHostConnected('browser'), true);

    bridge.sendToHost('notify', { title: 'Done' });
    const pending = bridge.requestFromHost('browser.command', { action: 'snapshot' }, { timeoutMs: 5000 });
    const { messages } = await fetch(`${base}/next?wait=1`, { headers: auth }).then(r => r.json());
    assert.deepEqual(messages.map(m => m.type), ['notify', 'browser.command']);

    const request = messages.find(m => m.expectsReply);
    await fetch(`${base}/reply/${request.id}`, { method: 'POST', headers: auth, body: JSON.stringify({ ok: true, result: { tree: 'ok' } }) });
    assert.deepEqual(await pending, { tree: 'ok' });
  });
});

test('web pages and callers without the token are refused', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/next?wait=0`, { headers: { ...auth, origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/next?wait=0`, { headers: { 'x-asyncat-host-token': 'wrong' } })).status, 401);
    assert.equal((await fetch(`${base}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"power.resume"}' })).status, 401);
  });
});

test('desktop events reach their listeners', async () => {
  await withServer(async (base) => {
    let seen = null;
    const off = bridge.onHostEvent('power.resume', (payload) => { seen = payload; });
    await fetch(`${base}/event`, { method: 'POST', headers: auth, body: JSON.stringify({ type: 'power.resume', payload: { at: 1 } }) });
    off();
    assert.deepEqual(seen, { at: 1 });
  });
});
