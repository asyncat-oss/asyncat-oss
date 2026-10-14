import { API_BASE_URL, apiRequest, handleResponse } from './client.js';
import apiClient from '../../services/apiClient.js';

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
      hidden: String(hidden),
      max: String(max),
      sort: options.sort || 'relevance',
      order: options.order || 'asc',
    });
    if (options.contentQuery) {
      params.set('cq', options.contentQuery);
    } else {
      params.set('q', query);
    }
    return await apiRequest(`${API_BASE_URL}/files/search?${params}`);
  },

  // Fetch raw file content and return a blob URL (for <audio>, <img>, etc.)
  fetchRawBlob: async (rootId, filePath) => {
    const params = new URLSearchParams({ rootId, path: filePath });
    const res = await apiClient.request(`${API_BASE_URL}/files/raw?${params}`);
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // Attach a file to a chat: den saves it in the folder's .asyncat/attachments
  // under a name it picks, and returns { path, name } relative to the folder.
  attach: async (rootId, file, name = file.name) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rootId', rootId);
    formData.append('name', name);
    const res = await apiClient.request(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      body: formData,
    });
    return await handleResponse(res);
  },
};
