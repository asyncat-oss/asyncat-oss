import { useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import { Clock3, ServerCrash, Wifi, WifiOff } from "lucide-react";
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';
import eventBus from '../utils/eventBus.js';
import { useCommandCenter } from '../CommandCenter/CommandCenterContextEnhanced.jsx';
import { useUnauthorizedError } from '../error/ErrorBoundary.jsx';
import { initializeTheme, setupThemeListener } from '../auth/utils.js';
import { loadKeyboardShortcuts } from '../utils/keyboardShortcutsUtils.js';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';


// Import components
import Sidebar from '../sidebar/Sidebar.jsx';
import CreateProjectFlow from '../projects/components/CreateProjectFlow.jsx';
import CreateWorkspaceModal from '../sidebar/CreateWorkSpaceModal.jsx';

const formatSystemTime = (date) => (
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
);

const SystemClockPill = () => {
  const [time, setTime] = useState(() => formatSystemTime(new Date()));

  useEffect(() => {
    const updateTime = () => setTime(formatSystemTime(new Date()));
    const now = new Date();
    const delayUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let interval = null;

    const timeout = window.setTimeout(() => {
      updateTime();
      interval = window.setInterval(updateTime, 60 * 1000);
    }, delayUntilNextMinute);

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      title={`Local time ${time}`}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200/80 bg-white/85 px-3 text-xs font-medium text-gray-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-gray-900/80 dark:text-gray-300 midnight:border-white/10 midnight:bg-black/80 midnight:text-gray-300"
    >
      <Clock3 className="h-4 w-4 text-gray-500 dark:text-gray-400 midnight:text-gray-500" aria-hidden="true" />
      <time dateTime={new Date().toISOString()}>{time}</time>
    </div>
  );
};

const NetworkStatusPill = () => {
  const network = useNetworkStatus({ pollMs: 6000 });

  const status = !network.online
    ? {
        label: "No internet",
        detail: "This device is offline.",
        Icon: WifiOff,
        className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/70 dark:text-red-300 midnight:border-red-900 midnight:bg-red-950/80 midnight:text-red-300",
        dotClassName: "bg-red-500",
      }
    : !network.backendOnline
      ? {
          label: "Backend offline",
          detail: "Local Asyncat services are unreachable.",
          Icon: ServerCrash,
          className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/70 dark:text-amber-300 midnight:border-amber-900 midnight:bg-amber-950/80 midnight:text-amber-300",
          dotClassName: "bg-amber-500",
        }
      : {
          label: "Online",
          detail: "Browser and backend are reachable.",
          Icon: Wifi,
          className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/70 dark:text-emerald-300 midnight:border-emerald-900 midnight:bg-emerald-950/80 midnight:text-emerald-300",
          dotClassName: "bg-emerald-500",
        };

  const Icon = status.Icon;

  return (
    <div className="relative group">
      <div
        role="status"
        aria-label={`${status.label}. ${status.detail}`}
        title={`${status.label} - ${status.detail}`}
        className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium shadow-sm backdrop-blur ${status.className}`}
      >
        <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} />
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{status.label}</span>
      </div>
      <div className="pointer-events-none absolute right-0 top-full mt-2 w-max max-w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 dark:bg-gray-800 midnight:bg-gray-800">
        {status.detail}
      </div>
    </div>
  );
};

const SystemStatusCluster = () => (
  <div className="fixed right-4 top-4 z-[60] flex items-center gap-2">
    <SystemClockPill />
    <NetworkStatusPill />
  </div>
);

const AppLayout = ({ session, onSignOut }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  
  // Workspace context
  const { 
    workspaces, 
    loading: workspacesLoading, 
    error: workspacesError, 
    refreshWorkspaces, 
    currentWorkspace,
    getWorkspaceProjects,
  } = useWorkspace();
  

  
  // UI state
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  
  // Project state
  const [selectedProject, setSelectedProject] = useState(null);
  
  const basePage = location.pathname.split('/').filter(Boolean)[0] || 'home';
  
  // Check if user has any workspaces
  const hasWorkspaces = workspaces && workspaces.length > 0;
  
  // Check if we should show CreateWorkspaceModal (only when successfully determined no workspaces)
  const shouldShowCreateWorkspace = !workspacesLoading && !workspacesError && !hasWorkspaces;
  
  // Handle workspace creation
  const handleWorkspaceCreated = useCallback((newWorkspace) => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const refreshProjects = useCallback(() => {
    eventBus.emit('projectsUpdated');
  }, []);

  // Project selection logic
  useEffect(() => {
    const projectId = params.projectId;

    if (projectId) {
      // If we already have selectedProject with matching ID and it has role/owner metadata, keep it
      if (selectedProject && 
          String(selectedProject.id) === String(projectId) && 
          (selectedProject.user_role || selectedProject.owner_id)) {
        // Already have the correct project with metadata, no need to refetch
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
          }
        } catch (error) {
          console.error('Failed to load project:', error);
        }
      };
      loadProject();
    } else if (!projectId && selectedProject) {
      // Clear selection when no project in URL
      setSelectedProject(null);
      sessionStorage.removeItem('projectId');
    }
}, [params.projectId, getWorkspaceProjects]); // selectedProject intentionally excluded to prevent loops
  
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

  // Listen for project creation event
  useEffect(() => {
    const handleOpenCreateProject = () => {
      setIsCreateProjectModalOpen(true);
    };

    const unsubCreateProject = eventBus.on('openCreateProjectModal', handleOpenCreateProject);

    return () => {
      unsubCreateProject();
    };
  }, []);

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

  const handleProjectSelect = (project) => {
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
  };

  // Use CommandCenter context to get new chat functionality
  const { handleNewConversation } = useCommandCenter();

  // Use the 401 error handler
  const { trigger401Error } = useUnauthorizedError();

  // Initialize theme on component mount
  useEffect(() => {
    initializeTheme();
    const cleanup = setupThemeListener();
    return cleanup;
  }, []);

  // Keyboard shortcuts for mode switching
  useEffect(() => {
    const handleKeyDown = (e) => {
      const shortcuts = loadKeyboardShortcuts();
      const match = Object.values(shortcuts).find(s => {
        return s.key === e.key && (e.ctrlKey || e.metaKey);
      });
      if (!match) return;
      e.preventDefault();
      switch (match.action) {
        case 'navHome': navigate('/home'); break;
        case 'navWorkspace': navigate('/workspace'); break;
        case 'navCalendar': navigate('/calendar'); break;
        default: break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Navigation handler
  const handleNavigate = useCallback(async (page, options = {}) => {
    // Handle settings specially - navigate to the settings route instead of a modal
    if (page === 'settings') {
      const tab = options.tab || 'general';
      navigate(`/settings/${tab}`);
      return;
    }

    // Handle home navigation - ALWAYS create new conversation
    if (page === 'home') {
      navigate('/home');
      // Always create a new conversation when navigating to home
      if (handleNewConversation) {
        await handleNewConversation();
      }
      return;
    }

    // Handle specific navigation cases
    if (page === 'notes' && options.noteId) {
      navigate(`/workspace/${selectedProject?.id}/notes?noteId=${options.noteId}`);
      return;
    }

    // Standard navigation
    navigate(`/${page}`);
  }, [navigate, handleNewConversation, selectedProject]);

  // Helper function to open settings with a specific tab
  const handleOpenSettings = (tab = 'general') => {
    navigate(`/settings/${tab}`);
  };

  // Handle project creation completion
  const handleProjectCreated = useCallback((newProject) => {
    setIsCreateProjectModalOpen(false);
    handleProjectSelect(newProject);
    refreshProjects();
    // Notify other components about the new project
    eventBus.emit('projectCreated', newProject);
  }, [handleProjectSelect, refreshProjects]);

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
    // Check if this is an authentication error
    const isAuthError = workspacesError.includes('Invalid session') ||
                       workspacesError.includes('401') ||
                       workspacesError.includes('Unauthorized') ||
                       workspacesError.includes('Authentication required');

    // Trigger the scary 401 error page for auth errors
    if (isAuthError) {
      trigger401Error(workspacesError);
      return null; // Return null while the 401 error is being shown
    }
    
    const isNetworkError = workspacesError.includes('fetch') || 
                          workspacesError.includes('network') ||
                          workspacesError.includes('Failed to fetch');

    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-red-500 dark:text-red-400 midnight:text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-2">
            {isAuthError ? 'Session Expired' : isNetworkError ? 'Connection Error' : 'Workspace Error'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6 text-sm leading-relaxed">
            {isAuthError 
              ? 'Your session has expired or is invalid. Please sign in again to continue accessing your workspaces.'
              : isNetworkError 
              ? 'Unable to connect to our servers. Please check your internet connection and try again.'
              : 'We encountered an error loading your workspaces. This might be a temporary issue.'
            }
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isAuthError ? (
              <button
                onClick={async () => {
                  try {
                    // Clear all browser storage comprehensively
                    sessionStorage.clear();
                    localStorage.clear();
                    
                    // Clear all cookies
                    document.cookie.split(";").forEach(function(c) {
                      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                    });
                    
                    // Clear indexedDB if it exists
                    if (window.indexedDB) {
                      try {
                        const databases = await indexedDB.databases();
                        databases.forEach(db => {
                          indexedDB.deleteDatabase(db.name);
                        });
                      } catch (e) {
                        console.log('Could not clear IndexedDB:', e);
                      }
                    }
                    
                    // Sign out and redirect to login
                    await onSignOut();
                    
                    // Force page reload to ensure clean state
                    window.location.href = '/';
                  } catch (error) {
                    console.error('Error during sign out:', error);
                    // Force reload even if sign out fails
                    window.location.href = '/';
                  }
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Sign Out & Sign Back In
              </button>
            ) : (
              <>
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
              </>
            )}
          </div>
          {!isAuthError && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
                Still having trouble?
              </p>
              <button
                onClick={async () => {
                  try {
                    // Clear all browser storage comprehensively
                    sessionStorage.clear();
                    localStorage.clear();
                    
                    // Clear all cookies
                    document.cookie.split(";").forEach(function(c) {
                      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                    });
                    
                    // Clear indexedDB if it exists
                    if (window.indexedDB) {
                      try {
                        const databases = await indexedDB.databases();
                        databases.forEach(db => {
                          indexedDB.deleteDatabase(db.name);
                        });
                      } catch (e) {
                        console.log('Could not clear IndexedDB:', e);
                      }
                    }
                    
                    // Sign out and redirect
                    await onSignOut();
                    
                    // Force page reload to ensure clean state
                    window.location.href = '/';
                  } catch (error) {
                    console.error('Error during sign out:', error);
                    // Force reload even if sign out fails
                    window.location.href = '/';
                  }
                }}
                className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 midnight:hover:text-gray-400 underline transition-colors"
              >
                Sign out and sign back in
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If user has no workspaces, show only the CreateWorkspaceModal
  if (shouldShowCreateWorkspace) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
        <CreateWorkspaceModal
          isOpen={true}
          onClose={() => {}}
          canClose={false}
          session={session}
          onTeamCreated={handleWorkspaceCreated}
        />
      </div>
    );
  }

  // Normal dashboard when user has workspaces
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <SystemStatusCluster />

      {/* Dock — renders as fixed overlay, no flex space consumed */}
      <Sidebar
        onPageChange={handleNavigate}
        session={session}
        onNewChat={handleNewChatWithNavigation}
        basePage={basePage}
      />

      <main className="flex-1 overflow-hidden h-full">
        <div className="animate-fadeIn h-full pb-20">
          <Outlet context={{
              selectedProject: getProjectValue(true),
              onProjectSelect: handleProjectSelect,
              session,
              currentTab: params.tab,
              refreshProjects,
              onOpenSettings: handleOpenSettings,
              onSignOut,
            }} />
        </div>
      </main>

      {/* Create Project Modal */}
      <CreateProjectFlow
        isOpen={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
        onProjectCreate={handleProjectCreated}
        session={session}
      />
    </div>
  );
};

export default AppLayout;
