import { useNavigate, useLocation } from 'react-router-dom';
import { useCallback } from 'react';

export const useAppNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Get current page from pathname
  const getCurrentPage = useCallback(() => {
    const pathParts = location.pathname.split('/');
    return pathParts[2] || 'home';
  }, [location.pathname]);

  // Get current project ID from pathname
  const getCurrentProjectId = useCallback(() => {
    const pathParts = location.pathname.split('/');
    if (pathParts[2] === 'projects' && pathParts[3]) {
      return pathParts[3];
    }
    return null;
  }, [location.pathname]);

  // Navigation functions
  const navigateToHome = useCallback(() => {
    navigate('/home');
  }, [navigate]);

  const navigateToProjects = useCallback(() => {
    navigate('/projects');
  }, [navigate]);

  const navigateToProject = useCallback((projectId, tab = null) => {
    if (tab) {
      navigate(`/projects/${projectId}/${tab}`);
    } else {
      navigate(`/projects/${projectId}`);
    }
  }, [navigate]);


  const navigateToCalendar = useCallback(() => {
    navigate('/calendar');
  }, [navigate]);

  const navigateToTeams = useCallback(() => {
    navigate('/teams');
  }, [navigate]);

  // Generic navigation function for backward compatibility
  const navigateTo = useCallback((page, options = {}) => {
    switch (page) {
      case 'home':
        navigateToHome();
        break;
      case 'projects':
        navigateToProjects();
        break;
      case 'calendar':
        navigateToCalendar();
        break;
      case 'teams':
        navigateToTeams();
        break;
      case 'notes':
        if (options.noteId && options.projectId) {
          navigate(`/app/projects/${options.projectId}/notes?noteId=${options.noteId}`);
        }
        break;
      default:
        navigate(`/app/${page}`);
    }
  }, [navigate, navigateToHome, navigateToProjects, navigateToCalendar, navigateToTeams]);

  return {
    // Current state
    currentPage: getCurrentPage(),
    currentProjectId: getCurrentProjectId(),
    
    // Navigation functions
    navigateToHome,
    navigateToProjects,
    navigateToProject,
    navigateToCalendar,
    navigateToTeams,
    navigateTo,
    
    // Raw navigate function for custom use
    navigate
  };
};

export default useAppNavigation;
