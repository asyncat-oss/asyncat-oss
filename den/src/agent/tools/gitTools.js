// den/src/agent/tools/gitTools.js
// ─── Git Tools ─────────────────────────────────────────────────────────────────
// Git operations for the agent: clone, pull, commit, push, branch, log, diff, status.

import { execSync } from 'child_process';
import { spawn } from 'child_process';
import path from 'path';
import { PermissionLevel } from './toolRegistry.js';
import { branchGit, commitGit, getGitDiff, getGitState, pullGit, pushGit, stashGit } from '../gitService.js';
import { IS_WIN } from './shared.js';

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
    const [sh, shFlag] = IS_WIN ? ['cmd.exe', '/c'] : ['/bin/sh', '-c'];
    const proc = spawn(sh, [shFlag, cmd], { cwd, shell: false });
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
  permission: PermissionLevel.MODERATE,
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
  permission: PermissionLevel.MODERATE,
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
    return pullGit(args.path || context.workingDir, { remote: args.remote || null, branch: args.branch || null });
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
    const state = getGitState(args.path || context.workingDir);
    if (!state.detected) return { success: false, error: state.reason || 'Not a git repository.' };
    return {
      ...state,
      output: args.short
        ? state.changes.all.map(file => `${file.code} ${file.path}`).join('\n')
        : `${state.branch || 'detached'}${state.clean ? ' clean' : ` ${state.changedCount} changed file(s)`}`,
    };
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
    if (args.compare) {
      const cwd = args.path || context.workingDir;
      const result = runGit(`git diff --no-color ${args.compare}${args.file ? ` -- "${args.file}"` : ''}`, cwd);
      const output = result.output || '';
      const added = (output.match(/^\+[^+]/gm) || []).length;
      const removed = (output.match(/^-[^-]/gm) || []).length;
      return { ...result, additions: added, deletions: removed };
    }
    const result = getGitDiff(args.path || context.workingDir, { file: args.file || null, staged: args.staged === true });
    return { ...result, output: result.diff, additions: result.additions, deletions: result.deletions };
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
  permission: PermissionLevel.MODERATE,
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
      return branchGit(cwd, { action: 'create', name: args.create });
    }
    if (args.delete) {
      const result = runGit(`git branch -d "${args.delete}"`, cwd);
      return { ...result, deleted: args.delete };
    }
    if (args.switch) {
      return branchGit(cwd, { action: 'switch', name: args.switch });
    }
    const result = branchGit(cwd, { action: 'list' });
    return { ...result, count: result.branches?.length || 0, branches: (result.branches || []).join('\n') };
  },
};

export const reviewChangesTool = {
  name: 'review_changes',
  description: 'Review uncommitted changes before committing. Returns a per-file summary plus automated flags for risky patterns (leftover debug/print statements, TODO/FIXME markers, possible hard-coded secrets, unresolved merge markers, unusually large deletions). Call this before git_commit so issues are caught instead of shipped.',
  category: 'git',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to git repo (default: working directory)' },
      staged: { type: 'boolean', description: 'Review only staged changes (default: false — reviews all working-tree changes)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const state = getGitState(cwd);
    if (!state.detected) return { success: false, error: state.reason || 'Not a git repository.' };

    const diffRes = getGitDiff(cwd, { staged: args.staged === true });
    const diff = diffRes.diff || diffRes.output || '';
    const addedText = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
    const removedCount = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length;

    const flags = [];
    const flag = (re, msg) => { if (re.test(addedText)) flags.push(msg); };
    flag(/\bconsole\.(log|debug|trace)\b|\bdebugger\b|\bprint\(|\bconsole\.dir\b/, 'Debug/print statements added');
    flag(/\b(TODO|FIXME|XXX|HACK)\b/, 'TODO/FIXME/HACK markers added');
    flag(/(api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i, 'Possible hard-coded secret/credential');
    flag(/^\+\s*(<<<<<<<|>>>>>>>|=======)\s*$/m, 'Unresolved merge conflict markers');
    if (removedCount > 200) flags.push(`Large deletion (${removedCount} lines removed) — confirm this is intended`);

    return {
      success: true,
      branch: state.branch || null,
      changed_files: state.changedCount,
      files: (state.changes?.all || []).map(f => ({ path: f.path, code: f.code })),
      additions: diffRes.additions ?? null,
      deletions: diffRes.deletions ?? null,
      flags: flags.length ? flags : ['No risky patterns detected'],
      review_passed: flags.length === 0,
      diff_preview: diff.slice(0, 4000),
      note: flags.length
        ? 'Address the flagged items (or confirm they are intentional) before calling git_commit.'
        : 'No automated concerns found. Safe to git_commit.',
    };
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
    if (args.amend) {
      const cwd = args.path || context.workingDir;
      return runGit('git commit --amend --no-edit', cwd);
    }
    const files = args.all || args.files === '.' ? [] : args.files ? [args.files] : [];
    return commitGit(args.path || context.workingDir, { message: args.message, files });
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
    if (args.force) return { success: false, error: 'Force push is not available through this tool.' };
    return pushGit(args.path || context.workingDir, {
      remote: args.remote || 'origin',
      branch: args.branch || null,
      setUpstream: args.set_upstream === true,
    });
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
    if (args.action === 'drop') return runGit('git stash drop', cwd);
    if (args.action === 'clear') return { success: false, error: 'Stash clear is destructive and not available through this tool.' };
    const result = stashGit(cwd, { action: args.action, message: args.message || null });
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
  permission: PermissionLevel.MODERATE,
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
  gitLogTool, gitBranchTool, reviewChangesTool, gitCommitTool, gitPushTool,
  gitStashTool, gitRemoteTool,
];
export default gitTools;
