// Records the microphone as a 16 kHz mono WAV: the format speech recognition
// on this computer takes as it is, so it needs no ffmpeg. With `autoStop` it
// listens for speech and stops by itself once the speaker goes quiet
// (hands-free voice mode).

const TARGET_RATE = 16000;

/** Average a recording down to `toRate` samples per second. */
export function downsample(samples, fromRate, toRate = TARGET_RATE) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** 16-bit PCM WAV bytes for mono samples in -1…1. */
export function encodeWav(samples, rate = TARGET_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Loudness of a block of samples (root mean square). */
export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Tells speech from silence, learning the room's noise level first.
 * feed(level, ms) → 'speech' | 'silence' | 'stop' | 'no_speech'.
 */
export function createSilenceDetector({ silenceMs = 1300, noSpeechMs = 7000, maxMs = 30000, calibrateMs = 300, minLevel = 0.012 } = {}) {
  let elapsed = 0;
  let noise = 0;
  let noiseSamples = 0;
  let heard = false;
  let quietFor = 0;
  return {
    get heard() { return heard; },
    feed(level, ms) {
      elapsed += ms;
      if (elapsed <= calibrateMs) {
        noise = (noise * noiseSamples + level) / (noiseSamples + 1);
        noiseSamples += 1;
        return 'silence';
      }
      const threshold = Math.max(minLevel, noise * 3);
      if (level > threshold) {
        heard = true;
        quietFor = 0;
      } else if (heard) {
        quietFor += ms;
      }
      if (elapsed >= maxMs) return 'stop';
      if (heard && quietFor >= silenceMs) return 'stop';
      if (!heard && elapsed >= noSpeechMs) return 'no_speech';
      return level > threshold ? 'speech' : 'silence';
    },
  };
}

/**
 * Start recording. Resolves to { stop(), cancel() }: stop() resolves to
 * { blob, heard, seconds }. With `autoStop`, `onAutoStop(result)` gets the
 * same when the speaker goes quiet, or { blob: null } when nobody spoke.
 * `onLevel(0…1)` follows the input level for a meter.
 */
export async function startWavRecording({ autoStop = false, onAutoStop = null, onLevel = null, detector = {} } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const context = new AudioCtx();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  const silence = createSilenceDetector(detector);
  const startedAt = Date.now();
  let finished = false;

  const finish = async ({ keep = true } = {}) => {
    if (finished) return { blob: null, heard: false, seconds: 0 };
    finished = true;
    processor.onaudioprocess = null;
    try { source.disconnect(); } catch { /* already */ }
    try { processor.disconnect(); } catch { /* already */ }
    stream.getTracks().forEach((track) => track.stop());
    const rate = context.sampleRate;
    await context.close().catch(() => {});
    if (!keep) return { blob: null, heard: false, seconds: 0 };
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const samples = downsample(merged, rate, TARGET_RATE);
    return {
      blob: new Blob([encodeWav(samples, TARGET_RATE)], { type: 'audio/wav' }),
      heard: silence.heard,
      seconds: samples.length / TARGET_RATE,
    };
  };

  processor.onaudioprocess = (event) => {
    if (finished) return;
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    const level = rms(input);
    onLevel?.(Math.min(1, level * 8));
    if (!autoStop) return;
    const state = silence.feed(level, (input.length / context.sampleRate) * 1000);
    if (state === 'stop') finish().then((result) => onAutoStop?.(result));
    if (state === 'no_speech') finish({ keep: false }).then((result) => onAutoStop?.(result));
  };
  source.connect(processor);
  processor.connect(context.destination);

  return {
    startedAt,
    stop: () => finish(),
    cancel: () => { finish({ keep: false }); },
  };
}
