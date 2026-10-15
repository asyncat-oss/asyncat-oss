import test from 'node:test';
import assert from 'node:assert/strict';
import { diffFilePath, emptyDiffNote, parseUnifiedDiff } from './diffParse.js';

const lines = (file) => file.hunks.flatMap((hunk) => hunk.lines.map((line) => `${line.type}:${line.oldLine ?? '-'}:${line.newLine ?? '-'}:${line.text}`));

test('a git diff of one file: numbered lines and counts', () => {
  const [file, ...rest] = parseUnifiedDiff([
    'diff --git a/src/plants.js b/src/plants.js',
    'index 1a2b3c4..5d6e7f8 100644',
    '--- a/src/plants.js',
    '+++ b/src/plants.js',
    '@@ -14,3 +14,4 @@ export class Planter {',
    '     this.size = size;',
    '-  }',
    '+  }',
    '+export const sizes = [];',
    ' }',
    '',
  ].join('\n'));
  assert.equal(rest.length, 0);
  assert.equal(file.oldPath, 'src/plants.js');
  assert.equal(file.newPath, 'src/plants.js');
  assert.equal(file.additions, 2);
  assert.equal(file.deletions, 1);
  assert.deepEqual(lines(file), [
    'ctx:14:14:    this.size = size;',
    'del:15:-:  }',
    'add:-:15:  }',
    'add:-:16:export const sizes = [];',
    'ctx:16:17:}',
  ]);
});

test("each file's header lines stay out of the file before it", () => {
  const files = parseUnifiedDiff([
    'diff --git a/a.txt b/a.txt',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    'diff --git a/b.txt b/b.txt',
    'new file mode 100644',
    'index 0000000..e69de29',
    '--- /dev/null',
    '+++ b/b.txt',
    '@@ -0,0 +1 @@',
    '+hello',
  ].join('\n'));
  assert.equal(files.length, 2);
  assert.deepEqual(lines(files[0]), ['del:1:-:old', 'add:-:1:new']);
  assert.equal(files[1].newPath, 'b.txt');
  assert.equal(files[1].created, true);
  assert.deepEqual(lines(files[1]), ['add:-:1:hello']);
});

test('a removed line that starts with "--" is still a line', () => {
  const [file] = parseUnifiedDiff([
    '--- a/schema.sql',
    '+++ b/schema.sql',
    '@@ -1,2 +1,1 @@',
    '--- the old table',
    ' create table plants (id int);',
  ].join('\n'));
  assert.equal(file.newPath, 'schema.sql');
  assert.deepEqual(lines(file), ['del:1:-:-- the old table', 'ctx:2:1:create table plants (id int);']);
});

test('a bare diff of hunks takes the given path', () => {
  const [file] = parseUnifiedDiff('@@ -3,2 +3,2 @@\n keep\n-drop\n+add\n', 'notes.md');
  assert.equal(diffFilePath(file), 'notes.md');
  assert.deepEqual(lines(file), ['ctx:3:3:keep', 'del:4:-:drop', 'add:-:4:add']);
});

test('binary, mode-only, moved and deleted files are named and say why they have no lines', () => {
  const [binary, mode, moved, gone] = parseUnifiedDiff([
    'diff --git a/img/tray.png b/img/tray.png',
    'new file mode 100644',
    'index 0000000000000000000000000000000000000000..1f2e3d4c',
    'GIT binary patch',
    'literal 68',
    'zcmeAS@N?(olHy`uVBq!ia0vp^j6lr8!2~2_e',
    '',
    'literal 0',
    'HcmV?d00001',
    '',
    'diff --git a/run.sh b/run.sh',
    'old mode 100644',
    'new mode 100755',
    'diff --git a/old/notes.md b/docs/notes.md',
    'similarity index 100%',
    'rename from old/notes.md',
    'rename to docs/notes.md',
    'diff --git a/src/sizes.js b/src/sizes.js',
    'deleted file mode 100644',
    'index 3b18e51..0000000',
    '--- a/src/sizes.js',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-export const sizes = [];',
  ].join('\n'));
  assert.equal(diffFilePath(binary), 'img/tray.png');
  assert.equal(binary.hunks.length, 0);
  assert.equal(emptyDiffNote(binary), 'Binary file, no text to compare.');
  assert.equal(diffFilePath(mode), 'run.sh');
  assert.equal(emptyDiffNote(mode), 'Only the file mode changed: it can run as a program now.');
  assert.equal(diffFilePath(moved), 'old/notes.md → docs/notes.md');
  assert.equal(emptyDiffNote(moved), 'Moved, with no other changes.');
  // A deleted file keeps its own name, not /dev/null.
  assert.equal(diffFilePath(gone), 'src/sizes.js');
  assert.equal(gone.removed, true);
  assert.deepEqual(lines(gone), ['del:1:-:export const sizes = [];']);
});

test('the other reasons a file has no lines', () => {
  assert.equal(emptyDiffNote({ oldMode: '100755', newMode: '100644' }), 'Only the file mode changed: it no longer runs as a program.');
  assert.equal(emptyDiffNote({ oldMode: '100644', newMode: '120000' }), 'Only the file mode changed (100644 → 120000).');
  assert.equal(emptyDiffNote({ created: true }), 'New empty file.');
  assert.equal(emptyDiffNote({ removed: true }), 'Deleted an empty file.');
  assert.equal(emptyDiffNote({}), 'No text changes.');
  // git diff without --binary just says the files differ.
  const [plain] = parseUnifiedDiff('diff --git a/x.bin b/x.bin\nindex 1a2b3c4..5d6e7f8 100644\nBinary files a/x.bin and b/x.bin differ\n');
  assert.equal(emptyDiffNote(plain), 'Binary file, no text to compare.');
});

test('a diff without a/ and b/ prefixes, and empty input', () => {
  const [file] = parseUnifiedDiff('diff --git src/a.js src/a.js\nold mode 100644\nnew mode 100755\n');
  assert.equal(diffFilePath(file), 'src/a.js');
  assert.deepEqual(parseUnifiedDiff(''), []);
  assert.deepEqual(parseUnifiedDiff(null), []);
});
