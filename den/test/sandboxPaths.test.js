// Every way the agent runs a project's code goes through the command sandbox
// (commandSandbox.js): tests, package scripts, builds, linters, spawned
// processes and commands in copies, not only run_command.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runInSandbox, sandboxAvailable, sandboxedCommand, sandboxHint } from '../src/agent/commandSandbox.js';
import { runTestsTool } from '../src/agent/tools/testRunnerTools.js';
import { buildRunnerTool, packageManagerTool } from '../src/agent/tools/devTools.js';
import { processSpawnTool } from '../src/agent/tools/osTools.js';
import { dockerVolumes, sandboxExecTool } from '../src/agent/tools/dockerTools.js';
import { runCommandTool, shellSessionCloseTool, shellSessionRunTool, shellSessionStartTool } from '../src/agent/tools/shellTools.js';
import { hasBin } from '../src/agent/tools/shared.js';
import { createSandbox, deleteSandbox, runSandboxCommand } from '../src/agent/SandboxManager.js';
import { lspManager } from '../src/agent/LspManager.js';
import db from '../src/db/client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const noSandbox = !sandboxAvailable() && 'no sandbox tool on this computer';

function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-sandbox-paths-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

// A file the sandbox must not let commands create: outside the project,
// temp folders and caches.
function outsidePath() {
  return path.join(here, `.sandbox-escape-${randomUUID()}`);
}

async function waitFor(check, ms = 5000) {
  for (let waited = 0; waited < ms && !check(); waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
}

test('the hint for a blocked write points at Privacy & safety', () => {
  const note = sandboxHint({ success: false, stderr: 'touch: cannot touch x: Read-only file system' });
  assert.match(note, /Privacy & safety/);
  assert.doesNotMatch(note, /Workbench/);
});

test('run_tests, package_manager and build_runner run in the sandbox', { skip: noSandbox }, async () => {
  const outside = outsidePath();
  const dir = project({
    'package.json': JSON.stringify({ name: 'demo', scripts: { test: `touch '${outside}'`, escape: `touch '${outside}'`, build: `touch '${outside}'` } }),
  });
  const context = { workingDir: dir, workspaceRoot: dir };
  try {
    const tests = await runTestsTool.execute({ framework: 'npm-script' }, context);
    assert.equal(tests.sandboxed, true);
    assert.equal(tests.success, false);

    const script = await packageManagerTool.execute({ command: 'run escape' }, context);
    assert.equal(script.sandboxed, true);
    assert.equal(script.success, false);

    const build = await buildRunnerTool.execute({}, context);
    assert.equal(build.sandboxed, true);
    assert.equal(build.success, false);
    assert.match(build.note || '', /sandbox/);

    assert.equal(fs.existsSync(outside), false, 'a project script wrote outside the project');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('process_spawn runs in the sandbox', { skip: noSandbox || process.platform === 'win32' }, async () => {
  const outside = outsidePath();
  const dir = project();
  try {
    const res = await processSpawnTool.execute({ command: `touch '${outside}'; echo tried > tried.txt` }, { workingDir: dir, workspaceRoot: dir });
    assert.equal(res.success, true, res.error);
    assert.equal(res.sandboxed, true);
    await waitFor(() => fs.existsSync(path.join(dir, 'tried.txt')));
    assert.ok(fs.existsSync(path.join(dir, 'tried.txt')), 'the process ran');
    assert.equal(fs.existsSync(outside), false, 'the spawned process wrote outside the project');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('a sandboxed command starts in the folder the tool asked for', () => {
  const plan = (cwd) => sandboxedCommand({ file: 'pwd', workspaceRoot: '/work/project', cwd, platform: 'linux', home: '/home/me', tmp: '/tmp', force: true, hidden: [] });
  const startsIn = (args) => args[args.indexOf('--chdir') + 1];
  assert.equal(startsIn(plan('/work/project/packages/web').args), '/work/project/packages/web');
  assert.equal(startsIn(plan(null).args), '/work/project', 'the project, when the tool names no folder');
  assert.throws(() => plan('/etc'), /can only start in a folder it may change/);
});

// Tools take a folder inside the project (one package of a monorepo, say).
// In the sandbox their commands must run there, not in the project's root.
test('sandboxed tools run in the folder they were given', { skip: noSandbox || process.platform === 'win32' }, async () => {
  const dir = project();
  const web = path.join(dir, 'packages', 'web');
  fs.mkdirSync(web, { recursive: true });
  fs.writeFileSync(path.join(web, 'Makefile'), 'all:\n\t@pwd > built-here.txt\n');
  const context = { workingDir: dir, workspaceRoot: dir, session: { id: `cwd-${randomUUID()}` } };
  const real = (target) => { try { return fs.realpathSync(String(target || '').trim()); } catch { return target; } };
  const read = (file) => { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; } };
  try {
    const command = await runCommandTool.execute({ command: 'pwd', cwd: 'packages/web' }, context);
    assert.equal(command.sandboxed, true);
    assert.equal(real(command.stdout), real(web), 'run_command');

    // How run_tests, linter_run, code_fix and dependency_audit run.
    const direct = await runInSandbox('pwd', [], { cwd: web, workspaceRoot: dir });
    assert.equal(real(direct.stdout), real(web), 'the tools that run project scripts');

    if (hasBin('make')) {
      const build = await buildRunnerTool.execute({ path: 'packages/web' }, context);
      assert.equal(build.success, true, build.stderr || build.error);
      assert.ok(fs.existsSync(path.join(web, 'built-here.txt')), 'build_runner builds the package, not the project root');
    }

    await shellSessionStartTool.execute({ cwd: 'packages/web', name: 'web' }, context);
    const session = await shellSessionRunTool.execute({ command: 'pwd', name: 'web' }, context);
    await shellSessionCloseTool.execute({ name: 'web' }, context);
    assert.equal(real(session.output), real(web), 'a shell session');

    await processSpawnTool.execute({ command: 'pwd > where.txt', cwd: 'packages/web' }, context);
    await waitFor(() => read(path.join(web, 'where.txt')));
    assert.equal(real(read(path.join(web, 'where.txt'))), real(web), 'process_spawn');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// npx finds the project's own node_modules/.bin first, so the language
// server the agent starts after an edit can be the project's code.
test('a language server from the project runs in the sandbox', { skip: (noSandbox || !hasBin('npx') || process.platform === 'win32') && 'needs the sandbox and npx' }, async () => {
  const outside = outsidePath();
  const dir = project({ 'package.json': JSON.stringify({ name: 'demo' }) });
  const bin = path.join(dir, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'typescript-language-server'), `#!/bin/sh\necho ran > '${path.join(dir, 'server-ran.txt')}'\ntouch '${outside}'\n`, { mode: 0o755 });
  try {
    await assert.rejects(lspManager.getClient('typescript', dir), /exited/);
    assert.ok(fs.existsSync(path.join(dir, 'server-ran.txt')), 'the planted server ran');
    assert.equal(fs.existsSync(outside), false, 'it wrote outside the project: it ran without the sandbox');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('commands in a copy run sandboxed, without blocking the server', { skip: noSandbox }, async () => {
  const outside = outsidePath();
  const source = project({ 'readme.txt': 'demo' });
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.test', ...args], { cwd: source, stdio: 'ignore' });
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'start');
  const userId = `user-${randomUUID()}`;
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
  let copy;
  try {
    copy = createSandbox({ userId, sourcePath: source, strategy: 'worktree', name: 'Try it' }).sandbox;
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 20);
    const job = await runSandboxCommand(userId, copy.id, { command: `sleep 0.3; echo made > made.txt; touch '${outside}'` });
    clearInterval(timer);
    assert.ok(ticks >= 5, `the server was blocked while the command ran (${ticks} ticks)`);
    assert.equal(job.sandboxed, true);
    assert.equal(job.success, false);
    assert.equal(job.job.status, 'failed');
    assert.ok(fs.existsSync(path.join(copy.sandboxPath, 'made.txt')), 'it may write in the copy');
    assert.equal(fs.existsSync(path.join(source, 'made.txt')), false, 'but not in the original');
    assert.equal(fs.existsSync(outside), false);
  } finally {
    if (copy) deleteSandbox(userId, copy.id, { force: true });
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('a shell session cannot start outside the project', async () => {
  const dir = project();
  try {
    const res = await shellSessionStartTool.execute({ cwd: '..', name: 'outside' }, { workingDir: dir, workspaceRoot: dir, session: { id: 'paths-test' } });
    assert.equal(res.success, false);
    assert.match(res.error, /within the workspace/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('docker_run only mounts folders inside the project', () => {
  const root = project();
  try {
    fs.mkdirSync(path.join(root, 'data'));
    assert.deepEqual(dockerVolumes('./data:/data, cache:/cache, /scratch', { workingDir: root }), [
      `${fs.realpathSync(root)}/data:/data`, 'cache:/cache', '/scratch',
    ]);
    assert.throws(() => dockerVolumes('/:/host', { workingDir: root }), /whole disk/);
    assert.throws(() => dockerVolumes('/var/run/docker.sock:/var/run/docker.sock', { workingDir: root }), /Docker socket/);
    assert.throws(() => dockerVolumes('~/.ssh:/keys', { workingDir: root, home: '/home/demo' }), /inside the project/);
    assert.throws(() => dockerVolumes('../:/up', { workingDir: root }), /inside the project/);
    // A link inside the project that points out of it is followed.
    fs.symlinkSync('/etc', path.join(root, 'etc-link'));
    assert.throws(() => dockerVolumes('./etc-link:/etc2', { workingDir: root }), /inside the project/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sandbox_exec says plainly that nothing ran without Docker", { skip: hasBin('docker') && 'Docker is installed here' }, async () => {
  const res = await sandboxExecTool.execute({ command: 'echo hi' }, { workingDir: os.tmpdir() });
  assert.equal(res.success, false);
  assert.doesNotMatch(res.error, /fallback/i);
  assert.match(res.error, /nothing ran/);
});
