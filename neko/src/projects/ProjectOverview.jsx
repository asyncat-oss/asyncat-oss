import { useEffect } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import ProjectOverviewOriginal from "../projects/ProjectOverviewContent.jsx";

const ProjectOverview = () => {
  const { selectedProject, session } = useOutletContext();
  const { projectId, tab } = useParams();
  const navigate = useNavigate();

  // Valid tabs that can be accessed via URL
  const validTabs = [
    'kanban',
    'list',
    'timeline',
    'gantt',
    'network',
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

  // ProjectOverviewContent handles showing skeleton when selectedProject is null and projectId exists
  return (
    <ProjectOverviewOriginal
      selectedProject={selectedProject}
      projectId={projectId}
      currentTab={currentTab}
      session={session}
    />
  );
};

export default ProjectOverview;
