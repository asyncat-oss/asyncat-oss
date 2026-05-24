import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus, Check, X, MoreHorizontal, Loader2,
  Search, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { projectApi } from "./projectApi";
import ProjectEditModal from "./components/ProjectEditModal";
import eventBus from "../utils/eventBus.js";

const sortProjects = (projects) =>
  [...projects].sort((a, b) => {
    if (a.is_archived && !b.is_archived) return 1;
    if (!a.is_archived && b.is_archived) return -1;
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

// Right-side tooltip used for collapsed icon items
const RightTooltip = ({ label, children }) => (
  <div className="relative group/tip">
    {children}
    <div className={`
      absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-[60]
      px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none
      bg-gray-900 dark:bg-gray-800 midnight:bg-gray-800 text-white shadow-xl
      opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100
      transition-all duration-150
    `}>
      {label}
      <span className="absolute top-1/2 right-full -translate-y-1/2 border-[5px] border-transparent border-r-gray-900 dark:border-r-gray-800 midnight:border-r-gray-800" />
    </div>
  </div>
);

// Single project row — full or icon-only
const ProjectItem = ({ project, isActive, onClick, onEdit, collapsed }) => {
  if (collapsed) {
    return (
      <RightTooltip label={project.name}>
        <button
          onClick={onClick}
          className={`relative w-10 h-9 flex items-center justify-center rounded-xl mx-auto transition-all duration-150 active:scale-90 ${
            isActive
              ? "bg-black/[0.07] dark:bg-white/10 midnight:bg-white/10"
              : "hover:bg-black/[0.05] dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06]"
          }`}
        >
          <span className="text-base leading-none">{project.emoji || "📁"}</span>
          {isActive && (
            <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-sm shadow-indigo-500/60" />
          )}
        </button>
      </RightTooltip>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group/item flex items-center gap-2.5 px-3 h-9 mx-1 rounded-lg cursor-pointer transition-colors duration-150 ${
        isActive
          ? "bg-gray-100/80 text-gray-950 dark:bg-white/[0.06] dark:text-white midnight:bg-white/[0.05] midnight:text-white"
          : "text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100/70 hover:text-gray-900 dark:hover:bg-white/[0.045] dark:hover:text-gray-100 midnight:hover:bg-white/[0.045] midnight:hover:text-gray-100"
      }`}
    >
      <span className={`text-base flex-shrink-0 leading-none transition-colors ${
        isActive ? "opacity-100" : "opacity-70 group-hover/item:opacity-100"
      }`}>
        {project.emoji || "📁"}
      </span>
      <span className="flex-1 text-sm font-medium truncate">{project.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className={`
          opacity-0 group-hover/item:opacity-100 flex-shrink-0
          w-6 h-6 flex items-center justify-center rounded-md
          text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300
          hover:bg-black/[0.05] dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06]
          transition-all duration-150
        `}
        title="Edit project"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

const ProjectSidebar = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { getWorkspaceProjects, bustProjectsCache, currentWorkspace } = useWorkspace();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("projectSidebarCollapsed") === "true"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [editProject, setEditProject] = useState(null);

  const createInputRef = useRef(null);
  const searchInputRef = useRef(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getWorkspaceProjects();
      setProjects(sortProjects(data));
    } catch {
      // keep current state
    } finally {
      setLoading(false);
    }
  }, [getWorkspaceProjects]);

  useEffect(() => {
    if (currentWorkspace) fetchProjects();
  }, [currentWorkspace, fetchProjects]);

  useEffect(() => {
    const unsub = eventBus.on("projectsUpdated", () => {
      bustProjectsCache();
      fetchProjects();
    });
    return unsub;
  }, [bustProjectsCache, fetchProjects]);

  useEffect(() => {
    if (isCreating && !collapsed) createInputRef.current?.focus();
  }, [isCreating, collapsed]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("projectSidebarCollapsed", String(next));
    if (next) {
      setSearchQuery("");
      setIsCreating(false);
    }
  };

  const startCreate = () => {
    if (collapsed) toggleCollapse();
    setNewName("");
    setCreateError(null);
    setIsCreating(true);
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setNewName("");
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    if (!currentWorkspace?.id) {
      setCreateError("No workspace available");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const result = await projectApi.createProject({
        name: newName.trim(),
        description: "",
        team_id: currentWorkspace.id,
      });
      if (result?.data) {
        cancelCreate();
        eventBus.emit("projectsUpdated");
        navigate(`/workspace/${result.data.id}`);
      }
    } catch (err) {
      setCreateError(err.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateKey = (e) => {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape") cancelCreate();
  };

  const filteredProjects = searchQuery.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  const CollapseIcon = collapsed ? ChevronRight : ChevronLeft;

  return (
    <>
      <aside
        className={`
          flex-shrink-0 border-r border-gray-200/70 dark:border-white/[0.07] midnight:border-white/[0.05]
          flex flex-col h-full
          bg-white/70 backdrop-blur-xl dark:bg-gray-950/55 midnight:bg-gray-950/55
          transition-[width] duration-200 overflow-hidden
          ${collapsed ? "w-14" : "w-52"}
        `}
      >
        {/* ── Header ── */}
        {collapsed ? (
          /* Collapsed header: stack collapse-toggle + new-project vertically */
          <div className="flex flex-col items-center gap-0.5 px-2 pt-2.5 pb-1">
            <RightTooltip label="Expand">
              <button
                onClick={toggleCollapse}
                className="w-10 h-9 flex items-center justify-center rounded-xl text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06] transition-all duration-150"
              >
                <CollapseIcon className="w-3.5 h-3.5" />
              </button>
            </RightTooltip>
            <RightTooltip label="New project">
              <button
                onClick={startCreate}
                className="w-10 h-9 flex items-center justify-center rounded-xl text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06] transition-all duration-150"
              >
                <Plus className="w-4 h-4" />
              </button>
            </RightTooltip>
          </div>
        ) : (
          /* Expanded header */
          <div className="flex items-center gap-1 px-2.5 pt-2.5 pb-1">
            <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-gray-500 select-none px-1">
              Projects
            </span>
            <button
              onClick={startCreate}
              title="New project"
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06] transition-all duration-150"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleCollapse}
              title="Collapse sidebar"
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06] transition-all duration-150"
            >
              <CollapseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Search (expanded only) ── */}
        {!collapsed && (
          <div className="px-2.5 pb-1.5">
            <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] midnight:bg-white/[0.03] border border-transparent focus-within:border-gray-300/60 dark:focus-within:border-white/[0.1] transition-colors">
              <Search className="w-3 h-3 flex-shrink-0 text-gray-400 dark:text-gray-500 midnight:text-gray-500" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 min-w-0 text-xs bg-transparent text-gray-700 dark:text-gray-300 midnight:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Thin separator ── */}
        <div className="mx-2.5 h-px bg-gray-200/60 dark:bg-white/[0.06] midnight:bg-white/[0.05] mb-1" />

        {/* ── Project list ── */}
        <div className={`flex-1 overflow-y-auto py-0.5 ${collapsed ? "px-1.5 space-y-0.5" : "space-y-px"}`}>

          {/* Inline create row */}
          {isCreating && !collapsed && (
            <div className="px-2 py-1">
              <div className="flex items-center gap-1">
                <input
                  ref={createInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleCreateKey}
                  placeholder="Project name…"
                  className="flex-1 min-w-0 text-sm px-2.5 py-1 rounded-lg border border-indigo-400/70 dark:border-indigo-500/70 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 bg-white dark:bg-gray-900 midnight:bg-gray-900 text-gray-900 dark:text-white midnight:text-white placeholder-gray-400 transition-colors"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 transition-colors"
                >
                  {creating
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Check className="w-3.5 h-3.5" />
                  }
                </button>
                <button
                  onClick={cancelCreate}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-white/[0.045] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {createError && (
                <p className="mt-1 text-[11px] text-red-500 dark:text-red-400 px-1">{createError}</p>
              )}
            </div>
          )}

          {/* Loading skeleton */}
          {loading ? (
            collapsed ? (
              <div className="flex flex-col items-center gap-1 px-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-10 h-9 rounded-xl bg-gray-100 dark:bg-white/[0.04] midnight:bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-px px-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-9 mx-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] midnight:bg-white/[0.02] animate-pulse" />
                ))}
              </div>
            )
          ) : filteredProjects.length === 0 ? (
            /* Empty / no-results state */
            !collapsed && (
              <div className="px-3 py-6 text-center">
                {searchQuery ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500">
                    No projects match <span className="font-medium text-gray-600 dark:text-gray-400">"{searchQuery}"</span>
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500 mb-2">
                      No projects yet
                    </p>
                    <button
                      onClick={startCreate}
                      className="text-xs text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400 hover:underline font-medium"
                    >
                      Create one
                    </button>
                  </>
                )}
              </div>
            )
          ) : (
            /* Project rows */
            filteredProjects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={String(project.id) === String(projectId)}
                onClick={() => navigate(`/workspace/${project.id}`)}
                onEdit={() => setEditProject(project)}
                collapsed={collapsed}
              />
            ))
          )}
        </div>

        {/* ── Footer: project count when expanded ── */}
        {!collapsed && !loading && projects.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200/60 dark:border-white/[0.06] midnight:border-white/[0.05]">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 midnight:text-gray-500">
              {searchQuery && filteredProjects.length !== projects.length
                ? `${filteredProjects.length} of ${projects.length}`
                : `${projects.length} project${projects.length === 1 ? "" : "s"}`
              }
            </p>
          </div>
        )}
      </aside>

      {editProject && (
        <ProjectEditModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onDeleted={() => {
            setEditProject(null);
            if (String(editProject.id) === String(projectId)) {
              navigate("/workspace");
            }
          }}
        />
      )}
    </>
  );
};

export default ProjectSidebar;
