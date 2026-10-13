import { API_BASE_URL, apiRequest } from './client.js';

const BASE = `${API_BASE_URL}/cats`;
const catUrl = (id, suffix = '') => `${BASE}/${encodeURIComponent(id)}${suffix}`;
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });
const query = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Cats: agents that work on their own (den/src/cats/catRoutes.js). */
export const catsApi = {
  list: () => apiRequest(BASE),
  get: (id) => apiRequest(catUrl(id)),
  create: (cat) => apiRequest(BASE, send('POST', cat)),
  update: (id, patch) => apiRequest(catUrl(id), send('PATCH', patch)),
  setEnabled: (id, enabled) => apiRequest(catUrl(id), send('PATCH', { enabled })),
  remove: (id) => apiRequest(catUrl(id), { method: 'DELETE' }),
  /** Run now, or with `message` write to it in its chat. */
  wake: (id, message = null) => apiRequest(catUrl(id, '/wake'), send('POST', message === null ? {} : { message })),
  cancel: (id) => apiRequest(catUrl(id, '/cancel'), send('POST')),
  runs: (id, limit = 20) => apiRequest(catUrl(id, `/runs${query({ limit })}`)),
  timeline: (id, params = {}) => apiRequest(catUrl(id, `/timeline${query(params)}`)),
  chat: (id) => apiRequest(catUrl(id, '/chat'), send('POST')),
  checkTrigger: (id, triggerId) => apiRequest(catUrl(id, `/triggers/${encodeURIComponent(triggerId)}/check`), send('POST')),
  parseSchedule: (text, timezone) => apiRequest(`${BASE}/parse-schedule`, send('POST', { text, timezone })),
  inbox: (params = {}) => apiRequest(`${BASE}/inbox${query(params)}`),
  answer: (itemId, answer) => apiRequest(`${BASE}/inbox/${encodeURIComponent(itemId)}/answer`, send('POST', answer)),
  dismiss: (itemId) => apiRequest(`${BASE}/inbox/${encodeURIComponent(itemId)}/dismiss`, send('POST')),
  readAll: (catId = null) => apiRequest(`${BASE}/inbox/read-all`, send('POST', catId ? { catId } : {})),
  feedback: (runId, feedback) => apiRequest(`${BASE}/runs/${encodeURIComponent(runId)}/feedback`, send('POST', feedback)),
};

export default catsApi;
