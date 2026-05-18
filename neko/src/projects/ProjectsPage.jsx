import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProjectGrid from "./views/ProjectGrid";
import { useWorkspace } from "../contexts/WorkspaceContext";
import eventBus from "../utils/eventBus.js";

const soraFontBase = "font-sora";

const sortProjects = (projects) =>
  [...projects].sort((a, b) => {
    if (a.is_archived && !b.is_archived) return 1;
    if (!a.is_archived && b.is_archived) return -1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

const ProjectsPage = ({
  selectedProject,
  onProjectCreated = () => {},
  onProjectSelect = () => {},
}) => {
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projectViewMode, setProjectViewMode] = useState(() => {
    return sessionStorage.getItem("projectViewMode") || "grid";
  });

  const { currentWorkspace, getWorkspaceProjects, bustProjectsCache } = useWorkspace();

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const workspaceProjects = await getWorkspaceProjects();
      setProjects(sortProjects(workspaceProjects));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getWorkspaceProjects]);

  useEffect(() => {
    sessionStorage.setItem("projectViewMode", projectViewMode);
  }, [projectViewMode]);

  useEffect(() => {
    if (currentWorkspace) fetchProjects();
  }, [currentWorkspace, fetchProjects]);

  useEffect(() => {
    const handleProjectsUpdated = () => {
      bustProjectsCache();
      fetchProjects();
    };

    return eventBus.on('projectsUpdated', handleProjectsUpdated);
  }, [bustProjectsCache, currentWorkspace, fetchProjects]);

  const handleOpenCreateProject = () => {
    eventBus.emit('openCreateProjectModal');
  };

  useEffect(() => {
    const handleProjectCreated = (newProject) => {
      if (!newProject) return;
      setProjects(prev => sortProjects([newProject, ...prev]));
      onProjectSelect(newProject);
      onProjectCreated();
    };
    return eventBus.on('projectCreated', handleProjectCreated);
  }, [onProjectSelect, onProjectCreated]);

  const handleOpenProjectDetail = (project) => {
    onProjectSelect(project);
    navigate(`/projects/${project.id}`);
  };

  const getWorkspaceName = () => {
    if (!currentWorkspace) return "Projects";
    return currentWorkspace.is_personal ? "Personal" : currentWorkspace.name;
  };

  return (
    <div className={soraFontBase}>
      <ProjectGrid
        projects={projects}
        loading={loading}
        error={error}
        selectedProject={selectedProject}
        onOpenProjectDetail={handleOpenProjectDetail}
        onCreateClick={handleOpenCreateProject}
        viewMode={projectViewMode}
        onViewModeChange={setProjectViewMode}
        workspaceName={getWorkspaceName()}
      />
    </div>
  );
};

export default ProjectsPage;
