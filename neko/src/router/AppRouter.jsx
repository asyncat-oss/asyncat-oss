// router/AppRouter.jsx - local application routes
import PropTypes from 'prop-types';
import { createBrowserRouter, RouterProvider, Navigate, useParams } from 'react-router-dom';
import { UserProvider } from '../contexts/UserContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { UiPreferencesProvider } from '../contexts/UiPreferencesContext';
import { CommandCenterProvider } from '../CommandCenter/context/CommandCenterContextEnhanced';
import ErrorBoundary from '../error/ErrorBoundary';
import RouteErrorElement from '../error/ErrorBoundary';

// Page components
import AppLayout from '../appcontainer/AppLayout';
import CommandCenterV2Enhanced from '../CommandCenter/CommandCenterV2EnhancedRouter';
import ChatsPage from '../CommandCenter/pages/ChatsPage';
import TrashPage from '../CommandCenter/pages/TrashPage';
import WorkspaceLayout, { WorkspaceEmpty } from '../projects/WorkspaceLayout';
import ProjectOverview from '../projects/ProjectOverview';
import NotFound from '../error/NotFound';
import SettingsPage from '../Settings/SettingsPage';
import ModelsPage from '../Models/ModelsPage';
import ToolsSkillsPage from '../Tools/ToolsSkillsPage';
import AgentPage from '../Agent/AgentPage';
import SchedulerPage from '../Scheduler/SchedulerPage';
import WorkflowsPage from '../Workflows/WorkflowsPage';
import ActivityPage from '../Activity/ActivityPage';
import TrainingPage from '../Training/TrainingPage';

const ProjectsRedirect = () => {
  const { projectId, tab } = useParams();
  return <Navigate to={tab ? `/workspace/${projectId}/${tab}` : `/workspace/${projectId}`} replace />;
};

const LocalApp = ({ children }) => {
  return (
    <UserProvider>
      <WorkspaceProvider>
        <CommandCenterProvider>
          <UiPreferencesProvider>
            {children}
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
        path: "workspace",
        element: <WorkspaceLayout />,
        errorElement: <RouteErrorElement />,
        children: [
          {
            index: true,
            element: <WorkspaceEmpty />,
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
        path: "projects",
        element: <Navigate to="/workspace" replace />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "projects/:projectId",
        element: <ProjectsRedirect />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "projects/:projectId/:tab",
        element: <ProjectsRedirect />,
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
