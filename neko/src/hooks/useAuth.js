// hooks/useAuth.js - Hook for local JWT auth
import { useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

const useAuth = () => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;
    
    const initializeAuth = async () => {
      try {
        const session = await authService.getSession();
        if (mounted) {
          setSession(session);
          setUser(session?.user || null);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          // Silently fail to avoid exposing auth details
          setError(err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen to auth state changes
    const unsubscribe = authService.onAuthStateChange((event, session) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user || null);
        setError(null);
        
        // Handle sign out
        if (event === 'SIGNED_OUT') {
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Sign in
  const signIn = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await authService.signIn(email, password);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign up
  const signUp = useCallback(async (email, password, options = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await authService.signUp(email, password, options);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      await authService.signOut();
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update password
  const updatePassword = useCallback(async (password) => {
    setError(null);
    try {
      await authService.updatePassword(password);
    } catch (err) {
      setError(err);
      throw err;
    }
  }, []);

  // API call wrapper using authService's authenticatedFetch
  const apiCall = useCallback(async (url, options = {}) => {
    try {
      const response = await authService.authenticatedFetch(url, options);
      return response.json();
    } catch (err) {
      if (!authService.isNetworkError(err)) {
        setError(err);
      }
      throw err;
    }
  }, []);

  return {
    // Auth state
    session,
    user,
    loading,
    error,
    isAuthenticated: !!session?.user,
    
    // Auth methods
    signIn,
    signUp,
    signOut,
    updatePassword,

    // API methods
    apiCall,
    
    // Direct access to services
    authService: authService
  };
};

export default useAuth;