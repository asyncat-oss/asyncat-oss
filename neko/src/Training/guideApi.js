import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';

const BASE = `${API_BASE_URL}/training/guide`;
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });

/** Models → Training as steps (den/src/training/guideRoutes.js). */
export const guideApi = {
  sources: () => apiRequest(`${BASE}/sources`),
  buildDataset: (choice) => apiRequest(`${BASE}/dataset`, send('POST', choice)),
  plan: ({ examples = 0, tokens = 0 } = {}) => apiRequest(`${BASE}/plan?examples=${examples}&tokens=${tokens}`),
  train: (body) => apiRequest(`${BASE}/train`, send('POST', body)),
  adapters: () => apiRequest(`${BASE}/adapters`),
  makeAdapter: (jobId, name) => apiRequest(`${BASE}/adapters`, send('POST', { jobId, name })),
  setActive: (id, active) => apiRequest(`${BASE}/adapters/${encodeURIComponent(id)}/active`, send('POST', { active })),
  remove: (id) => apiRequest(`${BASE}/adapters/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  compare: (id, prompt) => apiRequest(`${BASE}/adapters/${encodeURIComponent(id)}/compare`, send('POST', { prompt })),
};

export default guideApi;
