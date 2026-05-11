import { API_BASE_URL, ENDPOINTS, apiRequest } from './client.js';

export const chatApi = {

  generateTitle: async (userMessage, aiResponse) => {
    return await apiRequest(`${API_BASE_URL}/ai/generate-title`, {
      method: 'POST',
      body: JSON.stringify({ userMessage, aiResponse: (aiResponse || '').slice(0, 400) })
    });
  },

  saveConversation: async (conversationData) => {
    const {
      messages,
      title,
      mode,
      projectIds,
      conversationId,
      metadata,
      fileAttachments
    } = conversationData;

    return await apiRequest(`${ENDPOINTS.CHATS}/save`, {
      method: 'POST',
      body: JSON.stringify({
        messages,
        title,
        mode,
        projectIds,
        conversationId,
        metadata,
        fileAttachments
      })
    });
  },

  loadConversation: async (conversationId) => {
    return await apiRequest(`${ENDPOINTS.CHATS}/${conversationId}`);
  },

  getConversationHistory: async (filters = {}) => {
    const {
      limit = 50,
      offset = 0,
      search = '',
      mode = 'all',
      archived = false
    } = filters;

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      search,
      mode,
      archived: archived.toString()
    });

    return await apiRequest(`${ENDPOINTS.CHATS}?${params}`);
  },

  getConversationWorkspaces: async () => {
    return await apiRequest(`${ENDPOINTS.CHATS}/workspaces`);
  },

  updateConversation: async (conversationId, updates) => {
    return await apiRequest(`${ENDPOINTS.CHATS}/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  deleteConversation: async (conversationId) => {
    return await apiRequest(`${ENDPOINTS.CHATS}/${conversationId}`, {
      method: 'DELETE'
    });
  },

};

export const chatFoldersApi = {
  getFolders: async () => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders`);
  },

  createFolder: async (name, color = null) => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders`, {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
  },

  updateFolder: async (folderId, updates) => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  deleteFolder: async (folderId) => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders/${folderId}`, {
      method: 'DELETE'
    });
  },

  assignConversation: async (conversationId, folderId) => {
    return await apiRequest(`${API_BASE_URL}/ai/chats/${conversationId}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folder_id: folderId })
    });
  }
};
