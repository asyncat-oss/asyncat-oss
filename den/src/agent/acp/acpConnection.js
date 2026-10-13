// den/src/agent/acp/acpConnection.js
// The wire for the Agent Client Protocol (agentclientprotocol.com): JSON-RPC
// 2.0 messages, one per line, over an agent program's stdin and stdout.
// Asyncat is the client: it sends requests (initialize, session/new,
// session/prompt…) and answers the agent's requests (permission, files).

import { spawn } from 'child_process';

export const ACP_PROTOCOL_VERSION = 1;

const DEFAULT_TIMEOUT_MS = 60_000;

export class AcpError extends Error {
  constructor(message, { code = null, data = null } = {}) {
    super(message);
    this.name = 'AcpError';
    this.code = code;
    this.data = data;
  }
}

export class AcpConnection {
  /**
   * `onNotification(method, params)` gets the agent's notifications;
   * `onRequest(method, params)` answers its requests (return a result or
   * throw an AcpError); `onExit(code, stderr)` runs when the program ends.
   */
  constructor({ command, args = [], cwd, env, onNotification = null, onRequest = null, onExit = null }) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.onNotification = onNotification;
    this.onRequest = onRequest;
    this.onExit = onExit;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.stderr = '';
    this.closed = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const child = spawn(this.command, this.args, { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.child = child;
      child.on('error', (err) => {
        this.#closeAll(new AcpError(err.code === 'ENOENT' ? `Couldn't find the program "${this.command}".` : err.message, { code: err.code }));
        if (!settled) { settled = true; reject(err); }
      });
      child.on('spawn', () => {
        if (!settled) { settled = true; resolve(); }
      });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this.#read(chunk));
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { this.stderr = `${this.stderr}${chunk}`.slice(-8000); });
      child.on('close', (code) => {
        const last = this.stderr.trim().split('\n').slice(-3).join(' ');
        this.#closeAll(new AcpError(`The agent stopped${code ? ` (exit ${code})` : ''}.${last ? ` ${last}` : ''}`));
        this.onExit?.(code, this.stderr);
      });
      child.stdin.on('error', () => { /* the program went away; close reports it */ });
    });
  }

  #closeAll(error) {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  #send(message) {
    if (this.closed || !this.child?.stdin?.writable) return false;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    return true;
  }

  #read(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue; // not protocol output (a stray log line)
      }
      this.#handle(message);
    }
  }

  #handle(message) {
    if (message.id !== undefined && message.id !== null && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new AcpError(message.error.message || 'The agent returned an error.', { code: message.error.code, data: message.error.data }));
      else pending.resolve(message.result ?? null);
      return;
    }
    if (!message.method) return;
    if (message.id === undefined || message.id === null) {
      try {
        this.onNotification?.(message.method, message.params || {});
      } catch (err) {
        console.warn('[acp] A notification handler failed:', err.message);
      }
      return;
    }
    Promise.resolve()
      .then(() => {
        if (!this.onRequest) throw new AcpError(`Method not found: ${message.method}`, { code: -32601 });
        return this.onRequest(message.method, message.params || {});
      })
      .then((result) => this.#send({ id: message.id, result: result ?? null }))
      .catch((err) => this.#send({
        id: message.id,
        error: { code: Number.isInteger(err?.code) ? err.code : -32603, message: err?.message || 'Request failed' },
      }));
  }

  /** Send a request and wait for its answer. */
  request(method, params = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (this.closed) return Promise.reject(new AcpError('The agent is not running.'));
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
          this.pending.delete(id);
          reject(new AcpError(`The agent didn't answer ${method} in time.`));
        }, timeoutMs)
        : null;
      timer?.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      if (!this.#send({ id, method, params })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new AcpError('The agent is not running.'));
      }
    });
  }

  notify(method, params = {}) {
    this.#send({ method, params });
  }

  /** End the program: a polite stop, then a hard one if it lingers. */
  close({ graceMs = 2000 } = {}) {
    const child = this.child;
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, graceMs);
      timer.unref?.();
      child.once('close', () => { clearTimeout(timer); resolve(); });
      try { child.stdin.end(); } catch { /* closed */ }
      try { child.kill('SIGTERM'); } catch { /* gone */ }
    });
  }
}
