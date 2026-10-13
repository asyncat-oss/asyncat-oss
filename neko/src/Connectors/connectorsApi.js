import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';

const BASE = `${API_BASE_URL}/connectors`;
const url = (name, suffix = '') => `${BASE}/${encodeURIComponent(name)}${suffix}`;
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });

/** Connectors: MCP servers the agent can use (den/src/connectors/connectorRoutes.js). */
export const connectorsApi = {
  list: () => apiRequest(BASE),
  add: (connector) => apiRequest(BASE, send('POST', connector)),
  update: (name, patch) => apiRequest(url(name), send('PATCH', patch)),
  setEnabled: (name, enabled) => apiRequest(url(name), send('PATCH', { enabled })),
  remove: (name) => apiRequest(url(name), { method: 'DELETE' }),
  restart: (name) => apiRequest(url(name, '/restart'), send('POST')),
  signIn: (name) => apiRequest(url(name, '/sign-in'), send('POST')),
  signOut: (name) => apiRequest(url(name, '/sign-out'), send('POST')),
  /** What a command downloads before it first runs: { command, args } or { catalogId }. */
  checkDownload: (target) => apiRequest(`${BASE}/check-download`, send('POST', target)),
  /** With `deep`, counts the packages it needs too (that lookup uses some data). */
  downloadSize: (name, deep = false) => apiRequest(url(name, `/download-size${deep ? '?deep=1' : ''}`)),
  approveDownload: (name, version = null) => apiRequest(url(name, '/approve-download'), send('POST', version ? { version } : {})),
};

export default connectorsApi;
