import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';

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

export default privacyApi;
