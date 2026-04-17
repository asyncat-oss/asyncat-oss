// projectApi.js - Cleaned Version (deprecated views removed)
import authService from '../services/authService.js';

const API_URL = import.meta.env.VITE_USER_URL;

// Base fetch wrapper with error handling using authenticated fetch
const apiFetch = async (url, options = {}) => {
  const response = await authService.authenticatedFetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error ||
        errorData.message ||
        `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
};

// Project Management APIs
export const projectApi = {
  // Fetch single project
  async fetchProject(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}`);
  },

  // Update project
  async updateProject(projectId, projectData) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/update`, {
      method: "PATCH",
      body: JSON.stringify(projectData),
    });
  },

  // Delete project
  async deleteProject(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/delete`, {
      method: "DELETE",
    });
  },

  // Create project
  async createProject(projectData) {
    return apiFetch(`${API_URL}/api/projects`, {
      method: "POST",
      body: JSON.stringify(projectData),
    });
  },

  // Toggle project starred status
  async toggleProjectStar(projectId, starred) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/user/starred`, {
      method: "PATCH",
      body: JSON.stringify({ starred }),
    });
  },

  // Leave project
  async leaveProject(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/leave`, {
      method: "POST",
    });
  },
};

// Project Members APIs
export const projectMembersApi = {
  // Fetch members for multiple projects in one request
  async fetchBatchProjectMembers(projectIds) {
    if (!projectIds.length) return { data: {} };
    return apiFetch(`${API_URL}/api/projects/members/batch?projectIds=${projectIds.join(',')}`);
  },

  // Fetch project members
  async fetchProjectMembers(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/members`);
  },

  // Update project members
  async updateProjectMembers(projectId, members) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/members`,
      {
        method: "PUT",
        body: JSON.stringify({ members }),
      }
    );
  },

  // Add project member
  async addProjectMember(projectId, memberData) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/members`,
      {
        method: "POST",
        body: JSON.stringify(memberData),
      }
    );
  },

  // Remove project member
  async removeProjectMember(projectId, userId) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/members/${userId}`,
      {
        method: "DELETE",
      }
    );
  },

  // Invite member with view access control
  async inviteMemberWithViews(projectId, memberData) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/members/invite`,
      {
        method: "POST",
        body: JSON.stringify(memberData),
      }
    );
  },

  // Change member role
  async changeMemberRole(projectId, memberId, newRole) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/members/${memberId}/role`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      }
    );
  },

  // Update member's accessible views
  async updateMemberAccessibleViews(projectId, memberId, accessibleViews, viewPermissions) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/members/${memberId}/accessible-views`,
      {
        method: "PATCH",
        body: JSON.stringify({ 
          accessible_views: accessibleViews,
          view_permissions: viewPermissions 
        }),
      }
    );
  },
};

// Project Views & Widgets APIs
export const projectViewsApi = {
  // Update project enabled views
  async updateProjectViews(projectId, enabledViews) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/views`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled_views: enabledViews }),
      }
    );
  },

  // Update user view preferences
  async updateUserViewPreferences(projectId, viewPreferences) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/user/view-preferences`,
      {
        method: "PATCH",
        body: JSON.stringify({ view_preferences: viewPreferences }),
      }
    );
  },

  // Get user view preferences
  async getUserViewPreferences(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/user/view-preferences`);
  },

  // Update project enabled widgets
  async updateProjectWidgets(projectId, enabledWidgets) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/enabled-widgets`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled_widgets: enabledWidgets }),
      }
    );
  },

  // Update user widget preferences
  async updateUserWidgetPreferences(projectId, widgetPreferences) {
    return apiFetch(
      `${API_URL}/api/projects/${projectId}/user/widget-preferences`,
      {
        method: "PATCH",
        body: JSON.stringify({ widget_preferences: widgetPreferences }),
      }
    );
  },
};


// Component Data Management APIs
export const componentDataApi = {
  // Get wipeable components for a project
  async getWipeableComponents(projectId) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/components/wipeable`);
  },

  // Get component summary data
  async getComponentSummary(projectId, componentName) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/components/${componentName}/summary`);
  },

  // Wipe component data
  async wipeComponentData(projectId, componentName, confirmationData) {
    return apiFetch(`${API_URL}/api/projects/${projectId}/components/${componentName}/wipe`, {
      method: 'DELETE',
      body: JSON.stringify(confirmationData),
    });
  }
};

// AI APIs
export const aiApi = {
  // Create project with AI assistance
  async createProjectWithAI(promptData) {
    return apiFetch(`${API_URL}/api/ai/project-create`, {
      method: "POST",
      body: JSON.stringify(promptData),
    });
  },
};



// CLEANED: Helper functions for view access control - removed deprecated views
// HIERARCHY: enabled_views (owner controls) -> accessible_views (owner assigns) -> view_preferences (user chooses)
export const viewAccessUtils = {
  // Get view/component label for display
  getViewLabel: (viewKey) => {
    const labels = {
      kanban: "Kanban Board",
      list: "List View",
      timeline: "Timeline",
      gantt: "Gantt Chart",
      network: "Network Diagram",
      notes: "Notes",
      habits: "Habits Tracker",
      storage: "File Storage",
      gallery: "Gallery"
    };
    return labels[viewKey] || viewKey;
  },

  // Get view description
  getViewDescription: (viewKey) => {
    const descriptions = {
      kanban: "Manage tasks with drag-and-drop boards",
      list: "View tasks in a simple list format",
      timeline: "Timeline view of project events",
      gantt: "Project scheduling and dependencies",
      network: "Visualize project relationships",
      notes: "Project documentation and notes",
      habits: "Track recurring activities",
      storage: "Access project files and documents",
      gallery: "View project images and media"
    };
    return descriptions[viewKey] || "Project view";
  },

  // Check if view is essential (cannot be removed)
  isEssentialView: (viewKey) => {
    return ["storage"].includes(viewKey);
  },

  // Get view categories for organization
  getViewCategories: () => ({
    essential: ["storage"],
    content: ["kanban", "list", "timeline", "gantt", "notes"],
    analysis: ["network", "habits"],
    media: ["gallery"],
    productivity: [],
  }),

  // Validate accessible views
  validateAccessibleViews: (accessibleViews, projectEnabledViews) => {
    if (!Array.isArray(accessibleViews)) {
      return { isValid: false, error: "Accessible views must be an array" };
    }

    if (accessibleViews.length === 0) {
      return {
        isValid: false,
        error: "Member must have access to at least one view",
      };
    }

    // All accessible views must be in the project's enabled views
    const invalidViews = accessibleViews.filter(
      (view) => !projectEnabledViews.includes(view)
    );
    if (invalidViews.length > 0) {
      return {
        isValid: false,
        error: `These views are not available in the project: ${invalidViews.join(
          ", "
        )}`,
      };
    }

    return { isValid: true };
  },

  // Calculate effective views (intersection of accessible and preferences)
  getEffectiveViews: (memberData, projectEnabledViews) => {
    const accessibleViews = memberData.accessible_views || projectEnabledViews;
    const userPreferences = memberData.view_preferences || accessibleViews;

    return userPreferences.filter((view) => accessibleViews.includes(view));
  },
};

// Utility function to format relative time
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

// Dashboard Integration APIs for Project Overview
export const projectDashboardApi = {
  // Get enriched project data with dashboard metrics
  async getEnrichedProjectData(projectId, workspaceId = null, isPersonal = false) {
    const queryParams = new URLSearchParams();
    if (workspaceId) queryParams.append('workspaceId', workspaceId);
    if (isPersonal) queryParams.append('isPersonal', 'true');

    const [projectsResponse, tasksResponse] = await Promise.all([
      apiFetch(`${API_URL}/api/dashboard/projects?${queryParams}`),
      apiFetch(`${API_URL}/api/dashboard/user-tasks?${queryParams}`)
    ]);

    const projects = projectsResponse.data || [];
    const tasks = tasksResponse.data || [];

    // Find the specific project
    const enrichedProject = projects.find(p => p.id === projectId);
    if (!enrichedProject) {
      throw new Error('Project not found in dashboard data');
    }

    // Filter tasks for this project
    const projectTasks = tasks.filter(t => t.project_id === projectId);

    // Calculate additional metrics
    const upcomingDeadlines = projectTasks.filter(t => {
      if (!t.due_date || t.status === 'completed') return false;
      const dueDate = new Date(t.due_date);
      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      return dueDate >= today && dueDate <= weekFromNow;
    }).length;

    return {
      ...enrichedProject,
      total_tasks: enrichedProject.tasks_total || 0,
      completed_tasks: enrichedProject.tasks_completed || 0,
      progress_percent: enrichedProject.completion_percentage || 0,
      upcoming_deadlines: upcomingDeadlines,
      deadlines: projectTasks
        .filter(t => t.due_date && t.status !== 'completed')
        .map(t => ({
          id: t.id,
          title: t.title,
          due_date: t.due_date,
          priority: t.priority,
          status: t.status
        }))
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 5), // Top 5 upcoming deadlines
      task_stats: {
        totalChecklists: projectTasks.reduce((sum, t) => sum + (t.checklist?.length || 0), 0),
        completedChecklists: projectTasks.reduce((sum, t) => {
          const checklist = t.checklist || [];
          return sum + checklist.filter(item => item.completed).length;
        }, 0)
      }
    };
  },

  // Get project events for timeline
  async getProjectEvents(projectId, workspaceId = null, isPersonal = false) {
    const queryParams = new URLSearchParams();
    if (workspaceId) queryParams.append('workspaceId', workspaceId);
    if (isPersonal) queryParams.append('isPersonal', 'true');

    const response = await apiFetch(`${API_URL}/api/dashboard/events?${queryParams}`);
    const allEvents = response.data || [];

    // Filter events for this specific project
    return allEvents.filter(event => event.projectId === projectId);
  },

  // Get team activity for project (using tasks as activity)
  async getProjectActivity(projectId, workspaceId = null, isPersonal = false) {
    const queryParams = new URLSearchParams();
    if (workspaceId) queryParams.append('workspaceId', workspaceId);
    if (isPersonal) queryParams.append('isPersonal', 'true');

    const response = await apiFetch(`${API_URL}/api/dashboard/user-tasks?${queryParams}`);
    const tasks = response.data || [];

    // Filter and format tasks as activity for this project
    const projectTasks = tasks.filter(t => t.project_id === projectId);

    return projectTasks
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 10) // Latest 10 activities
      .map(task => ({
        id: task.id,
        type: task.status === 'completed' ? 'task_completed' : 'task_updated',
        title: task.title,
        description: `Task ${task.status === 'completed' ? 'completed' : 'updated'}: ${task.title}`,
        created_at: task.updated_at,
        user_name: 'User', // Tasks don't have user name in current schema
        avatar: null
      }));
  }
};

// Export all APIs as a combined object for convenience
export default {
  project: projectApi,
  members: projectMembersApi,
  views: projectViewsApi,
  components: componentDataApi,
  ai: aiApi,
  dashboard: projectDashboardApi,
  viewAccess: viewAccessUtils,
  utils: {
    formatRelativeTime,
  },
};