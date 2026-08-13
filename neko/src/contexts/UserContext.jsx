import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import apiClient from '../services/apiClient';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState({ name: '', profilePicture: '' });
  const [loading, setLoading] = useState(true);

  const MAIN_URL = import.meta.env.VITE_USER_URL;

  const fetchUserProfile = useCallback(async () => {
    try {
      const response = await apiClient.request(`${MAIN_URL}/api/users/me`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setUser(data.data);
          setProfileData({ name: data.data.name || '', profilePicture: data.data.profile_picture || '' });
        }
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  }, [MAIN_URL]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  const refreshUserData = useCallback(() => fetchUserProfile(), [fetchUserProfile]);

  const contextValue = {
    user,
    loading,
    refreshUserData,
    profileData,
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

UserProvider.propTypes = {
  children: PropTypes.node,
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};

export const useProjectPermissions = () => ({});
export const useTeamPermissions = () => ({});
