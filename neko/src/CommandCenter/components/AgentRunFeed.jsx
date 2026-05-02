import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Terminal, Globe, File, FolderOpen, BookMarked,
  Search, Pencil, Trash2, List, Zap, FilePlus,
  FileText, Calendar, LayoutList, ShieldAlert, MessageCircle, Send,
  ShieldOff, Brain, RotateCcw,
} from 'lucide-react';
import { parseAIResponseToBlocks, BlockRenderer } from '../../CommandCenter/components/BlockBasedMessageRenderer';

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

function getPermissionSubject(data) {
  const args = data?.args || {};
  if (typeof args.command === 'string' && args.command.trim()) {
    return {
      label: 'Command',
      value: args.command.trim(),
      tone: data?.permission === 'dangerous' ? 'text-red-700 dark:text-red-200' : 'text-amber-900 dark:text-amber-100',
    };
  }
  if (typeof args.code === 'string' && args.code.trim()) {
    return {
      label: data?.tool === 'run_python' ? 'Python code' : data?.tool === 'run_node' ? 'Node code' : 'Code',
      value: args.code.trim(),
      tone: data?.permission === 'dangerous' ? 'text-red-700 dark:text-red-200' : 'text-amber-900 dark:text-amber-100',
    };
  }
  if (typeof args.path === 'string' && args.path.trim()) {
    const action = data?.tool === 'write_file' ? 'Write file'
      : data?.tool === 'edit_file' ? 'Edit file'
        : data?.tool === 'file_delete' || data?.tool === 'delete_file' ? 'Delete file'
          : 'Path';
    return { label: action, value: args.path.trim(), tone: 'text-amber-900 dark:text-amber-100' };
  }
  if (typeof data?.description === 'string' && data.description.trim()) {
    return { label: 'Action', value: data.description.trim(), tone: 'text-amber-900 dark:text-amber-100' };
  }
  return { label: 'Action', value: `Run ${data?.tool || 'tool'}`, tone: 'text-amber-900 dark:text-amber-100' };
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

function ToolEvent({ data, result, onRetryTool }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const isPending = result === undefined;
  const isError = result && (result.error || result.success === false);
  const isMalformed = result?.code === 'invalid_tool_arguments';
  const summary = getResultSummary(result);
  const argsStr = truncateArgs(data?.args);

  return (
    <FeedFrame className="mb-1.5">
    <div className="flex items-start gap-2.5 group">
      {/* Status dot / icon */}
      <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 ${
        isError   ? 'text-red-400'
        : isPending ? 'text-amber-400'
        : 'text-green-500'
      }`}>
        {isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : isError
            ? <XCircle className="w-3.5 h-3.5" />
            : <CheckCircle2 className="w-3.5 h-3.5" />}
      </div>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => result && setExpanded(v => !v)}
          className={`w-full flex items-center gap-2 text-left ${result ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <Icon className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
          {argsStr && (
            <code className="text-[10px] text-gray-400 dark:text-gray-600 font-mono truncate">{argsStr}</code>
          )}
          {result && (
            expanded
              ? <ChevronDown className="w-3 h-3 text-gray-400 ml-auto flex-shrink-0" />
              : <ChevronRight className="w-3 h-3 text-gray-400 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>

        {summary && !expanded && (
          <p className={`text-[10px] font-mono mt-0.5 pl-5 truncate ${isError ? 'text-red-400' : 'text-gray-400 dark:text-gray-600'}`}>
            {summary}
          </p>
        )}

        {isMalformed && (
          <button
            onClick={() => onRetryTool?.({ tool: data?.tool, args: data?.args, result, repairPrompt: data?.repairPrompt })}
            className="mt-1 ml-5 inline-flex items-center gap-1 rounded border border-red-200 dark:border-red-800 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Retry from here
          </button>
        )}

        {data?.permissionDecision && (
          <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 pl-5">
            Permission: {data.permissionDecision}
            {data.workingDir ? ` · ${data.workingDir}` : ''}
          </p>
        )}

        {expanded && result && (
          <div className="mt-1 ml-5 pl-2 border-l border-gray-100 dark:border-gray-800">
            <pre className="text-[10px] text-gray-500 dark:text-gray-500 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto leading-relaxed py-1">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
    </FeedFrame>
  );
}

function PermissionEvent({ data, onDecision }) {
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const resolved = data?.resolved;
  const decision = data?.decision;
  const isAllowed = decision === 'allow' || decision === 'allow_session' || decision === 'allow_always';
  const isDenied = decision === 'deny';
  const [showDiff, setShowDiff] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = useMemo(() => (
    Number.isFinite(data?.expiresInMs) ? Date.now() + data.expiresInMs : null
  ), [data?.requestId, data?.expiresInMs]);
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const expired = !resolved && remainingMs === 0;
  const showDecision = resolved || expired;
  const subject = getPermissionSubject(data);

  useEffect(() => {
    if (resolved || !expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt, resolved]);

  return (
    <FeedFrame className="mb-4">
    <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/10 overflow-hidden">
      <div className="px-3 py-3 flex items-start gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 flex items-center justify-center">
          <ShieldAlert className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className="w-3 h-3 text-amber-600 dark:text-amber-300" />
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">Approve tool access</span>
            <code className="text-[10px] px-1 py-0.5 rounded bg-amber-200/50 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300">{data?.tool}</code>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              data?.permission === 'dangerous'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
            }`}>
              {data?.permission || 'moderate'}
            </span>
          </div>
          <div className="mt-2 rounded-md border border-amber-200/80 dark:border-amber-800/50 bg-white/65 dark:bg-gray-950/30 overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-amber-100 dark:border-amber-900/40 flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700/70 dark:text-amber-300/70">
                {subject.label}
              </span>
              {!resolved && remainingMs !== null && (
                <span className={`text-[10px] font-medium ${expired ? 'text-red-600 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {expired ? 'Expired, denied' : `Auto-deny in ${formatCountdown(remainingMs)}`}
                </span>
              )}
            </div>
            <pre className={`text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto p-2.5 break-words ${subject.tone}`}>
              {subject.value}
            </pre>
          </div>
          {data?.args && Object.keys(data.args).length > 0 && subject.value !== truncateArgs(data.args) && (
            <details className="mt-1.5">
              <summary className="text-[10px] text-amber-700 dark:text-amber-400 cursor-pointer">Raw arguments</summary>
              <pre className="text-[10px] text-amber-700 dark:text-amber-300 whitespace-pre-wrap font-mono mt-1 max-h-24 overflow-y-auto bg-amber-100/50 dark:bg-amber-900/20 rounded p-1.5">
                {JSON.stringify(data.args, null, 2)}
              </pre>
            </details>
          )}
          {data?.diff && (
            <div className="mt-2">
              <button
                onClick={() => setShowDiff(v => !v)}
                className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 hover:underline"
              >
                {showDiff ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Show diff
              </button>
              {showDiff && (
                <pre className="mt-1 text-[10px] font-mono bg-gray-900 text-gray-200 rounded p-2 max-h-48 overflow-y-auto whitespace-pre leading-relaxed">
                  {data.diff}
                </pre>
              )}
            </div>
          )}
          {data?.workingDir && (
            <p className="text-[10px] text-amber-700/60 dark:text-amber-300/60 mt-1 truncate">
              {data.workingDir}
            </p>
          )}
          {data?.error && (
            <p className="text-[10px] text-red-600 dark:text-red-300 mt-1">{data.error}</p>
          )}
        </div>
      </div>
      <div className="border-t border-amber-200/70 dark:border-amber-800/40 px-3 py-2 flex items-center justify-end gap-2 flex-wrap">
        {showDecision ? (
          <span className={`text-xs font-medium flex items-center gap-1 ${
            isAllowed ? 'text-green-700 dark:text-green-300'
            : isDenied || expired ? 'text-red-700 dark:text-red-300'
            : 'text-amber-700 dark:text-amber-300'
          }`}>
            {isAllowed ? '✓ Approved' : isDenied ? '✗ Denied' : expired ? '✗ Expired, denied' : 'Resolved'}
            {decision === 'allow_always' && <span className="text-[10px] opacity-70">(always)</span>}
            {decision === 'allow_session' && <span className="text-[10px] opacity-70">(this run)</span>}
          </span>
        ) : (
          <>
            <button
              onClick={() => onDecision?.(data?.requestId, 'deny')}
              disabled={data?.resolving || expired}
              className="px-2.5 py-1 text-xs rounded border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-60 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow')}
              disabled={data?.resolving || expired}
              className="px-2.5 py-1 text-xs rounded bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white flex items-center gap-1.5 transition-colors"
            >
              {data?.resolving && <Loader2 className="w-3 h-3 animate-spin" />}
              Approve once
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow_session')}
              disabled={data?.resolving || expired}
              className="px-2.5 py-1 text-xs rounded bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:opacity-60 text-white transition-colors"
            >
              Trust this run
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow_always')}
              disabled={data?.resolving || expired}
              title={`Always allow ${data?.tool} without asking`}
              className="px-2.5 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 flex items-center gap-1 transition-colors"
            >
              <ShieldOff className="w-3 h-3" />
              Always allow
            </button>
          </>
        )}
      </div>
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

// Clean chat-like agent response — no "Agent response" header bar
function AnswerEvent({ data }) {
  // Strip raw <think>...</think> blocks the model may have left in the answer
  const raw = data?.answer || '';

  // Extract any think-block content as a fallback before stripping
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
  const thinkFallback = thinkMatch ? thinkMatch[1].trim() : null;

  const answer = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\s*<tool_call>[\s\S]*?<\/(?:\w+:)?tool_call>/gi, '')
    .replace(/\s*<tool_call[\s\S]*$/i, '')
    .trim();

  const displayAnswer = answer;
  if (!displayAnswer && !thinkFallback) return null;

  let blocks = [];
  try {
    blocks = parseAIResponseToBlocks(displayAnswer);
  } catch { blocks = []; }

  return (
    <>
      {thinkFallback && <ThinkingEvent data={{ thought: thinkFallback }} />}
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

  const clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/\*\*Thought:\*\*[\s\S]*?(?=\*\*[A-Z]|$)/g, '')
    .replace(/\*\*Action:\*\*[\s\S]*$/s, '')
    .trim();

  if (!clean) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600 py-1 pl-1 mb-1">
        <span className="flex gap-0.5">
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
        Reasoning…
      </div>
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

  return (
    <div className="space-y-0">
      {(events || []).map((ev, i) => {
        switch (ev.type) {
          case 'user_goal':          return <UserGoalEvent key={i} data={ev.data} />;
          case 'thinking':           return <ThinkingEvent key={i} data={ev.data} />;
          case 'permission_request': return <PermissionEvent key={i} data={ev.data} onDecision={onPermissionDecision} />;
          case 'ask_user':           return <AskUserEvent key={i} data={ev.data} onAnswer={onAskUserAnswer} />;
          case 'tool_start':         return <ToolEvent key={i} data={ev.data} result={ev.result} onRetryTool={onRetryTool} />;
          case 'answer':             return <AnswerEvent key={i} data={ev.data} />;
          case 'error':              return <ErrorEvent key={i} data={ev.data} />;
          case 'status':             return <StatusEvent key={i} data={ev.data} onRunWithTools={onRunWithTools} />;
          case 'run_start':          return <RunDivider key={i} data={ev.data} />;
          case 'skills_loaded':      return <SkillsLoadedEvent key={i} data={ev.data} />;
          default:                   return null;
        }
      })}

      {isRunning && <StreamingPreview text={streamingText} />}
      {isRunning && !streamingText && <RunningIndicator />}
    </div>
  );
}
