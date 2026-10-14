// den/src/media/voiceCatalog.js
// The voice models "Set up voice" offers: speech recognition models for
// whisper.cpp and voices for Piper, all on Hugging Face (sizes checked
// against the repos in October 2026), and the cloud services with their
// models and voices.

export const WHISPER_REPO = 'ggerganov/whisper.cpp';

// Quantized (q5) copies: the same accuracy for chat in a third of the size.
export const WHISPER_MODELS = [
  {
    id: 'base',
    title: 'Base',
    file: 'ggml-base-q5_1.bin',
    englishFile: 'ggml-base.en-q5_1.bin',
    bytes: 59_700_000,
    note: 'Quick, and accurate enough for talking to Asyncat.',
    recommended: true,
  },
  {
    id: 'small',
    title: 'Small',
    file: 'ggml-small-q5_1.bin',
    englishFile: 'ggml-small.en-q5_1.bin',
    bytes: 190_100_000,
    note: 'More accurate, a little slower.',
  },
  {
    id: 'large-turbo',
    title: 'Large v3 Turbo',
    file: 'ggml-large-v3-turbo-q5_0.bin',
    englishFile: null,
    bytes: 574_000_000,
    note: 'The most accurate, also for accents and many languages. Slower without a strong CPU.',
  },
];

export const PIPER_REPO = 'rhasspy/piper-voices';

export const PIPER_VOICES = [
  { id: 'en_US-lessac-medium', name: 'Lessac', language: 'English (US)', locale: 'en-US', bytes: 63_200_000, recommended: true },
  { id: 'en_US-amy-medium', name: 'Amy', language: 'English (US)', locale: 'en-US', bytes: 63_200_000 },
  { id: 'en_US-ryan-high', name: 'Ryan', language: 'English (US)', locale: 'en-US', bytes: 120_800_000, note: 'Higher quality, twice the size.' },
  { id: 'en_GB-alan-medium', name: 'Alan', language: 'English (UK)', locale: 'en-GB', bytes: 63_200_000 },
  { id: 'en_GB-jenny_dioco-medium', name: 'Jenny', language: 'English (UK)', locale: 'en-GB', bytes: 63_200_000 },
  { id: 'de_DE-thorsten-medium', name: 'Thorsten', language: 'German', locale: 'de-DE', bytes: 63_200_000 },
  { id: 'fr_FR-siwis-medium', name: 'Siwis', language: 'French', locale: 'fr-FR', bytes: 63_200_000 },
  { id: 'es_ES-davefx-medium', name: 'Dave', language: 'Spanish', locale: 'es-ES', bytes: 63_200_000 },
  { id: 'it_IT-paola-medium', name: 'Paola', language: 'Italian', locale: 'it-IT', bytes: 63_500_000 },
  { id: 'nl_NL-mls-medium', name: 'MLS', language: 'Dutch', locale: 'nl-NL', bytes: 76_600_000 },
  { id: 'hi_IN-pratham-medium', name: 'Pratham', language: 'Hindi', locale: 'hi-IN', bytes: 63_500_000 },
];

/** "en_GB-jenny_dioco-medium" → "en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium". */
export function piperVoiceBase(id) {
  const [locale, name, quality] = String(id).split('-');
  return `${locale.split('_')[0]}/${locale}/${name}/${quality}/${id}`;
}

/** The short spoken sample Piper's repo keeps next to each voice (~80 KB). */
export function piperSamplePath(id) {
  const base = piperVoiceBase(id);
  return `${base.slice(0, base.lastIndexOf('/'))}/samples/speaker_0.mp3`;
}

export function whisperModelFile(model, { english = false } = {}) {
  return english && model.englishFile ? model.englishFile : model.file;
}

/**
 * The best default for a language: English-only models for English (more
 * accurate), the multilingual ones otherwise.
 */
export function recommendedVoiceSetup(language = 'en') {
  const lang = String(language || 'en').toLowerCase();
  const english = lang.startsWith('en');
  const whisper = WHISPER_MODELS.find((model) => model.recommended);
  const voice = PIPER_VOICES.find((item) => item.locale.toLowerCase() === lang)
    || PIPER_VOICES.find((item) => item.locale.slice(0, 2).toLowerCase() === lang.slice(0, 2))
    || PIPER_VOICES.find((item) => item.recommended);
  return { whisper: { ...whisper, chosenFile: whisperModelFile(whisper, { english }) }, voice, english };
}

// Cloud speech: the config keys each adapter in ai/routes/providerRoutes.js
// reads, and what to offer for them.
export const CLOUD_SPEECH = {
  openai: {
    title: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
    stt: { modelKey: 'OPENAI_STT_MODEL', models: ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'gpt-transcribe'], defaultModel: 'gpt-4o-transcribe' },
    tts: {
      modelKey: 'OPENAI_TTS_MODEL',
      defaultModel: 'gpt-4o-mini-tts',
      voiceKey: 'OPENAI_TTS_VOICE',
      defaultVoice: 'coral',
      voices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'].map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })),
    },
  },
  elevenlabs: {
    title: 'ElevenLabs',
    keyName: 'ELEVENLABS_API_KEY',
    stt: { modelKey: 'ELEVENLABS_STT_MODEL', models: ['scribe_v2'], defaultModel: 'scribe_v2' },
    // Voices come from the account (GET /v1/voices), so its own ones show too.
    tts: { voiceKey: 'ELEVENLABS_VOICE_ID', defaultVoice: 'JBFqnCBsd6RMkjVDRZzb', voices: [{ id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' }], voicesFromAccount: true },
  },
  gemini: {
    title: 'Gemini',
    keyName: 'GEMINI_API_KEY',
    stt: null,
    tts: {
      voiceKey: 'GEMINI_TTS_VOICE',
      defaultVoice: 'Aoede',
      voices: ['Aoede', 'Kore', 'Puck', 'Charon', 'Zephyr', 'Leda', 'Orus', 'Fenrir'].map((id) => ({ id, name: id })),
    },
  },
  fal: {
    title: 'fal',
    keyName: 'FAL_KEY',
    // Whisper on fal has no model to choose; speaking is Kokoro.
    stt: { modelKey: null, models: ['whisper'], defaultModel: 'whisper' },
    tts: { voiceKey: 'FAL_TTS_VOICE', defaultVoice: 'af_bella', voices: [{ id: 'af_bella', name: 'Bella' }] },
  },
};
