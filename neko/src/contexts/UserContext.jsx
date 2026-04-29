import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

const UserContext = createContext();

export const UserProvider = ({ children, session }) => {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState({ name: '', profilePicture: '' });
  const [loading, setLoading] = useState(true);

  const MAIN_URL = import.meta.env.VITE_USER_URL;

  useEffect(() => {
    if (session?.user) {
      setUser(session.user);
      fetchUserProfile();
    } else {
      setUser(null);
      setLoading(false);
    }
  }, [session]);

  const fetchUserProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const response = await authService.authenticatedFetch(`${MAIN_URL}/api/users/me`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setProfileData({ name: data.data.name || '', profilePicture: data.data.profile_picture || '' });
        }
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      if (session?.user) {
        setProfileData({ name: session.user.name || '', profilePicture: session.user.profile_picture || session.user.user_metadata?.profile_picture || '' });
      }
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, MAIN_URL]);

  const refreshUserData = useCallback(() => {
    if (session?.user) fetchUserProfile();
  }, [session?.user, fetchUserProfile]);

  const contextValue = {
    user,
    loading,
    refreshUserData,
    isAuthenticated: !!user,
    userId: user?.id,
    userEmail: user?.email,
    userName: profileData.name || user?.email?.split('@')[0] || 'User',
    userProfilePicture: profileData.profilePicture,
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};

export const useProjectPermissions = () => ({});
export const useTeamPermissions = () => ({});