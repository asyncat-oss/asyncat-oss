// timeService.js - Updated to use Supabase

// UUID validation helper
const isValidUUID = (uuid) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
};

// Get active timer for a user
const getActiveTimer = async (userId, db) => {
  try {
    if (!isValidUUID(userId)) {
      throw new Error("Invalid user ID format");
    }

    const { data: timeEntry, error } = await db
      .schema('kanban')
      .from('TimeEntries')
      .select('*')
      .eq('userId', userId)
      .is('endTime', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No active timer found
      }
      throw error;
    }

    return timeEntry;
  } catch (error) {
    console.error("Error getting active timer:", error);
    throw error;
  }
};

// Start a timer
const startTimer = async (cardId, userId, db) => {
  try {
    if (!isValidUUID(cardId) || !isValidUUID(userId)) {
      throw new Error("Invalid card ID or user ID format");
    }

    const { data: timeEntry, error } = await db
      .schema('kanban')
      .from('TimeEntries')
      .insert([{
        cardId,
        userId,
        startTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;

    return timeEntry;
  } catch (error) {
    console.error("Error starting timer:", error);
    throw error;
  }
};

// Stop a timer
const stopTimer = async (cardId, userId, description = "", db) => {
  try {
    if (!isValidUUID(cardId) || !isValidUUID(userId)) {
      throw new Error("Invalid card ID or user ID format");
    }

    // Find the active timer
    const { data: timeEntry, error: findError } = await db
      .schema('kanban')
      .from('TimeEntries')
      .select('*')
      .eq('cardId', cardId)
      .eq('userId', userId)
      .is('endTime', null)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return null; // No active timer found
      }
      throw findError;
    }

    if (!timeEntry) return null;

    // Calculate duration in seconds
    const endTime = new Date();
    const startTime = new Date(timeEntry.startTime);
    const durationSeconds = Math.floor((endTime - startTime) / 1000);

    // Update the time entry
    const { data: updatedTimeEntry, error: updateError } = await db
      .schema('kanban')
      .from('TimeEntries')
      .update({
        endTime: endTime.toISOString(),
        description: description,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', timeEntry.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update the total time spent on the card
    const { data: card, error: cardFetchError } = await db
      .schema('kanban')
      .from('Cards')
      .select('timeSpent')
      .eq('id', cardId)
      .single();

    if (cardFetchError) throw cardFetchError;

    const newTimeSpent = (card.timeSpent || 0) + durationSeconds;

    const { error: cardUpdateError } = await db
      .schema('kanban')
      .from('Cards')
      .update({ 
        timeSpent: newTimeSpent,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', cardId);

    if (cardUpdateError) throw cardUpdateError;

    return updatedTimeEntry;
  } catch (error) {
    console.error("Error stopping timer:", error);
    throw error;
  }
};

// Get all time entries for a card
const getTimeEntries = async (cardId, db) => {
  try {
    if (!isValidUUID(cardId)) {
      throw new Error("Invalid card ID format");
    }

    const { data: timeEntries, error } = await db
      .schema('kanban')
      .from('TimeEntries')
      .select('*')
      .eq('cardId', cardId)
      .order('startTime', { ascending: false });

    if (error) throw error;

    return timeEntries || [];
  } catch (error) {
    console.error("Error getting time entries:", error);
    throw error;
  }
};

// Get time entry by ID
const getTimeEntryById = async (id, db) => {
  try {
    if (!isValidUUID(id)) {
      throw new Error("Invalid time entry ID format");
    }

    const { data: timeEntry, error } = await db
      .schema('kanban')
      .from('TimeEntries')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Time entry not found
      }
      throw error;
    }

    return timeEntry;
  } catch (error) {
    console.error("Error getting time entry by ID:", error);
    throw error;
  }
};

// Delete a time entry
const deleteTimeEntry = async (id, db) => {
  try {
    if (!isValidUUID(id)) {
      throw new Error("Invalid time entry ID format");
    }

    // Get the time entry to calculate duration
    const timeEntry = await getTimeEntryById(id, db);
    
    if (!timeEntry) return false;

    // If the entry has an end time, we need to subtract its duration from the card
    if (timeEntry.endTime) {
      const duration = Math.floor(
        (new Date(timeEntry.endTime) - new Date(timeEntry.startTime)) / 1000
      );

      // Get current timeSpent from card
      const { data: card, error: cardFetchError } = await db
        .schema('kanban')
        .from('Cards')
        .select('timeSpent')
        .eq('id', timeEntry.cardId)
        .single();

      if (cardFetchError) throw cardFetchError;

      const newTimeSpent = Math.max((card.timeSpent || 0) - duration, 0);

      // Update card timeSpent
      const { error: cardUpdateError } = await db
        .schema('kanban')
        .from('Cards')
        .update({ 
          timeSpent: newTimeSpent,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', timeEntry.cardId);

      if (cardUpdateError) throw cardUpdateError;
    }

    // Delete the time entry
    const { error: deleteError } = await db
      .schema('kanban')
      .from('TimeEntries')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return true;
  } catch (error) {
    console.error("Error deleting time entry:", error);
    throw error;
  }
};

// Update a time entry
const updateTimeEntry = async (id, updateData, db) => {
  try {
    if (!isValidUUID(id)) {
      throw new Error("Invalid time entry ID format");
    }

    // Get the existing time entry
    const timeEntry = await getTimeEntryById(id, db);
    
    if (!timeEntry) return null;

    // If updating times and both exist, calculate duration difference
    if (updateData.startTime && updateData.endTime && timeEntry.endTime) {
      const oldDuration = Math.floor(
        (new Date(timeEntry.endTime) - new Date(timeEntry.startTime)) / 1000
      );
      const newDuration = Math.floor(
        (new Date(updateData.endTime) - new Date(updateData.startTime)) / 1000
      );
      const durationDiff = newDuration - oldDuration;

      // Get current timeSpent from card
      const { data: card, error: cardFetchError } = await db
        .schema('kanban')
        .from('Cards')
        .select('timeSpent')
        .eq('id', timeEntry.cardId)
        .single();

      if (cardFetchError) throw cardFetchError;

      const newTimeSpent = Math.max((card.timeSpent || 0) + durationDiff, 0);

      // Update card's total time
      const { error: cardUpdateError } = await db
        .schema('kanban')
        .from('Cards')
        .update({ 
          timeSpent: newTimeSpent,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', timeEntry.cardId);

      if (cardUpdateError) throw cardUpdateError;
    }

    // Update the time entry
    const { data: updatedTimeEntry, error } = await db
      .schema('kanban')
      .from('TimeEntries')
      .update({
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return updatedTimeEntry;
  } catch (error) {
    console.error("Error updating time entry:", error);
    throw error;
  }
};

export default {
  getActiveTimer,
  startTimer,
  stopTimer,
  getTimeEntries,
  getTimeEntryById,
  deleteTimeEntry,
  updateTimeEntry,
};