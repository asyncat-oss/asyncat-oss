import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProjectGrid from "./views/ProjectGrid";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { projectApi } from "./projectApi";
import { projectFoldersApi } from "../CommandCenter/commandCenterApi";
import eventBus from "../utils/eventBus.js";


const soraFontBase = "font-sora";

// --- Helper Functions ---
const sortProjects = (projects) =>
  projects.sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    if (a.is_archived && !b.is_archived) return 1;
    if (!a.is_archived && b.is_archived) return -1;
    return new Date(b.created_at) - new Date(a.created_at);
  });


const ProjectsPage = ({
  selectedProject,
  session,
  setShowingProjectDetails = () => {},
  onProjectCreated = () => {},
  onProjectDeleted = () => {},
  onProjectSelect = () => {},
}) => {
  const navigate = useNavigate();
  
  // --- State ---
  const [projects, setProjects] = useState([]);
  const [projectMembers, setProjectMembers] = useState({}); // Store members by projectId
  const [projectFolders, setProjectFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [projectViewMode, setProjectViewMode] = useState(() => {
    const savedViewMode = sessionStorage.getItem("projectViewMode");
    return savedViewMode || "grid";
  });

  // --- Context ---
  const { currentWorkspace, getWorkspaceProjects, invalidateProjectsCache } = useWorkspace();

  // --- Effects ---
  useEffect(() => {
    sessionStorage.setItem("projectViewMode", projectViewMode);
  }, [projectViewMode]);

  useEffect(() => {
    if (currentWorkspace) {
      fetchProjects();
    }
  }, [currentWorkspace]);

  // --- Data Fetching ---
  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const workspaceProjects = await getWorkspaceProjects();
      const sortedProjects = sortProjects(workspaceProjects);
      setProjects(sortedProjects);
      
      // Also fetch folders parallel to member fetching
      projectFoldersApi.getFolders()
        .then(res => {
          if (res?.folders) {
            setProjectFolders(res.folders);
          }
        })
        .catch(console.error);

      setLoading(false); // show grid immediately — don't wait for members
      fetchAllProjectMembers(sortedProjects); // load members in background
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchAllProjectMembers = async (_projectList) => {
    // Single-user mode: no project members to fetch — skip silently.
    setProjectMembers({});
  };

  // --- Handlers ---
  const handleOpenCreateProject = () => {
    // Tell AppLayout to open the CreateProjectFlow modal
    eventBus.emit('openCreateProjectModal');
  };

  // Listen for project creation events from AppLayout
  useEffect(() => {
    const handleProjectCreated = async (newProject) => {
      if (!newProject) return;

      const updatedProjects = sortProjects([newProject, ...projects]);
      setProjects(updatedProjects);
      invalidateProjectsCache();

      // Single-user mode: no members to fetch
      setProjectMembers(prev => ({ ...prev, [newProject.id]: [] }));

      onProjectSelect(newProject);
      onProjectCreated();
    };

    const unsub = eventBus.on('projectCreated', handleProjectCreated);
    return unsub;
  }, [projects, onProjectSelect, onProjectCreated]);

  const handleProjectUpdate = async (updatedData) => {
    if (!selectedProject) return;
    try {
      setIsUpdating(true);
      const { starred, ...projectData } = updatedData;
      const { data } = await projectApi.updateProject(selectedProject.id, projectData);
      setProjects((prev) =>
        sortProjects(prev.map((project) => (project.id === data.id ? data : project)))
      );
      invalidateProjectsCache();
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsUpdating(false);
    }
  };

  const handleProjectDeleted = (deletedProject) => {
    setProjects((prev) => prev.filter((project) => project.id !== deletedProject.id));
    setProjectMembers(prev => {
      const newMembers = { ...prev };
      delete newMembers[deletedProject.id];
      return newMembers;
    });
    setShowingProjectDetails(false);
    onProjectDeleted();
    invalidateProjectsCache();
  };

  const handleOpenProjectDetail = (project) => {
    onProjectSelect(project);
    navigate(`/projects/${project.id}`);
  };

  const handleViewModeChange = (mode) => {
    setProjectViewMode(mode);
  };

  // --- UI Helpers ---
  const getWorkspaceName = () => {
    if (!currentWorkspace) return "Projects";
    return currentWorkspace.is_personal ? "Personal Projects" : currentWorkspace.name;
  };

  // --- Render ---
  return (
    <div className={soraFontBase}>
      <ProjectGrid
        projects={projects}
        projectFolders={projectFolders}
        projectMembers={projectMembers}
        loading={loading}
        error={error}
        selectedProject={selectedProject}
        onOpenProjectDetail={handleOpenProjectDetail}
        onProjectUpdate={handleProjectUpdate}
        onCreateClick={handleOpenCreateProject}
        onProjectDelete={handleProjectDeleted}
        viewMode={projectViewMode}
        onViewModeChange={handleViewModeChange}
        workspaceName={getWorkspaceName()}
        session={session}
      />
    </div>
  );
};

export default ProjectsPage;