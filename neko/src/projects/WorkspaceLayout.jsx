import { useEffect, useState } from "react";
import { Outlet, useOutletContext, useNavigate } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import ProjectSidebar from "./ProjectSidebar";
import { useWorkspace } from "../contexts/WorkspaceContext";

export const WorkspaceEmpty = () => {
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
          navigate(`/workspace/${sorted[0].id}`, { replace: true });
        } else {
          setChecked(true);
        }
      })
      .catch(() => setChecked(true));
  }, [getWorkspaceProjects, navigate]);

  if (!checked) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center px-8">
        <FolderOpen className="mx-auto w-10 h-10 text-gray-300 dark:text-gray-600 midnight:text-gray-700 mb-3" />
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-1">
          No projects yet
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 midnight:text-gray-500">
          Click the + in the sidebar to create your first project.
        </p>
      </div>
    </div>
  );
};

const WorkspaceLayout = () => {
  const outletContext = useOutletContext();

  return (
    <div className="flex h-full">
      <ProjectSidebar />
      <div className="flex-1 min-w-0 overflow-hidden">
        <Outlet context={outletContext} />
      </div>
    </div>
  );
};

export default WorkspaceLayout;
