// A sandboxed command must not get a program run outside the sandbox through
// git: by setting core.fsmonitor, a hook or a filter in the project's git
// settings, which den's own git (the Code panel, checkpoints, copies) would
// then run. The sandbox keeps those settings read-only, and den's own git runs
// none of a repository's programs unless someone asked for the change.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { bwrapArgs, gitDirsOf, gitGuards, sandboxAvailable, sandboxedCommand, seatbeltProfile } from '../src/agent/commandSandbox.js';
import { gitEnv, repoFilterKeys } from '../src/agent/gitEnv.js';
import { childEnv } from '../src/agent/childEnv.js';
import { getGitState, getGitDiff } from '../src/agent/gitService.js';
import { hasBin } from '../src/agent/tools/shared.js';

const noGit = !hasBin('git') && 'git is not installed';
const noBwrap = (process.platform !== 'linux' || !sandboxAvailable() || !hasBin('git')) && "bwrap or git can't run on this computer";

function git(cwd, ...args) {
  const res = spawnSync('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', ...args], { cwd, encoding: 'utf8', env: childEnv() });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout;
}

function scratchDir(name) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-${name}-`)));
}

test('the git folders of a project: its own, a worktree\'s shared one, and submodules\'', () => {
  const root = scratchDir('gitdirs');
  try {
    const project = path.join(root, 'project');
    for (const dir of ['.git/hooks', '.git/modules/lib/hooks', '.git/modules/group/inner/hooks']) fs.mkdirSync(path.join(project, dir), { recursive: true });
    for (const dir of ['.git', '.git/modules/lib', '.git/modules/group/inner']) {
      fs.writeFileSync(path.join(project, dir, 'HEAD'), 'ref: refs/heads/main\n');
      fs.writeFileSync(path.join(project, dir, 'config'), '[core]\n');
    }
    const dotGit = path.join(project, '.git');
    assert.deepEqual(gitDirsOf(project).sort(), [dotGit, path.join(dotGit, 'modules/group/inner'), path.join(dotGit, 'modules/lib')].sort());

    // A worktree elsewhere: its .git file leads to its folder and the shared one.
    const worktree = path.join(root, 'worktree');
    fs.mkdirSync(path.join(dotGit, 'worktrees', 'w'), { recursive: true });
    fs.writeFileSync(path.join(dotGit, 'worktrees', 'w', 'commondir'), '../..\n');
    fs.mkdirSync(worktree);
    fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(dotGit, 'worktrees', 'w')}\n`);
    const dirs = gitDirsOf(worktree);
    assert.ok(dirs.includes(path.join(dotGit, 'worktrees', 'w')));
    assert.ok(dirs.includes(dotGit));

    // Only folders the command could change need guarding.
    const guards = gitGuards({ workspaceRoot: worktree, roots: [worktree, '/tmp-elsewhere'] });
    assert.deepEqual(guards.gitDirs, [], 'the shared folder is outside the writable folders, so already read-only');
    const own = gitGuards({ workspaceRoot: project, roots: [project] });
    assert.ok(own.gitDirs.includes(dotGit));
    assert.ok(own.readOnly.includes(path.join(dotGit, 'config')));
    assert.ok(own.readOnly.includes(path.join(dotGit, 'hooks')));
    assert.ok(own.readOnly.includes(path.join(dotGit, 'modules/lib/config')));
    assert.ok(!own.readOnly.includes(path.join(dotGit, 'config.worktree')), 'only what exists');
    assert.deepEqual(gitDirsOf(path.join(root, 'none')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bwrap pins the git folder and keeps its settings and hooks read-only, after the writable folders', () => {
  const args = bwrapArgs({
    file: 'true', args: [], workspaceRoot: '/work/p', roots: ['/work/p', '/tmp'], hidden: [],
    git: { gitDirs: ['/work/p/.git'], readOnly: ['/work/p/.git/config', '/work/p/.git/hooks'] },
    inspect: () => ({ kind: null }),
  });
  const text = args.join(' ');
  assert.ok(text.indexOf('--bind /work/p/.git /work/p/.git') > text.indexOf('--bind-try /work/p /work/p'));
  assert.ok(text.indexOf('--ro-bind /work/p/.git/config /work/p/.git/config') > text.indexOf('--bind /work/p/.git /work/p/.git'));
  assert.match(text, /--ro-bind \/work\/p\/\.git\/hooks \/work\/p\/\.git\/hooks/);

  const profile = seatbeltProfile({ roots: ['/Users/me/p'], hidden: [], gitDirs: ['/Users/me/p/.git'] });
  assert.match(profile, /\(deny file-write\* \(literal "\/Users\/me\/p\/\.git"\) \(literal "\/Users\/me\/p\/\.git\/config"\) \(literal "\/Users\/me\/p\/\.git\/config\.worktree"\) \(literal "\/Users\/me\/p\/\.git\/commondir"\) \(subpath "\/Users\/me\/p\/\.git\/hooks"\)\)/);
  assert.ok(profile.indexOf('(deny file-write* (literal "/Users/me/p/.git")') > profile.indexOf('(allow file-write* (subpath "/Users/me/p")'));
});

test("a repository's own filter programs are found, git-lfs's are kept", () => {
  const scoped = [
    'global', 'filter.lfs.clean\ngit-lfs clean -- %f',
    'local', 'filter.lfs.smudge\ngit-lfs smudge -- %f',
    'local', 'filter.evil.clean\nsh -c "touch /tmp/x"',
    'worktree', 'filter.Odd.Name.process\nrun-me',
    'local', 'core.bare\nfalse',
    'global', 'filter.mine.clean\ntrusted-tool',
    '',
  ].join('\0');
  assert.deepEqual(repoFilterKeys(scoped), ['filter.evil.clean', 'filter.Odd.Name.process']);
  assert.deepEqual(repoFilterKeys('filter.x.smudge\nevil\0core.bare\nfalse\0', { scoped: false }), ['filter.x.smudge']);

  const env = gitEnv(null, { source: { PATH: '/bin', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'Demo', OPENAI_API_KEY: 'sk-demo' } });
  assert.equal(env.GIT_CONFIG_COUNT, '3', 'after the settings already passed');
  assert.equal(env.GIT_CONFIG_KEY_0, 'user.name');
  assert.equal(env.GIT_CONFIG_KEY_1, 'core.fsmonitor');
  assert.equal(env.GIT_CONFIG_KEY_2, 'core.hooksPath');
  assert.equal(env.OPENAI_API_KEY, undefined, 'without secrets');
  const asked = gitEnv(null, { asked: true, source: { PATH: '/bin' } });
  assert.equal(asked.GIT_CONFIG_COUNT, '1', 'a commit someone asked for keeps its hooks');
});

// What a command could do in a project that wasn't a repository yet (where
// nothing of .git is read-only): start one, with programs in its settings.
test("den's own git runs none of a repository's programs", { skip: noGit }, () => {
  const root = scratchDir('git-planted');
  const project = path.join(root, 'project');
  const marker = (name) => path.join(root, `ran-${name}`);
  try {
    fs.mkdirSync(project);
    git(project, 'init', '-q');
    fs.writeFileSync(path.join(project, 'notes.txt'), 'one\n');
    git(project, 'add', 'notes.txt');
    git(project, 'commit', '-qm', 'start');
    git(project, 'config', 'core.fsmonitor', `touch '${marker('fsmonitor')}'; false`);
    git(project, 'config', 'filter.demo.clean', `sh -c "touch '${marker('filter')}'; cat"`);
    git(project, 'config', 'diff.external', `sh -c "touch '${marker('diff')}'"`);
    fs.writeFileSync(path.join(project, '.git', 'hooks', 'post-index-change'), `#!/bin/sh\ntouch '${marker('hook')}'\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(project, '.gitattributes'), '* filter=demo\n');
    fs.writeFileSync(path.join(project, 'notes.txt'), 'two\n'); // same size: git must read it

    const state = getGitState(project);
    assert.equal(state.detected, true);
    assert.ok(state.changes.all.some((file) => file.path === 'notes.txt'));
    const diff = getGitDiff(project, { file: 'notes.txt' });
    assert.match(diff.diff, /\+two/);
    for (const name of ['fsmonitor', 'filter', 'diff', 'hook']) assert.equal(fs.existsSync(marker(name)), false, `${name} ran`);

    // Plain git does run them: the test plants what it means to.
    spawnSync('git', ['status', '--porcelain'], { cwd: project, env: childEnv() });
    assert.ok(fs.existsSync(marker('fsmonitor')) || fs.existsSync(marker('filter')), 'the planted programs work');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("in the sandbox a command can't change git's settings or hooks, but git still works", { skip: noBwrap }, () => {
  const root = scratchDir('git-sandbox');
  const project = path.join(root, 'project');
  try {
    fs.mkdirSync(project);
    git(project, 'init', '-q');
    fs.writeFileSync(path.join(project, 'a.txt'), 'a\n');
    const script = [
      'git config core.fsmonitor "touch planted" 2>/dev/null; echo "config:$?"',
      'echo "#!/bin/sh" > .git/hooks/post-checkout 2>/dev/null; echo "hook:$?"',
      'mv .git .git-old 2>/dev/null; echo "rename:$?"',
      'git add a.txt && git -c user.name=Demo -c user.email=demo@example.com commit -qm one && echo commit:ok',
    ].join('; ');
    const plan = sandboxedCommand({ file: '/bin/sh', args: ['-c', script], workspaceRoot: project });
    assert.equal(plan.sandboxed, true);
    const out = spawnSync(plan.file, plan.args, { cwd: project, encoding: 'utf8', env: childEnv() }).stdout;
    assert.match(out, /config:[1-9]/);
    assert.match(out, /hook:[1-9]/);
    assert.match(out, /rename:[1-9]/);
    assert.match(out, /commit:ok/, 'commits still work in the sandbox');
    assert.doesNotMatch(fs.readFileSync(path.join(project, '.git', 'config'), 'utf8'), /fsmonitor/);
    assert.equal(fs.existsSync(path.join(project, '.git', 'hooks', 'post-checkout')), false);
    assert.ok(fs.existsSync(path.join(project, '.git', 'HEAD')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
