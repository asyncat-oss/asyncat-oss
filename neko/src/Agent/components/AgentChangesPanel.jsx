import { useState, useEffect } from 'react';
import {
  Pencil, Trash2, FilePlus, Terminal, FolderPlus, File,
  ChevronDown, ChevronRight, X, Loader2, AlertCircle,
  RefreshCw, RotateCcw, CheckCircle2, ShieldAlert,
} from 'lucide-react';
import { agentApi } from '../../CommandCenter/commandCenterApi';
import Portal from '../../components/Portal';

const FILE_WRITE_TOOLS  = new Set(['write_file', 'create_file']);
const FILE_EDIT_TOOLS   = new Set(['edit_file']);
const FILE_DELETE_TOOLS = new Set(['file_delete', 'delete_file']);
const FILE_CREATE_TOOLS = new Set(['create_directory']);
const FILE_COPY_TOOLS   = new Set(['file_copy', 'copy_file']);
const FILE_MOVE_TOOLS   = new Set(['file_move', 'move_file']);
const SHELL_TOOLS       = new Set(['run_command', 'run_python', 'run_node']);

const TYPE_META = {
  written:   { label: 'Written',    icon: Pencil,     dot: 'bg-blue-400',    text: 'text-blue-600 dark:text-blue-400' },
  edited:    { label: 'Edited',     icon: Pencil,     dot: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400' },
  deleted:   { label: 'Deleted',    icon: Trash2,     dot: 'bg-red-400',     text: 'text-red-600 dark:text-red-400'     },
  created:   { label: 'Created',    icon: FilePlus,   dot: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  copied:    { label: 'Copied',     icon: FilePlus,   dot: 'bg-cyan-400',    text: 'text-cyan-600 dark:text-cyan-400' },
  moved:     { label: 'Moved',      icon: Pencil,     dot: 'bg-violet-400',  text: 'text-violet-600 dark:text-violet-400' },
  directory: { label: 'Dir',        icon: FolderPlus, dot: 'bg-indigo-400',  text: 'text-indigo-600 dark:text-indigo-400'  },
  command:   { label: 'Command',    icon: Terminal,   dot: 'bg-gray-400',    text: 'text-gray-600 dark:text-gray-400'   },
};

const STATE_META = {
  exists: { label: 'Exists', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  directory: { label: 'Directory', text: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  missing: { label: 'Missing now', text: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-900/20' },
  deleted: { label: 'Deleted', text: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-900/20' },
  changed_since_agent: { label: 'Changed since agent', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  unknown: { label: 'Unknown', text: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800' },
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
    const base = {
      tool,
      workingDir: ev.data?.workingDir || null,
      timestamp: ev.data?.completedAt || ev.data?.timestamp || null,
    };

    if (FILE_WRITE_TOOLS.has(tool) && args.path) {
      seen.set(args.path, { ...base, type: ev.result?.action === 'created' ? 'created' : 'written', path: args.path });
    } else if (FILE_EDIT_TOOLS.has(tool) && args.path) {
      if (!seen.has(args.path)) seen.set(args.path, { ...base, type: 'edited', path: args.path });
    } else if (FILE_DELETE_TOOLS.has(tool) && args.path) {
      seen.set(args.path, { ...base, type: 'deleted', path: args.path });
    } else if (FILE_CREATE_TOOLS.has(tool) && args.path) {
      seen.set(args.path, { ...base, type: 'directory', path: args.path });
    } else if (FILE_COPY_TOOLS.has(tool) && args.destination) {
      seen.set(args.destination, { ...base, type: 'copied', path: args.destination, source: args.source || null });
    } else if (FILE_MOVE_TOOLS.has(tool) && args.destination) {
      seen.set(args.destination, { ...base, type: 'moved', path: args.destination, source: args.source || null });
    } else if (SHELL_TOOLS.has(tool)) {
      commands.push({
        ...base,
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
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntry(null);
    agentApi.loadEntry(path)
      .then(res => {
        if (cancelled) return;
        if (res.success) setEntry(res);
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
      {entry?.type === 'dir' && !loading && (
        <div className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
          Directory only. {entry.entries?.length ? `${entry.entries.length} entries.` : 'No visible entries.'}
        </div>
      )}
      {entry?.type === 'file' && !loading && (
        <pre className="text-[10px] font-mono text-gray-700 dark:text-gray-300 overflow-auto max-h-64 p-3 leading-relaxed">
          {entry.content}
        </pre>
      )}
    </div>
  );
}

function StateBadge({ state }) {
  const meta = STATE_META[state?.state || 'unknown'] || STATE_META.unknown;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${meta.bg} ${meta.text} flex-shrink-0`}>
      {meta.label}
    </span>
  );
}

function FileChangeRow({ change, state }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[change.type] || TYPE_META.written;
  const Icon = meta.icon;
  const canView = state?.exists !== false && change.type !== 'deleted';
  const displayPath = change.source ? `${change.source} -> ${change.path}` : change.path;

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
        <span className="flex-1 text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{displayPath}</span>
        <span className={`text-[10px] font-medium ${meta.text} flex-shrink-0`}>{meta.label}</span>
        <StateBadge state={state} />
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
      {!canView && state?.exists === false && (
        <div className="px-3 pb-2 text-[11px] text-red-500 dark:text-red-400">
          File no longer exists on disk.
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

function RevertRunModal({ open, goal, total, checkpoint, reverting, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div
          className="w-full max-w-lg rounded-2xl border border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-red-50/60 dark:bg-red-900/10 midnight:bg-red-950/20 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">
                  Revert this agent run?
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                  This restores the workspace to the baseline captured before the run's first mutating tool.
                </p>
              </div>
            </div>
            {!reverting && (
              <button
                onClick={onCancel}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="px-5 py-4 space-y-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Goal
              </div>
              <p className="mt-1 text-sm leading-relaxed text-gray-800 dark:text-gray-200 midnight:text-slate-200 break-words">
                {goal || 'Agent run'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Affected items
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {total}
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Checkpoint
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {checkpoint?.kind === 'dir_snapshot' ? 'Snapshot' : checkpoint?.kind || 'Baseline'}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-red-100 dark:border-red-900/50 bg-red-50/70 dark:bg-red-900/10 px-3 py-2 text-xs leading-relaxed text-red-700 dark:text-red-300">
              Any changes made after the checkpoint may be overwritten. This cannot be undone from this dialog.
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 flex justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={reverting}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-950 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={reverting}
              className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-sm font-medium text-white inline-flex items-center gap-2 transition-colors"
            >
              {reverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {reverting ? 'Reverting...' : 'Revert run'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default function AgentChangesPanel({ events = [], sessionId = null, session = null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [stateData, setStateData] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateError, setStateError] = useState(null);
  const [reverting, setReverting] = useState(false);
  const [revertMessage, setRevertMessage] = useState(null);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const fallbackChanges = extractChanges(events);
  const files = stateData?.changes?.files || fallbackChanges.files;
  const commands = stateData?.changes?.commands || fallbackChanges.commands;
  const total = files.length + commands.length;
  const checkpoint = stateData?.checkpoint || session?.scratchpad?.baselineCheckpoint || null;
  const revert = stateData?.revert || null;

  const refreshState = () => {
    if (!sessionId) return;
    setStateLoading(true);
    setStateError(null);
    agentApi.getSessionChangesState(sessionId)
      .then(res => {
        if (res.success) setStateData(res);
        else setStateError(res.error || 'Could not refresh state');
      })
      .catch(err => setStateError(err.message || 'Could not refresh state'))
      .finally(() => setStateLoading(false));
  };

  useEffect(() => {
    refreshState();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRevert = async () => {
    if (!sessionId || !revert?.available) return;
    setReverting(true);
    setRevertMessage(null);
    try {
      const res = await agentApi.revertSession(sessionId);
      if (!res.success) throw new Error(res.error || 'Revert failed');
      setRevertMessage({ type: 'success', text: res.message || 'Run reverted.' });
      setShowRevertConfirm(false);
      refreshState();
    } catch (err) {
      setRevertMessage({ type: 'error', text: err.message || 'Revert failed' });
    } finally {
      setReverting(false);
    }
  };

  if (total === 0) return null;

  return (
    <div className="mt-4 max-w-4xl mx-auto rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-800/60">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 text-left min-w-0 flex-1"
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          }
          <File className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Changes from this run</span>
          <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500 truncate">
            {files.length > 0 && `${files.length} file${files.length !== 1 ? 's' : ''}`}
            {files.length > 0 && commands.length > 0 && ' · '}
            {commands.length > 0 && `${commands.length} command${commands.length !== 1 ? 's' : ''}`}
          </span>
        </button>

        {sessionId && (
          <button
            onClick={refreshState}
            disabled={stateLoading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-[10px] font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${stateLoading ? 'animate-spin' : ''}`} />
            Refresh state
          </button>
        )}
        {checkpoint && (
          <button
            onClick={() => setShowRevertConfirm(true)}
            disabled={!revert?.available || reverting}
            title={revert?.available ? 'Revert this run' : (revert?.reason || 'Revert unavailable')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 dark:border-red-800 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            {reverting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            {revert?.available ? 'Revert run' : 'Revert unavailable'}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950">
          {stateError && (
            <div className="px-3 py-2 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-3 h-3" /> {stateError}
            </div>
          )}
          {revertMessage && (
            <div className={`px-3 py-2 text-[11px] flex items-center gap-2 ${revertMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {revertMessage.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {revertMessage.text}
            </div>
          )}
          {revert && !revert.available && (
            <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
              Revert unavailable: {revert.reason}
            </div>
          )}
          {files.map((change, i) => (
            <FileChangeRow
              key={`${change.path}-${i}`}
              change={change}
              state={stateData?.fileStates?.[change.path] || { state: 'unknown' }}
            />
          ))}
          {commands.map((change, i) => (
            <CommandRow key={`cmd-${i}`} change={change} />
          ))}
        </div>
      )}

      <RevertRunModal
        open={showRevertConfirm}
        goal={session?.goal || stateData?.goal}
        total={total}
        checkpoint={checkpoint}
        reverting={reverting}
        onCancel={() => !reverting && setShowRevertConfirm(false)}
        onConfirm={handleRevert}
      />
    </div>
  );
}
