import { useState, useEffect } from 'react';
import {
  Pencil, Trash2, FilePlus, Terminal, FolderPlus, File,
  ChevronDown, ChevronRight, X, Loader2, AlertCircle,
} from 'lucide-react';
import { agentApi } from '../../CommandCenter/commandCenterApi';

const FILE_WRITE_TOOLS  = new Set(['write_file', 'create_file']);
const FILE_EDIT_TOOLS   = new Set(['edit_file']);
const FILE_DELETE_TOOLS = new Set(['file_delete', 'delete_file']);
const FILE_CREATE_TOOLS = new Set(['create_directory']);
const FILE_COPY_TOOLS   = new Set(['file_copy', 'copy_file']);
const FILE_MOVE_TOOLS   = new Set(['file_move', 'move_file']);
const SHELL_TOOLS       = new Set(['run_command', 'run_python', 'run_node']);

const TYPE_META = {
  written:   { label: 'Written',    icon: Pencil,     dot: 'bg-blue-400',    text: 'text-blue-600 dark:text-blue-400'   },
  edited:    { label: 'Edited',     icon: Pencil,     dot: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400' },
  deleted:   { label: 'Deleted',    icon: Trash2,     dot: 'bg-red-400',     text: 'text-red-600 dark:text-red-400'     },
  created:   { label: 'Created',    icon: FilePlus,   dot: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  copied:    { label: 'Copied',     icon: FilePlus,   dot: 'bg-cyan-400',    text: 'text-cyan-600 dark:text-cyan-400' },
  moved:     { label: 'Moved',      icon: Pencil,     dot: 'bg-violet-400',  text: 'text-violet-600 dark:text-violet-400' },
  directory: { label: 'Dir',        icon: FolderPlus, dot: 'bg-indigo-400',  text: 'text-indigo-600 dark:text-indigo-400'  },
  command:   { label: 'Command',    icon: Terminal,   dot: 'bg-gray-400',    text: 'text-gray-600 dark:text-gray-400'   },
};

function extractChanges(events) {
  const seen = new Map(); // path → last change
  const commands = [];

  for (const ev of events) {
    if (ev.type !== 'tool_start') continue;
    const tool = ev.data?.tool;
    const args = ev.data?.args || {};
    const succeeded = ev.result !== undefined && !ev.result?.error && ev.result?.success !== false;

    if (!succeeded) continue;

    if (FILE_WRITE_TOOLS.has(tool) && args.path) {
      seen.set(args.path, { type: 'written', path: args.path, tool });
    } else if (FILE_EDIT_TOOLS.has(tool) && args.path) {
      if (!seen.has(args.path)) seen.set(args.path, { type: 'edited', path: args.path, tool });
    } else if (FILE_DELETE_TOOLS.has(tool) && args.path) {
      seen.set(args.path, { type: 'deleted', path: args.path, tool });
    } else if (FILE_CREATE_TOOLS.has(tool) && args.path) {
      seen.set(args.path, { type: 'directory', path: args.path, tool });
    } else if (FILE_COPY_TOOLS.has(tool) && args.destination) {
      seen.set(args.destination, { type: 'copied', path: args.destination, tool });
    } else if (FILE_MOVE_TOOLS.has(tool) && args.destination) {
      seen.set(args.destination, { type: 'moved', path: `${args.source || '?'} -> ${args.destination}`, tool });
    } else if (SHELL_TOOLS.has(tool)) {
      commands.push({
        type: 'command',
        command: args.command || args.code || '',
        tool,
        output: ev.result?.output || ev.result?.stdout || '',
      });
    }
  }

  return { files: [...seen.values()], commands };
}

function FileViewer({ path, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    agentApi.readFile(path)
      .then(res => {
        if (cancelled) return;
        if (res.success) setContent(res.content);
        else setError(res.error || 'Could not read file');
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400 truncate">{path}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-2">
          <X className="w-3 h-3" />
        </button>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading…</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {content !== null && !loading && (
        <pre className="text-[10px] font-mono text-gray-700 dark:text-gray-300 overflow-auto max-h-64 p-3 leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}

function FileChangeRow({ change }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[change.type] || TYPE_META.written;
  const Icon = meta.icon;
  const canView = change.type !== 'deleted' && change.type !== 'directory';

  return (
    <div>
      <button
        onClick={() => canView && setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
          canView ? 'hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
        <Icon className={`w-3 h-3 flex-shrink-0 ${meta.text}`} />
        <span className="flex-1 text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{change.path}</span>
        <span className={`text-[10px] font-medium ${meta.text} flex-shrink-0`}>{meta.label}</span>
        {canView && (
          open
            ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100" />
        )}
      </button>
      {open && canView && (
        <div className="px-3 pb-2">
          <FileViewer path={change.path} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function CommandRow({ change }) {
  const [open, setOpen] = useState(false);
  const truncated = change.command.length > 80 ? change.command.slice(0, 80) + '…' : change.command;
  const hasOutput = Boolean(change.output?.trim());

  return (
    <div>
      <button
        onClick={() => hasOutput && setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
          hasOutput ? 'hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-400" />
        <Terminal className="w-3 h-3 flex-shrink-0 text-gray-500" />
        <code className="flex-1 text-[10px] font-mono text-gray-600 dark:text-gray-400 truncate">{truncated}</code>
        {hasOutput && (
          open
            ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {open && hasOutput && (
        <div className="px-3 pb-2">
          <pre className="text-[10px] font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-2 max-h-32 overflow-y-auto leading-relaxed">
            {change.output}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AgentChangesPanel({ events = [] }) {
  const [collapsed, setCollapsed] = useState(false);
  const { files, commands } = extractChanges(events);
  const total = files.length + commands.length;

  if (total === 0) return null;

  return (
    <div className="mt-4 max-w-4xl mx-auto rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-800/60 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        }
        <File className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Changes</span>
        <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500">
          {files.length > 0 && `${files.length} file${files.length !== 1 ? 's' : ''}`}
          {files.length > 0 && commands.length > 0 && ' · '}
          {commands.length > 0 && `${commands.length} command${commands.length !== 1 ? 's' : ''}`}
        </span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950">
          {files.map((change, i) => (
            <FileChangeRow key={`${change.path}-${i}`} change={change} />
          ))}
          {commands.map((change, i) => (
            <CommandRow key={`cmd-${i}`} change={change} />
          ))}
        </div>
      )}
    </div>
  );
}
