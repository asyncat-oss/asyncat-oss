import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { sandboxAvailable, sandboxedCommand, writableRoots } from '../src/agent/commandSandbox.js';
import { runCommandTool } from '../src/agent/tools/shellTools.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('the sandbox only lets commands write in the project, temp and caches', () => {
  const roots = writableRoots({ workspaceRoot: '/work/project', home: '/home/me', tmp: '/tmp' });
  assert.ok(roots.includes('/work/project'));
  assert.ok(roots.includes('/home/me/.npm'));
  assert.ok(!roots.includes('/home/me'));

  const linux = sandboxedCommand({ file: '/bin/sh', args: ['-c', 'ls'], workspaceRoot: '/work/project', platform: 'linux', home: '/home/me', force: true });
  assert.equal(linux.file, 'bwrap');
  assert.deepEqual(linux.args.slice(0, 4), ['--die-with-parent', '--ro-bind', '/', '/']);
  assert.deepEqual(linux.args.slice(-4), ['--', '/bin/sh', '-c', 'ls']);

  const mac = sandboxedCommand({ file: '/bin/sh', args: ['-c', 'ls'], workspaceRoot: '/Users/me/p"x', platform: 'darwin', home: '/Users/me', force: true });
  assert.equal(mac.file, '/usr/bin/sandbox-exec');
  assert.match(mac.args[1], /\(deny file-write\*\)/);
  assert.match(mac.args[1], /\(subpath "\/Users\/me\/p\\"x"\)/);

  assert.equal(sandboxedCommand({ file: 'cmd.exe', args: [], workspaceRoot: 'C:\\p', platform: 'win32', force: false }).sandboxed, false);
});

test('a sandboxed run_command cannot write outside the project', { skip: !sandboxAvailable() && 'no sandbox tool on this computer' }, async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-sandbox-'));
  const outside = path.join(here, `.sandbox-escape-${randomUUID()}`);
  try {
    const inside = await runCommandTool.execute({ command: 'echo ok > made-here.txt && cat /etc/hostname > /dev/null' }, { workingDir: project });
    assert.equal(inside.success, true, inside.stderr);
    assert.equal(inside.sandboxed, true);
    assert.ok(fs.existsSync(path.join(project, 'made-here.txt')));

    const escape = await runCommandTool.execute({ command: `touch '${outside}'` }, { workingDir: project });
    assert.equal(escape.success, false);
    assert.equal(fs.existsSync(outside), false, 'the command must not have written outside the project');
    assert.match(escape.note || '', /sandbox/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});
