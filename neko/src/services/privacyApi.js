import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';
import apiClient from './apiClient.js';

const BASE = `${API_BASE_URL}/privacy`;
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });

/** Settings → Privacy & safety (den/src/privacy/privacyRoutes.js). */
export const privacyApi = {
  overview: () => apiRequest(BASE),
  setBlockedSites: (sites) => apiRequest(`${BASE}/blocked-sites`, send('PUT', { sites })),
  exportEstimate: () => apiRequest(`${BASE}/export/estimate`),
  exportEverything: () => apiRequest(`${BASE}/export`, send('POST')),
  /** Carried out the next time the server starts. */
  requestReset: (includeModels) => apiRequest(`${BASE}/reset`, send('POST', { confirm: 'delete everything', includeModels })),
  cancelReset: () => apiRequest(`${BASE}/reset`, { method: 'DELETE' }),
};

const IMPORT = `${API_BASE_URL}/import`;

/** Chats and memories from ChatGPT and Claude exports (den/src/importers). */
export const importApi = {
  /** Read an export (.zip or conversations.json): { token, preview }. */
  preview: async (file) => {
    const body = new FormData();
    body.append('file', file);
    const res = await apiClient.request(`${IMPORT}/chats/preview`, { method: 'POST', body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.error || `The file couldn't be read (${res.status}).`);
    return json;
  },
  // apiRequest adds the current workspace, so imports land where the chat list shows.
  importChats: (token, includeMemories) => apiRequest(`${IMPORT}/chats`, send('POST', { token, includeMemories })),
  importMemories: (text) => apiRequest(`${IMPORT}/memories`, send('POST', { text })),
};

export default privacyApi;
