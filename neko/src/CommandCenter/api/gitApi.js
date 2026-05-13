import { API_BASE_URL, apiRequest } from './client.js';

export const gitApi = {
  getState: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/git/state`);
  },

  log: async ({ limit = 100, skip = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
    return await apiRequest(`${API_BASE_URL}/agent/git/log?${params}`);
  },

  getDiff: async ({ file = null, staged = false } = {}) => {
    const params = new URLSearchParams({ staged: String(Boolean(staged)) });
    if (file) params.set('file', file);
    return await apiRequest(`${API_BASE_URL}/agent/git/diff?${params}`);
  },

  generateCommitMessage: async ({ scope = 'auto' } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/commit-message`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    });
  },

  stage: async (files = []) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/stage`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    });
  },

  unstage: async (files = []) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/unstage`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    });
  },

  commit: async ({ message, files = [], amend = false }) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message, files, amend }),
    });
  },

  pull: async ({ remote = null, branch = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/pull`, {
      method: 'POST',
      body: JSON.stringify({ remote, branch }),
    });
  },

  push: async ({ remote = 'origin', branch = null, setUpstream = false } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/push`, {
      method: 'POST',
      body: JSON.stringify({ remote, branch, setUpstream }),
    });
  },

  stash: async ({ action = 'list', message = null, index = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/stash`, {
      method: 'POST',
      body: JSON.stringify({ action, message, index }),
    });
  },

  branch: async ({ action = 'list', name = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/branch`, {
      method: 'POST',
      body: JSON.stringify({ action, name }),
    });
  },
};
