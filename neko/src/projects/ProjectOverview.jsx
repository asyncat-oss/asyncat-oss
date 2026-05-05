import { useEffect } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import ProjectOverviewOriginal from "../projects/ProjectOverviewContent.jsx";

const VALID_PROJECT_TABS = [
  'kanban',
  'list',
  'gantt',
  'network',
  'notes',
  'settings',
];

const ProjectOverview = () => {
  const { selectedProject, session } = useOutletContext();
  const { projectId, tab } = useParams();
  const navigate = useNavigate();

  // Validate tab parameter
  const currentTab = tab && VALID_PROJECT_TABS.includes(tab) ? tab : 'kanban';

  // Redirect to kanban if invalid tab is provided
  useEffect(() => {
    if (tab && !VALID_PROJECT_TABS.includes(tab) && projectId) {
      navigate(`/projects/${projectId}/kanban`, { replace: true });
    }
  }, [tab, projectId, navigate]);

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
