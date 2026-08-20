import { useEffect, useState } from "react";
import PropTypes from 'prop-types';
import { Outlet, useOutletContext, useNavigate } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import ProjectSidebar from "./ProjectSidebar";
import { useWorkspace } from "../contexts/WorkspaceContext";

export const WorkspaceEmpty = ({ basePath = '/projects', emptyLabel = 'projects' }) => {
  const { getWorkspaceProjects } = useWorkspace();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getWorkspaceProjects()
      .then((projects) => {
        if (projects.length > 0) {
          const sorted = [...projects].sort(
            (a, b) =>
              new Date(b.updated_at || b.created_at) -
              new Date(a.updated_at || a.created_at)
          );
          navigate(`${basePath}/${sorted[0].id}`, { replace: true });
        } else {
          setChecked(true);
        }
      })
      .catch(() => setChecked(true));
  }, [basePath, getWorkspaceProjects, navigate]);

  if (!checked) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center px-8">
        <FolderOpen className="mx-auto w-10 h-10 text-gray-300 dark:text-gray-600 midnight:text-gray-700 mb-3" />
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-1">
          No {emptyLabel} yet
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 midnight:text-gray-500">
          Click the + in the sidebar to create your first project.
        </p>
      </div>
    </div>
  );
};

WorkspaceEmpty.propTypes = {
  basePath: PropTypes.string,
  emptyLabel: PropTypes.string,
};

const WorkspaceLayout = ({ basePath = '/projects', section = 'projects' }) => {
  const outletContext = useOutletContext();

  return (
    <div className="flex h-full">
      <ProjectSidebar basePath={basePath} sectionLabel={section === 'tasks' ? 'Task boards' : 'Projects'} />
      <div className="flex-1 min-w-0 overflow-hidden">
        <Outlet context={{ ...outletContext, basePath, section }} />
      </div>
    </div>
  );
};

WorkspaceLayout.propTypes = {
  basePath: PropTypes.string,
  section: PropTypes.oneOf(['projects', 'tasks']),
};

export default WorkspaceLayout;
