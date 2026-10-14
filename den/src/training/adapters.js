// den/src/training/adapters.js
// Guided training, step 4: a finished training job becomes a GGUF adapter
// that llama.cpp loads with --lora (scripts/lora_to_gguf.py), one adapter
// per model can be switched on so it loads with that model automatically,
// and the same question can be answered with the adapter off and on.
//
// Adapters are kept in the data folder (adapters/), not with the models:
// they're made from your chats and notes, so "Delete everything" removes
// them and "Export everything" includes them.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { runtimeDataPath } from '../config/runtimeConfig.js';
import { plainFileIn } from '../storage/safeFs.js';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ai', 'controllers', 'ai', 'scripts', 'lora_to_gguf.py');

export function adaptersDir() {
  return runtimeDataPath('adapters');
}

function storePath() {
  return path.join(adaptersDir(), 'adapters.json');
}

export function listAdapters() {
  try {
    const list = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return Array.isArray(list) ? list.map((item) => ({ ...item, exists: fs.existsSync(item.file) })) : [];
  } catch {
    return [];
  }
}

function saveAdapters(list) {
  fs.mkdirSync(adaptersDir(), { recursive: true });
  const clean = list.map(({ exists, ...item }) => item);
  fs.writeFileSync(`${storePath()}.tmp`, JSON.stringify(clean, null, 2));
  fs.renameSync(`${storePath()}.tmp`, storePath());
}

export function getAdapter(id) {
  return listAdapters().find((item) => item.id === id) || null;
}

/** The switched-on adapter for a model file, if any (llamaServerManager asks). */
export function activeAdapterFor(modelPath) {
  const file = path.basename(String(modelPath || ''));
  return listAdapters().find((item) => item.active && item.exists && item.baseGguf === file) || null;
}

/** Switch an adapter on (its model then loads with it) or off. */
export function setAdapterActive(id, active) {
  const list = listAdapters();
  const target = list.find((item) => item.id === id);
  if (!target) throw Object.assign(new Error('That adapter was not found.'), { status: 404 });
  for (const item of list) {
    if (item.baseGguf === target.baseGguf) item.active = active && item.id === id;
  }
  saveAdapters(list);
  return list.find((item) => item.id === id);
}

/** The adapter's file when it is a regular file in the adapters folder, else null. */
export function adapterFile(adapter) {
  const file = path.resolve(String(adapter?.file || ''));
  if (path.dirname(file) !== path.resolve(adaptersDir())) return null;
  return plainFileIn(adaptersDir(), path.basename(file))?.file || null;
}

export function removeAdapter(id) {
  const target = getAdapter(id);
  if (!target) return false;
  // Only a file in the adapters folder: adapters.json can't name one elsewhere.
  const file = adapterFile(target);
  if (file) fs.rmSync(file, { force: true });
  return forgetAdapter(id);
}

/** Drop an adapter from the list (its file is removed by the caller). */
export function forgetAdapter(id) {
  const list = listAdapters();
  if (!list.some((item) => item.id === id)) return false;
  saveAdapters(list.filter((item) => item.id !== id));
  return true;
}

/** A Python that can run the converter (it needs only the standard library). */
export function converterPython(preferred = null) {
  const candidates = [preferred, process.env.ASYNCAT_PYTHON, 'python3', 'python'].filter(Boolean);
  for (const cmd of candidates) {
    if (path.isAbsolute(cmd) && !fs.existsSync(cmd)) continue;
    try {
      if (spawnSync(cmd, ['--version'], { timeout: 10_000 }).status === 0) return cmd;
    } catch { /* try the next */ }
  }
  return null;
}

function runConverter(python, args, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err = (err + chunk).slice(-2000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', () => {
      clearTimeout(timer);
      const line = out.trim().split('\n').filter(Boolean).pop();
      let result = null;
      try { result = JSON.parse(line); } catch { /* not JSON */ }
      if (result?.type === 'complete') resolve(result);
      else reject(new Error(result?.message || err.trim() || "The adapter couldn't be converted."));
    });
  });
}

/**
 * Turn a finished training job's adapter folder into a GGUF adapter for
 * `baseGguf` (the model file it was trained for) and save it.
 */
export async function convertAdapter({ adapterDir, name, modelId, baseGguf, jobId = null, python = null }) {
  if (!adapterDir || !fs.existsSync(path.join(adapterDir, 'adapter_config.json'))) {
    throw Object.assign(new Error("This training job didn't leave an adapter to use."), { status: 400 });
  }
  const runner = converterPython(python);
  if (!runner) throw Object.assign(new Error('Python 3 is needed to convert the adapter, and none was found.'), { status: 409 });
  const id = crypto.randomUUID();
  fs.mkdirSync(adaptersDir(), { recursive: true });
  const file = path.join(adaptersDir(), `${id}.gguf`);
  const label = String(name || 'My adapter').trim().slice(0, 80) || 'My adapter';
  const result = await runConverter(runner, [adapterDir, file, '--name', label]);
  const adapter = {
    id,
    name: label,
    modelId: modelId || null,
    baseGguf: path.basename(String(baseGguf || '')),
    file,
    bytes: result.bytes,
    arch: result.arch,
    rank: result.rank,
    jobId,
    active: false,
    createdAt: new Date().toISOString(),
  };
  saveAdapters([...listAdapters(), adapter]);
  return { ...adapter, exists: true };
}

async function postJson(url, body, timeoutMs = 120_000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || json?.error || `llama-server answered ${res.status}`);
  return json;
}

/**
 * Ask the running llama-server the same question with the adapter off and
 * on. Each request names the adapter's scale (llama-server's per-request
 * "lora" field), so chats running at the same time keep theirs.
 */
export async function compareAnswers({ prompt, adapter, port = process.env.LLAMA_SERVER_PORT || 8765, maxTokens = 400 }) {
  const base = `http://127.0.0.1:${port}`;
  const loaded = await fetch(`${base}/lora-adapters`, { signal: AbortSignal.timeout(5000) }).then((res) => res.json()).catch(() => null);
  const entry = Array.isArray(loaded) ? loaded.find((item) => path.resolve(String(item.path || '')) === path.resolve(adapter.file)) : null;
  if (!entry) {
    throw Object.assign(new Error(`${adapter.name} isn't loaded. Load its model with the adapter first.`), { status: 409 });
  }
  const ask = (scale) => postJson(`${base}/v1/chat/completions`, {
    messages: [{ role: 'user', content: String(prompt) }],
    max_tokens: maxTokens,
    temperature: 0,
    seed: 7,
    lora: [{ id: entry.id, scale }],
  }).then((json) => json?.choices?.[0]?.message?.content || '');
  const before = await ask(0);
  const after = await ask(1);
  return { before, after, same: before.trim() === after.trim() };
}
