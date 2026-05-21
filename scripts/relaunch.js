#!/usr/bin/env node
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = process.env.ASYNCAT_RESTART_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_PID = Number(process.env.ASYNCAT_OLD_BACKEND_PID || 0);
const DEN_PORT = Number(process.env.ASYNCAT_DEN_PORT || 8716);
const NEKO_PORT = Number(process.env.ASYNCAT_NEKO_PORT || 8717);
const REOPEN_APP = process.env.ASYNCAT_REOPEN_APP === '1';
const IS_DEV_RESTART = process.env.ASYNCAT_DEV_RESTART === '1';
const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function spawnDetached(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      ASYNCAT_RELAUNCHED: '1',
      ASYNCAT_INSTALL_DIR: process.env.ASYNCAT_INSTALL_DIR || ROOT,
    },
  });
  child.unref();
  return child;
}

function killPid(pid) {
  if (!pid || pid === process.pid) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process may already be gone.
  }
}

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(700);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port, shouldBeOpen, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port) === shouldBeOpen) return true;
    await wait(500);
  }
  return false;
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEN_PORT}/health`, { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // Server is still down.
    }
    await wait(700);
  }
  return false;
}

function startBackend() {
  spawnDetached(process.execPath, ['den/src/index.js'], ROOT);
}

function startFrontend() {
  const distDir = path.join(ROOT, 'neko', 'dist');
  const args = fs.existsSync(distDir)
    ? ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(NEKO_PORT)]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(NEKO_PORT)];
  spawnDetached(NPM, args, path.join(ROOT, 'neko'));
}

function reopenApp() {
  const url = `http://localhost:${NEKO_PORT}`;
  if (process.platform === 'darwin') {
    const appPath = path.join(os.homedir(), 'Applications', 'Asyncat.app');
    if (fs.existsSync(appPath)) {
      spawnDetached('open', [appPath], ROOT);
      return;
    }
    spawnDetached('open', [url], ROOT);
  } else if (IS_WIN) {
    spawnDetached('cmd.exe', ['/c', 'start', '', url], ROOT);
  } else {
    spawnDetached('xdg-open', [url], ROOT);
  }
}

await wait(250);
killPid(OLD_PID);
await waitForPort(DEN_PORT, false, 8000);

if (IS_DEV_RESTART) {
  await waitForHealth(12000);
}

if (!(await portOpen(DEN_PORT))) {
  startBackend();
}

if (!(await portOpen(NEKO_PORT))) {
  startFrontend();
}

await waitForHealth(30000);
await waitForPort(NEKO_PORT, true, 15000);

if (REOPEN_APP) reopenApp();
