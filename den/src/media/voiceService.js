// den/src/media/voiceService.js
// Voice for Asyncat: listening (speech to text) and speaking (text to
// speech), each on this computer (whisper.cpp, Piper) or with a cloud
// service. This keeps the choice across restarts (ASYNCAT_STT_MODEL,
// ASYNCAT_TTS_VOICE), starts the local engines when they are first used,
// previews voices without changing the chosen one, and plans "Set up
// voice": what it downloads and how big that is, before anything starts.

import fs from 'fs';
import path from 'path';
import { MODELS_DIR } from '../ai/controllers/ai/modelManager.js';
import { clearCache as clearAudioCache, listTtsModels, listWhisperModels } from '../ai/controllers/ai/audioModelManager.js';
import * as whisper from '../ai/controllers/ai/whisperServerManager.js';
import * as tts from '../ai/controllers/ai/ttsServerManager.js';
import { synthesizeWithCloudProvider } from '../ai/controllers/ai/cloudSpeech.js';
import { huggingFaceHeaders } from '../ai/controllers/ai/huggingFaceAuth.js';
import { setConfigValue } from '../config/appConfig.js';
import { runtimeDataPath } from '../config/runtimeConfig.js';
import { planManagedRuntimeInstall } from '../lib/localEngine.js';
import { hfFileSize, hfFileUrl } from './hf.js';
import {
  CLOUD_SPEECH, PIPER_REPO, PIPER_VOICES, WHISPER_MODELS, WHISPER_REPO, piperSamplePath, piperVoiceBase, recommendedVoiceSetup, whisperModelFile,
} from './voiceCatalog.js';
import { startSetupJob } from './setupJobs.js';

export const WHISPER_DIR = path.join(MODELS_DIR, 'audio', 'whisper');
export const VOICES_DIR = path.join(MODELS_DIR, 'audio', 'tts');
const PLAN_TTL_MS = 60 * 60_000;
const planCache = new Map();

const PREVIEW_TEXT = 'Hello! This is how I sound when I read your answers aloud.';

function voiceError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** 'local', a cloud service id, or 'off' (listening or speaking turned off). */
export function speechProvider(kind) {
  const value = String(process.env[kind === 'stt' ? 'ASYNCAT_STT_PROVIDER' : 'ASYNCAT_TTS_PROVIDER'] || '').trim();
  return value || 'local';
}

/** Why a route or tool can't listen or speak when it is turned off. */
export function voiceOffMessage(kind) {
  return `${kind === 'stt' ? 'Listening' : 'Speaking'} is off. Turn it on in Models → Voice.`;
}

function hasKey(name) {
  return Boolean(String(process.env[name] || '').trim());
}

/** The local listening model to use: the chosen one, else the only one there is. */
export function chosenWhisperModel() {
  const saved = String(process.env.ASYNCAT_STT_MODEL || '').trim();
  if (saved && fs.existsSync(saved)) return saved;
  return listWhisperModels()[0]?.path || null;
}

/** The local voice to use: the chosen one, else the first complete one. */
export function chosenVoice() {
  const saved = String(process.env.ASYNCAT_TTS_VOICE || '').trim();
  if (saved && fs.existsSync(saved) && fs.existsSync(`${saved}.json`)) return saved;
  return listTtsModels().find((voice) => !voice.missingConfig)?.path || null;
}

function catalogVoiceId(voicePath) {
  const name = path.basename(String(voicePath || '')).replace(/\.onnx$/i, '');
  return PIPER_VOICES.some((voice) => voice.id === name) ? name : null;
}

function voiceLabel(voicePath) {
  const id = catalogVoiceId(voicePath);
  const voice = id ? PIPER_VOICES.find((item) => item.id === id) : null;
  return voice ? `${voice.name} (${voice.language})` : path.basename(String(voicePath || '')).replace(/\.onnx$/i, '');
}

function whisperLabel(modelPath) {
  const file = path.basename(String(modelPath || ''));
  const model = WHISPER_MODELS.find((item) => item.file === file || item.englishFile === file);
  if (!model) return file;
  return `${model.title}${model.englishFile === file ? ' (English)' : ''}`;
}

/** What listening and speaking use now, and whether each is ready. */
export async function voiceStatus() {
  const sttProvider = speechProvider('stt');
  const ttsProvider = speechProvider('tts');
  const [whisperBinary, piperBinary, ffmpeg] = await Promise.all([
    whisper.checkBinary().catch(() => ({ found: false })),
    tts.checkBinary().catch(() => ({ found: false })),
    whisper.checkFfmpeg ? whisper.checkFfmpeg().catch(() => ({ found: false })) : { found: false },
  ]);

  let stt;
  if (sttProvider === 'off') {
    stt = { provider: 'off', ready: false, reason: 'off' };
  } else if (sttProvider === 'local') {
    const model = chosenWhisperModel();
    const running = whisper.getStatus();
    stt = {
      provider: 'local',
      engine: Boolean(whisperBinary.found),
      // Where the engine was found: Asyncat's copy, a set path, or on PATH.
      enginePath: whisperBinary.found ? whisperBinary.path || null : null,
      model: model ? { path: model, name: whisperLabel(model) } : null,
      ready: Boolean(whisperBinary.found && model),
      reason: !whisperBinary.found ? 'needs_engine' : !model ? 'needs_model' : null,
      running: running.status,
    };
  } else {
    const service = CLOUD_SPEECH[sttProvider];
    const keyName = service?.keyName;
    stt = {
      provider: sttProvider,
      title: service?.title || sttProvider,
      model: service?.stt ? String((service.stt.modelKey && process.env[service.stt.modelKey]) || service.stt.defaultModel) : null,
      ready: Boolean(keyName ? hasKey(keyName) : false),
      reason: keyName && !hasKey(keyName) ? 'needs_key' : null,
      keyName: keyName || null,
    };
  }

  let speak;
  if (ttsProvider === 'off') {
    speak = { provider: 'off', ready: false, reason: 'off' };
  } else if (ttsProvider === 'local') {
    const voice = chosenVoice();
    speak = {
      provider: 'local',
      engine: Boolean(piperBinary.found),
      enginePath: piperBinary.found ? piperBinary.path || null : null,
      voice: voice ? { path: voice, id: catalogVoiceId(voice), name: voiceLabel(voice) } : null,
      ready: Boolean(piperBinary.found && voice),
      reason: !piperBinary.found ? 'needs_engine' : !voice ? 'needs_voice' : null,
      running: tts.getStatus().status,
    };
  } else {
    const service = CLOUD_SPEECH[ttsProvider];
    const keyName = service?.keyName;
    const voiceId = service?.tts ? String(process.env[service.tts.voiceKey] || service.tts.defaultVoice) : null;
    speak = {
      provider: ttsProvider,
      title: service?.title || ttsProvider,
      voice: voiceId ? { id: voiceId, name: service.tts.voices.find((item) => item.id === voiceId)?.name || voiceId } : null,
      ready: Boolean(keyName ? hasKey(keyName) : false),
      reason: keyName && !hasKey(keyName) ? 'needs_key' : null,
      keyName: keyName || null,
    };
  }

  // Set up: each part ready or turned off, and not both off.
  const usable = (part) => part.ready || part.provider === 'off';
  const setUp = usable(stt) && usable(speak) && !(stt.provider === 'off' && speak.provider === 'off');
  return { stt, tts: speak, ffmpeg: Boolean(ffmpeg?.found), setUp };
}

/** The catalog with what is already on this computer marked. */
export function voiceCatalog() {
  const whisperFiles = new Set(listWhisperModels().map((model) => path.basename(model.path)));
  const voiceFiles = new Set(listTtsModels().filter((voice) => !voice.missingConfig).map((voice) => path.basename(voice.path)));
  return {
    whisper: WHISPER_MODELS.map((model) => ({
      ...model,
      installed: whisperFiles.has(model.file),
      installedEnglish: Boolean(model.englishFile && whisperFiles.has(model.englishFile)),
    })),
    voices: PIPER_VOICES.map((voice) => ({ ...voice, installed: voiceFiles.has(`${voice.id}.onnx`) })),
    cloud: Object.fromEntries(Object.entries(CLOUD_SPEECH).map(([id, service]) => [id, {
      title: service.title,
      keyName: service.keyName,
      hasKey: hasKey(service.keyName),
      stt: service.stt,
      tts: service.tts,
    }])),
  };
}

/**
 * Save what listening and speaking use. `stt`: { provider, model } where
 * model is a local file path or a cloud model; `tts`: { provider, voice }
 * where voice is a local .onnx path or a cloud voice. Provider 'off' turns
 * that part off (and frees the memory its local engine held).
 */
export async function chooseVoice({ stt = null, tts: speak = null } = {}) {
  if (stt) {
    const provider = String(stt.provider || 'local');
    if (provider === 'off') {
      setConfigValue('ASYNCAT_STT_PROVIDER', 'off');
      if (whisper.getStatus().status !== 'idle') await whisper.stopWhisper().catch(() => {});
    } else if (provider === 'local') {
      const model = String(stt.model || '').trim();
      if (model) {
        if (!fs.existsSync(model)) throw voiceError("That listening model isn't on this computer.");
        setConfigValue('ASYNCAT_STT_MODEL', model);
        // The next recording starts it with the new model.
        if (whisper.getStatus().modelPath && whisper.getStatus().modelPath !== model) await whisper.stopWhisper();
      }
      setConfigValue('ASYNCAT_STT_PROVIDER', 'local');
    } else {
      const service = CLOUD_SPEECH[provider];
      if (!service?.stt) throw voiceError(`${service?.title || provider} can't listen.`);
      setConfigValue('ASYNCAT_STT_PROVIDER', provider);
      // Some services (fal) have one model and no setting for it.
      if (stt.model && service.stt.modelKey) setConfigValue(service.stt.modelKey, String(stt.model));
    }
  }
  if (speak) {
    const provider = String(speak.provider || 'local');
    if (provider === 'off') {
      setConfigValue('ASYNCAT_TTS_PROVIDER', 'off');
      if (tts.getStatus().status !== 'idle') await tts.stopTts().catch(() => {});
    } else if (provider === 'local') {
      const voice = String(speak.voice || '').trim();
      if (voice) {
        if (!fs.existsSync(voice) || !fs.existsSync(`${voice}.json`)) throw voiceError("That voice isn't complete on this computer.");
        setConfigValue('ASYNCAT_TTS_VOICE', voice);
        await tts.ensureTts(voice).catch(() => {});
      }
      setConfigValue('ASYNCAT_TTS_PROVIDER', 'local');
    } else {
      const service = CLOUD_SPEECH[provider];
      if (!service?.tts) throw voiceError(`${service?.title || provider} can't speak.`);
      setConfigValue('ASYNCAT_TTS_PROVIDER', provider);
      if (speak.voice) setConfigValue(service.tts.voiceKey, String(speak.voice));
    }
  }
  return voiceStatus();
}

/** Start local listening with the chosen model, if it isn't running yet. */
export async function ensureLocalListening() {
  const model = chosenWhisperModel();
  if (!model) throw voiceError('No listening model yet. Set up voice in Models → Voice.', 409);
  return whisper.ensureWhisper(model);
}

/** Load the chosen local voice, if another one (or none) is loaded. */
export async function ensureLocalSpeaking() {
  const voice = chosenVoice();
  if (!voice) throw voiceError('No voice yet. Set up voice in Models → Voice.', 409);
  return tts.ensureTts(voice);
}

/**
 * Speak a short sentence with a voice, without changing the chosen one.
 * { provider: 'local', voice: path or catalog id } or { provider, voice }.
 * Resolves to { buffer, mime }.
 */
export async function previewVoice({ provider = 'local', voice = '', text = PREVIEW_TEXT } = {}) {
  const sentence = String(text || PREVIEW_TEXT).slice(0, 300);
  if (provider === 'local') {
    let voicePath = String(voice || '').trim();
    if (voicePath && !voicePath.includes(path.sep) && !voicePath.endsWith('.onnx')) voicePath = path.join(VOICES_DIR, `${voicePath}.onnx`);
    if (!voicePath) voicePath = chosenVoice();
    if (!voicePath || !fs.existsSync(voicePath)) throw voiceError("That voice isn't on this computer yet.");
    return { buffer: await tts.synthesize(sentence, { modelPath: voicePath }), mime: 'audio/wav' };
  }
  const service = CLOUD_SPEECH[provider];
  if (!service?.tts) throw voiceError(`${service?.title || provider} can't speak.`);
  if (!hasKey(service.keyName)) throw voiceError(`Add your ${service.title} key first.`);
  const result = await synthesizeWithCloudProvider(provider, sentence, provider === 'elevenlabs' ? { voiceId: voice || undefined } : { voice: voice || undefined });
  const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result?.buffer || result?.audio || []);
  return { buffer, mime: result?.mimeType || result?.contentType || (provider === 'gemini' ? 'audio/wav' : 'audio/mpeg') };
}

/**
 * The spoken sample of a catalog voice, from Piper's repo (~80 KB), kept
 * after the first play so it doesn't download again.
 */
export async function voiceSample(voiceId, { userId = null, fetchImpl = globalThis.fetch } = {}) {
  const voice = PIPER_VOICES.find((item) => item.id === voiceId);
  if (!voice) throw voiceError('No such voice.', 404);
  const cacheFile = runtimeDataPath('cache', 'voice-samples', `${voice.id}.mp3`);
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile);
  const res = await fetchImpl(hfFileUrl(PIPER_REPO, piperSamplePath(voice.id)), {
    headers: huggingFaceHeaders(userId, { Accept: '*/*' }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw voiceError(`Couldn't get the sample (${res.status}).`, 502);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, buffer);
  return buffer;
}

async function enginePlan(runtimeId) {
  const cached = planCache.get(runtimeId);
  if (cached && Date.now() - cached.at < PLAN_TTL_MS) return cached.plan;
  const plan = await planManagedRuntimeInstall(runtimeId);
  planCache.set(runtimeId, { at: Date.now(), plan });
  return plan;
}

async function liveSize(repo, file, fallback, userId) {
  try {
    const size = await hfFileSize(repo, file, { headers: huggingFaceHeaders(userId) });
    return size ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * What "Set up voice" will do, with sizes, for the chosen options:
 * { listen, speak, whisperId, english, voiceId }. Steps already done are
 * marked so their size doesn't count.
 */
export async function planVoiceSetup({ listen = true, speak = true, whisperId = null, english = null, voiceId = null, language = 'en', userId = null } = {}) {
  const recommended = recommendedVoiceSetup(language);
  const whisperModel = WHISPER_MODELS.find((model) => model.id === whisperId) || recommended.whisper;
  const useEnglish = english === null ? recommended.english : Boolean(english);
  const whisperFile = whisperModelFile(whisperModel, { english: useEnglish });
  const voice = PIPER_VOICES.find((item) => item.id === voiceId) || recommended.voice;
  const [whisperBinary, piperBinary] = await Promise.all([
    whisper.checkBinary().catch(() => ({ found: false })),
    tts.checkBinary().catch(() => ({ found: false })),
  ]);

  const steps = [];
  if (listen) {
    const engine = whisperBinary.found ? null : await enginePlan('whisper').catch((err) => ({ error: err.message }));
    steps.push({
      key: 'whisper-engine',
      type: 'engine',
      runtimeId: 'whisper',
      label: 'Speech recognition engine (whisper.cpp)',
      done: Boolean(whisperBinary.found),
      bytes: engine?.downloadBytes || null,
      estimated: Boolean(engine?.estimated),
      error: engine?.error || null,
    });
    const target = path.join(WHISPER_DIR, whisperFile);
    steps.push({
      key: 'whisper-model',
      type: 'download',
      label: `Listening model: ${whisperModel.title}${useEnglish && whisperModel.englishFile ? ' (English)' : ''}`,
      url: hfFileUrl(WHISPER_REPO, whisperFile),
      filename: whisperFile,
      subDir: 'audio/whisper',
      done: fs.existsSync(target),
      bytes: await liveSize(WHISPER_REPO, whisperFile, whisperModel.bytes, userId),
    });
  }
  if (speak) {
    const engine = piperBinary.found ? null : await enginePlan('piper').catch((err) => ({ error: err.message }));
    steps.push({
      key: 'piper-engine',
      type: 'engine',
      runtimeId: 'piper',
      label: 'Voice engine (Piper)',
      done: Boolean(piperBinary.found),
      bytes: engine?.downloadBytes || null,
      estimated: Boolean(engine?.estimated),
      error: engine?.error || null,
    });
    const base = piperVoiceBase(voice.id);
    const target = path.join(VOICES_DIR, `${voice.id}.onnx`);
    steps.push({
      key: 'voice',
      type: 'download',
      label: `Voice: ${voice.name} (${voice.language})`,
      url: hfFileUrl(PIPER_REPO, `${base}.onnx`),
      filename: `${voice.id}.onnx`,
      subDir: 'audio/tts',
      done: fs.existsSync(target),
      bytes: await liveSize(PIPER_REPO, `${base}.onnx`, voice.bytes, userId),
    });
    steps.push({
      key: 'voice-config',
      type: 'download',
      label: `Voice settings: ${voice.name}`,
      url: hfFileUrl(PIPER_REPO, `${base}.onnx.json`),
      filename: `${voice.id}.onnx.json`,
      subDir: 'audio/tts',
      done: fs.existsSync(`${target}.json`),
      bytes: await liveSize(PIPER_REPO, `${base}.onnx.json`, 5_000, userId),
      small: true,
    });
  }
  const totalBytes = steps.filter((step) => !step.done).reduce((sum, step) => sum + (Number(step.bytes) || 0), 0);
  return {
    steps,
    totalBytes,
    estimated: steps.some((step) => !step.done && (step.estimated || !step.bytes)),
    whisper: { id: whisperModel.id, file: whisperFile, english: useEnglish },
    voice: { id: voice.id },
  };
}

/** Run "Set up voice" for a plan's options; it saves the choices when done. */
export async function startVoiceSetup(options = {}) {
  const plan = await planVoiceSetup(options);
  const headers = huggingFaceHeaders(options.userId || null, { Accept: '*/*' });
  const steps = plan.steps.map((step) => ({
    key: step.key,
    label: step.label,
    type: step.type,
    bytes: step.bytes,
    ...(step.type === 'engine'
      ? {
        runtimeId: step.runtimeId,
        check: step.runtimeId === 'whisper'
          ? async () => (await whisper.checkBinary()).found
          : async () => (await tts.checkBinary()).found,
      }
      : { url: step.url, filename: step.filename, subDir: step.subDir, headers }),
  }));
  return startSetupJob({
    kind: 'voice',
    title: 'Set up voice',
    // The resolved choices, in the shape POST /media/voice/setup takes.
    options: {
      listen: options.listen !== false,
      speak: options.speak !== false,
      whisper: plan.whisper.id,
      english: plan.whisper.english,
      voice: plan.voice.id,
      language: options.language || 'en',
    },
    steps,
    onComplete: async () => {
      clearAudioCache();
      const listen = options.listen !== false;
      const speak = options.speak !== false;
      return chooseVoice({
        stt: listen ? { provider: 'local', model: path.join(WHISPER_DIR, plan.whisper.file) } : null,
        tts: speak ? { provider: 'local', voice: path.join(VOICES_DIR, `${plan.voice.id}.onnx`) } : null,
      });
    },
  });
}

/** The voices an ElevenLabs account has (its own and the premade ones). */
export async function elevenLabsVoices({ fetchImpl = globalThis.fetch } = {}) {
  const key = String(process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key) return CLOUD_SPEECH.elevenlabs.tts.voices;
  const res = await fetchImpl('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw voiceError(`ElevenLabs answered ${res.status}.`, 502);
  const data = await res.json();
  return (data?.voices || []).map((voice) => ({ id: voice.voice_id, name: voice.name, note: voice.category || null })).slice(0, 100);
}
