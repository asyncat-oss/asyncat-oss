// CommandCenterV2Enhanced.jsx — Unified agent interface (tools ON = acts, tools OFF = answers only)

function normalizeAgentToolRows(rows = []) {
  return rows.map(row => ({
    tool: row.tool_name || row.tool,
    args: row.args,
    result: row.result,
    round: row.round,
    permission: row.permission_level || row.permission,
    permissionDecision: row.permission_decision || row.permissionDecision,
    permissionReason: row.permission_reason || row.permissionReason,
    workingDir: row.working_dir || row.workingDir,
    timestamp: row.started_at || row.timestamp,
  }));
}

function buildAgentEventsFromSession(session, auditRows = []) {
  const rounds = Array.isArray(session?.scratchpad?.conversationRounds)
    ? session.scratchpad.conversationRounds
    : [];
  const toolRows = normalizeAgentToolRows(
    auditRows.length ? auditRows : (session?.toolHistory || [])
  );

  if (!rounds.length) {
    const events = [];
    if (session?.goal) events.push({ type: 'user_goal', data: { goal: session.goal } });
    toolRows.forEach(tc => {
      events.push({
        type: 'tool_start',
        data: {
          tool: tc.tool,
          args: tc.args,
          round: tc.round,
          permission: tc.permission,
          permissionDecision: tc.permissionDecision,
          permissionReason: tc.permissionReason,
          workingDir: tc.workingDir,
        },
        result: tc.result,
      });
    });
    const finalAnswer = session?.scratchpad?.finalAnswer;
    if (finalAnswer) {
      events.push({ type: 'answer', data: { answer: finalAnswer, round: session?.totalRounds } });
    }
    return events;
  }

  const events = [];
  rounds.forEach((round, idx) => {
    events.push({ type: 'user_goal', data: { goal: round.goal, timestamp: round.timestamp } });

    const hasRange = Number.isFinite(round.startRound) && Number.isFinite(round.endRound);
    const scopedTools = hasRange
      ? toolRows.filter(tc => tc.round > round.startRound && tc.round <= round.endRound)
      : [];
    const scopedReasoning = Array.isArray(round.reasoning)
      ? round.reasoning.filter(item => item?.thought)
      : [];

    [
      ...scopedReasoning.map(item => ({ kind: 'thinking', round: item.round, timestamp: item.timestamp, item })),
      ...scopedTools.map(item => ({ kind: 'tool', round: item.round, timestamp: item.timestamp, item })),
    ]
      .sort((a, b) => {
        const roundDelta = (a.round || 0) - (b.round || 0);
        if (roundDelta !== 0) return roundDelta;
        if (a.kind !== b.kind) return a.kind === 'thinking' ? -1 : 1;
        return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
      })
      .forEach(entry => {
        if (entry.kind === 'thinking') {
          events.push({
            type: 'thinking',
            data: { thought: entry.item.thought, round: entry.item.round },
          });
          return;
        }

        const tc = entry.item;
        events.push({
          type: 'tool_start',
          data: {
            tool: tc.tool,
            args: tc.args,
            round: tc.round,
            permission: tc.permission,
            permissionDecision: tc.permissionDecision,
            permissionReason: tc.permissionReason,
            workingDir: tc.workingDir,
          },
          result: tc.result,
        });
      });

    if (round.answer) {
      const displayRound = hasRange ? Math.max(1, round.endRound - round.startRound) : idx + 1;
      events.push({ type: 'answer', data: { answer: round.answer, round: displayRound } });
    }
  });

  return events;
}

function cleanAgentActivityDetail(detail) {
  return String(detail || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\s*<tool_call>[\s\S]*?<\/(?:\w+:)?tool_call>/gi, '')
    .replace(/\s*<tool_call[\s\S]*$/i, '')
    .trim();
}

function isLikelyToolActionRequest(goal = '') {
  return /\b(create|add|update|edit|delete|remove|move|rename|write|save|schedule|run|execute|install|open|read|inspect|check|search|find|browse|fix|change|modify)\b/i.test(goal);
}

function getLeadingProfileMention(goal = '', mentions = []) {
  if (!Array.isArray(mentions) || mentions.length !== 1) return null;
  const mention = mentions[0];
  const handle = String(mention?.handle || '').toLowerCase();
  if (!handle) return null;
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*@${escaped}(?:\\b|\\s|$)`, 'i').test(goal) ? mention : null;
}

function buildEventsFromMessages(messages = []) {
  const events = [];
  for (const msg of messages) {
    if (msg.type === 'user') {
      events.push({ type: 'user_goal', data: { goal: msg.content, timestamp: msg.timestamp, toolsEnabled: msg.toolsEnabled, agentMentions: msg.agentMentions || [] } });
    } else if (msg.type === 'assistant') {
      if (Array.isArray(msg.agentEvents) && msg.agentEvents.length > 0) {
        events.push(...msg.agentEvents.filter(ev => ev?.type && ev.type !== 'user_goal' && ev.type !== 'answer'));
      }
      events.push({
        type: msg.isError ? 'error' : 'answer',
        data: msg.isError
          ? { message: msg.content }
          : { answer: msg.content, toolsEnabled: msg.toolsEnabled, searchEvent: msg.searchEvent || null },
      });
    }
  }
  return events;
}

function getPersistableAgentEvents(events = []) {
  return events
    .filter(ev => ev?.type && !['user_goal', 'answer', 'delta', 'done', 'session_start', 'tool_result'].includes(ev.type))
    .map(ev => ({
      type: ev.type,
      data: ev.data,
      result: ev.result,
      arrivedAt: ev.arrivedAt,
      completedAt: ev.completedAt,
    }));
}

function buildSearchEvent(events = []) {
  const sources = [];
  const images = [];
  const seenUrls = new Set();

  const lastGoalIndex = events.reduce((lastIndex, ev, index) => (
    ev?.type === 'user_goal' ? index : lastIndex
  ), -1);
  const scopedEvents = lastGoalIndex >= 0 ? events.slice(lastGoalIndex + 1) : events;

  for (const ev of scopedEvents) {
    if (ev.type !== 'tool_start' || !ev.result) continue;
    const tool = ev.data?.tool;
    const result = ev.result;

    if (tool === 'web_search' && result?.success) {
      if (result.query && !sources.some(s => s.query === result.query)) {
        // Add search query as a group header
      }
      for (const r of (result.results || [])) {
        if (r.url && !seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          sources.push({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            query: result.query,
            tool: 'web_search',
          });
        }
      }
      for (const img of (result.images || [])) {
        if (img.image && !seenUrls.has(img.image)) {
          seenUrls.add(img.image);
          images.push({
            title: img.title,
            url: img.url,
            image: img.image,
            thumbnail: img.thumbnail,
            source: img.source,
            width: img.width,
            height: img.height,
          });
        }
      }
    }

    if ((tool === 'fetch_url' || tool === 'http_get' || tool === 'browse_url') && result?.success) {
      const url = result.url || result.finalUrl || ev.data?.args?.url;
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        sources.push({
          title: result.title || url,
          url,
          snippet: result.content ? String(result.content).slice(0, 200) : '',
          query: null,
          tool,
        });
      }
    }

    if (tool === 'search_images' && result?.success) {
      for (const img of (result.images || [])) {
        if (img.image && !seenUrls.has(img.image)) {
          seenUrls.add(img.image);
          images.push({
            title: img.title,
            url: img.url,
            image: img.image,
            thumbnail: img.thumbnail,
            source: img.source,
            width: img.width,
            height: img.height,
          });
        }
      }
    }
  }

  if (sources.length === 0 && images.length === 0) return null;

  return {
    sources,
    images,
    sourceCount: sources.length,
    imageCount: images.length,
  };
}

function AgentActivitySidebar({ items = [], isLoading = false, isRunning = false, onClose }) {
  const feedEndRef = useRef(null);

  useEffect(() => {
    if (isRunning) feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length, isRunning]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          Steps
        </span>
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
        ) : isRunning ? (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        ) : (
          <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">{items.length}</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:hover:bg-slate-800"
          title="Hide steps"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && !isLoading && (
          <p className="px-4 py-5 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            Nothing yet.
          </p>
        )}
        <div className="py-1.5 px-1.5 space-y-px">
          {items.map((item, i) => {
            const detail = cleanAgentActivityDetail(item.detail);
            const isLast = i === items.length - 1;

            return (
              <div
                key={item.id}
                title={detail || item.label}
                className={`rounded-lg px-2.5 py-2 transition-colors ${
                  isLast && isRunning
                    ? 'bg-blue-50/50 dark:bg-blue-950/20 midnight:bg-blue-950/20'
                    : 'hover:bg-gray-100/60 dark:hover:bg-gray-800/40 midnight:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 truncate leading-none">
                        {item.label}
                      </span>
                      {item.duration && (
                        <span className="shrink-0 text-[10px] tabular-nums text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                          · {item.duration}
                        </span>
                      )}
                    </div>
                    {detail && (
                      <p className="mt-0.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500 midnight:text-slate-500 line-clamp-2 break-all">
                        {detail}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={feedEndRef} />
        </div>
      </div>
    </div>
  );
}

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { MessageInputV2 } from "./components/MessageInputV2";
import AgentRunFeed, { CurrentPlanPanel } from './components/AgentRunFeed';
import AgentChangesPanel from './components/AgentChangesPanel';
import DeleteConfirmationModal from "./components/DeleteConfirmationModal";
import { useCommandCenter } from "./CommandCenterContextEnhanced";
import { chatApi, agentApi } from "./commandCenterApi";
import { cleanReasoningAnswer } from "./reasoningParser.js";
import { useUser } from "../contexts/UserContext";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Edit2,
  Trash2,
  Check,
  X,
  Ghost,
  LayoutList,
  Calendar,
  PenLine,
  Lightbulb,
  Download,
  BookOpen,
  Loader2,
  History,
  Plus,
  MessageSquare,
  PanelRightOpen,
  Image,
  Link2,
  ExternalLink,
} from "lucide-react";

const getRelativeConversationTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diffH = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getTaskRunDisplayStatus = (taskRun) => {
  const status = taskRun?.displayStatus || taskRun?.status || '';
  if (status === 'needs_input' || taskRun?.needsInput) {
    return {
      label: 'Needs input',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300',
    };
  }
  if (status === 'running') {
    return {
      label: 'Running',
      className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-300',
    };
  }
  if (status === 'completed') {
    return {
      label: 'Completed',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300',
    };
  }
  if (status === 'failed') {
    return {
      label: 'Failed',
      className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-300',
    };
  }
  return {
    label: status ? status[0].toUpperCase() + status.slice(1) : 'Task run',
    className: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };
};

const getSourceDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
};

function buildConversationSourceCatalog(messages = [], events = []) {
  const sources = [];
  const images = [];
  const seenSources = new Set();
  const seenImages = new Set();

  const addSearchEvent = (searchEvent, answerLabel) => {
    if (!searchEvent) return;

    for (const source of (searchEvent.sources || [])) {
      const url = source?.url;
      if (!url || seenSources.has(url)) continue;
      seenSources.add(url);
      sources.push({
        ...source,
        title: source.title || getSourceDomain(url),
        domain: getSourceDomain(url),
        answerLabel,
      });
    }

    for (const img of (searchEvent.images || [])) {
      const imageUrl = img?.image || img?.thumbnail || img?.url;
      if (!imageUrl || seenImages.has(imageUrl)) continue;
      seenImages.add(imageUrl);
      images.push({
        ...img,
        image: img.image || imageUrl,
        thumbnail: img.thumbnail || img.image || imageUrl,
        title: img.title || img.source || 'Image',
        answerLabel,
      });
    }
  };

  let answerNumber = 0;
  for (const msg of messages || []) {
    if (msg?.type !== 'assistant' && msg?.role !== 'assistant') continue;
    answerNumber += 1;
    addSearchEvent(msg.searchEvent, `Answer ${answerNumber}`);
  }

  for (const ev of events || []) {
    if (ev?.type !== 'answer') continue;
    addSearchEvent(ev.data?.searchEvent, 'Latest answer');
  }

  return {
    sources,
    images,
    sourceCount: sources.length,
    imageCount: images.length,
    totalCount: sources.length + images.length,
  };
}

function ChatSourcesMediaSidebar({ catalog, onClose }) {
  const [tab, setTab] = useState(catalog.imageCount > 0 ? 'images' : 'sources');
  const hasImages = catalog.imageCount > 0;
  const hasSources = catalog.sourceCount > 0;

  useEffect(() => {
    if (tab === 'images' && !hasImages && hasSources) setTab('sources');
    if (tab === 'sources' && !hasSources && hasImages) setTab('images');
  }, [tab, hasImages, hasSources]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700 midnight:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            Sources & media
          </span>
          <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">{catalog.totalCount}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:hover:bg-slate-800"
            title="Hide sources and media"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800 midnight:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('images')}
            disabled={!hasImages}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              tab === 'images'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            <Image className="h-3.5 w-3.5" />
            {catalog.imageCount}
          </button>
          <button
            type="button"
            onClick={() => setTab('sources')}
            disabled={!hasSources}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              tab === 'sources'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            {catalog.sourceCount}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'images' && (
          <div className="grid grid-cols-2 gap-2">
            {catalog.images.map((img, i) => (
              <a
                key={`${img.image || img.thumbnail || img.url}-${i}`}
                href={img.url || img.image}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700"
                title={img.title}
              >
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
                  <img
                    src={img.thumbnail || img.image}
                    alt={img.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <ExternalLink className="absolute right-1.5 top-1.5 h-3.5 w-3.5 rounded bg-white/90 p-0.5 text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 dark:bg-gray-900/90 dark:text-gray-200" />
                </div>
                <div className="min-w-0 px-2 py-1.5">
                  <p className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-200">{img.title}</p>
                  <p className="truncate text-[10px] text-gray-400 dark:text-gray-500">{img.answerLabel}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {tab === 'sources' && (
          <div className="space-y-2">
            {catalog.sources.map((source, i) => (
              <a
                key={`${source.url}-${i}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <img
                    src={`https://icons.duckduckgo.com/ip3/${source.domain}.ico`}
                    alt=""
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{source.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-blue-600 dark:text-blue-400">{source.domain}</p>
                    {source.snippet && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        {source.snippet}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{source.answerLabel}</p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                </div>
              </a>
            ))}
          </div>
        )}

        {catalog.totalCount === 0 && (
          <p className="px-1 py-5 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            No sources or images in this chat yet.
          </p>
        )}
      </div>
    </div>
  );
}

const CommandCenterV2Enhanced = ({ initialMode = 'chat', agentSessionId = null }) => {
  const commandCenterContext = useCommandCenter();
  const navigate = useNavigate();
  const { userName } = useUser();

  const {
    messages = [],
    isProcessing = false,
    isConversationLoading = false,
    handleClearConversation = () => {},
    handleNewConversation = () => {},
    currentConversationId = null,
    conversationTitle = "",
    triggerConversationRefresh = () => {},
    setConversationTitle = () => {},
    isGhostMode = false,
    toggleGhostMode = () => {},
    conversationHistory = [],
    setMessages,
    setConversationHistory,
    setError,
    toolsEnabled,
    setToolsEnabled,
    saveCurrentConversation,
    generateAndSetTitle,
    setCurrentConversationId,
    onProjectsChange,
  } = commandCenterContext || {};

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const conversationMenuRef = useRef(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [recentConversations, setRecentConversations] = useState([]);
  const [recentConversationsLoading, setRecentConversationsLoading] = useState(false);
  const [recentConversationsError, setRecentConversationsError] = useState(null);
  const [showActivitySidebar, setShowActivitySidebar] = useState(() => {
    try {
      return localStorage.getItem('asyncat_show_steps_sidebar') !== 'false';
    } catch {
      return true;
    }
  });
  const [showSourcesMediaSidebar, setShowSourcesMediaSidebar] = useState(false);
  const [chatRuns, setChatRuns] = useState({});
  const [agentAutoApprove, setAgentAutoApprove] = useState(() => {
    try {
      return localStorage.getItem('asyncat_agent_auto_approve') === 'true';
    } catch {
      return false;
    }
  });
  const [alwaysAllowedTools, setAlwaysAllowedTools] = useState(() => {
    try {
      const stored = localStorage.getItem('asyncat_always_allow_tools');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [agentLoadingSession, setAgentLoadingSession] = useState(false);
  const [editGoalText, setEditGoalText] = useState('');
  const [showDeleteAgentConfirm, setShowDeleteAgentConfirm] = useState(false);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [draftGoal, setDraftGoal] = useState('');
  const [contextInfo, setContextInfo] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState(false);
  const [isCompactingContext, setIsCompactingContext] = useState(false);
  const autoCompactRef = useRef(null);
  const agentAbortControllersRef = useRef(new Map());
  const chatRunsRef = useRef(chatRuns);
  const runStartedAtRef = useRef(null);

  useEffect(() => {
    chatRunsRef.current = chatRuns;
  }, [chatRuns]);

  const currentRunKey = currentConversationId || '__draft__';
  const currentRun = chatRuns[currentRunKey] || {};
  const agentRunning = Boolean(currentRun.running);
  const agentEvents = currentRun.events || [];
  const agentCurrentGoal = currentRun.goal || '';
  const agentCurrentSessionId = currentRun.sessionId || null;
  const agentCurrentSession = currentRun.session || null;
  const agentTaskRun = agentCurrentSession?.taskRun || null;
  const agentTaskRunStatus = getTaskRunDisplayStatus(agentTaskRun);
  const agentConversationHistory = currentRun.conversationHistory || [];
  const agentStreamingText = currentRun.streamingText || '';
  const activeConversationIds = useMemo(
    () => new Set(
      Object.entries(chatRuns)
        .filter(([key, run]) => key !== '__draft__' && run?.running)
        .map(([key]) => key)
    ),
    [chatRuns],
  );
  const hasActiveRuns = useMemo(
    () => Object.values(chatRuns).some(run => run?.running),
    [chatRuns],
  );
  const currentConversationIdRef = useRef(currentConversationId);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  const updateChatRun = useCallback((runKey, updater) => {
    setChatRuns(prev => {
      const existing = prev[runKey] || {};
      const next = typeof updater === 'function' ? updater(existing) : { ...existing, ...updater };
      return { ...prev, [runKey]: next };
    });
  }, []);

  const setCurrentChatRun = useCallback((updater) => {
    updateChatRun(currentRunKey, updater);
  }, [currentRunKey, updateChatRun]);

  useEffect(() => {
    if (!agentSessionId) return;

    let cancelled = false;
    const runKey = currentRunKey;

    const loadPersistedAgentSession = async () => {
      setAgentLoadingSession(true);
      try {
        const [sessionResult, auditResult] = await Promise.all([
          agentApi.getSession(agentSessionId),
          agentApi.getSessionAudit(agentSessionId).catch(() => ({ audit: [] })),
        ]);

        if (cancelled) return;

        const session = sessionResult?.session;
        if (!session) {
          updateChatRun(runKey, {
            goal: '',
            sessionId: agentSessionId,
            session: null,
            running: false,
            streamingText: '',
            events: [{ type: 'error', data: { message: 'Agent session not found.' } }],
          });
          return;
        }

        const firstGoalLine = String(session.goal || '').split('\n').find(Boolean) || '';
        const displayGoal = session.taskRun?.cardTitle && (!firstGoalLine || /^Work on task card\s+/i.test(firstGoalLine))
          ? `Task: ${session.taskRun.cardTitle}`
          : (firstGoalLine || session.goal || '');
        setConversationTitle(displayGoal || 'Agent run');
        const events = buildAgentEventsFromSession(session, auditResult?.audit || []);
        updateChatRun(runKey, {
          goal: displayGoal,
          sessionId: session.id,
          session,
          running: session.status === 'active',
          streamingText: '',
          conversationHistory: Array.isArray(session.messages) ? session.messages : [],
          events,
        });
      } catch (error) {
        if (cancelled) return;
        updateChatRun(runKey, {
          goal: '',
          sessionId: agentSessionId,
          session: null,
          running: false,
          streamingText: '',
          events: [{ type: 'error', data: { message: error.message || 'Failed to load agent session.' } }],
        });
      } finally {
        if (!cancelled) setAgentLoadingSession(false);
      }
    };

    loadPersistedAgentSession();

    return () => {
      cancelled = true;
    };
  }, [agentSessionId, currentRunKey, setConversationTitle, updateChatRun]);

  const conversationTokens = useMemo(() => {
    if (contextInfo?.inputTokens) {
      const currentInputTokens = Math.ceil((draftGoal || '').length / 4);
      return Math.max(0, contextInfo.inputTokens - currentInputTokens);
    }
    const sliced = toolsEnabled
      ? (conversationHistory || []).slice(-4)
      : (conversationHistory || []).slice(-6);
    const historyChars = sliced.reduce(
      (sum, m) => sum + (m.content?.length || 0),
      0,
    );
    const systemOverhead = toolsEnabled ? 4000 : 1500;
    return Math.round(historyChars / 4) + systemOverhead;
  }, [conversationHistory, toolsEnabled, contextInfo, draftGoal]);

  const contextHistoryForMeter = agentConversationHistory.length > 0
    ? agentConversationHistory
    : conversationHistory;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setContextLoading(true);
        setContextError(false);
        const result = await agentApi.getContext({
          goal: draftGoal,
          conversationHistory: contextHistoryForMeter,
          enableTools: toolsEnabled,
          profileId: selectedProfileId,
        });
        if (!cancelled) {
          setContextInfo(result?.context || null);
          setContextError(false);
        }
      } catch {
        if (!cancelled) {
          setContextInfo(null);
          setContextError(true);
        }
      } finally {
        if (!cancelled) setContextLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contextHistoryForMeter, draftGoal, selectedProfileId, toolsEnabled]);

  const scrollToBottom = useCallback((force = false) => {
    let shouldScroll = force;
    if (!shouldScroll && scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      shouldScroll = scrollHeight - scrollTop - clientHeight < 400;
    } else if (!scrollContainerRef.current && !force) {
      shouldScroll = true;
    }

    if (shouldScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: force ? "smooth" : "auto",
        block: "end",
        inline: "nearest",
      });
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      const isLastMessageUser = messages[messages.length - 1]?.type === "user";
      requestAnimationFrame(() => {
        setTimeout(() => scrollToBottom(isLastMessageUser), 100);
      });
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e) => {
      const btn = e.target.closest("button");
      if (!btn || btn.title !== "Export conversation") {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  const loadRecentConversations = useCallback(async () => {
    try {
      setRecentConversationsLoading(true);
      setRecentConversationsError(null);
      const result = await chatApi.getConversationHistory({ limit: 8, archived: false });
      const conversations = result?.conversations || [];
      conversations.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setRecentConversations(conversations);
    } catch (error) {
      console.error('Failed to load recent conversations:', error);
      setRecentConversationsError('Could not load recent chats');
    } finally {
      setRecentConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showConversationMenu) loadRecentConversations();
  }, [showConversationMenu, loadRecentConversations]);

  useEffect(() => {
    if (!showConversationMenu) return;
    const handler = (e) => {
      if (!conversationMenuRef.current?.contains(e.target)) {
        setShowConversationMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showConversationMenu]);

  const handleStartNewConversation = useCallback(async () => {
    setShowConversationMenu(false);
    navigate('/home');
    await handleNewConversation();
  }, [handleNewConversation, navigate]);

  const handleOpenConversation = useCallback((conversationId) => {
    if (!conversationId) return;
    setShowConversationMenu(false);
    navigate(`/conversations/${conversationId}`);
  }, [navigate]);

  const handleSetActivitySidebarVisible = useCallback((visible) => {
    setShowActivitySidebar(visible);
    try {
      localStorage.setItem('asyncat_show_steps_sidebar', String(visible));
    } catch {}
  }, []);

  const ConversationSwitcher = useCallback(({ compact = false } = {}) => (
    <div className="relative" ref={conversationMenuRef}>
      <button
        type="button"
        onClick={() => setShowConversationMenu((v) => !v)}
        className={`relative ${compact ? 'p-2' : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium'} text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors`}
        title="Recent conversations"
      >
        <History className={compact ? "w-5 h-5" : "w-4 h-4"} />
        {!compact && <span>History</span>}
        {hasActiveRuns && (
          <span
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900 midnight:ring-slate-900 animate-pulse"
            title="A chat is generating"
          />
        )}
      </button>

      {showConversationMenu && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
                Recent
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                Jump back without leaving the chat
              </p>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto py-1.5">
            {recentConversationsLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading recent chats
              </div>
            ) : recentConversationsError ? (
              <div className="px-4 py-8 text-center text-sm text-red-500">
                {recentConversationsError}
              </div>
            ) : recentConversations.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <MessageSquare className="mx-auto mb-2 h-7 w-7 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No saved conversations yet</p>
              </div>
            ) : (
              recentConversations.map((conversation) => {
                const active = conversation.id === currentConversationId;
                const running = activeConversationIds.has(conversation.id);
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleOpenConversation(conversation.id)}
                    className={`w-full px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-950/30 midnight:bg-indigo-950/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/70 midnight:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        {running && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)] animate-pulse"
                            title="Generating"
                          />
                        )}
                        <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                          {conversation.title || 'Untitled conversation'}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                        {running ? 'Generating' : getRelativeConversationTime(conversation.updated_at)}
                      </span>
                    </div>
                    {(conversation.preview || conversation.messages?.[0]?.content) && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                        {conversation.preview || conversation.messages?.[0]?.content}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowConversationMenu(false);
              navigate('/all-chats');
            }}
            className="flex w-full items-center justify-center gap-2 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-800 transition-colors"
          >
            View all history
          </button>
        </div>
      )}
    </div>
  ), [
    activeConversationIds,
    currentConversationId,
    hasActiveRuns,
    handleStartNewConversation,
    handleOpenConversation,
    navigate,
    recentConversations,
    recentConversationsError,
    recentConversationsLoading,
    showConversationMenu,
  ]);

  const handleStartRename = useCallback(() => {
    setEditTitle(conversationTitle || "");
    setIsEditingTitle(true);
  }, [conversationTitle]);

  const handleSaveRename = useCallback(async () => {
    if (
      editTitle.trim() &&
      editTitle.trim() !== conversationTitle &&
      currentConversationId
    ) {
      try {
        await chatApi.updateConversation(currentConversationId, {
          title: editTitle.trim(),
        });
        setConversationTitle(editTitle.trim());
        triggerConversationRefresh();
      } catch (error) {
        console.error("Failed to rename conversation:", error);
      }
    }
    setIsEditingTitle(false);
  }, [
    editTitle,
    conversationTitle,
    currentConversationId,
    setConversationTitle,
    triggerConversationRefresh,
  ]);

  const handleCancelRename = useCallback(() => {
    setEditTitle(conversationTitle || "");
    setIsEditingTitle(false);
  }, [conversationTitle]);

  const handleDeleteConversation = useCallback(async () => {
    if (!currentConversationId) return;
    try {
      await chatApi.deleteConversation(currentConversationId);
      handleClearConversation();
      triggerConversationRefresh();
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
    setShowDeleteConfirm(false);
  }, [
    currentConversationId,
    handleClearConversation,
    triggerConversationRefresh,
  ]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        handleSaveRename();
      } else if (e.key === "Escape") {
        handleCancelRename();
      }
    },
    [handleSaveRename, handleCancelRename],
  );

  // ── Agent handlers ────────────────────────────────────────────────────────
  const handleAgentRun = useCallback(async (messageObj, runOptions = {}) => {
    const goal = typeof messageObj === 'string' ? messageObj : messageObj?.content;
    if (!goal?.trim() || agentRunning) return;
    const submittedGoal = goal.trim();
    const agentMentions = Array.isArray(messageObj?.agentMentions) ? messageObj.agentMentions : [];
    const leadingProfileMention = getLeadingProfileMention(submittedGoal, agentMentions);
    const effectiveProfileId = leadingProfileMention?.id || selectedProfileId;
    const runKey = currentRunKey;
    const runConversationId = currentConversationId;
    const runMessages = messages;
    const effectiveToolsEnabled = runOptions.enableTools ?? toolsEnabled;
    const activeConversationHistory = agentConversationHistory.length > 0
      ? agentConversationHistory
      : conversationHistory;

    if (!currentConversationId && messages.length === 0) {
      generateAndSetTitle(submittedGoal);
    }

    setError(null);
    runStartedAtRef.current = Date.now();
    updateChatRun(runKey, prev => {
      const baseEvents = prev.events?.length ? prev.events : buildEventsFromMessages(runMessages);
      return {
        ...prev,
        goal: submittedGoal,
        running: true,
        streamingText: '',
        session: null,
        selectedProfileId: effectiveProfileId || null,
        agentMentions,
        events: [
          ...baseEvents,
          { type: 'user_goal', data: { goal: submittedGoal, timestamp: new Date().toISOString(), toolsEnabled: effectiveToolsEnabled, agentMentions, profileId: effectiveProfileId || null }, arrivedAt: Date.now() },
        ],
      };
    });

    const controller = new AbortController();
    agentAbortControllersRef.current.set(runKey, controller);

    let capturedFinalAnswer = '';
    let sawFinalResponse = false;
    let sawErrorEvent = false;
    let sawDoneWithoutAnswer = false;
    let runSessionId = agentCurrentSessionId;
    const runEvents = [
      { type: 'user_goal', data: { goal: submittedGoal, timestamp: new Date().toISOString(), toolsEnabled: effectiveToolsEnabled, agentMentions, profileId: effectiveProfileId || null } },
    ];

    try {
      for await (const event of agentApi.runStream(submittedGoal, activeConversationHistory, null, 25, controller.signal, agentCurrentSessionId, {
        autoApprove: agentAutoApprove,
        preApprovedTools: [...alwaysAllowedTools],
        profileId: effectiveProfileId,
        agentMentions,
        enableTools: effectiveToolsEnabled,
      })) {
        if (controller.signal.aborted) break;
        if (event.type === 'session_start') {
          if (event.data?.sessionId) {
            runSessionId = event.data.sessionId;
            updateChatRun(runKey, { sessionId: event.data.sessionId });
          }
          continue;
        }
        if (event.type === 'delta') {
          updateChatRun(runKey, prev => ({ ...prev, streamingText: (prev.streamingText || '') + (event.data?.content || '') }));
          continue;
        }
        if (event.type === 'thinking') {
          updateChatRun(runKey, prev => ({ ...prev, streamingText: cleanReasoningAnswer(prev.streamingText || '') }));
        } else if (event.type === 'tool_start' || event.type === 'answer') {
          updateChatRun(runKey, { streamingText: '' });
        }
        if (event.type === 'done') {
          if (event.data?.sessionId) {
            runSessionId = event.data.sessionId;
            updateChatRun(runKey, { sessionId: event.data.sessionId });
          }
          const doneAnswer = String(event.data?.answer || '').trim();
          if (doneAnswer) {
            sawFinalResponse = true;
          }
          if (!capturedFinalAnswer && doneAnswer) {
            capturedFinalAnswer = doneAnswer;
            updateChatRun(runKey, prev => ({
              ...prev,
              events: [
                ...(prev.events || []),
                {
                  type: 'answer',
                  data: {
                    answer: doneAnswer,
                    round: event.data.rounds,
                    toolsEnabled: effectiveToolsEnabled,
                  },
                  arrivedAt: Date.now(),
                },
              ],
            }));
          } else if (!doneAnswer) {
            sawDoneWithoutAnswer = true;
          }
          continue;
        }
        if (event.type === 'answer') {
          const answerText = String(event.data?.answer || '').trim();
          if (answerText) {
            sawFinalResponse = true;
            capturedFinalAnswer = answerText;
          } else {
            sawDoneWithoutAnswer = true;
          }
        }
        if (event.type === 'error') {
          sawErrorEvent = true;
        }
        if (event.type === 'tool_result') {
          const completedAt = Date.now();
          runEvents.push(event);
          updateChatRun(runKey, prev => {
            const updated = [...(prev.events || [])];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].type === 'tool_start' && updated[i].data?.tool === event.data?.tool && updated[i].result === undefined) {
                updated[i] = { ...updated[i], result: event.data?.result, completedAt };
                for (let j = runEvents.length - 1; j >= 0; j--) {
                  if (runEvents[j].type === 'tool_start' && runEvents[j].data?.tool === event.data?.tool && runEvents[j].result === undefined) {
                    runEvents[j] = { ...runEvents[j], result: event.data?.result, completedAt };
                    break;
                  }
                }
                return { ...prev, events: updated };
              }
            }
            return prev;
          });
          continue;
        }
        const eventWithMode = event.type === 'answer'
          ? { ...event, data: { ...event.data, toolsEnabled: effectiveToolsEnabled } }
          : event;
        runEvents.push(eventWithMode);
        updateChatRun(runKey, prev => ({
          ...prev,
          events: [...(prev.events || []), { ...eventWithMode, arrivedAt: Date.now() }],
        }));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        sawErrorEvent = true;
        updateChatRun(runKey, prev => ({
          ...prev,
          streamingText: '',
          events: [...(prev.events || []), { type: 'error', data: { message: err.message } }],
        }));
      }
    } finally {
      if (!controller.signal.aborted && !sawFinalResponse && !sawErrorEvent) {
        updateChatRun(runKey, prev => ({
          ...prev,
          events: [...(prev.events || []), {
            type: 'status',
            data: {
              message: sawDoneWithoutAnswer
                ? 'Agent finished but did not return a final answer.'
                : 'Agent stream ended before a final answer was received.',
            },
          }],
        }));
      }
      if (capturedFinalAnswer) {
        const nextHistory = [
          ...activeConversationHistory,
          { role: 'user', content: submittedGoal, toolsEnabled: effectiveToolsEnabled, agentMentions },
          { role: 'assistant', content: capturedFinalAnswer, toolsEnabled: effectiveToolsEnabled, agentSessionId: runSessionId },
        ];
        const shouldPersistCompactedHistory = nextHistory.some(item => item?.compacted);
        updateChatRun(runKey, { conversationHistory: nextHistory });
        if (runConversationId === currentConversationIdRef.current) {
          setConversationHistory(nextHistory);
        }

        const userMsg = {
          id: `msg_${Date.now()}_user_${Math.random().toString(36).substr(2, 9)}`,
          content: submittedGoal,
          type: 'user',
          timestamp: new Date().toISOString(),
          toolsEnabled: effectiveToolsEnabled,
          agentMentions,
        };
        const runEventsForMsg = runEvents;
        const searchEvent = buildSearchEvent(runEventsForMsg);

        // Patch the last answer event in the live feed with searchEvent so sources show immediately
        if (searchEvent) {
          updateChatRun(runKey, prev => {
            const events = [...(prev.events || [])];
            for (let i = events.length - 1; i >= 0; i--) {
              if (events[i].type === 'answer') {
                events[i] = { ...events[i], data: { ...events[i].data, searchEvent } };
                break;
              }
            }
            return { ...prev, events };
          });
        }

        const assistantMsg = {
          id: `msg_${Date.now()}_assistant_${Math.random().toString(36).substr(2, 9)}`,
          content: capturedFinalAnswer,
          type: 'assistant',
          timestamp: new Date().toISOString(),
          agentSessionId: runSessionId,
          toolsEnabled: effectiveToolsEnabled,
          agentEvents: getPersistableAgentEvents(runEventsForMsg),
          searchEvent,
        };
        const finalMessages = [...runMessages, userMsg, assistantMsg];
        if (runConversationId === currentConversationIdRef.current) {
          setMessages(finalMessages);
        }

        if (!isGhostMode) {
          const saveResult = await saveCurrentConversation({
            messages: finalMessages,
            conversationId: runConversationId,
            metadata: shouldPersistCompactedHistory ? { compactedConversationHistory: nextHistory } : undefined,
          });
          if (!runConversationId && saveResult?.conversationId) {
            setChatRuns(prev => {
              const draftRun = prev[runKey];
              if (!draftRun) return prev;
              const next = {
                ...prev,
                [saveResult.conversationId]: { ...draftRun, running: false, streamingText: '' },
              };
              delete next[runKey];
              return next;
            });
          }
          if (!runConversationId && currentConversationIdRef.current === runConversationId && saveResult?.conversationId) {
            setCurrentConversationId(saveResult.conversationId);
            if (saveResult.title) setConversationTitle(saveResult.title);
            setTimeout(() => triggerConversationRefresh(), 50);
          }
          if (!runConversationId && runMessages.length === 0) {
            chatApi.generateTitle(submittedGoal, capturedFinalAnswer).then(result => {
              if (currentConversationIdRef.current === runConversationId && result?.success && result.title) {
                setConversationTitle(result.title);
              }
            }).catch(() => {});
          }
        }

        if (!effectiveToolsEnabled && isLikelyToolActionRequest(submittedGoal)) {
          updateChatRun(runKey, prev => ({
            ...prev,
            events: [...(prev.events || []), {
              type: 'status',
              data: {
                message: 'Tools were off for this request. Run it again with Tools ON if you want the agent to act.',
                canRetryWithTools: true,
                goal: submittedGoal,
              },
            }],
          }));
        }
      } else if (!controller.signal.aborted && !effectiveToolsEnabled && isLikelyToolActionRequest(submittedGoal)) {
        updateChatRun(runKey, prev => ({
          ...prev,
          events: [...(prev.events || []), {
            type: 'status',
            data: {
              message: 'Tools are off for this request. Turn Tools ON to let the agent act on it.',
              canRetryWithTools: true,
              goal: submittedGoal,
            },
          }],
        }));
      } else if (!controller.signal.aborted && sawErrorEvent) {
        if (runConversationId === currentConversationIdRef.current) {
          setError('Agent run failed');
        }
      }
      updateChatRun(runKey, { streamingText: '', running: false });
      agentAbortControllersRef.current.delete(runKey);
      window.dispatchEvent(new CustomEvent('agent-run-complete'));
    }
  }, [
    agentRunning,
    currentRunKey,
    agentConversationHistory,
    conversationHistory,
    agentCurrentSessionId,
    agentAutoApprove,
    alwaysAllowedTools,
    selectedProfileId,
    toolsEnabled,
    currentConversationId,
    messages,
    isGhostMode,
    generateAndSetTitle,
    setError,
    setConversationHistory,
    setMessages,
    saveCurrentConversation,
    setCurrentConversationId,
    setConversationTitle,
    triggerConversationRefresh,
    updateChatRun,
  ]);

  const handleRetryTool = useCallback((failure) => {
    const tool = failure?.tool || 'tool';
    const args = failure?.args ? JSON.stringify(failure.args) : '{}';
    const error = failure?.result?.error || 'Invalid tool arguments';
    const repairPrompt = failure?.repairPrompt || '';
    const goal = [
      `Retry from the failed ${tool} step in the current run.`,
      `Original goal: ${agentCurrentGoal || 'continue the task'}`,
      `The previous ${tool} call used arguments: ${args}`,
      `It failed before execution with: ${error}`,
      repairPrompt ? `Repair guidance from Asyncat:\n${repairPrompt}` : '',
      'Continue from there and produce the final answer when done.',
    ].filter(Boolean).join('\n\n');
    handleAgentRun({ content: goal });
  }, [agentCurrentGoal, handleAgentRun]);

  const handleQuestionClick = useCallback((questionText) => {
    handleAgentRun({ content: questionText });
  }, [handleAgentRun]);

  const handleRunWithTools = useCallback((goal) => {
    if (!goal?.trim() || agentRunning) return;
    setToolsEnabled(true);
    handleAgentRun({ content: goal }, { enableTools: true });
  }, [agentRunning, handleAgentRun, setToolsEnabled]);

  const handleCompactContext = useCallback(async (reason = 'manual') => {
    const history = agentConversationHistory.length > 0 ? agentConversationHistory : conversationHistory;
    if (isCompactingContext || agentRunning || history.length < 4) return;

    setIsCompactingContext(true);
    try {
      const result = await agentApi.compactConversation({
        conversationHistory: history,
        visibleMessages: messages,
      });
      if (!result?.success || !Array.isArray(result.conversationHistory)) {
        throw new Error(result?.error || 'Compaction failed');
      }
      updateChatRun(currentRunKey, prev => ({
        ...prev,
        conversationHistory: result.conversationHistory,
        events: [
          ...(prev.events || []),
          {
            type: 'status',
            data: {
              message: reason === 'auto'
                ? 'Context was automatically compacted so the conversation can continue.'
                : 'Context compacted. Older turns stay visible, and future prompts use a continuation summary.',
            },
          },
        ],
      }));
      if (currentConversationId === currentConversationIdRef.current) {
        setConversationHistory(result.conversationHistory);
      }
      if (!isGhostMode && currentConversationId) {
        saveCurrentConversation({
          messages,
          conversationId: currentConversationId,
          metadata: { compactedConversationHistory: result.conversationHistory },
        }).catch(() => {});
      }
      setContextInfo(null);
    } catch (err) {
      updateChatRun(currentRunKey, prev => ({
        ...prev,
        events: [...(prev.events || []), { type: 'error', data: { message: err.message || 'Failed to compact context.' } }],
      }));
    } finally {
      setIsCompactingContext(false);
    }
  }, [
    agentConversationHistory,
    agentRunning,
    conversationHistory,
    currentConversationId,
    currentRunKey,
    isCompactingContext,
    isGhostMode,
    messages,
    saveCurrentConversation,
    setConversationHistory,
    updateChatRun,
  ]);

  useEffect(() => {
    const key = `${currentRunKey}:${contextInfo?.inputTokens || 0}`;
    if (
      !contextInfo ||
      contextInfo.percent < 90 ||
      autoCompactRef.current === key ||
      agentRunning ||
      isCompactingContext ||
      contextHistoryForMeter.length < 6
    ) {
      return;
    }
    autoCompactRef.current = key;
    handleCompactContext('auto');
  }, [agentRunning, contextHistoryForMeter.length, contextInfo, currentRunKey, handleCompactContext, isCompactingContext]);

  const handleAgentStop = useCallback(() => {
    const controller = agentAbortControllersRef.current.get(currentRunKey);
    if (!controller) return;
    controller.abort();
    agentAbortControllersRef.current.delete(currentRunKey);
    setCurrentChatRun(prev => ({
      ...prev,
      streamingText: '',
      running: false,
      events: [...(prev.events || []), { type: 'status', data: { message: 'Stopped by user.' } }],
    }));
  }, [currentRunKey, setCurrentChatRun]);

  const handleAgentPermission = useCallback(async (requestId, decision) => {
    if (!requestId) return;

    let resolvedDecision = decision;
    if (decision === 'allow_always') {
      const toolName = agentEvents.find(
        ev => ev.type === 'permission_request' && ev.data?.requestId === requestId
      )?.data?.tool;
      if (toolName) {
        setAlwaysAllowedTools(prev => {
          const next = new Set(prev);
          next.add(toolName);
          try { localStorage.setItem('asyncat_always_allow_tools', JSON.stringify([...next])); } catch {}
          return next;
        });
      }
      resolvedDecision = 'allow_session';
    }

    setCurrentChatRun(prev => ({
      ...prev,
      events: (prev.events || []).map(ev =>
        ev.type === 'permission_request' && ev.data?.requestId === requestId
          ? { ...ev, data: { ...ev.data, resolving: true } } : ev
      ),
    }));
    try {
      await agentApi.respondPermission(requestId, resolvedDecision);
      setCurrentChatRun(prev => ({
        ...prev,
        events: (prev.events || []).map(ev =>
          ev.type === 'permission_request' && ev.data?.requestId === requestId
            ? { ...ev, data: { ...ev.data, resolving: false, resolved: true, decision } } : ev
        ),
      }));
    } catch (err) {
      setCurrentChatRun(prev => ({
        ...prev,
        events: (prev.events || []).map(ev =>
          ev.type === 'permission_request' && ev.data?.requestId === requestId
            ? { ...ev, data: { ...ev.data, resolving: false, resolved: true, decision: 'error', error: err.message } } : ev
        ),
      }));
    }
  }, [agentEvents, setCurrentChatRun]);

  const handleAgentAskUser = useCallback(async (requestId, answer) => {
    if (!requestId) return;
    setCurrentChatRun(prev => ({
      ...prev,
      events: (prev.events || []).map(ev =>
        ev.type === 'ask_user' && ev.data?.requestId === requestId
          ? { ...ev, data: { ...ev.data, answered: true } } : ev
      ),
    }));
    try {
      await agentApi.respondAskUser(requestId, answer);
    } catch (err) {
      console.error('Failed to respond to ask_user:', err);
    }
  }, [setCurrentChatRun]);

  const handleToggleAgentAutoApprove = useCallback(() => {
    setAgentAutoApprove(prev => {
      const next = !prev;
      try { localStorage.setItem('asyncat_agent_auto_approve', String(next)); } catch {}
      return next;
    });
  }, []);

  const handleAgentRename = useCallback(async () => {
    const newGoal = editGoalText.trim();
    if (newGoal && newGoal !== agentCurrentGoal && agentCurrentSessionId) {
      try {
        await agentApi.renameSession(agentCurrentSessionId, newGoal);
        setCurrentChatRun({ goal: newGoal });
        triggerConversationRefresh();
      } catch { /* non-fatal */ }
    }
    setIsEditingGoal(false);
  }, [editGoalText, agentCurrentGoal, agentCurrentSessionId, setCurrentChatRun, triggerConversationRefresh]);

  const handleNewAgentRun = useCallback(() => {
    setCurrentChatRun({
      events: [],
      goal: '',
      session: null,
      conversationHistory: [],
      sessionId: null,
      streamingText: '',
      running: false,
    });
    setIsEditingGoal(false);
  }, [setCurrentChatRun]);

  const handleAgentDelete = useCallback(async () => {
    if (!agentCurrentSessionId) return;
    try {
      await agentApi.deleteSession(agentCurrentSessionId);
      setCurrentChatRun({
        events: [],
        goal: '',
        session: null,
        sessionId: null,
        conversationHistory: [],
        streamingText: '',
        running: false,
      });
      triggerConversationRefresh();
    } catch { /* non-fatal */ }
    setShowDeleteAgentConfirm(false);
  }, [agentCurrentSessionId, setCurrentChatRun, triggerConversationRefresh]);

  const persistedAgentEvents = useMemo(() => {
    if (agentEvents.length > 0) return agentEvents;
    return buildEventsFromMessages(messages);
  }, [agentEvents, messages]);

  const currentPlanEvent = useMemo(() => {
    const lastGoalIndex = persistedAgentEvents.reduce((lastIndex, event, index) => (
      event?.type === 'user_goal' ? index : lastIndex
    ), -1);
    for (let i = persistedAgentEvents.length - 1; i > lastGoalIndex; i--) {
      const event = persistedAgentEvents[i];
      if (event?.type === 'plan_update' && Array.isArray(event.data?.plan) && event.data.plan.length > 0) {
        return event;
      }
    }
    return null;
  }, [persistedAgentEvents]);

  const sourceCatalog = useMemo(
    () => buildConversationSourceCatalog(messages, persistedAgentEvents),
    [messages, persistedAgentEvents],
  );

  const agentActivityItems = useMemo(() => {
    return persistedAgentEvents
      .filter(event => ['thinking', 'tool_start', 'permission_request', 'ask_user', 'answer', 'error', 'status', 'plan_update'].includes(event.type))
      .map((event, index) => {
        const type = event.type;
        const label = type === 'tool_start'
          ? event.data?.tool || 'Tool'
          : type === 'permission_request'
            ? 'Permission'
            : type === 'ask_user'
              ? 'Question'
              : type === 'answer'
                ? 'Answer'
                : type === 'error'
                  ? 'Error'
                  : type === 'thinking'
                    ? 'Reasoning'
                    : type === 'plan_update'
                      ? 'Plan updated'
                      : 'Status';
        const detail = type === 'plan_update'
          ? (() => {
              const plan = Array.isArray(event.data?.plan) ? event.data.plan : [];
              const completed = plan.filter(i => i.status === 'completed').length;
              const inProgress = plan.find(i => i.status === 'in_progress');
              return inProgress
                ? `${completed}/${plan.length} · ${inProgress.activeForm || inProgress.content}`
                : `${completed}/${plan.length} done`;
            })()
          : event.data?.thought || event.data?.description || event.data?.message || event.data?.answer || '';
        const dot = type === 'error'
          ? 'bg-red-400'
          : type === 'answer'
            ? 'bg-emerald-400'
            : type === 'tool_start'
              ? 'bg-blue-400'
              : type === 'plan_update'
                ? 'bg-indigo-400'
                : 'bg-gray-300 dark:bg-gray-600';
        return { id: `${type}_${index}`, label, detail, dot };
      });
  }, [persistedAgentEvents]);

  // Export handlers
  const handleExportMarkdown = useCallback(() => {
    if (!messages.length) return;
    const title = conversationTitle || "Conversation";
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const lines = [
      `# ${title}`,
      `*Exported from Asyncat — ${date}*`,
      "",
      "---",
      "",
    ];

    messages.forEach((msg) => {
      const speaker = msg.type === "user" ? "**You**" : "**The Cat**";
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      lines.push(`### ${speaker}${time ? ` · ${time}` : ""}`);
      lines.push("");
      lines.push(msg.content || "");
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    const markdown = lines.join("\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, conversationTitle]);

  const handleExportHTML = useCallback(() => {
    if (!messages.length) return;
    const title = conversationTitle || "Conversation";
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; line-height: 1.6; }
    h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    .message { margin: 30px 0; padding: 20px; border-radius: 8px; }
    .user { background: #f0f0f0; }
    .assistant { background: #f9f9f9; border-left: 3px solid #4a9eff; }
    .speaker { font-weight: 600; margin-bottom: 10px; color: #111; }
    .time { color: #999; font-size: 13px; margin-left: 8px; }
    .content { white-space: pre-wrap; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">Exported from Asyncat · ${date}</div>
  ${messages
    .map((msg) => {
      const speaker = msg.type === "user" ? "You" : "The Cat";
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      return `
      <div class="message ${msg.type}">
        <div class="speaker">${speaker}${time ? `<span class="time">${time}</span>` : ""}</div>
        <div class="content">${msg.content || ""}</div>
      </div>
    `;
    })
    .join("")}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, conversationTitle]);

  const handleExportJSON = useCallback(() => {
    if (!messages.length) return;
    const title = conversationTitle || "Conversation";
    const exportData = {
      title,
      exportDate: new Date().toISOString(),
      messages: messages.map((msg) => ({
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        projectIds: msg.projectIds || [],
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, conversationTitle]);

  const handleExportPDF = useCallback(() => {
    if (!messages.length) return;
    window.print();
  }, [messages]);

  const ConversationLoadingSkeleton = () => (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      <div className="flex-shrink-0hite dark:bg-gray-900 midnight:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-48"></div>
            <div className="flex items-center gap-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-16"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-8">
          <div className="group mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-12 animate-pulse"></div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 midnight:bg-slate-950 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg p-4">
              <div className="space-y-3">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-3/4 animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-1/2 animate-pulse"></div>
              </div>
            </div>
          </div>

          <div className="group mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-16 animate-pulse"></div>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full animate-bounce bg-gray-400"></div>
                <div
                  className="w-2 h-2 rounded-full animate-bounce bg-gray-400"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 rounded-full animate-bounce bg-gray-400"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 midnight:bg-slate-950 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg p-4">
              <div className="space-y-3">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-full animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-4/5 animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-3/4 animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-5/6 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const CATEGORIES = [
    {
      id: "plan",
      icon: LayoutList,
      label: "Plan",
      prompts: [
        {
          label: "Plan my day",
          prompt: `Review my tasks and calendar events for today. Suggest a prioritized schedule based on urgency and help me decide what to focus on first.`,
        },
        {
          label: "Quick task creation",
          prompt: `Create a high priority task called 'Weekly Review' and set the deadline for this Friday. Ask me which project it belongs to if you need to.`,
        },
        {
          label: "Status report",
          prompt: `Check all my projects for overdue tasks and group them by priority. What should I tackle immediately?`,
        },
        {
          label: "Reschedule my workload",
          prompt: `Look at my tasks due this week and suggest a better distribution based on my upcoming calendar events.`,
        },
        {
          label: "Turn a goal into tasks",
          prompt: `I have a large goal I want to achieve. Help me break it down into actionable steps, and then automatically create those tasks in my workspace.`,
        },
      ],
    },
    {
      id: "learn",
      icon: BookOpen,
      label: "Learn",
      prompts: [
        {
          label: "Explain something simply",
          prompt: `I want to understand a complex topic. Ask me what I am struggling with, then explain it in plain language without jargon, using an analogy.`,
        },
        {
          label: "Save a study note",
          prompt: `Explain the key principles of a technical concept I'm learning, and automatically save the explanation as a new note in my workspace for future reference.`,
        },
        {
          label: "Quiz me",
          prompt: `I want to test my knowledge. Ask me what topic to quiz me on and my current level, then give me 5 questions one at a time.`,
        },
        {
          label: "Summarise my notes",
          prompt: `Search my existing notes in the workspace for a specific topic, pull out the key points, and give me a clean, structured summary.`,
        },
        {
          label: "Track my learning",
          prompt: `Create a series of tasks for learning a new skill over the next month, broken down week by week, and add them to my workspace.`,
        },
      ],
    },
    {
      id: "write",
      icon: PenLine,
      label: "Write",
      prompts: [
        {
          label: "Take meeting minutes",
          prompt: `Help me write meeting minutes. I'll provide the rough points. Create a well-formatted note with the summary, and ask if you should automatically create tasks for any action items.`,
        },
        {
          label: "Draft a project update",
          prompt: `Look at the tasks I've completed recently and help me draft a professional progress update to share with my team.`,
        },
        {
          label: "Save a quick idea",
          prompt: `I have an idea I want to flesh out. Ask me for the premise, help me brainstorm 5 bullet points to expand on it, and save it all as a new note.`,
        },
        {
          label: "Write a lesson plan",
          prompt: `Help me write a structured lesson or presentation plan. Ask me the topic and audience, then create the plan and save it as a document in my notes.`,
        },
        {
          label: "Draft a team message",
          prompt: `I need to send an important message to my team. Ask me the details and the tone, and draft it for me.`,
        },
      ],
    },
    {
      id: "schedule",
      icon: Calendar,
      label: "Schedule",
      prompts: [
        {
          label: "Schedule a meeting",
          prompt: `Create a 'Team Sync' calendar event for tomorrow at 10 AM for 45 minutes.`,
        },
        {
          label: "Weekly review",
          prompt: `Summarize all my calendar events and upcoming task deadlines for this week so I know exactly what's on my plate.`,
        },
        {
          label: "Plan focus time",
          prompt: `Find a 2-hour gap in my calendar this week where I don't have events, and schedule a 'Deep Work Focus Time' event for me.`,
        },
        {
          label: "Check for conflicts",
          prompt: `Look at my upcoming events and tasks this week. Tell me if any deadlines overlap with heavy meeting days, and suggest how I could rearrange things.`,
        },
        {
          label: "Assign deadlines",
          prompt: `Search my projects for high-priority tasks that don't have due dates yet, and suggest when I should schedule them based on my calendar.`,
        },
      ],
    },
    {
      id: "think",
      icon: Lightbulb,
      label: "Brainstorm",
      prompts: [
        {
          label: "Brainstorm ideas",
          prompt: `I want to brainstorm ideas for a project. Ask me for the topic, give me a range of creative options, and offer to turn the best ones into tasks or notes.`,
        },
        {
          label: "Help me decide",
          prompt: `I need help making a decision. Ask me what the decision is, then walk me through the pros and cons to help me figure out the best path.`,
        },
        {
          label: "Review my plan",
          prompt: `Look at the current tasks in my projects. Are there any critical steps missing? Tell me what looks solid and what is risky.`,
        },
        {
          label: "Suggest improvements",
          prompt: `I want to improve my workflow. Analyze my overdue tasks and suggest concrete ways I can manage my time or projects better.`,
        },
        {
          label: "Troubleshoot a problem",
          prompt: `I'm stuck on a problem and need a sounding board. Ask me to describe it, and let's work through potential solutions step-by-step.`,
        },
      ],
    },
  ];

  const [activeCategory, setActiveCategory] = useState(null);

  const TopBar = isGhostMode ? (
    <div className="flex items-center justify-end px-4 py-2">
      <button
        onClick={toggleGhostMode}
        className="p-1.5 rounded-lg transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50"
        title="Exit Ghost Mode"
      >
        <Ghost className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>
    </div>
  ) : null;

  if (!commandCenterContext) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-200 dark:border-indigo-800 midnight:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 midnight:border-t-indigo-300 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400">
            Initializing Command Center...
          </p>
        </div>
      </div>
    );
  }

  const firstName = userName ? userName.split(" ")[0] : "there";
  const hour = new Date().getHours();
  const getGreeting = () => {
    if (isGhostMode) return `Ghost Mode, ${firstName}! Very sneaky.`;
    if (hour >= 4 && hour < 6)
      return `Early bird, ${firstName}! Or just couldn't sleep?`;
    if (hour >= 6 && hour < 12) return `Morning, ${firstName}! Coffee first?`;
    if (hour >= 12 && hour < 14)
      return `Afternoon, ${firstName}! Productive lunch break?`;
    if (hour >= 14 && hour < 17) return `Hey ${firstName}! Avoiding meetings?`;
    if (hour >= 17 && hour < 20) return `Evening, ${firstName}! Still here?`;
    if (hour >= 20 && hour < 23)
      return `Night owl, ${firstName}! Netflix broken?`;
    return `Midnight warrior, ${firstName}! Sleep is optional.`;
  };
  const hasConversationContent = messages.length > 0 || persistedAgentEvents.length > 0 || agentRunning;

  const welcomeScreenJSX =
    !hasConversationContent ? (
      <div className="flex flex-col min-h-full relative">
        {!isGhostMode && (
          <div className="absolute right-4 top-4 z-10">
            <ConversationSwitcher compact />
          </div>
        )}
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-8">
          <div className="max-w-3xl w-full">
            <div className="flex flex-col items-center gap-3 mb-6 text-center">
              <img src="/cat.svg" alt="The Cat" className="w-10 h-10" />
              <h1 className="text-xl font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                {getGreeting()}
              </h1>
            </div>

            {isGhostMode && (
              <div className="flex justify-center mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-full text-sm font-medium">
                  <Ghost className="w-3 h-3" />
                  Ghost Active — No history saved
                </div>
              </div>
            )}

            <MessageInputV2
              onSubmit={handleAgentRun}
              disabled={isProcessing || agentRunning}
              autoFocus={true}
              placeholder={
                isGhostMode
                  ? "👻 Ghost Mode — messages won't be saved..."
                  : "Ask anything, or create tasks, events, notes..."
              }
              hasMessages={hasConversationContent}
              conversationTokens={conversationTokens}
              contextInfo={contextInfo}
              contextLoading={contextLoading}
              contextError={contextError}
              onCompactContext={handleCompactContext}
              isCompacting={isCompactingContext}
              onDraftChange={setDraftGoal}
              toolsEnabled={toolsEnabled}
              onToggleTools={() => setToolsEnabled(!toolsEnabled)}
              autoApprove={agentAutoApprove}
              onToggleAutoApprove={handleToggleAgentAutoApprove}
            />

            {!isGhostMode && (
              <div className="mt-4 px-4 sm:px-6">
                <div className="flex gap-2 flex-wrap justify-center mb-3">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() =>
                          setActiveCategory(isActive ? null : cat.id)
                        }
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all duration-150
                          ${
                            isActive
                              ? "border-gray-400 dark:border-gray-500 midnight:border-slate-500 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 text-gray-900 dark:text-white midnight:text-slate-100"
                              : "border-gray-200 dark:border-gray-800 midnight:border-slate-800 text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:border-gray-300 dark:hover:border-gray-700 midnight:hover:border-slate-700 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-slate-300"
                          }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {activeCategory &&
                  (() => {
                    const cat = CATEGORIES.find((c) => c.id === activeCategory);
                    return (
                      <div className="flex flex-col border border-gray-200 dark:border-gray-800 midnight:border-slate-800 rounded-xl overflow-hidden">
                        {cat.prompts.map((p, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              handleQuestionClick(p.prompt);
                              setActiveCategory(null);
                            }}
                            className={`px-4 py-2.5 text-sm text-left text-gray-600 dark:text-gray-400 midnight:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 midnight:hover:bg-slate-800/40 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-slate-200 transition-colors duration-100
                            ${i < cat.prompts.length - 1 ? "border-b border-gray-100 dark:border-gray-800/80 midnight:border-slate-800/80" : ""}`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  // Chat Layout
  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-gray-900 midnight:bg-slate-950">
      <div className="flex min-h-0 flex-1 min-w-0 flex-col h-full transition-all duration-300">
        {TopBar}
        {isConversationLoading ? (
          <ConversationLoadingSkeleton />
        ) : !hasConversationContent ? (
          welcomeScreenJSX
        ) : (
          <>
            <div className="shrink-0 bg-white dark:bg-gray-900 midnight:bg-slate-950">
              <div className="max-w-5xl mx-auto px-4 md:px-8 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700" />

                    <div className="flex items-center gap-2">
                      {currentConversationId &&
                      conversationTitle &&
                      !isEditingTitle ? (
                        <button
                          onClick={handleStartRename}
                          className="group flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors cursor-text text-left"
                          title="Click to rename"
                        >
                          <span className="max-w-xs truncate">
                            {conversationTitle}
                          </span>
                          <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                        </button>
                      ) : (
                        <h1 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 max-w-xs truncate">
                          {conversationTitle || "Untitled Chat"}
                        </h1>
                      )}

                      {isGhostMode && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-600 dark:text-gray-300 midnight:text-gray-300 rounded text-xs font-medium">
                          <Ghost className="w-3 h-3" />
                          Ghost
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {!isGhostMode && (
                      <>
                        <button
                          type="button"
                          onClick={handleStartNewConversation}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                          title="Start new conversation"
                        >
                          <Plus className="h-4 w-4" />
                          New
                        </button>
                        <ConversationSwitcher />
                      </>
                    )}

                    {sourceCatalog.totalCount > 0 && !showSourcesMediaSidebar && (
                      <button
                        type="button"
                        onClick={() => setShowSourcesMediaSidebar(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800"
                        title="Show all sources and media"
                      >
                        <Image className="h-4 w-4" />
                        Media
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {sourceCatalog.totalCount}
                        </span>
                      </button>
                    )}

                    {(persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && !showActivitySidebar && (
                      <button
                        type="button"
                        onClick={() => handleSetActivitySidebarVisible(true)}
                        className="hidden xl:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800"
                        title="Show steps"
                      >
                        <PanelRightOpen className="h-4 w-4" />
                        Steps
                      </button>
                    )}

                    {hasConversationContent && (
                      <div className="relative">
                        <button
                          onClick={() => setShowExportMenu((v) => !v)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded transition-colors"
                          title="Export conversation"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {showExportMenu && (
                          <div className="absolute right-0 top-full mt-1.5 z-50 w-40 bg-white dark:bg-gray-900 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg shadow-xl overflow-hidden">
                            <button
                              onClick={() => {
                                handleExportMarkdown();
                                setShowExportMenu(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                              Markdown (.md)
                            </button>
                            <button
                              onClick={() => {
                                handleExportHTML();
                                setShowExportMenu(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                              HTML (.html)
                            </button>
                            <button
                              onClick={() => {
                                handleExportJSON();
                                setShowExportMenu(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                              JSON (.json)
                            </button>
                            <button
                              onClick={() => {
                                handleExportPDF();
                                setShowExportMenu(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                              PDF (print)
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isGhostMode && (
                      <button
                        onClick={toggleGhostMode}
                        className="p-2 rounded-lg transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50"
                        title="Exit Incognito Mode"
                      >
                        <Ghost className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
                      </button>
                    )}

                    {currentConversationId &&
                      conversationTitle && (
                        <div className="flex items-center gap-1">
                          {isEditingTitle ? (
                            <>
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={handleSaveRename}
                                className="text-sm bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-300 dark:border-gray-600 midnight:border-slate-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-55 max-w-[320px]"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveRename}
                                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                title="Save (Enter)"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelRename}
                                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
                                title="Cancel (Esc)"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setShowDeleteConfirm(true)}
                              className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
                              title="Delete conversation"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                  </div>
                </div>
                {agentTaskRun && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 px-3.5 py-3 dark:border-gray-700 dark:bg-gray-800/50 midnight:border-slate-700 midnight:bg-slate-900/50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-300">
                          {agentTaskRun.needsInput || agentTaskRun.displayStatus === 'needs_input'
                            ? <AlertCircle className="h-4 w-4 text-amber-500" />
                            : <Bot className="h-4 w-4" />
                          }
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                              Task agent run
                            </span>
                            <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${agentTaskRunStatus.className}`}>
                              {agentTaskRunStatus.label}
                            </span>
                            {agentTaskRun.profileName && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {agentTaskRun.profileIcon || ''} {agentTaskRun.profileName}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {agentTaskRun.cardTitle || 'Untitled task'}
                            </span>
                            {agentTaskRun.projectName && (
                              <>
                                <span>·</span>
                                <span>{agentTaskRun.projectName}</span>
                              </>
                            )}
                            {agentTaskRun.activity && (
                              <>
                                <span>·</span>
                                <span>{agentTaskRun.activity}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {agentTaskRun.projectId && (
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${agentTaskRun.projectId}/list`)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Task list
                          </button>
                        )}
                      </div>
                    </div>
                    {(agentTaskRun.needsInput || agentTaskRun.displayStatus === 'needs_input') && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        Reply below to give this task agent the missing details, then it will continue this task session.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden relative">
              <div
                ref={scrollContainerRef}
                className="h-full min-h-0 overflow-y-auto relative"
                style={{ maxHeight: '100%' }}
              >
                <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-12 min-h-full">
                  <AgentRunFeed
                    events={persistedAgentEvents}
                    isRunning={agentRunning}
                    streamingText={agentStreamingText}
                    runStartedAt={runStartedAtRef.current}
                    onPermissionDecision={handleAgentPermission}
                    onAskUserAnswer={handleAgentAskUser}
                    onRetryTool={handleRetryTool}
                    onRunWithTools={handleRunWithTools}
                  />
                  {!agentRunning && (
                    <>
                      <AgentChangesPanel
                        events={persistedAgentEvents}
                        sessionId={agentCurrentSessionId}
                        session={agentCurrentSession}
                      />
                    </>
                  )}
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </div>
            </div>

            <div className="shrink-0">
              {currentPlanEvent && (
                <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-3">
                  <CurrentPlanPanel
                    data={currentPlanEvent.data}
                    isRunning={agentRunning}
                  />
                </div>
              )}
              <MessageInputV2
                onSubmit={handleAgentRun}
                disabled={isProcessing || agentRunning}
                autoFocus={!isProcessing && !agentRunning}
                onReset={handleClearConversation}
                placeholder={
                  agentTaskRun
                    ? `Reply to the task agent about "${agentTaskRun.cardTitle || 'this task'}"...`
                    : isGhostMode
                    ? "👻 Ghost Mode - Messages won't be saved..."
                    : "Ask anything..."
                }
                hasMessages={hasConversationContent}
                conversationTokens={conversationTokens}
                contextInfo={contextInfo}
                contextLoading={contextLoading}
                contextError={contextError}
                onCompactContext={handleCompactContext}
                isCompacting={isCompactingContext}
                onDraftChange={setDraftGoal}
                toolsEnabled={toolsEnabled}
                onToggleTools={() => setToolsEnabled(!toolsEnabled)}
                autoApprove={agentAutoApprove}
                onToggleAutoApprove={handleToggleAgentAutoApprove}
                isRunning={agentRunning}
                onStop={handleAgentStop}
                runStartedAt={runStartedAtRef.current}
              />
            </div>
          </>
        )}
      </div>

      {sourceCatalog.totalCount > 0 && showSourcesMediaSidebar && (
        <aside className="hidden xl:block w-80 shrink-0 border-l border-gray-200 bg-gray-50/30 dark:border-gray-700 dark:bg-gray-900/30 midnight:border-slate-700 midnight:bg-slate-950/30">
          <ChatSourcesMediaSidebar
            catalog={sourceCatalog}
            onClose={() => setShowSourcesMediaSidebar(false)}
          />
        </aside>
      )}

      {!showSourcesMediaSidebar && (persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && showActivitySidebar && (
        <aside className="hidden xl:block w-60 shrink-0 border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50/30 dark:bg-gray-900/30 midnight:bg-slate-950/30">
          <AgentActivitySidebar
            items={agentActivityItems}
            isLoading={agentLoadingSession}
            isRunning={agentRunning}
            onClose={() => handleSetActivitySidebarVisible(false)}
          />
        </aside>
      )}

      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConversation}
        title={conversationTitle}
      />

      <DeleteConfirmationModal
        isOpen={showDeleteAgentConfirm}
        onClose={() => setShowDeleteAgentConfirm(false)}
        onConfirm={handleAgentDelete}
        title={agentCurrentGoal}
      />

    </div>
  );
};

export default CommandCenterV2Enhanced;
