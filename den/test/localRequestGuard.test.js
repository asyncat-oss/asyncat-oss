import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalRequestGuard } from '../src/middleware/localRequestGuard.js';

const guard = createLocalRequestGuard({
  allowedOrigins: ['http://localhost:8717', 'http://127.0.0.1:8717'],
  allowedHostnames: ['asyncat.local'],
});

function run(headers) {
  const result = { status: null, nextCalled: false };
  const res = {
    status(code) { result.status = code; return this; },
    json() { return this; },
  };
  guard({ headers }, res, () => { result.nextCalled = true; });
  return result;
}

test('allows the frontend origin on a loopback host', () => {
  assert.equal(run({ host: '127.0.0.1:8716', origin: 'http://localhost:8717' }).nextCalled, true);
  assert.equal(run({ host: 'localhost:8716', origin: 'http://127.0.0.1:8717' }).nextCalled, true);
  assert.equal(run({ host: '[::1]:8716' }).nextCalled, true);
});

test('allows requests without an Origin header (Electron, curl, OAuth callbacks)', () => {
  assert.equal(run({ host: '127.0.0.1:8716' }).nextCalled, true);
  assert.equal(run({}).nextCalled, true);
});

test('rejects cross-site requests from other origins', () => {
  for (const origin of ['https://evil.example', 'null', 'http://localhost:3000']) {
    const result = run({ host: '127.0.0.1:8716', origin });
    assert.equal(result.nextCalled, false, origin);
    assert.equal(result.status, 403, origin);
  }
});

test('rejects DNS-rebinding requests addressed to a foreign host', () => {
  const result = run({ host: 'rebind.evil.example:8716', origin: 'http://rebind.evil.example:8716' });
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 403);
  assert.equal(run({ host: '127.0.0.1.evil.example:8716' }).status, 403);
});

test('allows extra hostnames from configuration', () => {
  assert.equal(run({ host: 'asyncat.local:8716' }).nextCalled, true);
});
