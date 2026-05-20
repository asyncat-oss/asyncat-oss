// den/src/agent/tools/shared.js
// ─── Shared Utilities for Agent Tools ──────────────────────────────────────
// Standardized process execution, binary detection, path safety, and timeouts.

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';

export const IS_WIN = os.platform() === 'win32';
export const PLATFORM = os.platform();
export const DEFAULT_TIMEOUT = 30_000;
export const MAX_OUTPUT = 16_000;

// ── Binary detection ──────────────────────────────────────────────────────

const _binCache = new Map();

export function hasBin(bin) {
  if (_binCache.has(bin)) return _binCache.get(bin);
  try {
    const cmd = IS_WIN ? `where ${bin} 2>nul` : `which ${bin} 2>/dev/null`;
    execSync(cmd, { stdio: 'ignore', timeout: 3000 });
    _binCache.set(bin, true);
    return true;
  } catch {
    _binCache.set(bin, false);
    return false;
  }
}

export function clearBinCache() {
  _binCache.clear();
}

// ── Path safety ────────────────────────────────────────────────────────────

export function safePath(filePath, workingDir) {
  const resolved = path.resolve(workingDir, filePath);
  if (!isPathInside(resolved, workingDir)) {
    throw new Error(`Path "${filePath}" is outside the working directory`);
  }
  return resolved;
}

export function isPathInside(childPath, parentPath) {
  const child = path.resolve(childPath);
  const parent = path.resolve(parentPath);
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

// ── Standardized process execution ────────────────────────────────────────

export function runProcess(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const maxOutput = options.maxOutput || MAX_OUTPUT;
    let stdout = '';
    let stderr = '';
    let killed = false;

    const [sh, flag] = IS_WIN ? ['cmd.exe', '/c'] : ['/bin/sh', '-c'];
    const proc = spawn(sh, flag ? [flag, cmd] : [cmd], {
      cwd: options.cwd || process.cwd(),
      shell: false,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);

    // Stream progress to emitEvent if available
    let lastStreamedLength = 0;
    const STREAM_INTERVAL_MS = 250;
    let streamTimer = null;
    if (options.emitEvent) {
      streamTimer = setInterval(() => {
        const currentOutput = stdout + (stderr ? `\n[stderr] ${stderr.slice(-500)}` : '');
        if (currentOutput.length > lastStreamedLength) {
          const newContent = currentOutput.slice(lastStreamedLength, lastStreamedLength + 2000);
          lastStreamedLength = Math.min(currentOutput.length, lastStreamedLength + 2000);
          options.emitEvent({
            type: 'tool_progress',
            data: { tool: options.toolName || 'run_command', chunk: newContent, totalLength: currentOutput.length },
          });
        }
      }, STREAM_INTERVAL_MS);
    }

    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      clearTimeout(timer);
      if (streamTimer) clearInterval(streamTimer);
      if (options.emitEvent) {
        options.emitEvent({
          type: 'tool_progress',
          data: { tool: options.toolName || 'run_command', chunk: null, done: true, exitCode: code, totalLength: stdout.length + stderr.length },
        });
      }
      if (stdout.length > maxOutput) stdout = stdout.slice(0, maxOutput) + '\n... [output truncated]';
      if (stderr.length > maxOutput) stderr = stderr.slice(0, maxOutput) + '\n... [output truncated]';
      resolve({
        success: code === 0 && !killed,
        exit_code: killed ? -1 : code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        killed,
        ...(killed ? { error: `Timed out after ${timeout / 1000}s` } : {}),
      });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      if (streamTimer) clearInterval(streamTimer);
      resolve({ success: false, exit_code: -1, stdout: '', stderr: err.message, killed: false, error: err.message });
    });
  });
}

// ── Shell-safe quoting ────────────────────────────────────────────────────

export function shellQuote(str) {
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

// ── Output truncation ─────────────────────────────────────────────────────

export function truncate(str, maxLen = 8000) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `\n\n... [truncated, ${str.length - maxLen} more chars]`;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

// ── Missing dependency error helper ────────────────────────────────────────

export function missingDepError(dep, hint) {
  return {
    success: false,
    error: `${dep} is not installed or not in PATH.`,
    install: hint || (IS_WIN
      ? `Install ${dep} for Windows`
      : PLATFORM === 'darwin'
        ? `brew install ${dep}`
        : `sudo apt install ${dep}`),
  };
}
