// DataLayer.js — Fetches user context for the AI assistant (OSS version).
// Uses the SQLite compat client. No join syntax — flat queries only.
import { supabaseCompat as defaultSupabase } from '../../../db/compat.js';

class DataLayer {
  constructor() {
    this.cache   = new Map();
    this.defaultTTL = 2 * 60 * 1000; // 2 min
  }

  setCache(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, { data, expires: Date.now() + ttl });
  }

  getCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) return cached.data;
    this.cache.delete(key);
    return null;
  }

  // Solo mode: return the user's first workspace id.
  async getCurrentWorkspaceId(userId, preferredWorkspaceId = null, supabase = defaultSupabase) {
    try {
      if (preferredWorkspaceId) return preferredWorkspaceId;

      const { data: ws } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', userId)
        .limit(1);

      if (ws && ws.length > 0) return ws[0].id;
      throw new Error('User has no workspace');
    } catch (err) {
      console.error('Error getting workspace ID:', err);
      throw new Error('Failed to determine workspace context');
    }
  }

  async getUserContext(userId, projectIds = [], workspaceId = null, supabase = defaultSupabase) {
    let effectiveWorkspaceId = null;
    try {
      effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, supabase);

      const cacheKey = `ctx_${userId}_${effectiveWorkspaceId}_${projectIds.join(',')}`;
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const hasProjectFilter = projectIds && projectIds.length > 0;

      // Workspace info
      const { data: workspaceInfo } = await supabase
        .from('workspaces').select('id, name, emoji')
        .eq('id', effectiveWorkspaceId).single();

      // Projects
      let projectsQ = supabase.from('projects')
        .select('id, name, description, emoji, due_date, team_id')
        .eq('team_id', effectiveWorkspaceId).eq('is_archived', 0);
      if (hasProjectFilter) projectsQ = projectsQ.in('id', projectIds);
      const { data: projects } = await projectsQ;

      // Tasks (assigned to user, not in completion columns)
      const { data: rawTasks } = await supabase
        .from('Cards').select('id, title, priority, dueDate, completedAt, columnId, startedAt')
        .eq('administrator_id', userId).is('completedAt', null).limit(25);

      // Enrich tasks with column info
      const columnIds = [...new Set((rawTasks || []).map(t => t.columnId))];
      let columnMap = {};
      if (columnIds.length > 0) {
        const { data: cols } = await supabase
          .from('Columns').select('id, title, isCompletionColumn, projectId')
          .in('id', columnIds);
        (cols || []).forEach(c => { columnMap[c.id] = c; });
      }

      const tasks = (rawTasks || [])
        .filter(t => !columnMap[t.columnId]?.isCompletionColumn)
        .map(t => ({
          ...t,
          column_title: columnMap[t.columnId]?.title || 'Unknown',
          project_id:   columnMap[t.columnId]?.projectId,
          urgency_status: this.calculateTaskUrgency(t.dueDate, false),
        }));

      // Events (upcoming 14 days)
      const { data: events } = await supabase
        .from('Events').select('id, title, startTime, endTime, description, projectId')
        .gte('startTime', new Date(Date.now() - 3600000).toISOString())
        .lte('startTime', new Date(Date.now() + 14 * 86400000).toISOString())
        .order('startTime', { ascending: true }).limit(15);

      // Habits
      const { data: habits } = await supabase
        .from('habits').select('id, name, category, color, icon, project_id')
        .eq('created_by', userId).eq('is_active', 1).limit(12);

      // Streaks
      const habitIds = (habits || []).map(h => h.id);
      let streakMap = {};
      if (habitIds.length > 0) {
        const { data: streaks } = await supabase
          .from('habit_streaks').select('habit_id, current_streak, longest_streak, last_completion_date')
          .in('habit_id', habitIds);
        (streaks || []).forEach(s => { streakMap[s.habit_id] = s; });
      }

      const processedTasks  = tasks.map(t => ({
        ...t,
        urgency_status: this.calculateTaskUrgency(t.dueDate, false),
      }));

      const processedEvents = (events || []).map(e => ({
        ...e,
        timing_status: this.calculateEventTiming(e.startTime),
      }));

      const processedHabits = (habits || []).map(h => ({
        ...h,
        current_streak:       streakMap[h.id]?.current_streak || 0,
        longest_streak:       streakMap[h.id]?.longest_streak || 0,
        last_completion_date: streakMap[h.id]?.last_completion_date,
        today_status:         this.calculateHabitStatus(streakMap[h.id]?.last_completion_date),
      }));

      const contextData = {
        projects:       projects || [],
        tasks:          processedTasks,
        events:         processedEvents,
        habits:         processedHabits,
        hasProjectFilter,
        projectIds:     hasProjectFilter ? projectIds : [],
        workspaceId:    effectiveWorkspaceId,
        workspaceName:  workspaceInfo?.name  || 'My Workspace',
        workspaceEmoji: workspaceInfo?.emoji || '💼',
        lastUpdated:    new Date().toISOString(),
      };

      contextData.summary = {
        totalProjects:       contextData.projects.length,
        urgentTasks:         contextData.tasks.filter(t => t.urgency_status === 'overdue' || t.urgency_status === 'due_today').length,
        todayEvents:         contextData.events.filter(e => e.timing_status === 'today' || e.timing_status === 'starting_soon').length,
        activeHabits:        contextData.habits.length,
        completedHabitsToday: contextData.habits.filter(h => h.today_status === 'completed_today').length,
      };

      this.setCache(cacheKey, contextData);
      return contextData;

    } catch (err) {
      console.error('getUserContext error:', err);
      return {
        projects: [], tasks: [], events: [], habits: [],
        hasProjectFilter: projectIds && projectIds.length > 0,
        projectIds: projectIds || [],
        workspaceId: effectiveWorkspaceId,
        workspaceName: 'My Workspace',
        workspaceEmoji: '💼',
        error: err.message,
        summary: { totalProjects: 0, urgentTasks: 0, todayEvents: 0, activeHabits: 0, completedHabitsToday: 0 },
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  calculateTaskUrgency(dueDate, isCompletionColumn) {
    if (!dueDate || isCompletionColumn) return 'normal';
    const now = new Date(), due = new Date(dueDate);
    if (due < now) return 'overdue';
    if (due < new Date(now.getTime() + 86400000)) return 'due_today';
    if (due < new Date(now.getTime() + 3 * 86400000)) return 'due_soon';
    return 'normal';
  }

  calculateEventTiming(startTime) {
    const now = new Date(), start = new Date(startTime);
    if (start < new Date(now.getTime() + 2 * 3600000) && start > now) return 'starting_soon';
    if (start >= now && start < new Date(now.getTime() + 86400000)) return 'today';
    if (start >= new Date(now.getTime() + 86400000) && start < new Date(now.getTime() + 7 * 86400000)) return 'this_week';
    return 'upcoming';
  }

  calculateHabitStatus(lastCompletionDate) {
    if (!lastCompletionDate) return 'pending';
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const d = new Date(lastCompletionDate).toDateString();
    if (d === today) return 'completed_today';
    if (d === yesterday) return 'missed_yesterday';
    return 'pending';
  }

  async executeAnalyticsQuery(userId, query, classification, projectIds = [], workspaceId = null, supabase = defaultSupabase) {
    const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, supabase);
    const cacheKey = `analytics_${userId}_${effectiveWorkspaceId}_${Buffer.from(query).toString('base64').slice(0, 20)}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const lower = query.toLowerCase();
      const hasProjectFilter = projectIds && projectIds.length > 0;
      let data = [];

      if (lower.includes('task') || lower.includes('todo')) {
        const { data: tasks } = await supabase.from('Cards')
          .select('title, priority, dueDate, columnId').eq('administrator_id', userId)
          .is('completedAt', null).limit(20);
        data = (tasks || []).map(t => ({
          'Task': t.title, 'Priority': t.priority,
          'Due': t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'None',
          'Urgency': this.calculateTaskUrgency(t.dueDate, false),
        }));
      } else if (lower.includes('project')) {
        let q = supabase.from('projects').select('name, due_date, emoji')
          .eq('team_id', effectiveWorkspaceId).eq('is_archived', 0);
        if (hasProjectFilter) q = q.in('id', projectIds);
        const { data: projects } = await q;
        data = (projects || []).map(p => ({
          'Project': `${p.emoji || '📁'} ${p.name}`,
          'Due': p.due_date ? new Date(p.due_date).toLocaleDateString() : 'No deadline',
        }));
      } else if (lower.includes('habit')) {
        const { data: habits } = await supabase.from('habits')
          .select('name, category').eq('created_by', userId).eq('is_active', 1).limit(15);
        data = (habits || []).map(h => ({ 'Habit': h.name, 'Category': h.category }));
      }

      const result = { success: true, data, count: data.length, query, classification, hasProjectFilter, projectIds, workspaceId: effectiveWorkspaceId };
      this.setCache(cacheKey, result);
      return result;
    } catch (err) {
      return { success: false, error: err.message, query, hasProjectFilter: hasProjectFilter, projectIds, workspaceId: effectiveWorkspaceId };
    }
  }
}

export function formatContext(contextData, analyticsResult, hasSelectedProjects) {
  let ctx = '';
  ctx += `WORKSPACE: ${contextData.workspaceEmoji || '💼'} ${contextData.workspaceName || 'My Workspace'}\n`;

  if (analyticsResult?.success && analyticsResult.data.length > 0) {
    ctx += `ANALYTICS RESULTS:\n`;
    const cols = Object.keys(analyticsResult.data[0]);
    ctx += `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n`;
    analyticsResult.data.forEach(row => { ctx += `| ${cols.map(c => row[c] || 'N/A').join(' | ')} |\n`; });
    ctx += '\n';
  }

  if (contextData.tasks?.length > 0) {
    const urgent = contextData.tasks.filter(t => t.urgency_status === 'overdue' || t.urgency_status === 'due_today');
    if (urgent.length > 0) {
      ctx += `URGENT TASKS:\n`;
      urgent.slice(0, 5).forEach((t, i) => {
        ctx += `${i+1}. "${t.title}"`;
        if (t.dueDate) ctx += ` (due ${new Date(t.dueDate).toLocaleDateString()})`;
        ctx += '\n';
      });
      ctx += '\n';
    }
  }

  if (contextData.projects?.length > 0) {
    ctx += `PROJECTS:\n`;
    contextData.projects.slice(0, 8).forEach((p, i) => {
      ctx += `${i+1}. ${p.emoji || '📁'} ${p.name}`;
      if (p.due_date) ctx += ` (due ${new Date(p.due_date).toLocaleDateString()})`;
      ctx += '\n';
    });
    ctx += '\n';
  }

  if (contextData.events?.length > 0) {
    ctx += `UPCOMING EVENTS:\n`;
    contextData.events.slice(0, 5).forEach((e, i) => {
      ctx += `${i+1}. "${e.title}" at ${new Date(e.startTime).toLocaleString()}\n`;
    });
    ctx += '\n';
  }

  if (contextData.habits?.length > 0) {
    ctx += `HABITS:\n`;
    contextData.habits.slice(0, 5).forEach((h, i) => {
      ctx += `${i+1}. ${h.name} — ${h.current_streak || 0} day streak\n`;
    });
    ctx += '\n';
  }

  if (!ctx.trim()) {
    ctx = 'No data available yet. Create some projects, tasks, or events to get started.';
  }

  return ctx;
}

export const dataLayer = new DataLayer();
export default dataLayer;
