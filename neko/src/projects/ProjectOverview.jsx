import { useState, useEffect } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import ProjectOverviewOriginal from "../projects/ProjectOverviewContent.jsx";
import eventBus from "../utils/eventBus.js";

const ProjectOverview = () => {
  const { selectedProject, session, refreshProjects, onProjectSelect } = useOutletContext();
  const { projectId, tab } = useParams();
  const navigate = useNavigate();
  
  const [error, setError] = useState(null);

  // Valid tabs that can be accessed via URL
  const validTabs = [
    'kanban',
    'list',
    'timeline',
    'gantt',
    'network',
    'gallery',
    'notes',
    'habits',
    'storage',
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

  const handleTabChange = (newTab) => {
    navigate(`/projects/${projectId}/${newTab}`);
  };

  const handleUpdate = async (updatedData) => {
    try {
      // Import the projectApi to update the project
      const { projectApi } = await import('./projectApi.js');

      // Update the project using the API
      const updatedProject = await projectApi.updateProject(selectedProject.id, updatedData);

      // Notify other components to refresh project lists
      eventBus.emit('projectsUpdated');
      
      // Refresh projects list in parent
      if (refreshProjects) {
        refreshProjects();
      }
      
      return updatedProject;
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  };

  const handleDelete = async (project) => {
    // Your existing delete logic here
    refreshProjects();
    navigate('/projects');
  };

  const handleSwitchProject = (project) => {
    navigate(`/projects/${project.id}`);
  };

  const handleBackToProjects = () => {
    navigate('/projects');
  };

  // ProjectOverviewContent handles showing skeleton when selectedProject is null and projectId exists
  return (
    <ProjectOverviewOriginal
      selectedProject={selectedProject}
      projectId={projectId}
      currentTab={currentTab}
      onTabChange={handleTabChange}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      onSwitchProject={handleSwitchProject}
      session={session}
      onBackToProjects={handleBackToProjects}
    />
  );
};

export default ProjectOverview;
