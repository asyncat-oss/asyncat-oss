import authService from '../../services/authService.js';

const API_BASE_URL = import.meta.env.VITE_MAIN_URL + '/api';
const USER_API_BASE_URL = import.meta.env.VITE_USER_URL + '/api';

const ENDPOINTS = {
  CHATS: `${API_BASE_URL}/ai/chats`,
  PROJECTS: `${USER_API_BASE_URL}/projects`
};

const getCurrentWorkspaceId = () => {
  try {
    const savedWorkspace = sessionStorage.getItem('currentWorkspace');
    if (savedWorkspace) {
      const workspace = JSON.parse(savedWorkspace);
      return workspace?.id || null;
    }

    if (window.__CURRENT_WORKSPACE_ID__) {
      return window.__CURRENT_WORKSPACE_ID__;
    }

    return null;
  } catch (error) {
    console.warn('Failed to get current workspace ID:', error);
    return null;
  }
};

const handleResponse = async (response) => {
  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    let errorCode = null;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.message || errorData.error;
      }
      errorCode = errorData.code || null;
      if (response.status === 413) {
        errorMessage = errorData.message || 'The file is too large to process. Please use a smaller image.';
      }
    } catch {
      if (response.status === 413) {
        errorMessage = 'The file is too large to process. Please use a smaller image.';
      }
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    error.code = errorCode;
    throw error;
  }

  try {
    return await response.json();
  } catch (error) {
    console.error('Failed to parse JSON response:', error);
    throw new Error('Invalid JSON response from server');
  }
};

const addWorkspaceToUrl = (url, workspaceId) => {
  if (!workspaceId) return url;

  const urlObj = new URL(url, window.location.origin);
  urlObj.searchParams.set('workspaceId', workspaceId);
  return urlObj.toString();
};

const apiRequest = async (url, options = {}) => {
  const workspaceId = getCurrentWorkspaceId();

  let finalUrl = url;
  if (workspaceId) {
    finalUrl = addWorkspaceToUrl(url, workspaceId);
  }

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include',
    ...options
  };

  if (workspaceId && options.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
    try {
      const bodyData = JSON.parse(options.body);
      bodyData.workspaceId = workspaceId;
      defaultOptions.body = JSON.stringify(bodyData);
    } catch (error) {
      console.warn('Could not add workspace ID to request body:', error);
    }
  }

  const response = await authService.authenticatedFetch(finalUrl, defaultOptions);
  return await handleResponse(response);
};

const getUserTimeContext = () => {
  try {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userLocalDateTime = new Date().toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: userTimezone
    });

    return { userTimezone, userLocalDateTime };
  } catch (error) {
    console.warn('Failed to get timezone information:', error);
    return {
      userTimezone: 'UTC',
      userLocalDateTime: new Date().toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: 'UTC'
      })
    };
  }
};

export { API_BASE_URL, USER_API_BASE_URL, ENDPOINTS, getCurrentWorkspaceId, handleResponse, addWorkspaceToUrl, apiRequest, getUserTimeContext };
