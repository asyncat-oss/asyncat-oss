import { API_BASE_URL, apiRequest } from './client.js';

const INSTALL_API_BASE = `${API_BASE_URL}/install`;

export const installApi = {
  getReadiness: async () => {
    return apiRequest(`${INSTALL_API_BASE}/readiness`);
  },

  getCommands: async (manager = '') => {
    const suffix = manager ? `?manager=${encodeURIComponent(manager)}` : '';
    return apiRequest(`${INSTALL_API_BASE}/commands${suffix}`);
  },
};

export default installApi;

