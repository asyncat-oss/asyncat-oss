// den/src/agent/tools/workspaceTools.js
import db from '../../db/client.js';

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
      // Fetch cards. We join with Columns to get the status if we can, but schema might differ.
      // Doing a simple select for now based on common columns.
      let query = 'SELECT id, content, created_at FROM Cards WHERE workspace_id = ?';
      const params = [context.workspaceId];
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);
      
      try {
        const rows = db.prepare(query).all(...params);
        return { success: true, count: rows.length, tasks: rows };
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
