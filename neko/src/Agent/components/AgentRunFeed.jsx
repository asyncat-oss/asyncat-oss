import { useState } from 'react';
import {
  Brain, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Terminal, Globe, File, FolderOpen, BookMarked,
  Search, Pencil, Trash2, List, Zap, FilePlus,
  FileText, Calendar, LayoutList, ShieldAlert
} from 'lucide-react';
import { parseAIResponseToBlocks, BlockRenderer } from '../../CommandCenter/components/BlockBasedMessageRenderer';

// ── Tool icon / label map ────────────────────────────────────────────────────
const TOOL_META = {
  read_file:         { icon: File,        label: 'Read file' },
  write_file:        { icon: Pencil,      label: 'Write file' },
  create_file:       { icon: FilePlus,    label: 'Create file' },
  delete_file:       { icon: Trash2,      label: 'Delete file' },
  list_directory:    { icon: FolderOpen,  label: 'List directory' },
  search_files:      { icon: Search,      label: 'Search files' },
  move_file:         { icon: File,        label: 'Move file' },
  copy_file:         { icon: File,        label: 'Copy file' },
  run_shell_command: { icon: Terminal,    label: 'Run command' },
  execute_shell:     { icon: Terminal,    label: 'Run command' },
  web_search:        { icon: Globe,       label: 'Web search' },
  browse_website:    { icon: Globe,       label: 'Browse URL' },
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

function getResultSummary(result) {
  if (!result) return null;
  if (typeof result === 'string') return result.length > 80 ? result.slice(0, 80) + '…' : result;
  if (result.error) return `Error: ${result.error}`;
  if (result.output !== undefined) { const s = String(result.output); return s.length > 100 ? s.slice(0, 100) + '…' : s; }
  if (result.content) { const s = String(result.content); return s.length > 100 ? s.slice(0, 100) + '…' : s; }
  try { const s = JSON.stringify(result); return s.length > 100 ? s.slice(0, 100) + '…' : s; } catch { return null; }
}

// ── Individual event components ───────────────────────────────────────────────

function ThinkingEvent({ data }) {
  const [expanded, setExpanded] = useState(false);
  const thought = data?.thought || '';
  const words = thought.trim().split(/\s+/).length;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <Brain className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex-1">
          Reasoning · Round {data?.round}
        </span>
        <span className="text-xs text-gray-400 mr-1">{words}w</span>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 py-3 bg-gray-50/50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-700/50">
          <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
            {thought}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolEvent({ data, result }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const isPending = result === undefined;
  const isError = result && (result.error || result.success === false);
  const summary = getResultSummary(result);
  const argsStr = truncateArgs(data?.args);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden mb-2">
      <button
        onClick={() => result && setExpanded(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors bg-white dark:bg-gray-800/30 ${result ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
          isError ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
          : isPending ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-500'
          : 'bg-green-100 dark:bg-green-900/30 text-green-600'
        }`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{label}</span>
            <code className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">{data?.tool}</code>
          </div>
          {argsStr && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">{argsStr}</div>
          )}
          {summary && !expanded && (
            <div className={`text-[10px] mt-0.5 truncate ${isError ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {summary}
            </div>
          )}
          {data?.permissionDecision && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              Permission: {data.permissionDecision}
              {data.workingDir ? ` · ${data.workingDir}` : ''}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 ml-1">
          {isPending
            ? <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            : isError
              ? <XCircle className="w-3.5 h-3.5 text-red-400" />
              : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
        </div>
        {result && (
          expanded
            ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {expanded && result && (
        <div className="border-t border-gray-100 dark:border-gray-700/50 px-3 py-2 bg-gray-50/50 dark:bg-gray-800/20">
          <pre className="text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto leading-relaxed">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function PermissionEvent({ data, onDecision }) {
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const resolved = data?.resolved;
  const decision = data?.decision;
  const isAllowed = decision === 'allow' || decision === 'allow_session';
  const isDenied = decision === 'deny';

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/10 overflow-hidden mb-2">
      <div className="px-3 py-3 flex items-start gap-2.5">
        <div className="flex-shrink-0 w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 flex items-center justify-center">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
              Approve tool access
            </span>
            <code className="text-[10px] text-amber-700/70 dark:text-amber-300/70">{data?.tool}</code>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
            {data?.description || label}
          </p>
          <pre className="text-[10px] text-amber-700 dark:text-amber-300 whitespace-pre-wrap font-mono mt-2 max-h-28 overflow-y-auto">
            {truncateArgs(data?.args)}
          </pre>
          {data?.workingDir && (
            <div className="text-[10px] text-amber-700/70 dark:text-amber-300/70 mt-1 truncate">
              Working directory: {data.workingDir}
            </div>
          )}
          {data?.error && (
            <div className="text-[10px] text-red-600 dark:text-red-300 mt-2">{data.error}</div>
          )}
        </div>
      </div>
      <div className="border-t border-amber-200/70 dark:border-amber-800/40 px-3 py-2 flex items-center justify-end gap-2">
        {resolved ? (
          <span className={`text-xs font-medium ${
            isAllowed ? 'text-green-700 dark:text-green-300' :
            isDenied ? 'text-red-700 dark:text-red-300' :
            'text-amber-700 dark:text-amber-300'
          }`}>
            {isAllowed ? 'Approved' : isDenied ? 'Denied' : 'Resolved'}
          </span>
        ) : (
          <>
            <button
              onClick={() => onDecision?.(data?.requestId, 'deny')}
              disabled={data?.resolving}
              className="px-2.5 py-1 text-xs rounded-md border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-60"
            >
              Deny
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow')}
              disabled={data?.resolving}
              className="px-2.5 py-1 text-xs rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white flex items-center gap-1.5"
            >
              {data?.resolving && <Loader2 className="w-3 h-3 animate-spin" />}
              Approve once
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow_session')}
              disabled={data?.resolving}
              className="px-2.5 py-1 text-xs rounded-md bg-gray-800 hover:bg-gray-900 dark:bg-gray-200 dark:hover:bg-white disabled:opacity-60 text-white dark:text-gray-900"
            >
              Trust this run
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AnswerEvent({ data }) {
  const answer = data?.answer || '';
  if (!answer.trim()) return null;

  let blocks = [];
  try {
    blocks = parseAIResponseToBlocks(answer);
  } catch { blocks = []; }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 overflow-hidden mb-3">
      {/* Subtle header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/60 dark:bg-gray-800/60">
        <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-3 h-3 text-gray-500 dark:text-gray-400" />
        </div>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Agent response</span>
        {data?.round && data.round > 1 && (
          <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-600">
            {data.round} rounds
          </span>
        )}
      </div>
      {/* Answer body */}
      <div className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
        {blocks.length > 0
          ? blocks.map((block, i) => <BlockRenderer key={i} block={block} />)
          : <p className="whitespace-pre-wrap">{answer}</p>}
      </div>
    </div>
  );
}

function ErrorEvent({ data }) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/10 p-3 mb-2 flex items-start gap-2">
      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-red-700 dark:text-red-300">
        {data?.message || 'Agent encountered an error.'}
      </div>
    </div>
  );
}

// Live streaming preview — shown while LLM is generating before structured events arrive
function StreamingPreview({ text }) {
  if (!text?.trim()) return null;

  // Strip raw tool_call blocks and Thought: prefixes so only "real" text shows
  const clean = text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/\*\*Thought:\*\*[\s\S]*?(?=\*\*[A-Z]|$)/g, '')
    .replace(/\*\*Action:\*\*[\s\S]*$/s, '')
    .trim();

  if (!clean) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-600 py-1 pl-1 mb-1 animate-pulse">
        <Brain className="w-3.5 h-3.5 flex-shrink-0" />
        Reasoning…
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2 pl-1 whitespace-pre-wrap">
      {clean}
      <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-text-bottom" />
    </div>
  );
}

function RunningIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600 py-2 pl-1">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      Agent is working…
    </div>
  );
}

// ── Main feed component ────────────────────────────────────────────────────────

export default function AgentRunFeed({ events, isRunning, streamingText, onPermissionDecision }) {
  const hasContent = (events && events.length > 0) || streamingText || isRunning;
  if (!hasContent) return null;

  return (
    <div className="space-y-0.5">
      {(events || []).map((ev, i) => {
        switch (ev.type) {
          case 'thinking':    return <ThinkingEvent key={i} data={ev.data} />;
          case 'permission_request': return <PermissionEvent key={i} data={ev.data} onDecision={onPermissionDecision} />;
          case 'tool_start':  return <ToolEvent key={i} data={ev.data} result={ev.result} />;
          case 'answer':      return <AnswerEvent key={i} data={ev.data} />;
          case 'error':       return <ErrorEvent key={i} data={ev.data} />;
          default:            return null;
        }
      })}

      {/* Live streaming text preview */}
      {isRunning && <StreamingPreview text={streamingText} />}

      {/* Generic running indicator when no streaming text yet */}
      {isRunning && !streamingText && events.length === 0 && <RunningIndicator />}
    </div>
  );
}
