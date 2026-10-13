import { getCurrentWorkspaceId } from './client.js';

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
