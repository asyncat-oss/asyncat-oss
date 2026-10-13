import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import PropTypes from 'prop-types';
import { RotateCw, ServerCrash, WifiOff } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

// Import components
import Sidebar from '../sidebar/Sidebar.jsx';
import Button from '../components/ui/Button.jsx';
import Cat from '../components/ui/Cat.jsx';
import UpdateScreen from '../components/UpdateScreen.jsx';

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

// The cat walking along a line, shown while Asyncat starts up.
const CHAT_PAGES = new Set(['home', 'conversations', 'agents']);

const StartupScene = ({ label }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-canvas text-fg" role="status" aria-label={label}>
    <div className="w-[132px] bg-canvas">
      <Cat pose="walk" className="mx-auto -mb-px w-[92px]" outline={6} />
      <div className="h-0.5 rounded-full bg-[repeating-linear-gradient(90deg,var(--as-line-strong)_0_14px,transparent_14px_22px)] motion-safe:animate-[startup-ground_0.64s_linear_infinite]" />
    </div>
    <div className="mt-5 text-[22px] font-bold tracking-[-0.045em]">asyncat</div>
    <div className="mt-1 text-xs text-fg-subtle">{label}</div>
  </div>
);

StartupScene.propTypes = { label: PropTypes.string };

// Pages load from the local server almost instantly; only show something if
// one takes long enough to notice.
const PageFallback = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 350);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-label="Loading">
      <Cat pose="walk" className="w-14 opacity-80" outline={7} />
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
  // All chat URLs are one page: a new chat moves from /home to
  // /conversations/:id after its first message is saved, and keying on that
  // would rebuild the whole chat and replay the page fade mid-conversation.
  const routeTransitionKey = CHAT_PAGES.has(basePage) ? 'chat' : basePage;
  
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
    return <StartupScene label="Opening your workspace…" />;
  }

  // Show error state when there's an error loading workspaces
  if (workspacesError) {
    const isNetworkError = workspacesError.includes('fetch') || 
                          workspacesError.includes('network') ||
                          workspacesError.includes('Failed to fetch');

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 text-center">
        <Cat pose="peek" className="w-24" outline={5} />
        <h2 className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-fg">
          {isNetworkError ? "Can't reach Asyncat's local service" : "Couldn't load your projects"}
        </h2>
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-fg-muted">
          {isNetworkError
            ? 'The part of Asyncat that runs in the background is not answering. Try again, or restart the app.'
            : 'This is usually temporary. Your data has not been changed.'}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" size="md" icon={RotateCw} onClick={() => refreshWorkspaces()}>Try again</Button>
          <Button variant="secondary" size="md" onClick={() => window.location.reload()}>Reload app</Button>
        </div>
      </div>
    );
  }

  // The ownership namespace is initialized by the local backend. It is not a
  // user-facing setup step and should never require a workspace wizard.
  if (projectStorageUnavailable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 text-center">
        <Cat pose="sleep" className="w-32" outline={4} />
        <h2 className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-fg">Project storage is not ready</h2>
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-fg-muted">Restart the local service or try again. Your existing data has not been changed.</p>
        <Button variant="primary" size="md" icon={RotateCw} onClick={refreshWorkspaces} className="mt-5">Try again</Button>
      </div>
    );
  }

  const navigationPaddingClass = isSettingsPage
    ? ''
    : sidebarState === 'collapsed'
      ? 'pl-16'
      : 'pl-16 sm:pl-64';

  // Normal dashboard when user has workspaces
  return (
    <div className="flex h-screen bg-canvas">
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
          {/* Pages other than the chat are code-split; they load from the local server instantly. */}
          <Suspense fallback={<PageFallback />}>
            <Outlet context={{
                selectedProject: getProjectValue(true),
                onProjectSelect: handleProjectSelect,
                localUser,
                currentTab: params.tab,
                refreshProjects,
                onOpenSettings: handleOpenSettings,
              }} />
          </Suspense>
        </div>
      </main>

      <UpdateScreen />
    </div>
  );
};

export default AppLayout;
