// electron/backend.js — Backend (den) lifecycle management
//
// Node.js binary selection:
//   Packaged builds → resources/node-bin/node  (bundled at build time by scripts/bundle-node.js)
//                     This is the same binary that compiled better-sqlite3, so the ABI matches.
//   Dev mode        → system Node  (same one npm install used, same ABI)
//
// Why not ELECTRON_RUN_AS_NODE?
//   better-sqlite3 v12.x uses NAN V8 APIs that Electron 42 modified for pointer-sandbox
//   hardening. It cannot be compiled against Electron's headers, and its NMV differs from
//   Electron's bundled Node. System/bundled Node sidesteps both problems.
//
import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import { DEN_ENTRY, DEN_CWD, BACKEND_PORT, HEALTH_URL, IS_DEV } from './constants.js';

let backendProcess = null;
let isShuttingDown = false;
let cachedNodeBinary = null;

// ─── Node binary selection ────────────────────────────────────────────────────

function getBundledNodePath() {
  const name = process.platform === 'win32' ? 'node.exe' : 'node';
  return path.join(process.resourcesPath, 'node-bin', name);
}

function findSystemNode() {
  const candidates = [process.env.ASYNCAT_NODE_PATH];

  try {
    const cmd = process.platform === 'win32' ? 'where node' : 'which node';
    const result = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
    const first = result.split('\n')[0].trim();
    if (first) candidates.push(first);
  } catch {}

  if (process.platform === 'darwin') {
    candidates.push(
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
      `${process.env.HOME}/.nvm/current/bin/node`,
      `${process.env.HOME}/.volta/bin/node`,
      `${process.env.HOME}/.fnm/current/bin/node`,
    );
  } else if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\nodejs\\node.exe',
      `${process.env.APPDATA}\\nvm\\current\\node.exe`,
    );
  } else {
    candidates.push(
      '/usr/bin/node',
      '/usr/local/bin/node',
      `${process.env.HOME}/.nvm/current/bin/node`,
    );
  }

  candidates.push('node');

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const version = execSync(`"${candidate}" --version`, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (version.startsWith('v')) {
        console.log(`[Asyncat] Using system Node: ${candidate} (${version})`);
        return candidate;
      }
    } catch {}
  }

  console.warn('[Asyncat] Could not find system Node.js, falling back to "node"');
  return 'node';
}

function resolveNodeBinary() {
  if (app.isPackaged) {
    const bundled = getBundledNodePath();
    if (fs.existsSync(bundled)) {
      console.log(`[Asyncat] Using bundled Node: ${bundled}`);
      return bundled;
    }
    console.warn('[Asyncat] Bundled node binary not found — did you run scripts/bundle-node.js before building? Falling back to system node.');
  }
  return findSystemNode();
}

// ─── First-run: create .env in userData ───────────────────────────────────────
// In packaged builds the app bundle is read-only, so we can't write den/.env.
// Copy the example from extraResources to userData on first launch instead.

function setupEnvFile() {
  if (!app.isPackaged) return; // dev handles .env via postinstall

  const userEnvPath = path.join(DEN_CWD, '.env');
  if (fs.existsSync(userEnvPath)) return; // already set up

  const examplePath = path.join(process.resourcesPath, '.env.example');
  if (!fs.existsSync(examplePath)) {
    console.warn('[Asyncat] .env.example not found in resources, skipping .env setup');
    return;
  }

  let content = fs.readFileSync(examplePath, 'utf8');

  // Inject fresh cryptographic secrets so every install is unique
  const jwt = randomBytes(32).toString('hex');
  const pass = [randomBytes(2), randomBytes(2), randomBytes(2)].map(b => b.toString('hex')).join('-');

  content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${jwt}`);
  content = content.replace(/^LOCAL_PASSWORD=.*$/m, `LOCAL_PASSWORD=${pass}`);

  fs.writeFileSync(userEnvPath, content);
  console.log('[Asyncat] Created .env in user data directory');
}

// ─── Backend lifecycle ────────────────────────────────────────────────────────

export function startBackend() {
  return new Promise((resolve, reject) => {
    if (backendProcess) { resolve(); return; }

    isShuttingDown = false;

    // Ensure the data directory exists — db/client.js, storage services, and
    // MCP config all default to cwd/data/ via path.resolve('data', ...).
    const dataDir = path.join(DEN_CWD, 'data');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (e) {
      console.warn('[Asyncat] Could not pre-create data directory:', e.message);
    }

    // Set up .env on first run in packaged builds
    setupEnvFile();

    if (!cachedNodeBinary) {
      cachedNodeBinary = resolveNodeBinary();
    }

    const env = {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: IS_DEV ? 'development' : 'production',
      // Ensure ELECTRON_RUN_AS_NODE is cleared — we're using a plain Node binary
      ELECTRON_RUN_AS_NODE: undefined,
      // In packaged builds, logger.js resolves log path from __dirname inside
      // the read-only app bundle. Override to a writable OS location.
      ...(app.isPackaged && {
        ASYNCAT_LOG_DIR: path.join(DEN_CWD, 'logs'),
      }),
    };

    backendProcess = spawn(cachedNodeBinary, [DEN_ENTRY], {
      cwd: DEN_CWD,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    backendProcess.stdout?.on('data', (data) => {
      if (IS_DEV) process.stdout.write(`[den] ${data}`);
    });
    backendProcess.stderr?.on('data', (data) => {
      if (IS_DEV) process.stderr.write(`[den:err] ${data}`);
    });

    backendProcess.on('error', (err) => {
      console.error('[Asyncat] Backend process error:', err.message);
      backendProcess = null;
      reject(err);
    });

    backendProcess.on('exit', (code, signal) => {
      const prev = backendProcess;
      backendProcess = null;

      if (isShuttingDown) return;

      console.warn(`[Asyncat] Backend exited (code=${code}, signal=${signal})`);

      if (prev && !isShuttingDown) {
        console.log('[Asyncat] Auto-restarting backend in 2s...');
        setTimeout(() => {
          if (!isShuttingDown) startBackend().catch(() => {});
        }, 2000);
      }
    });

    waitForHealth(30_000)
      .then(resolve)
      .catch((err) => {
        console.error('[Asyncat] Backend failed to become healthy:', err.message);
        reject(err);
      });
  });
}

export function stopBackend() {
  return new Promise((resolve) => {
    isShuttingDown = true;

    if (!backendProcess) { resolve(); return; }

    const proc = backendProcess;
    backendProcess = null;

    const forceKill = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve();
    }, 5000);

    proc.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });

    try {
      proc.kill('SIGTERM');
    } catch {
      clearTimeout(forceKill);
      resolve();
    }
  });
}

export function isBackendRunning() {
  return backendProcess !== null && !backendProcess.killed;
}

function waitForHealth(timeoutMs = 30_000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Backend health check timed out after ${timeoutMs}ms`));
        return;
      }

      http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
        res.resume();
      }).on('error', () => {
        setTimeout(check, 500);
      });
    };

    setTimeout(check, 800);
  });
}
