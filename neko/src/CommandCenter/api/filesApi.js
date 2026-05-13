import { API_BASE_URL, apiRequest, handleResponse } from './client.js';
import authService from '../../services/authService.js';

export const filesApi = {
  getRoots: async () => {
    return await apiRequest(`${API_BASE_URL}/files/roots`);
  },

  loadEntry: async (rootId = 'workspace', entryPath = '.', hidden = false, options = {}) => {
    const params = new URLSearchParams({
      rootId,
      path: entryPath,
      hidden: String(hidden),
      sort: options.sort || 'name',
      order: options.order || 'asc',
      limit: String(options.limit || 1000),
    });
    return await apiRequest(`${API_BASE_URL}/files/entry?${params}`);
  },

  listDirectory: async (rootId = 'workspace', dirPath = '.', hidden = false, options = {}) => {
    const params = new URLSearchParams({
      rootId,
      path: dirPath,
      hidden: String(hidden),
      sort: options.sort || 'name',
      order: options.order || 'asc',
      limit: String(options.limit || 1000),
    });
    return await apiRequest(`${API_BASE_URL}/files/list?${params}`);
  },

  search: async (rootId = 'workspace', dirPath = '.', query = '', hidden = false, max = 120, options = {}) => {
    const params = new URLSearchParams({
      rootId,
      path: dirPath,
      q: query,
      hidden: String(hidden),
      max: String(max),
      sort: options.sort || 'relevance',
      order: options.order || 'asc',
    });
    return await apiRequest(`${API_BASE_URL}/files/search?${params}`);
  },

  createFolder: async (rootId, filePath, options = {}) => {
    return await apiRequest(`${API_BASE_URL}/files/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ rootId, path: filePath, overwrite: options.overwrite === true }),
    });
  },

  writeFile: async (rootId, filePath, content = '', options = {}) => {
    return await apiRequest(`${API_BASE_URL}/files/write`, {
      method: 'POST',
      body: JSON.stringify({ rootId, path: filePath, content, overwrite: options.overwrite !== false }),
    });
  },

  copy: async (rootId, source, destination, options = {}) => {
    return await apiRequest(`${API_BASE_URL}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ rootId, source, destination, overwrite: options.overwrite !== false }),
    });
  },

  move: async (rootId, source, destination, options = {}) => {
    return await apiRequest(`${API_BASE_URL}/files/move`, {
      method: 'POST',
      body: JSON.stringify({ rootId, source, destination, overwrite: options.overwrite !== false }),
    });
  },

  delete: async (rootId, filePath, recursive = false) => {
    return await apiRequest(`${API_BASE_URL}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ rootId, path: filePath, recursive }),
    });
  },

  batchDelete: async (rootId, entries = []) => {
    return await apiRequest(`${API_BASE_URL}/files/batch-delete`, {
      method: 'POST',
      body: JSON.stringify({ rootId, entries }),
    });
  },

  batchCopy: async (rootId, entries = []) => {
    return await apiRequest(`${API_BASE_URL}/files/batch-copy`, {
      method: 'POST',
      body: JSON.stringify({ rootId, entries }),
    });
  },

  getRawUrl: (rootId, filePath) => {
    const params = new URLSearchParams({ rootId, path: filePath });
    return `${API_BASE_URL}/files/raw?${params}`;
  },

  // Fetch raw file content with auth and return a blob URL (for <audio>, <img>, etc.)
  fetchRawBlob: async (rootId, filePath) => {
    const token = await authService.getSession();
    const params = new URLSearchParams({ rootId, path: filePath });
    const res = await fetch(`${API_BASE_URL}/files/raw?${params}`, {
      headers: token?.access_token ? { Authorization: `Bearer ${token.access_token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  upload: async (rootId, filePath, file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rootId', rootId);
    formData.append('path', filePath);
    formData.append('overwrite', String(options.overwrite === true));
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token?.access_token}` },
      body: formData,
    });
    return await handleResponse(res);
  },
};
