import { API_BASE_URL, ENDPOINTS, apiRequest } from './client.js';
import apiClient from '../../services/apiClient.js';

export const chatApi = {

  runStream: async function* (message, conversationHistory = [], signal = null, opts = {}) {
    const lastImageTurn = Array.isArray(conversationHistory)
      ? conversationHistory.findLastIndex(item => (
          item?.role === 'user'
          && item?.fileAttachments?.some(file => typeof file?.dataUrl === 'string' && file.dataUrl.startsWith('data:image/'))
        ))
      : -1;
    const requestHistory = (Array.isArray(conversationHistory) ? conversationHistory : []).map((item, index) => (
      index === lastImageTurn ? item : { ...item, fileAttachments: undefined }
    ));
    const response = await apiClient.request(`${API_BASE_URL}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        message,
        conversationHistory: requestHistory,
        reasoningEffort: opts.reasoningEffort || 'auto',
        fileAttachments: Array.isArray(opts.fileAttachments) ? opts.fileAttachments : [],
        projectId: opts.projectId || null,
        profileId: opts.profileId || null,
      }),
    });

    if (!response.ok) {
      let messageText = `Chat failed: ${response.statusText}`;
      try {
        const data = await response.json();
        messageText = data.message || data.error || messageText;
      } catch { /* response may not be JSON */ }
      throw new Error(messageText);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            yield event;
            if (event.type === 'done') return;
          } catch (error) {
            console.warn('Failed to parse direct chat SSE:', error);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

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
      fileAttachments,
      knownMessageIds,
      clientId,
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
        fileAttachments,
        knownMessageIds,
        clientId,
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

  searchConversations: async (query, limit = 20) => {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    return await apiRequest(`${ENDPOINTS.CHATS}/search?${params}`);
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

// Folders made before folder editing was removed still show on the Chats page.
export const chatFoldersApi = {
  getFolders: async () => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders`);
  },
};
