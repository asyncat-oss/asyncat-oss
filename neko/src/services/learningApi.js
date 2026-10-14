// neko/src/services/learningApi.js
// Learning from chats (den/src/agent/learningRoutes.js): the two switches in
// Settings → Privacy & safety, and the "Save this as a skill?" drafts.

import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';

const BASE = `${API_BASE_URL}/learning`;
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });

export const learningApi = {
  /** { settings: { rememberChats, suggestSkills } } */
  settings: () => apiRequest(BASE),
  setSettings: (changes) => apiRequest(BASE, send('PUT', changes)),
  suggestions: (conversationId) => apiRequest(`${BASE}/suggestions?conversationId=${encodeURIComponent(conversationId)}`),
  saveSuggestion: (id) => apiRequest(`${BASE}/suggestions/${encodeURIComponent(id)}/save`, send('POST')),
  dismissSuggestion: (id) => apiRequest(`${BASE}/suggestions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export default learningApi;
