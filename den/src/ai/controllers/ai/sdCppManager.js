// sdCppManager.js — simple local image generation via stable-diffusion.cpp style CLI

import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { MODELS_DIR } from './modelManager.js';
import { listVisualModels } from './visualModelManager.js';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, '../../../../data/generated/images');
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

fs.mkdirSync(GENERATED_DIR, { recursive: true });

function asyncatHome() {
  if (IS_WIN) {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Asyncat');
  }
  return path.join(os.homedir(), '.asyncat');
}

function binaryCandidates() {
  const home = os.homedir();
  const exe = IS_WIN ? '.exe' : '';
  return [
    (process.env.IMAGEGEN_BINARY_PATH || '').trim(),
    path.join(asyncatHome(), 'stable-diffusion.cpp', 'sd-cli' + exe),
    path.join(asyncatHome(), 'stable-diffusion.cpp', 'sd' + exe),
    path.join(asyncatHome(), 'stable-diffusion.cpp', 'stable-diffusion' + exe),
    path.join(home, '.local', 'bin', 'sd-cli' + exe),
    path.join(home, '.local', 'bin', 'sd' + exe),
    path.join(home, '.local', 'bin', 'stable-diffusion' + exe),
    path.join(home, 'stable-diffusion.cpp', 'build', 'bin', 'sd-cli' + exe),
    path.join(home, 'stable-diffusion.cpp', 'build', 'bin', 'sd' + exe),
    path.join(home, 'stable-diffusion.cpp', 'build', 'bin', 'stable-diffusion' + exe),
    path.join(home, 'stable-diffusion.cpp', 'build', 'examples', 'cli', 'sd-cli' + exe),
    '/opt/homebrew/bin/sd-cli',
    '/opt/homebrew/bin/sd',
    '/opt/homebrew/bin/stable-diffusion',
    '/usr/local/bin/sd-cli',
    '/usr/local/bin/sd',
    '/usr/local/bin/stable-diffusion',
    '/usr/bin/sd-cli',
    '/usr/bin/sd',
    '/usr/bin/stable-diffusion',
  ].filter(Boolean);
}

async function commandPath(name) {
  try {
    const { stdout } = await execFileAsync(IS_WIN ? 'where' : 'which', [name], { timeout: 3000 });
    return stdout.trim().split('\n')[0]?.trim() || '';
  } catch {
    return '';
  }
}

async function findBinary() {
  for (const candidate of binaryCandidates()) {
    if (candidate && fs.existsSync(candidate)) return { found: true, path: candidate, source: 'file' };
  }

  for (const name of IS_WIN ? ['sd-cli.exe', 'sd.exe', 'stable-diffusion.exe', 'sd-cli', 'sd', 'stable-diffusion'] : ['sd-cli', 'sd', 'stable-diffusion']) {
    const p = await commandPath(name);
    if (p) return { found: true, path: p, source: 'PATH' };
  }

  return { found: false, path: null, source: null };
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value, fallback, min, max) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function imageModelChoices() {
  return listVisualModels().image
    .filter(model => (
      !model.isMissing &&
      model.path &&
      model.assetKind === 'Image model' &&
      /\.(safetensors|ckpt|gguf|bin)$/i.test(model.filename || model.path)
    ))
    .map(model => ({
      id: model.id,
      name: model.name,
      filename: model.filename,
      path: model.path,
      sizeFormatted: model.sizeFormatted,
      assetKind: model.assetKind,
    }));
}

export async function checkSdCpp() {
  const binary = await findBinary();
  const models = imageModelChoices();
  if (!binary.found) {
    return {
      found: false,
      status: 'missing',
      binaryPath: null,
      models,
      modelsDir: path.join(MODELS_DIR, 'image'),
      error: 'Simple image engine binary not found. Install stable-diffusion.cpp, put sd on PATH, or set IMAGEGEN_BINARY_PATH in den/.env.',
    };
  }

  let version = '';
  try {
    const { stdout, stderr } = await execFileAsync(binary.path, ['--help'], { timeout: 5000 });
    version = (stdout || stderr || '').split('\n').slice(0, 2).join(' ').trim().slice(0, 200);
  } catch {
    // Some builds return non-zero for --help; the binary may still be usable.
  }

  return {
    found: true,
    status: 'ready',
    binaryPath: binary.path,
    source: binary.source,
    version,
    models,
    modelsDir: path.join(MODELS_DIR, 'image'),
  };
}

export async function generateSdCppImage(options = {}) {
  const prompt = String(options.prompt || '').trim();
  if (!prompt) throw new Error('prompt is required');

  const binary = await findBinary();
  if (!binary.found) {
    throw new Error('Simple image engine binary not found. Install stable-diffusion.cpp, put sd on PATH, or set IMAGEGEN_BINARY_PATH.');
  }

  const modelPath = String(options.modelPath || options.model || '').trim();
  if (!modelPath) throw new Error('modelPath is required');
  if (!fs.existsSync(modelPath)) throw new Error(`Image model not found: ${modelPath}`);

  const width = clampInt(options.width, 512, 256, 2048);
  const height = clampInt(options.height, 512, 256, 2048);
  const steps = clampInt(options.steps, 24, 1, 100);
  const cfg = clampFloat(options.cfg, 7, 1, 20);
  const seed = options.seed === undefined || options.seed === null || options.seed === ''
    ? Math.floor(Math.random() * 1_000_000_000)
    : clampInt(options.seed, 1, 0, Number.MAX_SAFE_INTEGER);
  const outputPath = path.join(GENERATED_DIR, `asyncat_${randomUUID()}.png`);

  const args = [
    '-m', modelPath,
    '-p', prompt,
    '-o', outputPath,
    '--steps', String(steps),
    '--cfg-scale', String(cfg),
    '-W', String(width),
    '-H', String(height),
    '-s', String(seed),
  ];

  const negativePrompt = String(options.negativePrompt || '').trim();
  if (negativePrompt) args.push('-n', negativePrompt);

  const sampler = String(options.sampler || '').trim();
  if (sampler) args.push('--sampling-method', sampler);

  let stderr = '';
  try {
    const result = await execFileAsync(binary.path, args, {
      timeout: GENERATION_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 8,
    });
    stderr = result.stderr || '';
  } catch (err) {
    stderr = err.stderr || err.message || '';
    throw new Error(`Simple image generation failed: ${stderr.slice(0, 1200)}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Simple image engine finished but did not create an output image. ${stderr.slice(0, 800)}`);
  }

  const bytes = fs.readFileSync(outputPath);
  return {
    success: true,
    runtime: 'stable-diffusion.cpp',
    binaryPath: binary.path,
    image: `data:image/png;base64,${bytes.toString('base64')}`,
    imagePath: outputPath,
    modelPath,
    seed,
    width,
    height,
    steps,
    cfg,
  };
}
