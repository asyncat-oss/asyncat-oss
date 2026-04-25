// router/AppRouter.jsx - AppRouter using Supabase Auth
import React, { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { UserProvider } from '../contexts/UserContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { CommandCenterProvider } from '../CommandCenter/CommandCenterContextEnhanced';
import ErrorBoundary, { UnauthorizedErrorProvider } from '../error/ErrorBoundary';
import useGlobal401Handler from '../hooks/useGlobal401Handler';
import RouteErrorElement from '../error/ErrorBoundary';

// Page components
import AppLayout from '../appcontainer/AppLayout';
import AuthContainer from '../auth/AuthContainer';
import CommandCenterV2Enhanced from '../CommandCenter/CommandCenterV2EnhancedRouter';
import ChatsPage from '../CommandCenter/ChatsPage';
import ProjectsPage from '../projects/ProjectsPage';
import ProjectOverview from '../projects/ProjectOverview';
import CalIndex from '../calendar/CalIndex';
import NotFound from '../error/NotFound';
import SettingsPage from '../Settings/SettingsPage';
import PacksPage from '../Packs/PacksPage';
import ModelsPage from '../Settings/ModelsPage';
import AgentPage from '../Agent/AgentPage';
import AgentToolsPage from '../Agent/ToolsPage';
import AgentSkillsPage from '../Agent/SkillsPage';


const loadingMessages = [
  "Waking up the cat AI...",
  "Paws initializing...",
  "Whiskers calibrating...",
  "Good morning, Dave. I'm a CAT-9000 computer...",
  "Purr systems online...",
  "Meow modules loading...",
  "I'm sorry Dave, I can't do that... just kidding! Loading your dashboard...",
  "Cat is thinking...",
  "Hunting virtual mice...",
  "Catnip systems initializing...",
  "This cat door is now operational...",
  "Asyncat AI is becoming self-aware...",
  "Grooming algorithms activated...",
  "All these tasks are yours, except Europa. Attempt no procrastination there...",
  "Warming up the keyboard for optimal paw placement..."
];

const ProtectedRoute = ({ children }) => {
  const { session, user, loading, signOut } = useAuth();
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Initialize global 401 handler
  useGlobal401Handler();
  const [loadingMessage, setLoadingMessage] = useState(
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)]
  );

  // Change loading message periodically
  useEffect(() => {
    if (!loading && !isTransitioning) return;

    const interval = setInterval(() => {
      setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
    }, 3000);

    return () => clearInterval(interval);
  }, [loading, isTransitioning]);

  const handleSignOut = async () => {
    setIsTransitioning(true);
    try {
      await signOut();
      // Force redirect to auth page after successful logout
      window.location.href = '/auth';
    } catch (error) {
      console.error('Sign out error:', error);
      // Even if logout fails, still redirect to clear the app state
      window.location.href = '/auth';
    } finally {
      setIsTransitioning(false);
    }
  };

  const shouldShowLoading = loading || isTransitioning;

  if (shouldShowLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <div className="w-8 h-8 mx-auto border-4 border-indigo-200 dark:border-indigo-800 midnight:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 midnight:border-t-indigo-300 rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 text-lg font-medium mb-2">
            {loadingMessage}
          </p>
          <p className="text-gray-400 dark:text-gray-500 midnight:text-gray-600 text-sm">
            The Cat is preparing your workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!session || !user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <UserProvider session={session}>
      <WorkspaceProvider>
        <CommandCenterProvider>
          {React.cloneElement(children, { session, onSignOut: handleSignOut })}
        </CommandCenterProvider>
      </WorkspaceProvider>
    </UserProvider>
  );
};


const createRouter = () => createBrowserRouter([
  {
    path: "/auth",
    element: <AuthContainer />,
    errorElement: <RouteErrorElement />
  },
  {
    path: "/signup",
    element: <AuthContainer />,
    errorElement: <RouteErrorElement />
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
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
        path: "workspace",
        element: <ProjectsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "workspace/:projectId",
        element: <ProjectOverview />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "workspace/:projectId/:tab",
        element: <ProjectOverview />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "projects",
        element: <ProjectsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "projects/:projectId",
        element: <ProjectOverview />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "projects/:projectId/:tab",
        element: <ProjectOverview />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "calendar",
        element: <CalIndex />,
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
        path: "packs",
        element: <PacksPage />,
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
        path: "agents/:sessionId",
        element: <AgentPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "agents/tools",
        element: <AgentToolsPage />,
        errorElement: <RouteErrorElement />
      },
      {
        path: "agents/skills",
        element: <AgentSkillsPage />,
        errorElement: <RouteErrorElement />
      }
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
      <UnauthorizedErrorProvider>
        <RouterProvider router={router} />
      </UnauthorizedErrorProvider>
    </ErrorBoundary>
  );
};

export default AppRouter;