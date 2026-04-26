import { useState, useMemo, useEffect } from "react";
import { Grid, List, Star, Filter, ChevronDown, Search, Folder, FolderOpen } from 'lucide-react';
import ProjectCard from "../projectCard/ProjectCard";
import ProjectListView from "./ProjectListView";

// Empty state shown when there are no projects
const EmptyState = ({ workspaceName }) => (
  <div className="h-[80vh] flex items-center justify-center">
    <div className="text-center max-w-md mx-auto p-6">
      <h2 className="text-xl font-bold mb-2 dark:text-white midnight:text-indigo-100">
        Every great idea starts with a first project in {workspaceName}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 midnight:text-indigo-300 mb-6">
        Take the leap—create something amazing and let your journey begin!
      </p>
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
  projectFolders = [],
  loading,
  error,
  selectedProject,
  onOpenProjectDetail,
  onCreateClick,
  onProjectDelete,
  onProjectUpdate,
  viewMode = 'grid',
  onViewModeChange = () => {},
  workspaceName = "Projects",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [starFilter, setStarFilter] = useState("all");
  const [showStarFilterDropdown, setShowStarFilterDropdown] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});

  useEffect(() => {
    // Initialize expandedFolders when projectFolders are loaded
    if (projectFolders && projectFolders.length > 0) {
      setExpandedFolders(prev => {
        const next = { ...prev };
        let changed = false;
        projectFolders.forEach(f => {
          if (next[f.id] === undefined) {
            next[f.id] = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [projectFolders]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const filteredProjects = useMemo(() => {
    let filtered = projects;

    if (starFilter === "starred") {
      filtered = filtered.filter(p => p.starred);
    } else if (starFilter === "unstarred") {
      filtered = filtered.filter(p => !p.starred);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [projects, searchQuery, starFilter]);

  const starredCount = useMemo(() => projects.filter(p => p.starred).length, [projects]);

  const { folderMap, unfiledProjects } = useMemo(() => {
    const map = {};
    const projectFolderLookup = {};
    
    // Initialize map with empty arrays for every folder
    projectFolders.forEach(f => {
      map[f.id] = [];
      // Record which folder each project belongs to
      (f.project_folder_items || []).forEach(item => {
        projectFolderLookup[item.project_id] = f.id;
      });
    });

    const unfiled = [];
    filteredProjects.forEach(p => {
      const folderId = projectFolderLookup[p.id];
      if (folderId && map[folderId]) {
        map[folderId].push(p);
      } else {
        unfiled.push(p);
      }
    });

    return { folderMap: map, unfiledProjects: unfiled };
  }, [filteredProjects, projectFolders]);
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
          <h1 className="text-2xl font-serif text-gray-900 dark:text-white midnight:text-slate-100">
            {workspaceName} Projects
          </h1>
        </div>

        {/* Toolbar: Search & Filters */}
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
            {/* Star Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowStarFilterDropdown(!showStarFilterDropdown)}
                className={`flex items-center justify-between gap-2 px-4 py-2.5 min-w-[130px] rounded-xl transition-all border shadow-sm ${
                  starFilter !== "all"
                    ? 'bg-yellow-50 dark:bg-yellow-900/30 midnight:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 midnight:text-yellow-300 border-yellow-200 dark:border-yellow-800/50'
                    : 'bg-white dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Star className={`w-4 h-4 ${starFilter === "starred" ? 'fill-current' : 'text-gray-400'}`} />
                  <span className="text-sm font-medium">
                    {starFilter === "all" ? "All" : starFilter === "starred" ? "Starred" : "Unstarred"}
                  </span>
                </div>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              
              {showStarFilterDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowStarFilterDropdown(false)}
                  />
                  <div className="absolute top-full right-0 mt-1.5 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden py-1">
                    <button
                      onClick={() => { setStarFilter("all"); setShowStarFilterDropdown(false); }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        starFilter === "all" ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <Filter className="w-4 h-4 text-gray-400" />
                      <span className="flex-1 font-medium">All Projects</span>
                      <span className="text-xs text-gray-400">{projects.length}</span>
                    </button>
                    <button
                      onClick={() => { setStarFilter("starred"); setShowStarFilterDropdown(false); }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        starFilter === "starred" ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      <span className="flex-1 font-medium">Starred</span>
                      <span className="text-xs text-gray-400">{starredCount}</span>
                    </button>
                    <button
                      onClick={() => { setStarFilter("unstarred"); setShowStarFilterDropdown(false); }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        starFilter === "unstarred" ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <Star className="w-4 h-4 text-gray-400" />
                      <span className="flex-1 font-medium">Unstarred</span>
                      <span className="text-xs text-gray-400">{projects.length - starredCount}</span>
                    </button>
                  </div>
                </>
              )}
            </div>

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
            <div className="space-y-6">
              {projectFolders.map(folder => {
                const folderProjects = folderMap[folder.id] || [];
                if (folderProjects.length === 0) return null;
                const isExpanded = expandedFolders[folder.id];
                
                return (
                  <div key={folder.id} className="mb-8">
                    <button 
                      onClick={() => toggleFolder(folder.id)}
                      className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {isExpanded ? <FolderOpen className="w-5 h-5 text-indigo-500" /> : <Folder className="w-5 h-5 text-indigo-500" />}
                      <span className="text-base">{folder.name}</span>
                      <span className="text-xs font-normal text-gray-400">({folderProjects.length})</span>
                    </button>
                    {isExpanded && renderProjectGroup(folderProjects)}
                  </div>
                );
              })}

              {unfiledProjects.length > 0 && (
                <div className="mb-6">
                  {projectFolders.length > 0 && (
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 px-1">
                      Unfiled
                    </h3>
                  )}
                  {renderProjectGroup(unfiledProjects)}
                </div>
              )}
            </div>
          ) : (
            <EmptyState workspaceName={workspaceName} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectGrid;