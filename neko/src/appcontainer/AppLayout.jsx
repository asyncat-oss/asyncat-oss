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
  
  const projectStorageUnavailable = !workspacesLoading && !workspacesError && !hasWorkspaces;

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
      navigate('/projects');
      return;
    }
    
    // Handle if we get just an ID or full object
    if (typeof project === 'object' && project.id) {
      // Update state immediately with full project data including metadata
      setSelectedProject(project);
      sessionStorage.setItem('projectId', project.id);
      navigate(`/projects/${project.id}`);
    } else {
      // If we just get an ID, navigate first and let the effect handle loading
      const projectId = project;
      navigate(`/projects/${projectId}`);
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className="h-9 w-9 animate-[fadeIn_300ms_ease-out]"
        >
          <path d="M6 25L11.5 8L16 13L20.5 8L26 25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 20H23" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <div className="mt-4 text-sm font-semibold tracking-[-0.01em]">Asyncat</div>
        <div className="mt-5 h-px w-10 overflow-hidden bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700" role="status" aria-label="Loading projects">
          <div className="h-full w-[45%] bg-gray-900 motion-safe:animate-[loading-line_1.35s_ease-in-out_infinite] dark:bg-gray-100 midnight:bg-slate-100" />
        </div>
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
             {isNetworkError ? 'Connection Error' : 'Project Error'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6 text-sm leading-relaxed">
            {isNetworkError
              ? 'Unable to reach the local Asyncat service. Try again or restart the app.'
               : 'Asyncat could not load your local Projects. This might be a temporary issue.'
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

  // The ownership namespace is initialized by the local backend. It is not a
  // user-facing setup step and should never require a workspace wizard.
  if (projectStorageUnavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-5 text-center dark:bg-gray-900 midnight:bg-slate-950">
        <div className="max-w-sm">
          <ServerCrash className="mx-auto h-9 w-9 text-gray-300 dark:text-gray-700" />
          <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">Project storage is not ready</h2>
          <p className="mt-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">Restart the local service or try again. Your existing data has not been changed.</p>
          <button type="button" onClick={refreshWorkspaces} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"><RotateCw className="h-4 w-4" /> Try again</button>
        </div>
      </div>
    );
  }

  const navigationPaddingClass = isSettingsPage
    ? ''
    : sidebarState === 'collapsed'
      ? 'pl-[72px]'
      : 'pl-[72px] sm:pl-64';

  // Normal dashboard when user has workspaces
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <ConnectionNotice />
      {!isSettingsPage && (
        <Sidebar
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
