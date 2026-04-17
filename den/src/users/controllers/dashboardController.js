// controllers/dashboardController.js — OSS/Solo version (no join syntax, workspaces instead of teams)

/**
 * Get projects for dashboard display with enhanced data - workspace filtered
 */
async function getDashboardProjects(req, res) {
  try {
    const user = req.user;
    const supabase = req.supabase;
    const { workspaceId } = req.query;

    // Single-user: get all projects owned by the user
    let projectsQ = supabase
      .from('projects')
      .select('id, name, description, due_date, created_at, updated_at, is_archived')
      .eq('owner_id', user.id)
      .eq('is_archived', false);

    if (workspaceId) {
      projectsQ = projectsQ.eq('team_id', workspaceId);
    }

    const { data: projects, error } = await projectsQ;
    if (error) throw error;

    if (!projects || projects.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const starredMap = {};

    const enhancedProjects = await Promise.all(
      (projects || []).map(async (project) => {
        const { data: columns } = await supabase
          .from('Columns')
          .select('id, isCompletionColumn')
          .eq('projectId', project.id);

        let totalTasks = 0;
        let completedTasks = 0;

        if (columns && columns.length > 0) {
          const columnIds = columns.map(c => c.id);
          const completionColumnIds = columns.filter(c => c.isCompletionColumn).map(c => c.id);

          const { data: allCards } = await supabase
            .from('Cards')
            .select('id, columnId')
            .in('columnId', columnIds);

          if (allCards) {
            totalTasks = allCards.length;
            completedTasks = allCards.filter(card => completionColumnIds.includes(card.columnId)).length;
          }
        }

        const completion_percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        let status = 'in progress';
        if (completion_percentage >= 90) {
          status = 'completed';
        } else if (!project.due_date) {
          status = 'not started';
        } else if (new Date(project.due_date) < new Date()) {
          status = completion_percentage > 50 ? 'in progress' : 'blocked';
        }

        let priority = 'medium';
        if (project.due_date) {
          const daysUntilDue = Math.floor((new Date(project.due_date) - new Date()) / (1000 * 60 * 60 * 24));
          if (daysUntilDue < 3) priority = 'high';
          else if (daysUntilDue > 14) priority = 'low';
        }

        return {
          ...project,
          completion_percentage,
          status,
          priority,
          tasks_total: totalTasks,
          tasks_completed: completedTasks,
          starred: starredMap[project.id] || false
        };
      })
    );

    res.json({ success: true, data: enhancedProjects });
  } catch (error) {
    console.error('Dashboard projects fetch error:', error);
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard projects'
    });
  }
}

/**
 * Get calendar events for dashboard display - workspace filtered
 */
async function getDashboardEvents(req, res) {
  try {
    const user = req.user;
    const supabase = req.supabase;
    const { workspaceId } = req.query;

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);

    let eventsQ = supabase
      .from('Events')
      .select('id, title, description, startTime, endTime, projectId, createdBy, createdAt, updatedAt, color, location, isAllDay, attendees')
      .eq('createdBy', user.id)
      .gte('startTime', pastDate.toISOString())
      .order('startTime', { ascending: true });

    // If workspace filter: get project IDs for that workspace first, then filter events
    if (workspaceId) {
      const { data: wsProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('team_id', workspaceId);

      const wsProjectIds = (wsProjects || []).map(p => p.id);
      if (wsProjectIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      eventsQ = eventsQ.in('projectId', wsProjectIds);
    }

    const { data: calendarEvents, error } = await eventsQ;
    if (error) throw error;

    const events = (calendarEvents || []).map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      projectId: event.projectId,
      color: event.color || 'purple',
      location: event.location,
      isAllDay: event.isAllDay || false,
      attendees: event.attendees || []
    }));

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard events'
    });
  }
}

/**
 * Get team members for dashboard display.
 * Single-user mode: returns just the current user.
 */
async function getDashboardTeam(req, res) {
  try {
    const user = req.user;
    const supabase = req.supabase;

    const { data: userData } = await supabase
      .from('users')
      .select('id, email, name, profile_picture')
      .eq('id', user.id)
      .single();

    const result = userData ? [{
      id: userData.id,
      name: userData.name || userData.email?.split('@')[0] || 'You',
      role: 'owner',
      avatar: userData.profile_picture,
      email: userData.email
    }] : [];

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Dashboard team fetch error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch team' });
  }
}

/**
 * Get habits for dashboard display - workspace filtered
 */
async function getDashboardHabits(req, res) {
  try {
    const user = req.user;
    const supabase = req.supabase;
    const { workspaceId } = req.query;

    // Build habits query — filter by workspace if provided, else all user habits
    let habitsQ = supabase
      .from('habits')
      .select('*')
      .eq('created_by', user.id)
      .eq('is_active', 1)
      .order('created_at', { ascending: false })
      .limit(10);

    if (workspaceId) {
      habitsQ = habitsQ.eq('workspace_id', workspaceId);
    }

    const { data: habits, error: habitsError } = await habitsQ;
    if (habitsError) throw new Error(habitsError.message);

    const today = new Date().toISOString().split('T')[0];

    const habitsWithCompletions = await Promise.all(
      (habits || []).map(async (habit) => {
        try {
          const { data: completion } = await supabase
            .from('habit_completions')
            .select('*')
            .eq('habit_id', habit.id)
            .eq('user_id', user.id)
            .eq('completed_date', today)
            .single();

          const isCompleted = !!completion;
          return {
            ...habit,
            completed_today: isCompleted,
            completion_value: completion?.value || 0,
            target_value: habit.target_value || 1
          };
        } catch {
          return {
            ...habit,
            completed_today: false,
            completion_value: 0,
            target_value: habit.target_value || 1
          };
        }
      })
    );

    res.json({ success: true, data: habitsWithCompletions });
  } catch (error) {
    console.error('Dashboard habits fetch error:', error);
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard habits'
    });
  }
}

/**
 * Main dashboard endpoint with analytics and insights
 */
async function getDashboardData(req, res) {
  try {
    const user = req.user;
    const supabase = req.supabase;
    const { workspaceId } = req.query;

    const [projects, tasks, events, habits] = await Promise.all([
      getProjectsWithStats(user, supabase, workspaceId),
      getTasksWithAnalytics(user, supabase, workspaceId),
      getUpcomingEvents(user, supabase, workspaceId),
      getHabitsWithCompletions(user, supabase, workspaceId)
    ]);

    const recentActivity = [];
    const analytics = calculateAnalytics(tasks, projects);
    const recommendations = generateRecommendations(tasks, projects);

    const dashboardData = {
      projects,
      tasks,
      events,
      habits,
      analytics,
      recentActivity,
      recommendations,
      insights: calculateInsights(tasks, projects, analytics)
    };

    res.json({ success: true, data: dashboardData });
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard data'
    });
  }
}

/**
 * Get user-specific tasks with analytics
 */
async function getUserSpecificTasks(req, res) {
  try {
    const user = req.user;
    const supabase = req.supabase;
    const { workspaceId } = req.query;

    const tasks = await getTasksWithAnalytics(user, supabase, workspaceId);
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('User tasks fetch error:', error);
    res.status(error.message === 'Invalid session' ? 401 : 500).json({
      success: false,
      error: error.message || 'Failed to fetch user tasks'
    });
  }
}


// Helper functions

async function getProjectsWithStats(user, supabase, workspaceId = null) {
  try {
    let projectsQ = supabase.from('projects').select('*').eq('owner_id', user.id).eq('is_archived', false);
    if (workspaceId) projectsQ = projectsQ.eq('team_id', workspaceId);
    const { data: projects } = await projectsQ;

    if (!projects || projects.length === 0) return [];

    const starredMap = {};

    const enhancedProjects = await Promise.all(
      projects.map(async (project) => {
        const { data: columns } = await supabase
          .from('Columns')
          .select('id, isCompletionColumn')
          .eq('projectId', project.id);

        let totalTasks = 0;
        let completedTasks = 0;

        if (columns && columns.length > 0) {
          const columnIds = columns.map(c => c.id);
          const completionColumnIds = columns.filter(c => c.isCompletionColumn).map(c => c.id);

          const { data: allCards } = await supabase
            .from('Cards')
            .select('id, columnId')
            .in('columnId', columnIds);

          if (allCards) {
            totalTasks = allCards.length;
            completedTasks = allCards.filter(card => completionColumnIds.includes(card.columnId)).length;
          }
        }

        const completion_percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return {
          ...project,
          completion_percentage,
          tasks_total: totalTasks,
          tasks_completed: completedTasks,
          status: getProjectStatus(project, completion_percentage),
          priority: getProjectPriority(project),
          starred: starredMap[project.id] || false
        };
      })
    );

    return enhancedProjects;
  } catch (error) {
    console.error('Error getting projects:', error);
    return [];
  }
}

async function getTasksWithAnalytics(user, supabase, workspaceId = null) {
  try {
    let projectsQ = supabase.from('projects').select('id, name').eq('owner_id', user.id).eq('is_archived', false);
    if (workspaceId) projectsQ = projectsQ.eq('team_id', workspaceId);
    const { data: projects } = await projectsQ;

    if (!projects || projects.length === 0) return [];

    let projectIds = projects.map(p => p.id);

    const projectMap = projects ? projects.reduce((map, p) => { map[p.id] = p.name; return map; }, {}) : {};

    const { data: columns } = await supabase
      .from('Columns')
      .select('id, title, projectId, isCompletionColumn')
      .in('projectId', projectIds);

    if (!columns || columns.length === 0) return [];

    const columnIds = columns.map(c => c.id);

    const { data: cards } = await supabase
      .from('Cards')
      .select('id, title, description, priority, dueDate, order, columnId, tasks, progress, checklist, tags, createdBy, createdAt, updatedAt, attachments, timeSpent, predictedMinutes, predictedConfidence, predictedReasoning, dependencies, commentCount, startedAt, completedAt, startDate, administrator_id')
      .in('columnId', columnIds);

    if (!cards) return [];

    const userCards = cards.filter(card =>
      card.createdBy === user.id ||
      card.administrator_id === user.id ||
      (card.assignees && card.assignees.includes(user.id))
    );

    const tasks = userCards.map(card => {
      const column = columns.find(c => c.id === card.columnId);
      const isCompleted = column?.isCompletionColumn || false;
      const projectName = projectMap[column?.projectId] || 'Unknown Project';

      return {
        id: card.id,
        title: card.title,
        description: card.description || '',
        status: isCompleted ? 'completed' : 'in progress',
        priority: (card.priority || 'Medium').toLowerCase(),
        due_date: card.dueDate,
        project_id: column?.projectId,
        project_name: projectName,
        created_at: card.createdAt,
        updated_at: card.updatedAt,
        started_at: card.startedAt,
        completed_at: card.completedAt,
        start_date: card.startDate,
        is_assigned: card.administrator_id === user.id,
        is_mine: card.createdBy === user.id,
        progress: card.progress || 0,
        time_spent: card.timeSpent || 0,
        predicted_minutes: card.predictedMinutes,
        predicted_confidence: card.predictedConfidence,
        comment_count: card.commentCount || 0,
        tags: card.tags || [],
        dependencies: card.dependencies || [],
        checklist: card.checklist || [],
        attachments: card.attachments || [],
        tasks_info: card.tasks || { total: 0, completed: 0 },
        type: 'card'
      };
    });

    return tasks.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    return [];
  }
}

async function getUpcomingEvents(user, supabase, workspaceId = null) {
  try {
    let eventsQ = supabase
      .from('Events')
      .select('*')
      .eq('createdBy', user.id)
      .gte('startTime', new Date().toISOString())
      .order('startTime', { ascending: true })
      .limit(10);

    if (workspaceId) {
      const { data: wsProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('team_id', workspaceId);
      const wsProjectIds = (wsProjects || []).map(p => p.id);
      if (wsProjectIds.length === 0) return [];
      eventsQ = eventsQ.in('projectId', wsProjectIds);
    }

    const { data: events } = await eventsQ;
    return events || [];
  } catch (error) {
    console.error('Error getting events:', error);
    return [];
  }
}

async function getHabitsWithCompletions(user, supabase, workspaceId = null) {
  try {
    let habitsQ = supabase
      .from('habits')
      .select('*')
      .eq('created_by', user.id)
      .eq('is_active', 1)
      .order('created_at', { ascending: false })
      .limit(8);

    if (workspaceId) {
      habitsQ = habitsQ.eq('workspace_id', workspaceId);
    }

    const { data: habits } = await habitsQ;
    if (!habits) return [];

    const today = new Date().toISOString().split('T')[0];

    const habitsWithCompletions = await Promise.all(
      habits.map(async (habit) => {
        try {
          const { data: completion } = await supabase
            .from('habit_completions')
            .select('*')
            .eq('habit_id', habit.id)
            .eq('user_id', user.id)
            .eq('completed_date', today)
            .single();

          const isCompleted = !!completion;
          return {
            ...habit,
            completed_today: isCompleted,
            completion_value: completion?.value || 0,
            target_value: habit.target_value || 1,
            completion_percentage: habit.target_value > 0
              ? Math.round(((completion?.value || 0) / habit.target_value) * 100)
              : 0
          };
        } catch {
          return {
            ...habit,
            completed_today: false,
            completion_value: 0,
            target_value: habit.target_value || 1,
            completion_percentage: 0
          };
        }
      })
    );

    return habitsWithCompletions;
  } catch (error) {
    console.error('Error getting habits:', error);
    return [];
  }
}

function calculateAnalytics(tasks, projects) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  const tasksCompletedToday = tasks.filter(t =>
    t.status === 'completed' && new Date(t.updated_at) >= today
  ).length;

  const weeklyCompleted = tasks.filter(t =>
    t.status === 'completed' && new Date(t.updated_at) >= weekStart
  ).length;

  const overdueItems = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < today && t.status !== 'completed'
  ).length;

  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(today.getDate() + 3);

  const upcomingDeadlines = tasks.filter(t => {
    if (!t.due_date || t.status === 'completed') return false;
    const dueDate = new Date(t.due_date);
    return dueDate >= today && dueDate <= threeDaysFromNow;
  }).length;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  let productivityScore = Math.round(completionRate * 0.6);
  if (tasksCompletedToday > 0) productivityScore += 15;
  if (weeklyCompleted >= 5) productivityScore += 10;
  if (overdueItems > 0) productivityScore -= Math.min(20, overdueItems * 5);
  productivityScore = Math.max(0, Math.min(100, productivityScore));

  return {
    productivityScore,
    tasksCompletedToday,
    weeklyCompleted,
    weeklyGoal: 15,
    overdueItems,
    upcomingDeadlines,
    totalTasks,
    completedTasks,
    completionRate: Math.round(completionRate)
  };
}

function generateRecommendations(tasks, projects) {
  const recommendations = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueTasks = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < today && t.status !== 'completed'
  );

  if (overdueTasks.length > 0) {
    recommendations.push({
      id: 'overdue_tasks',
      type: 'urgent',
      title: 'Overdue Tasks',
      message: `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}. Time to catch up!`,
      action: 'Review Tasks',
      icon: 'alert-triangle',
      color: 'red'
    });
  }

  const highPriorityTasks = tasks.filter(t => t.priority === 'high' && t.status !== 'completed');
  if (highPriorityTasks.length > 0) {
    recommendations.push({
      id: 'high_priority',
      type: 'important',
      title: 'High Priority Focus',
      message: `${highPriorityTasks.length} high-priority task${highPriorityTasks.length > 1 ? 's need' : ' needs'} your attention`,
      action: 'View Tasks',
      icon: 'flame',
      color: 'orange'
    });
  }

  const completedToday = tasks.filter(t =>
    t.status === 'completed' && new Date(t.updated_at) >= today
  ).length;

  if (completedToday >= 3) {
    recommendations.push({
      id: 'great_work',
      type: 'success',
      title: 'Pawsome Progress!',
      message: `You've completed ${completedToday} tasks today. Keep up the great work!`,
      action: null,
      icon: 'award',
      color: 'green'
    });
  }

  return recommendations.slice(0, 4);
}

function calculateInsights(tasks, projects, analytics) {
  const avgProjectHealth = projects.length > 0
    ? Math.round(projects.reduce((sum, p) => sum + p.completion_percentage, 0) / projects.length)
    : 0;

  const productivityTrend = analytics.productivityScore > 75 ? 'up' :
                           analytics.productivityScore < 50 ? 'down' : 'neutral';

  const criticalTasks = tasks.filter(t => t.priority === 'high' && t.status !== 'completed').length;

  return {
    overdueTasksCount: analytics.overdueItems,
    upcomingDeadlines: analytics.upcomingDeadlines,
    avgProjectHealth,
    productivityTrend,
    criticalTasks,
    completionRate: analytics.completionRate,
    totalActiveProjects: projects.filter(p => !p.is_archived).length
  };
}

function getProjectStatus(project, completionPercentage) {
  if (completionPercentage >= 100) return 'completed';
  if (completionPercentage >= 25) return 'in progress';
  return 'not started';
}

function getProjectPriority(project) {
  if (!project.due_date) return 'medium';
  const daysUntilDue = Math.ceil((new Date(project.due_date) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysUntilDue < 7) return 'high';
  if (daysUntilDue < 30) return 'medium';
  return 'low';
}

export {
  getDashboardProjects,
  getDashboardEvents,
  getDashboardTeam,
  getDashboardHabits,
  getDashboardData,
  getUserSpecificTasks,
};
