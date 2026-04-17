// hooks/useRealtimeCards.js - Production ready real-time functionality
import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../auth/supabaseClient'; // Use the same client as auth

export const useRealtimeCards = (projectId, currentUser, onCardUpdate, onColumnUpdate) => {
  const [editingSessions, setEditingSessions] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const channelRef = useRef(null);
  const editingTimeoutRef = useRef({});
  const connectionAttemptRef = useRef(0);

  // Handle card changes from database
  const handleCardChange = useCallback((payload) => {
    const { eventType, new: newCard, old: oldCard } = payload;
    
    // Avoid processing our own changes to prevent loops
    if (newCard?.updatedBy === currentUser?.id && eventType === 'UPDATE') {
      return;
    }

    if (onCardUpdate) {
      onCardUpdate({
        type: eventType.toLowerCase(),
        card: newCard || oldCard,
        oldCard: eventType === 'UPDATE' ? oldCard : null
      });
    }
  }, [currentUser, onCardUpdate]);

  // Handle column changes from database  
  const handleColumnChange = useCallback((payload) => {
    const { eventType, new: newColumn, old: oldColumn } = payload;

    if (onColumnUpdate) {
      onColumnUpdate({
        type: eventType.toLowerCase(),
        column: newColumn || oldColumn,
        oldColumn: eventType === 'UPDATE' ? oldColumn : null
      });
    }
  }, [onColumnUpdate]);

  // Update editing sessions from presence
  const updateEditingSessions = useCallback((presenceState) => {
    const sessions = {};
    
    Object.values(presenceState).forEach(presences => {
      presences.forEach(presence => {
        if (presence.editing_card_id && presence.user_id !== currentUser?.id) {
          sessions[presence.editing_card_id] = {
            userId: presence.user_id,
            userName: presence.name || presence.email?.split('@')[0] || 'Unknown User',
            startedAt: presence.editing_started_at,
            profilePicture: presence.profile_picture
          };
        }
      });
    });

    setEditingSessions(sessions);
  }, [currentUser]);

  // Single connection attempt function
  const attemptConnection = useCallback(async () => {
    if (!projectId || !currentUser || !supabase) {
      return;
    }

    // Prevent multiple simultaneous connection attempts
    connectionAttemptRef.current++;
    const currentAttempt = connectionAttemptRef.current;

    try {
      // Clean up existing channel
      if (channelRef.current) {
        await channelRef.current.unsubscribe();
        channelRef.current = null;
        setIsConnected(false);
      }

      // Fetch column IDs for this project (using kanban schema)
      const { data: columnsData, error: columnsError } = await supabase
        .schema('kanban')
        .from('Columns')
        .select('id')
        .eq('projectId', projectId);
      
      if (columnsError) {
        throw new Error(`Failed to fetch columns: ${columnsError.message}`);
      }

      const columnIds = columnsData?.map(col => col.id) || [];

      // Create channel with unique name
      const channelName = `project_${projectId}`;
      const channel = supabase.channel(channelName, {
        config: {
          presence: { enabled: true },
          broadcast: { ack: false, self: false }
        }
      });

      // Set up error handling first
      let subscriptionSuccessful = false;

      // Add postgres changes listeners if we have columns
      if (columnIds.length > 0) {
        // Listen to Cards changes
        channel.on('postgres_changes', {
          event: '*',
          schema: 'kanban', // Use kanban schema as shown in your schema
          table: 'Cards',
          filter: `columnId=in.(${columnIds.join(',')})`
        }, handleCardChange);

        // Listen to Columns changes  
        channel.on('postgres_changes', {
          event: '*',
          schema: 'kanban',
          table: 'Columns',
          filter: `projectId=eq.${projectId}`
        }, handleColumnChange);
      }

      // Set up presence listeners
      channel.on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        updateEditingSessions(presenceState);
      });

      channel.on('presence', { event: 'join' }, ({ newPresences }) => {
        // Handle user join
      });

      channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach(presence => {
          if (presence.editing_card_id) {
            setEditingSessions(prev => {
              const updated = { ...prev };
              delete updated[presence.editing_card_id];
              return updated;
            });
          }
        });
      });

      // Subscribe with timeout
      const subscribePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Subscription timeout'));
        }, 15000);

        channel.subscribe((status, error) => {
          clearTimeout(timeout);
          if (status === 'SUBSCRIBED') {
            resolve(status);
          } else {
            reject(new Error(error?.message || `Subscription failed with status: ${status}`));
          }
        });
      });

      const status = await subscribePromise;
      
      // Verify this is still the current attempt (avoid race conditions)
      if (currentAttempt !== connectionAttemptRef.current) {
        await channel.unsubscribe();
        return;
      }

      if (status === 'SUBSCRIBED') {
        channelRef.current = channel;
        setIsConnected(true);
        setConnectionError(null);
        subscriptionSuccessful = true;
      }

    } catch (error) {
      // Only update state if this is still the current attempt
      if (currentAttempt === connectionAttemptRef.current) {
        setConnectionError(error.message);
        setIsConnected(false);
      }
    }
  }, [projectId, currentUser, handleCardChange, handleColumnChange, updateEditingSessions]);

  // Set up connection with debouncing
  useEffect(() => {
    if (!projectId || !currentUser) {
      return;
    }

    // Reset connection state
    setIsConnected(false);
    setConnectionError(null);

    // Debounce connection attempts
    const timer = setTimeout(() => {
      attemptConnection();
    }, 1000);

    return () => {
      clearTimeout(timer);
      
      // Clean up on unmount or dependency change
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [projectId, currentUser?.id]); // Only depend on user ID, not full user object

  // Start editing a card (acquire lock)
  const startEditingCard = useCallback(async (cardId) => {
    if (!channelRef.current || !currentUser) return false;

    // Check if someone else is already editing
    if (editingSessions[cardId] && editingSessions[cardId].userId !== currentUser.id) {
      return false;
    }

    try {
      const presenceData = {
        user_id: currentUser.id,
        name: currentUser.name || currentUser.email?.split('@')[0],
        email: currentUser.email,
        profile_picture: currentUser.profile_picture,
        editing_card_id: cardId,
        editing_started_at: new Date().toISOString(),
        project_id: projectId
      };

      await channelRef.current.track(presenceData);
      
      // Auto-release after 5 minutes
      editingTimeoutRef.current[cardId] = setTimeout(() => {
        stopEditingCard(cardId);
      }, 5 * 60 * 1000);

      return true;
    } catch (error) {
      return false;
    }
  }, [channelRef, currentUser, editingSessions, projectId]);

  // Stop editing a card (release lock)
  const stopEditingCard = useCallback(async (cardId) => {
    if (!channelRef.current || !currentUser) return;

    try {
      // Clear timeout
      if (editingTimeoutRef.current[cardId]) {
        clearTimeout(editingTimeoutRef.current[cardId]);
        delete editingTimeoutRef.current[cardId];
      }

      // Update presence to remove editing info
      const presenceData = {
        user_id: currentUser.id,
        name: currentUser.name || currentUser.email?.split('@')[0],
        email: currentUser.email,
        profile_picture: currentUser.profile_picture,
        editing_card_id: null,
        editing_started_at: null,
        project_id: projectId
      };

      await channelRef.current.track(presenceData);
    } catch (error) {
      // Silently handle errors
    }
  }, [channelRef, currentUser, projectId]);

  // Check if current user can edit a card
  const canEditCard = useCallback((cardId) => {
    const editingSession = editingSessions[cardId];
    return !editingSession || editingSession.userId === currentUser?.id;
  }, [editingSessions, currentUser]);

  // Get editing user info for a card
  const getEditingUser = useCallback((cardId) => {
    return editingSessions[cardId] || null;
  }, [editingSessions]);

  // Simplified broadcast function
  const broadcastCardUpdate = useCallback(async (cardId, updateData) => {
    if (!channelRef.current || !isConnected) return;

    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'card_update',
        payload: {
          cardId,
          updateData,
          updatedBy: currentUser?.id,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      // Silently handle broadcast errors
    }
  }, [channelRef, isConnected, currentUser]);

  return {
    isConnected,
    connectionError,
    editingSessions,
    startEditingCard,
    stopEditingCard,
    canEditCard,
    getEditingUser,
    broadcastCardUpdate,
  };
};