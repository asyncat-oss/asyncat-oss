import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// apply_patch makes several edits at once, all or nothing: a list of exact
// replacements or a unified diff, applied inside the working folder.

import { applyPatchTool, planPatch, patchTargets } from '../src/agent/tools/fileTools.js';
import { applyHunks, parseUnifiedDiff } from '../src/agent/tools/unifiedDiff.js';

function folder(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-apply-patch-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}
const read = (root, name) => fs.readFileSync(path.join(root, name), 'utf8');
const run = (args, root) => applyPatchTool.execute(args, { workingDir: root });

const GARDEN = 'pears\nplums\napples\ncherries\nquinces\n';

test('a unified diff is read into files and hunks', () => {
  const files = parseUnifiedDiff([
    'diff --git a/notes/garden.md b/notes/garden.md',
    'index 1111111..2222222 100644',
    '--- a/notes/garden.md',
    '+++ b/notes/garden.md',
    '@@ -1,3 +1,3 @@',
    ' pears',
    '-plums',
    '+damsons',
    ' apples',
    '--- /dev/null',
    '+++ b/notes/new.md',
    '@@ -0,0 +1 @@',
    '+fresh',
    '\\ No newline at end of file',
  ].join('\n'));
  assert.equal(files.length, 2);
  assert.deepEqual([files[0].oldPath, files[0].newPath, files[0].git], ['a/notes/garden.md', 'b/notes/garden.md', true]);
  assert.deepEqual(files[0].hunks[0].lines.map((l) => l.type + l.text), [' pears', '-plums', '+damsons', ' apples']);
  assert.deepEqual([files[1].oldPath, files[1].newPath], [null, 'b/notes/new.md']);
  assert.equal(files[1].hunks[0].newNoNewline, true);
});

test('hunks are placed by their context, even when the line numbers are off', () => {
  const hunks = parseUnifiedDiff('--- a/g\n+++ b/g\n@@ -40,3 +40,3 @@\n apples\n-cherries\n+morello cherries\n quinces\n')[0].hunks;
  assert.equal(applyHunks(GARDEN, hunks), 'pears\nplums\napples\nmorello cherries\nquinces\n');
  assert.throws(() => applyHunks('pears\n', hunks, { label: 'g' }), /Hunk 1 for g does not match/);
  assert.equal(applyHunks('a\r\nb\r\n', parseUnifiedDiff('--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n')[0].hunks), 'a\r\nc\r\n', 'CRLF files stay CRLF');
  assert.equal(applyHunks('a\nb', parseUnifiedDiff('--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n')[0].hunks), 'a\nc\n');
});

test('apply_patch applies a git diff: edit, create, delete and rename', async () => {
  const root = folder({ 'garden.md': GARDEN, 'old.md': 'gone\n', 'draft.md': 'keep me\n' });
  const patch = [
    'diff --git a/garden.md b/garden.md',
    '--- a/garden.md',
    '+++ b/garden.md',
    '@@ -2,1 +2,1 @@',
    '-plums',
    '+damsons',
    'diff --git a/notes/new.md b/notes/new.md',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/notes/new.md',
    '@@ -0,0 +1,2 @@',
    '+# New',
    '+fresh',
    'diff --git a/old.md b/old.md',
    'deleted file mode 100644',
    '--- a/old.md',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-gone',
    'diff --git a/draft.md b/final.md',
    'similarity index 100%',
    'rename from draft.md',
    'rename to final.md',
  ].join('\n');
  const result = await run({ patch }, root);
  assert.equal(result.success, true, result.error);
  assert.equal(read(root, 'garden.md'), GARDEN.replace('plums', 'damsons'));
  assert.equal(read(root, 'notes/new.md'), '# New\nfresh\n');
  assert.equal(fs.existsSync(path.join(root, 'old.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'draft.md')), false);
  assert.equal(read(root, 'final.md'), 'keep me\n');
  assert.deepEqual(result.results.map((r) => `${r.path}: ${r.action}`).sort(), [
    'draft.md: renamed', 'final.md: renamed from draft.md', 'garden.md: edited', 'notes/new.md: created', 'old.md: deleted',
  ]);
});

test('apply_patch is all or nothing', async () => {
  const root = folder({ 'a.md': 'one\n', 'b.md': 'two\n' });
  const edits = await run({ edits: [
    { path: 'a.md', old_string: 'one', new_string: 'ONE' },
    { path: 'b.md', old_string: 'missing', new_string: 'x' },
  ] }, root);
  assert.equal(edits.success, false);
  assert.match(edits.error, /Edit 2 \(b\.md\).*No files were changed/s);
  assert.equal(read(root, 'a.md'), 'one\n');

  const diff = await run({ patch: '--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n-one\n+ONE\n--- a/b.md\n+++ b/b.md\n@@ -1 +1 @@\n-nope\n+x\n' }, root);
  assert.equal(diff.success, false);
  assert.equal(read(root, 'a.md'), 'one\n');
});

test('an edit with other whitespace changes the lines it matches, not the same words ending an earlier line', async () => {
  const root = folder({ 'notes.txt': 'buy  pears\n  plums\nthen\n  pears\n  plums\n' });
  const result = await run({ edits: [{ path: 'notes.txt', old_string: 'pears\nplums', new_string: 'apples' }] }, root);
  assert.equal(result.success, true, result.error);
  assert.equal(read(root, 'notes.txt'), 'buy  pears\n  plums\nthen\napples\n');
});

test('apply_patch refuses to break JS syntax or to leave the folder', async () => {
  const root = folder({ 'src/value.js': 'export const value = 1;\n' });
  const broken = await run({ edits: [{ path: 'src/value.js', old_string: '1;', new_string: '(;' }] }, root);
  assert.equal(broken.success, false);
  assert.match(broken.error, /Syntax error/);
  assert.equal(read(root, 'src/value.js'), 'export const value = 1;\n');

  const outside = await run({ patch: '--- /dev/null\n+++ b/../escape.txt\n@@ -0,0 +1 @@\n+hi\n' }, root);
  assert.equal(outside.success, false);
  assert.match(outside.error, /outside the working directory/);
  assert.equal(fs.existsSync(path.join(path.dirname(root), 'escape.txt')), false);
});

test('a dry run checks without writing, and targets list the files to read first', async () => {
  const root = folder({ 'a.md': 'one\n' });
  const patch = '--- a.md\n+++ a.md\n@@ -1 +1 @@\n-one\n+uno\n';
  const dry = await run({ patch, dry_run: true }, root);
  assert.equal(dry.success, true);
  assert.equal(dry.dry_run, true);
  assert.equal(read(root, 'a.md'), 'one\n');
  assert.deepEqual(patchTargets({ patch }, root), ['a.md']);
  assert.deepEqual(patchTargets({ edits: [{ path: 'a.md', old_string: 'one', new_string: 'two' }] }, root), ['a.md']);
  assert.deepEqual(planPatch({ patch: '--- /dev/null\n+++ b/n.md\n@@ -0,0 +1 @@\n+n\n' }, root).changes.map((c) => c.before), [null]);
});

test('an empty edits list beside a patch counts as not given', async () => {
  const root = folder({ 'a.md': 'one\ntwo\nthree\n' });
  const patch = '--- a/a.md\n+++ b/a.md\n@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n';
  const result = await run({ edits: [], patch }, root);
  assert.equal(result.success, true, result.error);
  assert.equal(result.files_changed, 1);
  assert.equal(read(root, 'a.md'), 'one\nTWO\nthree\n');

  const both = await run({ edits: [{ path: 'a.md', old_string: 'one', new_string: 'uno' }], patch }, root);
  assert.equal(both.success, false);
  assert.match(both.error, /not both/);
  assert.equal((await run({ edits: [] }, root)).success, false, 'nothing to do is an error, not "nothing changed"');
});

test('blank lines after a hunk end it, as far as its counts say', async () => {
  // A blank line after the diff, and blank lines between files, with and
  // without "diff --git" headers.
  const trailing = folder({ 'y.txt': 'one\ntwo\n' });
  const after = await run({ patch: '--- a/y.txt\n+++ b/y.txt\n@@ -1,2 +1,2 @@\n-one\n+ONE\n two\n\n' }, trailing);
  assert.equal(after.success, true, after.error);
  assert.equal(read(trailing, 'y.txt'), 'ONE\ntwo\n');

  for (const git of [false, true]) {
    const root = folder({ 'a.txt': 'one\ntwo\n', 'b.txt': 'red\nblue\n' });
    const header = (name) => (git ? [`diff --git a/${name} b/${name}`] : []);
    const patch = [
      ...header('a.txt'), '--- a/a.txt', '+++ b/a.txt', '@@ -1,2 +1,2 @@', '-one', '+ONE', ' two',
      '',
      ...header('b.txt'), '--- a/b.txt', '+++ b/b.txt', '@@ -1,2 +1,2 @@', ' red', '-blue', '+BLUE',
      '', '',
    ].join('\n');
    const result = await run({ patch }, root);
    assert.equal(result.success, true, `${git ? 'git' : 'plain'}: ${result.error}`);
    assert.equal(read(root, 'a.txt'), 'ONE\ntwo\n');
    assert.equal(read(root, 'b.txt'), 'red\nBLUE\n');
  }

  // An empty context line that lost its space is still context when the
  // counts include it, here before a blank line that separates the files.
  const hunk = parseUnifiedDiff('--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n\n\n--- a/z\n+++ b/z\n@@ -1 +1 @@\n-z\n+Z\n')[0].hunks[0];
  assert.deepEqual(hunk.lines.map((l) => l.type + l.text), [' a', '-b', '+B', ' ']);
  assert.equal(applyHunks('a\nb\n\nc\n', [hunk]), 'a\nB\n\nc\n');

  // Counts that are one too many: the blank line is dropped again when the
  // hunk only fits without it.
  const loose = parseUnifiedDiff('--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n\n')[0].hunks;
  assert.equal(applyHunks('a\nb\nc\n', loose), 'a\nB\nc\n');
});
