import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useRouteError, useNavigate } from 'react-router-dom';
import { useIdleDetection, useUnauthorizedError, UnauthorizedErrorContext } from './useErrorHandling';

// Idle Detection Hook - re-exported for backwards compatibility
export { useIdleDetection };

// Global 401 Error Context - re-exported for backwards compatibility
export { useUnauthorizedError };

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

  const handleIdleTimeout = () => {
    trigger401Error({ reason: 'idle_timeout' });
  };

  useIdleDetection(handleIdleTimeout, 15 * 60 * 1000);

  if (show401Error) {
    return <UnauthorizedErrorPage onClear={clear401Error} details={errorDetails} />;
  }

  return (
    <UnauthorizedErrorContext.Provider value={{ trigger401Error, clear401Error, show401Error }}>
      {children}
    </UnauthorizedErrorContext.Provider>
  );
};

UnauthorizedErrorProvider.propTypes = {
  children: PropTypes.node,
};

// Session Expired Page
const UnauthorizedErrorPage = ({ details }) => {
  const navigate = useNavigate();

  const getTitle = () => {
    if (details?.reason === 'idle_timeout') return "Still there?";
    if (details?.reason === 'device_logout') return "Signed out";
    if (details?.reason === 'token_expired') return "Session expired";
    return "Session Expired";
  };

  const getMessage = () => {
    if (details?.reason === 'idle_timeout') return "You've been away for a while. For your security, we've paused your session.";
    if (details?.reason === 'device_logout') return "You've been signed in from another device. For your protection, we've signed you out here.";
    if (details?.reason === 'token_expired') return "Your session has reached its natural end for security.";
    return "For your security, we've logged you out.";
  };

  const handleSignOut = async () => {
    try {
      sessionStorage.clear();
      localStorage.clear();
      document.cookie.split(";").forEach(function(c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      if (window.indexedDB) {
        try {
          const databases = await indexedDB.databases();
          databases.forEach(db => indexedDB.deleteDatabase(db.name));
        } catch {
          /* IndexedDB cleanup failed, continue */
        }
      }
      window.location.href = '/auth';
    } catch {
      /* Cleanup failed, continue anyway */
      window.location.href = '/auth';
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] midnight:bg-black flex flex-col items-center justify-center p-8">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {getTitle()}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-sm leading-relaxed">
            {getMessage()}
          </p>
        </div>

        <div className="space-y-2">
          {details?.reason === 'idle_timeout' ? (
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-gray-900 dark:bg-white midnight:bg-white text-white dark:text-gray-900 midnight:text-gray-900 font-medium rounded-xl transition-colors hover:opacity-90"
            >
              Continue Session
            </button>
          ) : (
            <button
              onClick={handleSignOut}
              className="w-full px-6 py-3 bg-gray-900 dark:bg-white midnight:bg-white text-white dark:text-gray-900 midnight:text-gray-900 font-medium rounded-xl transition-colors hover:opacity-90"
            >
              Sign in again
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
};

UnauthorizedErrorPage.propTypes = {
  details: PropTypes.shape({
    reason: PropTypes.string,
  }),
};

// Route Error Element
export const RouteErrorElement = () => {
  useRouteError();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] midnight:bg-black flex flex-col items-center justify-center p-8">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500 midnight:text-gray-600 tracking-wide uppercase">
            Error
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Something went wrong
          </h1>
          <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-sm leading-relaxed">
            An unexpected error occurred.
          </p>
        </div>

        <div className="flex items-center justify-center gap-6 pt-2">
          <button
            onClick={() => navigate('/home')}
            className="text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-medium hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-400 transition-colors"
          >
            Go home
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

// Traditional Error Boundary
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const refreshAttempts = parseInt(sessionStorage.getItem('errorBoundaryRefreshAttempts') || '0');
    const lastRefreshTime = parseInt(sessionStorage.getItem('errorBoundaryLastRefresh') || '0');
    const now = Date.now();
    const shouldAutoRefresh = refreshAttempts === 0 || (now - lastRefreshTime > 5 * 60 * 1000);

    if (shouldAutoRefresh) {
      sessionStorage.setItem('errorBoundaryRefreshAttempts', '1');
      sessionStorage.setItem('errorBoundaryLastRefresh', now.toString());
      setTimeout(() => {
        window.location.reload();
      }, 100);
      return;
    }

    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    sessionStorage.removeItem('errorBoundaryRefreshAttempts');
    sessionStorage.removeItem('errorBoundaryLastRefresh');
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleSignOut = async () => {
    try {
      sessionStorage.clear();
      localStorage.clear();
      document.cookie.split(";").forEach(function(c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      if (window.indexedDB) {
        try {
          const databases = await indexedDB.databases();
          databases.forEach(db => indexedDB.deleteDatabase(db.name));
        } catch {
          /* IndexedDB cleanup failed, continue */
        }
      }
      window.location.href = '/auth';
    } catch {
      /* Cleanup failed, continue anyway */
      window.location.href = '/auth';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white dark:bg-[#0f0f0f] midnight:bg-black flex flex-col items-center justify-center p-8">
          <div className="max-w-sm w-full text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                Something went wrong
              </h1>
              <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-sm leading-relaxed">
                The app encountered an unexpected error. We tried refreshing automatically, but the issue persisted.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={this.handleReset}
                className="w-full px-6 py-3 bg-gray-900 dark:bg-white midnight:bg-white text-white dark:text-gray-900 midnight:text-gray-900 font-medium rounded-xl transition-colors hover:opacity-90"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-6 py-3 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-medium rounded-xl transition-colors hover:opacity-90"
              >
                Refresh Page
              </button>
            </div>

            <button
              onClick={this.handleSignOut}
              className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};

export default ErrorBoundary;