import { useEffect } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import ProjectOverviewOriginal from "../projects/ProjectOverviewContent.jsx";
import eventBus from "../utils/eventBus.js";

const ProjectOverview = () => {
  const { selectedProject, session, refreshProjects } = useOutletContext();
  const { projectId, tab } = useParams();
  const navigate = useNavigate();

  // Valid tabs that can be accessed via URL
  const validTabs = [
    'kanban',
    'list',
    'timeline',
    'gantt',
    'network',
    'gallery',
    'notes',
    'settings',
  ];

  // Validate tab parameter
  const currentTab = tab && validTabs.includes(tab) ? tab : 'kanban';

  // Redirect to kanban if invalid tab is provided
  useEffect(() => {
    if (tab && !validTabs.includes(tab) && projectId) {
      navigate(`/projects/${projectId}/kanban`, { replace: true });
    }
  }, [tab, projectId, navigate, validTabs]);

  const handleUpdate = async (updatedData) => {
    try {
      const { projectApi } = await import('./projectApi.js');

      const updatedProject = await projectApi.updateProject(selectedProject.id, updatedData);

      eventBus.emit('projectsUpdated');

      if (refreshProjects) {
        refreshProjects();
      }

      return updatedProject;
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  };

  const handleDelete = async () => {
    refreshProjects();
    navigate('/projects');
  };

  // ProjectOverviewContent handles showing skeleton when selectedProject is null and projectId exists
  return (
    <ProjectOverviewOriginal
      selectedProject={selectedProject}
      projectId={projectId}
      currentTab={currentTab}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      session={session}
    />
  );
};

export default ProjectOverview;
