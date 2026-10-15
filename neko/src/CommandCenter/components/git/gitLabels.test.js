import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmLabel, diffDescription, refChip, rowRefs, statusMeta } from './gitLabels.js';

test('a changed file shows one letter, in a status tone', () => {
  assert.deepEqual(statusMeta({ untracked: true }), { label: 'U', title: 'Untracked', tone: 'added' });
  assert.deepEqual(statusMeta({ renamed: true, staged: true }), { label: 'R', title: 'Renamed', tone: 'renamed' });
  assert.deepEqual(statusMeta({ deleted: true }), { label: 'D', title: 'Deleted', tone: 'deleted' });
  assert.deepEqual(statusMeta({ staged: true }), { label: 'S', title: 'Staged', tone: 'added' });
  // Staged and changed again since: still modified.
  assert.equal(statusMeta({ staged: true, unstaged: true }).label, 'M');
  assert.equal(statusMeta({}).tone, 'modified');
});

test('the confirm button names the action', () => {
  assert.equal(confirmLabel('discard'), 'Discard');
  assert.equal(confirmLabel('stage-commit-push'), 'Commit and push');
  assert.equal(confirmLabel('branch-switch'), 'Switch');
  assert.equal(confirmLabel('something-new'), 'Confirm');
});

test('refs become chips: the checked-out branch, tags and other branches', () => {
  assert.deepEqual(refChip('HEAD -> main'), { label: 'main', kind: 'current' });
  assert.deepEqual(refChip('tag: v0.1'), { label: 'v0.1', kind: 'tag' });
  assert.deepEqual(refChip('origin/main'), { label: 'main', kind: 'branch' });
  assert.deepEqual(refChip('feature/seed-tray'), { label: 'feature/seed-tray', kind: 'branch' });
  assert.deepEqual(refChip('refs/stash'), { label: 'stash', kind: 'branch' });
});

test('a commit row shows one ref chip, the checked-out branch first, and counts the rest', () => {
  assert.deepEqual(rowRefs([]), { shown: null, rest: [] });
  assert.deepEqual(rowRefs(['tag: v0.1']), { shown: { label: 'v0.1', kind: 'tag' }, rest: [] });
  const row = rowRefs(['origin/main', 'tag: v0.2', 'HEAD -> main', 'feature/seed-tray']);
  assert.deepEqual(row.shown, { label: 'main', kind: 'current' });
  // origin/main reads "main" too, so it isn't counted again.
  assert.deepEqual(row.rest.map((chip) => chip.label), ['v0.2', 'feature/seed-tray']);
  assert.deepEqual(rowRefs(['', 'origin/']).shown, null);
});

test('the diff dialog says where the file is and which changes it shows', () => {
  assert.equal(diffDescription('src/schedule.js'), 'src · Changes not staged yet');
  assert.equal(diffDescription('src/lib/plants.js', { staged: true }), 'src/lib · Staged changes');
  assert.equal(diffDescription('README.md', { compare: '392cbc12ce87e5' }), 'In commit 392cbc1');
});
