import { Calendar, Star, LayoutGrid, CheckCircle } from 'lucide-react';

const soraFontBase = "font-sora";

export const ProjectListSkeleton = () => {
  const skeletonRows = Array(6).fill(0);

  return (
    <div className={`${soraFontBase} animate-pulse`}>
      {skeletonRows.map((_, index) => (
        <div key={index} className="flex items-center py-4 px-6 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/20">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="w-48 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
              <div className="w-64 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm">
            <div className="w-20 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ProjectListView = ({
  projects,
  selectedProject,
  onOpenProjectDetail,
  loading = false,
}) => {
  if (loading) return <ProjectListSkeleton />;

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 mx-auto mb-3 opacity-40">
          <LayoutGrid className="w-full h-full text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 midnight:text-indigo-300">No projects to display</p>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className={`${soraFontBase}`}>
      {/* Table Header */}
      <div className="flex items-center py-3 px-6 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-indigo-300 bg-gray-50/30 dark:bg-gray-800/20 midnight:bg-gray-900/10 border-b border-gray-200/30 dark:border-gray-700/20 midnight:border-gray-800/15">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-1"></div>
          <div className="w-8"></div>
          <div className="flex-1">Name</div>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs">
          <div className="w-24">Due Date</div>
        </div>
      </div>

      {/* Project Rows */}
      <div className="divide-y divide-gray-100/50 dark:divide-gray-700/30 midnight:divide-gray-800/20">
        {projects.map((project) => (
          <div
            key={project.id}
            className={`group flex items-center py-4 px-6 cursor-pointer transition-all duration-200 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/20 ${
              selectedProject?.id === project.id
                ? 'bg-gray-50/70 dark:bg-gray-800/40 midnight:bg-gray-900/25'
                : ''
            }`}
            onClick={() => onOpenProjectDetail(project)}
          >
            {/* Left side */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {selectedProject?.id === project.id && (
                <div className="w-1 h-8 bg-indigo-500 dark:bg-indigo-400 midnight:bg-indigo-300 rounded-full flex-shrink-0"></div>
              )}
              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-lg">
                <span role="img" aria-label="Project icon">{project.emoji || '📁'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {project.starred && (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-400 flex-shrink-0" />
                  )}
                  <h3 className="font-medium text-gray-900 dark:text-white midnight:text-indigo-50 truncate">
                    {project.name || 'Untitled Project'}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-indigo-300 truncate">
                  {project.description || 'No description provided'}
                </p>
              </div>
            </div>

            {/* Right side (desktop) */}
            <div className="hidden md:flex items-center gap-8 text-sm">
              <div className="w-24 flex items-center gap-1.5 text-gray-600 dark:text-gray-300 midnight:text-indigo-200">
                <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
                <span className="truncate">{formatDate(project.due_date)}</span>
              </div>
            </div>

            {/* Mobile: selected indicator */}
            <div className="md:hidden flex items-center">
              <CheckCircle className={`w-4 h-4 ${selectedProject?.id === project.id ? 'text-indigo-500 dark:text-indigo-400' : 'text-transparent'}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectListView;
