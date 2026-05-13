import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MAX_OUTPUT = 1024 * 1024;
const DEFAULT_COMMIT_MESSAGE_DIFF_CHARS = 24000;

function runGit(args, cwd, timeout = 30000) {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer: MAX_OUTPUT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stderr: err.stderr?.toString() || '',
      stdout: err.stdout?.toString() || '',
    };
  }
}

function safeRepoRoot(cwd) {
  const result = runGit(['rev-parse', '--show-toplevel'], cwd, 5000);
  if (!result.success || !result.output) return null;
  return path.resolve(result.output);
}

function ensureRepo(cwd) {
  const root = safeRepoRoot(cwd);
  if (!root) return { success: false, detected: false, error: 'Not a git repository.' };
  return { success: true, detected: true, root };
}

function normalizeGitPath(repoRoot, filePath) {
  if (!filePath || filePath === '.') return null;
  const resolved = path.resolve(repoRoot, filePath);
  if (resolved !== repoRoot && !resolved.startsWith(repoRoot + path.sep)) {
    throw new Error('Path must stay inside the repository.');
  }
  return path.relative(repoRoot, resolved).replace(/\\/g, '/');
}

function normalizeGitPaths(repoRoot, files = []) {
  if (!Array.isArray(files)) return [];
  return files
    .map(file => normalizeGitPath(repoRoot, file))
    .filter(Boolean);
}

function parseBranchLine(line = '') {
  const value = line.replace(/^##\s*/, '').trim();
  const result = { branch: null, upstream: null, ahead: 0, behind: 0 };
  if (!value) return result;

  const ahead = value.match(/ahead\s+(\d+)/);
  const behind = value.match(/behind\s+(\d+)/);
  if (ahead) result.ahead = Number(ahead[1]) || 0;
  if (behind) result.behind = Number(behind[1]) || 0;

  const withoutCounts = value.replace(/\s+\[[^\]]+\]$/, '');
  if (withoutCounts.includes('...')) {
    const [branch, upstream] = withoutCounts.split('...');
    result.branch = branch || null;
    result.upstream = upstream || null;
  } else if (withoutCounts.startsWith('HEAD ')) {
    result.branch = 'HEAD';
  } else {
    result.branch = withoutCounts || null;
  }
  return result;
}

function parseStatus(output = '') {
  const files = [];
  let branchInfo = { branch: null, upstream: null, ahead: 0, behind: 0 };

  for (const line of output.split('\n')) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      branchInfo = parseBranchLine(line);
      continue;
    }

    if (line.startsWith('?? ')) {
      files.push({
        path: line.slice(3),
        status: 'untracked',
        code: '??',
        staged: false,
        unstaged: false,
        untracked: true,
        deleted: false,
        renamed: false,
      });
      continue;
    }

    const code = line.slice(0, 2);
    const rawPath = line.slice(3);
    const renamed = code.includes('R') || rawPath.includes(' -> ');
    const [oldPath, nextPath] = renamed ? rawPath.split(' -> ') : [null, rawPath];
    const staged = code[0] !== ' ' && code[0] !== '?';
    const unstaged = code[1] !== ' ' && code[1] !== '?';
    const deleted = code.includes('D');
    files.push({
      path: nextPath || rawPath,
      oldPath,
      status: renamed ? 'renamed' : deleted ? 'deleted' : staged ? 'staged' : 'modified',
      code,
      staged,
      unstaged,
      untracked: false,
      deleted,
      renamed,
    });
  }

  return { branchInfo, files };
}

function groupFiles(files = []) {
  return {
    staged: files.filter(file => file.staged),
    unstaged: files.filter(file => file.unstaged && !file.untracked),
    untracked: files.filter(file => file.untracked),
    deleted: files.filter(file => file.deleted),
    renamed: files.filter(file => file.renamed),
    all: files,
  };
}

function truncateWithNotice(value = '', maxChars = DEFAULT_COMMIT_MESSAGE_DIFF_CHARS) {
  const text = String(value || '');
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n\n[Diff truncated for commit message generation]`,
    truncated: true,
  };
}

function describeStatusFile(file = {}) {
  const source = file.oldPath ? ` from ${file.oldPath}` : '';
  return `${file.code || '??'} ${file.path || ''}${source}`.trim();
}

function diffUntrackedFiles(repoRoot, files = [], remainingChars = DEFAULT_COMMIT_MESSAGE_DIFF_CHARS) {
  const parts = [];
  let used = 0;

  for (const file of files) {
    if (used >= remainingChars) break;
    const safeFile = normalizeGitPath(repoRoot, file.path);
    if (!safeFile) continue;
    const abs = path.join(repoRoot, safeFile);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;

    const result = runGit(['diff', '--no-index', '--no-color', '/dev/null', safeFile], repoRoot, 10000);
    const output = result.output || result.stdout || '';
    if (!output) {
      parts.push(`Untracked file: ${safeFile}`);
      used += safeFile.length + 18;
      continue;
    }

    const remaining = Math.max(0, remainingChars - used);
    const chunk = output.length > remaining
      ? `${output.slice(0, remaining)}\n\n[Untracked file diff truncated]`
      : output;
    parts.push(chunk);
    used += chunk.length;
  }

  return parts.join('\n\n');
}

function parseRemotes(output = '') {
  const byKey = new Map();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, kind] = match;
    const key = `${name}:${url}`;
    const existing = byKey.get(key) || { name, url, fetch: false, push: false };
    existing[kind] = true;
    byKey.set(key, existing);
  }
  return [...byKey.values()];
}

function latestCommit(root) {
  const result = runGit(['log', '-1', '--pretty=format:%H%x00%h%x00%s%x00%an%x00%ai'], root, 5000);
  if (!result.success || !result.output) return null;
  const [hash, shortHash, subject, author, date] = result.output.split('\x00');
  return { hash, shortHash, subject, author, date };
}

function stashCount(root) {
  const result = runGit(['stash', 'list'], root, 5000);
  if (!result.success || !result.output) return 0;
  return result.output.split('\n').filter(Boolean).length;
}

export function getGitState(cwd) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return { success: true, detected: false, reason: repo.error };

  const status = runGit(['status', '--porcelain=v1', '-b', '-uall'], repo.root, 10000);
  const remotes = runGit(['remote', '-v'], repo.root, 5000);
  const parsed = parseStatus(status.output || '');
  const groups = groupFiles(parsed.files);

  return {
    success: true,
    detected: true,
    root: repo.root,
    branch: parsed.branchInfo.branch,
    upstream: parsed.branchInfo.upstream,
    ahead: parsed.branchInfo.ahead,
    behind: parsed.branchInfo.behind,
    clean: parsed.files.length === 0,
    changedCount: new Set(parsed.files.map(file => file.path)).size,
    remotes: remotes.success ? parseRemotes(remotes.output) : [],
    latestCommit: latestCommit(repo.root),
    stashCount: stashCount(repo.root),
    changes: groups,
  };
}

export function getGitLog(cwd, { limit = 100, skip = 0 } = {}) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  
  const args = [
    'log',
    '--all',
    '--date-order',
    '--pretty=format:%H%x00%P%x00%D%x00%s%x00%an%x00%ar',
    '-n', String(limit)
  ];
  if (skip > 0) args.push('--skip', String(skip));

  const result = runGit(args, repo.root, 10000);
  if (!result.success) return result;

  const commits = (result.output || '').split('\n').filter(Boolean).map(line => {
    const [hash, parentsRaw, refsRaw, subject, author, date] = line.split('\x00');
    return {
      hash,
      parents: parentsRaw ? parentsRaw.split(' ') : [],
      refs: refsRaw ? refsRaw.split(', ').filter(Boolean) : [],
      subject,
      author,
      date
    };
  });

  return { success: true, detected: true, root: repo.root, commits };
}

export function getGitDiff(cwd, { file = null, staged = false } = {}) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  const safeFile = file ? normalizeGitPath(repo.root, file) : null;
  const args = staged
    ? ['diff', '--cached', '--no-color']
    : ['diff', '--no-color', 'HEAD'];
  if (safeFile) args.push('--', safeFile);
  const result = runGit(args, repo.root, 10000);
  let output = result.output || '';

  if (!staged && safeFile && !output) {
    const tracked = runGit(['ls-files', '--error-unmatch', '--', safeFile], repo.root, 5000);
    const abs = path.join(repo.root, safeFile);
    if (!tracked.success && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const fallback = runGit(['diff', '--no-index', '--no-color', '/dev/null', safeFile], repo.root, 10000);
      output = fallback.output || fallback.stdout || '';
    }
  }

  const additions = (output.match(/^\+[^+]/gm) || []).length;
  const deletions = (output.match(/^-[^-]/gm) || []).length;
  return { success: result.success || Boolean(output), detected: true, root: repo.root, file: safeFile, staged: Boolean(staged), diff: output, additions, deletions };
}

export function getGitCommitMessageContext(cwd, { scope = 'auto', maxDiffChars = DEFAULT_COMMIT_MESSAGE_DIFF_CHARS } = {}) {
  const state = getGitState(cwd);
  if (!state.detected) {
    return { ...state, success: false, error: state.reason || 'Not a git repository.' };
  }

  const stagedFiles = state.changes?.staged || [];
  const allFiles = state.changes?.all || [];
  const requestedScope = scope === 'staged' || scope === 'all' ? scope : 'auto';
  const useStaged = requestedScope === 'staged' || (requestedScope === 'auto' && stagedFiles.length > 0);
  const selectedFiles = useStaged ? stagedFiles : allFiles;

  if (!selectedFiles.length) {
    return {
      success: false,
      detected: true,
      root: state.root,
      branch: state.branch,
      scope: useStaged ? 'staged' : 'all',
      error: 'No changes available for commit message generation.',
    };
  }

  const diffArgs = useStaged
    ? ['diff', '--cached', '--no-color']
    : ['diff', '--no-color', 'HEAD'];
  const diffResult = runGit(diffArgs, state.root, 30000);
  let diff = diffResult.output || diffResult.stdout || '';

  if (!useStaged) {
    const untrackedDiff = diffUntrackedFiles(
      state.root,
      selectedFiles.filter(file => file.untracked),
      Math.max(0, Number(maxDiffChars) - diff.length),
    );
    if (untrackedDiff) diff = [diff, untrackedDiff].filter(Boolean).join('\n\n');
  }

  const truncated = truncateWithNotice(diff, Number(maxDiffChars) || DEFAULT_COMMIT_MESSAGE_DIFF_CHARS);

  return {
    success: true,
    detected: true,
    root: state.root,
    branch: state.branch,
    scope: useStaged ? 'staged' : 'all',
    changedCount: selectedFiles.length,
    files: selectedFiles.map(file => ({
      path: file.path,
      oldPath: file.oldPath || null,
      code: file.code,
      status: file.status,
      staged: Boolean(file.staged),
      unstaged: Boolean(file.unstaged),
      untracked: Boolean(file.untracked),
    })),
    status: selectedFiles.map(describeStatusFile).join('\n'),
    diff: truncated.text,
    diffTruncated: truncated.truncated,
  };
}

export function stageGitFiles(cwd, files = []) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  const paths = normalizeGitPaths(repo.root, files);
  const args = paths.length ? ['add', '--', ...paths] : ['add', '-A'];
  const result = runGit(args, repo.root, 30000);
  return { ...result, command: `git ${args.join(' ')}`, files: paths, all: paths.length === 0 };
}

export function unstageGitFiles(cwd, files = []) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  const paths = normalizeGitPaths(repo.root, files);
  const args = paths.length ? ['restore', '--staged', '--', ...paths] : ['restore', '--staged', '.'];
  const result = runGit(args, repo.root, 30000);
  return { ...result, command: `git ${args.join(' ')}`, files: paths, all: paths.length === 0 };
}

export function commitGit(cwd, { message, files = [], amend = false } = {}) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  const cleanMessage = String(message || '').trim();
  if (!amend && !cleanMessage) return { success: false, error: 'Commit message is required.' };
  const paths = normalizeGitPaths(repo.root, files);
  if (paths.length) {
    const stage = stageGitFiles(repo.root, paths);
    if (!stage.success) return stage;
  }
  const args = amend
    ? ['commit', '--amend', ...(cleanMessage ? ['-m', cleanMessage] : ['--no-edit'])]
    : ['commit', '-m', cleanMessage];
  const result = runGit(args, repo.root, 60000);
  const hash = result.success ? runGit(['log', '-1', '--format=%H'], repo.root, 5000).output : null;
  return {
    ...result,
    command: amend
      ? `git commit --amend ${cleanMessage ? '-m <message>' : '--no-edit'}`
      : 'git commit -m <message>',
    commit: hash || null,
    files: paths,
    amend: Boolean(amend),
  };
}

export function pullGit(cwd, { remote = null, branch = null } = {}) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  const args = ['pull'];
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  const result = runGit(args, repo.root, 120000);
  return { ...result, command: `git ${args.join(' ')}` };
}

export function pushGit(cwd, { remote = 'origin', branch = null, setUpstream = false } = {}) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  const args = ['push'];
  if (setUpstream || branch) args.push('-u', remote || 'origin', branch || 'HEAD');
  else if (remote) args.push(remote);
  const result = runGit(args, repo.root, 120000);
  return { ...result, command: `git ${args.join(' ')}` };
}

export function stashGit(cwd, { action = 'list', message = null, index = null } = {}) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  if (!['save', 'pop', 'drop', 'list'].includes(action)) {
    return { success: false, error: 'Only save, pop, drop, and list stash actions are available here.' };
  }
  const args = action === 'save'
    ? ['stash', 'push', '-u', ...(message ? ['-m', message] : [])]
    : action === 'pop'
      ? ['stash', 'pop', ...(index !== null ? [`stash@{${index}}`] : [])]
      : action === 'drop'
        ? ['stash', 'drop', ...(index !== null ? [`stash@{${index}}`] : [])]
        : ['stash', 'list'];
  const result = runGit(args, repo.root, 60000);
  
  if (action === 'list' && result.success) {
    const stashes = (result.output || '').split('\n').filter(Boolean).map(line => {
      const match = line.match(/^stash@\{(\d+)\}:\s*(.*)$/);
      if (!match) return { raw: line };
      return { index: parseInt(match[1], 10), message: match[2], raw: line };
    });
    return { ...result, command: `git ${args.join(' ')}`, stashes };
  }

  return { ...result, command: `git ${args.join(' ')}` };
}

export function branchGit(cwd, { action = 'list', name = null } = {}) {
  const repo = ensureRepo(cwd);
  if (!repo.success) return repo;
  if (action === 'list') {
    const result = runGit(['branch', '-a', '--format=%(HEAD) %(refname:short) -> %(upstream:short)'], repo.root, 10000);
    return { ...result, command: 'git branch -a', branches: (result.output || '').split('\n').filter(Boolean) };
  }
  if (!name || !/^[A-Za-z0-9._/-]+$/.test(name)) {
    return { success: false, error: 'A valid branch name is required.' };
  }
  if (action === 'create') {
    const result = runGit(['branch', name], repo.root, 30000);
    return { ...result, command: `git branch ${name}`, branch: name };
  }
  if (action === 'switch') {
    const result = runGit(['switch', name], repo.root, 30000);
    return { ...result, command: `git switch ${name}`, branch: name };
  }
  return { success: false, error: 'Only list, create, and switch branch actions are available here.' };
}

export function isGitReadOnlyAction(toolName, args = {}) {
  if (toolName === 'git_status' || toolName === 'git_diff' || toolName === 'git_log') return true;
  if (toolName === 'git_branch') return Boolean(args.current || args.list || (!args.create && !args.delete && !args.switch));
  if (toolName === 'git_remote') return args.action === 'list';
  if (toolName === 'git_stash') return args.action === 'list';
  return false;
}

export function isGitDangerousAction(toolName, args = {}) {
  if (toolName === 'git_push' && args.force) return true;
  if (toolName === 'git_stash' && args.action === 'clear') return true;
  return false;
}
