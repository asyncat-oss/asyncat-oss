import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fileTools, editFileTool } from '../src/agent/tools/fileTools.js';
import { safePath, isPathInside } from '../src/agent/tools/shared.js';
import { runCommandTool, shellTools } from '../src/agent/tools/shellTools.js';
import { dataTools } from '../src/agent/tools/dataTools.js';
import { hasBin } from '../src/agent/tools/shared.js';

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

test('edit_file replaces one exact, unique piece of text', async () => {
  const root = makeTempWorkspace();
  const filePath = path.join(root, 'example.js');
  fs.writeFileSync(filePath, 'export const value = 1;\nexport const other = 1;\n', 'utf8');

  const result = await editFileTool.execute({
    path: 'example.js',
    old_string: 'export const value = 1;\n',
    new_string: 'export const value = 2;\n',
  }, { workingDir: root });
  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(filePath, 'utf8'), 'export const value = 2;\nexport const other = 1;\n');

  const twice = await editFileTool.execute({ path: 'example.js', old_string: '= ', new_string: '= -' }, { workingDir: root });
  assert.equal(twice.success, false, 'an ambiguous match is refused');
  assert.equal(twice.occurrences, 2);

  const all = await editFileTool.execute({ path: 'example.js', old_string: '= ', new_string: '= -', replace_all: true }, { workingDir: root });
  assert.equal(all.success, true);
  assert.equal(all.replaced, 2);

  const ranged = await editFileTool.execute({ path: 'example.js', old_string: '-1', new_string: '3', start_line: 2, end_line: 2 }, { workingDir: root });
  assert.equal(ranged.success, true);
  assert.equal(fs.readFileSync(filePath, 'utf8'), 'export const value = -2;\nexport const other = 3;\n');

  const broken = await editFileTool.execute({ path: 'example.js', old_string: 'export const other = 3;', new_string: 'export const other = (' }, { workingDir: root });
  assert.equal(broken.success, true);
  assert.match(broken.warning, /no longer parses/);
});

test('without an exact match, the same lines with other whitespace are replaced, and only those lines', async () => {
  const root = makeTempWorkspace();
  const garden = path.join(root, 'garden.js');
  // A function after a blank line, copied with four-space indentation
  // where the file has two.
  fs.writeFileSync(garden, 'function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n', 'utf8');
  const result = await editFileTool.execute({
    path: 'garden.js',
    old_string: 'function b() {\n    return 2;\n}\n',
    new_string: 'function b() {\n  return 3;\n}\n',
  }, { workingDir: root });
  assert.equal(result.success, true, result.error);
  assert.equal(result.mode, 'fuzzy_whitespace');
  assert.equal(fs.readFileSync(garden, 'utf8'), 'function a() {\n  return 1;\n}\n\nfunction b() {\n  return 3;\n}\n');

  // The same words ending an earlier line are not a match.
  const notes = path.join(root, 'notes.txt');
  fs.writeFileSync(notes, 'buy  pears\n  plums\nthen\n  pears\n  plums\n', 'utf8');
  const changed = await editFileTool.execute({ path: 'notes.txt', old_string: 'pears\nplums', new_string: 'apples' }, { workingDir: root });
  assert.equal(changed.success, true, changed.error);
  assert.equal(fs.readFileSync(notes, 'utf8'), 'buy  pears\n  plums\nthen\napples\n');

  fs.writeFileSync(notes, 'pears:\n  x\n  y\nplums:\n  x\n  y\n', 'utf8');
  const twice = await editFileTool.execute({ path: 'notes.txt', old_string: 'x\ny', new_string: 'z' }, { workingDir: root });
  assert.equal(twice.success, false, 'two loose matches are refused');
  assert.match(twice.error, /2 times/);
  assert.equal(fs.readFileSync(notes, 'utf8'), 'pears:\n  x\n  y\nplums:\n  x\n  y\n');
});

test('edit_file and apply_patch are the only editing tools', () => {
  const names = fileTools.map(tool => tool.name);
  assert.ok(names.includes('edit_file') && names.includes('apply_patch'));
  assert.ok(!names.includes('patch_file'));
});

test('ssh_exec lives with the shell tools and refuses option-like hosts', async () => {
  const ssh = shellTools.find(tool => tool.name === 'ssh_exec');
  assert.ok(ssh, 'ssh_exec is a shell tool');
  assert.equal(ssh.category, 'shell');
  assert.ok(!dataTools.some(tool => tool.name === 'ssh_exec'));
  const result = await ssh.execute({ host: '-oProxyCommand=touch /tmp/x', command: 'true' }, { workingDir: makeTempWorkspace() });
  assert.equal(result.success, false);
  if (hasBin('ssh')) assert.match(result.error, /plain names/);
});
