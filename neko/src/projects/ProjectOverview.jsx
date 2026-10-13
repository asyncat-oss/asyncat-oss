import { useEffect } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import ProjectOverviewOriginal from "../projects/ProjectOverviewContent.jsx";

const VALID_PROJECT_TABS = ['folders'];

const ProjectOverview = () => {
  const { selectedProject, basePath = '/projects' } = useOutletContext();
  const { projectId, tab } = useParams();
  const navigate = useNavigate();

  const currentTab = tab && VALID_PROJECT_TABS.includes(tab) ? tab : 'folders';

  // Old links (such as the removed task board) land on the project's folders.
  useEffect(() => {
    if (tab && !VALID_PROJECT_TABS.includes(tab) && projectId) {
      navigate(`${basePath}/${projectId}/folders`, { replace: true });
    }
  }, [basePath, navigate, projectId, tab]);

  // ProjectOverviewContent handles showing skeleton when selectedProject is null and projectId exists
  return (
    <ProjectOverviewOriginal
      selectedProject={selectedProject}
      projectId={projectId}
      currentTab={currentTab}
    />
  );
};

export default ProjectOverview;
