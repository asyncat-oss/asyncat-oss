// useProjectPresence.js - Updated to use Supabase Realtime Presence
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../auth/tokenStore';

// Fallback local presence tracking for when Supabase isn't available
const LOCAL_PRESENCE_KEY = 'asyncat_project_presence';
const getLocalPresence = () => {
  try {
    const stored = localStorage.getItem(LOCAL_PRESENCE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const setLocalPresence = (projectId, userInfo, currentTab = 'kanban') => {
  try {
    const presence = getLocalPresence();
    const timestamp = Date.now();
    
    if (userInfo) {
      presence[projectId] = {
        userId: userInfo.userId || `local_${Math.random().toString(36).substr(2, 9)}`,
        name: userInfo.name || 'You',
        email: userInfo.email,
        profile_picture: userInfo.profile_picture,
        current_tab: currentTab, // NEW: Track current tab in fallback too
        timestamp,
        is_current_user: true
      };
    } else {
      delete presence[projectId];
    }
    
    localStorage.setItem(LOCAL_PRESENCE_KEY, JSON.stringify(presence));
  } catch (err) {
    // Silently fail to avoid exposing sensitive details
  }
};

export const useProjectPresence = (projectId, currentTab = null, isActive = true, userInfo = null) => {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  
  const channelRef = useRef(null);
  const isTrackingRef = useRef(false);
  const currentProjectId = useRef(projectId);

  // Format user data for presence tracking
  const formatUserPresence = useCallback((user, isCurrentUser = false) => {
    return {
      user_id: user.user_id || user.userId,
      name: user.name || user.email?.split('@')[0] || 'Unknown User',
      email: user.email,
      profile_picture: user.profile_picture,
      current_tab: user.current_tab || 'kanban', // NEW: Include current view
      joined_at: user.joined_at || new Date().toISOString(),
      last_seen: user.last_seen || new Date().toISOString(),
      is_current_user: isCurrentUser
    };
  }, []);

  // Process presence state from Supabase
  const processPresenceState = useCallback((presenceState) => {
    const allViewers = [];
    
    // presenceState is an object where keys are presence keys and values are arrays of presence data
    Object.keys(presenceState).forEach(key => {
      const presences = presenceState[key];
      if (presences && presences.length > 0) {
        // Take the latest presence data for this key
        const latestPresence = presences[presences.length - 1];
        if (latestPresence) {
          allViewers.push(formatUserPresence(latestPresence, latestPresence.is_current_user));
        }
      }
    });
    
    return allViewers;
  }, [formatUserPresence]);

  // Join presence channel
  const joinPresence = useCallback(async () => {
    if (!projectId || !isActive || isTrackingRef.current || !userInfo) return;

    try {
      setError(null);
      setUsingFallback(false);
      
      // Use the shared supabase client instead of creating a new one
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      // Create channel for this project
      const channelName = `project-presence-${projectId}`;
      const channel = supabase.channel(channelName, {
        config: {
          presence: {
            key: userInfo.userId || userInfo.user_id || 'anonymous'
          }
        }
      });

      // Set up presence event handlers
      channel
        .on('presence', { event: 'sync' }, () => {
          const presenceState = channel.presenceState();
          const processedViewers = processPresenceState(presenceState);
          setViewers(processedViewers);
          setLoading(false);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          // User joined — handled by sync
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          // User left — handled by sync
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Subscribed to presence for project
            // Track our presence with current view information
            const presenceData = {
              user_id: userInfo.userId || userInfo.user_id,
              userId: userInfo.userId || userInfo.user_id, // Backwards compatibility
              name: userInfo.name,
              email: userInfo.email,
              profile_picture: userInfo.profile_picture,
              current_tab: currentTab || 'kanban', // NEW: Track which view they're on
              joined_at: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              is_current_user: true
            };
            
            const trackStatus = await channel.track(presenceData);
            if (trackStatus === 'ok') {
              isTrackingRef.current = true;
              // Connection successful
            } else {
              // Failed to track presence
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setError('Connection failed, using offline mode');
            setUsingFallback(true);
            setLocalPresence(projectId, userInfo);
            setLoading(false);
          }
        });

      channelRef.current = channel;
      
    } catch (err) {
      setError('Using offline mode');
      setUsingFallback(true);
      setLocalPresence(projectId, userInfo);
      
      // Set fallback data
      const fallbackViewers = [{
        user_id: userInfo.userId || userInfo.user_id,
        name: userInfo.name || 'You',
        email: userInfo.email,
        profile_picture: userInfo.profile_picture,
        current_tab: currentTab || 'kanban',
        joined_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        is_current_user: true
      }];
      setViewers(fallbackViewers);
      setLoading(false);
    }
  }, [projectId, isActive, userInfo, processPresenceState]);

  // Leave presence channel
  const leavePresence = useCallback(async () => {
    if (!isTrackingRef.current && !channelRef.current) return;

    try {
      const channel = channelRef.current;
      if (channel && !usingFallback) {
        await channel.untrack();
        // Use the shared supabase client
        if (supabase) {
          supabase.removeChannel(channel);
        }
      }
      
      if (usingFallback) {
        setLocalPresence(projectId, null);
      }
      
      channelRef.current = null;
      isTrackingRef.current = false;
      setViewers([]);
      setUsingFallback(false);
      
    } catch (err) {
      // Clean up fallback data anyway
      setLocalPresence(projectId, null, currentTab);
      channelRef.current = null;
      isTrackingRef.current = false;
    }
  }, [projectId, usingFallback]);

  // Handle fallback mode
  useEffect(() => {
    if (usingFallback && projectId) {
      const localPresence = getLocalPresence();
      const projectPresence = localPresence[projectId];
      if (projectPresence) {
        setViewers([{
          user_id: projectPresence.userId,
          name: projectPresence.name,
          email: projectPresence.email,
          profile_picture: projectPresence.profile_picture,
          current_tab: projectPresence.current_tab || currentTab,
          joined_at: new Date(projectPresence.timestamp).toISOString(),
          last_seen: new Date(projectPresence.timestamp).toISOString(),
          is_current_user: true
        }]);
      } else {
        setViewers([]);
      }
    }
  }, [usingFallback, projectId]);

  // Handle project changes
  useEffect(() => {
    if (currentProjectId.current !== projectId) {
      // Project changed, clean up old presence
      if (currentProjectId.current) {
        leavePresence();
      }
      currentProjectId.current = projectId;
      setLoading(true);
      setViewers([]);
    }
  }, [projectId, leavePresence]);

  // Update presence when tab changes
  // Only track presence if tab actually changes
  const lastTabRef = useRef(currentTab);
  useEffect(() => {
    if (
      channelRef.current &&
      isTrackingRef.current &&
      currentTab &&
      lastTabRef.current !== currentTab
    ) {
      const updatedPresenceData = {
        user_id: userInfo?.userId || userInfo?.user_id,
        userId: userInfo?.userId || userInfo?.user_id,
        name: userInfo?.name,
        email: userInfo?.email,
        profile_picture: userInfo?.profile_picture,
        current_tab: currentTab,
        joined_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        is_current_user: true
      };
      // Track presence due to tab change
      channelRef.current.track(updatedPresenceData);
      lastTabRef.current = currentTab;
    }
  }, [currentTab, userInfo]);

  // Join/leave based on isActive flag
  useEffect(() => {
    if (isActive && projectId && userInfo) {
      joinPresence();
    } else {
      leavePresence();
    }
  }, [projectId, isActive, userInfo, joinPresence, leavePresence]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - presence will be automatically paused
      } else {
        // Page is visible again - presence will be automatically rejoined
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leavePresence();
    };
  }, [leavePresence]);

  // Get viewers excluding current user
  const otherViewers = viewers.filter(viewer => !viewer.is_current_user);
  
  // Get current user from viewers
  const currentUserViewing = viewers.find(viewer => viewer.is_current_user);

  // Manual refresh function (for compatibility)
  const refreshViewers = useCallback(() => {
    if (channelRef.current && !usingFallback) {
      // For Supabase Presence, we can just sync the current state
      const presenceState = channelRef.current.presenceState();
      const processedViewers = processPresenceState(presenceState);
      setViewers(processedViewers);
    } else if (usingFallback) {
      // For fallback mode, refresh from localStorage
      const localPresence = getLocalPresence();
      const projectPresence = localPresence[projectId];
      if (projectPresence) {
        setViewers([{
          user_id: projectPresence.userId,
          name: projectPresence.name,
          email: projectPresence.email,
          profile_picture: projectPresence.profile_picture,
          current_tab: projectPresence.current_tab || currentTab,
          joined_at: new Date(projectPresence.timestamp).toISOString(),
          last_seen: new Date(projectPresence.timestamp).toISOString(),
          is_current_user: true
        }]);
      } else {
        setViewers([]);
      }
    }
  }, [projectId, usingFallback, processPresenceState]);

  return {
    viewers,
    otherViewers,
    currentUserViewing,
    totalViewers: viewers.length,
    loading,
    error,
    usingFallback,
    refreshViewers,
    joinViewing: joinPresence,    // For compatibility
    leaveViewing: leavePresence,  // For compatibility
  };
};