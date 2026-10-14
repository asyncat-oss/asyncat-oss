// den/src/agent/gitEnv.js
// The environment for git that den runs. A repository's own settings can name
// programs for git to run (core.fsmonitor, hooks, filter and diff drivers,
// gpg for signatures, pagers, credential helpers…), and a sandboxed command
// can write them: the sandbox keeps .git/config and hooks read-only
// (commandSandbox.js), but not in a repository the command starts itself,
// such as one nested in the project. So git that den runs on its own, with
// nobody asking (the Code panel's status and diffs, checkpoints, copies, the
// agent's read-only git tools, codebase_metrics), runs none of those
// programs, in that repository or in its submodules. A commit, push or pull
// that you or the agent ask for keeps hooks and filters, as in a terminal.
// fsmonitor is off for both: it only makes git faster.

import { spawnSync } from 'child_process';
import { childEnv } from './childEnv.js';

// For diffs: no external diff program and no textconv, both named in
// settings, and no look inside submodules (git status there would run their
// own settings' programs, which aren't overridden here).
export const DIFF_SAFE = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=dirty'];
// For status, the same about submodules.
export const STATUS_SAFE = ['--ignore-submodules=dirty'];

// What `git lfs install --local` writes: kept, so LFS files don't all look changed.
const KNOWN_FILTERS = new Set(['git-lfs clean -- %f', 'git-lfs smudge -- %f', 'git-lfs filter-process']);
const FILTER_KEY = /^filter\..+\.(clean|smudge|process)$/i;
// Settings that name a program for git to run. Set to empty they name none:
// git runs no filter, pager or askpass for an empty one, an empty
// credential.helper drops the helpers before it, and the others fail to
// start instead of running something.
const PROGRAM_KEYS = [
  FILTER_KEY,
  /^diff\..+\.(textconv|command)$/i,
  /^diff\.external$/i,
  /^merge\..+\.driver$/i,
  /^gpg(\..+)?\.program$/i,
  /^gpg\.ssh\.defaultkeycommand$/i,
  /^core\.(sshcommand|askpass|pager|editor|alternaterefscommand)$/i,
  /^sequence\.editor$/i,
  /^pager\..+$/i,
  /^credential(\..+)?\.helper$/i,
  /^remote\..+\.(uploadpack|receivepack)$/i,
];
// Hooks named in settings (hook.<name>.command, in newer git) run whatever
// core.hooksPath says, so each is switched off by name.
const HOOK_KEY = /^hook\.(.+)\.(command|event)$/i;
// git takes the first core.gitProxy it finds, so that one is turned off
// through its variable instead.
const GIT_PROXY = /^core\.gitproxy$/i;
// Always, for git nobody asked for: no signature checks (they run gpg), no
// ext:: remotes (a command line), and no git run inside submodules for
// diffs or checkouts.
const UNASKED_SETTINGS = [
  ['log.showSignature', 'false'],
  ['protocol.ext.allow', 'never'],
  ['diff.submodule', 'short'],
  ['submodule.recurse', 'false'],
];
const REPO_SCOPES = new Set(['local', 'worktree']);

/**
 * The settings in a repository's own config that name programs, from the
 * output of `git config --list --show-scope -z` (or, with `scoped: false`, of
 * `git config --local --list -z`): their keys. git-lfs's filters are kept.
 */
export function repoProgramKeys(text, { scoped = true } = {}) {
  const parts = String(text || '').split('\0');
  const keys = [];
  const step = scoped ? 2 : 1;
  for (let i = 0; i + step - 1 < parts.length; i += step) {
    if (scoped && !REPO_SCOPES.has(parts[i])) continue;
    const entry = parts[i + step - 1];
    const newline = entry.indexOf('\n');
    const key = newline === -1 ? entry : entry.slice(0, newline);
    const value = newline === -1 ? '' : entry.slice(newline + 1);
    if (FILTER_KEY.test(key) && KNOWN_FILTERS.has(value.trim())) continue;
    if (HOOK_KEY.test(key) || GIT_PROXY.test(key) || PROGRAM_KEYS.some((pattern) => pattern.test(key))) keys.push(key);
  }
  return [...new Set(keys)];
}

function readProgramKeys(cwd, env) {
  // Reading settings runs nothing.
  const read = (args) => spawnSync('git', ['config', ...args, '--list', '-z'], {
    cwd, env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  });
  const scoped = read(['--show-scope']);
  if (scoped.status === 0) return repoProgramKeys(scoped.stdout);
  // git before 2.26 has no --show-scope.
  const local = read(['--local', '--includes']);
  return local.status === 0 ? repoProgramKeys(local.stdout, { scoped: false }) : [];
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
    settings.push(['core.hooksPath', '/dev/null'], ...UNASKED_SETTINGS);
    const seen = new Set();
    for (const key of cwd ? readProgramKeys(cwd, env) : []) {
      const hook = HOOK_KEY.exec(key);
      const setting = hook ? [`hook.${hook[1]}.enabled`, 'false'] : [key, ''];
      if (GIT_PROXY.test(key)) env.GIT_PROXY_COMMAND = '';
      else if (!seen.has(setting[0])) {
        seen.add(setting[0]);
        settings.push(setting);
      }
    }
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
