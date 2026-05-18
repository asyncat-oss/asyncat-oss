import { ENDPOINTS, apiRequest } from './client.js';

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
