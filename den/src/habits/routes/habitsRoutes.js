// routes/habitsRoutes.js

import express from 'express';
import {
  getWorkspaceHabits,
  createHabit,
  updateHabit,
  deleteHabit,
  completeHabit,
  uncompleteHabit,
  getHabitAnalytics,
  getTeamCompletions,
  getPerformerDetails,
  updateHabitProgress,
  addHabitNote,
  deleteHabitNote
} from '../controllers/habitsController.js';
import { authenticate } from '../utils/helpers.js';

const router = express.Router();

// Get all habits for the current workspace
router.get('/', authenticate, getWorkspaceHabits);

// Get habit analytics for the workspace
router.get('/analytics', authenticate, getHabitAnalytics);

// Get performer details (stats and completions)
router.get('/performer/:userId', authenticate, getPerformerDetails);

// Get team completions for a specific habit
router.get('/:habitId/team-completions', authenticate, getTeamCompletions);

// Create a new habit
router.post('/', authenticate, createHabit);

// Update a habit
router.patch('/:habitId', authenticate, updateHabit);

// Delete a habit
router.delete('/:habitId', authenticate, deleteHabit);

// Complete a habit for today
router.post('/:habitId/complete', authenticate, completeHabit);

// Add a note to a habit without affecting completion
router.post('/:habitId/note', authenticate, addHabitNote);

// Delete a specific note from a habit
router.delete('/:habitId/note', authenticate, deleteHabitNote);

// Update/Set habit progress for today (edit feature)
router.put('/:habitId/progress', authenticate, updateHabitProgress);

// Uncomplete a habit for today
router.delete('/:habitId/complete', authenticate, uncompleteHabit);

export default router;