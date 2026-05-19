import { API_BASE_URL, apiRequest } from './client.js';

const CODE_BASE = `${API_BASE_URL}/agent/code`;

export const codeApi = {
  search: (query, { kind = 'any', language, limit = 30, path } = {}) => {
    const params = new URLSearchParams({ q: query, kind, limit: String(limit) });
    if (language) params.set('language', language);
    if (path) params.set('path', path);
    return apiRequest(`${CODE_BASE}/search?${params}`);
  },

  listDefinitions: (file, { path } = {}) => {
    const params = new URLSearchParams({ file });
    if (path) params.set('path', path);
    return apiRequest(`${CODE_BASE}/definitions?${params}`);
  },

  findDefinition: (symbol, { language, path } = {}) => {
    const params = new URLSearchParams({ symbol });
    if (language) params.set('language', language);
    if (path) params.set('path', path);
    return apiRequest(`${CODE_BASE}/find-definition?${params}`);
  },

  findReferences: (symbol, { language, limit = 50, path } = {}) => {
    const params = new URLSearchParams({ symbol, limit: String(limit) });
    if (language) params.set('language', language);
    if (path) params.set('path', path);
    return apiRequest(`${CODE_BASE}/references?${params}`);
  },

  renameSymbol: (oldName, newName, { language, preview = true, path } = {}) => {
    return apiRequest(`${CODE_BASE}/rename`, {
      method: 'POST',
      body: JSON.stringify({ old_name: oldName, new_name: newName, language, preview, path }),
    });
  },
};
