import authService from '../services/authService.js';

const API_URL = import.meta.env.VITE_USER_URL;

const apiFetch = async (url, options = {}) => {
  const response = await authService.authenticatedFetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
};

export const projectApi = {
  async fetchProject(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}`);
  },

  async updateProject(projectId, projectData) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/update`, {
      method: "PATCH",
      body: JSON.stringify(projectData),
    });
  },

  async deleteProject(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/delete`, {
      method: "DELETE",
    });
  },

  async createProject(projectData) {
    return apiFetch(`${API_URL}/api/projects`, {
      method: "POST",
      body: JSON.stringify(projectData),
    });
  },

  async toggleProjectStar(projectId, starred) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/user/starred`, {
      method: "PATCH",
      body: JSON.stringify({ starred }),
    });
  },

  async leaveProject(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/leave`, {
      method: "POST",
    });
  },
};

export const aiApi = {
  async createProjectWithAI(promptData) {
    return apiFetch(`${API_URL}/api/ai/project-create`, {
      method: "POST",
      body: JSON.stringify(promptData),
    });
  },
};

export const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  const options = { month: "short", day: "numeric" };
  return date.toLocaleDateString(undefined, options);
};

export default { project: projectApi, ai: aiApi, utils: { formatRelativeTime } };