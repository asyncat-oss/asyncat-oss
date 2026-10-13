// router/AppRouter.jsx - local application routes
import { lazy } from 'react';
import PropTypes from 'prop-types';
import { createBrowserRouter, RouterProvider, Navigate, useParams } from 'react-router-dom';
import { UserProvider } from '../contexts/UserContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { UiPreferencesProvider } from '../contexts/UiPreferencesContext';
import ConfirmProvider from '../components/ConfirmProvider';
import ToastProvider from '../components/ToastProvider';
import { CommandCenterProvider } from '../CommandCenter/context/CommandCenterContextEnhanced';
import ErrorBoundary from '../error/ErrorBoundary';
import { RouteErrorElement } from '../error/ErrorBoundary';

// Page components. The chat (the landing page) and the layout load up front;
// every other page is split into its own chunk and loaded on first visit.
import AppLayout from '../appcontainer/AppLayout';
import CommandCenterV2Enhanced from '../CommandCenter/CommandCenterV2EnhancedRouter';
import NotFound from '../error/NotFound';

const ChatsPage = lazy(() => import('../CommandCenter/pages/ChatsPage'));
const TrashPage = lazy(() => import('../CommandCenter/pages/TrashPage'));
const ProjectsHome = lazy(() => import('../projects/ProjectsHome'));
const ProjectPage = lazy(() => import('../projects/ProjectPage'));
const SettingsPage = lazy(() => import('../Settings/SettingsPage'));
const ModelsPage = lazy(() => import('../Models/ModelsPage'));
const ToolsSkillsPage = lazy(() => import('../Tools/ToolsSkillsPage'));
const AgentPage = lazy(() => import('../Agent/AgentPage'));
const CatsPage = lazy(() => import('../Cats/CatsPage'));
const CatPage = lazy(() => import('../Cats/CatPage'));

// Old /workspace and task-board (/tasks) links open the project instead.
const LegacyProjectRedirect = () => {
  const { projectId } = useParams();
  return <Navigate to={projectId ? `/projects/${projectId}` : '/projects'} replace />;
};

// Automations (Workflows, Schedules, Activity) became one Scheduled page,
// and scheduled tasks became Cats.
const OLD_SCHEDULED_PATHS = ['scheduled', 'automations', 'workflows', 'schedules', 'activity', 'scheduler', 'agent/scheduler'];

const LocalApp = ({ children }) => {
  return (
    <UserProvider>
      <WorkspaceProvider>
        <CommandCenterProvider>
          <UiPreferencesProvider>
            <ToastProvider>
              <ConfirmProvider>
                {children}
              </ConfirmProvider>
            </ToastProvider>
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
        element: <ProjectsHome />,
        errorElement: <RouteErrorElement />,
      },
      {
        path: "projects/:projectId",
        element: <ProjectPage />,
        errorElement: <RouteErrorElement />,
      },
      {
        // Old links such as /projects/:id/folders.
        path: "projects/:projectId/:tab",
        element: <ProjectPage />,
        errorElement: <RouteErrorElement />,
      },
      {
        path: "workspace",
        element: <LegacyProjectRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "workspace/:projectId",
        element: <LegacyProjectRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "workspace/:projectId/:tab",
        element: <LegacyProjectRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "tasks",
        element: <LegacyProjectRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "tasks/:projectId",
        element: <LegacyProjectRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "tasks/:projectId/:tab",
        element: <LegacyProjectRedirect />,
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
        element: <AgentPage />,
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
        path: "cats",
        element: <CatsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "cats/:catId",
        element: <CatPage />,
        errorElement: <RouteErrorElement />
      },
      ...OLD_SCHEDULED_PATHS.map((path) => ({
        path,
        element: <Navigate to="/cats" replace />,
        errorElement: <RouteErrorElement />
      })),
      {
        // Training is a tab of the Models page.
        path: "training",
        element: <Navigate to="/models?tab=training" replace />,
        errorElement: <RouteErrorElement />
      },
      // Older links to the Agents page.
      ...["profiles", "agent", "agent/profiles"].map((path) => ({
        path,
        element: <Navigate to="/agents" replace />,
        errorElement: <RouteErrorElement />
      })),
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
