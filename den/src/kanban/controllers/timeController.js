// timeController.js - Updated to use Supabase
import timeService from "../services/timeService.js";

// Format duration for display
const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  let result = `${hours} hour${hours !== 1 ? "s" : ""}`;
  if (minutes > 0) {
    result += ` ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  return result;
};

// Start a timer for a card
const startTimer = async (req, res) => {
  try {
    const { id: cardId } = req.params;
    const userId = req.user.id;

    // Check if there's already an active timer for this user
    const activeTimer = await timeService.getActiveTimer(userId, req.supabase);
    if (activeTimer) {
      return res.status(400).json({
        error: "You already have an active timer on another card. Please stop it first.",
      });
    }

    // Check if card exists
    const { data: card, error: cardError } = await req.supabase
      .schema('kanban')
      .from('Cards')
      .select('id, title')
      .eq('id', cardId)
      .single();

    if (cardError) {
      if (cardError.code === 'PGRST116') {
        return res.status(404).json({ error: "Card not found" });
      }
      throw cardError;
    }

    const timeEntry = await timeService.startTimer(cardId, userId, req.supabase);

    res.status(201).json(timeEntry);
  } catch (error) {
    console.error("Error starting timer:", error);
    res.status(500).json({ error: error.message });
  }
};

// Stop the active timer
const stopTimer = async (req, res) => {
  try {
    const { id: cardId } = req.params;
    const userId = req.user.id;
    const { description } = req.body;

    // Check if card exists
    const { data: card, error: cardError } = await req.supabase
      .schema('kanban')
      .from('Cards')
      .select('id, title')
      .eq('id', cardId)
      .single();

    if (cardError) {
      if (cardError.code === 'PGRST116') {
        return res.status(404).json({ error: "Card not found" });
      }
      throw cardError;
    }

    const timeEntry = await timeService.stopTimer(cardId, userId, description, req.supabase);
    if (!timeEntry) {
      return res.status(404).json({ error: "No active timer found" });
    }

    res.status(200).json(timeEntry);
  } catch (error) {
    console.error("Error stopping timer:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all time entries for a card
const getTimeEntries = async (req, res) => {
  try {
    const { id: cardId } = req.params;
    const timeEntries = await timeService.getTimeEntries(cardId, req.supabase);
    res.status(200).json(timeEntries);
  } catch (error) {
    console.error("Error getting time entries:", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete a time entry
const deleteTimeEntry = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the user owns this time entry
    const timeEntry = await timeService.getTimeEntryById(id, req.supabase);
    if (!timeEntry) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    if (timeEntry.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this time entry" });
    }

    const success = await timeService.deleteTimeEntry(id, req.supabase);
    if (!success) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    res.status(200).json({ message: "Time entry deleted successfully" });
  } catch (error) {
    console.error("Error deleting time entry:", error);
    res.status(500).json({ error: error.message });
  }
};

// Edit a time entry
const updateTimeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { startTime, endTime, description } = req.body;

    // Check if the user owns this time entry
    const timeEntry = await timeService.getTimeEntryById(id, req.supabase);
    if (!timeEntry) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    if (timeEntry.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this time entry" });
    }

    const updatedTimeEntry = await timeService.updateTimeEntry(id, {
      startTime,
      endTime,
      description,
    }, req.supabase);

    if (!updatedTimeEntry) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    res.status(200).json(updatedTimeEntry);
  } catch (error) {
    console.error("Error updating time entry:", error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  startTimer,
  stopTimer,
  getTimeEntries,
  deleteTimeEntry,
  updateTimeEntry,
};