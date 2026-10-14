// Copies of the project were once called sandboxes. "Sandbox" now means only
// the command sandbox; the old tool names keep working as hidden aliases.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { copyToolAliases, copyTools, forModel } from '../src/agent/tools/copyTools.js';
import { toolRegistry } from '../src/agent/tools/toolRegistry.js';
import { AgentRuntime } from '../src/agent/AgentRuntime.js';
import db from '../src/db/client.js';

toolRegistry.registerAll(copyTools);
toolRegistry.registerAliases(copyToolAliases);

test('the copy tools are named and described as copies', () => {
  assert.equal(copyTools.length, 11);
  for (const tool of copyTools) {
    assert.match(tool.name, /^copy_/);
    assert.doesNotMatch(tool.description.replace(/command sandbox/g, ''), /sandbox/i, tool.name);
  }
  assert.equal(copyToolAliases.sandbox_run_command, 'copy_run_command');
  assert.equal(copyToolAliases.sandbox_delegate_task, 'copy_delegate_task');
});

test('old names still run the tools but are never listed', async () => {
  // Like the merged tools' old names (toolAliases.js), they are aliases, not tools.
  assert.equal(toolRegistry.isAlias('sandbox_list'), true);
  assert.equal(toolRegistry.has('sandbox_list'), false);
  assert.equal(toolRegistry.getPermission('sandbox_run_command'), 'dangerous');
  assert.equal(toolRegistry.getPermission('sandbox_list'), 'safe');
  assert.equal(toolRegistry.canonicalName('sandbox_diff'), 'copy_diff');
  assert.equal(toolRegistry.canonicalName('read_file'), 'read_file');
  assert.ok(!toolRegistry.names().some((name) => name.startsWith('sandbox_')));
  assert.ok(!toolRegistry.toOpenAIFormat().some((tool) => tool.function.name.startsWith('sandbox_')));

  const userId = `user-${randomUUID()}`;
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
  const listed = await toolRegistry.execute('sandbox_list', {}, { userId, workspaceId: null });
  assert.equal(listed.success, true);
  assert.ok(Array.isArray(listed.copies));
  assert.equal('sandboxes' in listed, false);
});

test('approvals and tool lists saved under an old name still count', () => {
  const runtime = new AgentRuntime({ aiClient: null, model: 'demo', workingDir: os.tmpdir(), allowedTools: ['sandbox_diff'] });
  assert.equal(runtime.allowedTools.has('copy_diff'), true);
  runtime.sessionApprovedTools.add('sandbox_run_command');
  assert.equal(runtime.sessionApprovedTools.has('copy_run_command'), true);
  assert.equal(runtime.sessionApprovedTools.has('sandbox_run_command'), true);
  assert.equal(runtime.sessionApprovedTools.has('run_command'), false);
});

test('what the model sees says copy, not sandbox', () => {
  assert.deepEqual(forModel({ success: true, sandbox: { id: 'a', sandboxPath: '/p' }, sandboxes: [{ sandboxId: 'b' }] }), {
    success: true, copy: { id: 'a', copyPath: '/p' }, copies: [{ copyId: 'b' }],
  });
});

test('a new copy gets a copy branch, and its commands see ASYNCAT_COPY_PATH', async () => {
  const { execFileSync } = await import('node:child_process');
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-copy-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.test', ...args], { cwd: source, stdio: 'ignore' });
  fs.writeFileSync(path.join(source, 'readme.txt'), 'demo');
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'start');
  const userId = `user-${randomUUID()}`;
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
  let made;
  try {
    made = await toolRegistry.execute('copy_create', { sourcePath: source, name: 'try' }, { userId });
    assert.equal(made.success, true, made.error);
    assert.match(made.copy.branchName, /^asyncat-copy\//);
    const ran = await toolRegistry.execute('copy_run_command', { id: made.copy.id, command: 'echo "$ASYNCAT_COPY_PATH"' }, { userId });
    assert.equal(ran.job.stdout.trim(), made.copy.copyPath);
  } finally {
    if (made?.copy) await toolRegistry.execute('copy_delete', { id: made.copy.id, force: true }, { userId });
    fs.rmSync(source, { recursive: true, force: true });
  }
});
