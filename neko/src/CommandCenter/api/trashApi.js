import { API_BASE_URL, apiRequest } from './client.js';

export const trashApi = {
  getTrash: async () => apiRequest(`${API_BASE_URL}/ai/chats/trash`),
  restore:  async (conversationId) => apiRequest(`${API_BASE_URL}/ai/chats/${conversationId}/restore`, { method: 'POST', body: JSON.stringify({}) }),
  deletePermanent: async (conversationId) => apiRequest(`${API_BASE_URL}/ai/chats/${conversationId}/permanent`, { method: 'DELETE' }),
  emptyTrash: async () => apiRequest(`${API_BASE_URL}/ai/chats/trash/empty`, { method: 'DELETE' }),
};
