import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../services/apiClient.js';
import eventBus from '../utils/eventBus.js';

const API_URL = import.meta.env.VITE_USER_URL;


// Create the Workspace Context
const WorkspaceContext = createContext();

// Custom hook to use the workspace context
// eslint-disable-next-line react-refresh/only-export-components
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
      
      const response = await apiClient.request(`${API_URL}/api/teams`);
      
      if (response.ok) {
        const { data } = await response.json();
        
        // Sort owned workspaces first, then project-only access, then alphabetically.
        const sortedWorkspaces = (data || []).sort((a, b) => {
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
        if (response.status === 403) {
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

  // Clear the current workspace selection.
  const clearWorkspace = useCallback(() => {
    setCurrentWorkspace(null);
    sessionStorage.removeItem('currentWorkspace');
  }, []);

  // Get workspace by ID
  const getWorkspaceById = useCallback((workspaceId) => {
    return workspaces.find(w => w.id === workspaceId);
  }, [workspaces]);

  // Check if current workspace is owned by current user
  const isWorkspaceOwner = useCallback(() => {
    return currentWorkspace?.user_role === 'owner';
  }, [currentWorkspace]);

  // Check if user has workspace-level access (vs project-only)
  const hasWorkspaceAccess = useCallback(() => {
    return currentWorkspace?.access_type === 'workspace';
  }, [currentWorkspace]);

  // Projects are the user-facing scope. The internal workspace remains only for
  // backwards-compatible ownership of conversations and memory.
  const getWorkspaceProjects = useCallback(async () => {
    if (!currentWorkspace) return [];

    const cacheKey = currentWorkspace.id;
    const cached = projectsCache.current[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    try {
      let data = [];
      const response = await apiClient.request(`${API_URL}/api/projects`);
      if (response.ok) {
        const json = await response.json();
        data = json.data || [];
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
      const response = await apiClient.request(`${API_URL}/api/teams`);
      
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
