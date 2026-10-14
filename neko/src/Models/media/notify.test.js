import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyDownloadsChanged, notifyForSubDir, notifyImagesChanged, notifyVoiceChanged, onEvents } from './notify.js';

function fakeWindow() {
  const target = new EventTarget();
  const seen = [];
  const original = target.dispatchEvent.bind(target);
  target.dispatchEvent = (event) => {
    seen.push(event.type);
    return original(event);
  };
  return { target, seen };
}

test('voice and image changes reach every screen that listens', (t) => {
  const { target, seen } = fakeWindow();
  const previous = globalThis.window;
  globalThis.window = target;
  t.after(() => { globalThis.window = previous; });

  notifyVoiceChanged();
  assert.deepEqual(seen, ['asyncat-voice-changed', 'asyncat-audio-models-updated', 'asyncat-model-runtime-updated']);
  seen.length = 0;
  notifyImagesChanged();
  notifyDownloadsChanged();
  assert.deepEqual(seen, ['asyncat-visual-models-updated', 'asyncat-model-downloads-updated']);
  seen.length = 0;
  notifyForSubDir('audio/tts');
  notifyForSubDir('image');
  notifyForSubDir('');
  assert.deepEqual(seen, ['asyncat-voice-changed', 'asyncat-audio-models-updated', 'asyncat-model-runtime-updated', 'asyncat-visual-models-updated']);

  let heard = 0;
  const stop = onEvents(['asyncat-visual-models-updated'], () => { heard += 1; });
  notifyImagesChanged();
  stop();
  notifyImagesChanged();
  assert.equal(heard, 1);
});

test('without a window nothing is sent and nothing breaks', (t) => {
  const previous = globalThis.window;
  delete globalThis.window;
  t.after(() => { globalThis.window = previous; });
  assert.doesNotThrow(() => notifyVoiceChanged());
  assert.doesNotThrow(() => onEvents(['x'], () => {})());
});
