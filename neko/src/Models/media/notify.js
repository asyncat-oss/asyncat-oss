// Tells the rest of the app that voice or image settings changed, so the
// chat composer's mic, the model lists and the engine rows catch up without
// a reload. Call these after every choice, finished setup, delete, add and
// finished download.

/** The engines (whisper.cpp, Piper, stable-diffusion.cpp) changed: their rows look again. */
export const ENGINES_EVENT = 'asyncat-model-runtime-updated';
export const VOICE_EVENTS = ['asyncat-voice-changed', 'asyncat-audio-models-updated', ENGINES_EVENT];
export const IMAGE_EVENTS = ['asyncat-visual-models-updated'];
/** A download started somewhere on the page (a Hugging Face file, say). */
export const DOWNLOADS_EVENT = 'asyncat-model-downloads-updated';

function dispatch(names) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  for (const name of names) window.dispatchEvent(new Event(name));
}

export function notifyVoiceChanged() {
  dispatch(VOICE_EVENTS);
}

export function notifyImagesChanged() {
  dispatch(IMAGE_EVENTS);
}

export function notifyEnginesChanged() {
  dispatch([ENGINES_EVENT]);
}

export function notifyDownloadsChanged() {
  dispatch([DOWNLOADS_EVENT]);
}

/** The notice for a file that landed in a models folder ("audio/whisper", "image"). */
export function notifyForSubDir(subDir) {
  if (String(subDir || '').startsWith('audio')) notifyVoiceChanged();
  else if (String(subDir || '').startsWith('image')) notifyImagesChanged();
}

/** Runs `handler` on any of `names`; returns a function that stops listening. */
export function onEvents(names, handler) {
  if (typeof window === 'undefined') return () => {};
  for (const name of names) window.addEventListener(name, handler);
  return () => {
    for (const name of names) window.removeEventListener(name, handler);
  };
}
