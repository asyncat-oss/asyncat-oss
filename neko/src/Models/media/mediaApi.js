import apiClient from '../../services/apiClient.js';
import { API_BASE_URL, apiRequest } from '../../CommandCenter/api/client.js';

const BASE = `${API_BASE_URL}/media`;
const SERVER = import.meta.env.VITE_MAIN_URL || '';
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });
const query = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

async function audioUrl(url, body) {
  const res = await apiClient.request(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Couldn't play it.");
  }
  return URL.createObjectURL(await res.blob());
}

/** A gallery or media address from den, made absolute for <img>/<audio>. */
export const mediaUrl = (path) => (path && path.startsWith('/') ? `${SERVER}${path}` : path);

/** Voice and image setup and the gallery (den/src/media/mediaRoutes.js). */
export const mediaApi = {
  voice: {
    get: () => apiRequest(`${BASE}/voice`),
    plan: (options) => apiRequest(`${BASE}/voice/plan${query(options)}`),
    setup: (options) => apiRequest(`${BASE}/voice/setup`, send('POST', options)),
    choose: (choice) => apiRequest(`${BASE}/voice/choose`, send('POST', choice)),
    /** Speak a sentence with a voice; resolves to a blob: URL to play. */
    preview: (options) => audioUrl(`${BASE}/voice/preview`, options),
    sampleUrl: (voiceId) => `${BASE}/voice/samples/${encodeURIComponent(voiceId)}`,
    elevenLabsVoices: () => apiRequest(`${BASE}/voice/elevenlabs-voices`),
  },
  images: {
    get: () => apiRequest(`${BASE}/images`),
    plan: (modelId) => apiRequest(`${BASE}/images/plan${query({ model: modelId })}`),
    setup: (modelId) => apiRequest(`${BASE}/images/setup`, send('POST', { modelId })),
    choose: (choice) => apiRequest(`${BASE}/images/choose`, send('POST', choice)),
    /** Make one image to try it; options: { negativePrompt, width, height, steps, cfg, sampler, scheduler, seed, checkpoint }. */
    tryIt: (prompt, options = {}) => apiRequest(`${BASE}/images/try`, send('POST', { ...options, prompt })),
  },
  setup: {
    get: (jobId) => apiRequest(`${BASE}/setup/${encodeURIComponent(jobId)}`),
    cancel: (jobId) => apiRequest(`${BASE}/setup/${encodeURIComponent(jobId)}/cancel`, send('POST')),
  },
  gallery: {
    list: (params = {}) => apiRequest(`${BASE}/gallery${query(params)}`),
  },
};

export default mediaApi;
