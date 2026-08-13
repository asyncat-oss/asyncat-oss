import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useRouteError } from 'react-router-dom';

export const RouteErrorElement = () => {
  useRouteError();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-8 dark:bg-[#0f0f0f] midnight:bg-black">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 midnight:text-gray-600">
            Error
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Something went wrong
          </h1>
          <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400 midnight:text-gray-500">
            Asyncat could not open this page.
          </p>
        </div>
        <div className="flex items-center justify-center gap-6 pt-2">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="text-sm font-medium text-gray-900 hover:text-indigo-600 dark:text-gray-100 dark:hover:text-indigo-400 midnight:text-gray-100 midnight:hover:text-indigo-400"
          >
            Go home
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-gray-500 midnight:hover:text-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Application error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-8 dark:bg-[#0f0f0f] midnight:bg-black">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
              Something went wrong
            </h1>
            <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400 midnight:text-gray-500">
              The app encountered an unexpected error.
            </p>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full rounded-xl bg-gray-900 px-6 py-3 font-medium text-white hover:opacity-90 dark:bg-white dark:text-gray-900 midnight:bg-white midnight:text-gray-900"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-gray-100 px-6 py-3 font-medium text-gray-900 hover:opacity-90 dark:bg-gray-800 dark:text-gray-100 midnight:bg-gray-800 midnight:text-gray-100"
            >
              Refresh app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};

export default ErrorBoundary;
