import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import authService from '../services/authService.js';
import eventBus from '../utils/eventBus.js';

const API_URL = import.meta.env.VITE_USER_URL;


// Create the Workspace Context
const WorkspaceContext = createContext();

// Custom hook to use the workspace context
export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

// Workspace Provider Component
export const WorkspaceProvider = ({ children }) => {
  const projectsCache = useRef({}); // { [workspaceId]: { data, timestamp } }
  const CACHE_TTL = 30_000; // 30 seconds

  const [currentWorkspace, setCurrentWorkspace] = useState(() => {
    // Initialize from sessionStorage if available
    try {
      const savedWorkspace = sessionStorage.getItem('currentWorkspace');
      return savedWorkspace ? JSON.parse(savedWorkspace) : null;
    } catch (error) {
      // If there's an error parsing saved workspace, clear it
      sessionStorage.removeItem('currentWorkspace');
      return null;
    }
  });
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all user workspaces
  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authService.authenticatedFetch(`${API_URL}/api/teams`);
      
      if (response.ok) {
        const { data } = await response.json();
        
        // Sort workspaces: owners first, then workspace members, then project-only access
        // Within each group, sort alphabetically
        const currentUserId = (window?.__SESSION__ && window.__SESSION__.user?.id) || null;
        const sortedWorkspaces = (data || []).sort((a, b) => {
          // First, prefer explicit owner_id match to current user
          const aIsOwner = currentUserId && a.owner_id && a.owner_id === currentUserId;
          const bIsOwner = currentUserId && b.owner_id && b.owner_id === currentUserId;
          if (aIsOwner && !bIsOwner) return -1;
          if (!aIsOwner && bIsOwner) return 1;

          // Fall back to user_role for backwards compatibility
          if (a.user_role === 'owner' && b.user_role !== 'owner') return -1;
          if (a.user_role !== 'owner' && b.user_role === 'owner') return 1;

          // Then prefer workspace-level access over project-only access
          if (a.access_type === 'workspace' && b.access_type === 'project') return -1;
          if (a.access_type === 'project' && b.access_type === 'workspace') return 1;

          // Finally sort alphabetically
          return a.name.localeCompare(b.name);
        });
        
        setWorkspaces(sortedWorkspaces);
        
        // If we have a saved workspace from sessionStorage, try to find it
        const savedWorkspace = currentWorkspace;
        if (savedWorkspace) {
          const foundWorkspace = sortedWorkspaces.find(w => w.id === savedWorkspace.id);
          if (foundWorkspace) {
            // Update with fresh data from server
            setCurrentWorkspace(foundWorkspace);
            sessionStorage.setItem('currentWorkspace', JSON.stringify(foundWorkspace));
          } else {
            // Saved workspace no longer exists, clear it and set default
            sessionStorage.removeItem('currentWorkspace');
            const defaultWorkspace = sortedWorkspaces[0]; // First workspace in sorted list
            setCurrentWorkspace(defaultWorkspace);
            if (defaultWorkspace) {
              sessionStorage.setItem('currentWorkspace', JSON.stringify(defaultWorkspace));
            }
          }
        } else if (sortedWorkspaces.length > 0) {
          // No saved workspace, set default to first available
          const defaultWorkspace = sortedWorkspaces[0];
          setCurrentWorkspace(defaultWorkspace);
          if (defaultWorkspace) {
            sessionStorage.setItem('currentWorkspace', JSON.stringify(defaultWorkspace));
          }
        }
      } else {
        // Handle non-ok responses
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        
        // Provide more specific error messages based on status
        if (response.status === 401) {
          throw new Error('Invalid session - Authentication required');
        } else if (response.status === 403) {
          throw new Error('Access denied - You may not have permission to view workspaces');
        } else if (response.status >= 500) {
          throw new Error('Server error - Please try again later');
        } else {
          throw new Error(errorMessage);
        }
      }
    } catch (err) {
      console.error('Error fetching workspaces:', err);
      
      // Categorize errors for better handling
      let errorMessage = err.message;
      
      // Check if it's a network error
      if (err.message?.includes('fetch') || err.name === 'TypeError') {
        errorMessage = 'Network error - Please check your internet connection';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []); // Remove currentWorkspace dependency since we handle it internally

  // Switch to a different workspace
  const switchWorkspace = useCallback((workspace) => {
    if (!workspace || workspace.id === currentWorkspace?.id) return;

    projectsCache.current = {}; // clear all cached project data on workspace switch
    setCurrentWorkspace(workspace);

    // Persist workspace selection to sessionStorage
    sessionStorage.setItem('currentWorkspace', JSON.stringify(workspace));

    // Notify other components via event bus
    eventBus.emit('workspaceChanged', { workspace });
  }, [currentWorkspace]);

  // Clear workspace selection (useful for logout or error states)
  const clearWorkspace = useCallback(() => {
    setCurrentWorkspace(null);
    sessionStorage.removeItem('currentWorkspace');
  }, []);

  // Handle authentication errors by clearing workspace state
  const handleAuthError = useCallback(() => {
    setCurrentWorkspace(null);
    setWorkspaces([]);
    setError('Invalid session - Authentication required');
    setLoading(false);
    
    // Clear session storage
    sessionStorage.removeItem('currentWorkspace');
    
    // Also clear any workspace context caches
    try {
      Object.keys(sessionStorage).forEach(key => {
        if (key.includes('workspace') || key.includes('project')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (err) {
      console.warn('Error clearing workspace caches:', err);
    }
  }, []);

  // Get workspace by ID
  const getWorkspaceById = useCallback((workspaceId) => {
    return workspaces.find(w => w.id === workspaceId);
  }, [workspaces]);

  // Check if current workspace is owned by current user
  const isWorkspaceOwner = useCallback(() => {
    // Prefer owner_id if provided by API (hybrid ownership model). Fall back to user_role for backwards compatibility.
    try {
      const currentUserId = (window?.__SESSION__ && window.__SESSION__.user?.id) || null;
      if (currentWorkspace?.owner_id && currentUserId) {
        return currentWorkspace.owner_id === currentUserId;
      }
    } catch (err) {
      // ignore session lookup errors and fall back
    }
    return currentWorkspace?.user_role === 'owner';
  }, [currentWorkspace]);

  // Check if user has workspace-level access (vs project-only)
  const hasWorkspaceAccess = useCallback(() => {
    return currentWorkspace?.access_type === 'workspace';
  }, [currentWorkspace]);

  // Get workspace projects — cached in memory for CACHE_TTL ms
  const getWorkspaceProjects = useCallback(async () => {
    if (!currentWorkspace) return [];

    const cacheKey = currentWorkspace.id;
    const cached = projectsCache.current[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    try {
      let data = [];
      if (currentWorkspace.access_type === 'workspace') {
        const response = await authService.authenticatedFetch(`${API_URL}/api/projects/teams/${currentWorkspace.id}/projects`);
        if (response.ok) {
          const json = await response.json();
          data = json.data || [];
        }
      } else {
        const response = await authService.authenticatedFetch(`${API_URL}/api/projects`);
        if (response.ok) {
          const json = await response.json();
          data = (json.data || []).filter(p => p.team_id === currentWorkspace.id);
        }
      }

      projectsCache.current[cacheKey] = { data, timestamp: Date.now() };
      return data;
    } catch (error) {
      console.error('Error fetching workspace projects:', error);
      return [];
    }
  }, [currentWorkspace]);

  // Clear the in-memory projects cache without emitting an event
  const bustProjectsCache = useCallback(() => {
    if (currentWorkspace) {
      delete projectsCache.current[currentWorkspace.id];
    }
  }, [currentWorkspace]);

  // Invalidate cached project data for the current workspace
  const invalidateProjectsCache = useCallback(() => {
    if (currentWorkspace) {
      delete projectsCache.current[currentWorkspace.id];
    }
    eventBus.emit('projectsUpdated');
  }, [currentWorkspace]);

  // Update current workspace with fresh data without full refresh
  const updateCurrentWorkspace = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    
    try {
      const response = await authService.authenticatedFetch(`${API_URL}/api/teams`);
      
      if (response.ok) {
        const { data } = await response.json();
        const updatedWorkspace = data.find(w => w.id === currentWorkspace.id);
        
        if (updatedWorkspace) {
          // Update current workspace with fresh data
          setCurrentWorkspace(updatedWorkspace);
          sessionStorage.setItem('currentWorkspace', JSON.stringify(updatedWorkspace));
          
          // Also update the workspace in the workspaces array
          setWorkspaces(prev => prev.map(w => 
            w.id === updatedWorkspace.id ? updatedWorkspace : w
          ));
        }
      }
    } catch (err) {
      console.error('Error updating current workspace:', err);
    }
  }, [currentWorkspace]);

  // Refresh workspaces (useful after creating/updating workspaces)
  const refreshWorkspaces = useCallback(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Initialize on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Listen for workspace invite acceptance events
  useEffect(() => {
    const handleWorkspaceInviteAccepted = (event) => {
      // Refresh workspaces when a team invite is accepted
      // Add a small delay to ensure the backend has processed the invite
      setTimeout(() => {
        refreshWorkspaces();
      }, 500);
    };

    const handleProjectInviteAccepted = (event) => {
      // Invalidate projects cache when a project invite is accepted
      // Add a small delay to ensure the backend has processed the invite
      setTimeout(() => {
        invalidateProjectsCache();
      }, 500);
    };

    const unsubWorkspace = eventBus.on('workspaceInviteAccepted', handleWorkspaceInviteAccepted);
    const unsubProject = eventBus.on('projectInviteAccepted', handleProjectInviteAccepted);

    return () => {
      unsubWorkspace();
      unsubProject();
    };
  }, [refreshWorkspaces, invalidateProjectsCache]);

  // Context value
  const value = {
    // State
    currentWorkspace,
    workspaces,
    loading,
    error,
    
    // Actions
    switchWorkspace,
    clearWorkspace,
    handleAuthError,
    refreshWorkspaces,
    updateCurrentWorkspace,
    getWorkspaceById,
    getWorkspaceProjects,
    bustProjectsCache,
    invalidateProjectsCache,
    
    // Utilities
    isWorkspaceOwner,
    hasWorkspaceAccess,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export default WorkspaceContext;