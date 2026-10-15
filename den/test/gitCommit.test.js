// git_commit with all: true, or files: ".", commits every change, new files
// included; without them only what is staged (or the files named) goes in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { childEnv } from '../src/agent/childEnv.js';
import { gitCommitTool } from '../src/agent/tools/gitTools.js';
import { hasBin } from '../src/agent/tools/shared.js';

const noGit = !hasBin('git') && 'git is not installed';

const IDENTITY = {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Demo', GIT_AUTHOR_EMAIL: 'demo@example.com', GIT_COMMITTER_NAME: 'Demo', GIT_COMMITTER_EMAIL: 'demo@example.com',
};
const saved = {};
for (const [name, value] of Object.entries(IDENTITY)) {
  saved[name] = process.env[name];
  process.env[name] = value;
}
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-git-commit-')));
test.after(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', env: childEnv() });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout;
}

// A repository with one commit, then a changed file and a new one.
function repoWithChanges(name) {
  const project = path.join(root, name);
  fs.mkdirSync(path.join(project, 'src'), { recursive: true });
  git(project, 'init', '-q');
  fs.writeFileSync(path.join(project, 'readme.txt'), 'one\n');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'first');
  fs.writeFileSync(path.join(project, 'readme.txt'), 'two\n');
  fs.writeFileSync(path.join(project, 'src', 'new.js'), 'export {};\n');
  return project;
}

const committedFiles = (project) => git(project, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort();

for (const [label, args] of [['all: true', { all: true }], ['files: "."', { files: '.' }], ['all: "true"', { all: 'true' }]]) {
  test(`git_commit with ${label} commits every change, new files too`, { skip: noGit }, async () => {
    const project = repoWithChanges(`all-${label.replace(/\W+/g, '-')}`);
    const result = await gitCommitTool.execute({ ...args, message: 'everything' }, { workingDir: project });
    assert.equal(result.success, true, result.error || result.stderr);
    assert.equal(result.all, true);
    assert.deepEqual(committedFiles(project), ['readme.txt', 'src/new.js']);
    assert.equal(git(project, 'status', '--porcelain'), '', 'nothing is left over');
  });
}

test('git_commit with one file commits only that file', { skip: noGit }, async () => {
  const project = repoWithChanges('one-file');
  const result = await gitCommitTool.execute({ files: 'src/new.js', message: 'just the new file' }, { workingDir: project });
  assert.equal(result.success, true, result.error || result.stderr);
  assert.deepEqual(committedFiles(project), ['src/new.js']);
  assert.match(git(project, 'status', '--porcelain'), /readme\.txt/);
});

test('git_commit with nothing staged and no files says so', { skip: noGit }, async () => {
  const project = repoWithChanges('nothing-staged');
  const result = await gitCommitTool.execute({ message: 'nothing' }, { workingDir: project });
  assert.equal(result.success, false);
  assert.equal(git(project, 'log', '--format=%s').trim(), 'first');
});
