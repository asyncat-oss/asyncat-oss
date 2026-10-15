import { useState, useEffect } from 'react';
import {
  Pencil, Trash2, FilePlus, Terminal, FolderPlus,
  ChevronDown, ChevronRight, X, Loader2, AlertCircle,
  RotateCcw, GitCompare,
} from 'lucide-react';
import { agentApi, gitApi } from '../../api';
import Button from '../../../components/ui/Button.jsx';
import Dialog from '../../../components/ui/Dialog.jsx';
import Notice from '../../../components/ui/Notice.jsx';
import { Segmented } from '../../../components/ui/Tabs.jsx';
import UnifiedDiffViewer from '../code/UnifiedDiffViewer';
import { currentToolName, editedPaths } from '../../utils/toolNames.js';

const FILE_WRITE_TOOLS  = new Set(['write_file', 'create_file']);
const FILE_EDIT_TOOLS   = new Set(['edit_file', 'apply_patch']);
const FILE_DELETE_TOOLS = new Set(['file_delete', 'delete_file']);
const FILE_CREATE_TOOLS = new Set(['create_directory']);
const FILE_COPY_TOOLS   = new Set(['file_copy', 'copy_file']);
const FILE_MOVE_TOOLS   = new Set(['file_move', 'move_file']);
const SHELL_TOOLS       = new Set(['run_command', 'run_python', 'run_node']);
const GIT_TOOLS         = new Set(['git_clone', 'git_pull', 'git_status', 'git_diff', 'git_log', 'git_branch', 'git_commit', 'git_push', 'git_stash', 'git_remote']);

function gitCommandLabel(tool, args = {}) {
  if (tool === 'git_commit') return `git commit -m "${args.message || ''}"`;
  if (tool === 'git_pull') return `git pull ${[args.remote, args.branch].filter(Boolean).join(' ')}`.trim();
  if (tool === 'git_push') return `git push ${[args.remote, args.branch].filter(Boolean).join(' ')}`.trim();
  if (tool === 'git_branch') return args.create ? `git branch ${args.create}` : args.switch ? `git switch ${args.switch}` : args.delete ? `git branch -d ${args.delete}` : 'git branch';
  if (tool === 'git_stash') return `git stash ${args.action || 'list'}`;
  if (tool === 'git_diff') return `git diff${args.file ? ` -- ${args.file}` : ''}`;
  if (tool === 'git_status') return 'git status';
  if (tool === 'git_log') return 'git log';
  if (tool === 'git_remote') return `git remote ${args.action || 'list'}`;
  if (tool === 'git_clone') return `git clone ${args.url || ''}`.trim();
  return tool;
}

// One neutral icon per kind of change; the label says what happened.
const TYPE_META = {
  written:   { label: 'Written',  icon: Pencil },
  edited:    { label: 'Edited',   icon: Pencil },
  deleted:   { label: 'Deleted',  icon: Trash2 },
  created:   { label: 'Created',  icon: FilePlus },
  copied:    { label: 'Copied',   icon: FilePlus },
  moved:     { label: 'Moved',    icon: Pencil },
  directory: { label: 'Folder',   icon: FolderPlus },
  command:   { label: 'Command',  icon: Terminal },
};

// Where the file stands now. Only a problem gets a colour.
const NEUTRAL_STATE = 'bg-hover text-fg-muted';
const STATE_META = {
  exists: { label: 'Exists', tone: NEUTRAL_STATE },
  directory: { label: 'Folder', tone: NEUTRAL_STATE },
  missing: { label: 'Missing now', tone: 'bg-red-500/10 text-red-700 dark:text-red-400' },
  deleted: { label: 'Deleted', tone: 'bg-red-500/10 text-red-700 dark:text-red-400' },
  changed_since_agent: { label: 'Changed since', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  unknown: { label: 'Unknown', tone: NEUTRAL_STATE },
};

export function extractChanges(events) {
  const seen = new Map(); // path → last change
  const commands = [];

  for (const ev of events) {
    if (ev.type !== 'tool_start') continue;
    const tool = currentToolName(ev.data?.tool);
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
    } else if (FILE_EDIT_TOOLS.has(tool)) {
      for (const filePath of editedPaths(tool, args, ev.result)) {
        if (!seen.has(filePath)) seen.set(filePath, { ...base, type: 'edited', path: filePath });
      }
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
    } else if (GIT_TOOLS.has(tool)) {
      commands.push({
        ...base,
        type: 'command',
        command: gitCommandLabel(tool, args),
        tool,
        output: ev.result?.output || ev.result?.stdout || ev.result?.message || '',
      });
    }
  }

  return { files: [...seen.values()], commands };
}

function InlineDiffViewer({ path, workingDir, onClose }) {
  const [diffText, setDiffText] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    gitApi.getDiff({ file: path, staged: false, path: workingDir })
      .then(res => {
        if (cancelled) return;
        setDiffText(res?.diff || '');
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load diff'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, workingDir]);

  return (
    <div className="mt-2 rounded-lg border border-line overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-hover">
        <div className="flex items-center gap-1.5">
          <GitCompare className="w-3 h-3 text-fg-subtle" />
          <span className="text-[11px] font-mono text-fg-muted truncate">{path}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-2 flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-fg-subtle bg-surface">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-[12px]">Loading the changes…</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-red-600 dark:text-red-400 bg-surface">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {!loading && !error && (
        diffText
          ? <UnifiedDiffViewer diff={diffText} filePath={path} className="rounded-none border-0 max-h-64 overflow-y-auto" />
          : <div className="px-3 py-4 text-center text-[12px] text-fg-subtle bg-surface">No uncommitted changes.</div>
      )}
    </div>
  );
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
    <div className="mt-2 rounded-lg border border-line bg-hover overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-surface">
        <span className="text-[11px] font-mono text-fg-muted truncate">{path}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-2 flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-fg-subtle">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-[12px]">Loading…</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {entry?.type === 'dir' && !loading && (
        <div className="px-3 py-3 text-[12px] text-fg-muted">
          A folder. {entry.entries?.length ? `${entry.entries.length} entries.` : 'No visible entries.'}
        </div>
      )}
      {entry?.type === 'file' && !loading && (
        <pre className="text-[11px] font-mono text-fg-muted overflow-auto max-h-64 p-3 leading-relaxed">
          {entry.content}
        </pre>
      )}
    </div>
  );
}

function StateBadge({ state }) {
  const meta = STATE_META[state?.state || 'unknown'] || STATE_META.unknown;
  return (
    <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

export function FileChangeRow({ change, state }) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState('diff'); // 'diff' | 'content'
  const meta = TYPE_META[change.type] || TYPE_META.written;
  const Icon = meta.icon;
  const canView = state?.exists !== false && change.type !== 'deleted';
  const showsDiff = change.type === 'edited' || change.type === 'written';
  const displayPath = change.source ? `${change.source} -> ${change.path}` : change.path;

  return (
    <div>
      <button
        type="button"
        onClick={() => canView && setOpen(v => !v)}
        aria-expanded={canView ? open : undefined}
        className={`group w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
          canView ? 'hover:bg-hover cursor-pointer' : 'cursor-default'
        }`}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0 text-fg-subtle" />
        <span className="flex-1 text-[12px] font-mono text-fg truncate">{displayPath}</span>
        <span className="text-[11px] text-fg-subtle flex-shrink-0">{meta.label}</span>
        <StateBadge state={state} />
        {canView && (
          open
            ? <ChevronDown className="w-3 h-3 text-fg-subtle flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-fg-subtle flex-shrink-0 opacity-0 group-hover:opacity-100" />
        )}
      </button>
      {open && canView && (
        <div className="px-3 pb-2">
          {showsDiff && (
            <Segmented
              size="sm"
              className="mb-1.5"
              label="Show"
              value={viewMode}
              onChange={setViewMode}
              items={[{ value: 'diff', label: 'Changes' }, { value: 'content', label: 'File' }]}
            />
          )}
          {showsDiff && viewMode === 'diff'
            ? <InlineDiffViewer path={change.path} workingDir={change.workingDir} onClose={() => setOpen(false)} />
            : <FileViewer path={change.path} onClose={() => setOpen(false)} />
          }
        </div>
      )}
      {!canView && state?.exists === false && (
        <div className="px-3 pb-2 text-[12px] text-red-600 dark:text-red-400">
          File no longer exists on disk.
        </div>
      )}
    </div>
  );
}

export function CommandRow({ change }) {
  const [open, setOpen] = useState(false);
  const truncated = change.command.length > 80 ? change.command.slice(0, 80) + '…' : change.command;
  const hasOutput = Boolean(change.output?.trim());

  return (
    <div>
      <button
        type="button"
        onClick={() => hasOutput && setOpen(v => !v)}
        aria-expanded={hasOutput ? open : undefined}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
          hasOutput ? 'hover:bg-hover cursor-pointer' : 'cursor-default'
        }`}
      >
        <Terminal className="w-3.5 h-3.5 flex-shrink-0 text-fg-subtle" />
        <code className="flex-1 text-[12px] font-mono text-fg truncate">{truncated}</code>
        {hasOutput && (
          open
            ? <ChevronDown className="w-3 h-3 text-fg-subtle flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-fg-subtle flex-shrink-0" />
        )}
      </button>
      {open && hasOutput && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] font-mono text-fg-muted bg-hover rounded-md p-2 max-h-32 overflow-y-auto leading-relaxed">
            {change.output}
          </pre>
        </div>
      )}
    </div>
  );
}

export function RevertRunModal({ open, goal, total, checkpoint, reverting, onCancel, onConfirm }) {
  return (
    <Dialog
      open={open}
      size="sm"
      role="alertdialog"
      title="Revert this run?"
      description="This puts the project back as it was before the run's first change."
      onClose={onCancel}
      closeButton={!reverting}
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel} disabled={reverting}>Cancel</Button>
          <Button variant="destructive" icon={RotateCcw} loading={reverting} onClick={onConfirm}>
            {reverting ? 'Reverting…' : 'Revert run'}
          </Button>
        </>
      )}
    >
      <dl className="divide-y divide-line rounded-xl border border-line text-[13px]">
        <div className="px-3.5 py-2.5">
          <dt className="text-[12px] text-fg-subtle">Goal</dt>
          <dd className="mt-0.5 break-words leading-5 text-fg">{goal || 'Agent run'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <dt className="text-fg-muted">Items it changed</dt>
          <dd className="tabular-nums text-fg">{total}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <dt className="text-fg-muted">Restore point</dt>
          <dd className="text-fg">{checkpoint?.kind === 'dir_snapshot' ? 'Snapshot' : checkpoint?.kind || 'Baseline'}</dd>
        </div>
      </dl>
      <Notice tone="warning" className="mt-3">
        Changes made after that point may be overwritten, and this can&apos;t be undone here.
      </Notice>
    </Dialog>
  );
}
