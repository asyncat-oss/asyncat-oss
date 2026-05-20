import { useState, useMemo } from "react";
import { Search, Plus } from "lucide-react";
import ProjectCard from "../projectCard/ProjectCard";

const EmptyState = ({ onCreateClick }) => (
  <div className="h-full min-h-[360px] flex items-center justify-center">
    <div className="text-center max-w-sm mx-auto p-6">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 flex items-center justify-center text-2xl">
        📁
      </div>
      <h2 className="text-lg font-semibold mb-1.5 text-gray-900 dark:text-white midnight:text-slate-100">
        No projects yet
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 mb-6">
        Create a project to start organizing your tasks.
      </p>
      {onCreateClick && (
        <button
          onClick={onCreateClick}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      )}
    </div>
  </div>
);

const ProjectSkeleton = () => (
  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
    {Array(6).fill(0).map((_, i) => (
      <div
        key={i}
        className="border border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30 rounded-2xl p-6 h-44 animate-pulse bg-white/70 dark:bg-gray-800/50 midnight:bg-slate-800/50"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-lg" />
          <div className="w-1/2 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded" />
        </div>
        <div className="space-y-2 mb-4">
          <div className="w-full h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-700/50 rounded" />
          <div className="w-4/5 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-700/50 rounded" />
        </div>
        <div className="w-28 h-3 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-700/50 rounded mt-auto" />
      </div>
    ))}
  </div>
);

const ProjectGrid = ({
  projects,
  loading,
  error,
  selectedProject,
  onOpenProjectDetail,
  onCreateClick,
  workspaceName = "Projects",
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950 overflow-hidden">
      <div className="max-w-5xl w-full mx-auto p-6 md:p-8 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
            {workspaceName}
          </h1>
          {onCreateClick && (
            <button
              onClick={onCreateClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Project
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-6 flex-shrink-0 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-900/60 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto pb-6">
          {loading ? (
            <ProjectSkeleton />
          ) : filteredProjects.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={selectedProject?.id === project.id}
                  onOpenDetail={onOpenProjectDetail}
                />
              ))}
            </div>
          ) : (
            <EmptyState onCreateClick={onCreateClick} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectGrid;
