// router/AppRouter.jsx - local application routes
import { lazy } from 'react';
import PropTypes from 'prop-types';
import { createBrowserRouter, RouterProvider, Navigate, useParams } from 'react-router-dom';
import { UserProvider } from '../contexts/UserContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { UiPreferencesProvider } from '../contexts/UiPreferencesContext';
import ConfirmProvider from '../components/ConfirmProvider';
import { CommandCenterProvider } from '../CommandCenter/context/CommandCenterContextEnhanced';
import ErrorBoundary from '../error/ErrorBoundary';
import RouteErrorElement from '../error/ErrorBoundary';

// Page components. The chat (the landing page) and the layout load up front;
// every other page is split into its own chunk and loaded on first visit.
import AppLayout from '../appcontainer/AppLayout';
import CommandCenterV2Enhanced from '../CommandCenter/CommandCenterV2EnhancedRouter';
import NotFound from '../error/NotFound';

const ChatsPage = lazy(() => import('../CommandCenter/pages/ChatsPage'));
const TrashPage = lazy(() => import('../CommandCenter/pages/TrashPage'));
const WorkspaceLayout = lazy(() => import('../projects/WorkspaceLayout'));
const WorkspaceEmpty = lazy(() => import('../projects/WorkspaceLayout').then((m) => ({ default: m.WorkspaceEmpty })));
const ProjectOverview = lazy(() => import('../projects/ProjectOverview'));
const SettingsPage = lazy(() => import('../Settings/SettingsPage'));
const ModelsPage = lazy(() => import('../Models/ModelsPage'));
const ToolsSkillsPage = lazy(() => import('../Tools/ToolsSkillsPage'));
const AgentPage = lazy(() => import('../Agent/AgentPage'));
const SchedulerPage = lazy(() => import('../Scheduler/SchedulerPage'));
const WorkflowsPage = lazy(() => import('../Workflows/WorkflowsPage'));
const ActivityPage = lazy(() => import('../Activity/ActivityPage'));
const TrainingPage = lazy(() => import('../Training/TrainingPage'));

const LegacyWorkspaceRedirect = () => {
  const { projectId, tab } = useParams();
  if (projectId && tab === 'folders') {
    return <Navigate to={`/projects/${projectId}/folders`} replace />;
  }
  const taskTab = ['kanban', 'list'].includes(tab) ? tab : null;
  return <Navigate to={projectId ? (taskTab ? `/tasks/${projectId}/${taskTab}` : `/tasks/${projectId}`) : '/tasks'} replace />;
};

const LocalApp = ({ children }) => {
  return (
    <UserProvider>
      <WorkspaceProvider>
        <CommandCenterProvider>
          <UiPreferencesProvider>
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
          </UiPreferencesProvider>
        </CommandCenterProvider>
      </WorkspaceProvider>
    </UserProvider>
  );
};

LocalApp.propTypes = {
  children: PropTypes.node,
};


const createRouter = () => createBrowserRouter([
  {
    path: "/",
    element: (
      <LocalApp>
        <AppLayout />
      </LocalApp>
    ),
    errorElement: <RouteErrorElement />,
    children: [
      {
        index: true,
        element: <Navigate to="/home" replace />
      },
      {
        path: "home",
        element: <CommandCenterV2Enhanced />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "conversations",
        element: <CommandCenterV2Enhanced />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "conversations/:conversationId",
        element: <CommandCenterV2Enhanced />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "all-chats",
        element: <ChatsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "trash",
        element: <TrashPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "projects",
        element: <WorkspaceLayout basePath="/projects" section="projects" />,
        errorElement: <RouteErrorElement />,
        children: [
          {
            index: true,
            element: <WorkspaceEmpty basePath="/projects" />,
          },
          {
            path: ":projectId",
            element: <ProjectOverview />,
            errorElement: <RouteErrorElement />,
          },
          {
            path: ":projectId/:tab",
            element: <ProjectOverview />,
            errorElement: <RouteErrorElement />,
          },
        ],
      },
      {
        path: "tasks",
        element: <WorkspaceLayout basePath="/tasks" section="tasks" />,
        errorElement: <RouteErrorElement />,
        children: [
          {
            index: true,
            element: <WorkspaceEmpty basePath="/tasks" />,
          },
          {
            path: ":projectId",
            element: <ProjectOverview />,
            errorElement: <RouteErrorElement />,
          },
          {
            path: ":projectId/:tab",
            element: <ProjectOverview />,
            errorElement: <RouteErrorElement />,
          },
        ],
      },
      {
        path: "workspace",
        element: <LegacyWorkspaceRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "workspace/:projectId",
        element: <LegacyWorkspaceRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "workspace/:projectId/:tab",
        element: <LegacyWorkspaceRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "settings",
        element: <SettingsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "settings/:tab",
        element: <SettingsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "models",
        element: <ModelsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "agents",
        element: <CommandCenterV2Enhanced />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "tools",
        element: <ToolsSkillsPage initialTab="tools" />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "skills",
        element: <ToolsSkillsPage initialTab="skills" />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "workflows",
        element: <WorkflowsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "schedules",
        element: <SchedulerPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "activity",
        element: <ActivityPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "training",
        element: <TrainingPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "scheduler",
        element: <Navigate to="/schedules" replace />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "profiles",
        element: <Navigate to="/agent/profiles" replace />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "agent",
        element: <Navigate to="/agent/profiles" replace />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "agent/profiles",
        element: <AgentPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "agent/scheduler",
        element: <Navigate to="/schedules" replace />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "agents/:sessionId",
        element: <CommandCenterV2Enhanced />,
        errorElement: <RouteErrorElement />
      },
    ]
  },
  {
    path: "*",
    element: <NotFound />,
    errorElement: <RouteErrorElement />
  }
]);

const AppRouter = () => {
  const router = createRouter();

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
};

export default AppRouter;
