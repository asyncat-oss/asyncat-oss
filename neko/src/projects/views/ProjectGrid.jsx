import { useState, useMemo } from "react";
import { Grid, List, Search, Plus } from 'lucide-react';
import ProjectCard from "../projectCard/ProjectCard";
import ProjectListView from "./ProjectListView";

// Empty state shown when there are no projects
const EmptyState = ({ workspaceName, onCreateClick }) => (
  <div className="h-full min-h-[420px] flex items-center justify-center">
    <div className="text-center max-w-md mx-auto p-6">
      <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white midnight:text-indigo-100">
        No projects yet
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-indigo-300 mb-6">
        Create your first project in {workspaceName}.
      </p>
      {onCreateClick && (
        <button
          onClick={onCreateClick}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      )}
    </div>
  </div>
);

// Loading skeleton for projects grid
const ProjectSkeleton = ({ viewMode = 'grid' }) => {
  const skeletonCards = Array(6).fill(0);
  
  // List view skeleton
  if (viewMode === 'list') {
    return (
      <div className="h-full bg-white dark:bg-gray-900 midnight:bg-gray-950">
        <div className="p-4 flex justify-end">
          <div className="flex space-x-4">
            <div className="w-24 h-10 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded-lg animate-pulse"></div>
            <div className="w-32 h-10 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded-lg animate-pulse"></div>
          </div>
        </div>

        <div className="p-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-indigo-900/30 overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 midnight:bg-indigo-950/30 px-4 py-3 grid grid-cols-12 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="col-span-2 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded animate-pulse"></div>
              ))}
              <div className="col-span-2 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded animate-pulse"></div>
            </div>
            
            {skeletonCards.map((_, index) => (
              <div key={index} className="border-b border-gray-200 dark:border-gray-700 midnight:border-indigo-900/20 px-4 py-3 grid grid-cols-12 gap-4 animate-pulse">
                <div className="col-span-5 flex items-center gap-2">
                  <div className="flex-shrink-0 w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded-full"></div>
                  <div className="flex-1">
                    <div className="w-3/4 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded mb-2"></div>
                    <div className="w-1/2 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-indigo-950/50 rounded"></div>
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="w-full max-w-24 h-7 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded"></div>
                </div>
                <div className="col-span-2">
                  <div className="w-full max-w-32 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded"></div>
                </div>
                <div className="col-span-2">
                  <div className="w-full max-w-24 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded"></div>
                </div>
                <div className="col-span-1 flex space-x-1">
                  <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded"></div>
                  <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-indigo-900/40 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  // Grid view skeleton (original)
  return (
    <div className="h-full bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="p-4 flex justify-end">
        <div className="w-32 h-10 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse"></div>
      </div>

      <div className="p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {skeletonCards.map((_, index) => (
            <div 
              key={index}
              className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4 h-48 animate-pulse"
            >
              <div className="w-3/4 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-4"></div>
              
              <div className="space-y-2">
                <div className="w-full h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
                <div className="w-5/6 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
                <div className="w-4/6 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
              </div>
              
              <div className="mt-6 flex justify-between">
                <div className="flex space-x-1">
                  <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
                  <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
                </div>
                <div className="w-20 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ProjectGrid = ({
  projects,
  loading,
  error,
  selectedProject,
  onOpenProjectDetail,
  onCreateClick,
  viewMode = 'grid',
  onViewModeChange = () => {},
  workspaceName = "Projects",
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return projects.filter(
        p =>
          p.name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    return projects;
  }, [projects, searchQuery]);

  const renderProjectGroup = (projectsList) => {
    if (projectsList.length === 0) return null;
    return viewMode === 'grid' ? (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projectsList.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            isSelected={selectedProject?.id === project.id}
            onOpenDetail={onOpenProjectDetail}
          />
        ))}
      </div>
    ) : (
      <ProjectListView
        projects={projectsList}
        selectedProject={selectedProject}
        onOpenProjectDetail={onOpenProjectDetail}
      />
    );
  };

  if (loading) {
    return <ProjectSkeleton viewMode={viewMode} />;
  }

  if (error) {
    return (
      <div className={`h-[80vh] flex items-center justify-center`}>
        <div className="text-red-600 dark:text-red-400 midnight:text-red-300 max-w-md text-center">
          <h3 className="font-medium mb-2">Oops! Something went wrong</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-indigo-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950 overflow-hidden">
      <div className="max-w-6xl w-full mx-auto p-4 md:p-8 flex flex-col h-full relative z-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
            {workspaceName} Projects
          </h1>
          {onCreateClick && (
            <button
              onClick={onCreateClick}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Project
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-8 flex-shrink-0 relative z-30">
          
          {/* Search bar */}
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/80 midnight:bg-slate-900/80 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-sans"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-gray-700/50">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 px-3 rounded-lg flex items-center justify-center transition-all ${
                  viewMode === 'grid' 
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm font-medium' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
                title="Grid view"
              >
                <Grid className="w-4 h-4 mr-1.5" />
                <span className="text-sm">Grid</span>
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-1.5 px-3 rounded-lg flex items-center justify-center transition-all ${
                  viewMode === 'list' 
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm font-medium' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
                title="List view"
              >
                <List className="w-4 h-4 mr-1.5" />
                <span className="text-sm">List</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-6 pr-2 text-left">
          {filteredProjects.length > 0 ? (
            renderProjectGroup(filteredProjects)
          ) : (
            <EmptyState workspaceName={workspaceName} onCreateClick={onCreateClick} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectGrid;
