import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilenceDetector, downsample, encodeWav, rms } from './wavRecorder.js';

test('recordings become 16 kHz mono 16-bit WAV', () => {
  const tone = new Float32Array(48000).map((_, i) => Math.sin(i / 10));
  const down = downsample(tone, 48000, 16000);
  assert.equal(down.length, 16000);
  const wav = new DataView(encodeWav(down, 16000));
  const text = (offset, length) => String.fromCharCode(...new Uint8Array(wav.buffer, offset, length));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(wav.getUint16(20, true), 1, 'PCM');
  assert.equal(wav.getUint16(22, true), 1, 'mono');
  assert.equal(wav.getUint32(24, true), 16000);
  assert.equal(wav.getUint16(34, true), 16);
  assert.equal(wav.getUint32(40, true), 32000);
  assert.equal(downsample(down, 16000, 16000), down, 'already 16 kHz: unchanged');
});

test('loudness and the silence detector: stops after speech then quiet', () => {
  assert.equal(rms(new Float32Array(4)), 0);
  assert.ok(Math.abs(rms(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9);

  const detector = createSilenceDetector({ silenceMs: 1000, noSpeechMs: 5000, calibrateMs: 200 });
  const feed = (level, times) => { let state; for (let i = 0; i < times; i += 1) state = detector.feed(level, 100); return state; };
  feed(0.002, 2); // room noise
  assert.equal(feed(0.2, 5), 'speech');
  assert.equal(detector.heard, true);
  assert.equal(feed(0.003, 5), 'silence', 'a short pause keeps listening');
  assert.equal(feed(0.003, 6), 'stop', 'a long pause ends it');

  const nobody = createSilenceDetector({ noSpeechMs: 1000, calibrateMs: 100 });
  let state;
  for (let i = 0; i < 12; i += 1) state = nobody.feed(0.001, 100);
  assert.equal(state, 'no_speech');
});
