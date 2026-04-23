// ToolCallCard.jsx - Inline AI action indicators
import { useState } from 'react';
import {
  CheckCircle2, XCircle, Loader2, ChevronDown,
  LayoutList, Calendar, FileText, FolderOpen, Pencil,
  List, Search, Trash2, BookOpen, Clock
} from 'lucide-react';

const TOOL_META = {
  create_task:   { icon: LayoutList,   label: 'Created task' },
  list_tasks:    { icon: List,         label: 'Listed tasks' },
  update_task:   { icon: Pencil,       label: 'Updated task' },
  complete_task: { icon: CheckCircle2, label: 'Completed task' },
  delete_task:   { icon: Trash2,       label: 'Deleted task' },
  search_tasks:  { icon: Search,       label: 'Found tasks' },
  create_event:  { icon: Calendar,     label: 'Created event' },
  list_events:   { icon: Calendar,     label: 'Listed events' },
  update_event:  { icon: Clock,        label: 'Updated event' },
  delete_event:  { icon: Trash2,       label: 'Deleted event' },
  create_note:   { icon: FileText,     label: 'Created note' },
  update_note:   { icon: Pencil,       label: 'Updated note' },
  delete_note:   { icon: Trash2,       label: 'Deleted note' },
  list_notes:    { icon: BookOpen,     label: 'Listed notes' },
  search_notes:  { icon: Search,       label: 'Found notes' },
  list_projects: { icon: FolderOpen,   label: 'Listed projects' },
};

// Format ISO date/time to readable form
function fmtDateTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch { return iso; }
}

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch { return iso; }
}

function fmtTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit'
    });
  } catch { return iso; }
}

// One-line summary shown in collapsed state
function getSummary(toolName, args, result) {
  if (!result) return null;
  if (!result.success) return result.error || result.message || 'Failed';

  switch (toolName) {
    case 'create_task': {
      const t = result.task;
      return t ? `"${t.title}"${t.column ? ` · ${t.column}` : ''}` : result.message;
    }
    case 'list_tasks':
    case 'search_tasks':
      return `${result.count ?? result.tasks?.length ?? 0} task${(result.count ?? result.tasks?.length) !== 1 ? 's' : ''} found`;
    case 'update_task': {
      const t = result.task;
      return t ? `"${t.title}"` : result.message;
    }
    case 'complete_task':
      return result.message || 'Done';
    case 'delete_task':
      return result.message || 'Deleted';
    case 'create_event': {
      const e = result.event;
      if (!e) return result.message;
      const start = fmtTime(e.start || e.startTime);
      const end = fmtTime(e.end || e.endTime);
      const date = fmtDate(e.start || e.startTime);
      return `"${e.title}" · ${date}${start ? `, ${start}${end ? `–${end}` : ''}` : ''}`;
    }
    case 'list_events':
      return `${result.count ?? result.events?.length ?? 0} event${(result.count ?? result.events?.length) !== 1 ? 's' : ''}`;
    case 'create_note': {
      const n = result.note;
      return n ? `"${n.title}"` : result.message;
    }
    case 'list_projects':
      return `${result.count ?? result.projects?.length ?? 0} project${(result.count ?? result.projects?.length) !== 1 ? 's' : ''}`;
    case 'delete_event':
    case 'delete_note':
      return result.message || 'Deleted';
    case 'update_note': {
      const n = result.note;
      return n ? `"${n.title}"` : result.message;
    }
    case 'update_event': {
      const e = result.event;
      return e ? `"${e.title}"` : result.message;
    }
    case 'list_notes':
    case 'search_notes':
      return `${result.count ?? result.notes?.length ?? 0} note${(result.count ?? result.notes?.length) !== 1 ? 's' : ''} found`;
    default:
      return result.message || 'Done';
  }
}

// Human-readable key-value details shown when expanded
function getDetails(toolName, args, result) {
  if (!result?.success) return null;
  const rows = [];

  switch (toolName) {
    case 'create_task': {
      const t = result.task;
      if (!t) break;
      if (t.title)       rows.push(['Title',    t.title]);
      if (t.column)      rows.push(['Column',   t.column]);
      if (t.priority)    rows.push(['Priority', t.priority]);
      if (t.dueDate)     rows.push(['Due',      fmtDate(t.dueDate)]);
      if (t.description) rows.push(['Notes',    t.description]);
      break;
    }
    case 'create_event': {
      const e = result.event;
      if (!e) break;
      if (e.title)                    rows.push(['Title', e.title]);
      const start = e.start || e.startTime;
      const end   = e.end   || e.endTime;
      if (start) rows.push(['Start', fmtDateTime(start)]);
      if (end)   rows.push(['End',   fmtDateTime(end)]);
      if (e.color) rows.push(['Color', e.color]);
      break;
    }
    case 'create_note': {
      const n = result.note;
      if (!n) break;
      if (n.title)   rows.push(['Title',   n.title]);
      if (n.project) rows.push(['Project', n.project]);
      break;
    }
    case 'update_task': {
      const t = result.task;
      if (!t) break;
      if (t.title)    rows.push(['Task',     t.title]);
      if (t.priority) rows.push(['Priority', t.priority]);
      if (t.dueDate)  rows.push(['Due',      fmtDate(t.dueDate)]);
      break;
    }
    case 'list_tasks':
    case 'search_tasks': {
      const tasks = result.tasks || [];
      tasks.slice(0, 5).forEach((t, i) => {
        rows.push([`${i + 1}.`, t.title + (t.priority ? ` (${t.priority})` : '')]);
      });
      if (tasks.length > 5) rows.push(['', `…and ${tasks.length - 5} more`]);
      break;
    }
    case 'list_events': {
      const events = result.events || [];
      events.slice(0, 5).forEach((e, i) => {
        const start = fmtDateTime(e.start || e.startTime);
        rows.push([`${i + 1}.`, `${e.title}${start ? ` · ${start}` : ''}`]);
      });
      if (events.length > 5) rows.push(['', `…and ${events.length - 5} more`]);
      break;
    }
    case 'list_projects': {
      const projects = result.projects || [];
      projects.slice(0, 5).forEach((p, i) => {
        rows.push([`${i + 1}.`, p.name || p.title]);
      });
      if (projects.length > 5) rows.push(['', `…and ${projects.length - 5} more`]);
      break;
    }
    case 'update_event': {
      const e = result.event;
      if (!e) break;
      if (e.title) rows.push(['Title', e.title]);
      const start = e.start || e.startTime;
      const end   = e.end   || e.endTime;
      if (start) rows.push(['Start', fmtDateTime(start)]);
      if (end)   rows.push(['End',   fmtDateTime(end)]);
      break;
    }
    case 'list_notes':
    case 'search_notes': {
      const notes = result.notes || [];
      notes.slice(0, 5).forEach((n, i) => {
        rows.push([`${i + 1}.`, n.title + (n.preview ? ` — ${n.preview.substring(0, 60)}…` : '')]);
      });
      if (notes.length > 5) rows.push(['', `…and ${notes.length - 5} more`]);
      break;
    }
    default:
      break;
  }

  return rows.length > 0 ? rows : null;
}

export function ToolCallCard({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const { name, args = {}, result, status = 'done' } = toolCall;

  const meta = TOOL_META[name] || { icon: LayoutList, label: name };
  const Icon = meta.icon;
  const isError = status === 'error' || (status === 'done' && result && !result.success);
  const isPending = status === 'pending';

  const summary = isPending ? null : getSummary(name, args, result);
  const details = (!isPending && expanded) ? getDetails(name, args, result) : null;

  return (
    <div className={`
      group flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs mb-1.5
      border transition-colors duration-150
      ${isError
        ? 'border-red-200 dark:border-red-900/60 midnight:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 midnight:bg-red-900/5'
        : 'border-gray-200 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/80 dark:bg-gray-800/30 midnight:bg-slate-800/20'
      }
    `}>
      {/* Status indicator */}
      <div className="mt-0.5 flex-shrink-0">
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 dark:text-gray-500" />}
        {!isPending && !isError && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />}
        {!isPending && isError && <XCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon className="w-3 h-3 flex-shrink-0 text-gray-400 dark:text-gray-500 midnight:text-slate-500" />
            <span className="font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 flex-shrink-0">
              {meta.label}
            </span>
            {summary && (
              <span className="text-gray-500 dark:text-gray-400 midnight:text-slate-400 truncate">
                {summary}
              </span>
            )}
            {isPending && (
              <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-500 italic">
                working…
              </span>
            )}
          </div>

          {/* Expand toggle — only if there are details */}
          {!isPending && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity ml-1"
              aria-label="Toggle details"
            >
              <ChevronDown className={`w-3 h-3 text-gray-500 dark:text-gray-400 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
            </button>
          )}
        </div>

        {/* Expanded: human-readable rows */}
        {expanded && (
          <div className="mt-2 border-t border-gray-200 dark:border-gray-700 midnight:border-slate-700 pt-2 space-y-1">
            {details ? details.map(([key, val], i) => (
              <div key={i} className="flex gap-2">
                {key && (
                  <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-500 w-14 flex-shrink-0 text-right">
                    {key}
                  </span>
                )}
                <span className={`text-gray-700 dark:text-gray-300 midnight:text-slate-300 break-words ${!key ? 'pl-16' : ''}`}>
                  {val}
                </span>
              </div>
            )) : (
              <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-500 italic">
                {result?.message || 'No details available'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact single-line row used inside the collapsed list
function ToolCallRow({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const { name, args = {}, result, status = 'done' } = toolCall;

  const meta = TOOL_META[name] || { icon: LayoutList, label: name };
  const Icon = meta.icon;
  const isError = status === 'error' || (status === 'done' && result && !result.success);
  const isPending = status === 'pending';
  const summary = isPending ? null : getSummary(name, args, result);
  const details = expanded ? getDetails(name, args, result) : null;

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 py-0.5 text-xs text-left group"
      >
        <span className="flex-shrink-0">
          {isPending && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          {!isPending && !isError && <CheckCircle2 className="w-3 h-3 text-green-500 dark:text-green-400" />}
          {!isPending && isError && <XCircle className="w-3 h-3 text-red-500 dark:text-red-400" />}
        </span>
        <Icon className="w-3 h-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />
        <span className="text-gray-600 dark:text-gray-400 midnight:text-slate-400 flex-shrink-0">
          {meta.label}
        </span>
        {summary && (
          <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-500 truncate">
            {summary}
          </span>
        )}
        {isPending && (
          <span className="text-gray-400 dark:text-gray-600 midnight:text-slate-600 italic flex-shrink-0">working…</span>
        )}
        {!isPending && (
          <ChevronDown className={`w-3 h-3 ml-auto flex-shrink-0 text-gray-400 opacity-0 group-hover:opacity-60 transition-all ${expanded ? '' : '-rotate-90'}`} />
        )}
      </button>

      {expanded && (
        <div className="mt-1 mb-1 ml-8 pl-2 border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700 py-1 space-y-0.5">
          {details ? details.map(([key, val], i) => (
            <div key={i} className="flex gap-2 text-xs">
              {key && (
                <span className="text-gray-400 dark:text-gray-500 w-12 flex-shrink-0 text-right">{key}</span>
              )}
              <span className={`text-gray-600 dark:text-gray-300 break-words ${!key ? 'pl-14' : ''}`}>{val}</span>
            </div>
          )) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              {result?.message || 'No details'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallList({ toolCalls }) {
  const [expanded, setExpanded] = useState(false);

  if (!toolCalls || toolCalls.length === 0) return null;

  const hasPending = toolCalls.some(tc => tc.status === 'pending');
  const hasError = toolCalls.some(
    tc => tc.status === 'error' || (tc.status === 'done' && tc.result && !tc.result.success)
  );
  const count = toolCalls.length;
  const label = count === 1 ? '1 tool call' : `${count} tool calls`;

  return (
    <div className="mb-3">
      {/* Summary toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-slate-200 transition-colors group"
      >
        {hasPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
          : hasError
            ? <XCircle className="w-3.5 h-3.5 text-red-400" />
            : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />
        }
        <span className="font-medium">{label}</span>
        <ChevronDown className={`w-3 h-3 opacity-50 group-hover:opacity-100 transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </button>

      {/* Expanded rows */}
      {expanded && (
        <div className="mt-1.5 ml-1 pl-3 border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700 space-y-0.5">
          {toolCalls.map((tc, i) => (
            <ToolCallRow key={tc.id || `tc_${i}`} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ToolCallCard;
