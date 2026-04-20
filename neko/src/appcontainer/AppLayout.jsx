import React, { useState, useCallback, useEffect } from "react";
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';
import eventBus from '../utils/eventBus.js';
import { useCommandCenter } from '../CommandCenter/CommandCenterContextEnhanced.jsx';
import { useUnauthorizedError } from '../error/ErrorBoundary.jsx';
import { initializeTheme, setupThemeListener } from '../auth/utils.js';


// Import components
import Sidebar from '../sidebar/Sidebar.jsx';
import CreateProjectFlow from '../projects/components/CreateProjectFlow.jsx';
import CreateWorkspaceModal from '../sidebar/CreateWorkSpaceModal.jsx';

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
    switchWorkspace, 
    currentWorkspace,
    getWorkspaceProjects,
    hasWorkspaceAccess 
  } = useWorkspace();
  

  
  // UI state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [refreshProjectsFlag, setRefreshProjectsFlag] = useState(0);
  
  // Project state
  const [selectedProject, setSelectedProject] = useState(null);
  
  // ADD: Current page state to handle invites selection
  const [currentPageOverride, setCurrentPageOverride] = useState(null);
  
  // Determine current page from location - FIXED LOGIC
  const pathSegments = location.pathname.split('/').filter(Boolean); // Remove empty strings
  const basePage = pathSegments[0] || 'home';
  
  // Map routes to the correct page identifiers for sidebar
  const getPageFromRoute = (basePage, pathSegments) => {
    switch (basePage) {
      case 'conversations':
        return 'home'; // these should map to home in sidebar
      case 'all-chats':
        return 'all-chats';
      case 'home':
        return 'home';
      case 'workspace':
        return 'workspace';
      case 'projects':
        return 'workspace';
      case 'calendar':
        return 'calendar';
      case 'teams':
        return 'teams';
      case 'packs':
        return 'packs';
      case 'lab':
        return 'lab';
      case 'models':
        return 'models';
      case 'agents':
        return 'agents';
      default:
        return 'home';
    }
  };
  
  // Use override if available, otherwise use route-based logic
  const currentPage = currentPageOverride || getPageFromRoute(basePage, pathSegments);
  const isChatMode = basePage === 'home' || basePage === 'conversations' || basePage === 'all-chats';
  
  // Clear page override when route changes (except for invites)
  useEffect(() => {
    if (currentPageOverride && currentPageOverride !== 'invites') {
      setCurrentPageOverride(null);
    }
  }, [location.pathname]);
  
  // Check if user has any workspaces
  const hasWorkspaces = workspaces && workspaces.length > 0;
  
  // Check if we should show CreateWorkspaceModal (only when successfully determined no workspaces)
  const shouldShowCreateWorkspace = !workspacesLoading && !workspacesError && !hasWorkspaces;
  
  // Handle workspace creation
  const handleWorkspaceCreated = useCallback((newWorkspace) => {
    refreshWorkspaces();
    if (newWorkspace && switchWorkspace) {
      switchWorkspace(newWorkspace.id);
    }
  }, [refreshWorkspaces, switchWorkspace]);

  // Function to trigger project list refresh in sidebar
  const refreshProjects = useCallback(() => {
    setRefreshProjectsFlag(prev => prev + 1);
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
  

  // Redirect project-only users (viewers/guests) away from workspace-level routes
  useEffect(() => {
    // Only check after workspace is loaded and not loading
    if (!workspacesLoading && currentWorkspace && !hasWorkspaceAccess()) {
      const workspaceOnlyRoutes = ['home', 'conversations', 'calendar', 'invites', 'teams'];
      if (workspaceOnlyRoutes.includes(basePage)) {
        navigate('/workspace', { replace: true });
      }
    }
  }, [basePage, currentWorkspace, hasWorkspaceAccess, workspacesLoading, navigate]);

  // Reset project selection when workspace changes
  useEffect(() => {
    setSelectedProject(null);
    sessionStorage.removeItem('projectId');
    // Redirect to appropriate page based on workspace access
    if (hasWorkspaceAccess()) {
      navigate('/home');
    } else {
      navigate('/workspace');
    }
  }, [currentWorkspace, navigate, hasWorkspaceAccess]);

  // Listen for invite acceptance events to refresh data
  useEffect(() => {
    const handleProjectInviteAccepted = (data) => {
      if (data?.projectId) {
        refreshProjects();
      }
    };

    const handleWorkspaceInviteAccepted = (data) => {
      if (data?.teamId) {
        refreshWorkspaces();
      }
    };

    const handleOpenCreateProject = () => {
      setIsCreateProjectModalOpen(true);
    };

    const unsubProject = eventBus.on('projectInviteAccepted', handleProjectInviteAccepted);
    const unsubWorkspace = eventBus.on('workspaceInviteAccepted', handleWorkspaceInviteAccepted);
    const unsubCreateProject = eventBus.on('openCreateProjectModal', handleOpenCreateProject);

    return () => {
      unsubProject();
      unsubWorkspace();
      unsubCreateProject();
    };
  }, [refreshProjects, refreshWorkspaces]);

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

  // Define a project selection handler function that can be shared by components
  const handleProjectSelect = (project) => {
    // Clear invites override when selecting a project
    setCurrentPageOverride(null);
    
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
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { e.preventDefault(); navigate('/home'); }
        else if (e.key === '2') { e.preventDefault(); navigate('/workspace'); }
        else if (e.key === '3') { e.preventDefault(); navigate('/calendar'); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Navigation handler - FIXED TO HANDLE INVITES
  const handleNavigate = useCallback(async (page, options = {}) => {
    // Handle settings specially - navigate to the settings route instead of a modal
    if (page === 'settings') {
      const tab = options.tab || 'general';
      navigate(`/settings/${tab}`);
      return;
    }

    // Handle workspaces navigation - use client-side routing
    if (page === 'workspaces') {
      navigate('/workspaces');
      return;
    }

    // FIXED: Handle invites navigation properly
    if (page === 'invites') {
      setCurrentPageOverride('invites');
      // Clear any other selections to make invites standalone
      setSelectedProject(null);
      sessionStorage.removeItem('projectId');
      return;
    }

    // Clear page override for non-invite navigation
    setCurrentPageOverride(null);

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

    if (page === 'teams' && options.teamId) {
      navigate(`/teams?teamId=${options.teamId}`);
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
    // Clear page override when navigating to chat
    setCurrentPageOverride(null);
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

      {/* Floating sidebar-expand button — only visible when sidebar is collapsed */}
      {isSidebarCollapsed && (
        <button
          onClick={() => setIsSidebarCollapsed(false)}
          className="fixed top-2 left-2 z-30 p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
          title="Expand sidebar (⌘/)"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      )}
        <Sidebar
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          currentPage={currentPage}
          isChatMode={isChatMode}
          onPageChange={handleNavigate}
          session={session}
          onSignOut={onSignOut}
          selectedProject={getProjectValue(true)}
          onProjectSelect={handleProjectSelect}
          refreshProjectsFlag={refreshProjectsFlag}
          onRefreshProjects={refreshProjects}
          onNewChat={handleNewChatWithNavigation}
          basePage={basePage}
          pathSegments={pathSegments}
        />

        <main className="flex-1 overflow-y-auto h-full">
          <div className="animate-fadeIn h-full">
            <Outlet context={{
              selectedProject: getProjectValue(true),
              onProjectSelect: handleProjectSelect,
              session,
              currentTab: params.tab,
              refreshProjects,
              onOpenSettings: handleOpenSettings
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