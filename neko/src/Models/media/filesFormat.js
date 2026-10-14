// What "Add from Hugging Face" and "Add a file" need to know about each kind
// of model file: where to search, which files fit, the folder a download
// goes to, and what a file someone picks will be used for.

import { formatBytes } from '../../components/ui/progressFormat.js';
import { baseName } from './mediaFormat.js';

/** One kind of file per search: Hugging Face's task filter, a starting query, the file types and their folder. */
export const HF_SCOPES = {
  listening: {
    label: 'Listening',
    title: 'Find listening models on Hugging Face',
    hint: 'Files in the whisper.cpp format (.bin).',
    filter: 'automatic-speech-recognition',
    query: 'whisper ggml',
    extensions: ['.bin'],
    subDir: 'audio/whisper',
    kindText: 'Listening',
  },
  speaking: {
    label: 'Speaking',
    title: 'Find voices on Hugging Face',
    hint: 'Piper voices (.onnx); each comes with its settings file.',
    filter: 'text-to-speech',
    query: 'piper',
    extensions: ['.onnx'],
    subDir: 'audio/tts',
    kindText: 'Speaking',
  },
  images: {
    label: 'Images',
    title: 'Find image models on Hugging Face',
    hint: 'Single-file models for stable-diffusion.cpp (.gguf, .safetensors, .ckpt).',
    filter: 'text-to-image',
    query: 'stable diffusion gguf',
    extensions: ['.gguf', '.safetensors', '.ckpt'],
    subDir: 'image',
    kindText: 'Image model',
  },
};

/** 1_234_567 → "1.2M", 48_210 → "48k", 950 → "950". */
export function compactCount(value) {
  const number = Number(value) || 0;
  if (number >= 1e6) return `${(number / 1e6).toFixed(number >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(number >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(Math.round(number));
}

/** "Aug 2026" from an ISO date, or ''. */
export function monthYear(iso, locale = undefined) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "1.2M downloads · Aug 2026" for a search result. */
export function repoMeta(repo, locale = undefined) {
  const parts = [`${compactCount(repo?.downloads)} downloads`];
  const when = monthYear(repo?.updated || repo?.created, locale);
  if (when) parts.push(when);
  return parts.join(' · ');
}

const endsWithAny = (name, extensions) => extensions.some((ext) => name.toLowerCase().endsWith(ext));

/**
 * The files of a repo (GET /hf-files) worth offering for a scope, each with
 * the name it is saved as, its size words and, for a voice, the settings
 * file that goes with it.
 */
export function hfFilesFor(files = [], scope = 'listening') {
  const config = HF_SCOPES[scope] || HF_SCOPES.listening;
  const byPath = new Map(files.map((file) => [file.rfilename, file]));
  return files
    .filter((file) => endsWithAny(file.rfilename || '', config.extensions))
    .map((file) => {
      const companion = scope === 'speaking' ? byPath.get(`${file.rfilename}.json`) || null : null;
      const bytes = (Number(file.size) || 0) + (Number(companion?.size) || 0);
      return {
        path: file.rfilename,
        filename: baseName(file.rfilename),
        url: file.url,
        bytes: bytes || null,
        meta: `${config.kindText} · ${bytes ? formatBytes(bytes) : 'Size unknown'}`,
        companion: companion ? { filename: baseName(companion.rfilename), url: companion.url } : null,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

const ADD_TYPES = {
  listening: [{ extensions: ['.bin', '.gguf'], type: 'whisper', usedFor: 'listening' }],
  speaking: [{ extensions: ['.onnx'], type: 'tts', usedFor: 'speaking' }],
  images: [{ extensions: ['.gguf', '.safetensors', '.ckpt'], type: 'image', usedFor: 'images' }],
};
ADD_TYPES.voice = [...ADD_TYPES.listening, ...ADD_TYPES.speaking];

/** The file types "Add a file" accepts for a scope, as the desktop file picker's filters. */
export function fileFilters(scope = 'voice') {
  const filters = {
    listening: [{ name: 'Whisper models', extensions: ['bin'] }],
    speaking: [{ name: 'Piper voices', extensions: ['onnx'] }],
    images: [{ name: 'Image models', extensions: ['gguf', 'safetensors', 'ckpt'] }],
  };
  if (scope === 'voice') return [{ name: 'Whisper models and Piper voices', extensions: ['bin', 'onnx'] }, ...filters.listening, ...filters.speaking];
  return filters[scope] || filters.listening;
}

/**
 * What a picked file will be: { type ('whisper', 'tts' or 'image'), text }
 * ("Used for listening. Asyncat uses it where it is; nothing is copied."),
 * or { error } when Asyncat can't use that kind of file here.
 */
export function fileUse(filePath, scope = 'voice') {
  const name = baseName(String(filePath || '').trim());
  if (!name) return { type: null, text: null, error: null };
  const match = (ADD_TYPES[scope] || ADD_TYPES.voice).find((entry) => endsWithAny(name, entry.extensions));
  if (!match) {
    const accepted = (ADD_TYPES[scope] || ADD_TYPES.voice).flatMap((entry) => entry.extensions);
    const list = accepted.length > 1 ? `${accepted.slice(0, -1).join(', ')} or ${accepted.at(-1)}` : accepted[0];
    return { type: null, text: null, error: `Asyncat can't use this kind of file here. Choose a ${list} file.` };
  }
  return { type: match.type, text: `Used for ${match.usedFor}. Asyncat uses it where it is; nothing is copied.`, error: null };
}

/** "ggml-medium.bin" → "ggml-medium": the name a picked file starts with. */
export function defaultFileName(filePath) {
  return baseName(String(filePath || '').trim()).replace(/\.(bin|gguf|onnx|safetensors|ckpt)$/i, '');
}
