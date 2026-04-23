// toolDefinitions.js - OpenAI tool schemas for workspace actions

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task/card in a project's kanban board. Use this when the user asks to create, add, or make a task, ticket, or card.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The UUID of the project to create the task in"
          },
          title: {
            type: "string",
            description: "The title of the task"
          },
          description: {
            type: "string",
            description: "Optional detailed description of the task"
          },
          priority: {
            type: "string",
            enum: ["High", "Medium", "Low"],
            description: "Task priority level (default: Medium)"
          },
          due_date: {
            type: "string",
            description: "Due date in ISO format e.g. 2026-04-15 or 2026-04-15T14:00:00Z"
          },
          column_name: {
            type: "string",
            description: "Which column/status to put the task in (e.g. 'To Do', 'In Progress'). Leave blank to use the first column."
          }
        },
        required: ["project_id", "title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List tasks/cards from a project's kanban board. Use this to look up tasks, check what's in a column, or find a task by name before updating it.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The UUID of the project"
          },
          column_name: {
            type: "string",
            description: "Filter tasks by column name (e.g. 'In Progress', 'Done')"
          },
          limit: {
            type: "number",
            description: "Maximum number of tasks to return (default: 20)"
          }
        },
        required: ["project_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task - change its title, description, priority, due date, or move it to a different column.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "The UUID of the task to update"
          },
          title: {
            type: "string",
            description: "New title for the task"
          },
          description: {
            type: "string",
            description: "New description"
          },
          priority: {
            type: "string",
            enum: ["High", "Medium", "Low"],
            description: "New priority level"
          },
          due_date: {
            type: "string",
            description: "New due date in ISO format"
          },
          column_name: {
            type: "string",
            description: "Move this task to this column name"
          },
          project_id: {
            type: "string",
            description: "Project UUID (required when changing column to find the right column)"
          }
        },
        required: ["task_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Create a calendar event. Use this when the user wants to schedule a meeting, reminder, deadline, or any time-based event.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Event title"
          },
          start_time: {
            type: "string",
            description: "Start datetime in ISO format e.g. 2026-04-15T14:00:00Z"
          },
          end_time: {
            type: "string",
            description: "End datetime in ISO format e.g. 2026-04-15T15:00:00Z"
          },
          description: {
            type: "string",
            description: "Optional event description"
          },
          project_id: {
            type: "string",
            description: "Optional UUID of the project to link this event to"
          },
          is_all_day: {
            type: "boolean",
            description: "Whether this is an all-day event (default: false)"
          },
          color: {
            type: "string",
            enum: ["purple", "blue", "green", "red", "yellow", "orange", "pink"],
            description: "Event color (default: purple)"
          }
        },
        required: ["title", "start_time", "end_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_events",
      description: "List calendar events in the workspace for a date range.",
      parameters: {
        type: "object",
        properties: {
          from_date: {
            type: "string",
            description: "Start date ISO format (default: today)"
          },
          to_date: {
            type: "string",
            description: "End date ISO format (default: 14 days from now)"
          },
          project_id: {
            type: "string",
            description: "Filter events by project UUID"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Create a note in a project. Use this when the user wants to save information, document something, or create written content in a project.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The UUID of the project to create the note in"
          },
          title: {
            type: "string",
            description: "Note title"
          },
          content: {
            type: "string",
            description: "Note content in markdown format"
          }
        },
        required: ["project_id", "title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_tasks",
      description: "Search for tasks by keyword across a project's kanban board. Use this to find a specific task by name before updating or completing it — much faster than list_tasks when you know part of the task name.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The UUID of the project to search in"
          },
          query: {
            type: "string",
            description: "Search keyword to match against task titles and descriptions"
          },
          limit: {
            type: "number",
            description: "Max results (default: 10)"
          }
        },
        required: ["project_id", "query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as complete by moving it to the Done/Completed column. Use this when the user says 'mark as done', 'complete this task', 'it's finished', etc.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "The UUID of the task to complete"
          },
          project_id: {
            type: "string",
            description: "The UUID of the project (needed to find the done column)"
          }
        },
        required: ["task_id", "project_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Permanently delete a task. Only use this when the user explicitly asks to delete/remove a task — always confirm before using this tool.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "The UUID of the task to delete"
          }
        },
        required: ["task_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_event",
      description: "Permanently delete a calendar event. Only use when the user explicitly asks to delete or cancel an event — always confirm first.",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "The UUID of the event to delete"
          }
        },
        required: ["event_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description: "Permanently delete a note. Only use when the user explicitly asks to delete or remove a note — always confirm first.",
      parameters: {
        type: "object",
        properties: {
          note_id: {
            type: "string",
            description: "The UUID of the note to delete"
          }
        },
        required: ["note_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description: "Update the title or content of an existing note.",
      parameters: {
        type: "object",
        properties: {
          note_id: {
            type: "string",
            description: "The UUID of the note to update"
          },
          title: {
            type: "string",
            description: "New title for the note"
          },
          content: {
            type: "string",
            description: "New content for the note in markdown format"
          }
        },
        required: ["note_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "List all projects in the current workspace with their IDs and names. Use this when you need to find a project UUID that you don't already have.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description: "Update an existing calendar event — change its title, description, start/end time, color, or all-day status.",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "The UUID of the event to update"
          },
          title: {
            type: "string",
            description: "New title for the event"
          },
          start_time: {
            type: "string",
            description: "New start datetime in ISO format e.g. 2026-04-15T14:00:00Z"
          },
          end_time: {
            type: "string",
            description: "New end datetime in ISO format e.g. 2026-04-15T15:00:00Z"
          },
          description: {
            type: "string",
            description: "New description for the event"
          },
          color: {
            type: "string",
            enum: ["purple", "blue", "green", "red", "yellow", "orange", "pink"],
            description: "New event color"
          },
          is_all_day: {
            type: "boolean",
            description: "Whether this is an all-day event"
          }
        },
        required: ["event_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description: "List notes from a project. Use this when the user asks what notes they have, wants to review their notes, or needs to find a note before updating or deleting it.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The UUID of the project to list notes from"
          },
          limit: {
            type: "number",
            description: "Maximum number of notes to return (default: 10)"
          }
        },
        required: ["project_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "Search for notes by keyword across a project. Use this to find a specific note by title or content before updating or deleting it.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The UUID of the project to search in"
          },
          query: {
            type: "string",
            description: "Search keyword to match against note titles and content"
          },
          limit: {
            type: "number",
            description: "Max results (default: 10)"
          }
        },
        required: ["project_id", "query"]
      }
    }
  }
];

/**
 * Build a tools context section for the system prompt
 * Includes project IDs so AI doesn't need to call list_projects first
 */
export function buildToolsSystemSection(contextData) {
  const hasProjects = contextData?.projects && contextData.projects.length > 0;

  let section = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️  WORKSPACE TOOLS - YOU CAN TAKE REAL ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have tools to create and read real data in the user's workspace.

**WHEN TO USE TOOLS:**
- "create a task / add a ticket / make a card" → create_task
- "show tasks / what's in progress / list tasks" → search_tasks or list_tasks
- "update / move / change priority / mark done" → search_tasks to find it, then update_task
- "complete / mark as done / finish task" → complete_task
- "schedule a meeting / add to calendar / create event" → create_event
- "update / reschedule / change event time or title" → list_events to find it, then update_event
- "what's on my calendar / upcoming events" → list_events
- "delete event / cancel meeting" → delete_event (confirm first)
- "create a note / save this / document this" → create_note
- "what notes do I have / show my notes" → list_notes
- "find a note / search notes" → search_notes
- "update a note / edit note content" → search_notes to find it, then update_note
- "delete note / remove note" → search_notes to find it, then delete_note (confirm first)
- Don't know a project ID → use list_projects

**CLARIFICATION RULES — always ask first when:**
1. The user mentions a project that is NOT in the list below — do not guess or hallucinate IDs
2. The request is ambiguous about WHICH project to use (e.g., they have 3 projects and didn't specify)
3. Multiple tasks match the description the user gave — ask which one before updating
4. A destructive action (delete, overwrite) is involved — always confirm

**EXECUTION RULES — use tools immediately (no need to ask) when:**
- The project is clearly identified in the message or there is only one project
- The action is safe and reversible (create, list, read)
- The intent is unambiguous

**AFTER TOOL USE:**
- Always confirm what was done in plain language
- If a tool returns success: false, tell the user what went wrong and offer alternatives
- Never pretend a failed action succeeded`;

  if (hasProjects) {
    section += `\n\n**YOUR PROJECTS (use these exact IDs — if user mentions a project NOT listed here, ask them to clarify):**`;
    contextData.projects.forEach(p => {
      const due = p.due_date ? ` — due ${new Date(p.due_date).toLocaleDateString()}` : '';
      section += `\n- ${p.emoji || '📁'} **${p.name}**${due} → id: \`${p.id}\``;
    });
  } else {
    section += `\n\n**No projects found in this workspace.** If the user asks you to create a task or note, let them know they need to create a project first.`;
  }

  section += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  return section;
}
