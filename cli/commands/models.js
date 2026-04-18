// asyncat models [list|pull|rm|serve|stop|ps|info]
// Manage local GGUF model files and the built-in llama.cpp server.

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { ROOT, readEnv } from '../lib/env.js';
import { log, ok, warn, err, info, col, spinner } from '../lib/colors.js';
import { getToken, apiGet, apiPost, apiDelete } from '../lib/denApi.js';

const MODELS_DIR = path.join(ROOT, 'den/data/models');

// ── Utilities ─────────────────────────────────────────────────────────────────

function humanSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

function getLocalModels() {
  if (!fs.existsSync(MODELS_DIR)) return [];
  return fs.readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.gguf') || f.endsWith('.bin'))
    .map(f => {
      const full = path.join(MODELS_DIR, f);
      const stat = fs.statSync(full);
      return { name: f, size: stat.size, path: full, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function prompt(question) {
  return new Promise(resolve => {
    const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    tmp.once('line', ans => { tmp.close(); resolve(ans.trim()); });
  });
}

async function getLlamaStatus() {
  try {
    const data = await apiGet('/api/ai/providers/server/status');
    return data;
  } catch (_) { return null; }
}

// ── list ──────────────────────────────────────────────────────────────────────

async function listModels() {
  const models = getLocalModels();
  const env    = readEnv('den/.env');
  const active = env['LOCAL_MODEL_PATH'] ? path.basename(env['LOCAL_MODEL_PATH']) : null;

  // Try to get server status to show which model is loaded
  let serverModel = null;
  try {
    const status = await getLlamaStatus();
    if (status?.status === 'ready' || status?.status === 'loading') {
      serverModel = status.modelFile || status.model || null;
    }
  } catch (_) {}

  log('');
  log(`  ${col('bold', 'Local models')}  ${col('dim', MODELS_DIR)}`);
  log(col('dim', '  ' + '─'.repeat(60)));

  if (models.length === 0) {
    warn(`No .gguf models found in ${col('dim', 'den/data/models/')}`);
    log('');
    info(`Pull a model:  ${col('cyan', 'models pull <url> <filename.gguf>')}`);
    log('');
    return;
  }

  for (const m of models) {
    const isLoaded = serverModel && m.name === serverModel;
    const isActive = active && m.name === active;
    const marker   = isLoaded ? col('green', '▸ ') : isActive ? col('yellow', '▸ ') : '  ';
    const nameStr  = isLoaded
      ? col('green', col('bold', m.name))
      : isActive
        ? col('yellow', m.name)
        : col('white', m.name);
    const tag      = isLoaded ? col('green',  ' (loaded)') : isActive ? col('yellow', ' (active)') : '';
    log(`  ${marker}${nameStr}  ${col('dim', humanSize(m.size))}${tag}`);
  }
  log('');
  info(`Total: ${col('white', String(models.length))} model${models.length !== 1 ? 's' : ''}  ·  ${col('white', humanSize(models.reduce((s, m) => s + m.size, 0)))}`);
  log('');
}

// ── pull ──────────────────────────────────────────────────────────────────────

async function pullModel(args) {
  const [urlArg, filenameArg] = args;

  if (!urlArg) {
    warn('Usage: models pull <url> [filename.gguf]');
    info('Example: models pull https://huggingface.co/.../mistral-7b.gguf');
    return;
  }

  let url = urlArg;
  // Expand HuggingFace shorthand:  mistralai/Mistral-7B-Instruct:Q4_K_M
  // Not auto-resolved here — user must provide a direct GGUF URL
  let filename = filenameArg;

  if (!filename) {
    // Derive from URL
    const urlParts = url.split('/');
    filename = urlParts[urlParts.length - 1].split('?')[0];
    if (!filename.endsWith('.gguf') && !filename.endsWith('.bin')) {
      filename += '.gguf';
    }
  }

  if (!filename.endsWith('.gguf') && !filename.endsWith('.bin')) {
    err('Filename must end with .gguf or .bin');
    return;
  }

  // Ensure models dir exists
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  const destPath = path.join(MODELS_DIR, filename);
  if (fs.existsSync(destPath)) {
    warn(`File already exists: ${col('white', filename)}`);
    const ans = await prompt(`  ${col('yellow', 'Overwrite?')} [y/N]: `);
    if (ans.toLowerCase() !== 'y') { info('Cancelled.'); return; }
    fs.unlinkSync(destPath);
  }

  info(`Pulling ${col('white', filename)}…`);
  info(`From:   ${col('dim', url)}`);
  log('');

  const startTime = Date.now();
  let lastBytes   = 0;
  let lastTime    = startTime;

  function drawProgress(downloaded, total, speed) {
    const pct     = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
    const barW    = 24;
    const filled  = Math.round((pct / 100) * barW);
    const bar     = col('green', '█'.repeat(filled)) + col('dim', '░'.repeat(barW - filled));
    const dlStr   = humanSize(downloaded);
    const totStr  = total > 0 ? humanSize(total) : '?';
    const spdStr  = speed > 0 ? `${humanSize(speed)}/s` : '';
    const pctStr  = String(pct).padStart(3) + '%';

    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `  ${col('cyan', '⟳')} [${bar}] ${col('bold', pctStr)}  ${col('dim', dlStr + ' / ' + totStr)}  ${col('dim', spdStr)}`
    );
  }

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(0) }); // no timeout for large files
  } catch (e) {
    err(`Fetch failed: ${e.message}`);
    return;
  }

  if (!res.ok) {
    err(`HTTP ${res.status}: ${res.statusText}`);
    return;
  }

  const total  = parseInt(res.headers.get('content-length') || '0', 10);
  const writer = fs.createWriteStream(destPath);
  const reader = res.body.getReader();
  let downloaded = 0;

  // Progress interval
  const progressInterval = setInterval(() => {
    const now   = Date.now();
    const dt    = (now - lastTime) / 1000;
    const speed = dt > 0 ? (downloaded - lastBytes) / dt : 0;
    lastBytes   = downloaded;
    lastTime    = now;
    drawProgress(downloaded, total, speed);
  }, 400);

  let writeErr = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      writer.write(Buffer.from(value));
    }
    await new Promise((resolve, reject) => {
      writer.end();
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (e) {
    writeErr = e;
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  } finally {
    clearInterval(progressInterval);
  }

  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);

  if (writeErr) {
    err(`Download failed: ${writeErr.message}`);
    return;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  ok(`Downloaded ${col('white', filename)}  ${col('dim', humanSize(downloaded) + ' in ' + elapsed + 's')}`);
  info(`Load it:   ${col('cyan', 'models serve ' + filename)}`);
}

// ── remove ────────────────────────────────────────────────────────────────────

async function removeModel(name) {
  if (!name) { warn('Usage: models rm <filename>'); return; }
  const models = getLocalModels();
  const found  = models.find(m => m.name === name || m.name === name + '.gguf');
  if (!found) { err(`Model not found: ${col('white', name)}`); return; }

  log('');
  warn(`Permanently delete: ${col('white', found.name)}  (${humanSize(found.size)})`);
  const ans = await prompt(`  ${col('yellow', 'Confirm?')} [y/N]: `);
  if (ans.toLowerCase() !== 'y') { info('Cancelled.'); return; }

  try {
    fs.unlinkSync(found.path);
    ok(`Deleted ${col('white', found.name)}`);
  } catch (e) {
    err(`Delete failed: ${e.message}`);
  }
}

// ── serve ─────────────────────────────────────────────────────────────────────

async function serveModel(args) {
  const filename = args[0];

  if (!filename) {
    // Show list and hint
    const models = getLocalModels();
    if (models.length === 0) {
      warn('No models found. Pull one with: ' + col('cyan', 'models pull <url>'));
      return;
    }
    log('');
    log(`  ${col('bold', 'Available models:')}`);
    for (const m of models) {
      log(`    ${col('cyan', '•')} ${col('white', m.name)}  ${col('dim', humanSize(m.size))}`);
    }
    log('');
    warn(`Specify a model: ${col('cyan', 'models serve <filename.gguf>')}`);
    return;
  }

  try { await getToken(); } catch (e) { err(e.message); return; }

  const models = getLocalModels();
  const found  = models.find(m => m.name === filename || m.name === filename + '.gguf');
  if (!found) {
    err(`Model not found locally: ${col('white', filename)}`);
    info(`Available: ${models.map(m => col('cyan', m.name)).join(', ')}`);
    return;
  }

  info(`Loading ${col('white', found.name)} into llama-server…`);
  info(`${col('dim', '(this may take a moment depending on model size)')}`);

  try {
    await apiPost('/api/ai/providers/server/start', { filename: found.name });
    ok(`llama-server starting with ${col('white', found.name)}`);
    info(`Chat with it directly: ${col('cyan', 'run')}`);
    info(`Or use via asyncat:    ${col('cyan', 'chat')}`);
  } catch (e) {
    err(`Failed to start server: ${e.message}`);
  }
}

// ── stop ──────────────────────────────────────────────────────────────────────

async function stopServer() {
  try { await getToken(); } catch (e) { err(e.message); return; }
  try {
    await apiPost('/api/ai/providers/server/stop', {});
    ok('llama-server stopped.');
  } catch (e) {
    err(`Failed to stop: ${e.message}`);
  }
}

// ── ps ────────────────────────────────────────────────────────────────────────

async function ps() {
  // Also probe llama-server directly
  const env      = readEnv('den/.env');
  const llamaPort = env['LLAMA_SERVER_PORT'] || '8765';
  const llamaBase = `http://127.0.0.1:${llamaPort}`;

  log('');
  log(`  ${col('bold', 'Running models')}`);
  log(col('dim', '  ' + '─'.repeat(48)));

  // Probe llama-server directly
  let directAlive = false;
  let directModels = [];
  try {
    const res = await fetch(`${llamaBase}/v1/models`, {
      headers: { Authorization: 'Bearer local' },
      signal:  AbortSignal.timeout(2000),
    });
    if (res.ok) {
      directAlive = true;
      const data  = await res.json();
      directModels = (data.data || []).map(m => m.id);
    }
  } catch (_) {}

  // Also get den's server status if available
  let denStatus = null;
  try { denStatus = await getLlamaStatus(); } catch (_) {}

  const icon    = directAlive ? col('green', '●') : col('dim', '○');
  const status  = denStatus?.status || (directAlive ? 'ready' : 'offline');
  const statusC = status === 'ready' ? col('green', status)
                : status === 'loading' ? col('yellow', status)
                : col('dim', status);

  log(`  ${icon} ${col('white', 'llama-server')}  ${col('dim', `port ${llamaPort}`)}  ${statusC}`);

  if (directAlive) {
    if (directModels.length > 0) {
      for (const m of directModels) {
        log(`      ${col('dim', 'model:')} ${col('cyan', m)}`);
      }
    } else if (denStatus?.modelFile) {
      log(`      ${col('dim', 'model:')} ${col('cyan', denStatus.modelFile)}`);
    }
  }

  if (denStatus?.ctxSize)    log(`      ${col('dim', 'ctx:  ')} ${col('white', String(denStatus.ctxSize))}`);
  if (denStatus?.error)      log(`      ${col('dim', 'error:')} ${col('red',   denStatus.error)}`);

  log('');

  if (!directAlive) {
    info(`No models running. Load one: ${col('cyan', 'models serve <filename.gguf>')}`);
    log('');
  }
}

// ── info ──────────────────────────────────────────────────────────────────────

function infoModel(name) {
  if (!name) { warn('Usage: models info <filename>'); return; }
  const models = getLocalModels();
  const found  = models.find(m => m.name === name || m.name === name + '.gguf');
  if (!found) { err(`Model not found: ${col('white', name)}`); return; }

  log('');
  log(`  ${col('bold', found.name)}`);
  log(col('dim', '  ' + '─'.repeat(48)));
  log(`  ${col('cyan', 'size    ')}  ${col('white', humanSize(found.size))}  ${col('dim', `(${found.size.toLocaleString()} bytes)`)}`);
  log(`  ${col('cyan', 'path    ')}  ${col('dim',   found.path)}`);
  log(`  ${col('cyan', 'modified')}  ${col('white', found.mtime.toLocaleString())}`);
  log('');
  info(`Load it: ${col('cyan', 'models serve ' + found.name)}`);
  log('');
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function run(args = []) {
  const sub = (args[0] || 'list').toLowerCase();

  switch (sub) {
    case 'list':   await listModels();            break;
    case 'pull':   await pullModel(args.slice(1)); break;
    case 'rm':
    case 'remove': await removeModel(args[1]);    break;
    case 'serve':  await serveModel(args.slice(1)); break;
    case 'stop':   await stopServer();             break;
    case 'ps':     await ps();                     break;
    case 'info':   infoModel(args[1]);             break;
    default:
      warn(`Unknown models subcommand: ${col('white', sub)}`);
      log(`  Usage: ${col('cyan', 'models')} ${col('dim', '[list|pull <url>|rm <name>|serve <name>|stop|ps|info <name>]')}`);
  }
}
