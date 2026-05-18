import { ENDPOINTS, USER_API_BASE_URL, apiRequest, getCurrentWorkspaceId } from './client.js';

export const projectsApi = {
  getProjects: async () => {
    return await apiRequest(ENDPOINTS.PROJECTS);
  },

  getProjectsByIds: async (projectIds) => {
    if (!projectIds || projectIds.length === 0) {
      return { data: [], projects: [] };
    }

    const result = await apiRequest(ENDPOINTS.PROJECTS);
    const allProjects = result.data || result.projects || result;

    if (!Array.isArray(allProjects)) {
      throw new Error('Invalid projects response format');
    }

    const filteredProjects = allProjects.filter(project =>
      projectIds.includes(project.id)
    );

    return {
      ...result,
      data: filteredProjects,
      projects: filteredProjects
    };
  }
};

export const projectFoldersApi = {
  getFolders: async () => {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) return { folders: [] };
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders?workspaceId=${workspaceId}`);
  },

  createFolder: async (name, color = null) => {
    const workspaceId = getCurrentWorkspaceId();
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders`, {
      method: 'POST',
      body: JSON.stringify({ name, color, workspaceId })
    });
  },

  updateFolder: async (folderId, updates) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  deleteFolder: async (folderId) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}`, {
      method: 'DELETE'
    });
  },

  addProject: async (folderId, projectId) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}/items`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
  },

  removeProject: async (folderId, projectId) => {
    return await apiRequest(`${USER_API_BASE_URL}/projects/folders/${folderId}/items/${projectId}`, {
      method: 'DELETE'
    });
  }
};
