import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { diskUsageTool, portScanTool } from '../src/agent/tools/osTools.js';
import { jsonQueryTool } from '../src/agent/tools/dataTools.js';

// These tools are permission:'safe', so the agent runs them without asking the
// user. They used to build a shell command string from model-supplied values,
// which let prompt-injected model output run arbitrary commands. Each tool now
// passes those values as argv entries (no shell), so a payload with shell
// metacharacters must run no second command.

function freshMarker() {
  return path.join(os.tmpdir(), `asyncat-shell-safety-${process.pid}-${randomUUID()}`);
}

test('disk_usage does not run injected shell commands via path', async () => {
  const marker = freshMarker();
  await diskUsageTool.execute({ path: `/ ; touch ${marker}` });
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
});

test('disk_usage still reports usage for a real path', async () => {
  const res = await diskUsageTool.execute({ path: '/' });
  assert.equal(res.success, true);
  assert.ok(res.total, 'expected a total size field');
});

test('port_scan coerces a non-integer port and runs nothing from it', async () => {
  const marker = freshMarker();
  const res = await portScanTool.execute({ port: `0; touch ${marker}` });
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
  assert.equal(res.port, null, 'a non-numeric port must not be passed through');
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
});

test('json_query does not run injected shell commands via query', async (t) => {
  // jq is optional; when it is absent json_query uses a pure-JS fallback that
  // never touches a shell, so this test is only meaningful (and only needs to
  // run) when jq is installed.
  const res = await jsonQueryTool.execute({ data: { a: 1 }, query: '.a' }, { workingDir: process.cwd() });
  if (res.engine !== 'jq') { t.skip('jq not installed'); return; }

  const marker = freshMarker();
  await jsonQueryTool.execute({ data: { a: 1 }, query: `. ; touch ${marker}` }, { workingDir: process.cwd() });
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
});

test('notify passes title and message as arguments, never through a shell', async () => {
  const { notificationCommand } = await import('../src/agent/tools/systemTools.js');
  const payload = 'Done $(touch /tmp/x) `id` "quoted" \'single\'';

  const [linuxFile, linuxArgs] = notificationCommand({ title: 'T', message: payload, urgency: 'normal; id', platform: 'linux' });
  assert.equal(linuxFile, 'notify-send');
  assert.deepEqual(linuxArgs, ['--urgency=normal', '--', 'T', payload]);

  const [, macArgs] = notificationCommand({ title: 'T', message: 'say "hi" \\ bye', platform: 'darwin' });
  assert.equal(macArgs[1], 'display notification "say \\"hi\\" \\\\ bye" with title "T"');

  const [, winArgs] = notificationCommand({ title: "it's", message: '$(Get-Process)', platform: 'win32' });
  const script = winArgs[winArgs.length - 1];
  assert.match(script, /ShowBalloonTip\(4000, 'it''s', '\$\(Get-Process\)'/);
});

// File, git and package tools take paths, refs and options from the model.
// They now run programs with argument lists, so none of these payloads may
// run a second command, and values that would be read as options are refused.

test('search, find and diff tools pass model values as arguments', async () => {
  const marker = freshMarker();
  const fileTools = await import('../src/agent/tools/fileTools.js');
  const tools = Object.values(fileTools).flatMap(v => (Array.isArray(v) ? v : [v])).filter(t => t?.name);
  const byName = (name) => tools.find(t => t.name === name);
  const context = { workingDir: path.resolve('src') };

  await byName('search_files').execute({ pattern: 'x', include: `*.js'; touch ${marker}; '` }, context);
  await byName('search_files').execute({ pattern: `x' ; touch ${marker} ; '` }, context);
  await byName('find_files').execute({ pattern: `*'; touch ${marker}; '` }, context);
  await byName('file_diff').execute({ path: 'index.js', context_lines: `3; touch ${marker}` }, context);
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
});

test('git tools refuse option-like refs and paths outside the project', async () => {
  const marker = freshMarker();
  const { gitTools } = await import('../src/agent/tools/gitTools.js');
  const byName = (name) => gitTools.find(t => t.name === name);
  const context = { workingDir: path.resolve('..') };

  await byName('git_log').execute({ limit: `3; touch ${marker}`, author: `$(touch ${marker})` }, context);
  await assert.rejects(byName('git_diff').execute({ compare: `HEAD; touch ${marker}` }, context), /plain name/);
  await assert.rejects(byName('git_diff').execute({ compare: '--output=/tmp/x' }, context), /plain name/);
  await assert.rejects(byName('git_status').execute({ path: '/etc' }, context), /outside the working directory/);
  const cloned = await byName('git_clone').execute({ url: `ext::sh -c touch% ${marker}` }, context);
  assert.equal(cloned.success, false);
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
});

test('package_manager only skips approval for commands that only read', async () => {
  const { isReadOnlyPackageCommand } = await import('../src/agent/shellSafety.js');
  for (const command of ['list', 'outdated', 'audit', 'show express', 'why react', 'freeze', 'version']) {
    assert.equal(isReadOnlyPackageCommand(command), true, command);
  }
  for (const command of ['list; rm -rf ~', 'audit fix', 'audit --fix', 'version patch', 'install', 'list && id', 'outdated $(id)']) {
    assert.equal(isReadOnlyPackageCommand(command), false, command);
  }
});

test('package_manager builds argument lists, never shell strings', async () => {
  const { packageManagerSteps } = await import('../src/agent/tools/devTools.js');
  assert.deepEqual(packageManagerSteps('npm', ['install', 'left-pad'], { dev: true }), [[process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--save-dev', 'left-pad']]]);
  assert.deepEqual(packageManagerSteps('yarn', ['install', 'a', 'b']), [[process.platform === 'win32' ? 'yarn.cmd' : 'yarn', ['add', 'a', 'b']]]);
  assert.deepEqual(packageManagerSteps('pip', ['install']), [['pip', ['install', '-r', 'requirements.txt']]]);
});
