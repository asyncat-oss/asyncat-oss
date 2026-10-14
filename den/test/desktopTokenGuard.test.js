// Started by the desktop app, den takes changes only from the app's window:
// a command in the agent's sandbox (with the network open) can reach the API,
// but must not be able to turn the sandbox off or add a connector with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createDesktopTokenGuard } from '../src/middleware/desktopTokenGuard.js';
import { childEnv } from '../src/agent/childEnv.js';

const TOKEN = 'launch-token-demo';

async function withApp(launchToken, fn) {
  const app = express();
  app.use(createDesktopTokenGuard({ launchToken: () => launchToken, matches: (given) => given === TOKEN }));
  app.use((_req, res) => res.json({ success: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn((method, path, headers = {}) => fetch(`${base}${path}`, {
      method, headers: { 'content-type': 'application/json', ...headers }, body: method === 'GET' ? undefined : '{}',
    }).then((res) => res.status));
  } finally {
    server.close();
  }
}

test('started by the desktop app, changes need its token', async () => {
  await withApp(TOKEN, async (send) => {
    assert.equal(await send('PUT', '/api/privacy/sandbox'), 403, 'turning the sandbox off from another program');
    assert.equal(await send('PUT', '/api/config'), 403);
    assert.equal(await send('POST', '/api/connectors'), 403, 'adding a connector that runs anything');
    assert.equal(await send('DELETE', '/api/agent/sandboxes/x'), 403);
    assert.equal(await send('PUT', '/api/privacy/sandbox', { 'x-asyncat-host-token': 'guess' }), 403);
    assert.equal(await send('PUT', '/api/privacy/sandbox', { 'x-asyncat-host-token': TOKEN }), 200, "the app's window");
    assert.equal(await send('GET', '/api/privacy/sandbox'), 200, 'reads stay open');
    // Routes with a token of their own.
    assert.equal(await send('POST', '/api/host/reply/1'), 200);
    assert.equal(await send('POST', '/api/agent/external-approvals/run-1'), 200);
  });
});

test('started on its own (development, a browser), nothing is checked', async () => {
  await withApp(null, async (send) => {
    assert.equal(await send('PUT', '/api/privacy/sandbox'), 200);
  });
});

test('programs the agent runs never get the token', () => {
  assert.equal(childEnv({ source: { ASYNCAT_HOST_TOKEN: TOKEN, PATH: '/bin' } }).ASYNCAT_HOST_TOKEN, undefined);
});
