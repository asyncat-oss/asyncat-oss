// den/src/agent/ShellSessionManager.js
// ─── Persistent Shell Session Manager ────────────────────────────────────────
// Maintains long-lived shell processes so the agent can:
//   - cd into a directory and stay there across commands
//   - run a dev server and interact with it
//   - hold a REPL session (python, node, etc.)
//
// Sessions are keyed by (agentSessionId, sessionName). Each session is a
// persistent child process with stdin/stdout/stderr pipes. Commands are sent
// via stdin and output is captured via a unique sentinel pattern.

import { spawn } from 'child_process';
import { IS_WIN } from './tools/shared.js';

const SENTINEL_PREFIX = '__ASYNCAT_DONE__';
const MAX_SESSIONS = 16;           // hard cap to prevent leaks
const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 min idle → auto-close
const CMD_TIMEOUT_MS = 120 * 1000;
const MAX_OUTPUT_CHARS = 40_000;
const STREAM_INTERVAL_MS = 200;

class ShellSession {
  constructor({ id, shell, cwd }) {
    this.id = id;
    this.cwd = cwd;
    this.alive = false;
    this._proc = null;
    this._outputBuf = '';
    this._resolveFn = null;
    this._rejectFn = null;
    this._sentinel = null;
    this._cmdTimer = null;
    this._idleTimer = null;
    this._streamTimer = null;
    this._lastStreamedLen = 0;
    this._emitEvent = null;
    this._shell = shell;
    this._startProc();
  }

  _startProc() {
    const [sh, initFlag] = IS_WIN
      ? ['cmd.exe', null]
      : [this._shell || '/bin/bash', '--norc'];
    const args = initFlag ? [initFlag] : [];
    this._proc = spawn(sh, args, {
      cwd: this.cwd,
      env: { ...process.env, PS1: '', PS2: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.alive = true;
    this._outputBuf = '';

    this._proc.stdout.on('data', d => this._onData(d.toString()));
    this._proc.stderr.on('data', d => this._onData(d.toString()));
    this._proc.on('close', () => {
      this.alive = false;
      this._clearTimers();
      if (this._rejectFn) {
        this._rejectFn(new Error('Shell process exited unexpectedly.'));
        this._resolveFn = null;
        this._rejectFn = null;
      }
    });
    this._proc.on('error', err => {
      this.alive = false;
      this._clearTimers();
      if (this._rejectFn) {
        this._rejectFn(err);
        this._resolveFn = null;
        this._rejectFn = null;
      }
    });
    this._resetIdle();
  }

  _onData(chunk) {
    this._outputBuf += chunk;
    // Stream progress if a command is in-flight
    if (this._emitEvent && this._sentinel) this._streamProgress();
    // Detect sentinel
    if (this._sentinel && this._outputBuf.includes(this._sentinel)) {
      this._settle();
    }
  }

  _streamProgress() {
    if (!this._emitEvent) return;
    const current = this._outputBuf.length;
    if (current > this._lastStreamedLen) {
      const chunk = this._outputBuf.slice(this._lastStreamedLen, this._lastStreamedLen + 2000);
      this._lastStreamedLen = Math.min(current, this._lastStreamedLen + 2000);
      this._emitEvent({
        type: 'tool_progress',
        data: { tool: 'shell_session_run', chunk, totalLength: current },
      });
    }
  }

  _settle() {
    if (!this._resolveFn) return;
    clearTimeout(this._cmdTimer);
    if (this._streamTimer) clearInterval(this._streamTimer);
    // Strip sentinel and everything after from output
    const sentinelIdx = this._outputBuf.indexOf(this._sentinel);
    const raw = this._outputBuf.slice(0, sentinelIdx);
    this._outputBuf = this._outputBuf.slice(sentinelIdx + this._sentinel.length + 1);

    // Extract exit code embedded before the sentinel: __ASYNCAT_DONE__<code>\n
    const exitCodeMatch = this._outputBuf.match(/^(\d+)\n?/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
    if (exitCodeMatch) this._outputBuf = this._outputBuf.slice(exitCodeMatch[0].length);

    this._lastStreamedLen = 0;
    this._sentinel = null;
    this._emitEvent = null;

    // Final stream flush
    const resolve = this._resolveFn;
    this._resolveFn = null;
    this._rejectFn = null;
    this._resetIdle();

    const trimmed = raw.length > MAX_OUTPUT_CHARS
      ? raw.slice(0, MAX_OUTPUT_CHARS) + '\n... [output truncated]'
      : raw;

    resolve({ output: trimmed.trimEnd(), exitCode, success: exitCode === 0 });
  }

  _resetIdle() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => this.close('idle timeout'), SESSION_IDLE_MS);
  }

  _clearTimers() {
    if (this._cmdTimer) clearTimeout(this._cmdTimer);
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this._streamTimer) clearInterval(this._streamTimer);
  }

  run(command, { timeout = CMD_TIMEOUT_MS, emitEvent = null } = {}) {
    if (!this.alive) return Promise.resolve({ success: false, error: 'Session has closed.', output: '', exitCode: -1 });
    if (this._resolveFn) return Promise.resolve({ success: false, error: 'Another command is already running in this session.', output: '', exitCode: -1 });

    this._sentinel = `${SENTINEL_PREFIX}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this._outputBuf = '';
    this._lastStreamedLen = 0;
    this._emitEvent = emitEvent || null;

    return new Promise((resolve, reject) => {
      this._resolveFn = resolve;
      this._rejectFn = reject;

      this._cmdTimer = setTimeout(() => {
        if (this._resolveFn) {
          const out = this._outputBuf;
          this._outputBuf = '';
          this._sentinel = null;
          this._emitEvent = null;
          this._resolveFn = null;
          this._rejectFn = null;
          resolve({ success: false, error: `Command timed out after ${timeout / 1000}s.`, output: out.trimEnd(), exitCode: -1 });
        }
      }, timeout);

      if (emitEvent) {
        this._streamTimer = setInterval(() => this._streamProgress(), STREAM_INTERVAL_MS);
      }

      // Write command followed by a sentinel echo so we know when it's done
      // Bash: `<cmd>; echo "<SENTINEL>$?"` captures exit code after sentinel text
      const sentinelCmd = IS_WIN
        ? `${command}\r\necho ${this._sentinel}%ERRORLEVEL%\r\n`
        : `${command}\necho "${this._sentinel}$?"\n`;
      this._proc.stdin.write(sentinelCmd);
    });
  }

  close(reason = 'explicit') {
    if (!this.alive) return;
    this.alive = false;
    this._clearTimers();
    try { this._proc.stdin.end(); } catch {}
    try { this._proc.kill('SIGTERM'); } catch {}
    if (this._rejectFn) {
      this._rejectFn(new Error(`Session closed: ${reason}`));
      this._resolveFn = null;
      this._rejectFn = null;
    }
  }
}

// ─── Manager (singleton) ──────────────────────────────────────────────────────

class ShellSessionManager {
  constructor() {
    this._sessions = new Map(); // key → ShellSession
  }

  _key(agentSessionId, name) {
    return `${agentSessionId || 'anon'}::${name || 'default'}`;
  }

  create({ agentSessionId, name = 'default', cwd, shell }) {
    const key = this._key(agentSessionId, name);
    if (this._sessions.has(key)) {
      const existing = this._sessions.get(key);
      if (existing.alive) return { id: key, reused: true };
      this._sessions.delete(key);
    }
    if (this._sessions.size >= MAX_SESSIONS) {
      // Evict oldest dead session, then oldest live
      for (const [k, s] of this._sessions) {
        if (!s.alive) { this._sessions.delete(k); break; }
      }
      if (this._sessions.size >= MAX_SESSIONS) {
        const [oldest] = this._sessions.keys();
        this._sessions.get(oldest)?.close('evicted');
        this._sessions.delete(oldest);
      }
    }
    const session = new ShellSession({ id: key, shell, cwd: cwd || process.cwd() });
    this._sessions.set(key, session);
    return { id: key, reused: false };
  }

  get(agentSessionId, name = 'default') {
    return this._sessions.get(this._key(agentSessionId, name)) || null;
  }

  close(agentSessionId, name = 'default') {
    const key = this._key(agentSessionId, name);
    const s = this._sessions.get(key);
    if (s) { s.close('explicit'); this._sessions.delete(key); }
  }

  closeAll(agentSessionId) {
    for (const [key, s] of this._sessions) {
      if (key.startsWith(`${agentSessionId}::`)) {
        s.close('session end');
        this._sessions.delete(key);
      }
    }
  }

  list(agentSessionId) {
    const results = [];
    for (const [key, s] of this._sessions) {
      if (!agentSessionId || key.startsWith(`${agentSessionId}::`)) {
        const name = key.split('::')[1] || 'default';
        results.push({ name, alive: s.alive, cwd: s.cwd });
      }
    }
    return results;
  }
}

export const shellSessionManager = new ShellSessionManager();
