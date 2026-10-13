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
  async getProjects() {
    return apiFetch(`${API_URL}/api/projects`);
  },

  async getProjectChats(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/chats`);
  },

  async updateInstructions(projectId, instructions) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/instructions`, {
      method: "PATCH",
      body: JSON.stringify({ instructions }),
    });
  },

  async listKnowledge(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/knowledge`);
  },

  /** Upload files; resolves to { data: added[], errors: [{ name, error }] }. */
  async uploadKnowledge(projectId, files) {
    const form = new FormData();
    for (const file of files) form.append("files", file, file.name);
    const response = await apiClient.request(`${API_URL}/api/projects/${projectId}/knowledge`, {
      method: "POST",
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !(Array.isArray(data.errors) && data.errors.length)) {
      throw new Error(data.error || `Upload failed (HTTP ${response.status})`);
    }
    return { data: data.data || [], errors: data.errors || [] };
  },

  async deleteKnowledge(projectId, fileId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/knowledge/${fileId}`, { method: "DELETE" });
  },

  async getContextFit(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/context`);
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
