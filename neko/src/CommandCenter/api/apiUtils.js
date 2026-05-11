import { getCurrentWorkspaceId } from './client.js';
import { projectsApi } from './projectsApi.js';
import eventBus from '../../utils/eventBus.js';
import { workspaceUtils } from './bulkApi.js';

export const apiUtils = {
  isNetworkError: (error) => {
    return error.message.includes('fetch') ||
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  },

  isAuthError: (error) => {
    return error.message.includes('401') ||
           error.message.includes('Unauthorized') ||
           error.message.includes('Session expired');
  },

  isWorkspaceError: (error) => {
    return error.message.includes('workspace') ||
           error.message.includes('Workspace') ||
           error.message.includes('access denied');
  },

  formatErrorMessage: (error, context = '') => {
    if (apiUtils.isNetworkError(error)) {
      return `Connection error${context ? ` while ${context}` : ''}. Please check your internet connection.`;
    }

    if (apiUtils.isAuthError(error)) {
      return `Authentication error${context ? ` while ${context}` : ''}. Please sign in again.`;
    }

    if (apiUtils.isWorkspaceError(error)) {
      return `Workspace access error${context ? ` while ${context}` : ''}. Please check your workspace permissions.`;
    }

    return error.message || `An error occurred${context ? ` while ${context}` : ''}.`;
  },

  retryApiCall: async (apiCall, maxRetries = 3, baseDelay = 1000) => {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;

        if (apiUtils.isAuthError(error) || apiUtils.isWorkspaceError(error)) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
};

export const cacheUtils = {
  CACHE_KEYS: {
    PROJECTS: 'asyncat-projects-cache-v3',
    PREFERENCES: 'asyncat-preferences-cache-v2'
  },

  CACHE_DURATION: 5 * 60 * 1000,

  getCache: (key) => {
    try {
      const workspaceId = getCurrentWorkspaceId();
      const cacheKey = workspaceId ? `${key}-${workspaceId}` : key;

      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > cacheUtils.CACHE_DURATION;

      if (isExpired) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return data;
    } catch (error) {
      console.warn('Cache read error:', error);
      return null;
    }
  },

  setCache: (key, data) => {
    try {
      const workspaceId = getCurrentWorkspaceId();
      const cacheKey = workspaceId ? `${key}-${workspaceId}` : key;

      const cacheData = {
        data,
        timestamp: Date.now(),
        workspaceId
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Cache write error:', error);
    }
  },

  clearCache: (key) => {
    try {
      const workspaceId = getCurrentWorkspaceId();
      const cacheKey = workspaceId ? `${key}-${workspaceId}` : key;
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  },

  clearWorkspaceCaches: (workspaceId = null) => {
    try {
      const targetWorkspaceId = workspaceId || getCurrentWorkspaceId();
      if (!targetWorkspaceId) return;

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.includes(`-${targetWorkspaceId}`)) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Workspace cache clear error:', error);
    }
  }
};

export const cachedProjectsApi = {
  getProjects: async (useCache = true) => {
    if (useCache) {
      const cached = cacheUtils.getCache(cacheUtils.CACHE_KEYS.PROJECTS);
      if (cached) {
        return cached;
      }
    }

    const result = await projectsApi.getProjects();

    if (useCache) {
      cacheUtils.setCache(cacheUtils.CACHE_KEYS.PROJECTS, result);
    }

    return result;
  },

  refreshProjects: async () => {
    cacheUtils.clearCache(cacheUtils.CACHE_KEYS.PROJECTS);
    return await cachedProjectsApi.getProjects(false);
  }
};

eventBus.on('workspaceChanged', ({ workspace } = {}) => {
  if (workspace?.id) {
    workspaceUtils.setCurrentWorkspace(workspace.id);
  }
});
