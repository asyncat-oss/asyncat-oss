// useNotesPresence.js - Back to original working structure with minimal additions
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../auth/supabaseClient'; // Use the same client as auth

// Generate a unique user color based on user ID
const generateUserColor = (userId) => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
  ];
  
  // Create a simple hash from userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff;
  }
  
  return colors[Math.abs(hash) % colors.length];
};

export const useNotesPresence = (noteId, userInfo = null, isActive = true, onContentUpdate = null) => {
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blockLocks, setBlockLocks] = useState({}); // NEW: Track which blocks are locked
  
  const channelRef = useRef(null);
  const isTrackingRef = useRef(false);
  const currentNoteId = useRef(noteId);
  const lastPresenceUpdate = useRef(0);

  // Process presence state from Supabase - UPDATED to include current user
  const processPresenceState = useCallback((presenceState) => {
    const allCollaborators = [];
    const newBlockLocks = {}; // Track locks

    Object.keys(presenceState).forEach(key => {
      const presences = presenceState[key];
      if (presences && presences.length > 0) {
        const latestPresence = presences[presences.length - 1];
        const presenceUserId = latestPresence.user_id || latestPresence.userId;

        if (latestPresence && presenceUserId) {
          const collaborator = {
            userId: presenceUserId,
            name: latestPresence.name || latestPresence.email?.split('@')[0] || 'Unknown User',
            email: latestPresence.email || '',
            profilePicture: latestPresence.profile_picture || null,
            color: generateUserColor(presenceUserId),
            cursor: latestPresence.cursor,
            activeBlock: latestPresence.active_block,
            selection: latestPresence.selection,
            isTyping: latestPresence.is_typing,
            lastSeen: latestPresence.last_seen,
            joinedAt: latestPresence.joined_at,
            isEditing: latestPresence.is_editing,
            editingBlock: latestPresence.editing_block,
            isCurrentUser: latestPresence.is_current_user || false
          };

          allCollaborators.push(collaborator);

          // Track block locks (excluding current user's locks from blocking themselves)
          const currentUserId = userInfo?.userId || userInfo?.user_id;
          if (collaborator.isEditing && collaborator.editingBlock && presenceUserId !== currentUserId) {
            newBlockLocks[collaborator.editingBlock] = {
              userId: presenceUserId,
              userName: latestPresence.name,
              color: collaborator.color,
              timestamp: Date.now()
            };
          }
        }
      }
    });

    // Sort collaborators - current user first, then by join time
    allCollaborators.sort((a, b) => {
      if (a.isCurrentUser && !b.isCurrentUser) return -1;
      if (!a.isCurrentUser && b.isCurrentUser) return 1;
      return new Date(a.joinedAt) - new Date(b.joinedAt);
    });

    setCollaborators(allCollaborators);
    setBlockLocks(newBlockLocks);
    return allCollaborators;
  }, [userInfo]);

  // Update presence with cursor/block information - OPTIMIZED for real-time updates
  const updatePresence = useCallback(async (presenceData) => {
    if (!channelRef.current || !isTrackingRef.current || !userInfo) return;

    // Throttle presence updates - less aggressive for real-time feel
    const now = Date.now();
    if (now - lastPresenceUpdate.current < 50) return; // Max 20 updates per second for smooth cursor tracking
    lastPresenceUpdate.current = now;

    const fullPresenceData = {
      user_id: userInfo.userId || userInfo.user_id,
      userId: userInfo.userId || userInfo.user_id,
      name: userInfo.name,
      email: userInfo.email,
      profile_picture: userInfo.profile_picture,
      is_current_user: true,
      last_seen: new Date().toISOString(),
      joined_at: new Date().toISOString(),
      ...presenceData
    };

    try {
      await channelRef.current.track(fullPresenceData);
    } catch (err) {
      console.warn('Presence update failed:', err);
    }
  }, [userInfo]);

  // NEW: Block locking functions - minimal implementation
  const startEditingBlock = useCallback(async (blockId) => {
    if (!blockId) return false;
    
    const existingLock = blockLocks[blockId];
    if (existingLock && existingLock.userId !== userInfo?.userId) {
      return false;
    }
    
    await updatePresence({
      is_editing: true,
      editing_block: blockId,
      active_block: blockId
    });
    
    return true;
  }, [blockLocks, updatePresence, userInfo]);

  const stopEditingBlock = useCallback(async () => {
    await updatePresence({
      is_editing: false,
      editing_block: null
    });
  }, [updatePresence]);

  const isBlockLocked = useCallback((blockId) => {
    const lock = blockLocks[blockId];
    if (!lock) return false;
    
    // Check if lock is stale (older than 30 seconds)
    const now = Date.now();
    const lockAge = now - lock.timestamp;
    if (lockAge > 30000) {
      return false;
    }
    
    return lock.userId !== userInfo?.userId;
  }, [blockLocks, userInfo]);

  // NEW: Content broadcasting - minimal implementation
  const broadcastContentChange = useCallback(async (changeset) => {
    if (!channelRef.current || !userInfo) return;
    
    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'content_update',
        payload: {
          type: 'content_change',
          userId: userInfo.userId || userInfo.user_id,
          userName: userInfo.name,
          changeset,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      // Silently fail to avoid exposing connection details
    }
  }, [userInfo]);

  // ORIGINAL tracking functions - unchanged
  const trackCursor = useCallback((blockId, cursorPosition) => {
    // Fast cursor tracking for real-time collaboration feel
    updatePresence({
      cursor: {
        blockId,
        position: cursorPosition,
        timestamp: Date.now()
      },
      active_block: blockId,
      is_typing: false,
      last_seen: new Date().toISOString()
    });
  }, [updatePresence]);

  const trackSelection = useCallback((blockId, startOffset, endOffset) => {
    updatePresence({
      selection: {
        blockId,
        startOffset,
        endOffset,
        timestamp: Date.now()
      },
      active_block: blockId,
      is_typing: false,
      last_seen: new Date().toISOString()
    });
  }, [updatePresence]);

  const trackTyping = useCallback((blockId, isTyping) => {
    // Immediate update for typing status to feel responsive
    updatePresence({
      active_block: blockId,
      is_typing: isTyping,
      typing_timestamp: Date.now(),
      last_seen: new Date().toISOString()
    });
  }, [updatePresence]);

  const trackActiveBlock = useCallback((blockId) => {
    updatePresence({
      active_block: blockId,
      is_typing: false
    });
  }, [updatePresence]);

  // ORIGINAL join presence - with minimal broadcast addition
  const joinPresence = useCallback(async () => {
    if (!noteId || !isActive || isTrackingRef.current || !userInfo) return;

    try {
      setError(null);
      
      // Use the shared supabase client instead of creating a new one
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      // Create channel for this note
      const channelName = `note-collaboration-${noteId}`;
      const channel = supabase.channel(channelName, {
        config: {
          presence: {
            key: userInfo.userId || userInfo.user_id || 'anonymous'
          }
        }
      });

      // Set up presence event handlers - OPTIMIZED for real-time sync
      channel
        .on('presence', { event: 'sync' }, () => {
          const presenceState = channel.presenceState();
          processPresenceState(presenceState);
          setLoading(false);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          // Immediately sync on new user join for instant updates
          const presenceState = channel.presenceState();
          processPresenceState(presenceState);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          // Clear locks when user leaves
          setBlockLocks(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(blockId => {
              if (updated[blockId]?.userId === key) {
                delete updated[blockId];
              }
            });
            return updated;
          });
          // Immediately sync on user leave
          const presenceState = channel.presenceState();
          processPresenceState(presenceState);
        })
        // NEW: Listen for content updates
        .on('broadcast', { event: 'content_update' }, ({ payload }) => {
          if (onContentUpdate && payload.changeset) {
            onContentUpdate(payload.changeset, payload.userId);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Track initial presence with NEW fields
            const initialPresenceData = {
              user_id: userInfo.userId || userInfo.user_id,
              userId: userInfo.userId || userInfo.user_id,
              name: userInfo.name,
              email: userInfo.email,
              profile_picture: userInfo.profile_picture,
              is_current_user: true,
              joined_at: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              active_block: null,
              cursor: null,
              selection: null,
              is_typing: false,
              is_editing: false,
              editing_block: null
            };
            
            const trackStatus = await channel.track(initialPresenceData);
            if (trackStatus === 'ok') {
              isTrackingRef.current = true;
              // Connection successful
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setError('Collaboration unavailable');
            setLoading(false);
          }
        });

      channelRef.current = channel;
      
    } catch (err) {
      setError('Collaboration unavailable');
      setLoading(false);
    }
  }, [noteId, isActive, userInfo, processPresenceState, onContentUpdate]);

  // ORIGINAL leave presence - unchanged
  const leavePresence = useCallback(async () => {
    if (!isTrackingRef.current && !channelRef.current) return;

    try {
      const channel = channelRef.current;
      if (channel) {
        await channel.untrack();
        // Use the shared supabase client
        if (supabase) {
          supabase.removeChannel(channel);
        }
      }
      
      channelRef.current = null;
      isTrackingRef.current = false;
      setCollaborators([]);
      setBlockLocks([]); // NEW: Clear block locks
      
    } catch (err) {
      channelRef.current = null;
      isTrackingRef.current = false;
    }
  }, []);

  // ORIGINAL effects - exactly the same
  useEffect(() => {
    if (currentNoteId.current !== noteId) {
      if (currentNoteId.current) {
        leavePresence();
      }
      currentNoteId.current = noteId;
      setLoading(true);
      setCollaborators([]);
      setBlockLocks({}); // NEW: Reset locks
    }
  }, [noteId, leavePresence]);

  useEffect(() => {
    if (isActive && noteId && userInfo) {
      joinPresence();
    } else {
      leavePresence();
    }
  }, [noteId, isActive, userInfo, joinPresence, leavePresence]);

  useEffect(() => {
    return () => {
      leavePresence();
    };
  }, [leavePresence]);

  // ORIGINAL auto-clear typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      setCollaborators(prev => prev.map(collaborator => {
        if (collaborator.isTyping && collaborator.typing_timestamp) {
          const timeSinceTyping = Date.now() - collaborator.typing_timestamp;
          if (timeSinceTyping > 2000) { // Clear typing after 2 seconds
            return { ...collaborator, isTyping: false };
          }
        }
        return collaborator;
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // NEW: Auto-clear stale locks
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setBlockLocks(prev => {
        const updated = { ...prev };
        let hasChanges = false;
        
        Object.keys(updated).forEach(blockId => {
          const lock = updated[blockId];
          if (now - lock.timestamp > 30000) {
            delete updated[blockId];
            hasChanges = true;
          }
        });
        
        return hasChanges ? updated : prev;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return {
    collaborators,
    loading,
    error,
    isConnected: isTrackingRef.current,
    blockLocks, // NEW
    
    // ORIGINAL tracking functions
    trackCursor,
    trackSelection,
    trackTyping,
    trackActiveBlock,
    updatePresence,
    
    // NEW: Block locking functions
    startEditingBlock,
    stopEditingBlock,
    isBlockLocked,
    getBlockLockInfo: useCallback((blockId) => blockLocks[blockId] || null, [blockLocks]),
    
    // NEW: Content broadcasting
    broadcastContentChange,
    
    // ORIGINAL connection management
    joinCollaboration: joinPresence,
    leaveCollaboration: leavePresence
  };
};