import { API_BASE_URL, apiRequest } from './client.js';

export const searchApi = {
  /**
   * Full-text search across projects, notes, conversations, and cards.
   * @param {string} query
   * @param {{ limit?: number, types?: string[] }} opts
   */
  search: async (query, opts = {}) => {
    if (!query || query.trim().length < 2) return { results: [], total: 0, query };

    const params = new URLSearchParams({ q: query.trim() });
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.types?.length) params.set('types', opts.types.join(','));

    return apiRequest(`${API_BASE_URL}/search?${params}`);
  },
};
