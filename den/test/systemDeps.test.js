import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findCommand,
  inspectSystemDependencies,
  invalidateSystemDependencyCache,
  recommendedInstallCommands,
} from '../src/lib/systemDeps.js';

test('the readiness report runs beside the server, is shared, and is cached', async () => {
  invalidateSystemDependencyCache();
  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; }, 5);
  const started = Date.now();
  let first;
  let second;
  try {
    // Two requests at once share one set of probes.
    [first, second] = await Promise.all([inspectSystemDependencies(), inspectSystemDependencies()]);
  } finally {
    clearInterval(timer);
  }
  const elapsed = Date.now() - started;
  assert.equal(first, second);
  assert.ok(ticks >= Math.min(3, Math.floor(elapsed / 20)), `the event loop kept running (${ticks} ticks in ${elapsed} ms)`);
  assert.ok(first.checks.some((check) => check.id === 'node' && check.ok));
  assert.ok(Array.isArray(first.commands));

  // Within a minute the same report comes back without probing again.
  const cachedStart = Date.now();
  assert.equal(await inspectSystemDependencies(), first);
  assert.ok(Date.now() - cachedStart < 50);

  // Recheck asks again.
  const fresh = await inspectSystemDependencies({ refresh: true });
  assert.notEqual(fresh, first);
});

test('commands are found without starting a shell for each one', async () => {
  assert.ok(await findCommand(process.execPath));
  assert.equal(await findCommand('surely-not-a-real-program-asyncat'), null);
  assert.equal(await findCommand(''), null);
});

test('asking for a package manager this machine lacks says how to get it', async () => {
  const checks = [{ id: 'ffmpeg', ok: false }];
  const commands = await recommendedInstallCommands(checks, 'brew', { managers: [] });
  assert.ok(commands.some((item) => item.kind === 'packages' && /brew install ffmpeg/.test(item.command)));
  assert.ok(commands.some((item) => item.kind === 'package-manager'));
  const available = await recommendedInstallCommands(checks, 'brew', { managers: [{ id: 'brew', command: 'brew' }] });
  assert.equal(available.some((item) => item.kind === 'package-manager'), false);
});
