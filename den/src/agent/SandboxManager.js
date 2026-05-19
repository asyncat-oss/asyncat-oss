import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { getWorkspaceRoot } from '../files/fileExplorerService.js';

const COPY_SKIP = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  'logs',
]);
const JOB_OUTPUT_LIMIT = 1024 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeName(value = 'sandbox') {
  return String(value || 'sandbox')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'sandbox';
}

function publicSandbox(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sourcePath: row.source_path,
    sandboxPath: row.sandbox_path,
    strategy: row.strategy,
    branchName: row.branch_name || null,
    baseRef: row.base_ref || null,
    status: row.status,
    error: row.error || null,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    sandboxId: row.sandbox_id,
    kind: row.kind,
    command: row.command,
    cwd: row.cwd,
    status: row.status,
    exitCode: row.exit_code,
    stdout: row.stdout || '',
    stderr: row.stderr || '',
    durationMs: row.duration_ms,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function runGitResult(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

function gitRoot(dir) {
  try {
    return runGit(['rev-parse', '--show-toplevel'], dir);
  } catch {
    return null;
  }
}

function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function ensureSandboxRoot() {
  return ensureSandboxRootFor(getWorkspaceRoot());
}

function sandboxRootFor(sourcePath = null) {
  if (process.env.ASYNCAT_SANDBOX_DIR) return path.resolve(process.env.ASYNCAT_SANDBOX_DIR);
  const root = sourcePath ? path.resolve(sourcePath) : getWorkspaceRoot();
  return path.join(root, '.asyncat', 'sandboxes');
}

function ensureSandboxRootFor(sourcePath = null) {
  const root = sandboxRootFor(sourcePath);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return fs.realpathSync(root);
}

function sandboxRootForRow(row) {
  const metadata = parseJson(row?.metadata, {});
  return metadata.sandboxRoot || sandboxRootFor(row?.source_path || null);
}

function sandboxPathFor(id, name, sourcePath = null) {
  return path.join(ensureSandboxRootFor(sourcePath), `${safeName(name)}-${id.slice(0, 8)}`);
}

function copyFilter(src) {
  const name = path.basename(src);
  if (COPY_SKIP.has(name)) return false;
  if (name.startsWith('.asyncat')) return false;
  return true;
}

function rowById(userId, id) {
  return db.prepare('SELECT * FROM agent_sandboxes WHERE user_id = ? AND id = ?').get(userId, id);
}

function jobById(userId, sandboxId, jobId) {
  return db.prepare(`
    SELECT * FROM agent_sandbox_jobs
    WHERE user_id = ? AND sandbox_id = ? AND id = ?
  `).get(userId, sandboxId, jobId);
}

function requireSandbox(userId, id) {
  const row = rowById(userId, id);
  if (!row) throw new Error('Sandbox not found.');
  if (row.status !== 'ready') throw new Error(`Sandbox is ${row.status}.`);
  if (!fs.existsSync(row.sandbox_path)) throw new Error('Sandbox path no longer exists.');
  return row;
}

function resolveSandboxCwd(row, cwd = '.') {
  const resolved = path.resolve(row.sandbox_path, cwd || '.');
  if (!isInside(resolved, row.sandbox_path)) throw new Error('Command cwd must stay inside the sandbox.');
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('Command cwd must be an existing directory inside the sandbox.');
  }
  return resolved;
}

function normalizePathList(paths = []) {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .map(item => item.replace(/^\/+/, '')))];
}

function parseGitStatus(output = '') {
  return output.split('\n').filter(Boolean).map(line => {
    const status = line.slice(0, 2);
    const rawPath = line.slice(3).trim();
    const renamed = rawPath.includes(' -> ');
    const filePath = renamed ? rawPath.split(' -> ').pop() : rawPath;
    return {
      path: filePath,
      previousPath: renamed ? rawPath.split(' -> ')[0] : null,
      status,
      staged: status[0] !== ' ' && status[0] !== '?',
      unstaged: status[1] !== ' ',
      untracked: status === '??',
      deleted: status.includes('D'),
      renamed,
    };
  });
}

function filePatch(row, filePath) {
  const rel = String(filePath || '').trim();
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('filePath must be relative to the sandbox.');
  const abs = path.resolve(row.sandbox_path, rel);
  if (!isInside(abs, row.sandbox_path)) throw new Error('filePath must stay inside the sandbox.');

  const status = runGitResult(['status', '--porcelain=v1', '--', rel], row.sandbox_path).stdout.trim();
  if (status.startsWith('??')) {
    const result = runGitResult(['diff', '--no-index', '--binary', '--', '/dev/null', rel], row.sandbox_path);
    return result.stdout || '';
  }
  return runGitResult(['diff', '--binary', 'HEAD', '--', rel], row.sandbox_path).stdout || '';
}

function createWorktreePatch(row, filePaths = []) {
  const paths = normalizePathList(filePaths);
  const addArgs = ['add', '-N'];
  if (paths.length) addArgs.push('--', ...paths);
  else addArgs.push('.');
  runGitResult(addArgs, row.sandbox_path);

  const diffArgs = ['diff', '--binary', 'HEAD'];
  if (paths.length) diffArgs.push('--', ...paths);
  const result = runGitResult(diffArgs, row.sandbox_path);
  if (result.error) throw result.error;
  return result.stdout || '';
}

function writeTempPatch(sandboxId, patch) {
  const dir = path.join(os.tmpdir(), 'asyncat-sandbox-patches');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const patchPath = path.join(dir, `${sandboxId}-${Date.now()}-${randomUUID().slice(0, 8)}.patch`);
  fs.writeFileSync(patchPath, patch, 'utf8');
  return patchPath;
}

export function listSandboxes(userId, { workspaceId = null, includeDeleted = false } = {}) {
  const conditions = ['user_id = ?'];
  const params = [userId];
  if (workspaceId) {
    conditions.push('workspace_id = ?');
    params.push(workspaceId);
  }
  if (!includeDeleted) conditions.push("status != 'deleted'");
  const rows = db.prepare(`
    SELECT * FROM agent_sandboxes
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at DESC
  `).all(...params);
  return rows.map(publicSandbox);
}

export function getSandbox(userId, id) {
  return publicSandbox(rowById(userId, id));
}

export function getSandboxStatus(userId, id) {
  const row = rowById(userId, id);
  if (!row) return null;
  const sandbox = publicSandbox(row);
  sandbox.exists = fs.existsSync(row.sandbox_path);
  if (sandbox.exists && row.strategy === 'worktree') {
    try {
      sandbox.git = {
        branch: runGit(['branch', '--show-current'], row.sandbox_path),
        status: runGit(['status', '--short'], row.sandbox_path),
      };
    } catch (err) {
      sandbox.git = { error: err.message };
    }
  }
  return sandbox;
}

export function getSandboxDiff(userId, id, { filePath = null, includePatch = false } = {}) {
  const row = requireSandbox(userId, id);
  if (row.strategy !== 'worktree') {
    return {
      success: true,
      sandbox: publicSandbox(row),
      supported: false,
      files: [],
      patch: '',
      message: 'Diff review is currently supported for git worktree sandboxes.',
    };
  }

  const statusResult = runGitResult(['status', '--porcelain=v1'], row.sandbox_path);
  const files = parseGitStatus(statusResult.stdout || '');
  const summary = {
    changed: files.length,
    added: files.filter(f => f.untracked || f.status.includes('A')).length,
    modified: files.filter(f => f.status.includes('M')).length,
    deleted: files.filter(f => f.deleted).length,
    renamed: files.filter(f => f.renamed).length,
  };

  let patch = '';
  if (filePath) patch = filePatch(row, filePath);
  else if (includePatch) patch = createWorktreePatch(row);

  return {
    success: true,
    sandbox: getSandboxStatus(userId, id),
    supported: true,
    summary,
    files,
    patch,
  };
}

export function createSandboxPatch(userId, id, { filePaths = [] } = {}) {
  const row = requireSandbox(userId, id);
  if (row.strategy !== 'worktree') throw new Error('Patch export is currently supported for git worktree sandboxes.');
  const patch = createWorktreePatch(row, filePaths);
  return {
    success: true,
    sandbox: getSandboxStatus(userId, id),
    patch,
    fileCount: normalizePathList(filePaths).length || parseGitStatus(runGitResult(['status', '--porcelain=v1'], row.sandbox_path).stdout).length,
  };
}

export function applySandboxPatch(userId, id, { filePaths = [], dryRun = false } = {}) {
  const row = requireSandbox(userId, id);
  if (row.strategy !== 'worktree') throw new Error('Patch apply is currently supported for git worktree sandboxes.');
  const patch = createWorktreePatch(row, filePaths);
  if (!patch.trim()) return { success: true, dryRun, applied: false, message: 'Sandbox has no changes to apply.' };

  const patchPath = writeTempPatch(id, patch);
  try {
    const check = runGitResult(['apply', '--check', patchPath], row.source_path);
    if (check.status !== 0) {
      return { success: false, dryRun, applied: false, error: check.stderr || check.stdout || 'Patch does not apply cleanly.' };
    }
    if (dryRun) return { success: true, dryRun: true, applied: false, message: 'Patch applies cleanly.' };

    const applied = runGitResult(['apply', patchPath], row.source_path);
    if (applied.status !== 0) {
      return { success: false, dryRun: false, applied: false, error: applied.stderr || applied.stdout || 'Patch apply failed.' };
    }
    const now = nowIso();
    db.prepare('UPDATE agent_sandboxes SET updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, id);
    return { success: true, dryRun: false, applied: true, message: 'Patch applied to source workspace.' };
  } finally {
    try { fs.rmSync(patchPath, { force: true }); } catch {}
  }
}

export function commitSandboxBranch(userId, id, { message = 'Asyncat sandbox changes', filePaths = [] } = {}) {
  const row = requireSandbox(userId, id);
  if (row.strategy !== 'worktree') throw new Error('Branch promotion is currently supported for git worktree sandboxes.');
  const paths = normalizePathList(filePaths);
  const addArgs = ['add'];
  if (paths.length) addArgs.push('--', ...paths);
  else addArgs.push('-A');
  const add = runGitResult(addArgs, row.sandbox_path);
  if (add.status !== 0) throw new Error(add.stderr || add.stdout || 'Could not stage sandbox changes.');

  const diff = runGitResult(['diff', '--cached', '--quiet'], row.sandbox_path);
  if (diff.status === 0) {
    return { success: true, committed: false, branchName: row.branch_name, message: 'No staged sandbox changes to commit.' };
  }

  const commit = runGitResult(['commit', '-m', String(message || 'Asyncat sandbox changes')], row.sandbox_path);
  if (commit.status !== 0) throw new Error(commit.stderr || commit.stdout || 'Could not commit sandbox changes.');
  return {
    success: true,
    committed: true,
    branchName: runGit(['branch', '--show-current'], row.sandbox_path),
    output: commit.stdout || commit.stderr,
    message: 'Sandbox changes committed on the sandbox branch. Push this branch or open a PR from it when ready.',
  };
}

export function listSandboxJobs(userId, sandboxId, { limit = 50 } = {}) {
  const row = rowById(userId, sandboxId);
  if (!row) throw new Error('Sandbox not found.');
  const rows = db.prepare(`
    SELECT * FROM agent_sandbox_jobs
    WHERE user_id = ? AND sandbox_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, sandboxId, Math.min(Math.max(Number(limit) || 50, 1), 200));
  return rows.map(publicJob);
}

export function getSandboxJob(userId, sandboxId, jobId) {
  return publicJob(jobById(userId, sandboxId, jobId));
}

export function runSandboxCommand(userId, sandboxId, {
  command,
  cwd = '.',
  kind = 'command',
  timeoutMs = 120_000,
} = {}) {
  const row = requireSandbox(userId, sandboxId);
  const cmd = String(command || '').trim();
  if (!cmd) throw new Error('command is required.');
  const resolvedCwd = resolveSandboxCwd(row, cwd);
  const jobId = randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO agent_sandbox_jobs (
      id, sandbox_id, user_id, workspace_id, kind, command, cwd, status,
      metadata, created_at, started_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)
  `).run(
    jobId,
    sandboxId,
    userId,
    row.workspace_id,
    ['command', 'test', 'promote'].includes(kind) ? kind : 'command',
    cmd,
    path.relative(row.sandbox_path, resolvedCwd) || '.',
    JSON.stringify({ sandboxPath: row.sandbox_path }),
    now,
    now,
    now,
  );

  const started = Date.now();
  const result = spawnSync(cmd, {
    cwd: resolvedCwd,
    shell: true,
    encoding: 'utf8',
    timeout: Math.min(Math.max(Number(timeoutMs) || 120_000, 1_000), 900_000),
    maxBuffer: JOB_OUTPUT_LIMIT,
    env: { ...process.env, ASYNCAT_SANDBOX_ID: sandboxId, ASYNCAT_SANDBOX_PATH: row.sandbox_path },
  });
  const completed = nowIso();
  const stdout = (result.stdout || '').slice(-JOB_OUTPUT_LIMIT);
  const stderr = (result.stderr || (result.error ? result.error.message : '') || '').slice(-JOB_OUTPUT_LIMIT);
  const exitCode = result.status ?? (result.signal ? 128 : 1);
  const status = exitCode === 0 ? 'succeeded' : 'failed';
  const duration = Date.now() - started;

  db.prepare(`
    UPDATE agent_sandbox_jobs
    SET status = ?, exit_code = ?, stdout = ?, stderr = ?, duration_ms = ?,
        completed_at = ?, updated_at = ?
    WHERE user_id = ? AND sandbox_id = ? AND id = ?
  `).run(status, exitCode, stdout, stderr, duration, completed, completed, userId, sandboxId, jobId);

  const updated = nowIso();
  db.prepare('UPDATE agent_sandboxes SET updated_at = ? WHERE user_id = ? AND id = ?').run(updated, userId, sandboxId);
  return { success: status === 'succeeded', job: getSandboxJob(userId, sandboxId, jobId) };
}

export function recoverSandboxJobs() {
  const now = nowIso();
  const info = db.prepare(`
    UPDATE agent_sandbox_jobs
    SET status = 'failed',
        stderr = CASE WHEN stderr = '' THEN 'Backend restarted before this sandbox job completed.' ELSE stderr END,
        completed_at = COALESCE(completed_at, ?),
        updated_at = ?
    WHERE status IN ('queued','running')
  `).run(now, now);
  return info.changes || 0;
}

export function createSandbox({
  userId,
  workspaceId = null,
  name = 'Sandbox',
  sourcePath = null,
  strategy = 'auto',
  baseRef = 'HEAD',
} = {}) {
  if (!userId) throw new Error('userId is required');
  const id = randomUUID();
  const label = safeName(name);
  const source = path.resolve(sourcePath || getWorkspaceRoot());
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error('Sandbox source must be an existing directory.');
  }

  const repoRoot = gitRoot(source);
  if (strategy === 'worktree' && !repoRoot) {
    throw new Error('Worktree sandbox requires a git repository. Use strategy "copy" for non-git folders.');
  }
  const useWorktree = strategy !== 'copy' && Boolean(repoRoot);
  const resolvedSource = useWorktree ? repoRoot : source;
  const sandboxRootPath = ensureSandboxRootFor(resolvedSource);
  const sandboxPath = sandboxPathFor(id, label, resolvedSource);
  const branchName = useWorktree ? `asyncat-sandbox/${label}-${id.slice(0, 8)}` : null;
  const now = nowIso();

  try {
    if (useWorktree) {
      runGit(['worktree', 'add', '-b', branchName, sandboxPath, baseRef || 'HEAD'], resolvedSource);
    } else {
      fs.cpSync(resolvedSource, sandboxPath, {
        recursive: true,
        dereference: false,
        filter: copyFilter,
      });
    }

    db.prepare(`
      INSERT INTO agent_sandboxes (
        id, user_id, workspace_id, name, source_path, sandbox_path, strategy,
        branch_name, base_ref, status, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
    `).run(
      id,
      userId,
      workspaceId,
      name || label,
      resolvedSource,
      sandboxPath,
      useWorktree ? 'worktree' : 'copy',
      branchName,
      baseRef || null,
      JSON.stringify({ createdFrom: source, sandboxRoot: sandboxRootPath }),
      now,
      now,
    );

    return { success: true, sandbox: getSandboxStatus(userId, id) };
  } catch (err) {
    try {
      if (fs.existsSync(sandboxPath) && isInside(sandboxPath, sandboxRootPath)) {
        fs.rmSync(sandboxPath, { recursive: true, force: true });
      }
    } catch {}
    db.prepare(`
      INSERT INTO agent_sandboxes (
        id, user_id, workspace_id, name, source_path, sandbox_path, strategy,
        branch_name, base_ref, status, error, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, '{}', ?, ?)
    `).run(
      id,
      userId,
      workspaceId,
      name || label,
      resolvedSource,
      sandboxPath,
      useWorktree ? 'worktree' : 'copy',
      branchName,
      baseRef || null,
      err.message,
      now,
      now,
    );
    throw err;
  }
}

export function deleteSandbox(userId, id, { force = false } = {}) {
  const row = rowById(userId, id);
  if (!row) throw new Error('Sandbox not found.');
  if (row.status === 'deleted') return { success: true, sandbox: publicSandbox(row) };
  if (!isInside(row.sandbox_path, sandboxRootForRow(row))) throw new Error('Refusing to delete a path outside the sandbox root.');

  if (fs.existsSync(row.sandbox_path)) {
    if (row.strategy === 'worktree') {
      try {
        const args = ['worktree', 'remove'];
        if (force) args.push('--force');
        args.push(row.sandbox_path);
        runGit(args, row.source_path);
      } catch {
        fs.rmSync(row.sandbox_path, { recursive: true, force: true });
        try { runGit(['worktree', 'prune'], row.source_path); } catch {}
      }
    } else {
      fs.rmSync(row.sandbox_path, { recursive: true, force: true });
    }
  }

  const now = nowIso();
  db.prepare("UPDATE agent_sandboxes SET status = 'deleted', updated_at = ? WHERE user_id = ? AND id = ?")
    .run(now, userId, id);
  return { success: true, sandbox: getSandbox(userId, id) };
}

export function sandboxRoot() {
  return ensureSandboxRoot();
}
