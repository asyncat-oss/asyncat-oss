// den/src/agent/tools/gitTools.js
// ─── Git Tools ─────────────────────────────────────────────────────────────────
// Git operations for the agent: clone, pull, commit, push, branch, log, diff, status.

import { execSync } from 'child_process';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PermissionLevel } from './toolRegistry.js';

function runGit(cmd, cwd, timeout = 30000) {
  try {
    const output = execSync(cmd, { cwd, encoding: 'utf8', timeout, maxBuffer: 512 * 1024 });
    return { success: true, output: output.trim() };
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr?.toString() || '' };
  }
}

function runGitStream(cmd, cwd, timeout = 30000) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '';
    const proc = spawn('/bin/sh', ['-c', cmd], { cwd, shell: false });
    const timer = setTimeout(() => { proc.kill(); resolve({ success: false, error: `Timed out after ${timeout / 1000}s`, stdout, stderr }); }, timeout);
    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ success: code === 0, exit_code: code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    proc.on('error', err => resolve({ success: false, error: err.message }));
  });
}

export const gitCloneTool = {
  name: 'git_clone',
  description: 'Clone a git repository into the working directory.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Git repository URL (https:// or git@)' },
      destination: { type: 'string', description: 'Destination folder name (optional, defaults to repo name)' },
      branch: { type: 'string', description: 'Branch to clone (optional, defaults to default branch)' },
    },
    required: ['url'],
  },
  execute: async (args, context) => {
    const dest = args.destination || args.url.split('/').pop().replace('.git', '');
    const safeDest = dest.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const clonePath = path.join(context.workingDir, safeDest);
    const cmd = args.branch ? `git clone -b ${args.branch} --depth 1 "${args.url}" "${clonePath}"` : `git clone --depth 1 "${args.url}" "${clonePath}"`;
    const result = await runGitStream(cmd, context.workingDir, 120000);
    if (result.success) {
      return { success: true, url: args.url, cloned_to: safeDest, path: safeDest };
    }
    return { success: false, error: result.error || result.stderr };
  },
};

export const gitPullTool = {
  name: 'git_pull',
  description: 'Pull latest changes from the remote repository.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      remote: { type: 'string', description: 'Remote to pull from (default: origin)' },
      branch: { type: 'string', description: 'Branch to pull (default: current branch)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const remote = args.remote || 'origin';
    const branch = args.branch || '';
    const cmd = branch ? `git pull ${remote} ${branch}` : `git pull ${remote}`;
    const result = runGit(cmd, cwd);
    if (!result.success && result.error.includes('not a git')) {
      return { success: false, error: `Not a git repository: ${cwd}` };
    }
    return result;
  },
};

export const gitStatusTool = {
  name: 'git_status',
  description: 'Show the working tree status of the git repository. Shows modified, staged, untracked files and ahead/behind status.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      short: { type: 'boolean', description: 'Use short format (default: false)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const cmd = args.short ? 'git status -s' : 'git status';
    const result = runGit(cmd, cwd);
    if (!result.success && result.error.includes('not a git')) {
      return { success: false, error: `Not a git repository: ${cwd}` };
    }
    return { ...result, path: cwd };
  },
};

export const gitDiffTool = {
  name: 'git_diff',
  description: 'Show changes between commits, commit vs working tree, or staged vs working tree.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      staged: { type: 'boolean', description: 'Show staged changes (default: false)' },
      file: { type: 'string', description: 'Show diff for specific file (relative path)' },
      compare: { type: 'string', description: 'Compare against this commit ref instead of working tree' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    let cmd = 'git diff --no-color';
    if (args.staged) cmd += ' --cached';
    if (args.file) cmd += ` -- "${args.file}"`;
    else if (args.compare) cmd += ` ${args.compare}`;
    else cmd += ' HEAD';
    const result = runGit(cmd, cwd);
    if (!result.success && result.error.includes('not a git')) {
      return { success: false, error: `Not a git repository: ${cwd}` };
    }
    const output = result.output || '';
    const added = (output.match(/^\+[^+]/g) || []).length;
    const removed = (output.match(/^-[^-]/g) || []).length;
    return { ...result, additions: added, deletions: removed };
  },
};

export const gitLogTool = {
  name: 'git_log',
  description: 'Show commit history. Defaults to last 20 commits with graph, one-line format.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      limit: { type: 'number', description: 'Number of commits to show (default: 20)' },
      file: { type: 'string', description: 'Show commits affecting a specific file' },
      author: { type: 'string', description: 'Filter by author name/email' },
      since: { type: 'string', description: 'Show commits since this date (e.g. "1 week ago")' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const limit = args.limit || 20;
    let cmd = `git log --oneline --graph --decorate -n ${limit}`;
    if (args.file) cmd += ` -- "${args.file}"`;
    if (args.author) cmd += ` --author="${args.author}"`;
    if (args.since) cmd += ` --since="${args.since}"`;
    const result = runGit(cmd, cwd);
    if (!result.success && result.error.includes('not a git')) {
      return { success: false, error: `Not a git repository: ${cwd}` };
    }
    const lines = (result.output || '').split('\n').filter(Boolean);
    return { ...result, count: lines.length, commits: lines.join('\n') };
  },
};

export const gitBranchTool = {
  name: 'git_branch',
  description: 'List, create, or delete branches.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      list: { type: 'boolean', description: 'List all branches (default: true)' },
      create: { type: 'string', description: 'Create a new branch with this name' },
      delete: { type: 'string', description: 'Delete a branch by name' },
      switch: { type: 'string', description: 'Switch to a branch by name' },
      current: { type: 'boolean', description: 'Show current branch only' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    if (args.current) {
      const result = runGit('git branch --show-current', cwd);
      return { success: true, current_branch: result.output };
    }
    if (args.create) {
      const result = runGit(`git branch "${args.create}"`, cwd);
      return { ...result, created: args.create };
    }
    if (args.delete) {
      const result = runGit(`git branch -d "${args.delete}"`, cwd);
      return { ...result, deleted: args.delete };
    }
    if (args.switch) {
      const result = runGit(`git checkout "${args.switch}"`, cwd);
      return { ...result, switched_to: args.switch };
    }
    const result = runGit('git branch -a --format="%(HEAD) %(refname:short) -> %(upstream:short)"', cwd);
    if (!result.success && result.error.includes('not a git')) {
      return { success: false, error: `Not a git repository: ${cwd}` };
    }
    const branches = (result.output || '').split('\n').filter(Boolean);
    return { ...result, count: branches.length, branches: branches.join('\n') };
  },
};

export const gitCommitTool = {
  name: 'git_commit',
  description: 'Stage and commit files. Supports glob patterns for files to stage, or stage all changes with "all".',
  category: 'git',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      message: { type: 'string', description: 'Commit message' },
      files: { type: 'string', description: 'Files to stage (glob pattern, e.g. "*.js" or "." for all)' },
      amend: { type: 'boolean', description: 'Amend to the previous commit (default: false)' },
      all: { type: 'boolean', description: 'Stage all changed files automatically (default: false)' },
    },
    required: ['message'],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    try {
      if (args.all) {
        runGit('git add -A', cwd);
      } else if (args.files) {
        const files = args.files === '.' ? 'git add -A' : `git add "${args.files}"`;
        runGit(files, cwd);
      }
      let cmd = `git commit ${args.amend ? '--amend --no-edit' : `-m "${args.message}"`}`;
      const result = runGit(cmd, cwd);
      if (!result.success) {
        if (result.error.includes('nothing to commit')) return { success: true, message: 'Nothing to commit', changes: 0 };
        return result;
      }
      const hashResult = runGit('git log -1 --format="%H" --no-merges', cwd);
      return { ...result, commit: hashResult.output };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const gitPushTool = {
  name: 'git_push',
  description: 'Push commits to the remote repository.',
  category: 'git',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      remote: { type: 'string', description: 'Remote name (default: origin)' },
      branch: { type: 'string', description: 'Branch to push (default: current branch)' },
      set_upstream: { type: 'boolean', description: 'Set upstream tracking for the branch (default: false)' },
      force: { type: 'boolean', description: 'Force push (DANGEROUS — use with caution)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const remote = args.remote || 'origin';
    const branch = args.branch || '';
    let cmd = 'git push';
    if (args.force) cmd += ' --force';
    if (args.set_upstream || branch) cmd += ` -u ${remote} ${branch || 'HEAD'}`;
    else cmd += ` ${remote}`;
    const result = await runGitStream(cmd, cwd, 60000);
    if (!result.success) {
      if (result.error.includes('nothing to push')) return { success: true, message: 'Nothing to push — already up to date' };
      if (result.error.includes('rejected')) return { success: false, error: `Push rejected — remote has commits you don't have. Try git pull first.`, details: result.stderr };
      return { success: false, error: result.error, stderr: result.stderr };
    }
    return { success: true, pushed: `${remote}/${branch || '(current branch)'}` };
  },
};

export const gitStashTool = {
  name: 'git_stash',
  description: 'Stash changes temporarily, or pop them back. Useful when you need to pull but have uncommitted changes.',
  category: 'git',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      action: { type: 'string', enum: ['save', 'pop', 'list', 'drop', 'clear'], description: 'Action: save (stash), pop (apply + drop), list, drop, clear' },
      message: { type: 'string', description: 'Optional stash message for "save" action' },
    },
    required: ['action'],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    let cmd;
    switch (args.action) {
      case 'save': cmd = args.message ? `git stash push -m "${args.message}"` : 'git stash push'; break;
      case 'pop': cmd = 'git stash pop'; break;
      case 'list': cmd = 'git stash list'; break;
      case 'drop': cmd = 'git stash drop'; break;
      case 'clear': cmd = 'git stash clear'; break;
      default: return { success: false, error: `Unknown action: ${args.action}. Use: save, pop, list, drop, clear` };
    }
    const result = runGit(cmd, cwd);
    if (args.action === 'list') {
      const lines = (result.output || '').split('\n').filter(Boolean);
      return { ...result, count: lines.length, stashes: lines.join('\n') };
    }
    return result;
  },
};

export const gitRemoteTool = {
  name: 'git_remote',
  description: 'List, add, or remove git remote repositories.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      action: { type: 'string', enum: ['list', 'add', 'remove'], description: 'Action: list, add, or remove' },
      name: { type: 'string', description: 'Remote name (e.g. origin, upstream)' },
      url: { type: 'string', description: 'Remote URL (required for add action)' },
    },
    required: ['action'],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    if (args.action === 'list') {
      const result = runGit('git remote -v', cwd);
      const lines = (result.output || '').split('\n').filter(Boolean);
      const remotes = {};
      for (const line of lines) {
        const [name, url] = line.split(/\s+/);
        if (name) remotes[name] = url;
      }
      return { success: true, remotes };
    }
    if (args.action === 'add') {
      if (!args.name || !args.url) return { success: false, error: 'name and url required for add action' };
      const result = runGit(`git remote add ${args.name} "${args.url}"`, cwd);
      return { ...result, added: args.name, url: args.url };
    }
    if (args.action === 'remove') {
      if (!args.name) return { success: false, error: 'name required for remove action' };
      const result = runGit(`git remote remove ${args.name}`, cwd);
      return { ...result, removed: args.name };
    }
    return { success: false, error: `Unknown action: ${args.action}` };
  },
};

export const gitTools = [
  gitCloneTool, gitPullTool, gitStatusTool, gitDiffTool,
  gitLogTool, gitBranchTool, gitCommitTool, gitPushTool,
  gitStashTool, gitRemoteTool,
];
export default gitTools;
