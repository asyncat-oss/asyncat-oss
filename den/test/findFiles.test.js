import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// find_files matches globs that come from the model, so the matcher must
// stay fast on any pattern: one slow match would hold up all of den.

const { globMatcher, findFilesTool } = await import('../src/agent/tools/fileTools.js');

const matches = (glob, text) => globMatcher(glob).test(text);

test('globs: * and ? stay in a folder, ** crosses folders, {} and [] pick', () => {
  assert.equal(matches('*.py', 'tool.py'), true);
  assert.equal(matches('*.py', 'src/tool.py'), false);
  assert.equal(matches('?.md', 'a.md'), true);
  assert.equal(matches('?.md', '/.md'), false);
  assert.equal(matches('src/**/*.ts', 'src/shed.ts'), true);
  assert.equal(matches('src/**/*.ts', 'src/beds/roses.ts'), true);
  assert.equal(matches('src/**/*.ts', 'notes.ts'), false);
  assert.equal(matches('src/**', 'src/beds/roses.ts'), true);
  assert.equal(matches('*.{js,jsx}', 'App.jsx'), true);
  assert.equal(matches('*.{js,jsx}', 'App.ts'), false);
  assert.equal(matches('{a,b{c,d}}.txt', 'bd.txt'), true);
  assert.equal(matches('{a,b{c,d}}.txt', 'b.txt'), false);
  assert.equal(matches('a{b', 'a{b'), true);
  assert.equal(matches('file[0-9].log', 'file7.log'), true);
  assert.equal(matches('file[!0-9].log', 'file7.log'), false);
  assert.equal(matches('file[!0-9].log', 'filex.log'), true);
  assert.equal(matches('[]x]', ']'), true);
  assert.equal(matches('a[bc', 'a[bc'), true);
});

test('patterns that make a RegExp backtrack still match at once', () => {
  const timed = (glob, text) => {
    const started = performance.now();
    const result = matches(glob, text);
    return { result, ms: performance.now() - started };
  };
  const stars = timed('*a*a*a*a*a*a*a*a*b', 'a'.repeat(40));
  assert.equal(stars.result, false);
  assert.ok(stars.ms < 50, `*a*a… took ${stars.ms} ms`);
  const folders = timed('**/**/**/**/**/**/**/zz', 'x/'.repeat(48));
  assert.equal(folders.result, false);
  assert.ok(folders.ms < 50, `**/**/… took ${folders.ms} ms`);
});

test('find_files refuses patterns that are too long or make too many choices', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-find-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), '');
    const long = await findFilesTool.execute({ pattern: `${'a'.repeat(400)}*` }, { workingDir: dir });
    assert.equal(long.success, false);
    assert.match(long.error, /up to 300 characters/);
    const choices = await findFilesTool.execute({ pattern: '{a,b}'.repeat(6) }, { workingDir: dir });
    assert.equal(choices.success, false);
    assert.match(choices.error, /up to 32 patterns/);
    const found = await findFilesTool.execute({ pattern: '*a*a*a*a*a*a*a*a*.txt' }, { workingDir: dir });
    assert.equal(found.success, true);
    assert.equal(found.count, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
