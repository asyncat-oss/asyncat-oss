// When the sandbox is on but can't start (bwrap missing, or blocked by
// AppArmor as on Ubuntu 24.04+), commands must not quietly run without it:
// each one asks first, every time, and the reason is shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-fallback-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');
const {
  resetSandboxProbe, sandboxCantStart, sandboxStatus, sandboxedCommand, setSandboxProbe,
} = await import('../src/agent/commandSandbox.js');
const { freedomAllows } = await import('../src/cats/catEngine.js');
const { updateSandboxSettings } = await import('../src/privacy/sandboxSettings.js');

const linuxOnly = process.platform !== 'linux' && 'the probe being faked is the Linux one';
const BLOCKED = 'AppArmor stops bwrap from running (Ubuntu 24.04 and later do this by default).';

function withSettings(values, fn) {
  return async () => {
    const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    try {
      await fn();
    } finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      resetSandboxProbe();
    }
  };
}

function gate(overrides = {}) {
  return Object.assign(Object.create(AgentRuntime.prototype), {
    agentMode: 'action',
    autoApprove: false,
    sessionApprovedTools: new Set(),
    requestPermission: null,
    session: null,
    workingDir: scratch,
    _throwIfAborted() {},
    _buildPermissionDiff() { return null; },
  }, overrides);
}

const call = (tool, permission = 'dangerous') => ({ toolCall: { tool_name: tool, call_id: 'c1', arguments: { command: 'ls' } }, permission, actionDesc: tool, round: 1 });

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test("the status says why the sandbox can't start", { skip: linuxOnly }, withSettings({ ASYNCAT_COMMAND_SANDBOX: 'auto' }, () => {
  setSandboxProbe({ ok: false, reason: BLOCKED });
  assert.equal(sandboxCantStart(), BLOCKED);
  const status = sandboxStatus();
  assert.equal(status.state, 'unavailable');
  assert.equal(status.reason, BLOCKED);
  assert.equal(status.enabled, true);
  assert.equal(sandboxedCommand({ file: '/bin/sh', args: ['-c', 'ls'], workspaceRoot: scratch }).sandboxed, false);
}));

test('turned off, or working, nothing extra is asked', { skip: linuxOnly }, async () => {
  await withSettings({ ASYNCAT_COMMAND_SANDBOX: 'off' }, () => {
    setSandboxProbe({ ok: false, reason: BLOCKED });
    assert.equal(sandboxCantStart(), null);
    assert.equal(sandboxStatus().state, 'off');
  })();
  await withSettings({ ASYNCAT_COMMAND_SANDBOX: 'auto' }, () => {
    setSandboxProbe({ ok: true, flags: [] });
    assert.equal(sandboxCantStart(), null);
    assert.equal(sandboxStatus().state, 'on');
    assert.equal(gate()._effectivePermission('run_command', { command: 'ls' }, 'dangerous'), 'safe');
  })();
});

test('a limited network that bwrap cannot give counts as not starting', { skip: linuxOnly }, withSettings({ ASYNCAT_COMMAND_SANDBOX: 'auto', ASYNCAT_SANDBOX_NETWORK: 'off' }, () => {
  setSandboxProbe({ ok: true, flags: [], net: false });
  assert.match(sandboxCantStart(), /network/);
}));

test('every command asks, every time, with the reason on the card', { skip: linuxOnly }, withSettings({ ASYNCAT_COMMAND_SANDBOX: 'auto' }, async () => {
  setSandboxProbe({ ok: false, reason: BLOCKED });
  // Even a command that only reads is no longer waved through.
  assert.equal(gate()._effectivePermission('run_command', { command: 'ls' }, 'dangerous'), 'dangerous');
  assert.equal(gate()._effectivePermission('package_manager', { command: 'list' }, 'moderate'), 'dangerous');
  assert.equal(gate()._effectivePermission('read_file', {}, 'safe'), 'safe');

  const asked = [];
  const runtime = gate({
    autoApprove: true,
    sessionApprovedTools: new Set(['run_command']),
    requestPermission: async (request) => { asked.push(request); return { decision: 'allow_session' }; },
  });
  const first = await runtime._checkPermission(call('run_command'));
  assert.equal(first.allowed, true);
  assert.equal(asked.length, 1, 'auto-approve and earlier approvals do not cover it');
  assert.equal(asked[0].unsandboxed, BLOCKED);
  assert.match(asked[0].sandboxNote, /sandbox can't start: AppArmor/);
  await runtime._checkPermission(call('run_command'));
  assert.equal(asked.length, 2, '"Trust this run" does not cover the next command either');

  // Other tools keep their approvals.
  await runtime._checkPermission(call('write_file'));
  assert.equal(asked.length, 2);

  const nobody = await gate({ autoApprove: true })._checkPermission(call('run_tests'));
  assert.equal(nobody.allowed, false);
  assert.match(nobody.reason, /sandbox can't start/);

  // linter_run fixes too (as code_fix did), so it starts programs as well.
  const linter = await gate({ autoApprove: true })._checkPermission(call('linter_run'));
  assert.equal(linter.allowed, false);
}));

test("after an edit, the project's own checks wait until the sandbox can start", { skip: linuxOnly }, withSettings({ ASYNCAT_COMMAND_SANDBOX: 'auto' }, async () => {
  setSandboxProbe({ ok: false, reason: BLOCKED });
  const dir = fs.mkdtempSync(path.join(scratch, 'verify-'));
  const ran = path.join(dir, 'lint-ran.txt');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', scripts: { lint: `touch '${ran}'` } }));
  fs.writeFileSync(path.join(dir, 'app.js'), 'export const answer = 42;\n');
  const events = [];
  const runtime = gate({ workingDir: dir, workspaceRoot: dir, onEvent: (event) => events.push(event) });
  const result = await runtime._autoVerify([path.join(dir, 'app.js')], { workspaceRoot: dir });
  assert.equal(fs.existsSync(ran), false, 'the lint script ran without the sandbox, unasked');
  assert.deepEqual(result.checks.map((check) => [check.check, check.status]), [['lint', 'skipped']]);
  assert.match(result.summary, /lint: skipped\. The sandbox can't start/);
  assert.equal(result.hasErrors, false);
  const { lspManager } = await import('../src/agent/LspManager.js');
  await assert.rejects(lspManager.getClient('typescript', dir), /sandbox can't start/);
}));

test("a Cat asks too, whatever its freedom", () => {
  assert.equal(freedomAllows('alone', { permission: 'dangerous', unsandboxed: BLOCKED }), false);
  assert.equal(freedomAllows('alone', { permission: 'dangerous' }), true);
});

test('sandbox settings are checked before they are saved', () => {
  const saved = [];
  const save = (key, value) => saved.push([key, value]);
  const status = () => ({ ok: true });
  updateSandboxSettings({ enabled: false, network: 'registries', allowRead: ['/home/demo/.ssh'], registries: ['pkgs.example.com', '127.0.0.1'] }, { save, status });
  assert.deepEqual(saved, [
    ['ASYNCAT_COMMAND_SANDBOX', 'off'],
    ['ASYNCAT_SANDBOX_NETWORK', 'registries'],
    ['ASYNCAT_SANDBOX_ALLOW_READ', '["/home/demo/.ssh"]'],
    ['ASYNCAT_SANDBOX_REGISTRIES', '["pkgs.example.com"]'],
  ]);
  assert.throws(() => updateSandboxSettings({ network: 'everything' }, { save, status }), /network must be/);
  assert.throws(() => updateSandboxSettings({ allowRead: ['relative/path'] }, { save, status }), /full folder paths/);
  assert.throws(() => updateSandboxSettings({ enabled: 'yes' }, { save, status }), /true or false/);
});

test('the sandbox routes show the status and save settings', async () => {
  const express = (await import('express')).default;
  const { once } = await import('node:events');
  const { default: privacyRouter } = await import('../src/privacy/privacyRoutes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/privacy', privacyRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/privacy/sandbox`;
  const call = (method, body) => fetch(base, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, body: await res.json() }));
  try {
    const status = (await call('GET')).body.sandbox;
    assert.ok(['on', 'unavailable', 'off', 'unsupported'].includes(status.state));
    assert.ok(Array.isArray(status.hiddenFolders));
    assert.ok(status.registries.builtIn.includes('registry.npmjs.org'));

    const changed = await call('PUT', { network: 'registries', registries: ['pkgs.example.com'] });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.sandbox.network.mode, 'registries');
    assert.deepEqual(changed.body.sandbox.registries.added, ['pkgs.example.com']);
    assert.equal((await call('PUT', { network: 'sometimes' })).status, 400);
  } finally {
    await call('PUT', { network: 'open', registries: [] });
    server.close();
  }
});
