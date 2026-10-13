import { API_BASE_URL, apiRequest } from './client.js';

const INSTALL_API_BASE = `${API_BASE_URL}/install`;

export const installApi = {
  // `refresh` checks again instead of using the report from the last minute.
  getReadiness: async ({ refresh = false } = {}) => {
    return apiRequest(`${INSTALL_API_BASE}/readiness${refresh ? '?refresh=1' : ''}`);
  },

  getCommands: async (manager = '') => {
    const suffix = manager ? `?manager=${encodeURIComponent(manager)}` : '';
    return apiRequest(`${INSTALL_API_BASE}/commands${suffix}`);
  },
};

export default installApi;

