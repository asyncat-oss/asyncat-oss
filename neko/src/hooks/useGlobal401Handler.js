import { useEffect } from 'react';
import { useUnauthorizedError } from '../error/ErrorBoundary.jsx';

// Custom hook to intercept and handle 401 errors globally
export const useGlobal401Handler = () => {
  const { trigger401Error } = useUnauthorizedError();

  useEffect(() => {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);

        // Check if response is 401 Unauthorized
        if (response.status === 401) {
          trigger401Error(`HTTP 401: Unauthorized access to ${args[0]}`);
        }

        return response;
      } catch (error) {
        // Check if error message contains 401 or unauthorized indicators
        const errorMessage = error.message || error.toString();
        if (errorMessage.includes('401') ||
            errorMessage.toLowerCase().includes('unauthorized') ||
            errorMessage.toLowerCase().includes('invalid session')) {
          trigger401Error(errorMessage);
        }
        throw error;
      }
    };

    // Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._url = url;
      return originalXHROpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('loadend', () => {
        if (this.status === 401) {
          trigger401Error(`XHR 401: Unauthorized access to ${this._url}`);
        }
      });

      this.addEventListener('error', () => {
        const errorText = this.responseText || this.statusText;
        if (this.status === 401 ||
            errorText.toLowerCase().includes('unauthorized') ||
            errorText.toLowerCase().includes('invalid session')) {
          trigger401Error(`XHR Error: ${errorText}`);
        }
      });

      return originalXHRSend.call(this, ...args);
    };

    // Listen for unhandled promise rejections that might contain 401 errors
    const handleUnhandledRejection = (event) => {
      const error = event.reason;
      if (error && typeof error === 'object') {
        const errorMessage = error.message || error.toString();
        if (errorMessage.includes('401') ||
            errorMessage.toLowerCase().includes('unauthorized') ||
            errorMessage.toLowerCase().includes('invalid session')) {
          trigger401Error(`Unhandled rejection: ${errorMessage}`);
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup function to restore original methods
    return () => {
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [trigger401Error]);

  // Return the trigger function so components can manually trigger 401 errors
  return { trigger401Error };
};

export default useGlobal401Handler;