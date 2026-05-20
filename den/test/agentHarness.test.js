import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fileTools, patchFileTool } from '../src/agent/tools/fileTools.js';
import { safePath, isPathInside } from '../src/agent/tools/shared.js';
import { runCommandTool } from '../src/agent/tools/shellTools.js';

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-agent-harness-'));
}

test('safePath rejects sibling paths with a shared prefix', () => {
  const root = makeTempWorkspace();
  const sibling = `${root}-sibling`;
  fs.mkdirSync(sibling);

  assert.equal(isPathInside(path.join(root, 'src/index.js'), root), true);
  assert.equal(isPathInside(path.join(sibling, 'escape.txt'), root), false);

  const relativeSiblingPath = path.relative(root, path.join(sibling, 'escape.txt'));
  assert.throws(
    () => safePath(relativeSiblingPath, root),
    /outside the working directory/,
  );
});

test('run_command rejects cwd values outside the workspace before execution', async () => {
  const root = makeTempWorkspace();
  const sibling = `${root}-sibling`;
  fs.mkdirSync(sibling);

  const result = await runCommandTool.execute({
    command: 'pwd',
    cwd: path.relative(root, sibling),
  }, {
    workingDir: root,
  });

  assert.equal(result.success, false);
  assert.match(result.error, /within the workspace/);
});

test('patch_file is registered and applies unique exact edits', async () => {
  const root = makeTempWorkspace();
  const filePath = path.join(root, 'example.js');
  fs.writeFileSync(filePath, 'export const value = 1;\n', 'utf8');

  assert.ok(fileTools.some(tool => tool.name === 'patch_file'));

  const result = await patchFileTool.execute({
    path: 'example.js',
    old_string: 'export const value = 1;\n',
    new_string: 'export const value = 2;\n',
  }, {
    workingDir: root,
  });

  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(filePath, 'utf8'), 'export const value = 2;\n');
});
