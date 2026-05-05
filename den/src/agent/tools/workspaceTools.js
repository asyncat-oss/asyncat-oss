// den/src/agent/tools/workspaceTools.js
import db from '../../db/client.js';
import { PermissionLevel } from './toolRegistry.js';

function getCardForWorkspace(cardId, workspaceId) {
  return db.prepare(`
    SELECT c.*, col.title AS column_title, col.isCompletionColumn AS is_completion_column,
           p.id AS project_id, p.name AS project_name
    FROM Cards c
    JOIN Columns col ON col.id = c.columnId
    JOIN projects p ON p.id = col.projectId
    WHERE c.id = ? AND p.team_id = ?
    LIMIT 1
  `).get(cardId, workspaceId);
}

function parseJson(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function summarizeCard(row) {
  const checklist = parseJson(row.checklist, []);
  const tasks = parseJson(row.tasks, { total: 0, completed: 0 });
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.dueDate,
    startDate: row.startDate,
    progress: row.progress || 0,
    tasks,
    checklist,
    columnId: row.columnId,
    columnTitle: row.column_title,
    isCompletionColumn: Boolean(row.is_completion_column),
    projectId: row.project_id,
    projectName: row.project_name,
    updatedAt: row.updatedAt,
  };
}

export const workspaceTools = [
  {
    name: 'get_notes',
    description: 'Retrieve recent notes from the user\'s workspace.',
    permission: 'safe',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of notes to retrieve. Default is 5.' }
      }
    },
    execute: async (args, context) => {
      const limit = args.limit || 5;
      const rows = db.prepare('SELECT id, title, content, updated_at FROM notes WHERE user_id = ? AND workspace_id = ? ORDER BY updated_at DESC LIMIT ?')
        .all(context.userId, context.workspaceId, limit);
      return { success: true, count: rows.length, notes: rows };
    }
  },
  {
    name: 'create_note',
    description: 'Create a new note in the workspace.',
    permission: 'moderate',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the note' },
        content: { type: 'string', description: 'Content of the note (Markdown supported)' }
      },
      required: ['title', 'content']
    },
    execute: async (args, context) => {
      const { title, content } = args;
      const id = 'note_' + Date.now() + Math.random().toString(36).substr(2, 5);
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO notes (id, user_id, workspace_id, title, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, context.userId, context.workspaceId, title, content, now, now);
      return { success: true, message: `Created note: ${title}`, note_id: id };
    }
  },
  {
    name: 'get_tasks',
    description: 'Retrieve tasks (Cards) from the workspace Kanban board.',
    permission: 'safe',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of tasks to retrieve. Default is 10.' },
        status: { type: 'string', description: 'Filter by status (e.g. todo, in-progress, done)' }
      }
    },
    execute: async (args, context) => {
      const limit = args.limit || 10;
      try {
        const status = String(args.status || '').toLowerCase();
        let rows = db.prepare(`
          SELECT c.*, col.title AS column_title, col.isCompletionColumn AS is_completion_column,
                 p.id AS project_id, p.name AS project_name
          FROM Cards c
          JOIN Columns col ON col.id = c.columnId
          JOIN projects p ON p.id = col.projectId
          WHERE p.team_id = ?
          ORDER BY c.updatedAt DESC
          LIMIT ?
        `).all(context.workspaceId, limit);

        if (status) {
          rows = rows.filter(row => {
            const title = String(row.column_title || '').toLowerCase();
            if (status === 'done' || status === 'completed') return Boolean(row.is_completion_column) || row.progress === 100;
            if (status === 'todo') return title.includes('todo') || title.includes('to do');
            if (status === 'in-progress' || status === 'in progress') return title.includes('progress') || title.includes('doing');
            return title.includes(status);
          });
        }

        return { success: true, count: rows.length, tasks: rows.map(summarizeCard) };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },
  {
    name: 'update_task_status',
    description: 'Move a workspace task card to another status column by column id or exact column title.',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Task card id.' },
        columnId: { type: 'string', description: 'Destination column id.' },
        columnTitle: { type: 'string', description: 'Destination column title when id is unknown.' }
      },
      required: ['cardId']
    },
    execute: async (args, context) => {
      try {
        const card = getCardForWorkspace(args.cardId, context.workspaceId);
        if (!card) return { success: false, error: 'Task card not found in this workspace.' };

        let dest = null;
        if (args.columnId) {
          dest = db.prepare(`
            SELECT col.* FROM Columns col
            JOIN projects p ON p.id = col.projectId
            WHERE col.id = ? AND p.team_id = ?
            LIMIT 1
          `).get(args.columnId, context.workspaceId);
        } else if (args.columnTitle) {
          dest = db.prepare(`
            SELECT col.* FROM Columns col
            JOIN projects p ON p.id = col.projectId
            WHERE lower(col.title) = lower(?) AND p.id = ? AND p.team_id = ?
            LIMIT 1
          `).get(args.columnTitle, card.project_id, context.workspaceId);
        }

        if (!dest) return { success: false, error: 'Destination column not found.' };
        const maxOrder = db.prepare('SELECT COALESCE(MAX("order"), 0) AS max_order FROM Cards WHERE columnId = ?').get(dest.id)?.max_order || 0;
        const now = new Date().toISOString();
        db.prepare(`
          UPDATE Cards
          SET columnId = ?, "order" = ?, updatedAt = ?,
              startedAt = COALESCE(startedAt, ?),
              completedAt = CASE WHEN ? THEN ? ELSE completedAt END
          WHERE id = ?
        `).run(dest.id, maxOrder + 1, now, now, dest.isCompletionColumn ? 1 : 0, now, card.id);

        return { success: true, message: `Moved "${card.title}" to ${dest.title}.`, task: { id: card.id, columnId: dest.id, columnTitle: dest.title } };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },
  {
    name: 'update_task_subtask',
    description: 'Mark one checklist subtask on a task card complete or incomplete.',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Task card id.' },
        subtaskId: { type: 'string', description: 'Checklist item id.' },
        text: { type: 'string', description: 'Checklist text to match if id is unknown.' },
        completed: { type: 'boolean', description: 'Whether the subtask is complete.' }
      },
      required: ['cardId', 'completed']
    },
    execute: async (args, context) => {
      try {
        const card = getCardForWorkspace(args.cardId, context.workspaceId);
        if (!card) return { success: false, error: 'Task card not found in this workspace.' };
        const checklist = parseJson(card.checklist, []);
        const index = checklist.findIndex(item =>
          (args.subtaskId && String(item.id) === String(args.subtaskId)) ||
          (args.text && String(item.text || '').trim().toLowerCase() === String(args.text).trim().toLowerCase())
        );
        if (index < 0) return { success: false, error: 'Subtask not found.' };

        checklist[index] = { ...checklist[index], completed: Boolean(args.completed) };
        const completedCount = checklist.filter(item => item.completed).length;
        const progress = checklist.length ? Math.round((completedCount / checklist.length) * 100) : 0;
        db.prepare(`
          UPDATE Cards
          SET checklist = ?, tasks = ?, progress = ?, updatedAt = ?
          WHERE id = ?
        `).run(
          JSON.stringify(checklist),
          JSON.stringify({ completed: completedCount, total: checklist.length }),
          progress,
          new Date().toISOString(),
          card.id
        );

        return { success: true, message: `Updated subtask "${checklist[index].text || checklist[index].id}".`, progress };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },
  {
    name: 'append_task_note',
    description: 'Append a short progress note to a task card description.',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Task card id.' },
        note: { type: 'string', description: 'Progress note to append.' }
      },
      required: ['cardId', 'note']
    },
    execute: async (args, context) => {
      try {
        const card = getCardForWorkspace(args.cardId, context.workspaceId);
        if (!card) return { success: false, error: 'Task card not found in this workspace.' };
        const stamp = new Date().toISOString();
        const nextDescription = [card.description || '', `\n\nAgent note (${stamp}):\n${args.note}`].join('').trim();
        db.prepare('UPDATE Cards SET description = ?, updatedAt = ? WHERE id = ?').run(nextDescription, stamp, card.id);
        return { success: true, message: `Added note to "${card.title}".` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },
  {
    name: 'get_events',
    description: 'Retrieve calendar events for the user.',
    permission: 'safe',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events. Default 5.' }
      }
    },
    execute: async (args, context) => {
      const limit = args.limit || 5;
      try {
        const rows = db.prepare('SELECT id, title, start, end FROM Events WHERE user_id = ? AND workspace_id = ? ORDER BY start DESC LIMIT ?')
          .all(context.userId, context.workspaceId, limit);
        return { success: true, count: rows.length, events: rows };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }
];
