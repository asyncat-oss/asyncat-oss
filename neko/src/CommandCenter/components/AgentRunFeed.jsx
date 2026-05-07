import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Terminal, Globe, File, FolderOpen, BookMarked,
  Search, Pencil, Trash2, List, Zap, FilePlus,
  FileText, Calendar, LayoutList, ShieldAlert, MessageCircle, Send,
  ShieldOff, Brain, RotateCcw, Link2, Image, ExternalLink,
} from 'lucide-react';
import { parseAIResponseToBlocks, BlockRenderer } from '../../CommandCenter/components/BlockBasedMessageRenderer';
import { extractReasoningFromText } from '../reasoningParser.js';

// ── Tool icon / label map ─────────────────────────────────────────────────────
const TOOL_META = {
  read_file:         { icon: File,        label: 'Read file' },
  write_file:        { icon: Pencil,      label: 'Write file' },
  edit_file:         { icon: Pencil,      label: 'Edit file' },
  create_file:       { icon: FilePlus,    label: 'Create file' },
  create_directory:  { icon: FolderOpen,  label: 'Create folder' },
  file_delete:       { icon: Trash2,      label: 'Delete file' },
  file_move:         { icon: File,        label: 'Move file' },
  file_copy:         { icon: File,        label: 'Copy file' },
  delete_file:       { icon: Trash2,      label: 'Delete file' },
  list_directory:    { icon: FolderOpen,  label: 'List directory' },
  search_files:      { icon: Search,      label: 'Search files' },
  find_files:        { icon: Search,      label: 'Find files' },
  glob_find:         { icon: Search,      label: 'Find files' },
  file_diff:         { icon: FileText,    label: 'File diff' },
  move_file:         { icon: File,        label: 'Move file' },
  copy_file:         { icon: File,        label: 'Copy file' },
  run_command:       { icon: Terminal,    label: 'Run command' },
  run_python:        { icon: Terminal,    label: 'Run Python' },
  run_node:          { icon: Terminal,    label: 'Run Node' },
  run_shell_command: { icon: Terminal,    label: 'Run command' },
  execute_shell:     { icon: Terminal,    label: 'Run command' },
  delegate_to_profile:{ icon: Brain,       label: 'Delegate to agent' },
  delegate_task:      { icon: Brain,       label: 'Delegate task' },
  web_search:        { icon: Globe,       label: 'Web search' },
  browse_website:    { icon: Globe,       label: 'Browse URL' },
  search_images:     { icon: Image,       label: 'Search images' },
  remember:          { icon: BookMarked,  label: 'Remember' },
  recall_memory:     { icon: BookMarked,  label: 'Recall memory' },
  list_memories:     { icon: BookMarked,  label: 'List memories' },
  create_task:       { icon: LayoutList,  label: 'Create task' },
  list_tasks:        { icon: List,        label: 'List tasks' },
  create_note:       { icon: FileText,    label: 'Create note' },
  list_notes:        { icon: FileText,    label: 'List notes' },
  create_event:      { icon: Calendar,    label: 'Create event' },
  list_events:       { icon: Calendar,    label: 'List events' },
};

function getToolMeta(toolName) {
  return TOOL_META[toolName] || { icon: Zap, label: toolName };
}

function truncateArgs(args) {
  if (!args) return '';
  try {
    const str = typeof args === 'string' ? args : JSON.stringify(args);
    return str.length > 120 ? str.slice(0, 120) + '…' : str;
  } catch { return ''; }
}

function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getResultSummary(result) {
  if (!result) return null;
  if (typeof result === 'string') return result.length > 80 ? result.slice(0, 80) + '…' : result;
  if (result.error) return `Error: ${result.error}`;
  if (result.output !== undefined) { const s = String(result.output); return s.length > 100 ? s.slice(0, 100) + '…' : s; }
  if (result.content) { const s = String(result.content); return s.length > 100 ? s.slice(0, 100) + '…' : s; }
  try { const s = JSON.stringify(result); return s.length > 100 ? s.slice(0, 100) + '…' : s; } catch { return null; }
}

function getToolIntent(data) {
  const args = data?.args || {};
  const { label } = getToolMeta(data?.tool);

  if (typeof args.command === 'string' && args.command.trim()) {
    return { label: 'Run this command', value: args.command.trim(), kind: 'command' };
  }
  if (typeof args.code === 'string' && args.code.trim()) {
    return { label: data?.tool === 'run_python' ? 'Run this Python' : 'Run this code', value: args.code.trim(), kind: 'code' };
  }
  if (typeof args.path === 'string' && args.path.trim()) {
    const verb = data?.tool === 'write_file' ? 'Write this file'
      : data?.tool === 'edit_file' ? 'Edit this file'
        : data?.tool === 'file_delete' || data?.tool === 'delete_file' ? 'Delete this file'
          : label;
    return { label: verb, value: args.path.trim(), kind: 'path' };
  }
  if (typeof args.query === 'string' && args.query.trim()) {
    return { label: 'Search for this', value: args.query.trim(), kind: 'query' };
  }
  if (typeof data?.description === 'string' && data.description.trim()) {
    return { label, value: data.description.trim(), kind: 'description' };
  }

  return { label, value: truncateArgs(args) || `Use ${data?.tool || 'tool'}`, kind: 'tool' };
}

function getToolStatus(result, data) {
  if (data?.resolved) {
    const decision = data?.decision;
    if (decision === 'deny') return { label: 'Denied', tone: 'text-red-500', icon: XCircle };
    if (decision === 'allow' || decision === 'allow_session' || decision === 'allow_always') {
      return { label: 'Approved', tone: 'text-green-600 dark:text-green-400', icon: CheckCircle2 };
    }
  }
  if (result === undefined) return { label: 'Running', tone: 'text-amber-500', icon: Loader2 };
  if (result?.error || result?.success === false) return { label: 'Failed', tone: 'text-red-500', icon: XCircle };
  return { label: 'Done', tone: 'text-green-600 dark:text-green-400', icon: CheckCircle2 };
}

function FeedFrame({ children, className = '' }) {
  return (
    <div className={`max-w-4xl mx-auto ${className}`}>
      {children}
    </div>
  );
}

function ModeBadge({ toolsEnabled }) {
  if (typeof toolsEnabled !== 'boolean') return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
      toolsEnabled
        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
    }`}>
      {toolsEnabled ? 'Tools ON' : 'Answer only'}
    </span>
  );
}

// ── Individual event components ───────────────────────────────────────────────

function UserGoalEvent({ data }) {
  const goal = data?.goal || data?.content || '';
  if (!goal.trim()) return null;

  return (
    <div className="group mb-6">
      <div className="max-w-4xl mx-auto flex justify-end">
        <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800">
          <div className="mb-1 flex justify-end">
            <ModeBadge toolsEnabled={data?.toolsEnabled} />
          </div>
          <div className="text-gray-900 dark:text-white midnight:text-white leading-relaxed whitespace-pre-wrap font-medium">
            {goal}
          </div>
          {Array.isArray(data?.agentMentions) && data.agentMentions.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-end gap-1">
              {data.agentMentions.map(agent => (
                <span key={agent.id || agent.handle} className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                  <span>{agent.icon || '🤖'}</span>
                  @{agent.handle}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Minimal inline reasoning disclosure for agent thought events.
function ThinkingEvent({ data }) {
  const [expanded, setExpanded] = useState(false);
  const thought = data?.thought || '';
  const words = thought.trim().split(/\s+/).filter(Boolean).length;

  return (
    <FeedFrame className="mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 py-1 rounded-md hover:text-gray-500 dark:hover:text-gray-400 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 tracking-wide select-none">
          Reasoning · {words} words
        </span>
      </button>
      {expanded && (
        <div className="mt-1 pl-3 border-l-2 border-gray-100 dark:border-gray-800">
          <pre className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto py-1 pr-1">
            {thought}
          </pre>
        </div>
      )}
    </FeedFrame>
  );
}

function ToolEvent({ data, result, onRetryTool, framed = true }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const status = getToolStatus(result, data);
  const StatusIcon = status.icon;
  const isPending = status.label === 'Running';
  const isError = status.label === 'Failed';
  const isMalformed = result?.code === 'invalid_tool_arguments';
  const summary = getResultSummary(result);
  const intent = getToolIntent(data);

  const content = (
    <div className="group rounded-md px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40">
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${status.tone}`}>
          <StatusIcon className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        </div>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => (result || data?.args) && setExpanded(v => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Icon className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
            <span className={`ml-auto flex-shrink-0 text-[10px] font-medium ${status.tone}`}>{status.label}</span>
            {(result || data?.args) && (
              expanded
                ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-gray-400" />
                : <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>

          <p className="mt-0.5 truncate pl-5 text-[11px] text-gray-400 dark:text-gray-500">
            {intent.value}
          </p>

          {summary && !expanded && (
            <p className={`mt-0.5 truncate pl-5 font-mono text-[10px] ${isError ? 'text-red-400' : 'text-gray-400 dark:text-gray-600'}`}>
              {summary}
            </p>
          )}

          {isMalformed && (
            <button
              onClick={() => onRetryTool?.({ tool: data?.tool, args: data?.args, result, repairPrompt: data?.repairPrompt })}
              className="ml-5 mt-1 inline-flex items-center gap-1 rounded border border-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <RotateCcw className="h-3 w-3" />
              Retry from here
            </button>
          )}

          {data?.permissionDecision && (
            <p className="mt-0.5 pl-5 text-[10px] text-gray-400 dark:text-gray-600">
              Permission: {data.permissionDecision}
              {data.workingDir ? ` · ${data.workingDir}` : ''}
            </p>
          )}

          {expanded && (
            <div className="ml-5 mt-1 border-l border-gray-100 pl-2 dark:border-gray-800">
              {data?.args && (
                <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[10px] leading-relaxed text-gray-500 dark:bg-gray-900/60 dark:text-gray-500">
                  {JSON.stringify(data.args, null, 2)}
                </pre>
              )}
              {result && (
                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[10px] leading-relaxed text-gray-500 dark:bg-gray-900/60 dark:text-gray-500">
                  {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return framed ? <FeedFrame className="mb-1.5">{content}</FeedFrame> : content;
}

function CompactPermissionEvent({ data, onDecision }) {
  const [showDetails, setShowDetails] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const intent = getToolIntent(data);
  const resolved = data?.resolved;
  const decision = data?.decision;
  const dangerous = data?.permission === 'dangerous';
  const isAllowed = decision === 'allow' || decision === 'allow_session' || decision === 'allow_always';
  const isDenied = decision === 'deny';
  const expiresAt = useMemo(() => (
    Number.isFinite(data?.expiresInMs) ? Date.now() + data.expiresInMs : null
  ), [data?.expiresInMs]);
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const expired = !resolved && remainingMs === 0;
  const showDecision = resolved || expired;

  useEffect(() => {
    if (resolved || !expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt, resolved]);

  return (
    <div className={`overflow-hidden rounded-lg border ${dangerous ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/10' : 'border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/10'}`}>
      <div className="flex items-start gap-2.5 px-3 py-3">
        <div className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${dangerous ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'}`}>
          <ShieldAlert className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Icon className={`h-3 w-3 ${dangerous ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300'}`} />
            <span className={`text-xs font-semibold ${dangerous ? 'text-rose-950 dark:text-rose-100' : 'text-amber-950 dark:text-amber-100'}`}>Permission needed</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${dangerous ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{label}</span>
            {!resolved && remainingMs !== null && (
              <span className={`ml-auto text-[10px] font-medium ${expired ? 'text-red-600 dark:text-red-300' : dangerous ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {expired ? 'Expired' : `Auto-deny in ${formatCountdown(remainingMs)}`}
              </span>
            )}
          </div>
          <p className={`mt-1 text-sm font-medium ${dangerous ? 'text-rose-950 dark:text-rose-100' : 'text-amber-950 dark:text-amber-100'}`}>
            The agent wants to {intent.label.toLowerCase()}.
          </p>
          <pre className={`mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-white/70 bg-white/75 p-2.5 font-mono text-xs leading-relaxed dark:border-white/10 dark:bg-gray-950/30 ${dangerous ? 'text-rose-800 dark:text-rose-100' : 'text-amber-900 dark:text-amber-100'}`}>
            {intent.value}
          </pre>
          {(data?.args || data?.diff || data?.workingDir) && (
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className={`mt-1.5 inline-flex items-center gap-1 text-[10px] hover:underline ${dangerous ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}
            >
              {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Technical details
            </button>
          )}
          {showDetails && (
            <div className="mt-1 space-y-1">
              {data?.workingDir && <p className="truncate text-[10px] text-gray-400 dark:text-gray-500">{data.workingDir}</p>}
              {data?.args && (
                <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-white/60 p-1.5 font-mono text-[10px] text-gray-500 dark:bg-gray-950/30 dark:text-gray-500">
                  {JSON.stringify(data.args, null, 2)}
                </pre>
              )}
              {data?.diff && (
                <pre className="max-h-40 overflow-y-auto whitespace-pre rounded bg-gray-950 p-2 font-mono text-[10px] leading-relaxed text-gray-200">
                  {data.diff}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/70 px-3 py-2 dark:border-white/10">
        {showDecision ? (
          <span className={`flex items-center gap-1 text-xs font-medium ${isAllowed ? 'text-green-700 dark:text-green-300' : isDenied || expired ? 'text-red-700 dark:text-red-300' : dangerous ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {isAllowed ? 'Approved' : isDenied ? 'Denied' : expired ? 'Expired, denied' : 'Resolved'}
            {decision === 'allow_always' && <span className="text-[10px] opacity-70">(always)</span>}
            {decision === 'allow_session' && <span className="text-[10px] opacity-70">(this run)</span>}
          </span>
        ) : (
          <>
            <button
              onClick={() => onDecision?.(data?.requestId, 'deny')}
              disabled={data?.resolving || expired}
              className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-white disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              Deny
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow')}
              disabled={data?.resolving || expired}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-white transition-colors disabled:opacity-60 ${dangerous ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'}`}
            >
              {data?.resolving && <Loader2 className="h-3 w-3 animate-spin" />}
              Approve once
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow_session')}
              disabled={data?.resolving || expired}
              className="rounded bg-gray-800 px-2.5 py-1 text-xs text-white transition-colors hover:bg-gray-900 disabled:opacity-60 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Trust this run
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow_always')}
              disabled={data?.resolving || expired}
              title={`Always allow ${data?.tool} without asking`}
              className="flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <ShieldOff className="h-3 w-3" />
              Always allow
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ToolsSection({ events, onPermissionDecision, onRetryTool }) {
  const hasPendingPermission = events.some(ev => ev.type === 'permission_request' && !ev.data?.resolved);
  const [expanded, setExpanded] = useState(hasPendingPermission);
  const toolCount = events.filter(ev => ev.type === 'tool_start').length;
  const permissionCount = events.filter(ev => ev.type === 'permission_request').length;
  const failedCount = events.filter(ev => ev.type === 'tool_start' && (ev.result?.error || ev.result?.success === false)).length;
  const runningCount = events.filter(ev => ev.type === 'tool_start' && ev.result === undefined).length;

  useEffect(() => {
    if (hasPendingPermission) setExpanded(true);
  }, [hasPendingPermission]);

  const summary = [
    toolCount ? `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}` : null,
    permissionCount ? `${permissionCount} ${permissionCount === 1 ? 'approval' : 'approvals'}` : null,
    runningCount ? `${runningCount} running` : null,
    failedCount ? `${failedCount} failed` : null,
  ].filter(Boolean).join(' · ');

  return (
    <FeedFrame className="mb-4">
      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white/70 shadow-sm shadow-gray-100/60 dark:border-gray-800 dark:bg-gray-950/20 dark:shadow-none">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          <Terminal className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Tools</span>
          {summary && <span className="truncate text-[11px] text-gray-400 dark:text-gray-500">{summary}</span>}
        </button>
        {expanded && (
          <div className="space-y-1 border-t border-gray-100 p-2 dark:border-gray-800">
            {events.map((ev, i) => {
              if (ev.type === 'permission_request') {
                return <CompactPermissionEvent key={i} data={ev.data} onDecision={onPermissionDecision} />;
              }
              if (ev.type === 'tool_start') {
                return <ToolEvent key={i} data={ev.data} result={ev.result} onRetryTool={onRetryTool} framed={false} />;
              }
              return null;
            })}
          </div>
        )}
      </div>
    </FeedFrame>
  );
}

function AskUserEvent({ data, onAnswer }) {
  const [inputValue, setInputValue] = useState('');
  const [answered, setAnswered] = useState(false);
  const [chosenAnswer, setChosenAnswer] = useState('');
  const inputRef = useRef(null);

  const submit = (answer) => {
    const val = (answer ?? inputValue).trim();
    if (!val) return;
    setChosenAnswer(val);
    setAnswered(true);
    onAnswer?.(data?.requestId, val);
  };

  return (
    <FeedFrame className="mb-4">
    <div className="rounded-lg border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-900/10 overflow-hidden">
      <div className="px-3 py-3 flex items-start gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center">
          <MessageCircle className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-blue-900 dark:text-blue-100">Agent question</span>
          <p className="text-sm text-blue-800 dark:text-blue-200 mt-1 leading-relaxed">{data?.question}</p>

          {answered ? (
            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400 italic">You replied: "{chosenAnswer}"</p>
          ) : (
            <>
              {data?.choices?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.choices.map((choice, i) => (
                    <button
                      key={i}
                      onClick={() => submit(choice)}
                      className="px-2.5 py-1 text-xs rounded-full border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                  placeholder={data?.default ? `Default: ${data.default}` : 'Type your answer…'}
                  className="flex-1 text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                />
                <button
                  onClick={() => submit()}
                  disabled={!inputValue.trim() && !data?.default}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white flex items-center gap-1 transition-colors"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
              {data?.default && (
                <button
                  onClick={() => submit(data.default)}
                  className="mt-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Use default: "{data.default}"
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </FeedFrame>
  );
}

function SourceChip({ source }) {
  const [open, setOpen] = useState(false);
  const domain = (() => {
    try { return new URL(source.url).hostname.replace('www.', ''); } catch { return source.url; }
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors max-w-[16rem]"
        title={source.title || source.url}
      >
        <img
          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
          alt=""
          className="w-3.5 h-3.5 rounded flex-shrink-0 object-contain"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <span className="truncate">{source.title || domain}</span>
        <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 midnight:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Web source</span>
              </div>
              <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg leading-none">×</button>
            </div>
            <div className="mx-5 mb-4 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 min-w-0">
                <img src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" className="w-4 h-4 rounded flex-shrink-0 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono select-all">{source.url}</span>
              </div>
              {source.title && <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{source.title}</p>}
              {source.snippet && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-3">{source.snippet}</p>}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Close</button>
              <button onClick={() => { window.open(source.url, '_blank', 'noopener,noreferrer'); setOpen(false); }} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5">Open ↗</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SourcesPanel({ searchEvent }) {
  if (!searchEvent) return null;
  const { sources = [], images = [] } = searchEvent;
  if (sources.length === 0 && images.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      {images.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
            <Image className="w-3 h-3" />
            <span>Images for this answer ({images.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <a
                key={img.image || img.thumbnail || img.url || i}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 transition hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700"
                title={img.title}
              >
                <img
                  src={img.thumbnail || img.image}
                  alt={img.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23999"%3E%3Crect width="40" height="40" fill="%23eee"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="10"%3EIMG%3C/text%3E%3C/svg%3E'; }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                <ExternalLink className="absolute right-1.5 top-1.5 h-3.5 w-3.5 rounded bg-white/90 p-0.5 text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 dark:bg-gray-900/90 dark:text-gray-200" />
              </a>
            ))}
          </div>
        </div>
      )}
      {sources.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
            <Link2 className="w-3 h-3" />
            <span>Sources for this answer ({sources.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((source, i) => (
              <SourceChip key={source.url || i} source={source} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Clean chat-like agent response — no "Agent response" header bar
function AnswerEvent({ data, suppressThinkFallback = false }) {
  const raw = data?.answer || '';
  const { thinking: thinkFallback, answer } = extractReasoningFromText(raw);

  const displayAnswer = answer;
  if (!displayAnswer && !thinkFallback) return null;

  let blocks = [];
  try {
    blocks = parseAIResponseToBlocks(displayAnswer);
  } catch { blocks = []; }

  return (
    <>
      {!suppressThinkFallback && thinkFallback && <ThinkingEvent data={{ thought: thinkFallback }} />}
      {displayAnswer && <div className="group mb-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-2">
            <ModeBadge toolsEnabled={data?.toolsEnabled} />
          </div>
          <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
            {blocks.length > 0
              ? blocks.map((block, i) => <BlockRenderer key={i} block={block} />)
              : <p className="whitespace-pre-wrap">{displayAnswer}</p>}
          </div>
          <SourcesPanel searchEvent={data?.searchEvent} />
          {data?.round > 1 && (
            <p className="text-[10px] text-gray-300 dark:text-gray-700 mt-2">{data.round} rounds</p>
          )}
        </div>
      </div>}
    </>
  );
}

function ErrorEvent({ data }) {
  return (
    <FeedFrame className="mb-3">
    <div className="rounded border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/10 p-2.5 flex items-start gap-2">
      <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-red-700 dark:text-red-300">{data?.message || 'Agent encountered an error.'}</p>
    </div>
    </FeedFrame>
  );
}

function StatusEvent({ data, onRunWithTools }) {
  return (
    <FeedFrame className="mb-3">
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span>{data?.message || 'Agent stopped.'}</span>
        {data?.canRetryWithTools && data?.goal && (
          <button
            type="button"
            onClick={() => onRunWithTools?.(data.goal)}
            className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
          >
            <Zap className="w-3 h-3" />
            Run with Tools ON
          </button>
        )}
      </div>
    </FeedFrame>
  );
}

function AgentDelegateEvent({ data, result, pending = false }) {
  const profile = result?.profile || data?.profile || {};
  const handle = profile.handle || data?.profileHandle;
  const name = profile.name || data?.profileName || handle || 'agent';
  const icon = profile.icon || data?.profileIcon || '🤖';
  const answer = result?.answer || data?.answer || '';
  const isError = result?.success === false || data?.success === false;

  return (
    <FeedFrame className="mb-2">
      <div className="flex items-start gap-2.5 text-xs">
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${isError ? 'bg-red-50 dark:bg-red-950/30' : 'bg-blue-50 dark:bg-blue-950/30'}`}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" /> : <span className="text-sm">{icon}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {pending ? 'Delegating to' : isError ? 'Delegation failed for' : 'Delegated to'} {name}
            </span>
            {handle && <code className="text-[10px] text-gray-400">@{handle}</code>}
          </div>
          {data?.task && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-400 dark:text-gray-500">
              {data.task}
            </p>
          )}
          {answer && (
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              {answer.length > 260 ? `${answer.slice(0, 260)}...` : answer}
            </p>
          )}
          {(result?.sessionId || data?.sessionId) && (
            <p className="mt-1 text-[10px] text-gray-300 dark:text-gray-700">
              Session {result?.sessionId || data?.sessionId}
            </p>
          )}
        </div>
      </div>
    </FeedFrame>
  );
}

// Visual separator between consecutive goals in a single session
function RunDivider({ data }) {
  return (
    <div className="my-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        <span className="text-[10px] text-gray-300 dark:text-gray-700 font-medium tracking-widest uppercase">New goal</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
      </div>
      {data?.goal && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center font-medium">{data.goal}</p>
      )}
    </div>
  );
}

function SkillsLoadedEvent({ data }) {
  const [expanded, setExpanded] = useState(false);
  const skills = data?.skills || [];
  if (skills.length === 0) return null;
  const methodLabel = data?.method === 'llm' ? 'model-selected' : null;

  return (
    <FeedFrame className="mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 py-1 rounded-md hover:text-gray-500 dark:hover:text-gray-400 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 tracking-wide select-none">
          Skills loaded · {skills.map(s => s.name).join(', ')}
          {methodLabel ? ` · ${methodLabel}` : ''}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 pl-5 space-y-1">
          {data?.reason && (
            <p className="text-[10px] text-gray-400 dark:text-gray-600">{data.reason}</p>
          )}
          {skills.map(s => (
            <div key={s.name} className="flex items-start gap-1.5">
              <span className="text-[10px] font-medium text-indigo-500 dark:text-indigo-400">{s.name}</span>
              {s.description && (
                <span className="text-[10px] text-gray-400 dark:text-gray-600">— {s.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </FeedFrame>
  );
}

// Live streaming preview — shown while LLM is generating
function StreamingPreview({ text }) {
  if (!text?.trim()) return null;

  const { thinking, answer } = extractReasoningFromText(text);
  const clean = answer.trim();

  if (!clean) {
    return (
      <FeedFrame className="mb-2">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600 py-1 pl-1">
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span>Reasoning…</span>
          {thinking && (
            <span className="truncate text-[10px] text-gray-300 dark:text-gray-700">
              {thinking.length > 120 ? `${thinking.slice(0, 120)}...` : thinking}
            </span>
          )}
        </div>
      </FeedFrame>
    );
  }

  return (
    <FeedFrame className="mb-3">
    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
      {clean}
      <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-text-bottom" />
    </div>
    </FeedFrame>
  );
}

function RunningIndicator() {
  return (
    <FeedFrame>
    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600 py-2">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
      Agent is working…
    </div>
    </FeedFrame>
  );
}

// ── Main feed component ───────────────────────────────────────────────────────

export default function AgentRunFeed({ events, isRunning, streamingText, onPermissionDecision, onAskUserAnswer, onRetryTool, onRunWithTools }) {
  const hasContent = (events && events.length > 0) || streamingText || isRunning;
  if (!hasContent) return null;

  let hasThinkingSinceLastGoal = false;
  const renderedEvents = [];
  let toolEvents = [];

  const flushTools = () => {
    if (!toolEvents.length) return;
    const key = `tools_${renderedEvents.length}`;
    renderedEvents.push(
      <ToolsSection
        key={key}
        events={toolEvents}
        onPermissionDecision={onPermissionDecision}
        onRetryTool={onRetryTool}
      />
    );
    toolEvents = [];
  };

  (events || []).forEach((ev, i) => {
    if (ev.type === 'permission_request' || ev.type === 'tool_start') {
      toolEvents.push(ev);
      return;
    }

    flushTools();

    switch (ev.type) {
      case 'user_goal':
        hasThinkingSinceLastGoal = false;
        renderedEvents.push(<UserGoalEvent key={i} data={ev.data} />);
        break;
      case 'thinking':
        hasThinkingSinceLastGoal = true;
        renderedEvents.push(<ThinkingEvent key={i} data={ev.data} />);
        break;
      case 'ask_user':
        renderedEvents.push(<AskUserEvent key={i} data={ev.data} onAnswer={onAskUserAnswer} />);
        break;
      case 'answer':
        renderedEvents.push(<AnswerEvent key={i} data={ev.data} suppressThinkFallback={hasThinkingSinceLastGoal} />);
        break;
      case 'error':
        renderedEvents.push(<ErrorEvent key={i} data={ev.data} />);
        break;
      case 'status':
        renderedEvents.push(<StatusEvent key={i} data={ev.data} onRunWithTools={onRunWithTools} />);
        break;
      case 'agent_delegate_start':
        renderedEvents.push(<AgentDelegateEvent key={i} data={ev.data} pending />);
        break;
      case 'agent_delegate_result':
        renderedEvents.push(<AgentDelegateEvent key={i} data={ev.data} result={ev.data} />);
        break;
      case 'run_start':
        renderedEvents.push(<RunDivider key={i} data={ev.data} />);
        break;
      case 'skills_loaded':
        renderedEvents.push(<SkillsLoadedEvent key={i} data={ev.data} />);
        break;
      default:
        break;
    }
  });

  flushTools();

  return (
    <div className="space-y-0">
      {renderedEvents}

      {isRunning && <StreamingPreview text={streamingText} />}
      {isRunning && !streamingText && <RunningIndicator />}
    </div>
  );
}
