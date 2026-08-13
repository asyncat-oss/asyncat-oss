import { useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import { RotateCw, ServerCrash, WifiOff } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

// Import components
import Sidebar from '../sidebar/Sidebar.jsx';
import WelcomePage from '../WelcomePage.jsx';

const ConnectionNotice = () => {
  const network = useNetworkStatus({ pollMs: 6000 });
  const [isRestarting, setIsRestarting] = useState(false);
  const canRestart = Boolean(window.electronAPI?.restartBackend) && !network.backendOnline;

  if (network.online && network.backendOnline) return null;

  const Icon = network.backendOnline ? WifiOff : ServerCrash;
  const title = network.backendOnline ? 'Internet connection unavailable' : 'Local services are offline';
  const detail = network.backendOnline
    ? 'Local features remain available.'
    : 'Asyncat will reconnect automatically.';

  const restart = async () => {
    if (!canRestart || isRestarting) return;
    setIsRestarting(true);
    try {
      await window.electronAPI.restartBackend();
    } finally {
      setTimeout(() => setIsRestarting(false), 4000);
    }
  };

  return (
    <div className="fixed right-3 top-3 z-[80] flex max-w-sm items-center gap-3 rounded-xl border border-amber-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur dark:border-amber-900/60 dark:bg-gray-900/95 midnight:border-amber-900/60 midnight:bg-slate-950/95">
      <Icon className="h-4 w-4 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{title}</div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 midnight:text-slate-400">{detail}</div>
      </div>
      {canRestart && (
        <button
          type="button"
          onClick={restart}
          disabled={isRestarting}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70"
        >
          <RotateCw className={`h-3 w-3 ${isRestarting ? 'animate-spin' : ''}`} />
          Restart
        </button>
      )}
    </div>
  );
};

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { user: localUser } = useUser();
  
  // Workspace context
  const { 
    workspaces, 
    loading: workspacesLoading, 
    error: workspacesError, 
    refreshWorkspaces, 
    currentWorkspace,
    getWorkspaceProjects,
    invalidateProjectsCache,
  } = useWorkspace();
  
  // UI state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { pageTransitionsEnabled, sidebarState } = useUiPreferences();

  // Project state
  const [selectedProject, setSelectedProject] = useState(null);
  
  const basePage = location.pathname.split('/').filter(Boolean)[0] || 'home';
  const isSettingsPage = basePage === 'settings';
  const routeTransitionKey = basePage;
  
  // Check if user has any workspaces
  const hasWorkspaces = workspaces && workspaces.length > 0;
  
  // Check if we should show CreateWorkspaceModal (only when successfully determined no workspaces)
  const shouldShowCreateWorkspace = !workspacesLoading && !workspacesError && !hasWorkspaces;
  
  // Handle workspace creation
  const handleWorkspaceCreated = useCallback(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const refreshProjects = useCallback(() => {
    invalidateProjectsCache();
  }, [invalidateProjectsCache]);

  // Project selection logic
  useEffect(() => {
    const projectId = params.projectId;

    if (projectId) {
      // If we already have selectedProject with matching ID and owner metadata, keep it
      if (selectedProject && 
          String(selectedProject.id) === String(projectId) && 
          selectedProject.owner_id) {
        // Already have the correct project, no need to refetch
        return;
      }
      
      // If transitioning to a different project, clear the old one first
      if (selectedProject && String(selectedProject.id) !== String(projectId)) {
        setSelectedProject(null);
      }
      
      // Load project from workspace projects
      const loadProject = async () => {
        try {
          const projects = await getWorkspaceProjects();
          const project = projects.find(p => String(p.id) === String(projectId));
          
          if (project) {
            // If we had a selectedProject with matching ID, merge the metadata
            const enrichedProject = (selectedProject && String(selectedProject.id) === String(projectId))
              ? { ...project, ...selectedProject }
              : project;

            setSelectedProject(enrichedProject);
            sessionStorage.setItem('projectId', projectId);
          } else {
            // Project not found in workspace — clear stale session data
            sessionStorage.removeItem('projectId');
            setSelectedProject(null);
          }
        } catch (error) {
          console.error('Failed to load project:', error);
          // On error, clear selectedProject so the UI doesn't hang on skeleton indefinitely
          setSelectedProject(null);
        }
      };
      loadProject();
    } else if (!projectId && selectedProject) {
      // Clear selection when no project in URL
      setSelectedProject(null);
      sessionStorage.removeItem('projectId');
    }
    // selectedProject intentionally excluded to prevent loops while enriching the loaded project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.projectId, getWorkspaceProjects]);
  
  // Reset project selection when workspace changes
  // FIX: Skip redirect on initial mount - let URL/router handle initial navigation
  const isFirstWorkspaceLoad = useRef(true);
  useEffect(() => {
    if (isFirstWorkspaceLoad.current) {
      isFirstWorkspaceLoad.current = false;
      // On first load, just clear project state, don't redirect
      setSelectedProject(null);
      sessionStorage.removeItem('projectId');
      return;
    }
    
    // Only redirect on subsequent workspace changes (not initial mount)
    setSelectedProject(null);
    sessionStorage.removeItem('projectId');
  }, [currentWorkspace]);

  // Helper function to get project ID or full project as needed
  const getProjectValue = (needsFullObject = false) => {
    if (!selectedProject) return null;
    
    // If selectedProject is just an ID (string or number)
    if (typeof selectedProject !== 'object') {
      return needsFullObject ? null : selectedProject;
    }
    
    // If selectedProject is an object
    return needsFullObject ? selectedProject : selectedProject.id;
  };

  const handleProjectSelect = useCallback((project) => {
    if (!project) {
      setSelectedProject(null);
      sessionStorage.removeItem('projectId');
      navigate('/workspace');
      return;
    }
    
    // Handle if we get just an ID or full object
    if (typeof project === 'object' && project.id) {
      // Update state immediately with full project data including metadata
      setSelectedProject(project);
      sessionStorage.setItem('projectId', project.id);
      navigate(`/workspace/${project.id}`);
    } else {
      // If we just get an ID, navigate first and let the effect handle loading
      const projectId = project;
      navigate(`/workspace/${projectId}`);
    }
  }, [navigate]);

  // Use CommandCenter context to get new chat functionality
  const {
    handleNewConversation,
  } = useCommandCenter();

  // Global ⌘K / Ctrl+K opens the command palette (UniversalSearch).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Helper function to open settings with a specific tab
  const handleOpenSettings = (tab = 'general') => {
    navigate(`/settings/${tab}`);
  };

  // Enhanced new chat handler that also navigates to home and creates new conversation
  const handleNewChatWithNavigation = useCallback(async () => {
    navigate('/home');
    if (handleNewConversation) {
      await handleNewConversation();
    }
  }, [navigate, handleNewConversation]);

  // Show loading while workspaces are being fetched
  if (workspacesLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col items-center justify-center">
        <div className="mb-8">
          <div className="w-8 h-8 border-4 border-indigo-200 dark:border-indigo-800 midnight:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 midnight:border-t-indigo-300 rounded-full animate-spin"></div>
        </div>
        <p className="text-lg font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-300 text-center px-4 mb-4 transition-all duration-300">
          Setting up your workspace...
        </p>
      </div>
    );
  }

  // Show error state when there's an error loading workspaces
  if (workspacesError) {
    const isNetworkError = workspacesError.includes('fetch') || 
                          workspacesError.includes('network') ||
                          workspacesError.includes('Failed to fetch');

    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-red-500 dark:text-red-400 midnight:text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-2">
            {isNetworkError ? 'Connection Error' : 'Workspace Error'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6 text-sm leading-relaxed">
            {isNetworkError
              ? 'Unable to reach the local Asyncat service. Try again or restart the app.'
              : 'Asyncat could not load your local workspaces. This might be a temporary issue.'
            }
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => refreshWorkspaces()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 midnight:bg-gray-800 midnight:hover:bg-gray-700 text-gray-800 dark:text-gray-200 midnight:text-gray-300 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user has no workspaces, show only the WelcomePage
  if (shouldShowCreateWorkspace) {
    return (
      <WelcomePage
        localUser={localUser}
        onTeamCreated={handleWorkspaceCreated}
      />
    );
  }

  const navigationPaddingClass = isSettingsPage
    ? ''
    : sidebarState === 'collapsed'
      ? 'pl-16'
      : 'pl-16 sm:pl-56';

  // Normal dashboard when user has workspaces
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <ConnectionNotice />
      {!isSettingsPage && (
        <Sidebar
          localUser={localUser}
          onNewChat={handleNewChatWithNavigation}
          basePage={basePage}
          isSearchOpen={isSearchOpen}
          onSearchOpen={setIsSearchOpen}
        />
      )}

      <main className="flex-1 overflow-hidden h-full">
        <div
          key={routeTransitionKey}
          className={`${pageTransitionsEnabled ? 'animate-fadeIn' : ''} h-full ${navigationPaddingClass}`}
        >
          <Outlet context={{
              selectedProject: getProjectValue(true),
              onProjectSelect: handleProjectSelect,
              localUser,
              currentTab: params.tab,
              refreshProjects,
              onOpenSettings: handleOpenSettings,
            }} />
        </div>
      </main>

    </div>
  );
};

export default AppLayout;
