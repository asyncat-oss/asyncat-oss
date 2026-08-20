import apiClient from '../services/apiClient.js';

const API_URL = import.meta.env.VITE_USER_URL;

const apiFetch = async (url, options = {}) => {
  const response = await apiClient.request(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
};

export const projectApi = {
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

  async getProjectFolders(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/folders`);
  },

  async addProjectFolder(projectId, folderData) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/folders`, {
      method: "POST",
      body: JSON.stringify(folderData),
    });
  },

  async updateProjectFolder(projectId, folderId, folderData) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify(folderData),
    });
  },

  async deleteProjectFolder(projectId, folderId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/folders/${folderId}`, {
      method: "DELETE",
    });
  },
};
