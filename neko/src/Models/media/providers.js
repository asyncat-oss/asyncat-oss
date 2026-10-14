// The services Voice and Images can use, in plain words: where to get a key,
// who bills for it, readable names for listening model ids, and the "Runs on"
// choices for listening, speaking and making images.

export const SERVICES = {
  openai: {
    title: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
  },
  elevenlabs: {
    title: 'ElevenLabs',
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    docsUrl: 'https://elevenlabs.io/docs',
  },
  gemini: {
    title: 'Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
  },
  fal: {
    title: 'fal',
    keyUrl: 'https://fal.ai/dashboard/keys',
    docsUrl: 'https://fal.ai/docs',
  },
  stability: {
    title: 'Stability AI',
    keyUrl: 'https://platform.stability.ai/account/keys',
    docsUrl: 'https://platform.stability.ai/docs',
  },
};

/** The order services are offered in, per group. */
export const SERVICE_ORDER = {
  stt: ['openai', 'elevenlabs', 'fal'],
  tts: ['openai', 'elevenlabs', 'gemini', 'fal'],
  image: ['openai', 'gemini', 'stability', 'fal'],
};

/** Keys that also power the other tab: an OpenAI key listens, speaks and makes images. */
const KEY_USES = {
  OPENAI_API_KEY: ['voice', 'images'],
  GEMINI_API_KEY: ['voice', 'images'],
  FAL_KEY: ['voice', 'images'],
  ELEVENLABS_API_KEY: ['voice'],
  STABILITY_API_KEY: ['images'],
};

export function serviceTitle(id) {
  return SERVICES[id]?.title || String(id || '');
}

/** Where to get a key for a service ("Get a key"), or its docs. */
export function keyUrl(id) {
  return SERVICES[id]?.keyUrl || SERVICES[id]?.docsUrl || null;
}

/** "Billed by OpenAI". */
export function billedBy(id) {
  return `Billed by ${serviceTitle(id)}`;
}

/** "Also used for images" on the Voice tab when the same key makes images, and the reverse. */
export function sharedKeyNote(keyName, tab) {
  const uses = KEY_USES[keyName] || [];
  if (tab === 'voice' && uses.includes('images')) return 'Also used for images';
  if (tab === 'images' && uses.includes('voice')) return 'Also used for voice';
  return null;
}

/** "****4f2a" (GET /api/config/secrets) → "Key ending 4f2a"; a short key shows no ending. */
export function keyEnding(masked) {
  const match = /^\*{4}(.{4})$/.exec(String(masked || ''));
  return match ? `Key ending ${match[1]}` : 'Key saved';
}

const MODEL_WORDS = { gpt: 'GPT', '4o': '4o', v2: 'v2', v3: 'v3' };

/**
 * A listening model id read aloud: "gpt-4o-transcribe" → "GPT-4o Transcribe",
 * "scribe_v2" → "Scribe v2", "whisper" → "Whisper".
 */
export function listeningModelName(id) {
  const text = String(id || '').trim();
  if (!text) return '';
  const words = text.split(/[-_\s]+/).filter(Boolean).map((word) => {
    const lower = word.toLowerCase();
    if (MODEL_WORDS[lower]) return MODEL_WORDS[lower];
    if (/^v\d/.test(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
  // "GPT" and the version after it read as one word: "GPT-4o".
  return words.join(' ').replace(/^GPT (\d)/, 'GPT-$1');
}

const OFF_DESCRIPTION = {
  stt: 'The mic button is hidden in chats.',
  tts: "Answers aren't read aloud.",
};

/**
 * The options of the "Runs on" Select for a group (kind: 'stt', 'tts' or
 * 'image'), from the media catalog's `cloud` services:
 *
 *   On this computer · ComfyUI (images) · Services: each one's name with
 *   "Key saved" or "Needs a key" · Off (voice only)
 *
 * `unsupportedReason` disables "On this computer" and says why.
 */
export function runsOnOptions(kind, cloud = {}, { unsupportedReason = null } = {}) {
  const local = {
    value: 'local',
    label: 'On this computer',
    description: unsupportedReason || (kind === 'image' ? 'Uses your graphics card.' : 'Free and private.'),
    disabled: Boolean(unsupportedReason),
  };
  const options = [local];
  if (kind === 'image') options.push({ value: 'comfyui', label: 'ComfyUI', description: 'One you run yourself.' });
  for (const id of SERVICE_ORDER[kind] || []) {
    const service = cloud[id];
    if (!service) continue;
    if (kind === 'stt' && !service.stt) continue;
    if (kind === 'tts' && !service.tts) continue;
    options.push({
      value: id,
      label: service.title || serviceTitle(id),
      group: 'Services',
      hint: service.hasKey ? 'Key saved' : 'Needs a key',
      description: kind === 'image' && service.edits === false ? "Makes new images; can't change them." : undefined,
    });
  }
  if (kind === 'stt' || kind === 'tts') {
    options.push({ separator: true }, { value: 'off', label: 'Off', description: OFF_DESCRIPTION[kind] });
  }
  return options;
}

/** What a group's provider is called in "Still using {current}." */
export function providerLabel(provider, cloud = {}) {
  if (!provider || provider === 'local') return 'On this computer';
  if (provider === 'off') return 'Off';
  if (provider === 'comfyui') return 'ComfyUI';
  return cloud[provider]?.title || serviceTitle(provider);
}
