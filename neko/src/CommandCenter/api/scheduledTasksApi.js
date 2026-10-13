import { API_BASE_URL, apiRequest } from './client.js';

const BASE = `${API_BASE_URL}/agent/scheduled-tasks`;
const taskUrl = (id, suffix = '') => `${BASE}/${encodeURIComponent(id)}${suffix}`;
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });

/** Scheduled tasks (den/src/ai/routes/scheduledTaskRoutes.js). */
export const scheduledTasksApi = {
  list: () => apiRequest(BASE),
  get: (id) => apiRequest(taskUrl(id)),
  create: (task) => apiRequest(BASE, send('POST', task)),
  update: (id, patch) => apiRequest(taskUrl(id), send('PATCH', patch)),
  setEnabled: (id, enabled) => apiRequest(taskUrl(id), send('PATCH', { enabled })),
  remove: (id) => apiRequest(taskUrl(id), { method: 'DELETE' }),
  runNow: (id) => apiRequest(taskUrl(id, '/run'), send('POST')),
  cancel: (id) => apiRequest(taskUrl(id, '/cancel'), send('POST')),
  runs: (id, limit = 20) => apiRequest(taskUrl(id, `/runs?limit=${encodeURIComponent(String(limit))}`)),
  parseSchedule: (text, timezone) => apiRequest(`${BASE}/parse-schedule`, send('POST', { text, timezone })),
};

export default scheduledTasksApi;
