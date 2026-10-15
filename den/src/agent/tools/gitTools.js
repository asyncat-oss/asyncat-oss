// den/src/agent/tools/gitTools.js
// ─── Git Tools ─────────────────────────────────────────────────────────────────
// Git operations for the agent: clone, pull, commit, push, branch, log, diff, status.

import { spawn } from 'child_process';
import { DIFF_SAFE, agentGitEnv, gitEnv } from '../gitEnv.js';
import path from 'path';
import { PermissionLevel } from './toolRegistry.js';
import { branchGit, commitGit, getGitDiff, getGitState, pullGit, pushGit, stashGit } from '../gitService.js';
import { clampInt, runFile, safePath } from './shared.js';

// Git runs with an argument list, never through a shell: refs, file names,
// URLs and messages all come from the model. `asked`: a change the agent asked
// for in the project `workspaceRoot`, which runs the repository's hooks and
// programs that its sandboxed commands can't have written (agentGitPolicy);
// reads run none of them (gitEnv.js).
function runGit(argv, cwd, { asked = false, timeout = 30000, workspaceRoot = null } = {}) {
  const agent = asked ? agentGitEnv(cwd, workspaceRoot) : null;
  const res = runFile('git', argv, { cwd, timeout, env: agent ? agent.env : gitEnv(cwd) });
  const note = agent?.note ? { note: agent.note } : {};
  if (res.ok) return { success: true, output: res.stdout.trim(), ...note };
  return { success: false, error: res.error, stderr: res.stderr, ...note };
}

function runGitStream(argv, cwd, timeout = 30000) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '';
    const proc = spawn('git', argv, { cwd, env: gitEnv(null, { asked: true }), shell: false, windowsHide: true });
    const timer = setTimeout(() => { proc.kill(); resolve({ success: false, error: `Timed out after ${timeout / 1000}s`, stdout, stderr }); }, timeout);
    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ success: code === 0, exit_code: code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    proc.on('error', err => { clearTimeout(timer); resolve({ success: false, error: err.message }); });
  });
}

/** The repository folder: the project folder or a folder inside it. */
function repoDir(args, context) {
  return args.path ? safePath(args.path, context.workingDir) : context.workingDir;
}

/** A ref, branch or remote name; never something git would read as an option. */
function gitName(value, label) {
  const text = String(value ?? '').trim();
  if (!text || text.startsWith('-') || /[\s\0]/.test(text)) {
    throw new Error(`${label} must be a plain name, not "${text}".`);
  }
  return text;
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
    const url = String(args.url ?? '').trim();
    // ext:: and file:: transports run programs; - would be read as an option.
    if (!/^(https?:\/\/|ssh:\/\/|git@[\w.-]+:)/i.test(url)) {
      return { success: false, error: 'Only https://, ssh:// or git@host: repository URLs can be cloned.' };
    }
    const dest = args.destination || url.split('/').pop().replace('.git', '');
    const safeDest = dest.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const clonePath = path.join(context.workingDir, safeDest);
    const argv = ['clone', '--depth', '1', ...(args.branch ? ['-b', gitName(args.branch, 'branch')] : []), '--', url, clonePath];
    const result = await runGitStream(argv, context.workingDir, 120000);
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
    return pullGit(repoDir(args, context), { remote: args.remote || null, branch: args.branch || null, workspaceRoot: context.workingDir });
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
    const state = getGitState(repoDir(args, context));
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
      const cwd = repoDir(args, context);
      const result = runGit(['diff', ...DIFF_SAFE, '--no-color', gitName(args.compare, 'compare'), ...(args.file ? ['--', String(args.file)] : [])], cwd);
      const output = result.output || '';
      const added = (output.match(/^\+[^+]/gm) || []).length;
      const removed = (output.match(/^-[^-]/gm) || []).length;
      return { ...result, additions: added, deletions: removed };
    }
    const result = getGitDiff(repoDir(args, context), { file: args.file || null, staged: args.staged === true });
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
    const cwd = repoDir(args, context);
    const limit = clampInt(args.limit, 20, 1, 500);
    const argv = ['log', '--oneline', '--graph', '--decorate', '-n', limit];
    if (args.author) argv.push(`--author=${args.author}`);
    if (args.since) argv.push(`--since=${args.since}`);
    if (args.file) argv.push('--', String(args.file));
    const result = runGit(argv, cwd);
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
    const cwd = repoDir(args, context);
    if (args.current) {
      const result = runGit(['branch', '--show-current'], cwd);
      return { success: true, current_branch: result.output };
    }
    if (args.create) {
      return branchGit(cwd, { action: 'create', name: args.create, workspaceRoot: context.workingDir });
    }
    if (args.delete) {
      const result = runGit(['branch', '-d', gitName(args.delete, 'branch')], cwd, { asked: true, workspaceRoot: context.workingDir });
      return { ...result, deleted: args.delete };
    }
    if (args.switch) {
      return branchGit(cwd, { action: 'switch', name: args.switch, workspaceRoot: context.workingDir });
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
    const cwd = repoDir(args, context);
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
      return runGit(['commit', '--amend', '--no-edit'], repoDir(args, context), { asked: true, workspaceRoot: context.workingDir });
    }
    // "." and all: true both mean every change; without either, only what is
    // staged (or the files named) goes in.
    const all = args.all === true || args.all === 'true' || String(args.files ?? '').trim() === '.';
    const files = !all && args.files ? [args.files] : [];
    return commitGit(repoDir(args, context), { message: args.message, files, all, workspaceRoot: context.workingDir });
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
    return pushGit(repoDir(args, context), {
      remote: args.remote || 'origin',
      branch: args.branch || null,
      setUpstream: args.set_upstream === true,
      workspaceRoot: context.workingDir,
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
    const cwd = repoDir(args, context);
    if (args.action === 'drop') return runGit(['stash', 'drop'], cwd, { asked: true, workspaceRoot: context.workingDir });
    if (args.action === 'clear') return { success: false, error: 'Stash clear is destructive and not available through this tool.' };
    const result = stashGit(cwd, { action: args.action, message: args.message || null, workspaceRoot: context.workingDir });
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
    const cwd = repoDir(args, context);
    if (args.action === 'list') {
      const result = runGit(['remote', '-v'], cwd);
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
      const url = String(args.url).trim();
      if (!/^(https?:\/\/|ssh:\/\/|git@[\w.-]+:)/i.test(url)) {
        return { success: false, error: 'Remote URLs must start with https://, ssh:// or git@host:.' };
      }
      const result = runGit(['remote', 'add', gitName(args.name, 'remote name'), url], cwd, { asked: true, workspaceRoot: context.workingDir });
      return { ...result, added: args.name, url: args.url };
    }
    if (args.action === 'remove') {
      if (!args.name) return { success: false, error: 'name required for remove action' };
      const result = runGit(['remote', 'remove', gitName(args.name, 'remote name')], cwd, { asked: true, workspaceRoot: context.workingDir });
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
