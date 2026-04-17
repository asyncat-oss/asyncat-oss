'use strict';

const { spawn, execSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');
const { line, warn, ok, info } = require('./colors');
const { ROOT } = require('./env');

// ── shared process state ──────────────────────────────────────────────────────
const procs = { backend: null, frontend: null };

// ── ensure logs dir ───────────────────────────────────────────────────────────
function logsDir() {
  const d = path.join(ROOT, 'logs');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── spawn a service ───────────────────────────────────────────────────────────
function startProc(key, cwd, cmd, args, color) {
  if (procs[key]) { warn(`${key} is already running.`); return; }

  const logFile = path.join(logsDir(), `${key}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const proc = spawn(cmd, args, {
    cwd: path.join(ROOT, cwd),
    shell: true,
    env: process.env,
  });
  procs[key] = proc;

  const handleData = (d) => {
    const text = String(d);
    text.split('\n').filter(Boolean).forEach(l => {
      line(key, l, color);
      logStream.write(`[${new Date().toISOString()}] ${l}\n`);
    });
  };

  proc.stdout.on('data', handleData);
  proc.stderr.on('data', handleData);
  proc.on('exit', (code) => {
    procs[key] = null;
    logStream.end();
    if (code !== null && code !== 0) warn(`${key} exited (code ${code})`);
  });
}

// ── stop one process ──────────────────────────────────────────────────────────
function stopProc(key) {
  if (procs[key]) {
    procs[key].kill('SIGTERM');
    procs[key] = null;
    ok(`Stopped ${key}`);
  }
}

// ── stop all processes + port cleanup ─────────────────────────────────────────
function stopAll() {
  let stopped = false;

  for (const key of Object.keys(procs)) {
    if (procs[key]) {
      procs[key].kill('SIGTERM');
      procs[key] = null;
      ok(`Stopped ${key}`);
      stopped = true;
    }
  }

  for (const port of [3000, 5173, 8765]) {
    try {
      const pid = execSync(`lsof -ti :${port} 2>/dev/null`).toString().trim();
      if (pid) {
        execSync(`kill ${pid} 2>/dev/null`);
        stopped = true;
      }
    } catch (_) {}
  }

  return stopped;
}

module.exports = { procs, startProc, stopProc, stopAll };
