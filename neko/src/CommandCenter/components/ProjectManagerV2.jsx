// ProjectManagerV2.jsx - Clean Minimal Version
import { memo, useState, useEffect } from 'react';
import { Folders, X } from 'lucide-react';
import authService from '../../services/authService';

// Simple hook for project data
const useProjectsData = (projectIds) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!projectIds || projectIds.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const fetchProjectsData = async () => {
      try {
        // Ensure we have a current session/token
        try {
          await authService.getSession();
        } catch (sessionErr) {
          // getSession may fail if not authenticated; rethrow to be handled below
          console.warn('Failed to get session before fetch:', sessionErr);
        }

        const response = await authService.authenticatedFetch(`${import.meta.env.VITE_USER_URL}/api/projects`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }
        
        const result = await response.json();
        const allProjects = result.data || result.projects || result;
        
        if (!Array.isArray(allProjects)) {
          throw new Error('Invalid response format');
        }
        
        // Filter to only requested projects
        const requestedProjects = allProjects
          .filter(project => projectIds.includes(project.id))
          .map(project => ({
            ...project,
            displayName: project.name?.length > 30 ? `${project.name.slice(0, 30)}...` : project.name
          }));
        
        setProjects(requestedProjects);
        setError(null);
        
      } catch (err) {
        console.error('Error fetching project data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectsData();
  }, [projectIds]);

  return { projects, loading, error };
};

// Simple Project Badges Component
export const ProjectBadges = memo(({
  projectIds = [],
  maxDisplay = 3,
  showLabel = true,
  variant = "default",
  onProjectRemove = null // Callback for removing individual projects
}) => {
  const { projects, loading, error } = useProjectsData(projectIds);
  
  if (!projectIds || projectIds.length === 0 || loading || error) {
    return null;
  }

  const displayProjects = projects.slice(0, maxDisplay);
  const remainingCount = projects.length - displayProjects.length;

  const renderProject = (project, index) => {
    const emoji = project.emoji || project.teams?.emoji || '📁';

    return (
      <span
        key={`${project.id}-${index}`}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-700 dark:text-gray-300 midnight:text-slate-300 rounded-md"
        title={project.name}
      >
        <span>{emoji}</span>
        <span className="font-medium truncate max-w-24">
          {project.displayName}
        </span>
        {onProjectRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onProjectRemove(project.id);
            }}
            className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-slate-600 rounded-full p-0.5 transition-colors"
            title={`Remove ${project.name}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showLabel && (
        <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 flex items-center gap-1">
          <Folders className="w-3 h-3" />
          Projects:
        </span>
      )}
      
      <div className="flex flex-wrap items-center gap-1.5">
        {displayProjects.map(renderProject)}
        
        {remainingCount > 0 && (
          <span className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-500 dark:text-gray-400 midnight:text-slate-400 rounded-md">
            +{remainingCount} more
          </span>
        )}
      </div>
    </div>
  );
});

export default { ProjectBadges };