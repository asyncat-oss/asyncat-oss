import { Suspense, useEffect, useState } from "react";
import PropTypes from 'prop-types';
import { Outlet, useOutletContext, useNavigate } from "react-router-dom";
import { FolderOpen, Plus } from "lucide-react";
import ProjectSidebar from "./ProjectSidebar";
import { useWorkspace } from "../contexts/WorkspaceContext";
import eventBus from "../utils/eventBus.js";

export const WorkspaceEmpty = ({ basePath = '/projects' }) => {
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
          No projects yet
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 midnight:text-gray-500">
          Create a project to choose which folders the agent can work in and keep its chats together.
        </p>
        <button
          type="button"
          onClick={() => eventBus.emit('projects:create')}
          className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Create project
        </button>
      </div>
    </div>
  );
};

WorkspaceEmpty.propTypes = {
  basePath: PropTypes.string,
};

const WorkspaceLayout = ({ basePath = '/projects', section = 'projects' }) => {
  const outletContext = useOutletContext();

  return (
    <div className="flex h-full">
      <ProjectSidebar basePath={basePath} />
      <div className="flex-1 min-w-0 overflow-hidden">
        <Suspense fallback={null}>
          <Outlet context={{ ...outletContext, basePath, section }} />
        </Suspense>
      </div>
    </div>
  );
};

WorkspaceLayout.propTypes = {
  basePath: PropTypes.string,
  section: PropTypes.oneOf(['projects']),
};

export default WorkspaceLayout;
