import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Terminal, Globe, File, FolderOpen, BookMarked,
  Search, Pencil, Trash2, List, Zap, FilePlus,
  FileText, Calendar, LayoutList, ShieldAlert, MessageCircle, Send, GitBranch,
  ShieldOff, Brain, RotateCcw, Link2, Image, ExternalLink, Copy, Volume2, Square, Loader2 as Spinner, Download, Mic, SkipBack, SkipForward,
  AlertTriangle, RefreshCw, TimerOff, AlertCircle
} from 'lucide-react';
import { audioApi } from '../../../Settings/settingApi.js';
import { filesApi, agentApi } from '../../api';
import { extractChanges, FileChangeRow, CommandRow, RevertRunModal } from './AgentChangesPanel';
import { parseAIResponseToBlocks, BlockRenderer } from '../renderers/BlockBasedMessageRenderer';
import { extractReasoningFromText } from '../../utils/reasoningParser.js';
import ArtifactCard from '../renderers/ArtifactRenderer';
import { fileIconMeta } from '../../../files/fileUtils.js';
import { AttachmentChip, ImageLightbox } from '../shared/AttachmentComponents.jsx';

// ── Inline @mention rendering ─────────────────────────────────────────────────
function renderGoalWithMentions(goal = "", fileAttachments = []) {
  if (!(fileAttachments || []).some(f => f.inline)) return goal;
  const parts = [];
  let lastIndex = 0;
  const regex = /@([^\s]+)/g;
  let match;
  while ((match = regex.exec(goal)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t${lastIndex}`}>{goal.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={`m${match.index}`} className="rounded px-0.5 font-medium text-blue-500 bg-blue-50/80 dark:text-blue-400 dark:bg-blue-900/20 midnight:text-blue-400 midnight:bg-blue-900/20">
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < goal.length) parts.push(<span key={`t${lastIndex}`}>{goal.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : goal;
}

// ── Localhost URL detection ───────────────────────────────────────────────────

export function extractLocalhostUrl(text = '') {
  if (!text || typeof text !== 'string') return null;
  // Explicit localhost/127.0.0.1 URL (Vite "Local:", plain server output, etc.)
  const explicit = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}(?:\/[^\s,)'"]*)?/);
  if (explicit) return explicit[0].replace(/[,.)'"]+$/, '');
  // "→ Local: http://..." (Vite style)
  const vite = text.match(/Local:\s+(https?:\/\/localhost:\d+)/);
  if (vite) return vite[1];
  // "port 3000", "listening on 8080", "running at :5000", "PORT=4000"
  const port = text.match(
    /(?:(?:port|serving|listening|running|available|started)[\s:]+|:)(\d{4,5})\b/i
  );
  if (port) return `http://localhost:${port[1]}`;
  return null;
}

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
  git_clone:         { icon: GitBranch,   label: 'Clone repo' },
  git_pull:          { icon: GitBranch,   label: 'Git pull' },
  git_status:        { icon: GitBranch,   label: 'Git status' },
  git_diff:          { icon: GitBranch,   label: 'Git diff' },
  git_log:           { icon: GitBranch,   label: 'Git log' },
  git_branch:        { icon: GitBranch,   label: 'Git branch' },
  git_commit:        { icon: GitBranch,   label: 'Git commit' },
  git_push:          { icon: GitBranch,   label: 'Git push' },
  git_stash:         { icon: GitBranch,   label: 'Git stash' },
  git_remote:        { icon: GitBranch,   label: 'Git remote' },
  delegate_to_profile:{ icon: Brain,       label: 'Delegate to agent' },
  delegate_task:      { icon: Brain,       label: 'Delegate task' },
  web_search:        { icon: Globe,       label: 'Web search' },
  browse_website:    { icon: Globe,       label: 'Browse URL' },
  search_images:     { icon: Image,       label: 'Search images' },
  inspect_attachment:{ icon: File,        label: 'Inspect attachment' },
  image_describe:    { icon: Image,       label: 'Inspect image' },
  generate_image:    { icon: Image,       label: 'Generated image' },
  edit_image:        { icon: Image,       label: 'Edited image' },
  screenshot_page:   { icon: Image,       label: 'Screenshot page' },
  remember:          { icon: BookMarked,  label: 'Remember' },
  recall_memory:     { icon: BookMarked,  label: 'Recall memory' },
  list_memories:     { icon: BookMarked,  label: 'List memories' },
  create_task:       { icon: LayoutList,  label: 'Create task' },
  list_tasks:        { icon: List,        label: 'List tasks' },
  create_note:       { icon: FileText,    label: 'Create note' },
  list_notes:        { icon: FileText,    label: 'List notes' },
  create_event:      { icon: Calendar,    label: 'Create event' },
  list_events:       { icon: Calendar,    label: 'List events' },
  // Artifact tools
  create_artifact:   { icon: FilePlus,    label: 'Create artifact' },
  create_markdown:   { icon: FileText,    label: 'Create document' },
  create_diagram:    { icon: Zap,         label: 'Create diagram' },
  create_csv:        { icon: List,        label: 'Create CSV' },
  create_html_page:  { icon: Globe,       label: 'Create HTML page' },
  list_artifacts:    { icon: FolderOpen,  label: 'List artifacts' },
  // Audio tools
  speak_text:        { icon: Volume2,     label: 'Generated speech' },
  transcribe_audio:  { icon: Mic,         label: 'Transcribed audio' },
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

function getResultSummary(result, toolName) {
  if (!result) return null;
  if (typeof result === 'string') return result.length > 80 ? result.slice(0, 80) + '…' : result;
  if (result.error) return `Error: ${result.error}`;
  // Audio tool summaries
  if (toolName === 'speak_text' && result.success) {
    return `${result.audio_size || 'Audio'} · ${result.voice || 'Piper'}`;
  }
  if (toolName === 'transcribe_audio' && result.success) {
    const text = result.text || '';
    return text.length > 100 ? text.slice(0, 100) + '…' : (text || 'Transcription complete');
  }
  if (toolName === 'image_describe' && result.success) {
    const text = result.description || '';
    return text.length > 100 ? text.slice(0, 100) + '…' : 'Image inspected';
  }
  if (toolName === 'inspect_attachment' && result.success) {
    const text = result.description || result.text || result.content || result.message || '';
    return text.length > 100 ? text.slice(0, 100) + '…' : (text || `${result.kind || 'Attachment'} inspected`);
  }
  if ((toolName === 'generate_image' || toolName === 'edit_image') && result.success) {
    return `${result.width || result.media?.width || '?'}x${result.height || result.media?.height || '?'} · seed ${result.seed || result.media?.seed || 'random'}`;
  }
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

function formatElapsed(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function useElapsedTime(startMs) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startMs) { setElapsed(0); return; }
    setElapsed(Date.now() - startMs);
    const id = setInterval(() => setElapsed(Date.now() - startMs), 1000);
    return () => clearInterval(id);
  }, [startMs]);
  return elapsed;
}

function ModeBadge({ toolsEnabled, agentMode }) {
  const mode = agentMode || (typeof toolsEnabled === 'boolean' ? (toolsEnabled ? 'action' : 'plan') : null);
  if (!mode) return null;
  const isActionMode = mode === 'action';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
      isActionMode
        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300'
        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300'
    }`}>
      {isActionMode ? 'Action' : 'Plan'}
    </span>
  );
}

// ── Individual event components ───────────────────────────────────────────────

function UserGoalEvent({ data, onEditMessage, onToggleMessageFlag, isRunning, highlighted = false }) {
  const goal = data?.goal || data?.content || '';
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(goal);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(goal);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [goal]);

  useEffect(() => {
    if (!isEditing) setDraft(goal);
  }, [goal, isEditing]);

  const canEdit = Boolean(onEditMessage && data?.messageId && !isRunning);
  const submitEdit = useCallback(() => {
    const next = draft.trim();
    if (!next || next === goal.trim()) {
      setIsEditing(false);
      setDraft(goal);
      return;
    }
    onEditMessage(data.messageId, next);
    setIsEditing(false);
  }, [data?.messageId, draft, goal, onEditMessage]);

  if (!goal.trim()) return null;

  return (
    <div
      id={data?.messageId ? `message-${data.messageId}` : undefined}
      data-message-id={data?.messageId || undefined}
      className={`group mb-6 scroll-mt-24 rounded-2xl transition-colors duration-700 ${
        highlighted ? 'bg-amber-50/80 dark:bg-amber-950/20' : ''
      }`}
    >
      <div className="max-w-4xl mx-auto flex flex-col items-end">
        <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800">
          {(data?.toolsEnabled !== undefined || data?.agentMode || data?.parentBranchId || data?.bookmarked) && (
            <div className="mb-1 flex justify-end gap-1.5 items-center">
              <ModeBadge toolsEnabled={data?.toolsEnabled} agentMode={data?.agentMode} />
              {data?.parentBranchId && (
                <span className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                  <GitBranch className="h-3 w-3" />
                  Branch
                </span>
              )}
              {data?.bookmarked && <BookMarked className="h-3.5 w-3.5 text-amber-500" />}
            </div>
          )}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitEdit();
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    setDraft(goal);
                  }
                }}
                className="min-h-[96px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-gray-600 dark:focus:ring-gray-800"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setDraft(goal);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Branch
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-900 dark:text-white midnight:text-white leading-relaxed whitespace-pre-wrap font-medium">
              {renderGoalWithMentions(goal, data?.fileAttachments)}
            </div>
          )}
          {Array.isArray(data?.agentMentions) && data.agentMentions.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-end gap-1">
              {data.agentMentions.map(agent => (
                <span key={agent.id || agent.handle} className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                  <span>{agent.icon || '🤖'}</span>
                  #{agent.handle}
                </span>
              ))}
            </div>
          )}
          {Array.isArray(data?.fileAttachments) && data.fileAttachments.some(f => !f.inline) && (
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              {data.fileAttachments.filter(f => !f.inline).map(file => (
                <AttachmentChip
                  key={file.path || file.name}
                  file={file}
                  onPreview={setLightbox}
                />
              ))}
            </div>
          )}
          {lightbox && (
            <ImageLightbox
              url={lightbox.url}
              name={lightbox.name}
              onClose={() => setLightbox(null)}
            />
          )}
        </div>
        <div className="mt-1 flex justify-end gap-1 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {canEdit && (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="Edit and branch from here"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
          <button
            onClick={() => onToggleMessageFlag?.(data?.messageId, 'bookmarked')}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${data?.bookmarked ? 'text-amber-500' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            title={data?.bookmarked ? 'Remove bookmark' : 'Bookmark message'}
          >
            <BookMarked className="w-3.5 h-3.5" />
            Bookmark
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            title="Copy message"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copy
          </button>
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

function ToolEvent({ data, result, onRetryTool, framed = true, progress = '' }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const status = getToolStatus(result, data);
  const StatusIcon = status.icon;
  const isPending = status.label === 'Running';
  const isError = status.label === 'Failed';
  const isMalformed = result?.code === 'invalid_tool_arguments';
  const summary = getResultSummary(result, data?.tool);
  const intent = getToolIntent(data);

  const content = (
    <div className="group rounded-md px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40">
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${status.tone}`}>
          <StatusIcon className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        </div>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => isError && setExpanded(v => !v)}
            className={`flex w-full items-center gap-2 text-left ${isError ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <Icon className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
            <span className={`ml-auto flex-shrink-0 text-[10px] font-medium ${status.tone}`}>{status.label}</span>
            {isError && (
              expanded
                ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-gray-400" />
                : <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>

          <p className="mt-0.5 truncate pl-5 text-[11px] text-gray-400 dark:text-gray-500">
            {intent.value}
          </p>

          {/* Streaming progress output (shown while running) */}
          {isPending && progress && (
            <div className="ml-5 mt-1">
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-gray-900 p-2 font-mono text-[10px] leading-relaxed text-green-400/80 scrollbar-thin">
                {progress.slice(-2000)}
                <span className="animate-pulse">▊</span>
              </pre>
            </div>
          )}

          {expanded && isError && (
            <div className="ml-5 mt-1 border-l border-gray-100 pl-2 dark:border-gray-800">
              {result && (
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[10px] leading-relaxed text-gray-500 dark:bg-gray-900/60 dark:text-gray-500">
                  {typeof result === 'string' ? result : (result.output || result.content || result.error || JSON.stringify(result, null, 2))}
                </pre>
              )}
              {onRetryTool && (
                <button
                  type="button"
                  onClick={() => onRetryTool({ tool: data?.tool, args: data?.args, result, repairPrompt: result?.repairPrompt })}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry from here
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return framed ? <FeedFrame className="mb-1.5">{content}</FeedFrame> : content;
}

// ── Artifact tool result inline card ────────────────────────────────────────
const ARTIFACT_TOOLS = new Set(['create_artifact', 'create_markdown', 'create_diagram', 'create_csv', 'create_html_page', 'create_note', 'update_note', 'append_to_note']);
const AUTO_EXPAND_ARTIFACT_TYPES = new Set(['svg', 'html', 'mermaid', 'note']);

function ArtifactResultCard({ result, prominent = false, onViewInPanel }) {
  if (!result?.artifact) return null;
  const artifact = result.artifact;
  const shouldAutoExpand = AUTO_EXPAND_ARTIFACT_TYPES.has(artifact.type || artifact.originalType);

  if (prominent) {
    return (
      <FeedFrame className="mb-4">
        <div className="mb-1.5 flex items-center gap-2 px-0.5">
          <FilePlus className="h-3.5 w-3.5 text-fuchsia-500 flex-shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex-shrink-0">Artifact created</span>
          <span className="min-w-0 truncate text-[11px] text-gray-400 dark:text-gray-600 flex-1">
            {artifact.path || artifact.filename}
          </span>
        </div>
        <ArtifactCard
          artifact={artifact}
          defaultExpanded={shouldAutoExpand && !onViewInPanel}
          onOpen={onViewInPanel ? () => onViewInPanel(artifact) : null}
        />
      </FeedFrame>
    );
  }

  return (
    <div className="mt-1 mb-2">
      <ArtifactCard
        artifact={artifact}
        defaultExpanded={shouldAutoExpand && !onViewInPanel}
        onOpen={onViewInPanel ? () => onViewInPanel(artifact) : null}
      />
    </div>
  );
}

// ── Reusable inline audio player ─────────────────────────────────────────────
function InlineAudioPlayer({ src, loadSrc, downloadName, downloadUrl, showInfo, infoContent }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const animationRef = useRef(null);

  const formatTime = (t) => {
    if (!Number.isFinite(t) || t < 0) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const cleanupAudio = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  };

  const updateProgress = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
    animationRef.current = requestAnimationFrame(updateProgress);
  };

  const handlePlay = async () => {
    if (!audioRef.current) {
      let audioSrc = src;
      if (!audioSrc && loadSrc) {
        setIsLoading(true);
        try { audioSrc = await loadSrc(); } catch { setIsLoading(false); return; }
        setIsLoading(false);
      }
      if (!audioSrc) return;
      const audio = new Audio(audioSrc);
      audioRef.current = audio;
      audio.preload = 'metadata';
      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
      audio.onerror = () => {
        setIsPlaying(false);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
      audio.onloadedmetadata = () => setDuration(audio.duration || 0);
    }
    audioRef.current.play().catch(() => setIsPlaying(false));
    setIsPlaying(true);
    animationRef.current = requestAnimationFrame(updateProgress);
  };

  const handlePause = () => {
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * (duration || 0);
    if (audioRef.current && Number.isFinite(newTime)) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const skip = (seconds) => {
    if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
      const newTime = Math.max(0, Math.min(audioRef.current.duration, audioRef.current.currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  useEffect(() => cleanupAudio, [src]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      {/* Play / Pause */}
      <button
        onClick={isPlaying ? handlePause : handlePlay}
        disabled={isLoading}
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
          isPlaying
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
        }`}
        title={isPlaying ? 'Pause' : isLoading ? 'Loading…' : 'Play'}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isPlaying ? (
          <Square className="h-3 w-3 fill-current" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Skip back */}
      <button
        onClick={() => skip(-5)}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        title="Skip back 5s"
      >
        <SkipBack className="h-3 w-3" />
      </button>

      {/* Skip forward */}
      <button
        onClick={() => skip(5)}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        title="Skip forward 5s"
      >
        <SkipForward className="h-3 w-3" />
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        title="Stop"
      >
        <Square className="h-3 w-3 fill-current" />
      </button>

      {/* Progress + time */}
      <div className="min-w-0 flex-1 mx-1">
        <div
          onClick={handleSeek}
          className="group relative h-1.5 w-full cursor-pointer rounded-full bg-gray-100 dark:bg-gray-800"
        >
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 rounded-full bg-emerald-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Download */}
      {(downloadUrl || src) && (
        <a
          href={downloadUrl || src}
          download={downloadName || 'audio.wav'}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      )}

      {/* Extra info slot */}
      {showInfo && infoContent}
    </div>
  );
}

// ── Audio tool result inline card (uses reusable player) ──────────────────────
function AudioResultCard({ result }) {
  if (!result?.success || !result.path) return null;
  const [blobUrl, setBlobUrl] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    filesApi.fetchRawBlob('workspace', result.path)
      .then(url => { if (!cancelled) setBlobUrl(url); })
      .catch(err => { if (!cancelled) setFetchError(err.message); });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [result.path]);

  return (
    <div className="mt-1.5 mb-2 ml-7">
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/50">
        {fetchError ? (
          <p className="text-xs text-red-500">Failed to load audio: {fetchError}</p>
        ) : (
          <InlineAudioPlayer
            src={blobUrl}
            downloadName={result.path?.split('/').pop() || 'speech.wav'}
          />
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          <p className="truncate text-[11px] font-medium text-gray-600 dark:text-gray-300">
            {result.path?.split('/').pop() || 'Generated speech'}
          </p>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            · {result.audio_size || `${(result.audio_bytes / 1024).toFixed(1)} KB`} · {result.voice || 'Piper'} · {result.format || 'WAV'}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImageResultCard({ result }) {
  const media = result?.media || {};
  const [blobUrl, setBlobUrl] = useState(result?.image && String(result.image).startsWith('data:image/') ? result.image : null);
  const [fetchError, setFetchError] = useState(null);
  const imagePath = media.path || result?.imagePath;
  const canFetch = media.rootId && media.path;

  useEffect(() => {
    if (!canFetch) return undefined;
    let cancelled = false;
    filesApi.fetchRawBlob(media.rootId, media.path)
      .then(url => { if (!cancelled) setBlobUrl(url); })
      .catch(err => { if (!cancelled) setFetchError(err.message); });
    return () => {
      cancelled = true;
    };
  }, [canFetch, media.path, media.rootId]);

  if (!result?.success || (!blobUrl && !canFetch && !result?.image)) return null;

  return (
    <div className="mt-1.5 mb-3 ml-7 max-w-xl">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/50">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
              {media.prompt || result.prompt || 'Generated image'}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
              <span>{result.runtime || media.runtime || 'image'}</span>
              {(result.width || media.width) && (result.height || media.height) && <span>{result.width || media.width}x{result.height || media.height}</span>}
              {(result.seed || media.seed) !== undefined && <span>seed {result.seed || media.seed}</span>}
            </div>
          </div>
          {blobUrl && (
            <a
              href={blobUrl}
              download={(imagePath || 'generated-image.png').split('/').pop()}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="Download image"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
        {fetchError ? (
          <div className="px-3 py-3 text-xs text-red-500">Failed to load image: {fetchError}</div>
        ) : blobUrl ? (
          <button
            type="button"
            onClick={() => window.open(blobUrl, '_blank', 'noopener,noreferrer')}
            className="block w-full bg-gray-50 p-2 dark:bg-gray-950/60"
            title="Open image"
          >
            <img src={blobUrl} alt={media.prompt || 'Generated image'} className="max-h-96 w-full rounded-lg object-contain" />
          </button>
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-gray-400">
            <Spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
            Loading image...
          </div>
        )}
        {imagePath && (
          <div className="border-t border-gray-100 px-3 py-2 text-[10px] font-medium text-gray-400 dark:border-gray-800 dark:text-gray-500">
            <span className="block truncate">{imagePath}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenshotResultCard({ result }) {
  const src = result?.image;
  const url = result?.url;
  if (!result?.success || !src) return null;

  return (
    <div className="mt-1.5 mb-3 ml-7 max-w-xl">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/50">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
              Screenshot
            </div>
            {url && (
              <div className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 truncate">{url}</div>
            )}
          </div>
          <a
            href={src}
            download="screenshot.png"
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            title="Download screenshot"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
          className="block w-full bg-gray-50 p-2 dark:bg-gray-950/60"
          title="Open screenshot"
        >
          <img src={src} alt="Page screenshot" className="max-h-96 w-full rounded-lg object-contain" />
        </button>
      </div>
    </div>
  );
}

function CompactPermissionEvent({ data, onDecision }) {
  const [showDetails, setShowDetails] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const intent = getToolIntent(data);
  const resolved = data?.resolved;
  const decision = data?.decision;
  const historical = Boolean(data?.historical);
  const dangerous = data?.permission === 'dangerous';
  const isAllowed = ['allow', 'allow_session', 'allow_always', 'session_approved', 'auto_approved', 'local_auto'].includes(decision);
  const isDenied = decision === 'deny' || decision === 'denied';
  const expiresAt = useMemo(() => (
    !historical && Number.isFinite(data?.expiresInMs) ? Date.now() + data.expiresInMs : null
  ), [data?.expiresInMs, historical]);
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const expired = !resolved && remainingMs === 0;
  const showDecision = resolved || expired;

  useEffect(() => {
    if (resolved || !expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt, resolved]);

  const decisionLabel = isAllowed
    ? 'Approved'
    : isDenied
      ? 'Denied'
      : expired
        ? 'Expired, denied'
        : 'Resolved';
  const decisionTone = isAllowed
    ? 'text-emerald-600 dark:text-emerald-400'
    : isDenied || expired
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-500 dark:text-gray-400';
  const decisionDot = isAllowed
    ? 'bg-emerald-500'
    : isDenied || expired
      ? 'bg-red-500'
      : 'bg-gray-400';

  if (historical) {
    return (
      <div className="rounded-lg border border-gray-200/80 bg-white/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/35 midnight:border-slate-800 midnight:bg-slate-900/35">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${isDenied ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'}`}>
            {isDenied ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={`text-xs font-medium ${decisionTone}`}>{decisionLabel}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800/80 dark:text-gray-400">
                <Icon className="h-3 w-3" />
                {label}
              </span>
              <span className="truncate text-xs text-gray-500 dark:text-gray-400">{intent.value}</span>
            </div>
            {(data?.diff || data?.workingDir) && (
              <button
                type="button"
                onClick={() => setShowDetails(v => !v)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
              >
                {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {data?.diff ? 'View changes' : 'Details'}
              </button>
            )}
            {showDetails && (
              <div className="mt-2 space-y-1.5">
                {data?.workingDir && <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">Working directory: {data.workingDir}</p>}
                {data?.diff && (
                  <pre className="max-h-40 overflow-y-auto whitespace-pre rounded-lg border border-gray-200 bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-gray-300 dark:border-gray-700">
                    {data.diff}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border ${dangerous ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400' : 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400'}`}>
          <ShieldAlert className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Permission needed</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <Icon className="h-3 w-3" />
              {label}
            </span>
            {!resolved && remainingMs !== null && (
              <span className={`ml-auto text-[10px] font-medium tabular-nums ${expired ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {expired ? 'Expired' : `Auto-deny in ${formatCountdown(remainingMs)}`}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">
            The agent wants to <span className="font-medium">{intent.label.toLowerCase()}</span>.
          </p>
          <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50 dark:bg-gray-950 midnight:bg-slate-950 px-3 py-2">
            <code className="block max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-700 dark:text-gray-300">
              {intent.value}
            </code>
          </div>
          {(data?.diff || data?.workingDir) && (
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {data?.diff ? 'View changes' : 'Technical details'}
            </button>
          )}
          {showDetails && (
            <div className="mt-2 space-y-1.5">
              {data?.workingDir && <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">Working directory: {data.workingDir}</p>}
              {data?.diff && (
                <pre className="max-h-40 overflow-y-auto whitespace-pre rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-gray-300">
                  {data.diff}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800 px-4 py-2.5">
        {showDecision ? (
          <span className={`flex items-center gap-1.5 text-xs font-medium ${decisionTone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${decisionDot}`} />
            {decisionLabel}
            {decision === 'allow_always' && <span className="text-[10px] opacity-70">(always)</span>}
            {decision === 'allow_session' && <span className="text-[10px] opacity-70">(this run)</span>}
          </span>
        ) : (
          <>
            <button
              onClick={() => onDecision?.(data?.requestId, 'deny')}
              disabled={data?.resolving || expired}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Deny
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow')}
              disabled={data?.resolving || expired}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 shadow-sm ${dangerous ? 'bg-rose-600 hover:bg-rose-700' : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600'}`}
            >
              {data?.resolving && <Loader2 className="h-3 w-3 animate-spin" />}
              Approve once
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow_session')}
              disabled={data?.resolving || expired}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Trust this run
            </button>
            <button
              onClick={() => onDecision?.(data?.requestId, 'allow_always')}
              disabled={data?.resolving || expired}
              title={`Always allow ${data?.tool} without asking`}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/20"
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
    <FeedFrame className="mb-2">
      <div className="overflow-hidden">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex w-full items-center gap-1.5 py-1 rounded-md text-left transition-colors hover:text-gray-500 dark:hover:text-gray-400"
        >
          {expanded ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />}
          <Terminal className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 tracking-wide select-none">
            Tools {summary && `· ${summary}`}
          </span>
        </button>
        {expanded && (
          <div className="mt-1 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-1">
            {events.map((ev, i) => {
              if (ev.type === 'permission_request') {
                return <CompactPermissionEvent key={i} data={ev.data} onDecision={onPermissionDecision} />;
              }
              if (ev.type === 'tool_start') {
                const hasAudioResult = ev.data?.tool === 'speak_text' && ev.result?.success && ev.result?.path;
                const hasImageResult = (ev.data?.tool === 'generate_image' || ev.data?.tool === 'edit_image') && ev.result?.success && (ev.result?.media || ev.result?.image);
                const hasScreenshotResult = (ev.data?.tool === 'screenshot_page' || ev.data?.tool === 'take_screenshot') && ev.result?.success && ev.result?.image;
                return (
                  <div key={i}>
                    <ToolEvent data={ev.data} result={ev.result} onRetryTool={onRetryTool} framed={false} progress={ev.progress} />
                    {hasAudioResult && <AudioResultCard result={ev.result} />}
                    {hasImageResult && <ImageResultCard result={ev.result} />}
                    {hasScreenshotResult && <ScreenshotResultCard result={ev.result} />}
                  </div>
                );
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
  const [answered, setAnswered] = useState(Boolean(data?._inferred_answered));
  const [chosenAnswer, setChosenAnswer] = useState(data?._inferred_answered ? '(answered)' : '');
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
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <MessageCircle className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Agent question</span>
            <p className="text-sm text-gray-800 dark:text-gray-100 mt-1 leading-relaxed">{data?.question}</p>

            {answered ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">You replied: "{chosenAnswer}"</p>
            ) : (
              <>
                {data?.choices?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.choices.map((choice, i) => (
                      <button
                        key={i}
                        onClick={() => submit(choice)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
                    className="flex-1 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    autoFocus
                  />
                  <button
                    onClick={() => submit()}
                    disabled={!inputValue.trim() && !data?.default}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white flex items-center gap-1 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
                {data?.default && (
                  <button
                    onClick={() => submit(data.default)}
                    className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
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
          <div className="flex flex-wrap gap-2.5">
            {images.map((img, i) => (
              <a
                key={img.image || img.thumbnail || img.url || i}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 transition hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700"
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
function AnswerEvent({
  data,
  suppressThinkFallback = false,
  ttsReady = false,
  onRegenerateAnswer,
  onSelectAnswerVariant,
  onToggleMessageFlag,
  isRunning,
  highlighted = false,
  tokensPerSecond = null,
  elapsedMs = null,
  isStoppedRun = false,
}) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const raw = data?.answer || '';
  const { thinking: thinkFallback, answer } = extractReasoningFromText(raw);
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  const activeVariantIndex = Number.isInteger(data?.activeVariantIndex) ? data.activeVariantIndex : Math.max(variants.length - 1, 0);

  const displayAnswer = answer;

  if (!displayAnswer && !thinkFallback) return null;

  let blocks = [];
  try {
    blocks = parseAIResponseToBlocks(displayAnswer);
  } catch { blocks = []; }

  const answerBody = (
    <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
      {blocks.length > 0
        ? blocks.map((block, i) => <BlockRenderer key={i} block={block} />)
        : <p className="whitespace-pre-wrap">{displayAnswer}</p>}
    </div>
  );

  return (
    <>
      {!suppressThinkFallback && thinkFallback && <ThinkingEvent data={{ thought: thinkFallback }} />}
      {displayAnswer && <div
        id={data?.messageId ? `message-${data.messageId}` : undefined}
        data-message-id={data?.messageId || undefined}
        className={`group mb-6 scroll-mt-24 rounded-2xl transition-colors duration-700 ${
          highlighted ? 'bg-amber-50/80 dark:bg-amber-950/20' : ''
        }`}
      >
        <div className="max-w-4xl mx-auto">
          {/* Badge row — only show when not a stopped run (stop banner owns the visual) */}
          {!isStoppedRun && (
            <div className="mb-2">
              <ModeBadge toolsEnabled={data?.toolsEnabled} agentMode={data?.agentMode} />
              {data?.bookmarked && <BookMarked className="ml-1 inline h-3.5 w-3.5 text-amber-500" />}
            </div>
          )}

          {/* Answer body — collapsed behind a disclosure when the run was stopped */}
          {isStoppedRun ? (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setNotesExpanded(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                {notesExpanded
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />}
                Agent notes
                {data?.bookmarked && <BookMarked className="ml-0.5 h-3 w-3 text-amber-500" />}
              </button>
              {notesExpanded && (
                <div className="mt-2 pl-4 border-l-2 border-gray-100 dark:border-gray-800">
                  {answerBody}
                </div>
              )}
            </div>
          ) : (
            answerBody
          )}

          {/* Read Aloud Action */}
          {ttsReady && displayAnswer && !isStoppedRun && (
            <div className="mt-3 max-w-xl">
              <InlineAudioPlayer
                loadSrc={() => audioApi.tts.speak(displayAnswer)}
                showInfo={true}
                infoContent={
                  <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500">Read aloud</span>
                }
              />
            </div>
          )}

          <SourcesPanel searchEvent={data?.searchEvent} />
          {!isStoppedRun && data?.round > 1 && (
            <p className="text-[10px] text-gray-300 dark:text-gray-700 mt-2">{data.round} rounds</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {(tokensPerSecond > 0 || elapsedMs > 0) && (
              <span className="mr-1 flex items-center gap-1.5 text-[10px] tabular-nums text-gray-300 dark:text-gray-600">
                {tokensPerSecond > 0 && <span>{tokensPerSecond} tok/s</span>}
                {tokensPerSecond > 0 && elapsedMs > 0 && <span className="opacity-40">·</span>}
                {elapsedMs > 0 && <span>{formatElapsed(elapsedMs)}</span>}
              </span>
            )}
            {variants.length > 1 && (
              <div className="mr-1 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1 py-0.5 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                <button
                  type="button"
                  onClick={() => onSelectAnswerVariant?.(data?.messageId, Math.max(0, activeVariantIndex - 1))}
                  disabled={activeVariantIndex <= 0 || isRunning}
                  className="rounded p-0.5 disabled:opacity-30"
                  title="Previous variant"
                >
                  <SkipBack className="h-3 w-3" />
                </button>
                <span className="min-w-8 text-center tabular-nums">{activeVariantIndex + 1} / {variants.length}</span>
                <button
                  type="button"
                  onClick={() => onSelectAnswerVariant?.(data?.messageId, Math.min(variants.length - 1, activeVariantIndex + 1))}
                  disabled={activeVariantIndex >= variants.length - 1 || isRunning}
                  className="rounded p-0.5 disabled:opacity-30"
                  title="Next variant"
                >
                  <SkipForward className="h-3 w-3" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => onRegenerateAnswer?.(data?.messageId)}
              disabled={isRunning}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="Regenerate this answer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => onToggleMessageFlag?.(data?.messageId, 'bookmarked')}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${data?.bookmarked ? 'text-amber-500' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              title={data?.bookmarked ? 'Remove bookmark' : 'Bookmark answer'}
            >
              <BookMarked className="h-3.5 w-3.5" />
              Bookmark
            </button>
          </div>
        </div>
      </div>}
    </>
  );
}

function ErrorEvent({ data, onRetryGoal, onRunWithAction }) {
  return (
    <FeedFrame className="mb-3">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-sm px-4 py-3 flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex items-center justify-center mt-0.5">
          <XCircle className="w-3 h-3 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">{data?.message || 'Agent encountered an error.'}</p>
          {data?.goal && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onRetryGoal?.(data.goal)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => onRunWithAction?.(data.goal)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Zap className="h-3 w-3" />
                Action mode
              </button>
            </div>
          )}
        </div>
      </div>
    </FeedFrame>
  );
}

function StatusEvent({ data, onRunWithAction }) {
  return (
    <FeedFrame className="mb-3">
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span>{data?.message || 'Agent stopped.'}</span>
        {(data?.canRetryWithAction || data?.canRetryWithTools) && data?.goal && (
          <button
            type="button"
            onClick={() => onRunWithAction?.(data.goal)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Zap className="w-3 h-3" />
            Run in Action
          </button>
        )}
      </div>
    </FeedFrame>
  );
}

const STOP_REASON_CONFIG = {
  max_rounds: {
    icon: TimerOff,
    color: 'amber',
    label: 'Step limit reached',
    detail: (d) => `Used ${d.rounds ?? '?'} of ${d.maxRounds ?? '?'} steps. Reply to continue the task from where it left off.`,
  },
  tool_failure: {
    icon: XCircle,
    color: 'red',
    label: 'Stopped — repeated tool failures',
    detail: () => 'The agent hit too many consecutive tool errors. Check the tools above and try again.',
  },
  loop_detected: {
    icon: RefreshCw,
    color: 'amber',
    label: 'Stopped — loop detected',
    detail: () => 'The agent detected a repeating cycle and stopped to avoid runaway. Rephrase or add constraints to continue.',
  },
  reflection_abort: {
    icon: AlertTriangle,
    color: 'amber',
    label: 'Stopped — agent determined it was stuck',
    detail: () => 'Self-reflection concluded progress was blocked. Add more context or try a different approach.',
  },
  cancelled: {
    icon: XCircle,
    color: 'gray',
    label: 'Cancelled',
    detail: () => 'Run was stopped by the user.',
  },
};

function StopReasonBanner({ data, toolResults = [] }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STOP_REASON_CONFIG[data?.stopReason] || null;
  if (!cfg) return null;
  const Icon = cfg.icon;

  const succeeded = toolResults.filter(ev => ev.result?.success !== false).length;
  const failed = toolResults.filter(ev => ev.result?.success === false).length;
  const hasStats = toolResults.length > 0;

  const colorMap = {
    amber: {
      wrap: 'border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/15',
      header: 'text-amber-700 dark:text-amber-400',
      icon: 'text-amber-500 dark:text-amber-400',
      pill: 'bg-amber-100/80 dark:bg-amber-900/30',
    },
    red: {
      wrap: 'border-red-200/70 bg-red-50/60 dark:border-red-800/40 dark:bg-red-950/15',
      header: 'text-red-700 dark:text-red-400',
      icon: 'text-red-500 dark:text-red-400',
      pill: 'bg-red-100/80 dark:bg-red-900/30',
    },
    gray: {
      wrap: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40',
      header: 'text-gray-600 dark:text-gray-400',
      icon: 'text-gray-400 dark:text-gray-500',
      pill: 'bg-gray-100 dark:bg-gray-800',
    },
  };
  const c = colorMap[cfg.color];

  return (
    <FeedFrame className="mb-4">
      <div className={`rounded-xl border ${c.wrap} overflow-hidden`}>
        {/* Header row */}
        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 ${c.header}`}>
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${c.icon}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold leading-tight">{cfg.label}</p>
            <p className="mt-0.5 text-[11px] opacity-75 leading-relaxed">{cfg.detail(data)}</p>
          </div>
          {hasStats && (
            <div className="flex items-center gap-1.5 shrink-0">
              {succeeded > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {succeeded}
                </span>
              )}
              {failed > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100/80 dark:bg-red-950/40 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                  <XCircle className="w-2.5 h-2.5" />
                  {failed}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tool result grid — show if there's any tool history */}
        {hasStats && (
          <>
            <div className={`border-t ${cfg.color === 'gray' ? 'border-gray-200 dark:border-gray-700' : cfg.color === 'red' ? 'border-red-200/50 dark:border-red-800/30' : 'border-amber-200/50 dark:border-amber-800/30'}`}>
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className={`flex w-full items-center gap-1.5 px-3.5 py-1.5 text-left text-[10px] font-medium opacity-60 hover:opacity-90 transition-opacity ${c.header}`}
              >
                {expanded
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />}
                {expanded ? 'Hide' : 'Show'} {toolResults.length} operation{toolResults.length !== 1 ? 's' : ''}
              </button>
            </div>

            {expanded && (
              <div className={`border-t ${cfg.color === 'gray' ? 'border-gray-100 dark:border-gray-800' : cfg.color === 'red' ? 'border-red-100/40 dark:border-red-900/20' : 'border-amber-100/40 dark:border-amber-900/20'} px-3.5 py-2 space-y-0.5 max-h-48 overflow-y-auto`}>
                {toolResults.map((ev, i) => {
                  const ok = ev.result?.success !== false;
                  const name = ev.data?.tool || '?';
                  return (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      {ok
                        ? <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500 dark:text-emerald-400" />
                        : <XCircle className="w-3 h-3 shrink-0 text-red-500 dark:text-red-400" />
                      }
                      <span className={`text-[11px] font-mono truncate ${ok ? 'text-gray-600 dark:text-gray-300' : 'text-red-600 dark:text-red-400 font-medium'}`}>
                        {name}
                      </span>
                      {!ok && ev.result?.error && (
                        <span className="truncate text-[10px] text-red-500/70 dark:text-red-500/60 ml-auto max-w-[40%]">
                          {ev.result.error}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
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
      <div className="flex items-start gap-3 text-xs">
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${isError ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500 dark:text-gray-400" /> : <span className="text-sm">{icon}</span>}
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

// Token usage meter — compact inline indicator
function TokenUsageEvent({ data }) {
  if (!data?.totalTokens) return null;
  const total = data.totalTokens;
  const input = data.inputTokens || 0;
  const output = data.outputTokens || 0;
  const maxTokens = data.contextWindow || (data.isLocal ? 8000 : 128000);
  const pct = Math.min(100, Math.round((total / maxTokens) * 100));
  const isHigh = pct > 70;
  const isCritical = pct > 90;
  const speed = data.tokensPerSecond;
  const isEstimated = data.estimated;

  return (
    <FeedFrame className="mb-1">
      <div className="flex items-center gap-2 py-0.5">
        <Zap className={`w-3 h-3 flex-shrink-0 ${isCritical ? 'text-red-400' : isHigh ? 'text-amber-400' : 'text-gray-400 dark:text-gray-600'}`} />
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-600">
            {isEstimated ? '~' : ''}{(total / 1000).toFixed(1)}k tokens ({(input / 1000).toFixed(1)}k in / {(output / 1000).toFixed(1)}k out)
          </span>
          {speed > 0 && (
            <span className="text-[10px] tabular-nums text-indigo-400 dark:text-indigo-500">
              {speed} tok/s
            </span>
          )}
          <div className="flex-1 h-1 max-w-[80px] bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isCritical ? 'bg-red-400' : isHigh ? 'bg-amber-400' : 'bg-indigo-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[9px] tabular-nums text-gray-300 dark:text-gray-700">{pct}%</span>
          {isEstimated && (
            <span className="text-[9px] text-gray-300 dark:text-gray-700 italic">est.</span>
          )}
        </div>
      </div>
    </FeedFrame>
  );
}

// Compaction notification — shown when context window was compressed
function CompactionEvent({ data }) {
  const dropped = data?.droppedMessages || 0;
  const before = data?.tokensBefore ? (data.tokensBefore / 1000).toFixed(1) : '?';
  const after = data?.tokensAfter ? (data.tokensAfter / 1000).toFixed(1) : '?';

  return (
    <FeedFrame className="mb-2">
      <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/30 dark:border-amber-800/20">
        <RotateCcw className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
        <span className="text-[11px] text-amber-600 dark:text-amber-400">
          Context compacted: {dropped} messages summarized ({before}k → {after}k tokens)
        </span>
      </div>
    </FeedFrame>
  );
}

// Correction learned notification
function CorrectionLearnedEvent({ data }) {
  return (
    <FeedFrame className="mb-2">
      <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-violet-50/50 dark:bg-violet-900/10 border border-violet-200/30 dark:border-violet-800/20">
        <Brain className="w-3 h-3 text-violet-500 dark:text-violet-400 flex-shrink-0" />
        <span className="text-[11px] text-violet-600 dark:text-violet-400">
          Correction stored — will remember for future tasks
        </span>
      </div>
    </FeedFrame>
  );
}

// Skill auto-discovery notification
function SkillSuggestedEvent({ data }) {
  return (
    <FeedFrame className="mb-2">
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/30 dark:border-emerald-800/20">
        <Zap className="w-3 h-3 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Skill auto-learned: {data?.skillName || 'unnamed'}
          </span>
          {data?.summary && (
            <p className="text-[10px] text-emerald-500/70 dark:text-emerald-500/50 truncate mt-0.5">
              Pattern: {data.summary}
            </p>
          )}
        </div>
      </div>
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

export function CurrentPlanPanel({ data, isRunning, sessionId, className = '' }) {
  const plan = Array.isArray(data?.plan) ? data.plan : [];
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState('');
  const [saving, setSaving] = useState(false);

  const openEditor = () => {
    setEditLines(plan.map(i => i.content).join('\n'));
    setEditing(true);
  };

  const savePlan = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      const lines = editLines.split('\n').map(l => l.trim()).filter(Boolean);
      const updated = lines.map((content, idx) => ({
        id: plan[idx]?.id || `plan_edit_${idx}`,
        content,
        status: plan[idx]?.status || 'pending',
      }));
      await agentApi.updatePlan(sessionId, updated);
      setEditing(false);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  if (!plan.length) return null;

  const completed = plan.filter(i => i.status === 'completed').length;
  const total = plan.length;
  const hasActiveItem = plan.some(i => i.status === 'in_progress');
  const isStaleActivePlan = hasActiveItem && !isRunning && completed < total;
  const isDone = completed === total && total > 0;
  const pct = Math.round((completed / total) * 100);

  if (editing) {
    return (
      <div className={className}>
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Edit Plan</span>
            <span className="text-[10px] text-gray-400">One step per line</span>
          </div>
          <textarea
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            rows={Math.max(3, editLines.split('\n').length + 1)}
            value={editLines}
            onChange={e => setEditLines(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={savePlan}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Spinner className="w-3 h-3 animate-spin" /> : null}
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isDone && !isRunning) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 px-4 py-2.5 text-xs shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium text-gray-700 dark:text-gray-200">
              Plan done
            </span>
          </div>
          <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
            {completed}/{total}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
            Plan
          </span>
          <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
            {completed}/{total}
          </span>
          {completed === total && total > 0 && (
            <span className="text-[10px] font-medium text-emerald-500">Done</span>
          )}
          {isStaleActivePlan && (
            <span className="text-[10px] font-medium text-amber-500">Stopped</span>
          )}
          {total > 0 && (
            <span className="ml-auto text-[10px] tabular-nums font-medium text-gray-400 dark:text-gray-500">
              {pct}%
            </span>
          )}
          {sessionId && (
            <button
              onClick={openEditor}
              title="Edit plan"
              className="ml-1 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* Progress bar */}
        {total > 0 && (
          <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${completed === total ? 'bg-emerald-500' : 'bg-gray-800 dark:bg-gray-200'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <ul className="space-y-1.5">
          {plan.map((item, i) => (
            <li key={item.id || i} className="flex items-start gap-2.5 text-[12px] leading-snug">
              <span className={`mt-0.5 shrink-0 ${
                item.status === 'completed'
                  ? 'text-emerald-500 dark:text-emerald-400'
                  : item.status === 'in_progress'
                    ? (isRunning ? 'text-gray-700 dark:text-gray-200' : 'text-amber-500 dark:text-amber-400')
                    : 'text-gray-300 dark:text-gray-600 midnight:text-gray-600'
              }`}>
                {item.status === 'completed' ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : item.status === 'in_progress' && isRunning ? (
                  <span className="block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : item.status === 'in_progress' ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M9 12h6" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /></svg>
                )}
              </span>
              <span className={`min-w-0 flex-1 ${
                item.status === 'completed'
                  ? 'text-gray-400 dark:text-gray-500 midnight:text-gray-500'
                  : item.status === 'in_progress'
                    ? 'font-medium text-gray-800 dark:text-gray-100 midnight:text-slate-100'
                    : 'text-gray-600 dark:text-gray-400 midnight:text-slate-400'
              }`}>
                {item.status === 'in_progress' && item.activeForm ? item.activeForm : item.content}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RunningIndicator({ runStartedAt }) {
  const elapsed = useElapsedTime(runStartedAt);
  return (
    <FeedFrame>
    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600 py-2">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
      Agent is working…
      {elapsed > 0 && (
        <span className="tabular-nums text-gray-400 dark:text-gray-600">{formatElapsed(elapsed)}</span>
      )}
    </div>
    </FeedFrame>
  );
}

function collectGeneratedMedia(events = []) {
  const items = [];
  for (const ev of events) {
    if (ev.type !== 'tool_start' || !ev.result?.success) continue;
    const tool = ev.data?.tool;
    if ((tool === 'generate_image' || tool === 'edit_image') && (ev.result.media || ev.result.image)) {
      items.push({ type: 'image', tool, result: ev.result, id: `${tool}:${ev.result.media?.path || ev.result.seed || items.length}` });
    } else if (tool === 'speak_text' && ev.result.path) {
      items.push({ type: 'audio', tool, result: ev.result, id: `audio:${ev.result.path}` });
    }
    // artifacts have their own inline cards — not duplicated here
  }
  return items;
}

function MediaThumb({ item }) {
  const media = item.result?.media || {};
  const [src, setSrc] = useState(item.result?.image && String(item.result.image).startsWith('data:') ? item.result.image : null);

  useEffect(() => {
    const path = item.type === 'audio' ? item.result?.path : media.path;
    const rootId = item.type === 'audio' ? 'workspace' : media.rootId;
    if (!path || !rootId) return undefined;
    let cancelled = false;
    filesApi.fetchRawBlob(rootId, path)
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.result?.path, item.type, media.path, media.rootId]);

  if (item.type === 'image') {
    return src ? <img src={src} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <Image className="h-5 w-5 text-gray-400" />;
  }
  if (item.type === 'audio') {
    return <Volume2 className="h-5 w-5 text-emerald-500" />;
  }
  return <FilePlus className="h-5 w-5 text-fuchsia-500" />;
}

function GeneratedMediaLibrary({ events }) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => collectGeneratedMedia(events), [events]);
  if (!items.length) return null;

  return (
    <FeedFrame className="mb-4">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          <Image className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Generated media</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">{items.length}</span>
        </span>
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => {
            const artifact = item.result?.artifact;
            const label = item.type === 'image'
              ? (item.result?.prompt || item.result?.media?.prompt || 'Generated image')
              : item.type === 'audio'
                ? (item.result?.path?.split('/').pop() || 'Generated speech')
                : (artifact?.title || artifact?.filename || 'Artifact');
            const detail = item.type === 'image'
              ? `${item.result?.runtime || 'image'} · ${item.result?.width || item.result?.media?.width || '?'}x${item.result?.height || item.result?.media?.height || '?'}`
              : item.type === 'audio'
                ? `${item.result?.audio_size || 'Audio'} · ${item.result?.voice || 'TTS'}`
                : artifact?.type || 'artifact';
            return (
              <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900/60">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-950">
                  <MediaThumb item={item} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-gray-400 dark:text-gray-500">{detail}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </FeedFrame>
  );
}

// ── Post-run unified card ─────────────────────────────────────────────────────
// Merges "Run complete" stats with "Changes from this run" file/command list
// and optional revert controls — all in one collapsible card.

function buildRunStats(events = []) {
  let rounds = 0;
  let toolCount = 0;
  let memoriesSaved = 0;
  let skillsLearned = 0;
  const toolsSeen = {};
  let completedAt = 0;

  for (const ev of events) {
    if (!ev) continue;
    if (ev.type === 'answer') {
      if (ev.data?.round > rounds) rounds = ev.data.round;
      if (ev.arrivedAt > completedAt) completedAt = ev.arrivedAt;
    }
    if (ev.type === 'tool_start') {
      const tool = ev.data?.tool;
      if (!tool) continue;
      if (ev.result?.success === false) continue;
      toolCount++;
      toolsSeen[tool] = (toolsSeen[tool] || 0) + 1;
      if (tool === 'save_memory' && ev.result?.success) memoriesSaved++;
    }
    if (ev.type === 'skill_suggested') skillsLearned++;
    if (ev.arrivedAt > completedAt) completedAt = ev.arrivedAt;
  }

  return { rounds, toolCount, memoriesSaved, skillsLearned, toolsSeen, completedAt };
}

function RunSummaryCard({ events, runStartedAt, sessionId, session, onViewArtifactInPanel }) {
  const [expanded, setExpanded] = useState(false);
  const [stateData, setStateData] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [revertMessage, setRevertMessage] = useState(null);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);

  const hasAnswer = (events || []).some(ev => ev.type === 'answer');
  const { rounds, toolCount, memoriesSaved, skillsLearned, toolsSeen, completedAt } = buildRunStats(events || []);
  const hasToolActivity = toolCount > 0;
  const hasMemoryActivity = memoriesSaved > 0;
  const hasSkillActivity = skillsLearned > 0;

  const fallbackChanges = useMemo(() => extractChanges(events || []), [events]);
  const files = stateData?.changes?.files || fallbackChanges.files;
  const commands = stateData?.changes?.commands || fallbackChanges.commands;
  const hasFiles = files.length > 0;
  const hasCommands = commands.length > 0;
  const checkpoint = stateData?.checkpoint || session?.scratchpad?.baselineCheckpoint || null;
  const revert = stateData?.revert || null;

  const previewUrl = useMemo(() => {
    for (let i = (events || []).length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev?.type === 'tool_start' && ev.data?.tool === 'run_command' && ev.result) {
        const out = ev.result?.output || ev.result?.stdout;
        if (typeof out === 'string') { const u = extractLocalhostUrl(out); if (u) return u; }
      }
    }
    return null;
  }, [events]);

  const refreshState = useCallback(() => {
    if (!sessionId) return;
    setStateLoading(true);
    agentApi.getSessionChangesState(sessionId)
      .then(res => { if (res.success) setStateData(res); })
      .catch(() => {})
      .finally(() => setStateLoading(false));
  }, [sessionId]);

  useEffect(() => { refreshState(); }, [refreshState]);

  if (!hasAnswer) return null;
  if (!hasToolActivity && !hasMemoryActivity && !hasSkillActivity) return null;

  const elapsedMs = runStartedAt && completedAt > runStartedAt ? completedAt - runStartedAt : 0;
  const topTools = Object.entries(toolsSeen).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count }));

  // Collect artifacts created in this run
  const runArtifacts = useMemo(() =>
    (events || []).filter(ev =>
      ev.type === 'tool_start' && ARTIFACT_TOOLS.has(ev.data?.tool) && ev.result?.success && ev.result?.artifact
    ),
    [events]
  );
  const hasArtifacts = runArtifacts.length > 0;

  const handleRevert = async () => {
    if (!sessionId || !revert?.available) return;
    setReverting(true);
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

  // Build summary line for the collapsed header
  const summaryParts = [];
  if (hasArtifacts) summaryParts.push(`${runArtifacts.length} artifact${runArtifacts.length !== 1 ? 's' : ''}`);
  if (hasFiles) summaryParts.push(`${files.length} file${files.length !== 1 ? 's' : ''}`);
  if (hasToolActivity) summaryParts.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''}`);
  if (hasMemoryActivity) summaryParts.push(`${memoriesSaved} mem`);
  if (hasSkillActivity) summaryParts.push(`${skillsLearned} skill`);
  if (elapsedMs > 0) summaryParts.push(formatElapsed(elapsedMs));
  const summaryLine = summaryParts.join(' · ');

  return (
    <FeedFrame className="mb-3 mt-1">
      {/* Header — same style as ThinkingEvent / AgentWorkDrawer */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left group"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-colors" />
          : <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-colors" />}
        <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors truncate">
          Run complete{summaryLine ? ` · ${summaryLine}` : ''}
        </span>
        <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 ml-1" />
      </button>

      {/* Expanded detail — no card border, just indented sections */}
      {expanded && (
        <div className="mt-2 pl-4 space-y-0 border-l-2 border-gray-100 dark:border-gray-800 midnight:border-slate-800">
          {/* Dev server hint */}
          {previewUrl && (
            <div className="flex items-center gap-2 py-1.5">
              <Globe className="h-3 w-3 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Dev server at <code className="font-mono text-[10px]">{previewUrl}</code> — click <strong>Preview</strong> in the toolbar.
              </span>
            </div>
          )}

          {/* Artifacts */}
          {hasArtifacts && (
            <div className="py-1.5 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Artifacts</p>
              {runArtifacts.map((ev, i) => (
                <ArtifactResultCard key={`run_art_${i}`} result={ev.result} onViewInPanel={onViewArtifactInPanel} />
              ))}
            </div>
          )}

          {/* Files + commands */}
          {(hasFiles || hasCommands) && (
            <div className="py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                {[hasFiles && `${files.length} file${files.length !== 1 ? 's' : ''}`, hasCommands && `${commands.length} command${commands.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
              </p>
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                {files.map((change, i) => (
                  <FileChangeRow key={`${change.path}-${i}`} change={change} state={stateData?.fileStates?.[change.path] || { state: 'unknown' }} />
                ))}
                {commands.map((change, i) => (
                  <CommandRow key={`cmd-${i}`} change={change} />
                ))}
              </div>
            </div>
          )}

          {/* Tools used */}
          {topTools.length > 0 && (
            <div className="py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Tools used</p>
              <div className="flex flex-wrap gap-1.5">
                {topTools.map(({ name, count }) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                    {count > 1 && <span className="font-semibold">{count}×</span>}
                    {name.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer controls */}
          <div className="flex items-center justify-between gap-3 pt-1 pb-0.5">
            <div className="flex items-center gap-3">
              {rounds > 0 && <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{rounds} round{rounds !== 1 ? 's' : ''}</span>}
            </div>
            <div className="flex items-center gap-2">
              {sessionId && (
                <button type="button" onClick={refreshState} disabled={stateLoading}
                  className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 transition-colors">
                  <RefreshCw className={`w-3 h-3 ${stateLoading ? 'animate-spin' : ''}`} />Refresh
                </button>
              )}
              {hasFiles && checkpoint && (
                <button type="button" onClick={() => setShowRevertConfirm(true)} disabled={!revert?.available || reverting}
                  title={revert?.available ? 'Revert this run' : (revert?.reason || 'Revert unavailable')}
                  className="inline-flex items-center gap-1 text-[10px] text-red-500 dark:text-red-400 hover:text-red-700 disabled:opacity-50 transition-colors">
                  {reverting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  {revert?.available ? 'Revert run' : 'Revert unavailable'}
                </button>
              )}
            </div>
          </div>

          {revertMessage && (
            <div className={`py-1.5 text-[11px] flex items-center gap-2 ${revertMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {revertMessage.type === 'success' ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
              {revertMessage.text}
            </div>
          )}
        </div>
      )}

      <RevertRunModal
        open={showRevertConfirm}
        goal={session?.goal || stateData?.goal}
        total={files.length + commands.length}
        checkpoint={checkpoint}
        reverting={reverting}
        onCancel={() => !reverting && setShowRevertConfirm(false)}
        onConfirm={handleRevert}
      />
    </FeedFrame>
  );
}

// ── Collapsible agent work drawer ─────────────────────────────────────────────
// Wraps all thinking/tool/status events between a user goal and its answer into
// a single toggleable section. Keeps the Q→A flow clean while preserving access
// to every detail.

function buildWorkSummary(workEvents) {
  const toolStarts = workEvents.filter(ev => ev.type === 'tool_start');
  const toolCount = toolStarts.length;
  const failedCount = toolStarts.filter(ev => ev.result?.success === false || ev.result?.error).length;
  const hasThinking = workEvents.some(ev => ev.type === 'thinking');
  const uniqueTools = [...new Set(toolStarts.map(ev => ev.data?.tool).filter(Boolean))];
  const topLabels = uniqueTools.slice(0, 3).map(t => getToolMeta(t).label);

  const parts = [];
  if (hasThinking) parts.push('Reasoned');
  if (toolCount > 0) parts.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''}`);
  if (topLabels.length) parts.push(topLabels.join(', '));
  if (failedCount > 0) parts.push(`${failedCount} failed`);
  return parts.join(' · ') || null;
}

function renderWorkContent(workEvents, { onPermissionDecision, onRetryTool, onAskUserAnswer, onRetryGoal, onRunWithAction }) {
  const rendered = [];
  let toolBuf = [];
  // All tool_start events seen so far — for StopReasonBanner breakdown
  const allToolsSeen = [];

  const flushTools = () => {
    if (!toolBuf.length) return;
    rendered.push(
      <ToolsSection
        key={`tools_${rendered.length}`}
        events={toolBuf}
        onPermissionDecision={onPermissionDecision}
        onRetryTool={onRetryTool}
      />
    );
    toolBuf = [];
  };

  workEvents.forEach((ev, i) => {
    if (ev.type === 'permission_request' || ev.type === 'tool_start') {
      toolBuf.push(ev);
      if (ev.type === 'tool_start') allToolsSeen.push(ev);
      return;
    }
    flushTools();

    switch (ev.type) {
      case 'thinking':
        rendered.push(<ThinkingEvent key={i} data={ev.data} />);
        break;
      case 'ask_user':
        rendered.push(<AskUserEvent key={i} data={ev.data} onAnswer={onAskUserAnswer} />);
        break;
      case 'error':
        rendered.push(<ErrorEvent key={i} data={ev.data} onRetryGoal={onRetryGoal} onRunWithAction={onRunWithAction} />);
        break;
      case 'status':
        rendered.push(<StatusEvent key={i} data={ev.data} onRunWithAction={onRunWithAction} />);
        break;
      case 'stop_reason':
        rendered.push(<StopReasonBanner key={i} data={ev.data} toolResults={[...allToolsSeen]} />);
        break;
      case 'agent_delegate_start':
        rendered.push(<AgentDelegateEvent key={i} data={ev.data} pending />);
        break;
      case 'agent_delegate_result':
        rendered.push(<AgentDelegateEvent key={i} data={ev.data} result={ev.data} />);
        break;
      case 'skills_loaded':
        rendered.push(<SkillsLoadedEvent key={i} data={ev.data} />);
        break;
      case 'compaction':
        rendered.push(<CompactionEvent key={i} data={ev.data} />);
        break;
      case 'correction_learned':
        rendered.push(<CorrectionLearnedEvent key={i} data={ev.data} />);
        break;
      case 'skill_suggested':
        rendered.push(<SkillSuggestedEvent key={i} data={ev.data} />);
        break;
      default:
        break;
    }
  });

  flushTools();
  return rendered;
}

function AgentWorkDrawer({ workEvents, isRunning, onPermissionDecision, onRetryTool, onAskUserAnswer, onRetryGoal, onRunWithAction }) {
  const hasPendingPermission = workEvents.some(ev => ev.type === 'permission_request' && !ev.data?.resolved);
  const hasPendingQuestion = workEvents.some(ev => ev.type === 'ask_user' && !ev.data?.answered);
  const hasBlocker = hasPendingPermission || hasPendingQuestion;
  const hasError = workEvents.some(ev => ev.type === 'error' || ev.type === 'stop_reason');

  const [open, setOpen] = useState(isRunning || hasBlocker || hasError);

  // Force open when the agent needs user input or starts running
  useEffect(() => {
    if (isRunning || hasBlocker) setOpen(true);
  }, [isRunning, hasBlocker]);

  if (!workEvents.length) return null;

  const content = renderWorkContent(workEvents, { onPermissionDecision, onRetryTool, onAskUserAnswer, onRetryGoal, onRunWithAction });
  if (!content.length) return null;

  const summary = buildWorkSummary(workEvents);

  return (
    <FeedFrame className="mb-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left group"
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-colors" />
          : <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-colors" />}
        {isRunning ? (
          <span className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Working…
          </span>
        ) : summary ? (
          <span className="flex-shrink-0 text-[11px] font-medium text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors truncate max-w-[72%]">
            {summary}
          </span>
        ) : null}
        <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800" />
      </button>
      {open && (
        <div className="mt-1 space-y-0">
          {content}
        </div>
      )}
    </FeedFrame>
  );
}

// ── Event segmentation ────────────────────────────────────────────────────────
// Groups events into conversation turns: [user goal → work events → answer].
// Each segment is rendered as: UserGoalEvent + AgentWorkDrawer + AnswerEvent.

export function buildEventSegments(evList) {
  const segments = [];
  let current = null;

  for (const ev of evList) {
    if (ev.type === 'run_start') {
      if (current) segments.push(current);
      segments.push({ divider: ev });
      current = null;
    } else if (ev.type === 'user_goal') {
      if (current) segments.push(current);
      current = { goalEvent: ev, workEvents: [], answerEvent: null };
    } else if (ev.type === 'answer') {
      if (!current) current = { goalEvent: null, workEvents: [], answerEvent: null };
      // Mark ask_user events as inferred-answered since agent produced a final answer
      current.workEvents = current.workEvents.map(we =>
        we.type === 'ask_user' ? { ...we, data: { ...we.data, _inferred_answered: true } } : we
      );
      current.answerEvent = ev;
      segments.push(current);
      current = null;
    } else {
      if (!current) current = { goalEvent: null, workEvents: [], answerEvent: null };
      current.workEvents.push(ev);
    }
  }

  if (current) segments.push(current);
  return segments;
}

// ── Main feed component ───────────────────────────────────────────────────────

export default function AgentRunFeed({
  events,
  isRunning,
  streamingText,
  runStartedAt,
  sessionId = null,
  session = null,
  onViewArtifactInPanel = null,
  onPermissionDecision,
  onAskUserAnswer,
  onRetryTool,
  onRunWithAction,
  onEditMessage,
  onRegenerateAnswer,
  onSelectAnswerVariant,
  onToggleMessageFlag,
  onRetryGoal,
  highlightedMessageId = null,
  ttsReady = false,
}) {
  const hasContent = (events && events.length > 0) || streamingText || isRunning;
  if (!hasContent) return null;

  const evList = events || [];
  const segments = buildEventSegments(evList);
  const lastAnswerIdx = evList.reduce((acc, ev, i) => ev.type === 'answer' ? i : acc, -1);
  const latestUsageTps = evList.reduceRight(
    (acc, ev) => acc !== null ? acc : (ev.type === 'usage_update' && ev.data?.tokensPerSecond > 0 ? ev.data.tokensPerSecond : null),
    null,
  );

  return (
    <div className="space-y-0">
      <GeneratedMediaLibrary events={evList} />

      {segments.map((seg, si) => {
        if (seg.divider) {
          return <RunDivider key={`divider_${si}`} data={seg.divider.data} />;
        }

        const isLastSeg = si === segments.length - 1;
        const segIsRunning = isLastSeg && isRunning;
        const answerIdx = seg.answerEvent ? evList.indexOf(seg.answerEvent) : -1;
        const hasThinkingInSeg = seg.workEvents.some(ev => ev.type === 'thinking');
        const hasStopReason = seg.workEvents.some(ev => ev.type === 'stop_reason');

        // Per-segment elapsed time: from first event in segment → answer arrival
        const segStartMs = seg.goalEvent?.arrivedAt
          || seg.workEvents[0]?.arrivedAt
          || (si === 0 ? runStartedAt : null);
        const segEndMs = seg.answerEvent?.arrivedAt;
        const segElapsedMs = segStartMs && segEndMs && segEndMs > segStartMs
          ? segEndMs - segStartMs : 0;

        // Artifacts always surface outside the collapsed drawer
        const segArtifacts = seg.workEvents.filter(ev =>
          ev.type === 'tool_start' && ARTIFACT_TOOLS.has(ev.data?.tool) && ev.result?.success && ev.result?.artifact
        );
        const drawerEvents = seg.workEvents.filter(ev =>
          !(ev.type === 'tool_start' && ARTIFACT_TOOLS.has(ev.data?.tool) && ev.result?.success && ev.result?.artifact)
        );

        return (
          <div key={si} id={`chat-seg-${si}`}>
            {seg.goalEvent && (
              <UserGoalEvent
                data={seg.goalEvent.data}
                onEditMessage={onEditMessage}
                onToggleMessageFlag={onToggleMessageFlag}
                isRunning={isRunning}
                highlighted={Boolean(seg.goalEvent.data?.messageId && seg.goalEvent.data.messageId === highlightedMessageId)}
              />
            )}
            <AgentWorkDrawer
              workEvents={drawerEvents}
              isRunning={segIsRunning}
              onPermissionDecision={onPermissionDecision}
              onRetryTool={onRetryTool}
              onAskUserAnswer={onAskUserAnswer}
              onRetryGoal={onRetryGoal}
              onRunWithAction={onRunWithAction}
            />
            {segArtifacts.map((ev, ai) => (
              <ArtifactResultCard key={`artifact_${si}_${ai}`} result={ev.result} prominent onViewInPanel={onViewArtifactInPanel} />
            ))}
            {seg.answerEvent && (
              <AnswerEvent
                data={seg.answerEvent.data}
                suppressThinkFallback={hasThinkingInSeg}
                ttsReady={ttsReady}
                onRegenerateAnswer={onRegenerateAnswer}
                onSelectAnswerVariant={onSelectAnswerVariant}
                onToggleMessageFlag={onToggleMessageFlag}
                isRunning={isRunning}
                highlighted={Boolean(seg.answerEvent.data?.messageId && seg.answerEvent.data.messageId === highlightedMessageId)}
                tokensPerSecond={!isRunning && answerIdx === lastAnswerIdx ? latestUsageTps : null}
                elapsedMs={!isRunning && segElapsedMs > 0 ? segElapsedMs : null}
                isStoppedRun={hasStopReason}
              />
            )}
          </div>
        );
      })}

      {isRunning && <StreamingPreview text={streamingText} />}
      {isRunning && !streamingText && <RunningIndicator runStartedAt={runStartedAt} />}
      {!isRunning && <RunSummaryCard events={evList} runStartedAt={runStartedAt} sessionId={sessionId} session={session} onViewArtifactInPanel={onViewArtifactInPanel} />}
    </div>
  );
}
