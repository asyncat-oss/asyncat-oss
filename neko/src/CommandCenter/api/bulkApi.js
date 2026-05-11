import { chatApi } from './chatApi.js';
import { getCurrentWorkspaceId } from './client.js';

export const bulkApi = {
  bulkUpdateConversations: async (conversationIds, updates) => {
    const promises = conversationIds.map(id =>
      chatApi.updateConversation(id, updates)
    );
    return await Promise.allSettled(promises);
  },

  bulkDeleteConversations: async (conversationIds) => {
    const promises = conversationIds.map(id =>
      chatApi.deleteConversation(id)
    );
    return await Promise.allSettled(promises);
  },
};

export const workspaceUtils = {
  setCurrentWorkspace: (workspaceId) => {
    window.__CURRENT_WORKSPACE_ID__ = workspaceId;
  },

  getCurrentWorkspace: () => {
    return getCurrentWorkspaceId();
  },

  clearWorkspaceContext: () => {
    delete window.__CURRENT_WORKSPACE_ID__;
    sessionStorage.removeItem('currentWorkspace');
  }
};
