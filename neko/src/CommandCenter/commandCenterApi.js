// commandCenterApi.js - Simplified: Chat Only
import authService from '../services/authService.js';
import eventBus from '../utils/eventBus.js';

const API_BASE_URL = import.meta.env.VITE_MAIN_URL + '/api';
const USER_API_BASE_URL = import.meta.env.VITE_USER_URL + '/api';

// API Endpoints
const ENDPOINTS = {
  // Core endpoints
  AI_UNIFIED: `${API_BASE_URL}/ai/unified`,
  AI_FEED: `${API_BASE_URL}/ai/feed`,
  CHATS: `${API_BASE_URL}/ai/chats`,
  PROJECTS: `${USER_API_BASE_URL}/projects`
};

// Helper function to get current workspace ID from context
const getCurrentWorkspaceId = () => {
  try {
    const savedWorkspace = sessionStorage.getItem('currentWorkspace');
    if (savedWorkspace) {
      const workspace = JSON.parse(savedWorkspace);
      return workspace?.id || null;
    }
    
    if (window.__CURRENT_WORKSPACE_ID__) {
      return window.__CURRENT_WORKSPACE_ID__;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to get current workspace ID:', error);
    return null;
  }
};

// Helper function to handle API responses
const handleResponse = async (response) => {
  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.message || errorData.error;
      }
      // Handle payload too large errors specifically
      if (response.status === 413) {
        errorMessage = errorData.message || 'The file is too large to process. Please use a smaller image.';
      }
    } catch {
      // If we can't parse JSON, handle payload errors by status code
      if (response.status === 413) {
        errorMessage = 'The file is too large to process. Please use a smaller image.';
      }
    }
    throw new Error(errorMessage);
  }
  
  try {
    return await response.json();
  } catch (error) {
    console.error('Failed to parse JSON response:', error);
    throw new Error('Invalid JSON response from server');
  }
};

// Helper function to add workspace ID to URL as query parameter
const addWorkspaceToUrl = (url, workspaceId) => {
  if (!workspaceId) return url;
  
  const urlObj = new URL(url, window.location.origin);
  urlObj.searchParams.set('workspaceId', workspaceId);
  return urlObj.toString();
};

// Helper function to make authenticated API requests with workspace context
const apiRequest = async (url, options = {}) => {
  const workspaceId = getCurrentWorkspaceId();
  
  // Add workspace ID to URL as query parameter for all methods
  let finalUrl = url;
  if (workspaceId) {
    finalUrl = addWorkspaceToUrl(url, workspaceId);
  }
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include',
    ...options
  };
  
  // For POST/PUT/PATCH requests, include workspace ID in body
  if (workspaceId && options.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
    try {
      const bodyData = JSON.parse(options.body);
      bodyData.workspaceId = workspaceId;
      defaultOptions.body = JSON.stringify(bodyData);
    } catch (error) {
      console.warn('Could not add workspace ID to request body:', error);
    }
  }
  
  const response = await authService.authenticatedFetch(finalUrl, defaultOptions);
  return await handleResponse(response);
};



// Helper function to get user timezone information
const getUserTimeContext = () => {
  try {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userLocalDateTime = new Date().toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: userTimezone
    });
    
    return { userTimezone, userLocalDateTime };
  } catch (error) {
    console.warn('Failed to get timezone information:', error);
    return {
      userTimezone: 'UTC',
      userLocalDateTime: new Date().toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: 'UTC'
      })
    };
  }
};


// =====================================================
// CHAT & CONVERSATION API METHODS WITH WORKSPACE SUPPORT
// =====================================================

export const chatApi = {
  /**
   * Send a unified chat message
   * Note: AI automatically detects when comprehensive/note-worthy responses are needed
   */
  sendMessage: async (message, conversationHistory = [], projectIds = [], mode = 'chat', uploadedFiles = null, fileContentsForAI = null) => {
    const { userTimezone, userLocalDateTime } = getUserTimeContext();

    const payload = {
      message: message.trim(),
      conversationHistory,
      projectIds,
      mode,
      userTimezone,
      userLocalDateTime
    };

    // Add file data if present
    if (uploadedFiles && uploadedFiles.length > 0) {
      payload.uploadedFiles = uploadedFiles;
    }
    
    if (fileContentsForAI) {
      payload.fileContentsForAI = fileContentsForAI;
    }

    return await apiRequest(ENDPOINTS.AI_UNIFIED, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  /**
   * Send a streaming chat message
   * Returns an async generator that yields content chunks
   */
  sendMessageStream: async function* (message, conversationHistory = [], projectIds = [], webSearch = false, modelConfig = null) {
    const { userTimezone, userLocalDateTime } = getUserTimeContext();
    const workspaceId = getCurrentWorkspaceId();

    const payload = {
      message: message.trim(),
      conversationHistory,
      projectIds,
      userTimezone,
      userLocalDateTime,
      workspaceId,
      webSearch,
      ...(modelConfig ? { modelConfig } : {}),
    };

    const token = await authService.getSession();
    const response = await fetch(`${API_BASE_URL}/ai/unified-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token?.access_token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Parse structured error body so usage-limit messages reach the user correctly
      try {
        const errData = await response.json();
        const err = new Error(errData.message || errData.error || `Streaming failed: ${response.statusText}`);
          throw err;
      } catch (parseErr) {
        if (parseErr.code || parseErr.type) throw parseErr;
        throw new Error(`Streaming failed: ${response.statusText}`);
      }
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'error' || parsed.type === 'content_filter' || parsed.type === 'local_model_offline' || parsed.type === 'context_overflow') {
                const error = new Error(parsed.error);
                error.code = parsed.code;
                error.type = parsed.type;
                throw error;
              }
              if (parsed.type === 'done') {
                return;
              }
              // Tool call and search events - yield as objects
              if (
                parsed.type === 'tool_start' || parsed.type === 'tool_done' ||
                parsed.type === 'suggestions' ||
                parsed.type === 'search_start' || parsed.type === 'search_done' || parsed.type === 'search_error'
              ) {
                yield parsed;
                continue;
              }
              if (parsed.content) {
                yield parsed.content;
              }
            } catch (e) {
              if (e.code || e.type) {
                // Re-throw errors with code/type (our custom errors)
                throw e;
              }
              console.warn('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  /**
   * Summarize conversation for context management
   */
  summarizeConversation: async (conversationData) => {
    const { conversation, messageCount, mode = 'chat' } = conversationData;

    return await apiRequest(`${API_BASE_URL}/ai/summarize-conversation`, {
      method: 'POST',
      body: JSON.stringify({
        conversation,
        messageCount,
        mode
      })
    });
  },

  /**
   * Generate a short title for a conversation using the local model
   */
  generateTitle: async (userMessage, aiResponse) => {
    return await apiRequest(`${API_BASE_URL}/ai/generate-title`, {
      method: 'POST',
      body: JSON.stringify({ userMessage, aiResponse: (aiResponse || '').slice(0, 400) })
    });
  },

  /**
   * Save a conversation
   */
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

  /**
   * Load a specific conversation
   */
  loadConversation: async (conversationId) => {
    return await apiRequest(`${ENDPOINTS.CHATS}/${conversationId}`);
  },

  /**
   * Get conversation history with filtering
   */
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

  /**
   * Get conversation statistics
   */
  getStats: async () => {
    return await apiRequest(`${ENDPOINTS.CHATS}/stats/summary`);
  },

  /**
   * Get conversation workspaces
   */
  getConversationWorkspaces: async () => {
    return await apiRequest(`${ENDPOINTS.CHATS}/workspaces`);
  },

  /**
   * Update a conversation (pin, archive, rename, etc.)
   */
  updateConversation: async (conversationId, updates) => {
    return await apiRequest(`${ENDPOINTS.CHATS}/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Delete a conversation
   */
  deleteConversation: async (conversationId) => {
    return await apiRequest(`${ENDPOINTS.CHATS}/${conversationId}`, {
      method: 'DELETE'
    });
  },

};

// =====================================================
// PROJECTS API METHODS
// =====================================================

export const projectsApi = {
  /**
   * Get all projects
   */
  getProjects: async () => {
    return await apiRequest(ENDPOINTS.PROJECTS);
  },

  /**
   * Get projects by IDs
   */
  getProjectsByIds: async (projectIds) => {
    if (!projectIds || projectIds.length === 0) {
      return { data: [], projects: [] };
    }

    const result = await apiRequest(ENDPOINTS.PROJECTS);
    const allProjects = result.data || result.projects || result;
    
    if (!Array.isArray(allProjects)) {
      throw new Error('Invalid projects response format');
    }

    const filteredProjects = allProjects.filter(project => 
      projectIds.includes(project.id)
    );

    return {
      ...result,
      data: filteredProjects,
      projects: filteredProjects
    };
  },

  /**
   * Get projects that support notes
   */
  getNotesEnabledProjects: async () => {
    const result = await apiRequest(ENDPOINTS.PROJECTS);
    const allProjects = result.data || result.projects || result;
    
    if (!Array.isArray(allProjects)) {
      throw new Error('Invalid projects response format');
    }

    const notesEnabledProjects = allProjects.filter(project => 
      project.has_notes !== false
    );

    return {
      ...result,
      data: notesEnabledProjects,
      projects: notesEnabledProjects
    };
  }
};

// =====================================================
// TRASH API
// =====================================================

export const trashApi = {
  getTrash: async () => apiRequest(`${API_BASE_URL}/ai/chats/trash`),
  restore:  async (conversationId) => apiRequest(`${API_BASE_URL}/ai/chats/${conversationId}/restore`, { method: 'POST', body: JSON.stringify({}) }),
  deletePermanent: async (conversationId) => apiRequest(`${API_BASE_URL}/ai/chats/${conversationId}/permanent`, { method: 'DELETE' }),
  emptyTrash: async () => apiRequest(`${API_BASE_URL}/ai/chats/trash/empty`, { method: 'DELETE' }),
};

// =====================================================
// CHAT FOLDER API METHODS (user-specific)
// =====================================================

export const chatFoldersApi = {
  /**
   * Get user's chat folders for current workspace
   */
  getFolders: async () => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders`);
  },

  /**
   * Create a new chat folder
   */
  createFolder: async (name, color = null) => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders`, {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
  },

  /**
   * Rename or reorder a folder
   */
  updateFolder: async (folderId, updates) => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Delete a folder (conversations become unfiled)
   */
  deleteFolder: async (folderId) => {
    return await apiRequest(`${API_BASE_URL}/ai/chat-folders/${folderId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Assign a conversation to a folder, or pass null to unassign
   */
  assignConversation: async (conversationId, folderId) => {
    return await apiRequest(`${API_BASE_URL}/ai/chats/${conversationId}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folder_id: folderId })
    });
  }
};

// =====================================================
// PROJECT FOLDER API METHODS (user-specific)
// =====================================================

export const projectFoldersApi = {
  /**
   * Get user's project folders for current workspace
   */
  getFolders: async () => {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) return { folders: [] };
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders?workspaceId=${workspaceId}`);
  },

  /**
   * Create a new project folder
   */
  createFolder: async (name, color = null) => {
    const workspaceId = getCurrentWorkspaceId();
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders`, {
      method: 'POST',
      body: JSON.stringify({ name, color, workspaceId })
    });
  },

  /**
   * Rename a project folder
   */
  updateFolder: async (folderId, updates) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Delete a project folder
   */
  deleteFolder: async (folderId) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Add a project to a folder
   */
  addProject: async (folderId, projectId) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}/items`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
  },

  /**
   * Remove a project from a folder
   */
  removeProject: async (folderId, projectId) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}/items/${projectId}`, {
      method: 'DELETE'
    });
  }
};

// =====================================================
// BULK OPERATIONS
// =====================================================

export const bulkApi = {
  /**
   * Bulk update conversations
   */
  bulkUpdateConversations: async (conversationIds, updates) => {
    const promises = conversationIds.map(id => 
      chatApi.updateConversation(id, updates)
    );
    return await Promise.allSettled(promises);
  },

  /**
   * Bulk delete conversations
   */
  bulkDeleteConversations: async (conversationIds) => {
    const promises = conversationIds.map(id => 
      chatApi.deleteConversation(id)
    );
    return await Promise.allSettled(promises);
  },

};

// =====================================================
// FOR YOU FEED API
// =====================================================

export const feedApi = {
  /**
   * Get personalized "For You" feed
   * Returns AI-generated personalized dashboard content
   */
  getFeed: async (options = {}) => {
    const { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } = options;
    const workspaceId = getCurrentWorkspaceId();
    
    let url = ENDPOINTS.AI_FEED;
    const params = new URLSearchParams();
    
    if (timezone) params.append('timezone', timezone);
    if (workspaceId) params.append('workspaceId', workspaceId);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    return await apiRequest(url);
  },

  /**
   * Get cached feed or fetch new one
   */
  getCachedFeed: async (options = {}) => {
    const { forceRefresh = false, maxAge = 5 * 60 * 1000 } = options;
    const workspaceId = getCurrentWorkspaceId();
    // Make cache key workspace-specific
    const cacheKey = workspaceId ? `asyncat-feed-cache-${workspaceId}` : 'asyncat-feed-cache';
    
    // If forcing refresh, clear the cache first
    if (forceRefresh) {
      try {
        localStorage.removeItem(cacheKey);
      } catch {
        // Ignore cache errors
      }
    } else {
      // Try to use cached data
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - new Date(parsed.generatedAt).getTime();
          
          if (age < maxAge) {
            return { success: true, feed: parsed, fromCache: true };
          }
        }
      } catch {
        // Ignore cache errors
      }
    }
    
    // Fetch fresh data from server
    const result = await feedApi.getFeed(options);
    
    if (result.success && result.feed) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(result.feed));
      } catch {
        // Ignore storage errors
      }
    }
    
    return { ...result, fromCache: false };
  },

  /**
   * Clear feed cache (current workspace or all)
   */
  clearCache: (clearAll = false) => {
    try {
      if (clearAll) {
        // Clear all feed caches
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('asyncat-feed-cache')) {
            localStorage.removeItem(key);
          }
        }
      } else {
        // Clear only current workspace cache
        const workspaceId = getCurrentWorkspaceId();
        const cacheKey = workspaceId ? `asyncat-feed-cache-${workspaceId}` : 'asyncat-feed-cache';
        localStorage.removeItem(cacheKey);
      }
    } catch {
      // Ignore errors
    }
  }
};

// =====================================================
// WORKSPACE UTILITIES
// =====================================================

export const workspaceUtils = {
  /**
   * Set current workspace ID for API calls
   */
  setCurrentWorkspace: (workspaceId) => {
    window.__CURRENT_WORKSPACE_ID__ = workspaceId;
  },

  /**
   * Get current workspace ID
   */
  getCurrentWorkspace: () => {
    return getCurrentWorkspaceId();
  },

  /**
   * Clear workspace context
   */
  clearWorkspaceContext: () => {
    delete window.__CURRENT_WORKSPACE_ID__;
    sessionStorage.removeItem('currentWorkspace');
  }
};

// =====================================================
// ERROR HANDLING UTILITIES
// =====================================================

export const apiUtils = {
  /**
   * Check if an error is a network error
   */
  isNetworkError: (error) => {
    return error.message.includes('fetch') || 
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  },

  /**
   * Check if an error is an authentication error
   */
  isAuthError: (error) => {
    return error.message.includes('401') || 
           error.message.includes('Unauthorized') ||
           error.message.includes('Session expired');
  },

  /**
   * Check if an error is a workspace access error
   */
  isWorkspaceError: (error) => {
    return error.message.includes('workspace') ||
           error.message.includes('Workspace') ||
           error.message.includes('access denied');
  },


  /**
   * Format error message for user display
   */
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

  /**
   * Retry an API call with exponential backoff
   */
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

// =====================================================
// CACHE UTILITIES (for project data) WITH WORKSPACE SUPPORT
// =====================================================

export const cacheUtils = {
  CACHE_KEYS: {
    PROJECTS: 'asyncat-projects-cache-v3',
    PREFERENCES: 'asyncat-preferences-cache-v2'
  },
  
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  /**
   * Get cached data with workspace context
   */
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

  /**
   * Set cached data with workspace context
   */
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

  /**
   * Clear specific cache
   */
  clearCache: (key) => {
    try {
      const workspaceId = getCurrentWorkspaceId();
      const cacheKey = workspaceId ? `${key}-${workspaceId}` : key;
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  },

  /**
   * Clear all workspace-specific caches
   */
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

// Projects API with caching and workspace support
export const cachedProjectsApi = {
  /**
   * Get projects with caching
   */
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

  /**
   * Refresh projects cache
   */
  refreshProjects: async () => {
    cacheUtils.clearCache(cacheUtils.CACHE_KEYS.PROJECTS);
    return await cachedProjectsApi.getProjects(false);
  }
};


// Listen for workspace changes and clear caches
eventBus.on('workspaceChanged', ({ workspace } = {}) => {
  if (workspace?.id) {
    workspaceUtils.setCurrentWorkspace(workspace.id);
  }
});

// =====================================================
// AGENT API
// =====================================================

export const agentApi = {
  /**
   * Run an agent with a goal — returns an async generator of SSE events.
   * Event types: thinking, tool_start, tool_result, delta, answer, error, done
   */
  runStream: async function* (goal, conversationHistory = [], workingDir = null, maxRounds = 25, signal = null, continueSessionId = null, opts = {}) {
    const workspaceId = getCurrentWorkspaceId();
    const token = await authService.getSession();

    const response = await fetch(`${API_BASE_URL}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token?.access_token}`
      },
      signal,
      body: JSON.stringify({
        goal, conversationHistory, workingDir, maxRounds, workspaceId, continueSessionId,
        autoApprove: opts.autoApprove || false,
        preApprovedTools: opts.preApprovedTools || [],
      })
    });

    if (!response.ok) {
      try {
        const errData = await response.json();
        const err = new Error(errData.message || errData.error || `Agent failed: ${response.statusText}`);
        throw err;
      } catch (parseErr) {
        if (parseErr.message && !parseErr.message.startsWith('Agent failed')) throw parseErr;
        throw new Error(`Agent failed: ${response.statusText}`);
      }
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
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'done') { yield parsed; return; }
              yield parsed;
            } catch (e) {
              console.warn('Failed to parse agent SSE:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  getSessions: async (limit = 30) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions?limit=${limit}`);
  },

  getSession: async (sessionId) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}`);
  },

  deleteSession: async (sessionId) => {
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token?.access_token}` },
    });
    return res.json();
  },

  renameSession: async (sessionId, goal) => {
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token?.access_token}` },
      body: JSON.stringify({ goal }),
    });
    return res.json();
  },

  getSessionAudit: async (sessionId) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}/audit`);
  },

  respondPermission: async (requestId, decision, reason = null) => {
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/permissions/${requestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token?.access_token}`
      },
      body: JSON.stringify({ decision, reason })
    });
    return await handleResponse(res);
  },

  respondAskUser: async (requestId, answer) => {
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/ask/${requestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token?.access_token}`
      },
      body: JSON.stringify({ answer })
    });
    return await handleResponse(res);
  },

  readFile: async (filePath) => {
    return await apiRequest(`${API_BASE_URL}/agent/files/read?path=${encodeURIComponent(filePath)}`);
  },

  listDirectory: async (dirPath = '.', depth = 1) => {
    const params = new URLSearchParams({ path: dirPath, depth: String(depth) });
    return await apiRequest(`${API_BASE_URL}/agent/files/list?${params}`);
  },

  loadEntry: async (entryPath = '.') => {
    const params = new URLSearchParams({ path: entryPath });
    return await apiRequest(`${API_BASE_URL}/agent/files/entry?${params}`);
  },

  getTools: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/tools`);
  },

  getSkills: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/skills`);
  },

  getSkill: async (name) => {
    return await apiRequest(`${API_BASE_URL}/agent/skills/${encodeURIComponent(name)}`);
  },
};

// Export default object with all APIs
export default {
  // Core APIs
  chat: chatApi,
  projects: projectsApi,
  cachedProjects: cachedProjectsApi,
  bulk: bulkApi,
  feed: feedApi,
  chatFolders: chatFoldersApi,
  projectFolders: projectFoldersApi,
  trash: trashApi,
  agent: agentApi,

  // Utilities
  utils: apiUtils,
  cache: cacheUtils,
  workspace: workspaceUtils
};
