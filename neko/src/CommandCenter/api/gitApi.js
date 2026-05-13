import { API_BASE_URL, apiRequest } from './client.js';

export const gitApi = {
  getState: async ({ path = null } = {}) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    const suffix = params.toString() ? `?${params}` : '';
    return await apiRequest(`${API_BASE_URL}/agent/git/state${suffix}`);
  },

  log: async ({ limit = 100, skip = 0, path = null } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
    if (path) params.set('path', path);
    return await apiRequest(`${API_BASE_URL}/agent/git/log?${params}`);
  },

  getDiff: async ({ file = null, staged = false, path = null } = {}) => {
    const params = new URLSearchParams({ staged: String(Boolean(staged)) });
    if (file) params.set('file', file);
    if (path) params.set('path', path);
    return await apiRequest(`${API_BASE_URL}/agent/git/diff?${params}`);
  },

  generateCommitMessage: async ({ scope = 'auto', path = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/commit-message`, {
      method: 'POST',
      body: JSON.stringify({ scope, path }),
    });
  },

  stage: async (files = [], path = null) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/stage`, {
      method: 'POST',
      body: JSON.stringify({ files, path }),
    });
  },

  unstage: async (files = [], path = null) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/unstage`, {
      method: 'POST',
      body: JSON.stringify({ files, path }),
    });
  },

  commit: async ({ message, files = [], amend = false, path = null }) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message, files, amend, path }),
    });
  },

  pull: async ({ remote = null, branch = null, path = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/pull`, {
      method: 'POST',
      body: JSON.stringify({ remote, branch, path }),
    });
  },

  push: async ({ remote = 'origin', branch = null, setUpstream = false, path = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/push`, {
      method: 'POST',
      body: JSON.stringify({ remote, branch, setUpstream, path }),
    });
  },

  stash: async ({ action = 'list', message = null, index = null, path = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/stash`, {
      method: 'POST',
      body: JSON.stringify({ action, message, index, path }),
    });
  },

  branch: async ({ action = 'list', name = null, path = null } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/branch`, {
      method: 'POST',
      body: JSON.stringify({ action, name, path }),
    });
  },

  branches: async ({ path = null } = {}) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    const suffix = params.toString() ? `?${params}` : '';
    return await apiRequest(`${API_BASE_URL}/agent/git/branches${suffix}`);
  },

  commitDetail: async ({ hash, path = null } = {}) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    const suffix = params.toString() ? `?${params}` : '';
    return await apiRequest(`${API_BASE_URL}/agent/git/commit/${hash}${suffix}`);
  },

  discard: async (files = [], path = null) => {
    return await apiRequest(`${API_BASE_URL}/agent/git/discard`, {
      method: 'POST',
      body: JSON.stringify({ files, path }),
    });
  },
};
