import { API_BASE_URL, apiRequest } from './client.js';

export const schedulerApi = {
  listJobs: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule`);
  },

  createJob: async ({ name, goal, schedule, profileId = null, providerProfileId = null }) => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, goal, schedule, profileId, providerProfileId }),
    });
  },

  deleteJob: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  updateJob: async (id, fields) => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields || {}),
    });
  },

  enableJob: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule/${encodeURIComponent(id)}/enable`, {
      method: 'PATCH',
    });
  },

  disableJob: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule/${encodeURIComponent(id)}/disable`, {
      method: 'PATCH',
    });
  },

  listRuns: async (id, limit = 20) => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule/${encodeURIComponent(id)}/runs?limit=${encodeURIComponent(String(limit))}`);
  },

  runNow: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/schedule/${encodeURIComponent(id)}/run-now`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
