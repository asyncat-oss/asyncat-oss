import authService from '../services/authService';

const Habit_API_URL = import.meta.env.VITE_HABIT_URL;

// Client timezone for timezone-aware date calculations on the backend
const CLIENT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Helper to merge timezone header into fetch options
const withTimezone = (options = {}) => ({
  ...options,
  headers: {
    ...options.headers,
    'x-client-timezone': CLIENT_TIMEZONE
  }
});

// Helper function to handle API responses
const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// Habit CRUD operations
export const habitApi = {
  // Create a new habit
  createHabit: async (habitData) => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits`, withTimezone({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(habitData)
    }));
    return handleResponse(response);
  },

  // Fetch habits for a project
  getHabits: async (projectId) => {
    const timestamp = new Date().getTime();
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits?project_id=${projectId}&_t=${timestamp}`, withTimezone());
    return handleResponse(response);
  },

  // Update a habit
  updateHabit: async (habitId, habitData) => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/${habitId}`, withTimezone({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(habitData)
    }));
    return handleResponse(response);
  },

  // Delete a habit
  deleteHabit: async (habitId) => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/${habitId}`, withTimezone({
      method: 'DELETE'
    }));
    return handleResponse(response);
  },

  // Complete a habit
  completeHabit: async (habitId, value = 1, notes = '') => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/${habitId}/complete`, withTimezone({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, notes })
    }));
    return handleResponse(response);
  },

  // Update/Set habit progress (for editing)
  updateHabitProgress: async (habitId, value, notes = '') => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/${habitId}/progress`, withTimezone({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, notes })
    }));
    return handleResponse(response);
  },

  // Add a note to a habit without affecting completion
  addHabitNote: async (habitId, notes) => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/${habitId}/note`, withTimezone({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    }));
    return handleResponse(response);
  },

  // Delete a specific note from a habit
  deleteHabitNote: async (habitId, date, noteIndex) => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/${habitId}/note`, withTimezone({
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, note_index: noteIndex })
    }));
    return handleResponse(response);
  },

  // Uncomplete a habit
  uncompleteHabit: async (habitId) => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/${habitId}/complete`, withTimezone({
      method: 'DELETE'
    }));
    return handleResponse(response);
  },

  // Get habit analytics
  getHabitAnalytics: async (projectId) => {
    const response = await authService.authenticatedFetch(`${Habit_API_URL}/api/habits/analytics?project_id=${projectId}`, withTimezone());
    return handleResponse(response);
  },
};

// Combined operations for convenience
export const habitOperations = {
  // Toggle habit completion (complete/uncomplete)
  toggleHabitCompletion: async (habitId, isCompleted) => {
    if (isCompleted) {
      return habitApi.uncompleteHabit(habitId);
    } else {
      return habitApi.completeHabit(habitId);
    }
  },
};
