// den/src/agent/tools/shared.js
// ─── Shared Utilities for Agent Tools ──────────────────────────────────────
// Standardized process execution, binary detection, path safety, and timeouts.

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { childEnv } from '../childEnv.js';

export const IS_WIN = os.platform() === 'win32';
export const PLATFORM = os.platform();
export const DEFAULT_TIMEOUT = 30_000;
export const MAX_OUTPUT = 16_000;

// ── Binary detection ──────────────────────────────────────────────────────

const _binCache = new Map();

export function hasBin(bin) {
  if (_binCache.has(bin)) return _binCache.get(bin);
  const found = runFile(IS_WIN ? 'where' : 'which', [String(bin)], { timeout: 3000 }).ok;
  _binCache.set(bin, found);
  return found;
}

// ── Running programs without a shell ──────────────────────────────────────
// Tool arguments come from the model, which may be repeating a web page or a
// file. Programs therefore run with an argument list: a value containing
// $(...), quotes or ; is passed through as text and never interpreted.

/**
 * How to start file with argv. Windows can only start .cmd/.bat files (npx,
 * npm) through cmd.exe, so those go through it with each argument quoted, and
 * arguments containing cmd.exe syntax are refused.
 */
export function spawnPlan(file, argv = []) {
  const args = argv.map(String);
  if (IS_WIN && /\.(cmd|bat)$/i.test(file)) {
    const unsafe = args.find((arg) => /[&|<>^%!"()\r\n]/.test(arg));
    if (unsafe !== undefined) throw new Error(`Argument not allowed on Windows: ${unsafe}`);
    return { file: `"${file}"`, args: args.map((arg) => `"${arg}"`), shell: true };
  }
  return { file, args, shell: false };
}

export function runFile(file, argv = [], { cwd, timeout = DEFAULT_TIMEOUT, input, env, maxBuffer = 8 * 1024 * 1024 } = {}) {
  let plan;
  try {
    plan = spawnPlan(file, argv);
  } catch (err) {
    return { ok: false, status: null, stdout: '', stderr: '', error: err.message };
  }
  const res = spawnSync(plan.file, plan.args, {
    cwd, env: env || childEnv(), input, timeout, maxBuffer, encoding: 'utf8', windowsHide: true, shell: plan.shell,
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  if (res.error) return { ok: false, status: null, stdout, stderr, error: res.error.message };
  if (res.status !== 0) return { ok: false, status: res.status, stdout, stderr, error: (stderr.trim() || `${file} exited with code ${res.status}`) };
  return { ok: true, status: 0, stdout, stderr, error: null };
}

/** A PowerShell string literal: single quotes expand nothing. */
export function powerShellLiteral(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

/** An AppleScript string literal. */
export function appleScriptLiteral(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function runPowerShell(script, options = {}) {
  return runFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], options);
}

export function runAppleScript(script, options = {}) {
  return runFile('osascript', ['-e', script], options);
}

/** First n lines of text, for output that used to be piped through head. */
export function firstLines(text, n) {
  return String(text || '').split('\n').filter(Boolean).slice(0, Math.max(0, n)).join('\n');
}

/** A positive whole number from a model-supplied value, clamped to [min, max]. */
export function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// ── Path safety ────────────────────────────────────────────────────────────

/**
 * The real path of `target`, links followed, also for a path that doesn't
 * exist yet: the real path of the nearest folder that does, plus the rest.
 * A link whose target is missing is followed too, since writing through it
 * would create its target. Throws when links go round in circles.
 */
export function realPathOf(target, hops = 0) {
  if (hops > 40) throw new Error(`Too many links in ${target}`);
  const resolved = path.resolve(target);
  const rest = [];
  let current = resolved;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest);
    } catch { /* missing, or a link to something missing */ }
    let link = null;
    try {
      if (fs.lstatSync(current).isSymbolicLink()) link = fs.readlinkSync(current);
    } catch { /* missing */ }
    if (link !== null) return realPathOf(path.resolve(path.dirname(current), link, ...rest), hops + 1);
    const parent = path.dirname(current);
    if (parent === current) return resolved;
    rest.unshift(path.basename(current));
    current = parent;
  }
}

/**
 * `filePath` resolved in `workingDir`, which it must stay inside. Links are
 * followed for the check: den's file tools run outside the command sandbox,
 * so a link in the project (one a sandboxed command made, say) must not lead
 * them to ~/.ssh or ~/.bashrc.
 */
export function safePath(filePath, workingDir) {
  const resolved = path.resolve(workingDir, filePath);
  if (!isPathInside(resolved, workingDir)) {
    throw new Error(`Path "${filePath}" is outside the working directory`);
  }
  let real;
  try {
    real = realPathOf(resolved);
  } catch {
    throw new Error(`Path "${filePath}" goes through too many links`);
  }
  if (!isPathInside(real, realPathOf(workingDir))) {
    throw new Error(`Path "${filePath}" is a link to somewhere outside the working directory`);
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

    // With arguments, run the program directly (no shell, so values from the
    // model are never interpreted). Without, cmd is a fixed shell command.
    let plan;
    try {
      plan = args.length > 0
        ? spawnPlan(cmd, args)
        : (IS_WIN ? { file: 'cmd.exe', args: ['/c', cmd], shell: false } : { file: '/bin/sh', args: ['-c', cmd], shell: false });
    } catch (err) {
      resolve({ success: false, exit_code: null, stdout: '', stderr: '', error: err.message });
      return;
    }
    const proc = spawn(plan.file, plan.args, {
      windowsHide: true,
      cwd: options.cwd || process.cwd(),
      shell: plan.shell,
      env: childEnv({ extra: options.env }),
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
