import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouteError, useNavigate } from 'react-router-dom';

// Idle Detection Hook
// eslint-disable-next-line react-refresh/only-export-components
export const useIdleDetection = (onIdle, idleTime = 15 * 60 * 1000) => { // 15 minutes default
  const timeoutRef = useRef();
  const isIdleRef = useRef(false);

  const resetTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isIdleRef.current) {
      isIdleRef.current = false;
    }

    timeoutRef.current = setTimeout(() => {
      if (!isIdleRef.current) {
        isIdleRef.current = true;
        onIdle();
      }
    }, idleTime);
  };

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const resetTimerHandler = () => resetTimer();

    events.forEach(event => {
      document.addEventListener(event, resetTimerHandler, true);
    });

    resetTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimerHandler, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleTime, onIdle]);

  return { resetTimer };
};

// Global 401 Error Context
const UnauthorizedErrorContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useUnauthorizedError = () => {
  const context = useContext(UnauthorizedErrorContext);
  if (!context) {
    throw new Error('useUnauthorizedError must be used within UnauthorizedErrorProvider');
  }
  return context;
};

export const UnauthorizedErrorProvider = ({ children }) => {
  const [show401Error, setShow401Error] = useState(false);
  const [errorDetails, setErrorDetails] = useState(null);

  const trigger401Error = (details = null) => {
    setErrorDetails(details);
    setShow401Error(true);
  };

  const clear401Error = () => {
    setShow401Error(false);
    setErrorDetails(null);
  };

  // Handle idle timeout - trigger gentle idle screen
  const handleIdleTimeout = () => {
    trigger401Error({ reason: 'idle_timeout' });
  };

  // Set up idle detection (only if not already showing an error)
  useIdleDetection(handleIdleTimeout, 15 * 60 * 1000); // 15 minutes

  if (show401Error) {
    return <UnauthorizedErrorPage onClear={clear401Error} details={errorDetails} />;
  }

  return (
    <UnauthorizedErrorContext.Provider value={{ trigger401Error, clear401Error, show401Error }}>
      {children}
    </UnauthorizedErrorContext.Provider>
  );
};

// Friendly Session Expired Page
const UnauthorizedErrorPage = ({ onClear, details }) => {
  const navigate = useNavigate();

  // Detect the reason for the unauthorized error
  const getLogoutReason = () => {
    if (details?.reason === 'idle_timeout') {
      return {
        title: "Still there?",
        message: "Looks like you've been away for a while.",
        subtitle: "For your security, we've paused your session. Just click below to continue where you left off!",
        icon: "😴"
      };
    }
    if (details?.reason === 'device_logout') {
      return {
        title: "Signed out for security",
        message: "You've been signed in from another device.",
        subtitle: "For your protection, we've signed you out here. This is totally normal and keeps your account secure.",
        icon: "🔒"
      };
    }
    if (details?.reason === 'token_expired') {
      return {
        title: "Session naturally expired",
        message: "Your session has reached its natural end.",
        subtitle: "This happens automatically for security. Just sign back in to continue!",
        icon: "⏰"
      };
    }
    // Default session expired
    return {
      title: "Session Expired",
      message: "Oops! Your session has expired.",
      subtitle: "For your security, we've logged you out. This is totally normal and happens from time to time.",
      icon: "😸"
    };
  };

  const logoutInfo = getLogoutReason();

  const handleSignOut = async () => {
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

      // Force page reload to ensure clean state
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Force reload even if cleanup fails
      window.location.href = '/auth';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 midnight:from-gray-950 midnight:to-gray-900 flex flex-col items-center justify-center p-8">
      {/* Gentle background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/20 dark:from-gray-900/50 dark:via-gray-800/30 dark:to-gray-700/20"></div>

      <div className="relative z-10 max-w-md w-full text-center">
        {/* Dynamic icon based on logout reason */}
        <div className="text-8xl mb-8 text-indigo-500 dark:text-indigo-400">
          {logoutInfo.icon}
        </div>

        <div className="mb-8 p-8 bg-white/80 dark:bg-gray-800/80 midnight:bg-gray-900/80 backdrop-blur-sm border border-indigo-200 dark:border-gray-600 midnight:border-gray-700 rounded-xl shadow-lg">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-4">
            {logoutInfo.title}
          </h1>

          <div className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6 space-y-2">
            <p className="text-lg">
              {logoutInfo.message}
            </p>
            <p className="text-sm">
              {logoutInfo.subtitle}
            </p>
          </div>

          {details?.reason !== 'idle_timeout' && (
            <div className="text-indigo-600 dark:text-indigo-400 midnight:text-indigo-300 text-sm mb-6 space-y-1 bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/10 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800 midnight:border-indigo-900">
              <p className="font-medium">💡 Why did this happen?</p>
              {details?.reason === 'device_logout' ? (
                <>
                  <p>• You signed in from another device or browser</p>
                  <p>• We automatically sign out other sessions for security</p>
                  <p>• This prevents unauthorized access to your account</p>
                </>
              ) : details?.reason === 'token_expired' ? (
                <>
                  <p>• Your session reached its security time limit</p>
                  <p>• This happens automatically every few hours</p>
                  <p>• Regular logouts keep your data protected</p>
                </>
              ) : (
                <>
                  <p>• Your session timed out after being inactive</p>
                  <p>• You may have opened the app in another tab</p>
                  <p>• This keeps your account secure</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          {details?.reason === 'idle_timeout' ? (
            <>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors shadow-md"
              >
                Continue Session
              </button>
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 midnight:bg-gray-800 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-400 rounded-lg transition-colors border border-gray-300 dark:border-gray-600 midnight:border-gray-700"
              >
                Sign Out Instead
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSignOut}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors shadow-md"
              >
                Sign Out & Sign Back In
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 midnight:bg-gray-800 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-400 rounded-lg transition-colors border border-gray-300 dark:border-gray-600 midnight:border-gray-700"
              >
                Try Refreshing
              </button>
            </>
          )}
        </div>

        {/* Friendly footer message */}
        <div className="mt-8 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
          {details?.reason === 'idle_timeout' ? (
            <>
              <p>🐾 Welcome back!</p>
              <p className="mt-1 italic">
                &quot;Every good cat needs a stretch after a nap!&quot; - The Cat
              </p>
            </>
          ) : (
            <>
              <p>🐾 Thanks for keeping your account secure!</p>
              <p className="mt-1 italic">
                &quot;Every good cat needs a nap... and every good session needs a refresh!&quot; - The Cat
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Route Error Element component for React Router
export const RouteErrorElement = () => {
  useRouteError();
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/home');
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleSignOut = async () => {
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

      // Force page reload to ensure clean state
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Force reload even if cleanup fails
      window.location.href = '/auth';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 midnight:from-gray-950 midnight:to-gray-900 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        {/* Friendly cat icon */}
        <div className="text-8xl mb-8 text-indigo-500 dark:text-indigo-400">
          😸
        </div>

        <div className="mb-8 p-8 bg-white/80 dark:bg-gray-800/80 midnight:bg-gray-900/80 backdrop-blur-sm border border-indigo-200 dark:border-gray-600 midnight:border-gray-700 rounded-xl shadow-lg">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-4">
            Page Not Found
          </h1>

          <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6">
            Looks like you wandered off the beaten path. Let&apos;s get you back home!
          </p>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={handleGoHome}
            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors shadow-md"
          >
            Go to Dashboard
          </button>

          <button
            onClick={handleReload}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 midnight:bg-gray-800 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-400 rounded-lg transition-colors border border-gray-300 dark:border-gray-600 midnight:border-gray-700"
          >
            Try Again
          </button>

          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 midnight:bg-red-900/20 midnight:hover:bg-red-900/40 text-red-700 dark:text-red-400 midnight:text-red-400 rounded-lg transition-colors border border-red-300 dark:border-red-700 midnight:border-red-800 text-sm"
          >
            Sign Out & Sign Back In
          </button>
        </div>

        {/* Friendly footer message */}
        <div className="mt-8 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
          <p>🐾 No worries, it happens!</p>
          <p className="mt-1 italic">
            &quot;Every path leads somewhere... even the wrong ones!&quot; - The Cat
          </p>
        </div>
      </div>
    </div>
  );
};

// Traditional Error Boundary for JavaScript errors
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Check if we should attempt auto-refresh first
    const refreshAttempts = parseInt(sessionStorage.getItem('errorBoundaryRefreshAttempts') || '0');
    const lastRefreshTime = parseInt(sessionStorage.getItem('errorBoundaryLastRefresh') || '0');
    const now = Date.now();

    // Auto-refresh conditions:
    // 1. Haven't attempted refresh yet, OR
    // 2. Last refresh was more than 5 minutes ago (reset counter)
    const shouldAutoRefresh = refreshAttempts === 0 || (now - lastRefreshTime > 5 * 60 * 1000);

    if (shouldAutoRefresh) {
      // Track this refresh attempt
      sessionStorage.setItem('errorBoundaryRefreshAttempts', '1');
      sessionStorage.setItem('errorBoundaryLastRefresh', now.toString());

      // Give a tiny delay to ensure state is saved, then refresh
      setTimeout(() => {
        window.location.reload();
      }, 100);

      return; // Don't set error state, just refresh
    }

    // If we've already tried refreshing, show the error UI
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Production-ready error handling - no console logging
    // Send to error tracking service if configured
    // errorTrackingService.captureException(error, { extra: errorInfo });
  }

  handleReset = () => {
    // Clear refresh tracking when user manually resets
    sessionStorage.removeItem('errorBoundaryRefreshAttempts');
    sessionStorage.removeItem('errorBoundaryLastRefresh');
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleSignOut = async () => {
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

      // Force page reload to ensure clean state
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Force reload even if cleanup fails
      window.location.href = '/auth';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 midnight:from-gray-950 midnight:to-gray-900 flex flex-col items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            {/* Friendly cat icon */}
            <div className="text-8xl mb-8 text-indigo-500 dark:text-indigo-400">
              😸
            </div>

            <div className="mb-8 p-8 bg-white/80 dark:bg-gray-800/80 midnight:bg-gray-900/80 backdrop-blur-sm border border-indigo-200 dark:border-gray-600 midnight:border-gray-700 rounded-xl shadow-lg">
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-4">
                Something went wrong
              </h1>

              <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6">
                The app encountered an unexpected error. We tried refreshing automatically, but the issue persisted.
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors shadow-md"
              >
                Try Again
              </button>

              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 midnight:bg-gray-800 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-400 rounded-lg transition-colors border border-gray-300 dark:border-gray-600 midnight:border-gray-700"
              >
                Refresh Page
              </button>

              <button
                onClick={this.handleSignOut}
                className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 midnight:bg-red-900/20 midnight:hover:bg-red-900/40 text-red-700 dark:text-red-400 midnight:text-red-400 rounded-lg transition-colors border border-red-300 dark:border-red-700 midnight:border-red-800 text-sm"
              >
                Sign Out & Sign Back In
              </button>
            </div>

            {/* Friendly footer message */}
            <div className="mt-8 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
              <p>🐾 Thanks for your patience!</p>
              <p className="mt-1 italic">
                &quot;Even the nimblest cats sometimes stumble... but we always land on our feet!&quot; - The Cat
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
