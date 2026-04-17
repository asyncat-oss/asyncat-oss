// toolExecutor.js - Execute AI tool calls against Supabase
import { v4 as uuidv4 } from 'uuid';

/**
 * Execute a named tool with given args
 * @param {string} toolName
 * @param {object} args
 * @param {{ userId: string, supabase: object, workspaceId: string }} context
 */
export async function executeTool(toolName, args, context) {
  const { userId, supabase, workspaceId } = context;

  try {
    switch (toolName) {
      case 'create_task':
        return await createTask(args, userId, supabase);
      case 'list_tasks':
        return await listTasks(args, supabase);
      case 'update_task':
        return await updateTask(args, userId, supabase);
      case 'create_event':
        return await createEvent(args, userId, supabase);
      case 'list_events':
        return await listEvents(args, userId, supabase);
      case 'create_note':
        return await createNote(args, userId, supabase);
      case 'search_tasks':
        return await searchTasks(args, supabase);
      case 'complete_task':
        return await completeTask(args, userId, supabase);
      case 'delete_task':
        return await deleteTask(args, supabase);
      case 'list_projects':
        return await listProjects(userId, supabase, workspaceId);
      case 'delete_event':
        return await deleteEvent(args, supabase);
      case 'delete_note':
        return await deleteNote(args, supabase);
      case 'update_note':
        return await updateNote(args, userId, supabase);
      case 'update_event':
        return await updateEvent(args, userId, supabase);
      case 'list_notes':
        return await listNotes(args, supabase);
      case 'search_notes':
        return await searchNotes(args, supabase);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`Tool execution error [${toolName}]:`, err);
    return { success: false, error: err.message || 'Tool execution failed' };
  }
}

// ─── create_task ─────────────────────────────────────────────────────────────

async function createTask(args, userId, supabase) {
  const { project_id, title, description, priority, due_date, column_name } = args;

  // Get columns for this project ordered by position
  const { data: columns, error: colError } = await supabase
    .schema('kanban')
    .from('Columns')
    .select('id, title, order')
    .eq('projectId', project_id)
    .order('order', { ascending: true });

  if (colError || !columns || columns.length === 0) {
    return {
      success: false,
      error: 'No kanban columns found for this project. Make sure the project has a kanban board.'
    };
  }

  // Find target column — fuzzy match on name, else first column
  let targetColumn = columns[0];
  if (column_name) {
    const lower = column_name.toLowerCase();
    const found = columns.find(c =>
      c.title.toLowerCase().includes(lower) || lower.includes(c.title.toLowerCase())
    );
    if (found) targetColumn = found;
  }

  // Get current max order in that column so we append to the end
  const { data: existingCards } = await supabase
    .schema('kanban')
    .from('Cards')
    .select('order')
    .eq('columnId', targetColumn.id)
    .order('order', { ascending: false })
    .limit(1);

  const newOrder = existingCards?.length > 0 ? existingCards[0].order + 1000 : 1000;

  const cardData = {
    id: uuidv4(),
    title,
    description: description || null,
    priority: priority || 'Medium',
    dueDate: due_date ? new Date(due_date).toISOString() : null,
    columnId: targetColumn.id,
    order: newOrder,
    createdBy: userId,
    updatedBy: userId
  };

  const { data: card, error } = await supabase
    .schema('kanban')
    .from('Cards')
    .insert(cardData)
    .select('id, title, priority, dueDate')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    task: {
      id: card.id,
      title: card.title,
      priority: card.priority,
      column: targetColumn.title,
      due_date: card.dueDate
    },
    message: `Created task "${title}" in the "${targetColumn.title}" column`
  };
}

// ─── list_tasks ───────────────────────────────────────────────────────────────

async function listTasks(args, supabase) {
  const { project_id, column_name, limit = 20 } = args;

  // Get all columns for this project
  const { data: columns, error: colError } = await supabase
    .schema('kanban')
    .from('Columns')
    .select('id, title')
    .eq('projectId', project_id);

  if (colError || !columns || columns.length === 0) {
    return { success: false, error: 'No kanban columns found for this project' };
  }

  // Filter columns by name if requested
  let targetColumnIds = columns.map(c => c.id);
  if (column_name) {
    const lower = column_name.toLowerCase();
    const matched = columns.filter(c => c.title.toLowerCase().includes(lower));
    if (matched.length > 0) targetColumnIds = matched.map(c => c.id);
  }

  const { data: cards, error } = await supabase
    .schema('kanban')
    .from('Cards')
    .select('id, title, description, priority, dueDate, columnId')
    .in('columnId', targetColumnIds)
    .order('order', { ascending: true })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  const columnMap = Object.fromEntries(columns.map(c => [c.id, c.title]));

  return {
    success: true,
    tasks: (cards || []).map(c => ({
      id: c.id,
      title: c.title,
      priority: c.priority,
      column: columnMap[c.columnId] || 'Unknown',
      due_date: c.dueDate
    })),
    count: cards?.length || 0
  };
}

// ─── update_task ──────────────────────────────────────────────────────────────

async function updateTask(args, userId, supabase) {
  const { task_id, title, description, priority, due_date, column_name, project_id } = args;

  const updates = {
    updatedBy: userId,
    updatedAt: new Date().toISOString()
  };

  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (priority !== undefined) updates.priority = priority;
  if (due_date !== undefined) updates.dueDate = due_date ? new Date(due_date).toISOString() : null;

  // Move to different column if requested
  if (column_name && project_id) {
    const { data: columns } = await supabase
      .schema('kanban')
      .from('Columns')
      .select('id, title')
      .eq('projectId', project_id);

    if (columns) {
      const lower = column_name.toLowerCase();
      const found = columns.find(c => c.title.toLowerCase().includes(lower));
      if (found) updates.columnId = found.id;
    }
  }

  const { data: card, error } = await supabase
    .schema('kanban')
    .from('Cards')
    .update(updates)
    .eq('id', task_id)
    .select('id, title, priority, dueDate')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    task: { id: card.id, title: card.title, priority: card.priority },
    message: `Updated task "${card.title}"`
  };
}

// ─── create_event ─────────────────────────────────────────────────────────────

async function createEvent(args, userId, supabase) {
  const { title, start_time, end_time, description, project_id, is_all_day, color } = args;

  const eventData = {
    id: uuidv4(),
    title,
    startTime: new Date(start_time).toISOString(),
    endTime: new Date(end_time).toISOString(),
    description: description || null,
    projectId: project_id || null,
    isAllDay: is_all_day || false,
    color: color || 'purple',
    status: 'confirmed',
    attendees: [],
    reminders: [],
    createdBy: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const { data: event, error } = await supabase
    .from('Events')
    .insert(eventData)
    .select('id, title, startTime, endTime')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    event: {
      id: event.id,
      title: event.title,
      start: event.startTime,
      end: event.endTime
    },
    message: `Created event "${title}" on ${new Date(start_time).toLocaleDateString()}`
  };
}

// ─── list_events ──────────────────────────────────────────────────────────────

async function listEvents(args, userId, supabase) {
  const { from_date, to_date, project_id } = args;

  const fromDate = from_date ? new Date(from_date) : new Date();
  const toDate = to_date ? new Date(to_date) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  let query = supabase
    .from('Events')
    .select('id, title, startTime, endTime, isAllDay, projectId')
    .gte('startTime', fromDate.toISOString())
    .lte('startTime', toDate.toISOString())
    .order('startTime', { ascending: true })
    .limit(20);

  if (project_id) query = query.eq('projectId', project_id);

  const { data: events, error } = await query;

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    events: (events || []).map(e => ({
      id: e.id,
      title: e.title,
      start: e.startTime,
      end: e.endTime,
      all_day: e.isAllDay
    })),
    count: events?.length || 0
  };
}

// ─── create_note ──────────────────────────────────────────────────────────────

async function createNote(args, userId, supabase) {
  const { project_id, title, content } = args;

  const noteData = {
    id: uuidv4(),
    title: title || 'Untitled Note',
    content: content || '',
    projectid: project_id,
    createdby: userId,
    updated_by: userId,
    metadata: {}
  };

  const { data: note, error } = await supabase
    .from('notes')
    .insert(noteData)
    .select('id, title')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    note: { id: note.id, title: note.title },
    message: `Created note "${title}"`
  };
}

// ─── search_tasks ─────────────────────────────────────────────────────────────

async function searchTasks(args, supabase) {
  const { project_id, query, limit = 10 } = args;

  // Get all columns for this project
  const { data: columns } = await supabase
    .schema('kanban')
    .from('Columns')
    .select('id, title')
    .eq('projectId', project_id);

  if (!columns || columns.length === 0) {
    return { success: false, error: 'No kanban columns found for this project' };
  }

  const columnIds = columns.map(c => c.id);
  const columnMap = Object.fromEntries(columns.map(c => [c.id, c.title]));

  // Full-text search via ilike on title and description
  const { data: cards, error } = await supabase
    .schema('kanban')
    .from('Cards')
    .select('id, title, description, priority, dueDate, columnId')
    .in('columnId', columnIds)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(limit);

  if (error) return { success: false, error: error.message };

  if (!cards || cards.length === 0) {
    return {
      success: true,
      tasks: [],
      count: 0,
      message: `No tasks found matching "${query}"`
    };
  }

  return {
    success: true,
    tasks: cards.map(c => ({
      id: c.id,
      title: c.title,
      priority: c.priority,
      column: columnMap[c.columnId] || 'Unknown',
      due_date: c.dueDate
    })),
    count: cards.length
  };
}

// ─── complete_task ────────────────────────────────────────────────────────────

async function completeTask(args, userId, supabase) {
  const { task_id, project_id } = args;

  // Find the completion/done column for this project
  const { data: columns } = await supabase
    .schema('kanban')
    .from('Columns')
    .select('id, title, isCompletionColumn')
    .eq('projectId', project_id);

  if (!columns || columns.length === 0) {
    return { success: false, error: 'No kanban columns found for this project' };
  }

  // Prefer a column flagged as completion column, then fall back to last column or title match
  let doneColumn =
    columns.find(c => c.isCompletionColumn) ||
    columns.find(c => /done|complete|finished|closed/i.test(c.title)) ||
    columns[columns.length - 1]; // last column as fallback

  const { data: card, error } = await supabase
    .schema('kanban')
    .from('Cards')
    .update({
      columnId: doneColumn.id,
      completedAt: new Date().toISOString(),
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq('id', task_id)
    .select('id, title')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    task: { id: card.id, title: card.title, column: doneColumn.title },
    message: `Marked "${card.title}" as complete → moved to "${doneColumn.title}"`
  };
}

// ─── delete_task ──────────────────────────────────────────────────────────────

async function deleteTask(args, supabase) {
  const { task_id } = args;

  // Fetch title first for confirmation message
  const { data: card } = await supabase
    .schema('kanban')
    .from('Cards')
    .select('id, title')
    .eq('id', task_id)
    .single();

  const { error } = await supabase
    .schema('kanban')
    .from('Cards')
    .delete()
    .eq('id', task_id);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    message: `Deleted task "${card?.title || task_id}"`
  };
}

// ─── list_projects ────────────────────────────────────────────────────────────

async function listProjects(userId, supabase, workspaceId) {
  let query = supabase
    .from('projects')
    .select('id, name, emoji, description, due_date')
    .eq('is_archived', false);

  if (workspaceId) query = query.eq('team_id', workspaceId);

  const { data: projects, error } = await query.order('name');

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    projects: (projects || []).map(p => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji || '📁',
      due_date: p.due_date
    })),
    count: projects?.length || 0
  };
}

// ─── delete_event ─────────────────────────────────────────────────────────────

async function deleteEvent(args, supabase) {
  const { event_id } = args;

  const { data: event } = await supabase
    .from('Events')
    .select('id, title')
    .eq('id', event_id)
    .single();

  const { error } = await supabase
    .from('Events')
    .delete()
    .eq('id', event_id);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    message: `Deleted event "${event?.title || event_id}"`
  };
}

// ─── delete_note ──────────────────────────────────────────────────────────────

async function deleteNote(args, supabase) {
  const { note_id } = args;

  const { data: note } = await supabase
    .from('notes')
    .select('id, title')
    .eq('id', note_id)
    .single();

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', note_id);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    message: `Deleted note "${note?.title || note_id}"`
  };
}

// ─── update_note ──────────────────────────────────────────────────────────────

async function updateNote(args, userId, supabase) {
  const { note_id, title, content } = args;

  const updates = { updated_by: userId };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;

  const { data: note, error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', note_id)
    .select('id, title')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    note: { id: note.id, title: note.title },
    message: `Updated note "${note.title}"`
  };
}

// ─── update_event ─────────────────────────────────────────────────────────────

async function updateEvent(args, userId, supabase) {
  const { event_id, title, start_time, end_time, description, color, is_all_day } = args;

  // Fetch current event for confirmation message
  const { data: existing } = await supabase
    .from('Events')
    .select('id, title')
    .eq('id', event_id)
    .single();

  const updates = {
    updatedAt: new Date().toISOString()
  };

  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (color !== undefined) updates.color = color;
  if (is_all_day !== undefined) updates.isAllDay = is_all_day;
  if (start_time !== undefined) updates.startTime = new Date(start_time).toISOString();
  if (end_time !== undefined) updates.endTime = new Date(end_time).toISOString();

  const { data: event, error } = await supabase
    .from('Events')
    .update(updates)
    .eq('id', event_id)
    .select('id, title, startTime, endTime')
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    event: {
      id: event.id,
      title: event.title,
      start: event.startTime,
      end: event.endTime
    },
    message: `Updated event "${existing?.title || event.title}"`
  };
}

// ─── list_notes ───────────────────────────────────────────────────────────────

async function listNotes(args, supabase) {
  const { project_id, limit = 10 } = args;

  const { data: notes, error } = await supabase
    .from('notes')
    .select('id, title, content, created_at')
    .eq('projectid', project_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    notes: (notes || []).map(n => ({
      id: n.id,
      title: n.title,
      // Return a short preview of content (first 200 chars)
      preview: (n.content || '').substring(0, 200).trim(),
      created_at: n.created_at
    })),
    count: notes?.length || 0
  };
}

// ─── search_notes ─────────────────────────────────────────────────────────────

async function searchNotes(args, supabase) {
  const { project_id, query, limit = 10 } = args;

  const { data: notes, error } = await supabase
    .from('notes')
    .select('id, title, content, created_at')
    .eq('projectid', project_id)
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  if (!notes || notes.length === 0) {
    return {
      success: true,
      notes: [],
      count: 0,
      message: `No notes found matching "${query}"`
    };
  }

  return {
    success: true,
    notes: notes.map(n => ({
      id: n.id,
      title: n.title,
      // Return a short preview of content (first 300 chars)
      preview: (n.content || '').substring(0, 300).trim(),
      created_at: n.created_at
    })),
    count: notes.length
  };
}

