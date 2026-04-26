// controllers/habitsController.js — single-user OSS version
// Removed: project_members checks, team stats, is_private logic, .schema('habits') calls

import { randomUUID } from 'crypto';
import { config } from 'dotenv';

config();

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HABIT_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MIN_TARGET_VALUE = 1;
const MAX_TARGET_VALUE = 10000;
const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const VALID_TRACKING_TYPES = ['boolean', 'numeric', 'duration'];
const VALID_CATEGORIES = ['general', 'development', 'communication', 'productivity', 'quality', 'learning', 'health'];

// ─── XP / Gamification ────────────────────────────────────────────────────────

const XP_BASE_COMPLETION = 10;
const XP_NUMERIC_BONUS_MAX = 15;
const XP_STREAK_BONUS_PER_DAY = 2;
const XP_STREAK_BONUS_MAX = 20;
const XP_WEEKLY_HABIT_MULTIPLIER = 1.5;
const XP_MONTHLY_HABIT_MULTIPLIER = 2.0;

const calculateLevelFromXP = (totalXP) => {
  if (totalXP <= 0) return { level: 1, currentLevelXP: 0, nextLevelXP: 50, progressPercent: 0 };
  const level = Math.floor((1 + Math.sqrt(1 + (4 * totalXP) / 25)) / 2);
  const xpForCurrentLevel = 25 * (level - 1) * level;
  const xpForNextLevel = 25 * level * (level + 1);
  const xpInCurrentLevel = totalXP - xpForCurrentLevel;
  const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
  const progressPercent = Math.round((xpInCurrentLevel / xpNeededForNextLevel) * 100);
  return {
    level,
    currentLevelXP: xpInCurrentLevel,
    nextLevelXP: xpNeededForNextLevel,
    progressPercent: Math.min(100, progressPercent)
  };
};

const calculateCompletionXP = (habit, completionValue, currentStreak = 0) => {
  let xp = XP_BASE_COMPLETION;
  const numValue = Number(completionValue) || 0;
  if (habit.tracking_type !== 'boolean') {
    const targetValue = Number(habit.target_value) || 1;
    const ratio = Math.min(numValue / targetValue, 1);
    xp += Math.floor(XP_NUMERIC_BONUS_MAX * ratio);
  }
  const streakBonus = Math.min(currentStreak * XP_STREAK_BONUS_PER_DAY, XP_STREAK_BONUS_MAX);
  xp += streakBonus;
  if (habit.frequency === 'weekly') xp = Math.floor(xp * XP_WEEKLY_HABIT_MULTIPLIER);
  else if (habit.frequency === 'monthly') xp = Math.floor(xp * XP_MONTHLY_HABIT_MULTIPLIER);
  return xp;
};

const calculatePossibleCompletions = (habits, days) => {
  return habits.reduce((total, habit) => {
    switch (habit.frequency) {
      case 'weekly':  return total + Math.max(1, Math.ceil(days / 7));
      case 'monthly': return total + Math.max(1, Math.ceil(days / 30));
      default:        return total + days;
    }
  }, 0);
};

const isCompletionSuccessful = (habit, completionValue) => {
  const numValue = Number(completionValue) || 0;
  if (habit.tracking_type === 'boolean') return numValue > 0;
  const targetValue = Number(habit.target_value) || 1;
  return numValue >= targetValue;
};

// ─── Validation ───────────────────────────────────────────────────────────────

const validateHexColor = (color) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

const sanitizeString = (str, maxLength) => {
  if (!str) return '';
  return str.trim().substring(0, maxLength);
};

const validateHabitInput = (data, isUpdate = false) => {
  const errors = [];
  if (!isUpdate && (!data.name || data.name.trim().length === 0)) errors.push('Habit name is required');
  if (data.name && data.name.trim().length > MAX_HABIT_NAME_LENGTH) errors.push(`Habit name must be ${MAX_HABIT_NAME_LENGTH} characters or less`);
  if (data.description && data.description.length > MAX_DESCRIPTION_LENGTH) errors.push(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
  if (data.frequency && !VALID_FREQUENCIES.includes(data.frequency)) errors.push('Invalid frequency. Must be: daily, weekly, or monthly');
  if (data.tracking_type && !VALID_TRACKING_TYPES.includes(data.tracking_type)) errors.push('Invalid tracking type. Must be: boolean, numeric, or duration');
  if (data.target_value !== undefined) {
    const value = parseInt(data.target_value);
    if (isNaN(value) || value < MIN_TARGET_VALUE || value > MAX_TARGET_VALUE) errors.push(`Target value must be between ${MIN_TARGET_VALUE} and ${MAX_TARGET_VALUE}`);
  }
  if (data.color && !validateHexColor(data.color)) errors.push('Color must be a valid hex code (e.g., #6366f1)');
  return errors;
};

// ─── Access helper ────────────────────────────────────────────────────────────

/**
 * Single-user access check: verify the project belongs to the requesting user.
 * Replaces the old project_members-based verifyProjectAccess.
 */
const verifyProjectAccess = async (user, db, projectId) => {
  const { data: project, error } = await db
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (error || !project || project.owner_id !== user.id) {
    throw new Error('No access to this project');
  }
  return true;
};

/**
 * Get all project IDs owned by the user.
 */
const getUserProjects = async (user, db) => {
  const { data: projects, error } = await db
    .from('projects')
    .select('id')
    .eq('owner_id', user.id);
  if (error) throw error;
  return (projects || []).map(p => p.id);
};

// ─── Streak helpers ───────────────────────────────────────────────────────────

function calculateDailyStreak(completions, today) {
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const mostRecentDate = new Date(completions[0].completed_date);
  mostRecentDate.setHours(0, 0, 0, 0);
  const daysDiff = Math.floor((today - mostRecentDate) / (1000 * 60 * 60 * 24));

  if (daysDiff <= 1) {
    let expectedDate = new Date(completions[0].completed_date);
    expectedDate.setHours(0, 0, 0, 0);
    for (let i = 0; i < completions.length; i++) {
      const completionDate = new Date(completions[i].completed_date);
      completionDate.setHours(0, 0, 0, 0);
      if (completionDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  tempStreak = 1;
  for (let i = 1; i < completions.length; i++) {
    const curr = new Date(completions[i - 1].completed_date);
    const prev = new Date(completions[i].completed_date);
    curr.setHours(0, 0, 0, 0);
    prev.setHours(0, 0, 0, 0);
    const diff = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak, tempStreak);
  return { currentStreak, longestStreak };
}

function calculateWeeklyStreak(completions, today) {
  const getWeekStart = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  };

  const completionWeeks = [...new Set(completions.map(c => getWeekStart(c.completed_date).getTime()))].sort((a, b) => b - a);
  const currentWeekStart = getWeekStart(today).getTime();
  const lastWeekStart = currentWeekStart - 7 * 24 * 60 * 60 * 1000;

  let currentStreak = 0;
  if (completionWeeks[0] === currentWeekStart || completionWeeks[0] === lastWeekStart) {
    let expectedWeek = completionWeeks[0];
    for (const week of completionWeeks) {
      if (week === expectedWeek) {
        currentStreak++;
        expectedWeek -= 7 * 24 * 60 * 60 * 1000;
      } else break;
    }
  }

  let longestStreak = 0;
  let tempStreak = 1;
  for (let i = 1; i < completionWeeks.length; i++) {
    if (completionWeeks[i - 1] - completionWeeks[i] === 7 * 24 * 60 * 60 * 1000) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak, tempStreak);
  return { currentStreak, longestStreak };
}

function calculateMonthlyStreak(completions, today) {
  const getMonthKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  const completionMonths = [...new Set(completions.map(c => getMonthKey(c.completed_date)))];
  const currentMonthKey = getMonthKey(today);
  const lastMonthDate = new Date(today);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthKey = getMonthKey(lastMonthDate);

  let currentStreak = 0;
  if (completionMonths[0] === currentMonthKey || completionMonths[0] === lastMonthKey) {
    let checkDate = new Date(today);
    for (const monthKey of completionMonths) {
      if (getMonthKey(checkDate) === monthKey) {
        currentStreak++;
        checkDate.setMonth(checkDate.getMonth() - 1);
      } else break;
    }
  }

  return { currentStreak, longestStreak: Math.max(currentStreak, completionMonths.length > 0 ? 1 : 0) };
}

async function recalculateStreak(db, habitId, userId) {
  try {
    const { data: habit } = await db
      .from('habits')
      .select('frequency, tracking_type, target_value')
      .eq('id', habitId)
      .single();

    if (!habit) return;

    const { data: completions } = await db
      .from('habit_completions')
      .select('completed_date, value')
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .order('completed_date', { ascending: false });

    if (!completions || completions.length === 0) {
      await db.from('habit_streaks').upsert({
        habit_id: habitId, user_id: userId,
        current_streak: 0, longest_streak: 0,
        last_completion_date: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'habit_id,user_id' });
      return;
    }

    const successfulCompletions = completions.filter(c => isCompletionSuccessful(habit, c.value));

    if (successfulCompletions.length === 0) {
      await db.from('habit_streaks').upsert({
        habit_id: habitId, user_id: userId,
        current_streak: 0, longest_streak: 0,
        last_completion_date: completions[0]?.completed_date || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'habit_id,user_id' });
      return;
    }

    const frequency = habit.frequency || 'daily';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let currentStreak = 0;
    let longestStreak = 0;

    if (frequency === 'daily') {
      ({ currentStreak, longestStreak } = calculateDailyStreak(successfulCompletions, today));
    } else if (frequency === 'weekly') {
      ({ currentStreak, longestStreak } = calculateWeeklyStreak(successfulCompletions, today));
    } else if (frequency === 'monthly') {
      ({ currentStreak, longestStreak } = calculateMonthlyStreak(successfulCompletions, today));
    }

    await db.from('habit_streaks').upsert({
      habit_id: habitId, user_id: userId,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_completion_date: successfulCompletions[0]?.completed_date || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'habit_id,user_id' });

  } catch (error) {
    console.error('Error recalculating streak:', error);
  }
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/habits?project_id=...
 * Returns habits for the user's project(s).
 */
async function getWorkspaceHabits(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { project_id, limit = 100, offset = 0 } = req.query;

    let projectIds;
    if (project_id) {
      await verifyProjectAccess(user, db, project_id);
      projectIds = [project_id];
    } else {
      projectIds = await getUserProjects(user, db);
    }

    if (projectIds.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const { data: habits, error, count } = await db
      .from('habits')
      .select('*', { count: 'exact' })
      .in('project_id', projectIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    if (!habits || habits.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const habitIds = habits.map(h => h.id);
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Batch fetch today's completions
    const { data: todayCompletions } = await db
      .from('habit_completions')
      .select('*')
      .in('habit_id', habitIds)
      .eq('user_id', user.id)
      .eq('completed_date', today);

    // Batch fetch streak data
    const { data: streakData } = await db
      .from('habit_streaks')
      .select('*')
      .in('habit_id', habitIds)
      .eq('user_id', user.id);

    // Batch fetch recent completions (last 7 days)
    const { data: recentCompletions } = await db
      .from('habit_completions')
      .select('habit_id, completed_date, value, notes, user_id')
      .in('habit_id', habitIds)
      .eq('user_id', user.id)
      .gte('completed_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('completed_date', { ascending: false });

    // Build lookup maps
    const todayCompletionMap = Object.fromEntries(
      (todayCompletions || []).map(c => [c.habit_id, c])
    );
    const streakMap = Object.fromEntries(
      (streakData || []).map(s => [s.habit_id, s])
    );
    const recentCompletionsMap = (recentCompletions || []).reduce((acc, c) => {
      if (!acc[c.habit_id]) acc[c.habit_id] = [];
      acc[c.habit_id].push({ completed_date: c.completed_date, value: c.value, notes: c.notes });
      return acc;
    }, {});

    const habitsWithCompletions = habits.map(habit => {
      const todayCompletion = todayCompletionMap[habit.id];
      const streak = streakMap[habit.id];
      const recent = recentCompletionsMap[habit.id] || [];

      let completedToday = false;
      if (todayCompletion) {
        if (habit.tracking_type === 'boolean') {
          completedToday = (todayCompletion.value || 0) > 0;
        } else {
          completedToday = (todayCompletion.value || 0) >= (habit.target_value || 1);
        }
      }

      return {
        ...habit,
        completed_today: completedToday,
        today_value: todayCompletion?.value || 0,
        today_notes: todayCompletion?.notes || null,
        current_streak: streak?.current_streak || 0,
        longest_streak: streak?.longest_streak || 0,
        recent_completions: recent,
      };
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.json({
      success: true,
      data: habitsWithCompletions,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get workspace habits error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to fetch habits'
    });
  }
}

/**
 * POST /api/habits
 */
async function createHabit(req, res) {
  try {
    const user = req.user;
    const db = req.db;

    const {
      project_id,
      name,
      description,
      frequency = 'daily',
      tracking_type = 'boolean',
      target_value = 1,
      unit,
      category = 'general',
      color = '#6366f1',
      icon = '🎯',
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ success: false, error: 'Project ID is required' });
    }

    const validationErrors = validateHabitInput(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, error: validationErrors.join(', ') });
    }

    await verifyProjectAccess(user, db, project_id);

    const { data: habit, error } = await db
      .from('habits')
      .insert({
        id: randomUUID(),
        project_id,
        name: sanitizeString(name, MAX_HABIT_NAME_LENGTH),
        description: sanitizeString(description, MAX_DESCRIPTION_LENGTH) || null,
        created_by: user.id,
        frequency,
        tracking_type,
        target_value: parseInt(target_value),
        unit: sanitizeString(unit, 50) || null,
        category: sanitizeString(category, 50),
        color,
        icon,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data: habit });
  } catch (error) {
    console.error('Create habit error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to create habit'
    });
  }
}

/**
 * PATCH /api/habits/:habitId
 */
async function updateHabit(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { habitId } = req.params;

    const validationErrors = validateHabitInput(req.body, true);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, error: validationErrors.join(', ') });
    }

    const { data: existingHabit, error: checkError } = await db
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .single();

    if (checkError || !existingHabit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    await verifyProjectAccess(user, db, existingHabit.project_id);

    const { name, description, frequency, tracking_type, target_value, unit, category, color, icon, is_active } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = sanitizeString(name, MAX_HABIT_NAME_LENGTH);
    if (description !== undefined) updateData.description = sanitizeString(description, MAX_DESCRIPTION_LENGTH) || null;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (tracking_type !== undefined) updateData.tracking_type = tracking_type;
    if (target_value !== undefined) updateData.target_value = parseInt(target_value);
    if (unit !== undefined) updateData.unit = sanitizeString(unit, 50) || null;
    if (category !== undefined) updateData.category = sanitizeString(category, 50);
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    const { data: habit, error } = await db
      .from('habits')
      .update(updateData)
      .eq('id', habitId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data: habit });
  } catch (error) {
    console.error('Update habit error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to update habit'
    });
  }
}

/**
 * DELETE /api/habits/:habitId
 */
async function deleteHabit(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { habitId } = req.params;

    const { data: existingHabit, error: checkError } = await db
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .single();

    if (checkError || !existingHabit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    await verifyProjectAccess(user, db, existingHabit.project_id);

    const { error } = await db.from('habits').delete().eq('id', habitId);
    if (error) throw error;

    res.json({ success: true, message: 'Habit deleted successfully' });
  } catch (error) {
    console.error('Delete habit error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to delete habit'
    });
  }
}

/**
 * POST /api/habits/:habitId/complete
 */
async function completeHabit(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { habitId } = req.params;
    const { value = 1, notes } = req.body;

    const { data: habit, error: habitError } = await db
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .eq('is_active', true)
      .single();

    if (habitError || !habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    await verifyProjectAccess(user, db, habit.project_id);

    const today = new Date().toISOString().split('T')[0];

    const { data: existingCompletion } = await db
      .from('habit_completions')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', user.id)
      .eq('completed_date', today)
      .single();

    if (existingCompletion) {
      let newValue;
      if (habit.tracking_type === 'boolean') {
        newValue = 1;
      } else {
        newValue = Math.max(0, (existingCompletion.value || 0) + value);
      }

      let updatedNotes = (existingCompletion.notes || '').trim();
      if (notes && notes.trim()) {
        updatedNotes = updatedNotes ? `${updatedNotes}\n---\n${notes.trim()}` : notes.trim();
      }

      const { data: completion, error } = await db
        .from('habit_completions')
        .update({ value: newValue, notes: updatedNotes })
        .eq('id', existingCompletion.id)
        .select()
        .single();

      if (error) throw error;
      await recalculateStreak(db, habitId, user.id);
      return res.json({ success: true, data: completion, updated: true });
    } else {
      const initialValue = habit.tracking_type === 'boolean' ? 1 : Math.max(0, value);

      const { data: completion, error } = await db
        .from('habit_completions')
        .insert({
          id: randomUUID(),
          habit_id: habitId,
          user_id: user.id,
          completed_date: today,
          value: initialValue,
          notes: notes?.trim()
        })
        .select()
        .single();

      if (error) throw error;
      await recalculateStreak(db, habitId, user.id);
      res.json({ success: true, data: completion, updated: false });
    }
  } catch (error) {
    console.error('Complete habit error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to complete habit'
    });
  }
}

/**
 * PUT /api/habits/:habitId/progress
 */
async function updateHabitProgress(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { habitId } = req.params;
    const { value = 0, notes } = req.body;

    const { data: habit, error: habitError } = await db
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .eq('is_active', true)
      .single();

    if (habitError || !habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    if (habit.tracking_type === 'boolean') {
      return res.status(400).json({ success: false, error: 'Cannot update progress for boolean habits' });
    }

    await verifyProjectAccess(user, db, habit.project_id);

    const today = new Date().toISOString().split('T')[0];

    const { data: existingCompletion } = await db
      .from('habit_completions')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', user.id)
      .eq('completed_date', today)
      .single();

    if (existingCompletion) {
      const newValue = (existingCompletion.value || 0) + value;
      let updatedNotes = (existingCompletion.notes || '').trim();
      if (notes?.trim()) {
        updatedNotes = updatedNotes ? `${updatedNotes}\n---\n${notes.trim()}` : notes.trim();
      }

      const { data: completion, error } = await db
        .from('habit_completions')
        .update({ value: newValue, notes: updatedNotes })
        .eq('id', existingCompletion.id)
        .select()
        .single();

      if (error) throw error;
      await recalculateStreak(db, habitId, user.id);
      return res.json({ success: true, data: completion, updated: true });
    } else {
      const { data: completion, error } = await db
        .from('habit_completions')
        .insert({
          id: randomUUID(),
          habit_id: habitId,
          user_id: user.id,
          completed_date: today,
          value,
          notes: notes?.trim()
        })
        .select()
        .single();

      if (error) throw error;
      await recalculateStreak(db, habitId, user.id);
      res.json({ success: true, data: completion, updated: false });
    }
  } catch (error) {
    console.error('Update habit progress error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to update habit progress'
    });
  }
}

/**
 * DELETE /api/habits/:habitId/complete
 */
async function uncompleteHabit(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { habitId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const { data: habit, error: habitError } = await db
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .single();

    if (habitError || !habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    await verifyProjectAccess(user, db, habit.project_id);

    const { error } = await db
      .from('habit_completions')
      .delete()
      .eq('habit_id', habitId)
      .eq('user_id', user.id)
      .eq('completed_date', today);

    if (error) throw error;

    await recalculateStreak(db, habitId, user.id);
    res.json({ success: true, message: 'Habit uncompleted successfully' });
  } catch (error) {
    console.error('Uncomplete habit error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to uncomplete habit'
    });
  }
}

/**
 * GET /api/habits/analytics?project_id=...
 */
async function getHabitAnalytics(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { project_id } = req.query;

    let projectIds;
    if (project_id) {
      await verifyProjectAccess(user, db, project_id);
      projectIds = [project_id];
    } else {
      projectIds = await getUserProjects(user, db);
    }

    if (projectIds.length === 0) {
      return res.json({ success: true, data: emptyAnalytics() });
    }

    const { data: habits, error: habitsError } = await db
      .from('habits')
      .select('*')
      .in('project_id', projectIds)
      .eq('is_active', true);

    if (habitsError) throw habitsError;

    if (!habits || habits.length === 0) {
      return res.json({ success: true, data: emptyAnalytics() });
    }

    const habitIds = habits.map(h => h.id);
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const habitsMap = habits.reduce((acc, h) => {
      acc[h.id] = { frequency: h.frequency, tracking_type: h.tracking_type, target_value: h.target_value, name: h.name, icon: h.icon, color: h.color };
      return acc;
    }, {});

    // Fetch all completions for the user
    const { data: allCompletionsData } = await db
      .from('habit_completions')
      .select('*')
      .in('habit_id', habitIds)
      .eq('user_id', user.id);

    const { data: todayData } = await db
      .from('habit_completions')
      .select('*')
      .in('habit_id', habitIds)
      .eq('user_id', user.id)
      .eq('completed_date', today);

    const { data: weekData } = await db
      .from('habit_completions')
      .select('*')
      .in('habit_id', habitIds)
      .eq('user_id', user.id)
      .gte('completed_date', weekAgoStr);

    const { data: streakData } = await db
      .from('habit_streaks')
      .select('*')
      .in('habit_id', habitIds)
      .eq('user_id', user.id);

    const allUserCompletions = (allCompletionsData || []).map(c => ({ ...c, habits: habitsMap[c.habit_id] || null }));
    const userTodayCompletions = (todayData || []).map(c => ({ ...c, habits: habitsMap[c.habit_id] || null }));
    const userWeekCompletions = (weekData || []).map(c => ({ ...c, habits: habitsMap[c.habit_id] || null }));
    const userStreaks = (streakData || []).map(s => ({ ...s, habits: habitsMap[s.habit_id] || null }));

    // Calculate XP
    let totalXP = 0;
    const completionsByHabit = {};
    allUserCompletions.forEach(c => {
      if (!completionsByHabit[c.habit_id]) completionsByHabit[c.habit_id] = [];
      completionsByHabit[c.habit_id].push(c);
    });

    allUserCompletions.forEach(completion => {
      const habit = completion.habits;
      if (!habit || !isCompletionSuccessful(habit, completion.value)) return;
      const habitCompletions = completionsByHabit[completion.habit_id] || [];
      const sorted = [...habitCompletions].sort((a, b) => new Date(a.completed_date) - new Date(b.completed_date));
      const idx = sorted.findIndex(c => c.id === completion.id);
      totalXP += calculateCompletionXP(habit, completion.value, Math.min(Math.max(0, idx), 10));
    });

    const levelInfo = calculateLevelFromXP(totalXP);

    const successfulCompletionsToday = userTodayCompletions.filter(c => c.habits && isCompletionSuccessful(c.habits, c.value)).length;
    const successfulCompletionsThisWeek = userWeekCompletions.filter(c => c.habits && isCompletionSuccessful(c.habits, c.value)).length;
    const totalSuccessfulCompletions = allUserCompletions.filter(c => c.habits && isCompletionSuccessful(c.habits, c.value)).length;

    const userPossibleCompletions = calculatePossibleCompletions(habits, 7);
    const userCompletionRate = userPossibleCompletions > 0
      ? Math.round((successfulCompletionsThisWeek / userPossibleCompletions) * 100)
      : 0;

    let bestCurrentStreak = 0;
    let bestLongestStreak = 0;
    let bestHabitStreak = null;

    userStreaks.forEach(streak => {
      if (streak.current_streak > bestCurrentStreak) {
        bestCurrentStreak = streak.current_streak;
        bestHabitStreak = {
          habitName: streak.habits?.name || 'Unknown',
          icon: streak.habits?.icon || '🎯',
          color: streak.habits?.color || '#6366f1',
          frequency: streak.habits?.frequency || 'daily',
          streak: streak.current_streak
        };
      }
      if (streak.longest_streak > bestLongestStreak) bestLongestStreak = streak.longest_streak;
    });

    // Habit performance (per-habit completion rate this week)
    const habitStats = {};
    userWeekCompletions.forEach(c => {
      if (!habitStats[c.habit_id]) habitStats[c.habit_id] = { total: 0, successful: 0 };
      habitStats[c.habit_id].total++;
      if (c.habits && isCompletionSuccessful(c.habits, c.value)) habitStats[c.habit_id].successful++;
    });

    const habitPerformance = habits.map(habit => {
      const stats = habitStats[habit.id] || { total: 0, successful: 0 };
      const possible = calculatePossibleCompletions([habit], 7);
      return {
        habit_id: habit.id,
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        frequency: habit.frequency,
        completions: stats.successful,
        totalAttempts: stats.total,
        completion_rate: possible > 0 ? Math.round((stats.successful / possible) * 100) : 0
      };
    }).sort((a, b) => b.completion_rate - a.completion_rate);

    res.json({
      success: true,
      data: {
        personal: {
          totalCompletions: allUserCompletions.length,
          successfulCompletions: totalSuccessfulCompletions,
          completionsToday: successfulCompletionsToday,
          completionsThisWeek: successfulCompletionsThisWeek,
          currentStreak: bestCurrentStreak,
          longestStreak: bestLongestStreak,
          bestHabitStreak,
          level: levelInfo.level,
          xp: totalXP,
          xpInCurrentLevel: levelInfo.currentLevelXP,
          xpToNextLevel: levelInfo.nextLevelXP,
          levelProgress: levelInfo.progressPercent,
          completionRate: Math.min(100, userCompletionRate),
        },
        habitPerformance
      }
    });
  } catch (error) {
    console.error('Get habit analytics error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch analytics' });
  }
}

function emptyAnalytics() {
  return {
    personal: {
      totalCompletions: 0, successfulCompletions: 0,
      completionsToday: 0, completionsThisWeek: 0,
      currentStreak: 0, longestStreak: 0, bestHabitStreak: null,
      level: 1, xp: 0, xpInCurrentLevel: 0, xpToNextLevel: 50,
      levelProgress: 0, completionRate: 0,
    },
    habitPerformance: []
  };
}

/**
 * POST /api/habits/:habitId/note
 */
async function addHabitNote(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { habitId } = req.params;
    const { notes } = req.body;

    if (!notes || !notes.trim()) {
      return res.status(400).json({ success: false, error: 'Note content is required' });
    }

    const { data: habit, error: habitError } = await db
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .eq('is_active', true)
      .single();

    if (habitError || !habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    await verifyProjectAccess(user, db, habit.project_id);

    const today = new Date().toISOString().split('T')[0];

    const { data: existingCompletion } = await db
      .from('habit_completions')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', user.id)
      .eq('completed_date', today)
      .single();

    if (existingCompletion) {
      const existingNotes = (existingCompletion.notes || '').trim();
      const newNotes = existingNotes ? `${existingNotes}\n---\n${notes.trim()}` : notes.trim();

      const { data: completion, error } = await db
        .from('habit_completions')
        .update({ notes: newNotes })
        .eq('id', existingCompletion.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, data: completion, updated: true });
    } else {
      const { data: completion, error } = await db
        .from('habit_completions')
        .insert({
          id: randomUUID(),
          habit_id: habitId,
          user_id: user.id,
          completed_date: today,
          value: 0,
          notes: notes.trim()
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data: completion, updated: false });
    }
  } catch (error) {
    console.error('Add habit note error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to add note'
    });
  }
}

/**
 * DELETE /api/habits/:habitId/note
 */
async function deleteHabitNote(req, res) {
  try {
    const user = req.user;
    const db = req.db;
    const { habitId } = req.params;
    const { date, note_index } = req.body;

    if (note_index === undefined || note_index === null) {
      return res.status(400).json({ success: false, error: 'Note index is required' });
    }

    const { data: habit, error: habitError } = await db
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .eq('is_active', true)
      .single();

    if (habitError || !habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    await verifyProjectAccess(user, db, habit.project_id);

    const targetDate = date || new Date().toISOString().split('T')[0];

    const { data: completion, error: completionError } = await db
      .from('habit_completions')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', user.id)
      .eq('completed_date', targetDate)
      .single();

    if (completionError || !completion) {
      return res.status(404).json({ success: false, error: 'No completion found for this date' });
    }

    if (!completion.notes || completion.notes.trim() === '') {
      return res.status(404).json({ success: false, error: 'No notes found to delete' });
    }

    const notesArray = completion.notes.split('\n---\n').map(n => n.trim()).filter(n => n);

    if (note_index < 0 || note_index >= notesArray.length) {
      return res.status(400).json({ success: false, error: 'Invalid note index' });
    }

    notesArray.splice(note_index, 1);
    const updatedNotes = notesArray.length > 0 ? notesArray.join('\n---\n') : null;

    if (!updatedNotes && completion.value === 0) {
      const { error: deleteError } = await db
        .from('habit_completions')
        .delete()
        .eq('id', completion.id);

      if (deleteError) throw deleteError;

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      return res.json({ success: true, message: 'Note deleted and completion removed', deleted_completion: true, data: null });
    }

    const { data: updatedCompletion, error: updateError } = await db
      .from('habit_completions')
      .update({ notes: updatedNotes })
      .eq('id', completion.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ success: true, message: 'Note deleted successfully', deleted_completion: false, data: updatedCompletion });
  } catch (error) {
    console.error('Delete habit note error:', error);
    res.status(error.message === 'No access to this project' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to delete note'
    });
  }
}

export {
  getWorkspaceHabits,
  createHabit,
  updateHabit,
  deleteHabit,
  completeHabit,
  uncompleteHabit,
  getHabitAnalytics,
  updateHabitProgress,
  addHabitNote,
  deleteHabitNote
};
