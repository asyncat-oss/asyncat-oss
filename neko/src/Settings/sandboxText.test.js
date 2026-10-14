import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_CHOICES, networkHint, pendingNote, sandboxStatusLine, shortPath, toggleAllowed } from './sandboxText.js';

test('the status line says on, off, or on but unable to start and why', () => {
  assert.equal(sandboxStatusLine({ state: 'on' }).tone, 'ok');
  assert.match(sandboxStatusLine({ state: 'off' }).text, /^Off\./);
  const blocked = sandboxStatusLine({ state: 'unavailable', reason: 'AppArmor stops bwrap from running.' });
  assert.equal(blocked.tone, 'warn');
  assert.match(blocked.text, /can't start: AppArmor stops bwrap from running\. Asking before every command\./);
  assert.match(sandboxStatusLine({ state: 'unsupported' }).text, /Windows/);
  assert.equal(sandboxStatusLine(null).text, 'Checking…');
});

test("while the sandbox can't start, the settings below it say they wait", () => {
  assert.match(pendingNote({ state: 'unavailable', reason: 'x' }), /apply once the sandbox can start/);
  for (const state of ['on', 'off', 'unsupported']) assert.equal(pendingNote({ state }), null, state);
  assert.equal(pendingNote(null), null);
});

test('each network choice has a one-line hint', () => {
  assert.deepEqual(NETWORK_CHOICES.map((choice) => choice.value), ['open', 'registries', 'off']);
  for (const { value } of NETWORK_CHOICES) assert.ok(networkHint(value).length > 20, value);
  assert.match(networkHint('off'), /local model still works/);
  assert.match(networkHint('open'), /services on this computer/, 'open also reaches local services');
  assert.match(networkHint('open'), /Asyncat, where they could read your chats/, "Asyncat's own API among them");
  assert.equal(networkHint('nonsense'), networkHint('open'));
});

test('allowing a folder back keeps the others allowed', () => {
  const folders = [{ path: '/home/demo/.ssh', allowed: false }, { path: '/home/demo/.aws', allowed: true }];
  assert.deepEqual(toggleAllowed(folders, '/home/demo/.ssh', true), ['/home/demo/.aws', '/home/demo/.ssh']);
  assert.deepEqual(toggleAllowed(folders, '/home/demo/.aws', false), []);
});

test('home folder paths are shortened to ~', () => {
  assert.equal(shortPath('/home/demo/.ssh', '/home/demo'), '~/.ssh');
  assert.equal(shortPath('/home/demo', '/home/demo/'), '~');
  assert.equal(shortPath('/home/demoother/x', '/home/demo'), '/home/demoother/x');
  assert.equal(shortPath('/run/user/1000', null), '/run/user/1000');
});
