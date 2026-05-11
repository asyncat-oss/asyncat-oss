// whisperServerManager.js — Whisper.cpp server lifecycle manager
// Spawns whisper-server as a child process for local speech-to-text.
// Binary resolution: WHISPER_BINARY_PATH env → ~/.asyncat/whisper.cpp/ → which whisper-server → homebrew
// State machine: idle → loading → ready (or error)

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);
const IS_WIN = process.platform === 'win32';

const WHISPER_PORT = parseInt(process.env.WHISPER_SERVER_PORT ?? '8767', 10);
const WHISPER_HOST = '127.0.0.1';
const LOAD_TIMEOUT_MS = 120_000;
const POLL_INTERVAL = 700;

// ── State ──────────────────────────────────────────────────────────────────────
let state = { status: 'idle', model: null, port: WHISPER_PORT, error: null, pid: null };
let serverProcess = null;
let loadTimeout = null;
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) {
    try { fn(getStatus()); } catch { /* ignore */ }
  }
}

function setState(patch) {
  Object.assign(state, patch);
  notify();
}

// ── Binary detection ───────────────────────────────────────────────────────────

function asyncatHome() {
  if (IS_WIN) {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Asyncat');
  }
  return path.join(os.homedir(), '.asyncat');
}

function whisperBinaryCandidates() {
  const home = os.homedir();
  const envPath = (process.env.WHISPER_BINARY_PATH || '').trim();
  return [
    envPath,
    path.join(asyncatHome(), 'whisper.cpp', 'whisper-server'),
    path.join(asyncatHome(), 'whisper.cpp', 'main'),
    path.join(home, '.local', 'bin', 'whisper-server'),
    '/usr/local/bin/whisper-server',
    '/opt/homebrew/bin/whisper-server',
    '/usr/bin/whisper-server',
    // whisper.cpp builds
    path.join(home, 'whisper.cpp', 'build', 'bin', 'whisper-server'),
    path.join(home, 'whisper.cpp', 'server'),
  ].filter(Boolean);
}

async function findWhisperBinary() {
  // Check candidates
  for (const candidate of whisperBinaryCandidates()) {
    if (candidate && fs.existsSync(candidate)) {
      return { found: true, path: candidate, source: 'file' };
    }
  }

  // Try PATH
  try {
    const cmd = IS_WIN ? 'where whisper-server 2>nul' : 'which whisper-server 2>/dev/null';
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    const p = stdout.trim().split('\n')[0]?.trim();
    if (p) return { found: true, path: p, source: 'PATH' };
  } catch { /* not in PATH */ }

  return { found: false, path: null, source: null };
}

// ── Server lifecycle ───────────────────────────────────────────────────────────

export async function checkBinary() {
  return findWhisperBinary();
}

export function getStatus() {
  return { ...state };
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export async function startWhisper(modelPath) {
  if (state.status === 'loading' || state.status === 'ready') {
    if (state.model === modelPath) return state;
    await stopWhisper();
  }

  const binary = await findWhisperBinary();
  if (!binary.found) {
    setState({ status: 'error', error: 'Whisper binary not found. Install whisper.cpp or set WHISPER_BINARY_PATH.', model: null });
    throw new Error(state.error);
  }

  setState({ status: 'loading', model: path.basename(modelPath), error: null });

  const args = [
    '--model', modelPath,
    '--port', String(WHISPER_PORT),
    '--host', WHISPER_HOST,
    '--convert',
  ];

  try {
    serverProcess = spawn(binary.path, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    serverProcess.on('error', (err) => {
      console.error('[whisper] Process error:', err.message);
      setState({ status: 'error', error: err.message, pid: null });
      serverProcess = null;
    });

    serverProcess.on('exit', (code) => {
      if (state.status !== 'idle') {
        console.info(`[whisper] Process exited with code ${code}`);
        setState({ status: 'idle', model: null, pid: null, error: code ? `Exited with code ${code}` : null });
      }
      serverProcess = null;
    });

    // Capture stderr for startup detection
    let stderrBuffer = '';
    serverProcess.stderr?.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
      // whisper-server logs "whisper_init_from_file_with_params_no_state: ... model loaded" on success
      if (stderrBuffer.includes('model loaded') || stderrBuffer.includes('server is listening')) {
        if (state.status === 'loading') {
          setState({ status: 'ready', error: null, pid: serverProcess?.pid || null });
          if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
        }
      }
    });

    setState({ pid: serverProcess.pid });

    // Poll for readiness
    loadTimeout = setTimeout(async () => {
      if (state.status === 'loading') {
        // Try HTTP health check
        const ready = await pollHealth();
        if (ready) {
          setState({ status: 'ready', error: null });
        } else {
          setState({ status: 'error', error: 'Whisper server did not become ready within timeout.' });
        }
      }
      loadTimeout = null;
    }, LOAD_TIMEOUT_MS);

    // Start polling for health
    pollUntilReady();

    return state;
  } catch (err) {
    setState({ status: 'error', error: err.message, model: null });
    throw err;
  }
}

async function pollHealth() {
  try {
    const res = await fetch(`http://${WHISPER_HOST}:${WHISPER_PORT}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function pollUntilReady() {
  for (let i = 0; i < Math.ceil(LOAD_TIMEOUT_MS / POLL_INTERVAL); i++) {
    if (state.status !== 'loading') return;
    const ready = await pollHealth();
    if (ready) {
      setState({ status: 'ready', error: null });
      if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
      return;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

export async function stopWhisper() {
  if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }

  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      // Give it a moment to exit gracefully
      await new Promise(r => setTimeout(r, 500));
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    } catch { /* already dead */ }
    serverProcess = null;
  }

  setState({ status: 'idle', model: null, error: null, pid: null });
}

/**
 * Convert arbitrary audio (WebM, MP3, OGG, etc.) to 16 kHz mono 16-bit PCM WAV
 * using ffmpeg. This ensures whisper-server always receives valid WAV data.
 */
async function convertToWav(audioBuffer) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 });

    const chunks = [];
    let stderrOutput = '';

    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderrOutput.slice(0, 300)}`));
        return;
      }
      const wav = Buffer.concat(chunks);
      if (wav.length === 0) {
        reject(new Error('ffmpeg produced no output'));
        return;
      }
      resolve(wav);
    });

    proc.on('error', (err) => {
      reject(new Error(`ffmpeg process error: ${err.message}`));
    });

    proc.stdin.write(audioBuffer);
    proc.stdin.end();
  });
}

/**
 * Transcribe an audio buffer using the running whisper server.
 * @param {Buffer} audioBuffer - WAV/MP3/OGG/WebM audio data
 * @param {object} options - { language?, translate? }
 * @returns {Promise<{text: string, segments: Array}>}
 */
export async function transcribe(audioBuffer, options = {}) {
  if (state.status !== 'ready') {
    throw new Error('Whisper server is not running. Start a model first.');
  }

  // Convert any input format to standard WAV so whisper-server receives valid PCM.
  let wavBuffer;
  try {
    wavBuffer = await convertToWav(audioBuffer);
  } catch (convErr) {
    console.error('[whisper] ffmpeg conversion failed:', convErr.message);
    throw new Error(`Audio conversion failed. Ensure ffmpeg is installed: ${convErr.message}`);
  }

  const boundary = `----WhisperBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
  const crlf = '\r\n';
  const parts = [];

  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n`));
  parts.push(Buffer.from(`Content-Type: audio/wav\r\n\r\n`));
  parts.push(wavBuffer);
  parts.push(Buffer.from('\r\n'));

  if (options.language) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="language"\r\n\r\n`));
    parts.push(Buffer.from(`${options.language}\r\n`));
  }

  if (options.translate) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="translate"\r\n\r\n`));
    parts.push(Buffer.from('true\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="response_format"\r\n\r\n`));
  parts.push(Buffer.from('json\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const res = await fetch(`http://${WHISPER_HOST}:${WHISPER_PORT}/inference`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'Transcription failed');
    throw new Error(`Whisper transcription failed: ${err}`);
  }

  const result = await res.json();
  return {
    text: result.text || '',
    segments: result.segments || [],
    language: result.language || options.language || 'auto',
  };
}

export const WHISPER_PORT_NUM = WHISPER_PORT;
