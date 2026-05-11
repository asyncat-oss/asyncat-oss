// ttsServerManager.js — Piper TTS server lifecycle manager
// Manages a local Piper text-to-speech process for generating audio from text.
// Binary resolution: PIPER_BINARY_PATH env → ~/.asyncat/piper/ → which piper → homebrew
// State machine: idle → loading → ready (or error)

import { spawn, exec, execSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);
const IS_WIN = process.platform === 'win32';

// ── TTS text normalization ───────────────────────────────────────────────────
// Piper reads text literally, so we normalize it to avoid spoken emojis,
// markdown symbols, URLs, and other non-speech content.

function normalizeTtsText(text) {
  if (!text || typeof text !== 'string') return '';

  let t = text;

  // 1. Remove emojis and other pictographic symbols
  // Matches most emoji ranges including skin-tone modifiers and ZWJ sequences
  t = t.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{200D}\u{FE0F}\u{20E3}]/gu, '');

  // 2. Replace URLs with "link"
  t = t.replace(/https?:\/\/[^\s]+/gi, 'link');

  // 3. Remove markdown formatting
  t = t.replace(/(\*\*|\*|__|_|`|~|~~|\[|\]|\(|\)|#|\||>|!)/g, '');

  // 4. Normalize ellipsis to a comma pause
  t = t.replace(/\.{3,}/g, ',');

  // 5. Replace common code/math symbols that get read oddly
  t = t.replace(/\b(\d+)\s*x\s*(\d+)\b/g, '$1 by $2');      // 1920x1080 → 1920 by 1080
  t = t.replace(/&/g, ' and ');
  t = t.replace(/@/g, ' at ');
  t = t.replace(/%/g, ' percent ');
  t = t.replace(/\$/g, ' dollar ');
  t = t.replace(/€/g, ' euro ');
  t = t.replace(/£/g, ' pound ');
  t = t.replace(/°/g, ' degrees ');
  t = t.replace(/±/g, ' plus or minus ');
  t = t.replace(/≠/g, ' not equal to ');
  t = t.replace(/≤/g, ' less than or equal to ');
  t = t.replace(/≥/g, ' greater than or equal to ');
  t = t.replace(/→/g, ' to ');
  t = t.replace(/←/g, ' from ');
  t = t.replace(/⇒/g, ' implies ');

  // 6. Remove stray asterisks and dashes that might remain
  t = t.replace(/[*#|`~]/g, '');

  // 7. Collapse multiple spaces and trim
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

const TTS_PORT = parseInt(process.env.TTS_SERVER_PORT ?? '8768', 10);
const TTS_HOST = '127.0.0.1';

// ── State ──────────────────────────────────────────────────────────────────────
let state = { status: 'idle', model: null, modelPath: null, error: null, pid: null };
let currentModelPath = null;
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

function piperBinaryCandidates() {
  const home = os.homedir();
  const envPath = (process.env.PIPER_BINARY_PATH || '').trim();
  return [
    envPath,
    path.join(asyncatHome(), 'piper', 'piper'),
    path.join(home, '.local', 'bin', 'piper'),
    '/usr/local/bin/piper',
    '/opt/homebrew/bin/piper',
    '/usr/bin/piper',
    path.join(home, 'piper', 'piper'),
  ].filter(Boolean);
}

async function findPiperBinary() {
  for (const candidate of piperBinaryCandidates()) {
    if (candidate && fs.existsSync(candidate)) {
      return { found: true, path: candidate, source: 'file' };
    }
  }

  try {
    const cmd = IS_WIN ? 'where piper 2>nul' : 'which piper 2>/dev/null';
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    const p = stdout.trim().split('\n')[0]?.trim();
    if (p) return { found: true, path: p, source: 'PATH' };
  } catch { /* not in PATH */ }

  return { found: false, path: null, source: null };
}

// ── Server lifecycle ───────────────────────────────────────────────────────────

export async function checkBinary() {
  return findPiperBinary();
}

export function getStatus() {
  return { ...state };
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export async function startTts(modelPath) {
  if (state.status === 'ready' && currentModelPath === modelPath) {
    return state;
  }

  const binary = await findPiperBinary();
  if (!binary.found) {
    // Piper doesn't need a long-running server — it's used in pipe mode.
    // Mark as "ready" in pipe mode if binary exists.
    setState({ status: 'error', error: 'Piper binary not found. Install piper-tts or set PIPER_BINARY_PATH.', model: null });
    throw new Error(state.error);
  }

  // Validate model file exists
  if (!fs.existsSync(modelPath)) {
    setState({ status: 'error', error: `TTS model not found: ${modelPath}`, model: null });
    throw new Error(state.error);
  }

  // Piper works in pipe mode (stdin text → stdout wav), no server needed.
  // We just validate the binary + model and mark as ready.
  currentModelPath = modelPath;
  setState({
    status: 'ready',
    model: path.basename(modelPath).replace(/\.onnx$/i, ''),
    modelPath,
    error: null,
  });

  return state;
}

export async function stopTts() {
  currentModelPath = null;
  setState({ status: 'idle', model: null, modelPath: null, error: null, pid: null });
}

/**
 * Synthesize text to speech using Piper.
 * Returns a WAV audio buffer.
 * @param {string} text - Text to speak
 * @param {object} options - { speakerId?, lengthScale?, noiseScale? }
 * @returns {Promise<Buffer>}
 */
export async function synthesize(text, options = {}) {
  if (state.status !== 'ready' || !currentModelPath) {
    throw new Error('TTS is not loaded. Start a voice model first.');
  }

  const binary = await findPiperBinary();
  if (!binary.found) {
    throw new Error('Piper binary not found.');
  }

  return new Promise((resolve, reject) => {
    const args = [
      '--model', currentModelPath,
      '--output_raw',
    ];

    if (options.speakerId !== undefined) {
      args.push('--speaker', String(options.speakerId));
    }
    if (options.lengthScale) {
      args.push('--length_scale', String(options.lengthScale));
    }
    if (options.noiseScale) {
      args.push('--noise_scale', String(options.noiseScale));
    }

    const proc = spawn(binary.path, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    });

    const chunks = [];
    let stderrOutput = '';

    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderrOutput.slice(0, 500)}`));
        return;
      }

      const rawPcm = Buffer.concat(chunks);
      if (rawPcm.length === 0) {
        reject(new Error('Piper produced no audio output'));
        return;
      }

      // Wrap raw PCM in a WAV header
      // Piper outputs 16-bit mono PCM at the model's sample rate (usually 22050)
      const sampleRate = 22050;
      const wav = createWavBuffer(rawPcm, sampleRate, 1, 16);
      resolve(wav);
    });

    proc.on('error', (err) => {
      reject(new Error(`Piper process error: ${err.message}`));
    });

    // Normalize text before sending to Piper
    const normalizedText = normalizeTtsText(text);

    // Write text to stdin and close
    proc.stdin.write(normalizedText || text);
    proc.stdin.end();
  });
}

/**
 * Create a WAV file buffer from raw PCM data.
 */
function createWavBuffer(pcmData, sampleRate, channels, bitsPerSample) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);           // sub-chunk size
  buffer.writeUInt16LE(1, 20);            // PCM format
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, headerSize);

  return buffer;
}

export const TTS_PORT_NUM = TTS_PORT;
