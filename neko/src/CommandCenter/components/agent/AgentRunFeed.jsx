import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Terminal, Globe, File, FolderOpen, BookMarked, ThumbsUp, ThumbsDown,
  Search, Pencil, Trash2, List, Zap, FilePlus, FileDown,
  FileText, LayoutList, ShieldAlert, MessageCircle, Send, GitBranch,
  ShieldOff, Brain, RotateCcw, Link2, Image, ExternalLink, Copy, Volume2, Square, Loader2 as Spinner, Download, Mic, SkipBack, SkipForward,
  AlertTriangle, RefreshCw, TimerOff, AlertCircle, Palette, Bell, Eye, Lock, Wrench, Check, ChevronLeft, Plug,
  MousePointerClick, Keyboard, AppWindow, Hand, Code2, ArrowLeftRight, SlidersHorizontal,
} from 'lucide-react';
import { audioApi } from '../../../Settings/settingApi.js';
import { filesApi, agentApi } from '../../api';
import { extractChanges, FileChangeRow, CommandRow, RevertRunModal } from './AgentChangesPanel';
import { parseAIResponseToBlocks, BlockRenderer } from '../renderers/BlockBasedMessageRenderer';
import { extractReasoningFromText, normalizeReasoningForDisplay } from '../../utils/reasoningParser.js';
import ArtifactCard from '../renderers/ArtifactRenderer';
import { AttachmentChip, ImageLightbox } from '../shared/AttachmentComponents.jsx';
import { useUiPreferences } from '../../../contexts/UiPreferencesContext.jsx';
import { openWebLink } from '../../../utils/openWebLink.js';
import { extractLocalhostUrl } from '../../utils/localhostUrl.js';
import { connectorToolLabel } from '../../../Connectors/connectorFormat.js';
import Tooltip from '../../../components/ui/Tooltip.jsx';
import Button from '../../../components/ui/Button.jsx';
import Dialog from '../../../components/ui/Dialog.jsx';
import { MODEL_ACTION_EVENT } from '../renderers/interactiveEvents.js';
import AskUserForm from './AskUserForm.jsx';
import SkillSuggestionCard from './SkillSuggestionCard.jsx';
import useSkillSuggestions from '../../hooks/useSkillSuggestions.js';
import { placeSkillSuggestions } from '../../utils/skillSuggestions.js';
import { currentToolName } from '../../utils/toolNames.js';

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
      <span key={`m${match.index}`} className="rounded bg-accent-soft px-0.5 font-medium text-accent">
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < goal.length) parts.push(<span key={`t${lastIndex}`}>{goal.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : goal;
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
  apply_patch:       { icon: Pencil,      label: 'Edit files' },
  list_definitions:  { icon: List,        label: 'List definitions' },
  find_definition:   { icon: Search,      label: 'Find definition' },
  code_search:       { icon: Search,      label: 'Search code' },
  file_diff:         { icon: FileText,    label: 'File diff' },
  move_file:         { icon: File,        label: 'Move file' },
  copy_file:         { icon: File,        label: 'Copy file' },
  run_command:       { icon: Terminal,    label: 'Run command' },
  run_python:        { icon: Terminal,    label: 'Run Python' },
  run_node:          { icon: Terminal,    label: 'Run Node' },
  run_shell_command:   { icon: Terminal,    label: 'Run command' },
  shell_session_start: { icon: Terminal,    label: 'Start shell session' },
  shell_session_run:   { icon: Terminal,    label: 'Run in session' },
  execute_shell:       { icon: Terminal,    label: 'Run command' },
  clipboard_read:      { icon: Copy,        label: 'Read clipboard' },
  clipboard_write:     { icon: Copy,        label: 'Write clipboard' },
  reveal_in_finder:    { icon: FolderOpen,  label: 'Show in folder' },
  open_preview:        { icon: Globe,       label: 'Open preview' },
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
  fetch_url:         { icon: Globe,       label: 'Read web page' },
  search_images:     { icon: Image,       label: 'Search images' },
  inspect_attachment:{ icon: File,        label: 'Inspect attachment' },
  generate_image:    { icon: Image,       label: 'Generated image' },
  edit_image:        { icon: Image,       label: 'Edited image' },
  // Browser
  preview_navigate:  { icon: Globe,       label: 'Open page' },
  preview_go_back:   { icon: Globe,       label: 'Go back' },
  preview_snapshot:  { icon: Eye,         label: 'Read page' },
  preview_get_text:  { icon: FileText,    label: 'Read page text' },
  preview_screenshot:{ icon: Image,       label: 'Screenshot page' },
  preview_click:     { icon: MousePointerClick, label: 'Click' },
  preview_hover:     { icon: MousePointerClick, label: 'Hover' },
  preview_type:      { icon: Keyboard,    label: 'Type' },
  preview_fill:      { icon: Keyboard,    label: 'Fill form' },
  preview_press_key: { icon: Keyboard,    label: 'Press key' },
  preview_select_option: { icon: List,    label: 'Choose option' },
  preview_scroll:    { icon: Globe,       label: 'Scroll' },
  preview_evaluate:  { icon: Code2,       label: 'Run script in page' },
  preview_wait_for_reload: { icon: RefreshCw, label: 'Wait for reload' },
  preview_list_tabs: { icon: AppWindow,   label: 'List tabs' },
  preview_open_tab:  { icon: AppWindow,   label: 'Open tab' },
  preview_switch_tab:{ icon: AppWindow,   label: 'Switch tab' },
  preview_close_tab: { icon: AppWindow,   label: 'Close tab' },
  preview_ask_user:  { icon: Hand,        label: 'Hand page to you' },
  remember:          { icon: BookMarked,  label: 'Remember' },
  save_memory:       { icon: BookMarked,  label: 'Save memory' },
  recall_memory:     { icon: BookMarked,  label: 'Recall memory' },
  list_memories:     { icon: BookMarked,  label: 'List memories' },
  forget_memory:     { icon: BookMarked,  label: 'Forget memory' },
  optimize_memory:   { icon: Brain,       label: 'Optimize memory' },
  todo_write:        { icon: LayoutList,  label: 'Update plan' },
  tool_search:       { icon: Search,      label: 'Find tools' },
  create_note:       { icon: FileText,    label: 'Create note' },
  list_notes:        { icon: FileText,    label: 'List notes' },
  app_open:          { icon: ExternalLink,label: 'Open app' },
  notification_status:{ icon: Bell,        label: 'Notification status' },
  notify_channel:    { icon: Bell,        label: 'Notify channel' },
  local_rag_index:   { icon: BookMarked,  label: 'Index local context' },
  local_rag_search:  { icon: Search,      label: 'Search local context' },
  local_rag_list:    { icon: List,        label: 'List local indexes' },
  map_api_endpoints: { icon: FileText,    label: 'Map API endpoints' },
  // Artifact tools
  create_artifact:   { icon: FilePlus,    label: 'Create artifact' },
  create_markdown:   { icon: FileText,    label: 'Create document' },
  create_diagram:    { icon: Zap,         label: 'Create diagram' },
  create_csv:        { icon: List,        label: 'Create CSV' },
  create_html_page:  { icon: Globe,       label: 'Create HTML page' },
  list_artifacts:    { icon: FolderOpen,  label: 'List artifacts' },
  inspect_design_system: { icon: Palette, label: 'Inspect design system' },
  create_design_canvas:  { icon: Palette, label: 'Create design canvas' },
  create_code_animation:  { icon: Zap,     label: 'Create code animation' },
  create_design_handoff: { icon: FileDown, label: 'Create design handoff' },
  // Audio tools
  speak_text:        { icon: Volume2,     label: 'Generated speech' },
  transcribe_audio:  { icon: Mic,         label: 'Transcribed audio' },
};

// Connector tools are named mcp__<connector>__<tool>: show "Connector · tool".
function connectorToolMeta(toolName) {
  const label = connectorToolLabel(toolName);
  return label ? { icon: Plug, label } : null;
}

function getToolMeta(toolName) {
  // Old chats name merged tools by their old names (see utils/toolNames.js).
  return TOOL_META[toolName] || TOOL_META[currentToolName(toolName)] || connectorToolMeta(toolName) || { icon: Zap, label: toolName };
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

function getToolIntent(data) {
  const args = data?.args || {};
  const { label } = getToolMeta(data?.tool);
  const tool = currentToolName(data?.tool);

  if (data?.tool === 'todo_write' && Array.isArray(args.todos)) {
    const complete = args.todos.filter(item => item?.status === 'completed').length;
    const active = args.todos.find(item => item?.status === 'in_progress');
    return {
      label,
      value: active?.activeForm || active?.content || `${complete}/${args.todos.length} tasks complete`,
      kind: 'plan',
    };
  }
  if (typeof args.app === 'string' && args.app.trim()) {
    return { label, value: args.app.trim(), kind: 'path' };
  }
  if (typeof args.command === 'string' && args.command.trim()) {
    return { label: 'Run this command', value: args.command.trim(), kind: 'command' };
  }
  if (typeof args.code === 'string' && args.code.trim()) {
    return { label: data?.tool === 'run_python' ? 'Run this Python' : 'Run this code', value: args.code.trim(), kind: 'code' };
  }
  if (typeof args.path === 'string' && args.path.trim()) {
    const verb = tool === 'write_file' ? 'Write this file'
      : tool === 'edit_file' ? 'Edit this file'
        : tool === 'file_delete' || tool === 'delete_file' ? 'Delete this file'
          : label;
    return { label: verb, value: args.path.trim(), kind: 'path' };
  }
  if (tool === 'apply_patch') {
    const files = Array.isArray(args.edits) ? [...new Set(args.edits.map(edit => edit?.path).filter(Boolean))] : [];
    return { label: 'Edit these files', value: files.length ? files.join(', ') : 'A patch', kind: 'description' };
  }
  if (typeof args.url === 'string' && args.url.trim()) {
    return { label, value: args.url.trim(), kind: 'url' };
  }
  if (tool === 'preview_fill' && Array.isArray(args.fields)) {
    return { label, value: `${args.fields.length} ${args.fields.length === 1 ? 'field' : 'fields'}`, kind: 'description' };
  }
  if (tool === 'preview_press_key' && typeof args.key === 'string') {
    return { label, value: args.key, kind: 'description' };
  }
  if (tool.startsWith('preview_') && (args.ref || args.selector)) {
    return { label, value: args.selector || `Element ${args.ref}`, kind: 'description' };
  }
  if (typeof args.query === 'string' && args.query.trim()) {
    return { label: 'Search for this', value: args.query.trim(), kind: 'query' };
  }
  // "Execute tool … with args: {}" is the backend's fallback; the label says it better.
  const description = typeof data?.description === 'string' ? data.description.trim() : '';
  if (description && !description.startsWith('Execute tool "')) {
    return { label, value: description, kind: 'description' };
  }
  if (!Object.keys(args).length) return { label, value: '', kind: 'tool' };

  return { label, value: truncateArgs(args) || `Use ${data?.tool || 'tool'}`, kind: 'tool' };
}

function getToolStatus(result, data) {
  if (data?.resolved) {
    const decision = data?.decision;
    if (decision === 'deny') return { label: 'Denied', tone: 'text-red-600 dark:text-red-400', icon: XCircle };
    if (decision === 'allow' || decision === 'allow_session' || decision === 'allow_always') {
      return { label: 'Approved', tone: 'text-fg-subtle', icon: CheckCircle2 };
    }
  }
  // Calm by default: only a failure gets a colour.
  if (result === undefined) return { label: 'Running', tone: 'text-fg-subtle', icon: Loader2 };
  if (result?.error || result?.success === false) return { label: 'Failed', tone: 'text-red-600 dark:text-red-400', icon: XCircle };
  return { label: 'Done', tone: 'text-fg-subtle', icon: CheckCircle2 };
}

// Messages share one reading column and one text style, streaming or not.
const MESSAGE_TEXT = 'text-[15px] leading-7 text-fg';

function FeedFrame({ children, className = '' }) {
  return (
    <div className={`max-w-3xl mx-auto ${className}`}>
      {children}
    </div>
  );
}

function MessageAction({ label, onClick, disabled = false, active = false, children }) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active || undefined}
        className={`flex h-7 w-7 items-center justify-center rounded-lg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-35 ${
          active ? 'bg-selected text-fg' : 'text-fg-subtle hover:text-fg'
        }`}
      >
        {children}
      </button>
    </Tooltip>
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

function formatTokenCount(value) {
  const count = Number(value) || 0;
  if (count < 1000) return count.toLocaleString();
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0).replace('.0', '')}k`;
  return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 1 : 0).replace('.0', '')}m`;
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

// ── Individual event components ───────────────────────────────────────────────

function UserGoalEvent({ data, onEditMessage, onToggleMessageFlag, isRunning, highlighted = false, animateIn = false }) {
  const goal = data?.goal || data?.content || '';
  // Only a message that was just sent animates; opening a chat stays still.
  const [rise] = useState(animateIn);
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
      className={`group mb-6 scroll-mt-24 ${rise ? 'animate-fadeIn' : ''}`}
    >
      <div className="max-w-3xl mx-auto flex flex-col items-end">
        {/* Opened from search: the bubble's row is shaded for a moment, like
            an answer (the bubble is already grey, so a tint on it alone
            hardly shows). */}
        <div className={`flex w-full justify-end rounded-[22px] transition-[background-color,box-shadow] duration-700 ${
          highlighted ? 'bg-selected ring-8 ring-selected' : ''
        }`}>
          <div className="max-w-[80%] rounded-[22px] bg-bubble px-4 py-2.5">
            {(data?.parentBranchId || data?.bookmarked) && (
              <div className="mb-1 flex justify-end gap-1.5 items-center">
                {data?.parentBranchId && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
                    <GitBranch className="h-3 w-3" />
                    Branch
                  </span>
                )}
                {data?.bookmarked && <BookMarked className="h-3.5 w-3.5 text-fg-subtle" aria-label="Bookmarked" />}
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
                  className="min-h-[96px] w-full resize-y rounded-lg border border-line-strong bg-canvas px-3 py-2 text-[14px] leading-6 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setIsEditing(false);
                      setDraft(goal);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" size="xs" icon={GitBranch} onClick={submitEdit}>
                    Branch
                  </Button>
                </div>
              </div>
            ) : (
              <div className={`${MESSAGE_TEXT} whitespace-pre-wrap [overflow-wrap:anywhere]`}>
                {renderGoalWithMentions(goal, data?.fileAttachments)}
              </div>
            )}
            {Array.isArray(data?.agentMentions) && data.agentMentions.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-end gap-1">
                {data.agentMentions.map(agent => (
                  <span key={agent.id || agent.handle} className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
                    {agent.icon ? <span>{agent.icon}</span> : null}
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
        </div>
        <div className="mt-1 flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {canEdit && (
            <MessageAction label="Edit and branch from here" onClick={() => setIsEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </MessageAction>
          )}
          <MessageAction
            label={data?.bookmarked ? 'Remove bookmark' : 'Bookmark'}
            active={Boolean(data?.bookmarked)}
            onClick={() => onToggleMessageFlag?.(data?.messageId, 'bookmarked')}
          >
            <BookMarked className="h-3.5 w-3.5" />
          </MessageAction>
          <MessageAction label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </MessageAction>
        </div>
      </div>
    </div>
  );
}

// Minimal inline reasoning disclosure for agent thought events.
function ThinkingEvent({ data }) {
  const [expanded, setExpanded] = useState(false);
  const thought = normalizeReasoningForDisplay(data?.thought || '');
  const words = thought.trim().split(/\s+/).filter(Boolean).length;

  return (
    <FeedFrame className="mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 rounded-md py-1 text-left text-fg-muted transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-fg-subtle flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-fg-subtle flex-shrink-0" />}
        <span className="text-[12px] select-none">
          Reasoning{expanded && words > 0 ? ` · ${words} words` : ''}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 pl-3 border-l-2 border-line">
          <pre className="text-[11px] text-fg-subtle whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto py-1 pr-1">
            {thought}
          </pre>
        </div>
      )}
    </FeedFrame>
  );
}

const FILE_WRITE_TOOLS = new Set(['write_file', 'edit_file', 'create_file']);

function ToolEvent({ data, result, onRetryTool, framed = true, progress = '' }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label } = getToolMeta(data?.tool);
  const status = getToolStatus(result, data);
  const StatusIcon = status.icon;
  const isPending = status.label === 'Running';
  const isError = status.label === 'Failed';
  const intent = getToolIntent(data);

  const canReveal = window.electronAPI?.shellShowInFolder
    && !isPending && !isError
    && intent.kind === 'path' && intent.value
    && FILE_WRITE_TOOLS.has(currentToolName(data?.tool));

  const content = (
    <div className="group rounded-md px-2 py-2 transition-colors hover:bg-hover">
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${status.tone}`}>
          <StatusIcon className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        </div>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => isError && setExpanded(v => !v)}
            className={`flex w-full items-center gap-2 text-left ${isError ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <Icon className="h-3 w-3 flex-shrink-0 text-fg-subtle" />
            <span className="text-[13px] font-medium text-fg-muted">{label}</span>
            {status.label !== 'Done' && (
              <span className={`ml-auto flex-shrink-0 text-[11px] font-medium ${status.tone}`}>{status.label}</span>
            )}
            {isError && (
              expanded
                ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-fg-subtle" />
                : <ChevronRight className="h-3 w-3 flex-shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>

          {intent.value && <div className="mt-0.5 flex items-center gap-2 pl-5">
            <p className="min-w-0 truncate text-[11px] text-fg-subtle">
              {intent.value}
            </p>
            {canReveal && (
              <button
                type="button"
                onClick={() => window.electronAPI.shellShowInFolder(intent.value)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg"
                title="Show in folder"
              >
                <FolderOpen className="h-3 w-3" />
                Show
              </button>
            )}
          </div>}

          {/* Streaming progress output (shown while running) */}
          {isPending && progress && (
            <div className="ml-5 mt-1">
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-hover p-2 font-mono text-[11px] leading-relaxed text-fg-muted scrollbar-thin">
                {progress.slice(-2000)}
                <span className="animate-pulse">▊</span>
              </pre>
            </div>
          )}

          {expanded && isError && (
            <div className="ml-5 mt-1 border-l border-line pl-2">
              {result && (
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-hover p-2 font-mono text-[11px] leading-relaxed text-fg-muted">
                  {typeof result === 'string' ? result : (result.output || result.content || result.error || JSON.stringify(result, null, 2))}
                </pre>
              )}
              {onRetryTool && (
                <Button
                  variant="secondary"
                  size="xs"
                  icon={RotateCcw}
                  className="mt-1.5"
                  onClick={() => onRetryTool({ tool: data?.tool, args: data?.args, result, repairPrompt: result?.repairPrompt })}
                >
                  Retry from here
                </Button>
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
const ARTIFACT_TOOLS = new Set(['create_artifact', 'create_markdown', 'create_diagram', 'create_csv', 'create_html_page', 'create_design_canvas', 'create_code_animation', 'create_design_handoff', 'map_api_endpoints', 'create_note', 'update_note', 'append_to_note']);
const AUTO_EXPAND_ARTIFACT_TYPES = new Set(['svg', 'html', 'design', 'animation', 'mermaid', 'note']);

function ArtifactResultCard({ result, prominent = false, onViewInPanel }) {
  if (!result?.artifact) return null;
  const artifact = result.artifact;
  const shouldAutoExpand = AUTO_EXPAND_ARTIFACT_TYPES.has(artifact.type || artifact.originalType);

  if (prominent) {
    return (
      <FeedFrame className="mb-4">
        <div className="mb-1.5 flex items-center gap-2 px-0.5">
          <FilePlus className="h-3.5 w-3.5 text-fg-subtle flex-shrink-0" />
          <span className="text-[12px] font-medium text-fg-muted flex-shrink-0">Artifact created</span>
          <span className="min-w-0 truncate text-[12px] text-fg-subtle flex-1">
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
            ? 'bg-selected text-fg'
            : 'bg-hover text-fg-muted hover:bg-selected hover:text-fg'
        }`}
        title={isPlaying ? 'Pause' : isLoading ? 'Loading…' : 'Play'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
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
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-hover hover:text-fg"
        title="Skip back 5s"
        aria-label="Skip back 5s"
      >
        <SkipBack className="h-3 w-3" />
      </button>

      {/* Skip forward */}
      <button
        onClick={() => skip(5)}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-hover hover:text-fg"
        title="Skip forward 5s"
        aria-label="Skip forward 5s"
      >
        <SkipForward className="h-3 w-3" />
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-hover hover:text-fg"
        title="Stop"
        aria-label="Stop"
      >
        <Square className="h-3 w-3 fill-current" />
      </button>

      {/* Progress + time */}
      <div className="min-w-0 flex-1 mx-1">
        <div
          onClick={handleSeek}
          className="group relative h-1.5 w-full cursor-pointer rounded-full bg-hover"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 rounded-full bg-accent opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-fg-subtle tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Download */}
      {(downloadUrl || src) && (
        <a
          href={downloadUrl || src}
          download={downloadName || 'audio.wav'}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-hover hover:text-fg"
          title="Download"
          aria-label="Download"
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
  const audioPath = result?.success ? result.path : null;
  const [blobUrl, setBlobUrl] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (!audioPath) return undefined;
    let cancelled = false;
    let createdUrl = null;
    filesApi.fetchRawBlob('workspace', audioPath)
      .then(url => {
        createdUrl = url;
        if (cancelled) URL.revokeObjectURL(url);
        else setBlobUrl(url);
      })
      .catch(err => { if (!cancelled) setFetchError(err.message); });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [audioPath]);

  if (!audioPath) return null;

  return (
    <div className="mt-1.5 mb-2 ml-7">
      <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
        {fetchError ? (
          <p className="text-[12px] text-red-600 dark:text-red-400">Couldn&apos;t load the audio: {fetchError}</p>
        ) : (
          <InlineAudioPlayer
            src={blobUrl}
            downloadName={result.path?.split('/').pop() || 'speech.wav'}
          />
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          <p className="truncate text-[12px] font-medium text-fg-muted">
            {result.path?.split('/').pop() || 'Generated speech'}
          </p>
          <span className="text-[11px] text-fg-subtle">
            · {result.audio_size || `${(result.audio_bytes / 1024).toFixed(1)} KB`} · {result.voice || 'Piper'} · {result.format || 'WAV'}
          </span>
        </div>
      </div>
    </div>
  );
}

// A picture's own address: its gallery link from den, or inline data.
function directImageSrc(result) {
  const url = result?.media?.url;
  if (url) return url.startsWith('/') ? `${import.meta.env.VITE_MAIN_URL || ''}${url}` : url;
  return result?.image && String(result.image).startsWith('data:image/') ? result.image : null;
}

function ImageResultCard({ result }) {
  const media = result?.media || {};
  const [blobUrl, setBlobUrl] = useState(directImageSrc(result));
  const [fetchError, setFetchError] = useState(null);
  const imagePath = media.path || result?.imagePath;
  const canFetch = !media.url && media.rootId && media.path;

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
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-fg">
              {media.prompt || result.prompt || 'Generated image'}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-fg-subtle">
              <span>{result.runtime || media.runtime || 'image'}</span>
              {(result.width || media.width) && (result.height || media.height) && <span>{result.width || media.width}x{result.height || media.height}</span>}
              {(result.seed || media.seed) !== undefined && <span>seed {result.seed || media.seed}</span>}
            </div>
          </div>
          {blobUrl && (
            <a
              href={blobUrl}
              download={(imagePath || 'generated-image.png').split('/').pop()}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
              title="Download image"
              aria-label="Download image"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
        {fetchError ? (
          <div className="px-3 py-3 text-[12px] text-red-600 dark:text-red-400">Couldn&apos;t load the image: {fetchError}</div>
        ) : blobUrl ? (
          <button
            type="button"
            onClick={() => window.open(blobUrl, '_blank', 'noopener,noreferrer')}
            className="block w-full bg-hover p-2"
            title="Open image"
          >
            <img src={blobUrl} alt={media.prompt || 'Generated image'} className="max-h-96 w-full rounded-lg object-contain" />
          </button>
        ) : (
          <div className="flex h-40 items-center justify-center text-[12px] text-fg-subtle">
            <Spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
            Loading image…
          </div>
        )}
        {imagePath && (
          <div className="border-t border-line px-3 py-2 font-mono text-[11px] text-fg-subtle">
            <span className="block truncate">{imagePath}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenshotResultCard({ result }) {
  const [open, setOpen] = useState(false);
  const src = result?.image || result?.dataUrl;
  const url = result?.url;
  if (!result?.success || !src) return null;
  const extension = /^data:image\/jpeg/.test(src) ? 'jpg' : 'png';

  return (
    <div className="mt-1.5 mb-3 ml-7 max-w-xl">
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-fg">Screenshot</div>
            {url && <div className="mt-0.5 truncate text-[11px] text-fg-subtle">{url}</div>}
          </div>
          <a
            href={src}
            download={`screenshot.${extension}`}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            title="Download screenshot"
            aria-label="Download screenshot"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full bg-canvas p-2"
          title="Open screenshot"
        >
          <img src={src} alt="Page screenshot" className="max-h-96 w-full rounded-md object-contain" />
        </button>
      </div>
      {open && <ImageLightbox url={src} name="Screenshot" onClose={() => setOpen(false)} />}
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

  // Older runs saved a failed reply as decision 'error'; it was never
  // delivered, so the agent denied it when the request expired.
  const notSent = decision === 'error';
  const negative = isDenied || expired || notSent;
  const decisionLabel = isAllowed
    ? 'Approved'
    : isDenied
      ? 'Denied'
      : notSent
        ? 'Not sent'
        : expired
          ? 'Expired, denied'
          : 'Resolved';
  const decisionTone = isAllowed
    ? 'text-fg-subtle'
    : negative
      ? 'text-red-600 dark:text-red-400'
      : 'text-fg-muted';
  if (showDecision || historical) {
    return (
      <div className="group rounded-md px-2 py-1.5 transition-colors hover:bg-hover">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center ${negative ? 'text-red-600 dark:text-red-400' : 'text-fg-subtle'}`}>
            {negative ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Icon className="h-3 w-3 text-fg-subtle" />
              <span className="text-[13px] font-medium text-fg-muted">{label}</span>
              <span className={`ml-auto text-[11px] font-medium ${decisionTone}`}>{decisionLabel}</span>
            </div>
            <p className="mt-0.5 truncate pl-5 text-[11px] text-fg-subtle">{intent.value}</p>
            {(data?.diff || data?.workingDir) && (
              <button
                type="button"
                onClick={() => setShowDetails(v => !v)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle transition-colors hover:text-fg"
              >
                {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {data?.diff ? 'View changes' : 'Details'}
              </button>
            )}
            {showDetails && (
              <div className="mt-2 space-y-1.5">
                {data?.workingDir && <p className="truncate text-[11px] text-fg-subtle">Working directory: {data.workingDir}</p>}
                {data?.diff && (
                  <pre className="max-h-40 overflow-y-auto whitespace-pre rounded-lg border border-line bg-hover p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
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
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <ShieldAlert className={`mt-0.5 h-4 w-4 flex-shrink-0 ${dangerous ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-fg">Permission needed</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
              <Icon className="h-3 w-3" />
              {label}
            </span>
            {!resolved && remainingMs !== null && (
              <span className={`ml-auto text-[11px] tabular-nums ${expired ? 'text-red-600 dark:text-red-400' : 'text-fg-subtle'}`}>
                {expired ? 'Expired' : `Auto-deny in ${formatCountdown(remainingMs)}`}
              </span>
            )}
          </div>
          <p className="mt-1 text-[14px] text-fg">
            The agent wants to <span className="font-medium">{intent.label.toLowerCase()}</span>.
          </p>
          <div className="mt-2 rounded-lg border border-line bg-hover px-3 py-2">
            <code className="block max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-fg">
              {intent.value}
            </code>
          </div>
          {data?.sandboxNote && (
            <p className="mt-1.5 text-[12px] leading-5 text-amber-700 dark:text-amber-400" data-sandbox-note>{data.sandboxNote}</p>
          )}
          {data?.error && (
            <p role="alert" className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">
              Couldn&apos;t send your choice ({data.error}). Try again.
            </p>
          )}
          {(data?.diff || data?.workingDir) && (
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-fg-muted hover:text-fg transition-colors"
            >
              {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {data?.diff ? 'View changes' : 'Technical details'}
            </button>
          )}
          {showDetails && (
            <div className="mt-2 space-y-1.5">
              {data?.workingDir && <p className="truncate text-[11px] text-fg-subtle">Working directory: {data.workingDir}</p>}
              {data?.diff && (
                <pre className="max-h-40 overflow-y-auto whitespace-pre rounded-lg border border-line bg-hover p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
                  {data.diff}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-2.5">
        <Button variant="secondary" onClick={() => onDecision?.(data?.requestId, 'deny')} disabled={data?.resolving || expired}>
          Deny
        </Button>
        <Button
          variant={dangerous ? 'destructive' : 'primary'}
          onClick={() => onDecision?.(data?.requestId, 'allow')}
          disabled={expired}
          loading={Boolean(data?.resolving)}
        >
          Approve once
        </Button>
        {!data?.unsandboxed && (
          <Button variant="secondary" onClick={() => onDecision?.(data?.requestId, 'allow_session')} disabled={data?.resolving || expired}>
            Trust this run
          </Button>
        )}
        {!data?.unsandboxed && (
          <Button
            variant="danger"
            icon={ShieldOff}
            onClick={() => onDecision?.(data?.requestId, 'allow_always')}
            disabled={data?.resolving || expired}
            title={`Always allow ${data?.tool} without asking`}
          >
            Always allow
          </Button>
        )}
      </div>
    </div>
  );
}

function ToolsSection({ events, onPermissionDecision, onRetryTool }) {
  const visibleEvents = events.filter(ev => {
    if (ev.type !== 'permission_request') return true;
    const decision = ev.data?.decision;
    const allowed = ev.data?.resolved && ['allow', 'allow_session', 'allow_always', 'session_approved', 'auto_approved', 'local_auto'].includes(decision);
    if (!allowed) return true;
    return !events.some(other => other.type === 'tool_start' && other.data?.tool === ev.data?.tool);
  });

  return (
    <FeedFrame className="mb-1">
      <div className="ml-1 space-y-0.5 border-l border-line pl-2">
        {visibleEvents.map((ev, i) => {
              if (ev.type === 'permission_request') {
                return <CompactPermissionEvent key={i} data={ev.data} onDecision={onPermissionDecision} />;
              }
              if (ev.type === 'tool_start') {
                const hasAudioResult = ev.data?.tool === 'speak_text' && ev.result?.success && ev.result?.path;
                const hasImageResult = (ev.data?.tool === 'generate_image' || ev.data?.tool === 'edit_image') && ev.result?.success && (ev.result?.media || ev.result?.image);
                const hasScreenshotResult = ['preview_screenshot', 'take_screenshot'].includes(currentToolName(ev.data?.tool)) && ev.result?.success && (ev.result?.image || ev.result?.dataUrl);
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
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="px-4 py-3.5 flex items-start gap-3">
          <MessageCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-fg-subtle" />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-medium text-fg">Agent question</span>
            <p className="text-[14px] text-fg mt-1 leading-relaxed">{data?.question}</p>

            {answered ? (
              <p className="mt-2 text-[13px] text-fg-muted">You replied: &quot;{chosenAnswer}&quot;</p>
            ) : (
              <>
                {data?.choices?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.choices.map((choice, i) => (
                      <button
                        key={i}
                        onClick={() => submit(choice)}
                        className="px-2.5 py-1 text-[13px] rounded-lg border border-line text-fg hover:border-line-strong hover:bg-hover transition-colors"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )}
                {data?.fields?.length > 0 ? (
                  <AskUserForm fields={data.fields} onSubmit={(text) => submit(text)} />
                ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                    placeholder={data?.default ? `Default: ${data.default}` : 'Type your answer…'}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
                    autoFocus
                  />
                  <Button
                    variant="primary"
                    size="icon"
                    icon={Send}
                    aria-label="Send"
                    onClick={() => submit()}
                    disabled={!inputValue.trim() && !data?.default}
                  />
                </div>
                )}
                {data?.default && (
                  <button
                    onClick={() => submit(data.default)}
                    className="mt-1.5 text-[12px] text-fg-muted hover:text-fg transition-colors"
                  >
                    Use default: &quot;{data.default}&quot;
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

// A source the answer used. No favicon: fetching one would tell a third party
// about every link, as in the answer's own links.
function SourceChip({ source }) {
  const [open, setOpen] = useState(false);
  const { workbenchPreferences } = useUiPreferences();
  const domain = (() => {
    try { return new URL(source.url).hostname.replace('www.', ''); } catch { return source.url; }
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
        title={source.title || source.url}
      >
        <Globe className="h-3.5 w-3.5 flex-shrink-0 text-fg-subtle" />
        <span className="truncate">{source.title || domain}</span>
      </button>
      <Dialog
        open={open}
        size="sm"
        title={source.title || domain}
        onClose={() => setOpen(false)}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button
              variant="primary"
              icon={ExternalLink}
              onClick={() => {
                openWebLink(source.url, workbenchPreferences.browserOpenLinks);
                setOpen(false);
              }}
            >
              {workbenchPreferences.browserOpenLinks === 'system' ? 'Open in browser' : 'Open in Asyncat'}
            </Button>
          </>
        )}
      >
        <p className="select-all break-all font-mono text-[12px] leading-5 text-fg-muted">{source.url}</p>
        {source.snippet && <p className="mt-2 text-[13px] leading-5 text-fg-muted">{source.snippet}</p>}
      </Dialog>
    </>
  );
}

function SourcesPanel({ searchEvent }) {
  const { workbenchPreferences } = useUiPreferences();
  if (!searchEvent) return null;
  const { sources = [], images = [] } = searchEvent;
  if (sources.length === 0 && images.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-3">
      {images.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
            <Image className="w-3 h-3" />
            <span>Images for this answer ({images.length})</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {images.map((img, i) => (
              <button
                type="button"
                key={img.image || img.thumbnail || img.url || i}
                onClick={() => {
                  const url = img.url || img.image;
                  openWebLink(url, workbenchPreferences.browserOpenLinks);
                }}
                className="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-hover transition-colors hover:border-line-strong"
                title={img.title}
              >
                <img
                  src={img.thumbnail || img.image}
                  alt={img.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23999"%3E%3Crect width="40" height="40" fill="%23eee"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="10"%3EIMG%3C/text%3E%3C/svg%3E'; }}
                />
                <ExternalLink className="absolute right-1.5 top-1.5 h-3.5 w-3.5 rounded bg-surface p-0.5 text-fg opacity-0 shadow-sm transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      )}
      {sources.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
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
  usage = null,
  elapsedMs = null,
  isStoppedRun = false,
  isLatest = false,
}) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const raw = data?.answer || '';
  const { thinking: thinkFallback, answer } = extractReasoningFromText(raw);
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  const activeVariantIndex = Number.isInteger(data?.activeVariantIndex) ? data.activeVariantIndex : Math.max(variants.length - 1, 0);
  // A rating belongs to the version of the answer that was rated.
  const shownRating = data?.rating && (data?.ratedVariant ?? 0) === (variants.length ? activeVariantIndex : 0) ? data.rating : null;
  const totalTokens = usage?.cumulativeTotalTokens
    || usage?.totalTokens
    || usage?.lastTotalTokens
    || 0;
  const inputTokens = usage?.cumulativeInputTokens
    || usage?.inputTokens
    || usage?.lastInputTokens
    || 0;
  const outputTokens = usage?.cumulativeOutputTokens
    || usage?.outputTokens
    || usage?.lastOutputTokens
    || 0;
  const tokensPerSecond = Number(usage?.tokensPerSecond) || 0;
  const hasPerformanceStats = totalTokens > 0 || tokensPerSecond > 0 || elapsedMs > 0;
  const usageTitle = [
    inputTokens > 0 ? `${inputTokens.toLocaleString()} input tokens` : null,
    outputTokens > 0 ? `${outputTokens.toLocaleString()} output tokens` : null,
    usage?.estimated ? 'Estimated usage' : usage ? 'Provider-reported usage' : null,
  ].filter(Boolean).join(' · ');

  const displayAnswer = answer;

  if (!displayAnswer && !thinkFallback) return null;

  let blocks = [];
  try {
    blocks = parseAIResponseToBlocks(displayAnswer);
  } catch { blocks = []; }

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(displayAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const answerBody = (
    <div className={MESSAGE_TEXT}>
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
        className="group mb-6 scroll-mt-24"
      >
        <div className="max-w-3xl mx-auto">
          {/* Opened from search: the answer is shaded for a moment. */}
          <div className={`rounded-xl transition-[background-color,box-shadow] duration-700 ${
            highlighted ? 'bg-selected ring-8 ring-selected' : ''
          }`}>
            {!isStoppedRun && data?.bookmarked && (
              <BookMarked className="mb-2 h-3.5 w-3.5 text-fg-subtle" aria-label="Bookmarked" />
            )}

            {/* Answer body — collapsed behind a disclosure when the run was stopped */}
            {isStoppedRun ? (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setNotesExpanded(v => !v)}
                  className="flex items-center gap-1.5 text-[12px] text-fg-subtle hover:text-fg transition-colors"
                >
                  {notesExpanded
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />}
                  Agent notes
                  {data?.bookmarked && <BookMarked className="ml-0.5 h-3 w-3" aria-label="Bookmarked" />}
                </button>
                {notesExpanded && (
                  <div className="mt-2 pl-4 border-l-2 border-line">
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
                    <span className="ml-1 text-[11px] text-fg-subtle">Read aloud</span>
                  }
                />
              </div>
            )}

            <SourcesPanel searchEvent={data?.searchEvent} />
            {!isStoppedRun && data?.round > 1 && (
              <p className="text-[11px] text-fg-subtle mt-2">{data.round} rounds</p>
            )}
          </div>
          <div className={`mt-2 flex flex-wrap items-center gap-0.5 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${isLatest && !isRunning ? 'animate-[fadeIn_240ms_ease-out] opacity-100' : 'opacity-0'}`}>
            <MessageAction label={copied ? 'Copied' : 'Copy'} onClick={copyAnswer}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </MessageAction>
            <MessageAction label="Regenerate" onClick={() => onRegenerateAnswer?.(data?.messageId)} disabled={isRunning}>
              <RotateCcw className="h-3.5 w-3.5" />
            </MessageAction>
            <MessageAction
              label={data?.bookmarked ? 'Remove bookmark' : 'Bookmark'}
              active={Boolean(data?.bookmarked)}
              onClick={() => onToggleMessageFlag?.(data?.messageId, 'bookmarked')}
            >
              <BookMarked className="h-3.5 w-3.5" />
            </MessageAction>
            <MessageAction
              label={shownRating === 1 ? 'Remove rating' : 'Good answer'}
              active={shownRating === 1}
              onClick={() => onToggleMessageFlag?.(data?.messageId, 'rating', 1)}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </MessageAction>
            <MessageAction
              label={shownRating === -1 ? 'Remove rating' : 'Not a good answer'}
              active={shownRating === -1}
              onClick={() => onToggleMessageFlag?.(data?.messageId, 'rating', -1)}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </MessageAction>
            {variants.length > 1 && (
              <div className="ml-1 inline-flex items-center gap-0.5 text-[12px] text-fg-subtle">
                <button
                  type="button"
                  onClick={() => onSelectAnswerVariant?.(data?.messageId, Math.max(0, activeVariantIndex - 1))}
                  disabled={activeVariantIndex <= 0 || isRunning}
                  className="flex h-7 w-6 items-center justify-center rounded-md hover:bg-hover hover:text-fg disabled:opacity-30"
                  aria-label="Previous version"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-8 text-center tabular-nums">{activeVariantIndex + 1} / {variants.length}</span>
                <button
                  type="button"
                  onClick={() => onSelectAnswerVariant?.(data?.messageId, Math.min(variants.length - 1, activeVariantIndex + 1))}
                  disabled={activeVariantIndex >= variants.length - 1 || isRunning}
                  className="flex h-7 w-6 items-center justify-center rounded-md hover:bg-hover hover:text-fg disabled:opacity-30"
                  aria-label="Next version"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {hasPerformanceStats && (
              <span
                className="ml-auto inline-flex items-center gap-1.5 text-[11px] tabular-nums text-fg-subtle"
                title={usageTitle || 'Response performance'}
                aria-label={usageTitle || 'Response performance'}
              >
                {totalTokens > 0 && (
                  <span>{usage?.estimated ? '~' : ''}{formatTokenCount(totalTokens)} tokens</span>
                )}
                {totalTokens > 0 && tokensPerSecond > 0 && <span className="opacity-40">·</span>}
                {tokensPerSecond > 0 && <span>{tokensPerSecond} tok/s</span>}
                {(totalTokens > 0 || tokensPerSecond > 0) && elapsedMs > 0 && <span className="opacity-40">·</span>}
                {elapsedMs > 0 && <span>{formatElapsed(elapsedMs)}</span>}
              </span>
            )}
          </div>
        </div>
      </div>}
    </>
  );
}

// A model that can't be used (removed, no key, won't load) offers another:
// the chat page opens the composer's model menu, or Models.
function sendModelAction(event, action) {
  event.currentTarget.dispatchEvent(new CustomEvent(MODEL_ACTION_EVENT, { bubbles: true, detail: { action } }));
}

function ErrorEvent({ data, onRetryGoal, onRunWithAction }) {
  return (
    <FeedFrame className="mb-3">
      <div className="rounded-xl border border-line bg-surface px-4 py-3 flex items-start gap-3">
        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-5 text-fg">{data?.message || 'Something went wrong in this run.'}</p>
          {data?.code === 'model_unavailable' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button variant="secondary" size="xs" icon={ArrowLeftRight} onClick={(event) => sendModelAction(event, 'pick')}>
                Pick another model
              </Button>
              <Button variant="ghost" size="xs" icon={SlidersHorizontal} onClick={(event) => sendModelAction(event, 'models')}>
                Open Models
              </Button>
            </div>
          )}
          {data?.goal && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button variant="secondary" size="xs" icon={RotateCcw} onClick={() => onRetryGoal?.(data.goal)}>
                Retry
              </Button>
              <Button variant="ghost" size="xs" icon={Zap} onClick={() => onRunWithAction?.(data.goal)}>
                Action mode
              </Button>
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
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
        <span>{data?.message || 'The agent stopped.'}</span>
        {(data?.canRetryWithAction || data?.canRetryWithTools) && data?.goal && (
          <Button variant="secondary" size="xs" icon={Zap} onClick={() => onRunWithAction?.(data.goal)}>
            Run in Action
          </Button>
        )}
      </div>
    </FeedFrame>
  );
}

const STOP_REASON_CONFIG = {
  max_rounds: {
    icon: TimerOff,
    tone: 'warning',
    label: 'Step limit reached',
    detail: (d) => `Used ${d.rounds ?? '?'} of ${d.maxRounds ?? '?'} steps. Reply to carry on from here.`,
  },
  tool_failure: {
    icon: XCircle,
    tone: 'error',
    label: 'Stopped after repeated tool errors',
    detail: () => 'Too many tool calls failed in a row. Check the steps above and try again.',
  },
  loop_detected: {
    icon: RefreshCw,
    tone: 'warning',
    label: 'Stopped: the agent was repeating itself',
    detail: () => 'It kept making the same calls. Rephrase or add detail to carry on.',
  },
  reflection_abort: {
    icon: AlertTriangle,
    tone: 'warning',
    label: 'Stopped: the agent was stuck',
    detail: () => 'It decided it couldn\'t make progress. Add detail or try another way.',
  },
  cancelled: {
    icon: XCircle,
    tone: 'neutral',
    label: 'Stopped',
    detail: () => 'You stopped this run.',
  },
};

const STOP_ICON_TONE = {
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
  neutral: 'text-fg-subtle',
};

function StopReasonBanner({ data, toolResults = [] }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STOP_REASON_CONFIG[data?.stopReason] || null;
  if (!cfg) return null;
  const Icon = cfg.icon;

  const succeeded = toolResults.filter(ev => ev.result?.success !== false).length;
  const failed = toolResults.filter(ev => ev.result?.success === false).length;
  const hasStats = toolResults.length > 0;

  return (
    <FeedFrame className="mb-4">
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-start gap-3 px-4 py-3">
          <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${STOP_ICON_TONE[cfg.tone]}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-fg">{cfg.label}</p>
            <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">{cfg.detail(data)}</p>
          </div>
          {hasStats && (
            <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">
              {succeeded} done{failed > 0 ? <span className="text-red-600 dark:text-red-400"> · {failed} failed</span> : null}
            </span>
          )}
        </div>

        {hasStats && (
          <>
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-1.5 border-t border-line px-4 py-2 text-left text-[12px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              {expanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
              {expanded ? 'Hide' : 'Show'} {toolResults.length} step{toolResults.length !== 1 ? 's' : ''}
            </button>

            {expanded && (
              <div className="max-h-48 space-y-0.5 overflow-y-auto border-t border-line px-4 py-2">
                {toolResults.map((ev, i) => {
                  const ok = ev.result?.success !== false;
                  const name = ev.data?.tool || '?';
                  return (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      {ok
                        ? <CheckCircle2 className="w-3 h-3 shrink-0 text-fg-subtle" />
                        : <XCircle className="w-3 h-3 shrink-0 text-red-600 dark:text-red-400" />
                      }
                      <span className={`truncate font-mono text-[12px] ${ok ? 'text-fg-muted' : 'text-red-600 dark:text-red-400'}`}>
                        {name}
                      </span>
                      {!ok && ev.result?.error && (
                        <span className="ml-auto max-w-[40%] truncate text-[11px] text-fg-subtle">
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

// AgentDelegateEvent has been moved below renderWorkContent to avoid circular dependency

// Visual separator between consecutive goals in a single session
function RunDivider({ event, data }) {
  if (event?.type === 'compaction') {
    const dropped = data?.droppedMessages || 0;
    const before = data?.tokensBefore ? `${(data.tokensBefore / 1000).toFixed(1)}k` : null;
    const after = data?.tokensAfter ? `${(data.tokensAfter / 1000).toFixed(1)}k` : null;
    const detail = [
      dropped ? `${dropped} summarized` : null,
      before && after ? `${before} to ${after}` : null,
    ].filter(Boolean).join(' · ');

    return (
      <FeedFrame className="my-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <div
            className="inline-flex items-center gap-1.5 px-2 text-[12px] text-fg-subtle"
            title={detail || 'Older context was summarized for the model'}
          >
            <RotateCcw className="h-3 w-3" />
            <span>Older messages summarized</span>
          </div>
          <div className="h-px flex-1 bg-line" />
        </div>
      </FeedFrame>
    );
  }

  return (
    <FeedFrame className="my-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-px bg-line" />
        <span className="text-[12px] text-fg-subtle">New goal</span>
        <div className="flex-1 h-px bg-line" />
      </div>
      {data?.goal && (
        <p className="text-[13px] text-fg-muted text-center">{data.goal}</p>
      )}
    </FeedFrame>
  );
}

// A quiet one-line note in the feed: a grey icon and muted text. Memory,
// corrections, compaction and previews all look alike.
function FeedNotice({ icon: Icon, title, children }) {
  return (
    <FeedFrame className="mb-2">
      <div className="flex min-w-0 items-center gap-2 px-2 py-1 text-[12px] text-fg-muted" title={title}>
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-fg-subtle" />
        <span className="min-w-0 truncate">{children}</span>
      </div>
    </FeedFrame>
  );
}

function SkillsLoadedEvent({ data }) {
  const [expanded, setExpanded] = useState(false);
  const skills = data?.skills || [];
  if (skills.length === 0) return null;
  const methodLabel = data?.method === 'llm' ? 'picked by the model' : null;

  return (
    <FeedFrame className="mb-2">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 rounded-md py-1 text-left text-fg-muted transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-fg-subtle flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-fg-subtle flex-shrink-0" />}
        <span className="text-[12px] select-none">
          Skills loaded · {skills.map(s => s.name).join(', ')}
          {methodLabel ? ` · ${methodLabel}` : ''}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 border-l-2 border-line pl-3">
          {data?.reason && (
            <p className="text-[12px] text-fg-subtle">{data.reason}</p>
          )}
          {skills.map(s => (
            <div key={s.name} className="flex items-start gap-1.5 text-[12px]">
              <span className="font-medium text-fg">{s.name}</span>
              {s.description && (
                <span className="text-fg-muted">{s.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </FeedFrame>
  );
}

// Compaction notification — shown when context window was compressed
function CompactionEvent({ data }) {
  const dropped = data?.droppedMessages || 0;
  const before = data?.tokensBefore ? (data.tokensBefore / 1000).toFixed(1) : '?';
  const after = data?.tokensAfter ? (data.tokensAfter / 1000).toFixed(1) : '?';

  return (
    <FeedNotice icon={RotateCcw}>
      Summarized {dropped} older messages ({before}k → {after}k tokens)
    </FeedNotice>
  );
}

// Correction learned notification
function CorrectionLearnedEvent() {
  return <FeedNotice icon={Brain}>Noted your correction for next time</FeedNotice>;
}

// Memory saved/updated notification
function MemorySavedEvent({ data }) {
  const label = data?.action === 'updated' ? 'Memory updated' : 'Memory saved';
  const detail = [data?.key, data?.kind ? `(${data.kind})` : null].filter(Boolean).join(' ');
  return (
    <FeedNotice icon={BookMarked}>
      {label}{detail ? `: ${detail}` : ''}
    </FeedNotice>
  );
}

// Live streaming preview — shown while LLM is generating
function StreamingPreview({ text, reasoningText = '' }) {
  const { thinking, answer } = extractReasoningFromText(text);
  const liveThinking = reasoningText?.trim() || thinking || '';
  const clean = answer.trim();
  const blocks = useMemo(() => {
    if (!clean) return [];
    try {
      return parseAIResponseToBlocks(clean, { streaming: true });
    } catch {
      return [{ type: 'text', content: clean, properties: {} }];
    }
  }, [clean]);

  if (!text?.trim() && !liveThinking) return null;

  if (!clean) {
    return (
      <FeedFrame className="mb-2">
        <div className="flex min-w-0 items-center gap-2 py-1 text-[13px]">
          <span className="shimmer-text shrink-0 font-medium">Thinking</span>
          {liveThinking && (
            <span className="truncate text-[12px] text-fg-subtle">
              {liveThinking.length > 120 ? `…${liveThinking.slice(-120)}` : liveThinking}
            </span>
          )}
        </div>
      </FeedFrame>
    );
  }

  // Same spacing as the finished answer, including room for its action row,
  // so nothing shifts when the answer replaces this preview.
  return (
    <FeedFrame className="mb-6">
      <div className={MESSAGE_TEXT}>
        {blocks.length > 0
          ? blocks.map((block, i) => <BlockRenderer key={`${block.type}-${i}`} block={block} />)
          : <p className="whitespace-pre-wrap">{clean}</p>}
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-fg align-text-bottom" />
      </div>
      <div className="mt-2 h-7" aria-hidden="true" />
    </FeedFrame>
  );
}

export function CurrentPlanPanel({ data, isRunning, sessionId, className = '' }) {
  const plan = Array.isArray(data?.plan) ? data.plan : [];
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState('');
  const [saving, setSaving] = useState(false);
  // Click a blocked item to highlight the dependencies it is waiting on.
  const [highlightDeps, setHighlightDeps] = useState(null); // Set<id> | null

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

  // ── Dependency-aware readiness ──────────────────────────────────────────
  // Only engages when the plan actually declares dependencies, so ordinary
  // flat plans render exactly as before.
  const hasDeps = plan.some(i => Array.isArray(i.dependencies) && i.dependencies.length > 0);
  const byId = new Map(plan.map(i => [i.id, i]));
  const isDoneId = (id) => byId.get(id)?.status === 'completed';
  const blockedIds = new Set(
    hasDeps
      ? plan
          .filter(i => i.status !== 'completed' && (i.dependencies || []).some(d => byId.has(d) && !isDoneId(d)))
          .map(i => i.id)
      : []
  );
  const blockedCount = blockedIds.size;
  const readyCount = hasDeps ? plan.filter(i => i.status === 'pending' && !blockedIds.has(i.id)).length : 0;
  const waitingOn = (item) => (item.dependencies || [])
    .filter(d => byId.has(d) && !isDoneId(d))
    .map(d => byId.get(d)?.content)
    .filter(Boolean);

  if (editing) {
    return (
      <div className={className}>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[13px] font-medium text-fg">Edit plan</span>
            <span className="text-[12px] text-fg-subtle">One step per line</span>
          </div>
          <textarea
            aria-label="Plan steps, one per line"
            className="w-full resize-none rounded-lg border border-line-strong bg-canvas p-2 text-[13px] leading-6 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            rows={Math.max(3, editLines.split('\n').length + 1)}
            value={editLines}
            onChange={e => setEditLines(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
            <Button variant="primary" onClick={savePlan} loading={saving}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isDone && !isRunning) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
            <span className="font-medium text-fg">
              Plan done
            </span>
          </div>
          <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">
            {completed}/{total}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[13px] font-medium text-fg">
            Plan
          </span>
          <span className="text-[12px] tabular-nums text-fg-subtle">
            {completed}/{total}
          </span>
          {completed === total && total > 0 && (
            <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">Done</span>
          )}
          {isStaleActivePlan && (
            <span className="text-[12px] font-medium text-amber-600 dark:text-amber-400">Stopped</span>
          )}
          {hasDeps && blockedCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[12px] text-fg-subtle"
              title={`${readyCount} ready to start · ${blockedCount} waiting on dependencies`}
            >
              <GitBranch className="h-3 w-3" />
              {readyCount} ready · {blockedCount} blocked
            </span>
          )}
          {total > 0 && (
            <span className="ml-auto text-[12px] tabular-nums text-fg-subtle">
              {pct}%
            </span>
          )}
          {sessionId && (
            <button
              type="button"
              onClick={openEditor}
              title="Edit plan"
              aria-label="Edit plan"
              className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* Progress bar */}
        {total > 0 && (
          <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-hover">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${completed === total ? 'bg-emerald-500' : 'bg-fg'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <ul className="space-y-1.5">
          {plan.map((item, i) => {
            const blocked = blockedIds.has(item.id);
            const waits = blocked ? waitingOn(item) : [];
            const isReady = hasDeps && item.status === 'pending' && !blocked;
            const isHighlighted = highlightDeps?.has(item.id);
            // Clicking a blocked item highlights the items it's waiting on.
            const onItemClick = blocked
              ? () => setHighlightDeps(prev => {
                  const next = new Set((item.dependencies || []).filter(d => byId.has(d) && !isDoneId(d)));
                  if (prev && prev.size === next.size && [...next].every(d => prev.has(d))) return null;
                  return next;
                })
              : undefined;
            return (
            <li
              key={item.id || i}
              onClick={onItemClick}
              className={`flex items-start gap-2.5 rounded-md -mx-1 px-1 py-0.5 text-[13px] leading-snug transition-colors ${
                blocked ? 'cursor-pointer' : ''
              } ${
                isHighlighted ? 'bg-selected' : ''
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${
                item.status === 'completed'
                  ? 'text-fg-subtle'
                  : item.status === 'in_progress'
                    ? (isRunning ? 'text-fg' : 'text-amber-600 dark:text-amber-400')
                    : isReady
                      ? 'text-fg-muted'
                      : 'text-fg-subtle'
              }`}>
                {item.status === 'completed' ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : item.status === 'in_progress' && isRunning ? (
                  <span className="block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : item.status === 'in_progress' ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M9 12h6" /></svg>
                ) : blocked ? (
                  <Lock className="w-3 h-3 mt-px" />
                ) : isReady ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" stroke="none"><circle cx="12" cy="12" r="4" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /></svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block ${
                  item.status === 'completed'
                    ? 'text-fg-subtle'
                    : item.status === 'in_progress'
                      ? 'font-medium text-fg'
                      : blocked
                        ? 'text-fg-subtle'
                        : 'text-fg-muted'
                }`}>
                  {item.status === 'in_progress' && item.activeForm ? item.activeForm : item.content}
                </span>
                {waits.length > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-subtle" title={`Waiting on: ${waits.join(', ')} — click to highlight`}>
                    <GitBranch className="h-3 w-3 shrink-0" />
                    <span className="truncate">Waiting on: {waits.join(', ')}</span>
                  </span>
                )}
              </span>
            </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function RunningIndicator({ runStartedAt }) {
  const elapsed = useElapsedTime(runStartedAt);
  return (
    <FeedFrame>
      <div className="flex items-center gap-2 py-2 text-[13px] animate-[fadeIn_200ms_ease-out]" role="status">
        <span className="shimmer-text font-medium">Thinking</span>
        {elapsed > 0 && (
          <span className="tabular-nums text-[12px] text-fg-subtle">{formatElapsed(elapsed)}</span>
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
  const [src, setSrc] = useState(item.type === 'image' ? directImageSrc(item.result) : null);

  useEffect(() => {
    if (item.type === 'image' && media.url) return undefined;
    const path = item.type === 'audio' ? item.result?.path : media.path;
    const rootId = item.type === 'audio' ? 'workspace' : media.rootId;
    if (!path || !rootId) return undefined;
    let cancelled = false;
    filesApi.fetchRawBlob(rootId, path)
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.result?.path, item.type, media.path, media.rootId, media.url]);

  if (item.type === 'image') {
    return src ? <img src={src} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <Image className="h-5 w-5 text-fg-subtle" />;
  }
  if (item.type === 'audio') {
    return <Volume2 className="h-5 w-5 text-fg-subtle" />;
  }
  return <FilePlus className="h-5 w-5 text-fg-subtle" />;
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
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-hover"
      >
        <span className="flex min-w-0 items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" /> : <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />}
          <Image className="h-3.5 w-3.5 text-fg-subtle" />
          <span className="text-[13px] font-medium text-fg-muted">Generated media</span>
          <span className="rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fg-muted">{items.length}</span>
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
              <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface p-2">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-hover">
                  <MediaThumb item={item} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">{detail}</span>
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
  let memoriesSaved = 0;
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
      toolsSeen[tool] = (toolsSeen[tool] || 0) + 1;
      if (tool === 'save_memory' && ev.result?.success) memoriesSaved++;
    }
    if (ev.arrivedAt > completedAt) completedAt = ev.arrivedAt;
  }

  return { rounds, memoriesSaved, toolsSeen, completedAt };
}

function RunSummaryCard({ events, runStartedAt, sessionId, session, onViewArtifactInPanel }) {
  const [expanded, setExpanded] = useState(false);
  const [stateData, setStateData] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [revertMessage, setRevertMessage] = useState(null);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);

  const hasAnswer = (events || []).some(ev => ev.type === 'answer');
  const { rounds, memoriesSaved, toolsSeen, completedAt } = buildRunStats(events || []);
  const hasMemoryActivity = memoriesSaved > 0;

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

  // Must be declared before any early returns to satisfy Rules of Hooks
  const runArtifacts = useMemo(() =>
    (events || []).filter(ev =>
      ev.type === 'tool_start' && ARTIFACT_TOOLS.has(ev.data?.tool) && ev.result?.success && ev.result?.artifact
    ),
    [events]
  );
  const hasArtifacts = runArtifacts.length > 0;

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
  if (!hasFiles && !hasCommands && !hasArtifacts && !hasMemoryActivity) return null;

  const elapsedMs = runStartedAt && completedAt > runStartedAt ? completedAt - runStartedAt : 0;
  const topTools = Object.entries(toolsSeen).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count }));

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
  if (hasMemoryActivity) summaryParts.push(`${memoriesSaved} ${memoriesSaved === 1 ? 'memory' : 'memories'}`);
  if (elapsedMs > 0) summaryParts.push(formatElapsed(elapsedMs));
  const summaryLine = summaryParts.join(' · ');

  return (
    <FeedFrame className="mb-3 mt-1 animate-[fadeIn_240ms_ease-out]">
      {/* Header — same style as ThinkingEvent / AgentWorkDrawer */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-1.5 rounded-md py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-fg-subtle transition-colors" />
          : <ChevronRight className="h-3 w-3 flex-shrink-0 text-fg-subtle transition-colors" />}
        <span className="text-[12px] text-fg-muted group-hover:text-fg transition-colors truncate">
          Changes{summaryLine ? ` · ${summaryLine}` : ''}
        </span>
        <div className="h-px flex-1 bg-line ml-1" />
      </button>

      {/* Expanded detail — no card border, just indented sections */}
      {expanded && (
        <div className="mt-2 pl-4 space-y-0 border-l-2 border-line">
          {/* Dev server hint */}
          {previewUrl && (
            <div className="flex items-center gap-2 py-1.5">
              <Globe className="h-3.5 w-3.5 text-fg-subtle flex-shrink-0" />
              <span className="text-[12px] text-fg-muted">
                Dev server at <code className="font-mono text-fg">{previewUrl}</code>. Open it with <span className="font-medium text-fg">Preview</span> in the toolbar.
              </span>
            </div>
          )}

          {/* Artifacts */}
          {hasArtifacts && (
            <div className="py-1.5 space-y-1">
              <p className="text-[12px] text-fg-subtle mb-1.5">Artifacts</p>
              {runArtifacts.map((ev, i) => (
                <ArtifactResultCard key={`run_art_${i}`} result={ev.result} onViewInPanel={onViewArtifactInPanel} />
              ))}
            </div>
          )}

          {/* Files + commands */}
          {(hasFiles || hasCommands) && (
            <div className="py-1.5">
              <p className="text-[12px] text-fg-subtle mb-1.5">
                {[hasFiles && `${files.length} file${files.length !== 1 ? 's' : ''}`, hasCommands && `${commands.length} command${commands.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
              </p>
              <div className="rounded-lg border border-line overflow-hidden divide-y divide-line">
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
              <p className="text-[12px] text-fg-subtle mb-1.5">Tools used</p>
              <div className="flex flex-wrap gap-1.5">
                {topTools.map(({ name, count }) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-md bg-hover px-2 py-0.5 text-[11px] text-fg-muted">
                    {count > 1 && <span className="font-medium tabular-nums">{count}×</span>}
                    {name.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer controls */}
          <div className="flex items-center justify-between gap-3 pt-1 pb-0.5">
            <div className="flex items-center gap-3">
              {rounds > 0 && <span className="text-[12px] text-fg-subtle tabular-nums">{rounds} round{rounds !== 1 ? 's' : ''}</span>}
            </div>
            <div className="flex items-center gap-2">
              {sessionId && (
                <button type="button" onClick={refreshState} disabled={stateLoading}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-50 transition-colors">
                  <RefreshCw className={`w-3 h-3 ${stateLoading ? 'animate-spin' : ''}`} />Refresh
                </button>
              )}
              {hasFiles && checkpoint && (
                <button type="button" onClick={() => setShowRevertConfirm(true)} disabled={!revert?.available || reverting}
                  title={revert?.available ? 'Revert this run' : (revert?.reason || 'Revert unavailable')}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-red-600 hover:bg-red-500/10 disabled:opacity-50 disabled:hover:bg-transparent dark:text-red-400 transition-colors">
                  {reverting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  {revert?.available ? 'Revert run' : 'Revert unavailable'}
                </button>
              )}
            </div>
          </div>

          {revertMessage && (
            <div className={`py-1.5 text-[12px] flex items-center gap-2 ${revertMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
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
  if (toolCount > 0) parts.push(`${toolCount} action${toolCount !== 1 ? 's' : ''}`);
  else if (hasThinking) parts.push('Reasoning');
  if (topLabels.length && toolCount <= 3) parts.push(topLabels.join(', '));
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

  const getSubEvents = (sessionId) => {
    if (!sessionId) return [];
    return workEvents
      .filter(ev => ev.type === 'subagent_event' && ev.data?.subagentSessionId === sessionId)
      .map(ev => ev.data.event);
  };

  workEvents.forEach((ev, i) => {
    if (ev.type === 'subagent_event') {
      return;
    }
    if (ev.type === 'permission_request') {
      const decision = ev.data?.decision;
      const isResolvedApproval = ev.data?.resolved
        && ['allow', 'allow_session', 'allow_always', 'session_approved', 'auto_approved', 'local_auto'].includes(decision);
      const hasMatchingExecution = workEvents.some(other => (
        other.type === 'tool_start' && other.data?.tool === ev.data?.tool
      ));
      if (isResolvedApproval && hasMatchingExecution) return;
    }
    if (ev.type === 'permission_request' || ev.type === 'tool_start') {
      if (ev.type === 'tool_start' && (ev.data?.tool === 'delegate_task' || ev.data?.tool === 'delegate_to_profile')) {
        return;
      }
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
      case 'preview_url':
        rendered.push(
          <FeedNotice key={i} icon={Globe} title={ev.data?.url}>
            Preview opened at <span className="font-mono text-fg">{ev.data?.url}</span>
          </FeedNotice>
        );
        break;
      case 'stop_reason':
        rendered.push(<StopReasonBanner key={i} data={ev.data} toolResults={[...allToolsSeen]} />);
        break;
      case 'agent_delegate_start': {
        const hasResult = workEvents.some(other => other.type === 'agent_delegate_result' && (other.data?.sessionId === ev.data?.sessionId || other.data?.result?.sessionId === ev.data?.sessionId));
        if (hasResult) {
          break;
        }
        rendered.push(<AgentDelegateEvent key={i} data={ev.data} events={getSubEvents(ev.data?.sessionId)} pending />);
        break;
      }
      case 'agent_delegate_result': {
        const startEv = workEvents.find(other => other.type === 'agent_delegate_start' && other.data?.sessionId === (ev.data?.sessionId || ev.data?.result?.sessionId));
        const mergedData = { ...startEv?.data, ...ev.data };
        rendered.push(<AgentDelegateEvent key={i} data={mergedData} result={ev.data} events={getSubEvents(ev.data?.sessionId || ev.data?.result?.sessionId)} />);
        break;
      }
      case 'skills_loaded':
        rendered.push(<SkillsLoadedEvent key={i} data={ev.data} />);
        break;
      case 'compaction':
        rendered.push(<CompactionEvent key={i} data={ev.data} />);
        break;
      case 'correction_learned':
        rendered.push(<CorrectionLearnedEvent key={i} data={ev.data} />);
        break;
      case 'memory_saved':
        rendered.push(<MemorySavedEvent key={i} data={ev.data} />);
        break;
      default:
        break;
    }
  });

  flushTools();
  return rendered;
}

function AgentDelegateEvent({ data, result, pending = false, events = [] }) {
  const profile = result?.profile || data?.profile || {};
  const handle = profile.handle || data?.profileHandle;
  const name = profile.name || data?.profileName || handle || 'agent';
  // The agent's own emoji when it has one, else its initial.
  const icon = profile.icon || data?.profileIcon || name.charAt(0).toUpperCase();
  const answer = result?.answer || data?.answer || '';
  const isError = result?.success === false || data?.success === false;
  const sessionId = result?.sessionId || data?.sessionId;
  const [expanded, setExpanded] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const answerBlocks = useMemo(() => {
    if (!answer?.trim()) return [];
    try {
      return parseAIResponseToBlocks(answer);
    } catch {
      return [{ type: 'text', content: answer }];
    }
  }, [answer]);
  const shouldCollapseAnswer = answer.length > 520 || answerBlocks.length > 4;
  const statusLabel = pending ? 'Running' : isError ? 'Needs attention' : 'Done';
  const statusClass = isError ? 'text-red-600 dark:text-red-400' : 'text-fg-subtle';
  const StatusIcon = pending ? Loader2 : isError ? AlertTriangle : CheckCircle2;
  const collapsed = shouldCollapseAnswer && !answerExpanded;

  return (
    <FeedFrame className="mb-3">
      <div className="overflow-hidden rounded-xl border border-line bg-surface text-[13px]">
        <div className="px-3.5 py-3 sm:px-4">
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-[13px] font-medium text-fg-muted">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="leading-none">{icon}</span>}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium leading-tight text-fg">
                    {pending ? 'Delegating to' : isError ? 'Delegation failed for' : 'Delegated to'} {name}
                  </span>
                  {handle && (
                    <code className="rounded-md bg-hover px-1.5 py-0.5 text-[11px] text-fg-subtle">
                      #{handle}
                    </code>
                  )}
                </div>
                {data?.readOnly && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-medium text-fg-muted"
                    title="Read-only: it looks and searches, and changes nothing"
                  >
                    <Eye className="h-3 w-3" /> Read-only
                  </span>
                )}
                {data?.scopedToolCount > 0 && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-medium text-fg-muted"
                    title="Limited to a few tools"
                  >
                    <Wrench className="h-3 w-3" /> {data.scopedToolCount} tools
                  </span>
                )}
                <span className={`inline-flex shrink-0 items-center gap-1 text-[12px] font-medium ${statusClass}`}>
                  <StatusIcon className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
                  {statusLabel}
                </span>
              </div>

              {data?.task && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-hover px-2.5 py-2 text-fg-muted">
                  <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                  <p className="line-clamp-2 text-[12px] leading-5">{data.task}</p>
                </div>
              )}

              {answerBlocks.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-line">
                  <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-[12px] text-fg-subtle">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>Answer from {name}</span>
                  </div>
                  <div
                    className={`px-3 py-2.5 text-[13px] leading-relaxed text-fg-muted [&_.mb-3]:mb-2 [&_.mb-5]:mb-2.5 [&_.mb-6]:mb-2.5 [&_h1]:text-base [&_h1]:mb-2 [&_h1]:mt-2 [&_h2]:text-sm [&_h2]:mb-2 [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:mb-1.5 [&_h3]:mt-2 [&_li]:text-[13px] [&_p]:text-[13px] [&_p]:leading-relaxed ${collapsed ? 'max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]' : ''}`}
                  >
                    {answerBlocks.map((block, i) => (
                      <BlockRenderer key={i} block={block} />
                    ))}
                  </div>
                  {shouldCollapseAnswer && (
                    <button
                      type="button"
                      onClick={() => setAnswerExpanded(v => !v)}
                      aria-expanded={answerExpanded}
                      className="flex w-full items-center justify-center gap-1.5 border-t border-line px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                    >
                      {answerExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {answerExpanded ? 'Show less' : 'Show all'}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {sessionId && (
                  <span className="inline-flex max-w-full items-center gap-1 text-[11px] text-fg-subtle" title={sessionId}>
                    <Link2 className="h-3 w-3 shrink-0" />
                    <span className="truncate font-mono">{sessionId.slice(0, 8)}</span>
                  </span>
                )}
                {events.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    aria-expanded={expanded}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                  >
                    {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {expanded ? 'Hide its steps' : `Show its steps (${events.length})`}
                  </button>
                )}
              </div>

              {events.length > 0 && expanded && (
                <div className="mt-2.5 rounded-lg border border-line p-2 [&_.max-w-3xl]:mx-0 [&_.max-w-3xl]:max-w-none">
                  {renderWorkContent(events, {})}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </FeedFrame>
  );
}

function AgentWorkDrawer({ workEvents, isRunning, startedAt, completedAt, onPermissionDecision, onRetryTool, onAskUserAnswer, onRetryGoal, onRunWithAction }) {
  const hasPendingPermission = workEvents.some(ev => ev.type === 'permission_request' && !ev.data?.resolved);
  const hasPendingQuestion = workEvents.some(ev => ev.type === 'ask_user' && !ev.data?.answered && !ev.data?._inferred_answered);
  const hasBlocker = hasPendingPermission || hasPendingQuestion;
  const hasError = workEvents.some(ev => ev.type === 'error' || ev.type === 'stop_reason');
  const liveElapsed = useElapsedTime(isRunning ? startedAt : null);
  const elapsed = isRunning
    ? liveElapsed
    : (startedAt && completedAt && completedAt > startedAt ? completedAt - startedAt : 0);

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
        className="group flex w-full items-center gap-1.5 rounded-md py-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-fg-subtle transition-colors" />
          : <ChevronRight className="h-3 w-3 flex-shrink-0 text-fg-subtle transition-colors" />}
        {isRunning ? (
          <span className="flex-shrink-0 flex items-center gap-1.5 text-[12px] tabular-nums text-fg-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-subtle" />
            Working for {formatElapsed(elapsed)}
          </span>
        ) : elapsed > 0 || summary ? (
          <span className="min-w-0 flex-1 truncate text-[12px] tabular-nums text-fg-muted transition-colors group-hover:text-fg">
            {elapsed > 0 ? `Worked for ${formatElapsed(elapsed)}` : summary}
            {elapsed > 0 && summary ? <span className="text-fg-subtle"> · {summary}</span> : null}
          </span>
        ) : null}
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
    if (ev.type === 'run_start' || ev.type === 'compaction') {
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
  streamingReasoning = '',
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
  renderPendingInteractionsInline = true,
  conversationId = null,
}) {
  const skillSuggestions = useSkillSuggestions(conversationId);
  const hasContent = (events && events.length > 0) || streamingText || isRunning;
  if (!hasContent) return null;

  const evList = events || [];
  const segments = buildEventSegments(evList);
  // "Save this as a skill?" cards: after the answer they came from.
  const suggestionSpots = placeSkillSuggestions(
    segments.map(seg => seg.answerEvent?.data?.messageId || null),
    skillSuggestions.suggestions,
  );
  const renderSuggestion = (suggestion) => (
    <FeedFrame key={`skill_${suggestion.id}`} className="mb-3">
      <SkillSuggestionCard suggestion={suggestion} onSave={skillSuggestions.save} onDismiss={skillSuggestions.dismiss} />
    </FeedFrame>
  );

  return (
    <div className="space-y-0">
      <GeneratedMediaLibrary events={evList} />

      {segments.map((seg, si) => {
        if (seg.divider) {
          return <RunDivider key={`divider_${si}`} event={seg.divider} data={seg.divider.data} />;
        }

        const isLastSeg = si === segments.length - 1;
        const segIsRunning = isLastSeg && isRunning;
        const hasThinkingInSeg = seg.workEvents.some(ev => ev.type === 'thinking');
        const hasStopReason = seg.workEvents.some(ev => ev.type === 'stop_reason');
        const segUsage = [...seg.workEvents].reverse().find(ev => ev.type === 'usage_update')?.data || null;

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
        const drawerEvents = seg.workEvents.filter(ev => {
          if (ev.type === 'tool_start' && ARTIFACT_TOOLS.has(ev.data?.tool) && ev.result?.success && ev.result?.artifact) {
            return false;
          }
          if (!renderPendingInteractionsInline) {
            if (ev.type === 'permission_request' && !ev.data?.resolved && !ev.data?.historical) return false;
            if (ev.type === 'ask_user' && !ev.data?.answered && !ev.data?._inferred_answered) return false;
          }
          return true;
        });

        return (
          <div key={si} id={`chat-seg-${si}`}>
            {seg.goalEvent && (
              <UserGoalEvent
                data={seg.goalEvent.data}
                onEditMessage={onEditMessage}
                onToggleMessageFlag={onToggleMessageFlag}
                isRunning={isRunning}
                animateIn={isLastSeg && isRunning}
                highlighted={Boolean(seg.goalEvent.data?.messageId && seg.goalEvent.data.messageId === highlightedMessageId)}
              />
            )}
            <AgentWorkDrawer
              workEvents={drawerEvents}
              isRunning={segIsRunning}
              startedAt={segStartMs}
              completedAt={segEndMs}
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
                usage={segUsage}
                elapsedMs={!isRunning && segElapsedMs > 0 ? segElapsedMs : null}
                isStoppedRun={hasStopReason}
                isLatest={si === segments.length - 1}
              />
            )}
            {(suggestionSpots.bySegment.get(si) || []).map(renderSuggestion)}
          </div>
        );
      })}

      {isRunning && <StreamingPreview text={streamingText} reasoningText={streamingReasoning} />}
      {isRunning && !streamingText && !streamingReasoning && !segments.some((segment) => !segment.divider && segment.workEvents?.length > 0) && <RunningIndicator runStartedAt={runStartedAt} />}
      {!isRunning && <RunSummaryCard events={evList} runStartedAt={runStartedAt} sessionId={sessionId} session={session} onViewArtifactInPanel={onViewArtifactInPanel} />}
      {!isRunning && suggestionSpots.atEnd.map(renderSuggestion)}
    </div>
  );
}
