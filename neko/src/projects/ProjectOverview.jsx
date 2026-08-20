import { useEffect } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import ProjectOverviewOriginal from "../projects/ProjectOverviewContent.jsx";

const VALID_PROJECT_TABS = ['folders'];
const VALID_TASK_TABS = ['kanban', 'list'];

const ProjectOverview = () => {
  const { selectedProject, localUser, basePath = '/projects', section = 'projects' } = useOutletContext();
  const { projectId, tab } = useParams();
  const navigate = useNavigate();

  // Validate tab parameter
  const validTabs = section === 'tasks' ? VALID_TASK_TABS : VALID_PROJECT_TABS;
  const currentTab = tab && validTabs.includes(tab)
    ? tab
    : section === 'tasks' ? 'kanban' : 'folders';

  // Redirect to kanban if invalid tab is provided
  useEffect(() => {
    if (tab && !validTabs.includes(tab) && projectId) {
      navigate(`${basePath}/${projectId}/${section === 'tasks' ? 'kanban' : 'folders'}`, { replace: true });
    }
  }, [basePath, navigate, projectId, section, tab, validTabs]);

  // ProjectOverviewContent handles showing skeleton when selectedProject is null and projectId exists
  return (
    <ProjectOverviewOriginal
      selectedProject={selectedProject}
      projectId={projectId}
      currentTab={currentTab}
      localUser={localUser}
      basePath={basePath}
      section={section}
    />
  );
};

export default ProjectOverview;
