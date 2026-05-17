import { useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import PropTypes from 'prop-types';
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';
import eventBus from '../utils/eventBus.js';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import { useUnauthorizedError } from '../error/ErrorBoundary.jsx';
import { initializeTheme, setupThemeListener } from '../auth/utils.js';
import TopMenuBar from '../components/TopMenuBar.jsx';

// Import components
import Sidebar from '../sidebar/Sidebar.jsx';
import CreateProjectFlow from '../projects/components/CreateProjectFlow.jsx';
import WelcomePage from '../WelcomePage.jsx';

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
    invalidateProjectsCache,
  } = useWorkspace();
  
  // UI state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [pageTransitionsEnabled, setPageTransitionsEnabled] = useState(() => {
    return localStorage.getItem('pageTransitions') !== 'off';
  });
  const [dockPosition, setDockPosition] = useState(() => {
    return localStorage.getItem('dockPosition') || 'bottom';
  });
  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return localStorage.getItem('sidebarPosition') || 'left';
  });
  const [navigationStyle, setNavigationStyle] = useState(() => {
    return localStorage.getItem('navigationStyle') || 'dock';
  });
  const [topBarVisible, setTopBarVisible] = useState(() => {
    return localStorage.getItem('topMenuBarVisibility') !== 'hidden';
  });

  // Project state
  const [selectedProject, setSelectedProject] = useState(null);
  
  const basePage = location.pathname.split('/').filter(Boolean)[0] || 'home';
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

  // Use the 401 error handler
  const { trigger401Error } = useUnauthorizedError();

  // Initialize theme on component mount
  useEffect(() => {
    initializeTheme();
    const cleanup = setupThemeListener();
    return cleanup;
  }, []);

  useEffect(() => {
    const syncPageTransitions = () => {
      setPageTransitionsEnabled(localStorage.getItem('pageTransitions') !== 'off');
    };

    window.addEventListener('storage', syncPageTransitions);
    window.addEventListener('page-transitions-changed', syncPageTransitions);
    return () => {
      window.removeEventListener('storage', syncPageTransitions);
      window.removeEventListener('page-transitions-changed', syncPageTransitions);
    };
  }, []);

  useEffect(() => {
    const syncDockPosition = () => {
      setDockPosition(localStorage.getItem('dockPosition') || 'bottom');
    };

    window.addEventListener('storage', syncDockPosition);
    window.addEventListener('dock-position-changed', syncDockPosition);
    return () => {
      window.removeEventListener('storage', syncDockPosition);
      window.removeEventListener('dock-position-changed', syncDockPosition);
    };
  }, []);

  useEffect(() => {
    const syncSidebarPosition = () => {
      setSidebarPosition(localStorage.getItem('sidebarPosition') || 'left');
    };

    window.addEventListener('storage', syncSidebarPosition);
    window.addEventListener('sidebar-position-changed', syncSidebarPosition);
    return () => {
      window.removeEventListener('storage', syncSidebarPosition);
      window.removeEventListener('sidebar-position-changed', syncSidebarPosition);
    };
  }, []);

  useEffect(() => {
    const syncNavigationStyle = () => {
      setNavigationStyle(localStorage.getItem('navigationStyle') || 'dock');
    };

    window.addEventListener('storage', syncNavigationStyle);
    window.addEventListener('navigation-style-changed', syncNavigationStyle);
    return () => {
      window.removeEventListener('storage', syncNavigationStyle);
      window.removeEventListener('navigation-style-changed', syncNavigationStyle);
    };
  }, []);

  useEffect(() => {
    const syncTopBar = () => {
      setTopBarVisible(localStorage.getItem('topMenuBarVisibility') !== 'hidden');
    };

    window.addEventListener('storage', syncTopBar);
    window.addEventListener('top-menu-bar-visibility-changed', syncTopBar);
    return () => {
      window.removeEventListener('storage', syncTopBar);
      window.removeEventListener('top-menu-bar-visibility-changed', syncTopBar);
    };
  }, []);

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
        <TopMenuBar />
        <div className={topBarVisible ? 'mt-10 mb-8' : 'mb-8'}>
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
        <TopMenuBar />
        <div className={`${topBarVisible ? 'mt-10' : ''} text-center max-w-md mx-auto px-4`}>
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

  // If user has no workspaces, show only the WelcomePage
  if (shouldShowCreateWorkspace) {
    return (
      <WelcomePage
        session={session}
        onTeamCreated={handleWorkspaceCreated}
      />
    );
  }

  const dockPaddingClass = {
    bottom: 'pb-20',
    left: 'pl-20',
    right: 'pr-20',
  };
  const sidebarPaddingClass = {
    left: 'pl-16 sm:pl-56',
    right: 'pr-16 sm:pr-56',
  };
  const navigationPaddingClass = navigationStyle === 'sidebar'
    ? sidebarPaddingClass[sidebarPosition] || sidebarPaddingClass.left
    : dockPaddingClass[dockPosition] || dockPaddingClass.bottom;

  // Normal dashboard when user has workspaces
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <TopMenuBar
        onSearchOpen={() => setIsSearchOpen(true)}
      />

      <Sidebar
        session={session}
        onNewChat={handleNewChatWithNavigation}
        basePage={basePage}
        isSearchOpen={isSearchOpen}
        onSearchOpen={setIsSearchOpen}
      />

      <main className={`flex-1 overflow-hidden h-full ${topBarVisible ? 'pt-10' : ''}`}>
        <div
          key={routeTransitionKey}
          className={`${pageTransitionsEnabled ? 'animate-fadeIn' : ''} h-full ${navigationPaddingClass}`}
        >
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

AppLayout.propTypes = {
  session: PropTypes.object,
  onSignOut: PropTypes.func,
};
