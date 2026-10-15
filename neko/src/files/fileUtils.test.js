import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileIconMeta } from './fileUtils.js';

const EXTENSIONS = ['js', 'ts', 'tsx', 'vue', 'rs', 'go', 'py', 'java', 'pdf', 'csv', 'md', 'json', 'css', 'sh', 'png', 'mp3', 'mp4', 'zip', 'c', 'html', 'xyz', ''];

test('every file icon is the one neutral colour', () => {
  for (const ext of EXTENSIONS) assert.equal(fileIconMeta(ext).color, 'text-fg-subtle', ext);
  assert.equal(fileIconMeta('', 'dir').color, 'text-fg-subtle');
});

test('a language label is the same component every time', () => {
  assert.equal(fileIconMeta('py').Icon, fileIconMeta('PY').Icon);
  assert.notEqual(fileIconMeta('py').Icon, fileIconMeta('js').Icon);
});
