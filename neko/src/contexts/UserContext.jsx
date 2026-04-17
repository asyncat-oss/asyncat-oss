import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePermissions } from '../utils/permissions';
import authService from '../services/authService';

const UserContext = createContext();

export const UserProvider = ({ children, session }) => {
  const [user, setUser] = useState(null);
  const [userRoles, setUserRoles] = useState({});
  const [userProjects, setUserProjects] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profileData, setProfileData] = useState({ name: '', profilePicture: '' });

  const MAIN_URL = import.meta.env.VITE_USER_URL;

  // Initialize user from session
  useEffect(() => {
    if (session?.user) {
      setUser({
        ...session.user
      });
      // Fetch user roles and projects when session is available
      fetchUserData();
    } else {
      setUser(null);
      setUserRoles({});
      setUserProjects([]);
      setUserTeams([]);
      setLoading(false);
    }
  }, [session]);

  // Fetch user projects, teams, and roles
  const fetchUserData = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch user projects with roles
      const projectsResponse = await authService.authenticatedFetch(`${MAIN_URL}/api/projects`, {
        method: 'GET'
      });

      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        const projects = projectsData.data || [];
        
        setUserProjects(projects);
        
        // Extract roles from projects - prefer `owner_id` on project as single source of truth
        const projectRoles = {};
        projects.forEach(project => {
          // If the project includes `owner_id`, use it to determine ownership
          if (project.owner_id && project.owner_id === session.user.id) {
            projectRoles[`project_${project.id}`] = 'owner';
            return;
          }

          // Next, prefer any explicit `user_role` returned by the API
          if (project.user_role) {
            projectRoles[`project_${project.id}`] = project.user_role;
            return;
          }

          // Finally, fall back to project_members role if available
          if (project.project_members) {
            const userMember = project.project_members.find(
              member => member.user_id === session.user.id
            );
            if (userMember) {
              projectRoles[`project_${project.id}`] = userMember.role;
            }
          }
        });

        setUserRoles(prev => ({ ...prev, ...projectRoles }));
      }

      // Fetch user teams with roles
      try {
        const teamsResponse = await authService.authenticatedFetch(`${MAIN_URL}/api/teams`, {
          method: 'GET'
        });

        if (teamsResponse.ok) {
          const teamsData = await teamsResponse.json();
          const teams = teamsData.data || [];
          
          setUserTeams(teams);
          
          // Extract roles from teams
          const teamRoles = {};
          teams.forEach(team => {
            if (team.user_role) {
              teamRoles[`team_${team.id}`] = team.user_role;
            }
            
            // Also extract from team_members if available
            if (team.team_members) {
              const userMember = team.team_members.find(
                member => member.user_id === session.user.id
              );
              if (userMember) {
                teamRoles[`team_${team.id}`] = userMember.role;
              }
            }
          });
          
          setUserRoles(prev => ({ ...prev, ...teamRoles }));
        }
      } catch (teamError) {
        console.warn('Failed to fetch teams:', teamError);
        // Teams might not be implemented yet, so don't fail the entire operation
      }

    } catch (error) {
      console.error('Failed to fetch user data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, MAIN_URL]);

  // Fetch user profile data from /api/users/me (name, profile picture, etc.)
  const fetchUserProfile = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    try {
      const response = await authService.authenticatedFetch(`${MAIN_URL}/api/users/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch profile data');
      }

      const data = await response.json();

      if (data.success && data.data) {
        setProfileData({
          name: data.data.name || '',
          profilePicture: data.data.profile_picture || '',
        });
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Fallback to session data if profile fetch fails
      if (session?.user) {
        setProfileData({
          name: session.user.name || '',
          profilePicture: session.user.profile_picture || session.user.user_metadata?.profile_picture || '',
        });
      }
    }
  }, [session?.user?.id, MAIN_URL]);

  // Fetch profile data when session is available
  useEffect(() => {
    if (session?.user) {
      fetchUserProfile();
    }
  }, [session?.user?.id, fetchUserProfile]);

  // Refresh user data (useful after role changes, project updates, etc.)
  const refreshUserData = useCallback(() => {
    return fetchUserData();
  }, [fetchUserData]);
  // Get user role for a specific context
  const getUserRole = useCallback((projectId = null, teamId = null) => {
    if (projectId) {
      return userRoles[`project_${projectId}`] || 'guest';
    }
    if (teamId) {
      return userRoles[`team_${teamId}`] || 'member';
    }
    // Default role when no context is specified
    return 'guest';
  }, [userRoles]);

  // Get permissions for a specific context
  const getPermissions = useCallback((projectId = null, teamId = null) => {
    const role = getUserRole(projectId, teamId);
    return usePermissions(role);
  }, [getUserRole]);

  // Check if user has a specific permission in a context
  const hasPermission = useCallback((permission, projectId = null, teamId = null) => {
    const permissions = getPermissions(projectId, teamId);
    return permissions.hasPermission(permission);
  }, [getPermissions]);
  // Check if user is owner of a project/team
  const isOwner = useCallback((projectId = null, teamId = null) => {
    const role = getUserRole(projectId, teamId);
    return role === 'owner';
  }, [getUserRole]);

  // Check if user is member of a project/team
  const isMember = useCallback((projectId = null, teamId = null) => {
    const role = getUserRole(projectId, teamId);
    return role === 'member';
  }, [getUserRole]);

  // Check if user is viewer/guest of a project/team
  const isViewer = useCallback((projectId = null, teamId = null) => {
    const role = getUserRole(projectId, teamId);
    return role === 'viewer' || role === 'guest';
  }, [getUserRole]);

  // Check if user is guest of a project/team
  const isGuest = useCallback((projectId = null, teamId = null) => {
    const role = getUserRole(projectId, teamId);
    return role === 'guest' || role === 'viewer';
  }, [getUserRole]);

  // Update user role for a specific context (after role changes)
  const updateUserRole = useCallback((projectId = null, teamId = null, newRole) => {
    const key = projectId ? `project_${projectId}` : `team_${teamId}`;
    setUserRoles(prev => ({
      ...prev,
      [key]: newRole
    }));
  }, []);

  // Remove user from project/team context
  const removeUserFromContext = useCallback((projectId = null, teamId = null) => {
    const key = projectId ? `project_${projectId}` : `team_${teamId}`;
    setUserRoles(prev => {
      const newRoles = { ...prev };
      delete newRoles[key];
      return newRoles;
    });

    // Also remove from projects/teams arrays
    if (projectId) {
      setUserProjects(prev => prev.filter(p => p.id !== projectId));
    } else if (teamId) {
      setUserTeams(prev => prev.filter(t => t.id !== teamId));
    }
  }, []);

  // Get user projects with specific role
  const getProjectsByRole = useCallback((role) => {
    return userProjects.filter(project => {
      const userRole = getUserRole(project.id);
      return userRole === role;
    });
  }, [userProjects, getUserRole]);

  // Get user teams with specific role
  const getTeamsByRole = useCallback((role) => {
    return userTeams.filter(team => {
      const userRole = getUserRole(null, team.id);
      return userRole === role;
    });
  }, [userTeams, getUserRole]);  // Check if user can perform action on another user (based on role hierarchy)
  const canManageUser = useCallback((targetUserId, projectId = null, teamId = null) => {
    // Only owners can manage users
    const currentRole = getUserRole(projectId, teamId);
    return currentRole === 'owner';
  }, [getUserRole]);

  const contextValue = {
    // User data
    user,
    userRoles,
    userProjects,
    userTeams,
    loading,
    error,

    // Core functions
    getUserRole,
    getPermissions,
    hasPermission,
    refreshUserData,    // Role checks
    isOwner,
    isMember,
    isViewer,
    isGuest,

    // Role management
    updateUserRole,
    removeUserFromContext,

    // Data filtering
    getProjectsByRole,
    getTeamsByRole,    // User management
    canManageUser,

    // Convenience getters
    isAuthenticated: !!user,
    userId: user?.id,
    userEmail: user?.email,
    userName: profileData.name || user?.email?.split('@')[0] || 'User',
    userProfilePicture: profileData.profilePicture,
    // userPlan removed
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

// Custom hook to use the user context
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

// Custom hook for project-specific permissions
export const useProjectPermissions = (projectId) => {
  const { getPermissions } = useUser();
  return getPermissions(projectId);
};

// Custom hook for team-specific permissions
export const useTeamPermissions = (teamId) => {
  const { getPermissions } = useUser();
  return getPermissions(null, teamId);
};