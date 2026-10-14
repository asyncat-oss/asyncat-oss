// den/src/agent/gitEnv.js
// The environment for git that den runs. A repository's own settings can name
// programs for git to run (core.fsmonitor, hooks, filter drivers), and a
// sandboxed command can write them: the sandbox keeps .git/config and hooks
// read-only (commandSandbox.js), but not in a repository the command starts
// itself. So git that den runs on its own, with nobody asking (the Code
// panel's status and diffs, checkpoints, copies, the agent's read-only git
// tools), runs none of those programs. A commit, push or pull that you or the
// agent ask for keeps hooks and filters, as in a terminal. fsmonitor is off
// for both: it only makes git faster.

import { spawnSync } from 'child_process';
import { childEnv } from './childEnv.js';

// For diffs: no external diff program and no textconv, both named in settings.
export const DIFF_SAFE = ['--no-ext-diff', '--no-textconv'];

// What `git lfs install --local` writes: kept, so LFS files don't all look changed.
const KNOWN_FILTERS = new Set(['git-lfs clean -- %f', 'git-lfs smudge -- %f', 'git-lfs filter-process']);
const FILTER_KEY = /^filter\..+\.(clean|smudge|process)$/i;
const REPO_SCOPES = new Set(['local', 'worktree']);

/**
 * The filter programs a repository's own settings name, from the output of
 * `git config --list --show-scope -z` (or, with `scoped: false`, of
 * `git config --local --list -z`): their keys.
 */
export function repoFilterKeys(text, { scoped = true } = {}) {
  const parts = String(text || '').split('\0');
  const keys = [];
  const step = scoped ? 2 : 1;
  for (let i = 0; i + step - 1 < parts.length; i += step) {
    if (scoped && !REPO_SCOPES.has(parts[i])) continue;
    const entry = parts[i + step - 1];
    const newline = entry.indexOf('\n');
    const key = newline === -1 ? entry : entry.slice(0, newline);
    const value = newline === -1 ? '' : entry.slice(newline + 1);
    if (FILTER_KEY.test(key) && !KNOWN_FILTERS.has(value.trim())) keys.push(key);
  }
  return [...new Set(keys)];
}

function readFilterKeys(cwd, env) {
  // Reading settings runs nothing.
  const read = (args) => spawnSync('git', ['config', ...args, '--list', '-z'], {
    cwd, env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  });
  const scoped = read(['--show-scope']);
  if (scoped.status === 0) return repoFilterKeys(scoped.stdout);
  // git before 2.26 has no --show-scope.
  const local = read(['--local', '--includes']);
  return local.status === 0 ? repoFilterKeys(local.stdout, { scoped: false }) : [];
}

/**
 * The environment for git in `cwd`: den's (without secrets, childEnv.js)
 * plus settings that win over the repository's. `asked`: a change you or the
 * agent asked for, which runs hooks and filters.
 */
export function gitEnv(cwd, { asked = false, source = process.env } = {}) {
  const env = childEnv({ source });
  const settings = [['core.fsmonitor', 'false']];
  if (!asked) {
    settings.push(['core.hooksPath', '/dev/null']);
    // An empty filter is no filter.
    for (const key of cwd ? readFilterKeys(cwd, env) : []) settings.push([key, '']);
  }
  // After any settings already passed this way (GIT_CONFIG_COUNT).
  const start = Number.parseInt(env.GIT_CONFIG_COUNT, 10) || 0;
  settings.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${start + index}`] = key;
    env[`GIT_CONFIG_VALUE_${start + index}`] = value;
  });
  env.GIT_CONFIG_COUNT = String(start + settings.length);
  return env;
}

export default gitEnv;
