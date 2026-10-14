// The Files page's calls to den (den/src/storage/filesRoutes.js). Every
// action names an item by the id a listing gave it; nothing here builds a
// path.

import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';
import apiClient from '../services/apiClient.js';

const BASE = `${API_BASE_URL}/storage`;
const SERVER = import.meta.env.VITE_MAIN_URL || '';
const item = (id) => `${BASE}/items/${encodeURIComponent(id)}`;
const query = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** An address den gave (a thumbnail, say), made absolute for <img>. */
export const serverUrl = (path) => (path && path.startsWith('/') ? `${SERVER}${path}` : path || '');

/** Where an item's content is read from: for <img>, <audio> and <video>. */
export const contentUrl = (id) => `${item(id)}/content`;

/** Where an item is downloaded from (always plain bytes to save). */
export const downloadUrl = (id) => `${item(id)}/download`;

export const storageApi = {
  /** { desktop, disk, appBytes, scanning, places: [{ id, label, hint, bytes, partial, count }] } */
  places: () => apiRequest(`${BASE}/places`),
  /** One page of a place: { items, total, counts, wheres, offset, limit, desktop }. */
  items: (params) => apiRequest(`${BASE}/items${query(params)}`),
  /** One item, found again by its id: { item, desktop }. */
  item: (id) => apiRequest(item(id)),
  /**
   * An item's text: { text, cut }. `tail` asks for a log's last lines; `cut`
   * says there is more than was sent.
   */
  text: async (id, { tail = null } = {}) => {
    const res = await apiClient.request(`${contentUrl(id)}${tail ? `?tail=${tail}` : ''}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `It couldn't be opened (${res.status}).`);
    }
    return { text: await res.text(), cut: res.headers.get('X-Truncated') === '1' };
  },
  reveal: (id) => apiRequest(`${item(id)}/reveal`, { method: 'POST', body: '{}' }),
  open: (id) => apiRequest(`${item(id)}/open`, { method: 'POST', body: '{}' }),
  /** { freedBytes, mode: 'trash' | 'delete' }. `permanent` deletes instead of using the Trash. */
  remove: (id, { permanent = false } = {}) => apiRequest(`${item(id)}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' }),
  /** 'old-logs' | 'unfinished-downloads' | 'unused-attachments' | 'caches': { freedBytes, files }. */
  clean: (action) => apiRequest(`${BASE}/clean`, { method: 'POST', body: JSON.stringify({ action }) }),
  /** The database's files and its tables' row counts, for developers. */
  database: () => apiRequest(`${BASE}/database`),
};

export default storageApi;
