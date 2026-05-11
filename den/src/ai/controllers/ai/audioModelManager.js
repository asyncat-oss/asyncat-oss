// audioModelManager.js — Audio model manager (Whisper STT + Piper TTS)
// Scans data/models/audio/ for audio model files.
// Whisper models: .bin / .gguf files (ggml-base.bin, ggml-large-v3.bin, etc.)
// Piper TTS voices: .onnx files with matching .onnx.json config

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../../db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Audio models live inside the same data/models directory as LLMs
const BASE_MODELS_DIR = process.env.MODELS_PATH
  ? path.resolve(process.env.MODELS_PATH)
  : path.resolve(__dirname, '../../../../data/models');

const AUDIO_DIR = path.join(BASE_MODELS_DIR, 'audio');
const WHISPER_DIR = path.join(AUDIO_DIR, 'whisper');
const TTS_DIR = path.join(AUDIO_DIR, 'tts');

// Ensure directories exist
fs.mkdirSync(WHISPER_DIR, { recursive: true });
fs.mkdirSync(TTS_DIR, { recursive: true });

// ── Caches ─────────────────────────────────────────────────────────────────────
let cachedWhisperModels = null;
let cachedTtsModels = null;
let lastWhisperScan = 0;
let lastTtsScan = 0;
const CACHE_TTL = 10000;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1e6;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1e3;
  return `${kb.toFixed(0)} KB`;
}

// ── Whisper Models ─────────────────────────────────────────────────────────────

/**
 * Detect Whisper model metadata from filename.
 * Whisper models follow: ggml-{size}[-{lang}][-{variant}].bin
 */
function parseWhisperModelName(filename) {
  const base = filename.replace(/\.(bin|gguf)$/i, '');
  const parts = base.split('-');

  // Common whisper model sizes
  const sizes = ['tiny', 'base', 'small', 'medium', 'large', 'large-v1', 'large-v2', 'large-v3', 'large-v3-turbo'];
  let size = 'unknown';
  let language = 'multilingual';

  for (const s of sizes) {
    if (base.includes(s)) { size = s; break; }
  }

  // Check for language-specific models (e.g., ggml-base.en.bin)
  if (base.includes('.en') || base.includes('-en')) {
    language = 'english';
  }

  // Estimate quality based on model size
  const qualityMap = {
    'tiny': 'Low — fastest, least accurate',
    'base': 'Fair — good speed/accuracy balance',
    'small': 'Good — recommended for general use',
    'medium': 'Very Good — slower but more accurate',
    'large': 'Excellent — highest accuracy',
    'large-v1': 'Excellent — original large',
    'large-v2': 'Excellent — improved large',
    'large-v3': 'Best — latest & most accurate',
    'large-v3-turbo': 'Best — fast & most accurate',
  };

  return {
    displayName: base.replace(/^ggml-/, '').replace(/[_-]/g, ' '),
    size,
    language,
    quality: qualityMap[size] || 'Unknown',
  };
}

export function listWhisperModels() {
  const now = Date.now();
  if (cachedWhisperModels && (now - lastWhisperScan < CACHE_TTL)) {
    return cachedWhisperModels;
  }

  const models = [];

  // Scan whisper directory for .bin and .gguf files
  try {
    const files = fs.readdirSync(WHISPER_DIR);
    for (const filename of files) {
      if (!filename.match(/\.(bin|gguf)$/i)) continue;
      const filePath = path.join(WHISPER_DIR, filename);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        const meta = parseWhisperModelName(filename);
        models.push({
          id: filename,
          name: meta.displayName,
          filename,
          path: filePath,
          type: 'whisper',
          engineType: 'whisper',
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          modelSize: meta.size,
          language: meta.language,
          quality: meta.quality,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch { /* skip unreadable files */ }
    }
  } catch { /* directory doesn't exist yet */ }

  // Add custom paths with type='whisper'
  try {
    const customEntries = db.prepare("SELECT * FROM custom_model_paths WHERE type = 'whisper'").all();
    for (const entry of customEntries) {
      const modelPath = (entry.path || '').trim();
      try {
        const stat = fs.statSync(modelPath);
        const filename = path.basename(modelPath);
        const meta = parseWhisperModelName(filename);
        models.push({
          id: entry.id,
          isExternal: true,
          name: entry.name || meta.displayName,
          filename,
          path: modelPath,
          type: 'whisper',
          engineType: 'whisper',
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          modelSize: meta.size,
          language: meta.language,
          quality: meta.quality,
          createdAt: entry.created_at,
          modifiedAt: entry.created_at,
        });
      } catch {
        models.push({
          id: entry.id,
          isExternal: true,
          isMissing: true,
          name: entry.name,
          filename: path.basename(modelPath),
          path: modelPath,
          type: 'whisper',
          engineType: 'whisper',
          error: 'File not found',
          createdAt: entry.created_at,
        });
      }
    }
  } catch { /* db not ready */ }

  // Deduplicate by path
  const seen = new Set();
  const deduped = [];
  for (const m of models) {
    const p = (m.path || '').replace(/[\\/]+$/, '');
    if (seen.has(p)) continue;
    seen.add(p);
    deduped.push(m);
  }

  deduped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  cachedWhisperModels = deduped;
  lastWhisperScan = now;
  return deduped;
}

// ── TTS Voice Models ───────────────────────────────────────────────────────────

/**
 * Parse Piper TTS voice metadata from filename and optional .json config.
 * Voice models follow: {language}-{name}-{quality}.onnx
 * e.g., en_US-amy-medium.onnx
 */
function parseTtsVoiceName(filename, configPath = null) {
  const base = filename.replace(/\.onnx$/i, '');
  let language = 'unknown';
  let voiceName = base;
  let quality = 'medium';

  // Parse Piper naming convention: lang_REGION-name-quality
  const match = base.match(/^([a-z]{2}(?:_[A-Z]{2})?)-(.+?)-(x_low|low|medium|high)$/);
  if (match) {
    language = match[1];
    voiceName = match[2];
    quality = match[3];
  }

  // Try reading the .json config for more metadata
  let config = null;
  if (configPath && fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch { /* ignore bad config */ }
  }

  const qualityLabels = {
    'x_low': 'Extra Low — fastest',
    'low': 'Low — fast',
    'medium': 'Medium — balanced',
    'high': 'High — best quality',
  };

  return {
    displayName: voiceName.replace(/[_-]/g, ' '),
    language: config?.language?.code || language,
    languageName: config?.language?.name_english || language,
    quality,
    qualityLabel: qualityLabels[quality] || quality,
    sampleRate: config?.audio?.sample_rate || 22050,
    speakerId: config?.speaker_id_map ? Object.keys(config.speaker_id_map) : [],
    config,
  };
}

export function listTtsModels() {
  const now = Date.now();
  if (cachedTtsModels && (now - lastTtsScan < CACHE_TTL)) {
    return cachedTtsModels;
  }

  const models = [];

  // Scan TTS directory for .onnx files
  try {
    const files = fs.readdirSync(TTS_DIR);
    for (const filename of files) {
      if (!filename.endsWith('.onnx')) continue;
      const filePath = path.join(TTS_DIR, filename);
      const configPath = filePath + '.json';
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        const meta = parseTtsVoiceName(filename, configPath);
        const hasConfig = fs.existsSync(configPath);
        models.push({
          id: filename,
          name: meta.displayName,
          filename,
          path: filePath,
          configPath: hasConfig ? configPath : null,
          missingConfig: !hasConfig,
          type: 'tts',
          engineType: 'tts',
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          language: meta.language,
          languageName: meta.languageName,
          quality: meta.quality,
          qualityLabel: meta.qualityLabel,
          sampleRate: meta.sampleRate,
          speakers: meta.speakerId,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch { /* skip */ }
    }
  } catch { /* directory doesn't exist yet */ }

  // Add custom paths with type='tts'
  try {
    const customEntries = db.prepare("SELECT * FROM custom_model_paths WHERE type = 'tts'").all();
    for (const entry of customEntries) {
      const modelPath = (entry.path || '').trim();
      try {
        const stat = fs.statSync(modelPath);
        const filename = path.basename(modelPath);
        const configPath = modelPath + '.json';
        const hasConfig = fs.existsSync(configPath);
        const meta = parseTtsVoiceName(filename, hasConfig ? configPath : null);
        models.push({
          id: entry.id,
          isExternal: true,
          name: entry.name || meta.displayName,
          filename,
          path: modelPath,
          configPath: hasConfig ? configPath : null,
          missingConfig: !hasConfig,
          type: 'tts',
          engineType: 'tts',
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          language: meta.language,
          languageName: meta.languageName,
          quality: meta.quality,
          qualityLabel: meta.qualityLabel,
          sampleRate: meta.sampleRate,
          speakers: meta.speakerId,
          createdAt: entry.created_at,
          modifiedAt: entry.created_at,
        });
      } catch {
        models.push({
          id: entry.id,
          isExternal: true,
          isMissing: true,
          name: entry.name,
          filename: path.basename(modelPath),
          path: modelPath,
          type: 'tts',
          engineType: 'tts',
          error: 'File not found',
          createdAt: entry.created_at,
        });
      }
    }
  } catch { /* db not ready */ }

  // Deduplicate by path
  const seen = new Set();
  const deduped = [];
  for (const m of models) {
    const p = (m.path || '').replace(/[\\/]+$/, '');
    if (seen.has(p)) continue;
    seen.add(p);
    deduped.push(m);
  }

  deduped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  cachedTtsModels = deduped;
  lastTtsScan = now;
  return deduped;
}

// ── Combined listing ───────────────────────────────────────────────────────────

export function listAllAudioModels() {
  return {
    whisper: listWhisperModels(),
    tts: listTtsModels(),
  };
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export function deleteAudioModel(filename, type) {
  const dir = type === 'whisper' ? WHISPER_DIR : TTS_DIR;
  const filePath = path.join(dir, path.basename(filename));
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio model not found: ${filename}`);
  }
  fs.unlinkSync(filePath);

  // Also remove config file for TTS
  if (type === 'tts') {
    const configPath = filePath + '.json';
    if (fs.existsSync(configPath)) {
      try { fs.unlinkSync(configPath); } catch { /* ignore */ }
    }
  }

  clearCache(type);
  return { success: true };
}

export function deleteCustomAudioPath(id) {
  db.prepare("DELETE FROM custom_model_paths WHERE id = ? AND type IN ('whisper', 'tts')").run(id);
  clearCache();
  return { success: true };
}

// ── Cache management ───────────────────────────────────────────────────────────

export function clearCache(type = null) {
  if (!type || type === 'whisper') { cachedWhisperModels = null; lastWhisperScan = 0; }
  if (!type || type === 'tts') { cachedTtsModels = null; lastTtsScan = 0; }
}

export { WHISPER_DIR, TTS_DIR, AUDIO_DIR };
