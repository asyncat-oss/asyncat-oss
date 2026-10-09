import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCommandTool, runNodeTool } from '../src/agent/tools/shellTools.js';

// run_command used to wrap `sh -c <command>` in a second shell, which re-split
// the command and ran only its first word: `npm test` ran plain `npm`.
const posix = process.platform !== 'win32';

function tempProject(name = 'asyncat run-command') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name} `));
}

test('run_command runs the whole command, not just its first word', { skip: !posix }, async () => {
  const workingDir = tempProject();
  try {
    const res = await runCommandTool.execute({ command: 'echo one two three' }, { workingDir });
    assert.equal(res.success, true);
    assert.equal(res.stdout.trim(), 'one two three');

    const quoted = await runCommandTool.execute({ command: `printf '%s|' "a b" c` }, { workingDir });
    assert.equal(quoted.stdout, 'a b|c|');

    const failing = await runCommandTool.execute({ command: 'exit 3' }, { workingDir });
    assert.equal(failing.success, false);
    assert.equal(failing.exit_code, 3);
  } finally {
    fs.rmSync(workingDir, { recursive: true, force: true });
  }
});

test('run_command runs in the project folder, even with a space in its path', { skip: !posix }, async () => {
  const workingDir = tempProject('asyncat project with spaces');
  try {
    const res = await runCommandTool.execute({ command: 'pwd' }, { workingDir });
    assert.equal(fs.realpathSync(res.stdout.trim()), fs.realpathSync(workingDir));
  } finally {
    fs.rmSync(workingDir, { recursive: true, force: true });
  }
});

test('run_node runs its script when the project path has a space', async () => {
  const workingDir = tempProject('asyncat node project');
  try {
    const res = await runNodeTool.execute({ code: 'console.log(6 * 7)' }, { workingDir });
    assert.equal(res.success, true, res.stderr);
    assert.equal(res.stdout.trim(), '42');
  } finally {
    fs.rmSync(workingDir, { recursive: true, force: true });
  }
});
