import { API_BASE_URL, apiRequest, handleResponse } from './client.js';
import authService from '../../services/authService.js';

export const filesApi = {
  getRoots: async () => {
    return await apiRequest(`${API_BASE_URL}/files/roots`);
  },

  loadEntry: async (rootId = 'workspace', entryPath = '.', hidden = false) => {
    const params = new URLSearchParams({ rootId, path: entryPath, hidden: String(hidden) });
    return await apiRequest(`${API_BASE_URL}/files/entry?${params}`);
  },

  listDirectory: async (rootId = 'workspace', dirPath = '.', hidden = false) => {
    const params = new URLSearchParams({ rootId, path: dirPath, hidden: String(hidden) });
    return await apiRequest(`${API_BASE_URL}/files/list?${params}`);
  },

  search: async (rootId = 'workspace', dirPath = '.', query = '', hidden = false, max = 120) => {
    const params = new URLSearchParams({ rootId, path: dirPath, q: query, hidden: String(hidden), max: String(max) });
    return await apiRequest(`${API_BASE_URL}/files/search?${params}`);
  },

  createFolder: async (rootId, filePath) => {
    return await apiRequest(`${API_BASE_URL}/files/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ rootId, path: filePath }),
    });
  },

  writeFile: async (rootId, filePath, content = '') => {
    return await apiRequest(`${API_BASE_URL}/files/write`, {
      method: 'POST',
      body: JSON.stringify({ rootId, path: filePath, content }),
    });
  },

  copy: async (rootId, source, destination) => {
    return await apiRequest(`${API_BASE_URL}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ rootId, source, destination }),
    });
  },

  move: async (rootId, source, destination) => {
    return await apiRequest(`${API_BASE_URL}/files/move`, {
      method: 'POST',
      body: JSON.stringify({ rootId, source, destination }),
    });
  },

  delete: async (rootId, filePath, recursive = false) => {
    return await apiRequest(`${API_BASE_URL}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ rootId, path: filePath, recursive }),
    });
  },

  getRawUrl: (rootId, filePath) => {
    const params = new URLSearchParams({ rootId, path: filePath });
    return `${API_BASE_URL}/files/raw?${params}`;
  },

  upload: async (rootId, filePath, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rootId', rootId);
    formData.append('path', filePath);
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token?.access_token}` },
      body: formData,
    });
    return await handleResponse(res);
  },
};
