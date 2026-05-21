// CommandCenterV2Enhanced.jsx — Unified agent interface (Plan = safe inspection, Action = execution)

import {
  buildAgentEventsFromSession,
  isLikelyToolActionRequest,
  getLeadingProfileMention,
  buildEventsFromMessages,
  getPersistableAgentEvents,
  buildSearchEvent,
} from "./utils/agentEventUtils.js";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { MessageInputV2 } from "./components/input/MessageInputV2";
import AgentRunFeed, { CurrentPlanPanel, extractLocalhostUrl, buildEventSegments } from './components/agent/AgentRunFeed';
import CommandCenterSidePanel from './components/sidebars/CommandCenterSidePanel';
import ChatFloatingNav from './components/nav/ChatFloatingNav';
import ConversationLoadingSkeleton from './components/loading/ConversationLoadingSkeleton';
import DeleteConfirmationModal from "./components/modals/DeleteConfirmationModal";
import { useAudioStatus } from "./hooks/useAudioStatus";
import { useAgentNotifications } from './hooks/useAgentNotifications';
import { useCommandCenter } from "./context/CommandCenterContextEnhanced";
import { chatApi, agentApi, gitApi } from "./api";
import { audioApi } from "../Settings/settingApi.js";
import { cleanReasoningAnswer } from "./utils/reasoningParser.js";
import { useUser } from "../contexts/UserContext";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Code2,
  Edit2,
  Trash2,
  Check,
  X,
  Ghost,
  Download,
  Loader2,
  History,
  Plus,
  MessageSquare,
  PanelRightOpen,
  Image,
  GitBranch,
  BookMarked,
  FilePlus,
  Headphones,
  Sparkles,
  Globe,
  List,
} from "lucide-react";

import {
  getRelativeConversationTime,
  getTaskRunDisplayStatus,
  getSourceDomain,
  buildConversationSourceCatalog,
} from "./utils/conversationUtils.js";
import {
  escapeExportHtml,
  stringifyExportValue,
  sanitizeExportFilename,
  formatExportTime,
  triggerExportDownload,
  buildConversationExportEntries,
  buildExportHtmlDocument,
} from "./utils/exportUtils.js";

const EMPTY_AGENT_EVENTS = [];

function getVoicePlaceholder(sttReady, ttsReady, fallback) {
  if (sttReady && ttsReady) {
    return "Full voice active - click the mic to speak, and replies will play aloud...";
  }
  if (sttReady) {
    return "Speech input active - click the mic to dictate, then send your message...";
  }
  if (ttsReady) {
    return "Speech output active - type a message and play replies aloud...";
  }
  return fallback;
}

function getArtifactIdentity(artifact = {}) {
  return artifact.noteId
    ? `note:${artifact.noteId}`
    : artifact.filename
      ? `file:${artifact.filename}`
      : artifact.path
        ? `path:${artifact.path}`
        : `${artifact.type || artifact.originalType || 'artifact'}:${artifact.title || artifact.name || 'untitled'}`;
}

function collectArtifactsFromEvents(events = []) {
  const artifactsByKey = new Map();
  events.forEach((event, index) => {
    const artifact = event?.result?.artifact;
    if (!artifact) return;
    const key = getArtifactIdentity(artifact);
    artifactsByKey.set(key, {
      ...artifact,
      _artifactKey: key,
      _artifactIndex: index,
    });
  });
  return [...artifactsByKey.values()].sort((a, b) => (a._artifactIndex || 0) - (b._artifactIndex || 0));
}

function createConversationBranchId() {
  return `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getMessageBranchId(message, fallback = 'main') {
  return message?.branchId || fallback;
}

function buildConversationHistoryFromMessages(messages = []) {
  return messages
    .filter(msg => msg?.type === 'user' || msg?.type === 'assistant')
    .map(msg => ({
      role: msg.type,
      content: msg.content,
      toolsEnabled: msg.toolsEnabled,
      agentMode: msg.agentMode,
      reasoningEffort: msg.reasoningEffort,
      agentSessionId: msg.agentSessionId,
      agentMentions: msg.agentMentions,
      fileAttachments: msg.fileAttachments,
      workingContext: msg.workingContext,
      branchId: msg.branchId,
      parentBranchId: msg.parentBranchId,
      branchPointMessageId: msg.branchPointMessageId,
    }));
}

function summarizeBranch(messages = []) {
  const lastUser = [...messages].reverse().find(msg => msg?.type === 'user' && msg.content?.trim());
  const firstUser = messages.find(msg => msg?.type === 'user' && msg.content?.trim());
  const text = (lastUser || firstUser)?.content || 'Conversation branch';
  return text.split('\n').find(Boolean)?.trim()?.slice(0, 72) || 'Conversation branch';
}

function upsertBranchSnapshot(branches = [], snapshot) {
  if (!snapshot?.id) return branches;
  const cleaned = {
    ...snapshot,
    messages: Array.isArray(snapshot.messages) ? snapshot.messages : [],
    updatedAt: new Date().toISOString(),
  };
  const index = branches.findIndex(branch => branch.id === cleaned.id);
  if (index === -1) return [...branches, cleaned];
  return branches.map((branch, i) => i === index ? { ...branch, ...cleaned } : branch);
}

function buildAssistantVariant(message = {}) {
  return {
    id: message.variantId || `variant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content: message.content || '',
    timestamp: message.timestamp || new Date().toISOString(),
    agentSessionId: message.agentSessionId || null,
    agentEvents: message.agentEvents || [],
    searchEvent: message.searchEvent || null,
    toolsEnabled: message.toolsEnabled,
    agentMode: message.agentMode,
    reasoningEffort: message.reasoningEffort,
  };
}

function buildConversationHighlights(messages = []) {
  const toItem = (msg) => ({
    id: msg.id,
    type: msg.type || msg.role,
    content: msg.content || '',
    timestamp: msg.timestamp,
    bookmarked: Boolean(msg.bookmarked),
  });
  return {
    pinnedMessages: [],
    bookmarkedMessages: messages.filter(msg => msg?.bookmarked).map(toItem),
  };
}

// ── Skill-learned toast ───────────────────────────────────────────────────────

function SkillLearnedToast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div
      className="fixed bottom-20 left-1/2 z-[200] -translate-x-1/2 animate-in fade-in zoom-in-95 duration-200"
      style={{ maxWidth: '22rem', width: 'max-content' }}
    >
      <div
        className="flex items-start gap-3 rounded-2xl border border-emerald-200/60 bg-white/90 px-4 py-3 shadow-xl backdrop-blur-sm dark:border-emerald-800/40 dark:bg-gray-900/90 midnight:border-emerald-800/30 midnight:bg-slate-900/90"
        style={{ boxShadow: '0 8px 32px -4px rgba(16,185,129,0.15), 0 2px 8px -2px rgba(0,0,0,0.12)' }}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Skill learned</p>
          <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">{toast.name}</p>
          {toast.summary && (
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">{toast.summary}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const CommandCenterV2Enhanced = ({ initialMode = 'chat', agentSessionId = null }) => {
  const commandCenterContext = useCommandCenter();
  const navigate = useNavigate();
  const { userName } = useUser();
  const fallbackAgentAbortControllersRef = useRef(new Map());
  const fallbackRunStartedAtRef = useRef(null);
  const fallbackCurrentConversationIdRef = useRef(null);

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
    chatRuns = {},
    updateChatRun = () => {},
    activeConversationIds = new Set(),
    hasActiveRuns = false,
    agentAbortControllersRef = fallbackAgentAbortControllersRef,
    runStartedAtRef = fallbackRunStartedAtRef,
    currentConversationIdRef = fallbackCurrentConversationIdRef,
    workingContext = null,
    setWorkingContext = () => {},
    conversationMetadata = {},
    setConversationMetadata = () => {},
  } = commandCenterContext || {};

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  const exportMenuRef = useRef(null);
  const branchMenuRef = useRef(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [branchNameDraft, setBranchNameDraft] = useState('');

  const [messageInputResetKey, setMessageInputResetKey] = useState(0);
  const [recentConversations, setRecentConversations] = useState([]);
  const [recentConversationsLoading, setRecentConversationsLoading] = useState(false);
  const [recentConversationsError, setRecentConversationsError] = useState(null);
  const [showActivitySidebar, setShowActivitySidebar] = useState(() => {
    try {
      return localStorage.getItem('asyncat_show_command_side_panel') === 'true';
    } catch {
      return false;
    }
  });
  const [sidePanelTab, setSidePanelTab] = useState('steps');
  const [prevSidePanelTab, setPrevSidePanelTab] = useState('steps');
  const [sidePanelWidth, setSidePanelWidth] = useState(384);
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const panelDragRef = useRef({ active: false, startX: 0, startW: 0 });
  const [gitState, setGitState] = useState(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState(null);
  const [externalFileAttachment, setExternalFileAttachment] = useState(null);
  const [multimodalCapabilities, setMultimodalCapabilities] = useState(null);
  const [agentAutoApprove, setAgentAutoApprove] = useState(() => {
    try {
      return localStorage.getItem('asyncat_agent_auto_approve') === 'true';
    } catch {
      return false;
    }
  });
  const [reasoningEffort, setReasoningEffort] = useState(() => {
    try {
      return localStorage.getItem('asyncat_reasoning_effort') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const { ttsReady, sttReady } = useAudioStatus();
  const [voiceMode, setVoiceMode] = useState(() => {
    try { return localStorage.getItem('asyncat_voice_mode') === 'true'; }
    catch { return false; }
  });
  const chatOnlyMode = workingContext?.rootId === 'none' || workingContext?.noWorkspace === true;
  const voiceConversationActive = voiceMode && sttReady && ttsReady;
  const voiceAudioRef = useRef(null);
  const [voiceModeTtsState, setVoiceModeTtsState] = useState('idle'); // idle | loading | playing
  const [autoRecordAfterTts, setAutoRecordAfterTts] = useState(false);
  const [alwaysAllowedTools, setAlwaysAllowedTools] = useState(() => {
    try {
      const stored = localStorage.getItem('asyncat_always_allow_tools');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [enabledIntegrationTools, setEnabledIntegrationTools] = useState(() => {
    try {
      const stored = localStorage.getItem('asyncat_enabled_integration_tools');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [agentLoadingSession, setAgentLoadingSession] = useState(false);
  const [editGoalText, setEditGoalText] = useState('');
  const [showDeleteAgentConfirm, setShowDeleteAgentConfirm] = useState(false);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  // Skill-learned toast
  const [skillToast, setSkillToast] = useState(null);
  const skillToastTimerRef = useRef(null);
  // Brain stats (welcome screen ambient indicator)
  const [brainStats, setBrainStats] = useState(null);
  const currentRunKey = currentConversationId || '__draft__';
  const currentRun = chatRuns[currentRunKey] || {};
  const agentMode = toolsEnabled ? 'action' : 'plan';
  const agentRunning = Boolean(currentRun.running);
  const agentEvents = currentRun.events || EMPTY_AGENT_EVENTS;
  const agentCurrentGoal = currentRun.goal || '';
  const agentCurrentSessionId = currentRun.sessionId || null;
  const agentCurrentSession = currentRun.session || null;
  const agentTaskRun = agentCurrentSession?.taskRun || null;
  const agentTaskRunStatus = getTaskRunDisplayStatus(agentTaskRun);
  const agentConversationHistory = currentRun.conversationHistory || [];
  const agentStreamingText = currentRun.streamingText || '';
  // Extract latest token usage for the input toolbar
  const latestTokenUsage = useMemo(() => {
    for (let i = agentEvents.length - 1; i >= 0; i--) {
      if (agentEvents[i]?.type === 'usage_update') return agentEvents[i].data;
    }
    return null;
  }, [agentEvents]);
  const latestAnswer = useMemo(() => {
    for (let i = agentEvents.length - 1; i >= 0; i--) {
      if (agentEvents[i]?.type === 'answer' && agentEvents[i].data?.answer) return agentEvents[i].data.answer;
    }
    return null;
  }, [agentEvents]);
  const latestAskUser = useMemo(() => {
    for (let i = agentEvents.length - 1; i >= 0; i--) {
      if (agentEvents[i]?.type === 'ask_user') return agentEvents[i].data;
    }
    return null;
  }, [agentEvents]);
  const latestPermissionRequest = useMemo(() => {
    for (let i = agentEvents.length - 1; i >= 0; i--) {
      if (agentEvents[i]?.type === 'permission_request') return agentEvents[i].data;
    }
    return null;
  }, [agentEvents]);
  useAgentNotifications({
    isRunning: agentRunning,
    lastAnswer: latestAnswer,
    lastAskUser: latestAskUser,
    lastPermissionRequest: latestPermissionRequest,
    conversationTitle,
  });
  const setCurrentChatRun = useCallback((updater) => {
    updateChatRun(currentRunKey, updater);
  }, [currentRunKey, updateChatRun]);

  useEffect(() => {
    let cancelled = false;
    const loadCapabilities = () => {
      agentApi.getMultimodalCapabilities()
        .then(res => {
          if (!cancelled) setMultimodalCapabilities(res.capabilities || null);
        })
        .catch(() => {
          if (!cancelled) setMultimodalCapabilities(null);
        });
    };
    loadCapabilities();
    const interval = setInterval(loadCapabilities, 30000);
    window.addEventListener('asyncat-visual-models-updated', loadCapabilities);
    window.addEventListener('asyncat-audio-models-updated', loadCapabilities);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('asyncat-visual-models-updated', loadCapabilities);
      window.removeEventListener('asyncat-audio-models-updated', loadCapabilities);
    };
  }, []);

  // Brain stats — fetch counts, refresh after each run completes
  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      agentApi.getBrainStats()
        .then(res => { if (!cancelled && res?.success) setBrainStats(res); })
        .catch(() => {});
    };
    fetchStats();
    const handler = () => { if (!cancelled) fetchStats(); };
    window.addEventListener('agent-run-complete', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('agent-run-complete', handler);
    };
  }, []);

  // Clean up skill toast timer on unmount
  useEffect(() => {
    return () => {
      if (skillToastTimerRef.current) clearTimeout(skillToastTimerRef.current);
    };
  }, []);

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

  const handleOpenSavedMessage = useCallback((messageId) => {
    if (!messageId || !scrollContainerRef.current) return;
    const selector = typeof CSS !== 'undefined' && CSS.escape
      ? `[data-message-id="${CSS.escape(messageId)}"]`
      : `[data-message-id="${String(messageId).replace(/"/g, '\\"')}"]`;
    const target = scrollContainerRef.current.querySelector(selector);
    if (!target) return;

    setHighlightedMessageId(messageId);
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (window.innerWidth < 1280) {
      setShowActivitySidebar(false);
    }
    window.setTimeout(() => {
      setHighlightedMessageId(current => (current === messageId ? null : current));
    }, 1800);
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
      if (!exportMenuRef.current?.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  useEffect(() => {
    if (!showBranchMenu) return;
    const handler = (e) => {
      if (!branchMenuRef.current?.contains(e.target)) {
        setShowBranchMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBranchMenu]);

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
    if (showActivitySidebar && sidePanelTab === 'history') loadRecentConversations();
  }, [showActivitySidebar, sidePanelTab, loadRecentConversations]);



  const handleStartNewConversation = useCallback(async () => {
    setShowActivitySidebar(false);
    setSidePanelTab('steps');
    setSelectedArtifact(null);
    setMessageInputResetKey(prev => prev + 1);
    navigate('/home');
    await handleNewConversation();
  }, [handleNewConversation, navigate]);

  const handleOpenConversation = useCallback((conversationId) => {
    if (!conversationId) return;

    setMessageInputResetKey(prev => prev + 1);
    navigate(`/conversations/${conversationId}`);
  }, [navigate]);

  const refreshGitState = useCallback(async () => {
    setGitLoading(true);
    setGitError(null);
    try {
      const res = await gitApi.getState({ path: workingContext?.workingDir || null });
      setGitState(res);
    } catch (error) {
      setGitError(error.message || 'Could not load Git state');
      setGitState(null);
    } finally {
      setGitLoading(false);
    }
  }, [workingContext?.workingDir]);

  useEffect(() => {
    refreshGitState();
  }, [refreshGitState]);

  useEffect(() => {
    const handler = () => refreshGitState();
    window.addEventListener('agent-run-complete', handler);
    return () => window.removeEventListener('agent-run-complete', handler);
  }, [refreshGitState]);

  const toggleSidePanelTab = useCallback((tab) => {
    setShowActivitySidebar(prev => {
      const shouldClose = prev && sidePanelTab === tab;
      const next = !shouldClose;
      if (next) setSidePanelTab(tab);
      try { localStorage.setItem('asyncat_show_command_side_panel', String(next)); } catch { /* localStorage may be unavailable */ }
      return next;
    });
  }, [sidePanelTab]);

  // Drag-to-resize side panel
  useEffect(() => {
    const onMove = (e) => {
      const d = panelDragRef.current;
      if (!d.active) return;
      const dx = d.startX - e.clientX;
      const w = Math.max(280, Math.min(window.innerWidth * 0.5, d.startW + dx));
      setSidePanelWidth(w);
    };
    const onUp = () => { panelDragRef.current.active = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const handlePanelDragStart = useCallback((e) => {
    panelDragRef.current = { active: true, startX: e.clientX, startW: sidePanelWidth };
    e.preventDefault();
  }, [sidePanelWidth]);

  const handleViewArtifactInPanel = useCallback((artifact) => {
    setSelectedArtifact(artifact);
    setShowActivitySidebar(true);
    setPrevSidePanelTab(sidePanelTab === 'artifact' ? prevSidePanelTab : sidePanelTab);
    setSidePanelTab('artifact');
    try { localStorage.setItem('asyncat_show_command_side_panel', 'true'); } catch { /* noop */ }
  }, [prevSidePanelTab, sidePanelTab]);

  const handleArtifactPanelBack = useCallback(() => {
    setSidePanelTab(prev => prev === 'artifact' ? prevSidePanelTab : prev);
  }, [prevSidePanelTab]);

  const handleGitChanged = useCallback(() => {
    refreshGitState();
  }, [refreshGitState]);

  const handleAttachGitFile = useCallback((file) => {
    const basePath = workingContext?.relativePath && workingContext.relativePath !== '.'
      ? workingContext.relativePath.replace(/\/+$/, '')
      : '';
    const scopedPath = basePath && file?.path && !String(file.path).startsWith(`${basePath}/`)
      ? `${basePath}/${file.path}`
      : file?.path;
    setExternalFileAttachment({
      ...file,
      rootId: workingContext?.rootId || 'workspace',
      path: scopedPath,
      nonce: Date.now(),
    });
  }, [workingContext?.relativePath, workingContext?.rootId]);

  const ConversationSwitcher = useCallback(({ compact = false } = {}) => (
    <button
      type="button"
      onClick={() => toggleSidePanelTab('history')}
      className={`relative shrink-0 ${compact ? 'p-2' : 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium sm:px-2.5 sm:text-sm'} transition-colors ${
        showActivitySidebar && sidePanelTab === 'history' && !compact
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
      }`}
      title="Recent conversations"
    >
      <History className={compact ? "w-5 h-5" : "w-4 h-4"} />
      {!compact && <span className="hidden sm:inline">History</span>}
      {hasActiveRuns && (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900 midnight:ring-slate-900 animate-pulse"
          title="A chat is generating"
        />
      )}
    </button>
  ), [
    hasActiveRuns,
    showActivitySidebar,
    sidePanelTab,
    toggleSidePanelTab,
  ]);

  const conversationBranches = useMemo(() => {
    const storedBranches = Array.isArray(conversationMetadata?.branches)
      ? conversationMetadata.branches
      : [];
    const activeBranchId = conversationMetadata?.activeBranchId || getMessageBranchId(messages[0]);
    const storedActiveBranch = storedBranches.find(branch => branch?.id === activeBranchId);
    const activeBranch = {
      ...(storedActiveBranch || {}),
      id: activeBranchId,
      label: storedActiveBranch?.label || (activeBranchId === 'main' ? 'Main' : summarizeBranch(messages)),
      messages,
      createdAt: conversationMetadata?.created_at || messages[0]?.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
    };
    const merged = upsertBranchSnapshot(storedBranches, activeBranch);
    return merged.map(branch => ({
      ...branch,
      label: branch.label || (branch.id === 'main' ? 'Main' : summarizeBranch(branch.messages)),
      active: branch.id === activeBranchId,
      messageCount: Array.isArray(branch.messages) ? branch.messages.length : 0,
    }));
  }, [conversationMetadata?.activeBranchId, conversationMetadata?.branches, conversationMetadata?.created_at, messages]);

  const activeBranchId = conversationMetadata?.activeBranchId || getMessageBranchId(messages[0]);
  const hasConversationBranches = conversationBranches.length > 1;

  const persistBranchState = useCallback(async (nextMessages, nextMetadata) => {
    setMessages(nextMessages);
    setConversationHistory(buildConversationHistoryFromMessages(nextMessages).slice(-8));
    setConversationMetadata(nextMetadata);
    setCurrentChatRun(prev => ({
      ...prev,
      events: buildEventsFromMessages(nextMessages),
      conversationHistory: buildConversationHistoryFromMessages(nextMessages),
      streamingText: '',
      running: false,
    }));

    if (!isGhostMode && currentConversationId) {
      await saveCurrentConversation({
        messages: nextMessages,
        conversationId: currentConversationId,
        metadata: nextMetadata,
      });
    }
  }, [
    currentConversationId,
    isGhostMode,
    saveCurrentConversation,
    setConversationHistory,
    setConversationMetadata,
    setCurrentChatRun,
    setMessages,
  ]);

  const handleSwitchBranch = useCallback(async (branchId) => {
    if (!branchId || branchId === activeBranchId || agentRunning) return;
    const targetBranch = conversationBranches.find(branch => branch.id === branchId);
    if (!targetBranch || !Array.isArray(targetBranch.messages)) return;

    const currentSnapshot = {
      id: activeBranchId,
      label: activeBranchId === 'main' ? 'Main' : summarizeBranch(messages),
      messages,
      createdAt: conversationMetadata?.createdAt || messages[0]?.timestamp || new Date().toISOString(),
      fromMessageId: conversationMetadata?.branchPointMessageId || null,
    };
    const branches = upsertBranchSnapshot(conversationMetadata?.branches || [], currentSnapshot);
    const nextMetadata = {
      ...(conversationMetadata || {}),
      activeBranchId: branchId,
      branches,
    };
    await persistBranchState(targetBranch.messages, nextMetadata);
    setShowBranchMenu(false);
  }, [
    activeBranchId,
    agentRunning,
    conversationBranches,
    conversationMetadata,
    messages,
    persistBranchState,
  ]);

  const handleRenameBranch = useCallback(async (branchId, label) => {
    const nextLabel = String(label || '').trim();
    if (!branchId || !nextLabel) return;
    const targetMessages = branchId === activeBranchId
      ? messages
      : conversationBranches.find(branch => branch.id === branchId)?.messages || [];
    const currentBranch = conversationBranches.find(branch => branch.id === branchId);
    const nextBranches = upsertBranchSnapshot(conversationMetadata?.branches || [], {
      ...(currentBranch || {}),
      id: branchId,
      label: nextLabel,
      messages: targetMessages,
    });
    const nextMetadata = {
      ...(conversationMetadata || {}),
      branches: nextBranches,
    };
    setConversationMetadata(nextMetadata);
    setEditingBranchId(null);
    setBranchNameDraft('');
    if (!isGhostMode && currentConversationId) {
      await saveCurrentConversation({
        messages,
        conversationId: currentConversationId,
        metadata: nextMetadata,
      });
    }
  }, [
    activeBranchId,
    conversationBranches,
    conversationMetadata,
    currentConversationId,
    isGhostMode,
    messages,
    saveCurrentConversation,
    setConversationMetadata,
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
      navigate('/home', { replace: true });
      triggerConversationRefresh();
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
    setShowDeleteConfirm(false);
  }, [
    currentConversationId,
    handleClearConversation,
    navigate,
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
    const requestedChatOnly = runOptions.agentMode === 'chat' || messageObj?.chatOnly === true || chatOnlyMode;
    const agentMentions = requestedChatOnly ? [] : Array.isArray(messageObj?.agentMentions) ? messageObj.agentMentions : [];
    const fileAttachments = Array.isArray(messageObj?.fileAttachments) ? messageObj.fileAttachments : [];
    const runEnabledIntegrationTools = requestedChatOnly
      ? []
      : Array.isArray(runOptions.enabledIntegrationTools)
      ? runOptions.enabledIntegrationTools
      : Array.isArray(messageObj?.enabledIntegrationTools)
        ? messageObj.enabledIntegrationTools
        : enabledIntegrationTools;
    const selectedReasoningEffort = runOptions.reasoningEffort || messageObj?.reasoningEffort || reasoningEffort || 'auto';
    const leadingProfileMention = getLeadingProfileMention(submittedGoal, agentMentions);
    const effectiveProfileId = leadingProfileMention?.id || selectedProfileId;
    let runKey = currentRunKey;
    let runConversationId = currentConversationId;
    const runMessages = Array.isArray(runOptions.baseMessages) ? runOptions.baseMessages : messages;
    const effectiveAgentMode = requestedChatOnly
      ? 'chat'
      : runOptions.agentMode || (runOptions.enableTools === true ? 'action' : runOptions.enableTools === false ? 'plan' : agentMode);
    const effectiveToolsEnabled = effectiveAgentMode === 'action';
    const activeWorkingContext = effectiveAgentMode === 'chat' ? null : workingContext || null;
    const activeConversationHistory = Array.isArray(runOptions.baseConversationHistory)
      ? runOptions.baseConversationHistory
      : agentConversationHistory.length > 0
        ? agentConversationHistory
        : conversationHistory;
    const runBranchId = runOptions.branchId || messageObj?.branchId || activeBranchId || getMessageBranchId(runMessages[0]);
    const runParentBranchId = runOptions.parentBranchId || messageObj?.parentBranchId || null;
    const runBranchPointMessageId = runOptions.branchPointMessageId || messageObj?.branchPointMessageId || null;
    const editedFromMessageId = runOptions.editedFromMessageId || messageObj?.editedFromMessageId || null;
    const editedFromContent = runOptions.editedFromContent || messageObj?.editedFromContent || null;
    const runMetadata = runOptions.metadata || conversationMetadata || {};
    const userMessageId = runOptions.userMessageId || messageObj?.id || `msg_${Date.now()}_user_${Math.random().toString(36).substr(2, 9)}`;
    const assistantMessageId = runOptions.assistantMessageId || runOptions.regenerateAssistantMessageId || `msg_${Date.now()}_assistant_${Math.random().toString(36).substr(2, 9)}`;
    const regeneratingAssistant = runOptions.regenerateAssistantMessage || null;
    const submittedAt = new Date().toISOString();
    const userMsg = {
      id: userMessageId,
      content: submittedGoal,
      type: 'user',
      timestamp: submittedAt,
      toolsEnabled: effectiveToolsEnabled,
      agentMode: effectiveAgentMode,
      reasoningEffort: selectedReasoningEffort,
      enabledIntegrationTools: runEnabledIntegrationTools,
      agentMentions,
      fileAttachments,
      workingContext: activeWorkingContext,
      branchId: runBranchId,
      parentBranchId: runParentBranchId,
      branchPointMessageId: runBranchPointMessageId,
      editedFromMessageId,
      editedFromContent,
    };
    const userGoalEventData = {
      goal: submittedGoal,
      messageId: userMessageId,
      timestamp: submittedAt,
      toolsEnabled: effectiveToolsEnabled,
      agentMode: effectiveAgentMode,
      reasoningEffort: selectedReasoningEffort,
      enabledIntegrationTools: runEnabledIntegrationTools,
      agentMentions,
      fileAttachments,
      profileId: effectiveProfileId || null,
      workingContext: activeWorkingContext,
      branchId: runBranchId,
      parentBranchId: runParentBranchId,
      branchPointMessageId: runBranchPointMessageId,
    };
    const optimisticMessages = [...runMessages, userMsg];
    const optimisticConversationHistory = [
      ...activeConversationHistory,
      {
        role: 'user',
        content: submittedGoal,
        toolsEnabled: effectiveToolsEnabled,
        agentMode: effectiveAgentMode,
        reasoningEffort: selectedReasoningEffort,
        enabledIntegrationTools: runEnabledIntegrationTools,
        agentMentions,
        fileAttachments,
        workingContext: activeWorkingContext,
        branchId: runBranchId,
      },
    ];

    if (!currentConversationId && messages.length === 0) {
      generateAndSetTitle(submittedGoal);
    }

    setError(null);
    runStartedAtRef.current = Date.now();
    if (runConversationId === currentConversationIdRef.current) {
      setMessages(optimisticMessages);
      setConversationHistory(optimisticConversationHistory);
    }

    if (!isGhostMode) {
      try {
        const saveResult = await saveCurrentConversation({
          messages: optimisticMessages,
          conversationId: runConversationId,
          metadata: {
            ...(runMetadata || {}),
            activeBranchId: runBranchId,
          },
        });

        if (!runConversationId && saveResult?.conversationId) {
          const persistedRunKey = saveResult.conversationId;
          runKey = persistedRunKey;
          runConversationId = persistedRunKey;
          currentConversationIdRef.current = persistedRunKey;
          setCurrentConversationId(persistedRunKey);
          if (saveResult.title) setConversationTitle(saveResult.title);
          setTimeout(() => triggerConversationRefresh(), 50);
        }
      } catch (saveError) {
        console.error('Failed to save submitted message before agent run:', saveError);
        setError('Failed to save message');
        setMessages(runMessages);
        setConversationHistory(activeConversationHistory);
        return;
      }
    }

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
        fileAttachments,
        conversationHistory: optimisticConversationHistory,
        events: [
          ...baseEvents,
          { type: 'user_goal', data: userGoalEventData, arrivedAt: Date.now() },
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
      { type: 'user_goal', data: userGoalEventData },
    ];

    try {
      for await (const event of agentApi.runStream(submittedGoal, activeConversationHistory, activeWorkingContext?.workingDir || null, 25, controller.signal, runOptions.continueSessionId !== undefined ? runOptions.continueSessionId : agentCurrentSessionId, {
        autoApprove: effectiveAgentMode === 'action' ? agentAutoApprove : false,
        preApprovedTools: effectiveAgentMode === 'action' ? [...alwaysAllowedTools] : [],
        profileId: effectiveProfileId,
        agentMentions,
        fileAttachments,
        workingContext: activeWorkingContext,
        enableTools: effectiveToolsEnabled,
        agentMode: effectiveAgentMode,
        reasoningEffort: selectedReasoningEffort,
        enabledIntegrationTools: runEnabledIntegrationTools,
        conversationId: runConversationId,
        userMessageId,
        assistantMessageId,
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
          const stopReason = event.data?.stopReason || 'answer';
          if (doneAnswer) {
            sawFinalResponse = true;
          }
          if (!capturedFinalAnswer && doneAnswer) {
            capturedFinalAnswer = doneAnswer;
            const newEvents = [
              {
                type: 'answer',
                data: {
                  answer: doneAnswer,
                  messageId: assistantMessageId,
                  round: event.data.rounds,
                  toolsEnabled: effectiveToolsEnabled,
                  agentMode: effectiveAgentMode,
                },
                arrivedAt: Date.now(),
              },
            ];
            if (stopReason !== 'answer') {
              newEvents.push({
                type: 'stop_reason',
                data: { stopReason, rounds: event.data.rounds, maxRounds: event.data.maxRounds },
                arrivedAt: Date.now(),
              });
            }
            updateChatRun(runKey, prev => ({
              ...prev,
              events: [...(prev.events || []), ...newEvents],
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
          const resultTool = event.data?.tool || '';
          if (
            resultTool.startsWith('git_') ||
            ['write_file', 'create_file', 'edit_file', 'create_directory', 'file_delete', 'delete_file', 'file_copy', 'copy_file', 'file_move', 'move_file', 'run_command', 'run_python', 'run_node'].includes(resultTool)
          ) {
            refreshGitState();
          }
          runEvents.push(event);
          updateChatRun(runKey, prev => {
            const updated = [...(prev.events || [])];
            const incomingToolCallId = event.data?.toolCallId || null;
            for (let i = updated.length - 1; i >= 0; i--) {
              const sameToolCall = incomingToolCallId
                ? updated[i].data?.toolCallId === incomingToolCallId
                : updated[i].data?.tool === event.data?.tool;
              if (updated[i].type === 'tool_start' && sameToolCall && updated[i].result === undefined) {
                updated[i] = { ...updated[i], result: event.data?.result, completedAt };
                for (let j = runEvents.length - 1; j >= 0; j--) {
                  const sameRunEventToolCall = incomingToolCallId
                    ? runEvents[j].data?.toolCallId === incomingToolCallId
                    : runEvents[j].data?.tool === event.data?.tool;
                  if (runEvents[j].type === 'tool_start' && sameRunEventToolCall && runEvents[j].result === undefined) {
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
        // Handle streaming tool progress (real-time command output)
        if (event.type === 'tool_progress') {
          updateChatRun(runKey, prev => {
            const updated = [...(prev.events || [])];
            const incomingToolCallId = event.data?.toolCallId || null;
            for (let i = updated.length - 1; i >= 0; i--) {
              const sameToolCall = incomingToolCallId
                ? updated[i].data?.toolCallId === incomingToolCallId
                : updated[i].data?.tool === event.data?.tool;
              if (updated[i].type === 'tool_start' && sameToolCall && updated[i].result === undefined) {
                updated[i] = {
                  ...updated[i],
                  progress: (updated[i].progress || '') + (event.data?.chunk || ''),
                  progressDone: event.data?.done || false,
                };
                return { ...prev, events: updated };
              }
            }
            return prev;
          });
          continue;
        }
        // Skill learned — fire the in-app toast
        if (event.type === 'skill_suggested') {
          const toast = {
            id: Date.now(),
            name: event.data?.skillName || event.data?.name || 'Skill',
            summary: event.data?.summary || event.data?.description || '',
          };
          setSkillToast(toast);
          if (skillToastTimerRef.current) clearTimeout(skillToastTimerRef.current);
          skillToastTimerRef.current = setTimeout(() => setSkillToast(null), 5000);
        }

        const eventWithMode = event.type === 'answer'
          ? { ...event, data: { ...event.data, toolsEnabled: effectiveToolsEnabled, agentMode: effectiveAgentMode } }
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
          events: [...(prev.events || []), { type: 'error', data: { message: err.message, goal: submittedGoal } }],
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
          ...optimisticConversationHistory,
          { role: 'assistant', content: capturedFinalAnswer, toolsEnabled: effectiveToolsEnabled, agentMode: effectiveAgentMode, reasoningEffort: selectedReasoningEffort, agentSessionId: runSessionId, branchId: runBranchId },
        ];
        const shouldPersistCompactedHistory = nextHistory.some(item => item?.compacted);
        updateChatRun(runKey, { conversationHistory: nextHistory });
        if (runConversationId === currentConversationIdRef.current) {
          setConversationHistory(nextHistory);
        }

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

        let assistantMsg = {
          id: assistantMessageId,
          content: capturedFinalAnswer,
          type: 'assistant',
          timestamp: new Date().toISOString(),
          agentSessionId: runSessionId,
          toolsEnabled: effectiveToolsEnabled,
          agentMode: effectiveAgentMode,
          reasoningEffort: selectedReasoningEffort,
          agentEvents: getPersistableAgentEvents(runEventsForMsg),
          searchEvent,
          branchId: runBranchId,
          parentBranchId: runParentBranchId,
          branchPointMessageId: runBranchPointMessageId,
        };
        if (regeneratingAssistant) {
          const existingVariants = Array.isArray(regeneratingAssistant.variants) && regeneratingAssistant.variants.length > 0
            ? regeneratingAssistant.variants
            : [buildAssistantVariant(regeneratingAssistant)];
          const nextVariant = buildAssistantVariant(assistantMsg);
          assistantMsg = {
            ...regeneratingAssistant,
            ...assistantMsg,
            variants: [...existingVariants, nextVariant],
            activeVariantIndex: existingVariants.length,
            regeneratedAt: new Date().toISOString(),
          };
        }
        const finalMessages = [...optimisticMessages, assistantMsg];
        if (runConversationId === currentConversationIdRef.current) {
          setMessages(finalMessages);
        }
        updateChatRun(runKey, prev => ({
          ...prev,
          events: buildEventsFromMessages(finalMessages),
          conversationHistory: nextHistory,
        }));

        if (!isGhostMode) {
          await saveCurrentConversation({
            messages: finalMessages,
            conversationId: runConversationId,
            metadata: {
              ...(runMetadata || {}),
              activeBranchId: runBranchId,
              ...(shouldPersistCompactedHistory ? { compactedConversationHistory: nextHistory } : {}),
            },
          });
        }

        if (effectiveAgentMode === 'plan' && isLikelyToolActionRequest(submittedGoal)) {
          updateChatRun(runKey, prev => ({
            ...prev,
            events: [...(prev.events || []), {
              type: 'status',
              data: {
                message: 'Plan mode can inspect and plan, but it will not execute changes. Run again in Action mode if you want the agent to apply it.',
                canRetryWithAction: true,
                goal: submittedGoal,
              },
            }],
          }));
        }
      } else if (!controller.signal.aborted && effectiveAgentMode === 'plan' && isLikelyToolActionRequest(submittedGoal)) {
        updateChatRun(runKey, prev => ({
          ...prev,
          events: [...(prev.events || []), {
            type: 'status',
            data: {
              message: 'Plan mode cannot execute changes. Switch to Action mode to let the agent apply it.',
              canRetryWithAction: true,
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
    reasoningEffort,
    alwaysAllowedTools,
    enabledIntegrationTools,
    selectedProfileId,
    agentMode,
    activeBranchId,
    conversationMetadata,
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
    refreshGitState,
    workingContext,
    chatOnlyMode,
  ]);

  const handleEditConversationTurn = useCallback(async (messageId, nextContent) => {
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    const original = messages[messageIndex];
    const editedContent = String(nextContent || '').trim();
    if (messageIndex < 0 || original?.type !== 'user' || !editedContent || editedContent === original.content || agentRunning) {
      return;
    }

    const previousBranchId = activeBranchId || getMessageBranchId(original);
    const nextBranchId = createConversationBranchId();
    const now = new Date().toISOString();
    const previousSnapshot = {
      id: previousBranchId,
      label: previousBranchId === 'main' ? 'Main' : summarizeBranch(messages),
      messages,
      createdAt: conversationMetadata?.createdAt || messages[0]?.timestamp || now,
      fromMessageId: conversationMetadata?.branchPointMessageId || null,
      updatedAt: now,
    };
    const baseMessages = messages.slice(0, messageIndex).map(msg => ({
      ...msg,
      branchId: msg.branchId || previousBranchId,
    }));
    const baseHistory = buildConversationHistoryFromMessages(baseMessages);
    const nextMetadata = {
      ...(conversationMetadata || {}),
      activeBranchId: nextBranchId,
      branchPointMessageId: original.id,
      branches: upsertBranchSnapshot(
        upsertBranchSnapshot(conversationMetadata?.branches || [], previousSnapshot),
        {
          id: nextBranchId,
          label: summarizeBranch([{ type: 'user', content: editedContent }]),
          messages: baseMessages,
          parentBranchId: previousBranchId,
          branchPointMessageId: original.id,
          fromMessageId: original.id,
        },
      ),
    };

    setConversationMetadata(nextMetadata);
    setMessages(baseMessages);
    setConversationHistory(baseHistory.slice(-8));
    setCurrentChatRun(prev => ({
      ...prev,
      events: buildEventsFromMessages(baseMessages),
      conversationHistory: baseHistory,
      sessionId: null,
      session: null,
      streamingText: '',
      running: false,
    }));

    await handleAgentRun({
      ...original,
      id: undefined,
      content: editedContent,
      branchId: nextBranchId,
      parentBranchId: previousBranchId,
      branchPointMessageId: original.id,
      editedFromMessageId: original.id,
      editedFromContent: original.content,
    }, {
      baseMessages,
      baseConversationHistory: baseHistory,
      branchId: nextBranchId,
      parentBranchId: previousBranchId,
      branchPointMessageId: original.id,
      editedFromMessageId: original.id,
      editedFromContent: original.content,
      metadata: nextMetadata,
      continueSessionId: null,
    });
  }, [
    activeBranchId,
    agentRunning,
    conversationMetadata,
    handleAgentRun,
    messages,
    setConversationHistory,
    setConversationMetadata,
    setCurrentChatRun,
    setMessages,
  ]);

  const persistMessageMutation = useCallback(async (nextMessages, extraMetadata = null) => {
    const nextMetadata = {
      ...(extraMetadata || conversationMetadata || {}),
      highlights: buildConversationHighlights(nextMessages),
    };
    setMessages(nextMessages);
    setConversationHistory(buildConversationHistoryFromMessages(nextMessages).slice(-8));
    setCurrentChatRun(prev => ({
      ...prev,
      events: buildEventsFromMessages(nextMessages),
      conversationHistory: buildConversationHistoryFromMessages(nextMessages),
    }));
    if (!isGhostMode && currentConversationId) {
      await saveCurrentConversation({
        messages: nextMessages,
        conversationId: currentConversationId,
        metadata: nextMetadata,
      });
    }
  }, [
    conversationMetadata,
    currentConversationId,
    isGhostMode,
    saveCurrentConversation,
    setConversationHistory,
    setCurrentChatRun,
    setMessages,
  ]);

  const handleToggleMessageFlag = useCallback((messageId, field) => {
    if (!messageId || field !== 'bookmarked') return;
    const nextMessages = messages.map(msg => (
      msg.id === messageId ? { ...msg, [field]: !msg[field] } : msg
    ));
    persistMessageMutation(nextMessages);
  }, [messages, persistMessageMutation]);

  const handleSelectAnswerVariant = useCallback((messageId, variantIndex) => {
    if (!messageId || !Number.isInteger(variantIndex)) return;
    const target = messages.find(msg => msg.id === messageId);
    const variants = Array.isArray(target?.variants) ? target.variants : [];
    const variant = variants[variantIndex];
    if (!variant) return;
    const nextMessages = messages.map(msg => (
      msg.id === messageId
        ? {
            ...msg,
            content: variant.content || msg.content,
            timestamp: variant.timestamp || msg.timestamp,
            agentSessionId: variant.agentSessionId || msg.agentSessionId,
            agentEvents: variant.agentEvents || msg.agentEvents,
            searchEvent: variant.searchEvent || msg.searchEvent,
            toolsEnabled: variant.toolsEnabled ?? msg.toolsEnabled,
            agentMode: variant.agentMode || msg.agentMode,
            reasoningEffort: variant.reasoningEffort || msg.reasoningEffort,
            activeVariantIndex: variantIndex,
          }
        : msg
    ));
    persistMessageMutation(nextMessages);
  }, [messages, persistMessageMutation]);

  const handleRegenerateAnswer = useCallback((assistantMessageId) => {
    if (!assistantMessageId || agentRunning) return;
    const assistantIndex = messages.findIndex(msg => msg.id === assistantMessageId && msg.type === 'assistant');
    if (assistantIndex <= 0) return;
    const userIndex = assistantIndex - 1;
    const userMsg = messages[userIndex];
    const assistantMsg = messages[assistantIndex];
    if (!userMsg || userMsg.type !== 'user') return;

    const baseMessages = messages.slice(0, userIndex);
    const baseHistory = buildConversationHistoryFromMessages(baseMessages);
    handleAgentRun({
      ...userMsg,
      content: userMsg.content,
    }, {
      baseMessages,
      baseConversationHistory: baseHistory,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      regenerateAssistantMessageId: assistantMsg.id,
      regenerateAssistantMessage: assistantMsg,
      branchId: assistantMsg.branchId || userMsg.branchId || activeBranchId,
      parentBranchId: assistantMsg.parentBranchId || userMsg.parentBranchId || null,
      branchPointMessageId: assistantMsg.branchPointMessageId || userMsg.branchPointMessageId || null,
      continueSessionId: null,
      metadata: conversationMetadata,
    });
  }, [
    activeBranchId,
    agentRunning,
    conversationMetadata,
    handleAgentRun,
    messages,
  ]);

  const handleRetryGoal = useCallback((goal) => {
    if (!goal?.trim() || agentRunning) return;
    handleAgentRun({ content: goal });
  }, [agentRunning, handleAgentRun]);

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

  const handleRunInActionMode = useCallback((goal) => {
    if (!goal?.trim() || agentRunning) return;
    setToolsEnabled(true);
    handleAgentRun({ content: goal }, { enableTools: true, agentMode: 'action' });
  }, [agentRunning, handleAgentRun, setToolsEnabled]);

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

  const handleToggleVoiceMode = useCallback(() => {
    setVoiceMode(prev => {
      const next = !prev;
      try { localStorage.setItem('asyncat_voice_mode', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Voice Mode: auto-speak agent answers via TTS
  const lastSpokenAnswerRef = useRef('');
  const voicePlaybackRequestRef = useRef(0);
  const autoRecordPromptTimerRef = useRef(null);
  const stopVoiceAudio = useCallback(() => {
    if (autoRecordPromptTimerRef.current) {
      clearTimeout(autoRecordPromptTimerRef.current);
      autoRecordPromptTimerRef.current = null;
    }
    const audio = voiceAudioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    const src = audio.src;
    if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
    audio.removeAttribute('src');
    voiceAudioRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      voicePlaybackRequestRef.current += 1;
      stopVoiceAudio();
    };
  }, [stopVoiceAudio]);

  useEffect(() => {
    if (!voiceConversationActive || agentRunning) {
      voicePlaybackRequestRef.current += 1;
      stopVoiceAudio();
      setVoiceModeTtsState('idle');
      setAutoRecordAfterTts(false);
      return;
    }

    // Find the most recent answer event
    for (let i = agentEvents.length - 1; i >= 0; i--) {
      const ev = agentEvents[i];
      if (ev.type === 'answer' && ev.data?.answer) {
        const answerText = ev.data.answer.trim();
        const answerKey = `${currentRunKey}:${ev.arrivedAt || ev.data?.timestamp || i}:${answerText}`;
        if (answerText && answerKey !== lastSpokenAnswerRef.current) {
          lastSpokenAnswerRef.current = answerKey;
          const playbackRequest = voicePlaybackRequestRef.current + 1;
          voicePlaybackRequestRef.current = playbackRequest;
          stopVoiceAudio();
          setAutoRecordAfterTts(false);
          setVoiceModeTtsState('loading');
          audioApi.tts.speak(answerText).then(blobUrl => {
            if (voicePlaybackRequestRef.current !== playbackRequest) {
              URL.revokeObjectURL(blobUrl);
              return;
            }
            stopVoiceAudio();
            const audio = new Audio(blobUrl);
            let released = false;
            const releaseAudio = () => {
              if (released) return;
              released = true;
              URL.revokeObjectURL(blobUrl);
              if (voiceAudioRef.current === audio) voiceAudioRef.current = null;
            };
            voiceAudioRef.current = audio;
            audio.onended = () => {
              if (voicePlaybackRequestRef.current !== playbackRequest) {
                releaseAudio();
                return;
              }
              setVoiceModeTtsState('idle');
              releaseAudio();
              // Signal that we should start listening again
              setAutoRecordAfterTts(true);
              autoRecordPromptTimerRef.current = setTimeout(() => {
                autoRecordPromptTimerRef.current = null;
                setAutoRecordAfterTts(false);
              }, 3000);
            };
            audio.onerror = () => {
              if (voicePlaybackRequestRef.current === playbackRequest) {
                setVoiceModeTtsState('idle');
              }
              releaseAudio();
            };
            audio.play().then(() => {
              if (voicePlaybackRequestRef.current === playbackRequest) {
                setVoiceModeTtsState('playing');
              }
            }).catch(() => {
              if (voicePlaybackRequestRef.current === playbackRequest) {
                setVoiceModeTtsState('idle');
              }
              releaseAudio();
            });
          }).catch(() => {
            if (voicePlaybackRequestRef.current === playbackRequest) {
              setVoiceModeTtsState('idle');
            }
          });
        }
        break;
      }
    }
  }, [voiceConversationActive, agentRunning, agentEvents, currentRunKey, stopVoiceAudio]);

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
          try { localStorage.setItem('asyncat_always_allow_tools', JSON.stringify([...next])); } catch { /* localStorage may be unavailable */ }
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
      try { localStorage.setItem('asyncat_agent_auto_approve', String(next)); } catch { /* localStorage may be unavailable */ }
      return next;
    });
  }, []);

  const handleEnabledIntegrationToolsChange = useCallback((nextTools) => {
    const next = Array.isArray(nextTools) ? [...new Set(nextTools.filter(Boolean))] : [];
    setEnabledIntegrationTools(next);
    try { localStorage.setItem('asyncat_enabled_integration_tools', JSON.stringify(next)); } catch { /* localStorage may be unavailable */ }
  }, []);

  const handleReasoningEffortChange = useCallback((next) => {
    const value = ['auto', 'low', 'medium', 'high', 'xhigh'].includes(next) ? next : 'auto';
    setReasoningEffort(value);
    try { localStorage.setItem('asyncat_reasoning_effort', value); } catch { /* localStorage may be unavailable */ }
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

  const conversationArtifacts = useMemo(
    () => collectArtifactsFromEvents(persistedAgentEvents),
    [persistedAgentEvents],
  );

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

  // Auto-detect a localhost server URL from the most recent run_command result
  const detectedPreviewUrl = useMemo(() => {
    for (let i = persistedAgentEvents.length - 1; i >= 0; i--) {
      const ev = persistedAgentEvents[i];
      if (ev?.type === 'tool_start' && ev.data?.tool === 'run_command' && ev.result) {
        const output = typeof ev.result?.output === 'string' ? ev.result.output
          : typeof ev.result?.stdout === 'string' ? ev.result.stdout : null;
        if (output) {
          const url = extractLocalhostUrl(output);
          if (url) return url;
        }
      }
    }
    return null;
  }, [persistedAgentEvents]);

  const effectivePreviewUrl = detectedPreviewUrl;

  const conversationHighlights = useMemo(
    () => buildConversationHighlights(messages),
    [messages],
  );
  const savedItemsCount = conversationHighlights.bookmarkedMessages.length;

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

  const chatNavItems = useMemo(() => {
    if (!persistedAgentEvents?.length) return [];
    const segs = buildEventSegments(persistedAgentEvents);
    return segs
      .map((seg, i) => {
        if (seg.divider || (!seg.goalEvent && !seg.answerEvent)) return null;
        const goal = seg.goalEvent?.data?.goal || seg.goalEvent?.data?.content || '';
        const answer = (seg.answerEvent?.data?.content || '').replace(/\n+/g, ' ').trim();
        return { domId: `chat-seg-${i}`, goal, answerPreview: answer.slice(0, 90) };
      })
      .filter(Boolean);
  }, [persistedAgentEvents]);

  // Export handlers
  const exportEntries = useMemo(
    () => buildConversationExportEntries(messages, persistedAgentEvents, agentStreamingText),
    [messages, persistedAgentEvents, agentStreamingText],
  );

  const exportTitle = conversationTitle || agentCurrentGoal || 'Conversation';
  const exportFilename = sanitizeExportFilename(exportTitle);

  const handleExportMarkdown = useCallback(() => {
    if (!exportEntries.length) return;
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const lines = [
      `# ${exportTitle}`,
      `*Exported from Asyncat - ${date}*`,
      "",
      "---",
      "",
    ];

    exportEntries.forEach((entry) => {
      const time = formatExportTime(entry.timestamp);
      const kind = entry.kind && entry.kind !== 'message' ? ` (${entry.kind})` : '';
      lines.push(`### **${entry.role}**${kind}${time ? ` - ${time}` : ""}`);
      lines.push("");
      lines.push(entry.content || "");
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    triggerExportDownload(lines.join("\n"), "text/markdown", `${exportFilename}.md`);
  }, [exportEntries, exportFilename, exportTitle]);

  const handleExportHTML = useCallback(() => {
    if (!exportEntries.length) return;
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = buildExportHtmlDocument(exportTitle, date, exportEntries);
    triggerExportDownload(html, "text/html", `${exportFilename}.html`);
  }, [exportEntries, exportFilename, exportTitle]);

  const handleExportJSON = useCallback(() => {
    if (!exportEntries.length) return;
    const exportData = {
      title: exportTitle,
      exportDate: new Date().toISOString(),
      entries: exportEntries,
      messages: messages.map(msg => ({
        type: msg.type || msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        projectIds: msg.projectIds || [],
      })),
      agentEvents: persistedAgentEvents,
    };

    const json = JSON.stringify(exportData, null, 2);
    triggerExportDownload(json, "application/json", `${exportFilename}.json`);
  }, [exportEntries, exportFilename, exportTitle, messages, persistedAgentEvents]);

  const handleExportPDF = useCallback(() => {
    if (!exportEntries.length) return;
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const html = buildExportHtmlDocument(exportTitle, date, exportEntries);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => {
      printWindow.close();
    };
    printWindow.setTimeout(() => {
      printWindow.print();
    }, 250);
  }, [exportEntries, exportTitle]);

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
          <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
            <ConversationSwitcher compact />
            <button
              type="button"
              onClick={() => toggleSidePanelTab('code')}
              className={`relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors text-sm font-medium ${
                showActivitySidebar && sidePanelTab === 'code'
                  ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
              }`}
              title="Code"
            >
              <Code2 className="w-4 h-4" />
              {gitState?.detected && (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {gitState.changedCount || 0}
                  {(gitState.ahead || gitState.behind)
                    ? ` · ↑${gitState.ahead || 0} ↓${gitState.behind || 0}`
                    : ''}
                </span>
              )}
            </button>
          </div>
        )}
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-8">
          <div className="max-w-3xl w-full">
            <div className="flex flex-col items-center gap-3 mb-6 text-center">
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

            {!isGhostMode && brainStats && (brainStats.memoryCount > 0 || brainStats.skillCount > 0) && (
              <div className="flex justify-center mb-5">
                <div className="inline-flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                  {brainStats.memoryCount > 0 && (
                    <span>{brainStats.memoryCount} {brainStats.memoryCount === 1 ? 'memory' : 'memories'}</span>
                  )}
                  {brainStats.memoryCount > 0 && brainStats.skillCount > 0 && (
                    <span className="text-gray-200 dark:text-gray-700">·</span>
                  )}
                  {brainStats.skillCount > 0 && (
                    <span>{brainStats.skillCount} skill{brainStats.skillCount !== 1 ? 's' : ''}</span>
                  )}
                  {brainStats.autoSkillCount > 0 && (
                    <>
                      <span className="text-gray-200 dark:text-gray-700">·</span>
                      <span className="text-emerald-500 dark:text-emerald-500">{brainStats.autoSkillCount} auto-learned</span>
                    </>
                  )}
                </div>
              </div>
            )}

            <MessageInputV2
              key={`welcome-input-${currentConversationId || 'draft'}-${messageInputResetKey}`}
              onSubmit={handleAgentRun}
              sttReady={sttReady}
              ttsReady={ttsReady}
              voiceMode={voiceMode}
              onToggleVoiceMode={handleToggleVoiceMode}
              autoRecordPrompt={autoRecordAfterTts}
              voiceTtsState={voiceModeTtsState}
              disabled={isProcessing || agentRunning}
              autoFocus={true}
              placeholder={
                agentRunning
                  ? "Agent is working..."
                  : isGhostMode
                  ? "👻 Ghost Mode — messages won't be saved..."
                  : getVoicePlaceholder(sttReady, ttsReady, "Ask anything, or create tasks, events, notes...")
              }
              hasMessages={hasConversationContent}
              toolsEnabled={toolsEnabled}
              agentMode={agentMode}
              onToggleAgentMode={() => setToolsEnabled(!toolsEnabled)}
              chatOnlyMode={chatOnlyMode}
              autoApprove={agentAutoApprove}
              onToggleAutoApprove={handleToggleAgentAutoApprove}
              enabledIntegrationTools={enabledIntegrationTools}
              onEnabledIntegrationToolsChange={handleEnabledIntegrationToolsChange}
              reasoningEffort={reasoningEffort}
              onReasoningEffortChange={handleReasoningEffortChange}
                externalFileAttachment={externalFileAttachment}
                workingContext={workingContext}
                onWorkingContextChange={setWorkingContext}
                multimodalCapabilities={multimodalCapabilities}
              />


          </div>
        </div>
      </div>
    ) : null;

  // Chat Layout
  return (
    <div data-command-center className="flex h-full min-h-0 bg-white dark:bg-gray-900 midnight:bg-slate-950">
      <div className="flex min-h-0 flex-1 min-w-0 flex-col h-full transition-all duration-300">
        {TopBar}
        {isConversationLoading ? (
          <ConversationLoadingSkeleton />
        ) : !hasConversationContent ? (
          welcomeScreenJSX
        ) : (
          <>
            <div className="shrink-0 border-b border-transparent bg-white dark:bg-gray-900 midnight:bg-slate-950">
              <div className="mx-auto max-w-[min(100vw,96rem)] px-3 py-2.5 sm:px-4 md:px-6">
                <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 overflow-hidden items-center gap-2 lg:w-[min(28rem,34vw)] lg:shrink-0">
                    <div className="hidden h-4 w-px shrink-0 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 sm:block" />

                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                      {isEditingTitle ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleSaveRename}
                          className="h-8 min-w-0 w-full max-w-full rounded-md border border-gray-300 bg-gray-50 px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-100"
                          autoFocus
                        />
                      ) : currentConversationId && conversationTitle ? (
                        <button
                          onClick={handleStartRename}
                          className="group flex min-w-0 max-w-full flex-1 items-center gap-1.5 overflow-hidden rounded-md px-1 py-1 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60 dark:hover:text-white midnight:text-gray-300 midnight:hover:bg-slate-800/60"
                          title="Click to rename"
                        >
                          <span className="block min-w-0 flex-1 truncate">
                            {conversationTitle}
                          </span>
                          <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                        </button>
                      ) : (
                        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-300">
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

                  <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {!isGhostMode && (
                      <>
                        <button
                          type="button"
                          onClick={handleStartNewConversation}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:px-2.5 sm:text-sm dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800"
                          title="Start new conversation"
                        >
                          <Plus className="h-4 w-4" />
                          <span className="hidden sm:inline">New</span>
                        </button>
                        <ConversationSwitcher />
                        {hasConversationBranches && (
                          <div ref={branchMenuRef} className="relative">
                            <button
                              type="button"
                              onClick={() => setShowBranchMenu(v => !v)}
                              className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5 sm:text-sm ${
                                showBranchMenu
                                  ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                              }`}
                              title="Conversation branches"
                            >
                              <GitBranch className="h-4 w-4" />
                              <span className="hidden sm:inline">Branches</span>
                              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                {conversationBranches.length}
                              </span>
                            </button>
                            {showBranchMenu && (
                              <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
                                <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800 midnight:border-slate-800">
                                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">Conversation branches</div>
                                  <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Switch between alternate continuations.</div>
                                </div>
                                <div className="max-h-72 overflow-y-auto p-1">
                                  {conversationBranches.map(branch => (
                                    <div
                                      key={branch.id}
                                      className={`group flex w-full items-start gap-2 rounded-md px-2 py-2 transition-colors ${
                                        branch.active
                                          ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/70 dark:hover:text-gray-100'
                                      }`}
                                    >
                                      <GitBranch className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${branch.active ? 'text-blue-500' : 'text-gray-400'}`} />
                                      {editingBranchId === branch.id ? (
                                        <span className="min-w-0 flex-1">
                                          <input
                                            value={branchNameDraft}
                                            onChange={(e) => setBranchNameDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleRenameBranch(branch.id, branchNameDraft);
                                              if (e.key === 'Escape') {
                                                setEditingBranchId(null);
                                                setBranchNameDraft('');
                                              }
                                            }}
                                            onBlur={() => handleRenameBranch(branch.id, branchNameDraft)}
                                            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-800 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-gray-800"
                                            autoFocus
                                          />
                                        </span>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleSwitchBranch(branch.id)}
                                            disabled={branch.active || agentRunning}
                                            className="min-w-0 flex-1 text-left disabled:cursor-default"
                                          >
                                            <span className="block truncate text-xs font-semibold">{branch.label}</span>
                                            <span className="mt-0.5 block text-[11px] text-gray-400 dark:text-gray-500">
                                              {branch.messageCount} messages{branch.active ? ' · current' : ''}
                                            </span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingBranchId(branch.id);
                                              setBranchNameDraft(branch.label || '');
                                            }}
                                            className="mt-0.5 rounded p-1 text-gray-300 opacity-0 transition-colors hover:bg-white hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-gray-950 dark:hover:text-gray-200"
                                            title="Rename branch"
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleSidePanelTab('code')}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5 sm:text-sm ${
                        showActivitySidebar && sidePanelTab === 'code'
                          ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                      }`}
                      title="Show code files, Git, and sandboxes"
                    >
                      <Code2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Code</span>
                      {gitState?.detected && (
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {gitState.changedCount || 0}
                          {(gitState.ahead || gitState.behind) ? ` · ${gitState.ahead || 0}/${gitState.behind || 0}` : ''}
                        </span>
                      )}
                    </button>

                    {conversationArtifacts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('artifacts')}
                        className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5 sm:text-sm ${
                          showActivitySidebar && sidePanelTab === 'artifacts'
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                        }`}
                        title="Show artifacts"
                      >
                        <FilePlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Artifacts</span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {conversationArtifacts.length}
                        </span>
                      </button>
                    )}

                    {sourceCatalog.totalCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('media')}
                        className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5 sm:text-sm ${
                          showActivitySidebar && sidePanelTab === 'media'
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                        }`}
                        title="Show all sources and media"
                      >
                        <Image className="h-4 w-4" />
                        <span className="hidden sm:inline">Media</span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {sourceCatalog.totalCount}
                        </span>
                      </button>
                    )}

                    {(persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && (
                      <button
                        type="button"
                        onClick={() => {
                          toggleSidePanelTab('steps');
                        }}
                        className={`hidden h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium transition-colors xl:inline-flex ${
                          showActivitySidebar && sidePanelTab === 'steps'
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                        }`}
                        title="Show steps"
                      >
                        <PanelRightOpen className="h-4 w-4" />
                        Steps
                      </button>
                    )}


                    {savedItemsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('saved')}
                        className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5 sm:text-sm ${
                          showActivitySidebar && sidePanelTab === 'saved'
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                        }`}
                        title="Show bookmarked messages"
                      >
                        <BookMarked className="h-4 w-4" />
                        <span className="hidden sm:inline">Saved</span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {savedItemsCount}
                        </span>
                      </button>
                    )}

                    {effectivePreviewUrl && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('preview')}
                        className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5 sm:text-sm ${
                          showActivitySidebar && sidePanelTab === 'preview'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 midnight:bg-emerald-950/30'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                        }`}
                        title={`Preview: ${effectivePreviewUrl}`}
                      >
                        <span className="relative flex items-center">
                          <Globe className="h-4 w-4" />
                          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="hidden sm:inline">Preview</span>
                      </button>
                    )}

                    {hasConversationContent && (
                      <div ref={exportMenuRef} className="relative">
                        <button
                          onClick={() => setShowExportMenu((v) => !v)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-gray-800"
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
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50"
                        title="Exit Incognito Mode"
                      >
                        <Ghost className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
                      </button>
                    )}

                    {currentConversationId &&
                      conversationTitle && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800 dark:hover:text-red-400 midnight:hover:bg-slate-800"
                            title="Delete conversation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
              <ChatFloatingNav items={chatNavItems} scrollContainerRef={scrollContainerRef} />
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
                    sessionId={agentCurrentSessionId}
                    session={agentCurrentSession}
                    onViewArtifactInPanel={handleViewArtifactInPanel}
                    onPermissionDecision={handleAgentPermission}
                    onAskUserAnswer={handleAgentAskUser}
                    onRetryTool={handleRetryTool}
                    onRunWithAction={handleRunInActionMode}
                    onEditMessage={handleEditConversationTurn}
                    onRegenerateAnswer={handleRegenerateAnswer}
                    onSelectAnswerVariant={handleSelectAnswerVariant}
                    onToggleMessageFlag={handleToggleMessageFlag}
                    onRetryGoal={handleRetryGoal}
                    highlightedMessageId={highlightedMessageId}
                    ttsReady={ttsReady}
                  />
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
                    sessionId={agentCurrentSessionId}
                  />
                </div>
              )}
              <MessageInputV2
                key={`conversation-input-${currentConversationId || 'draft'}-${messageInputResetKey}`}
                onSubmit={handleAgentRun}
                sttReady={sttReady}
                ttsReady={ttsReady}
                voiceMode={voiceMode}
                onToggleVoiceMode={handleToggleVoiceMode}
                autoRecordPrompt={autoRecordAfterTts}
                voiceTtsState={voiceModeTtsState}
                disabled={isProcessing || agentRunning}
                autoFocus={!isProcessing && !agentRunning}
                onReset={handleClearConversation}
                placeholder={
                  agentRunning
                    ? "Agent is working..."
                    : agentTaskRun
                    ? `Reply to the task agent about "${agentTaskRun.cardTitle || 'this task'}"...`
                    : isGhostMode
                    ? "👻 Ghost Mode - Messages won't be saved..."
                    : getVoicePlaceholder(sttReady, ttsReady, "Ask anything...")
                }
                hasMessages={hasConversationContent}
                toolsEnabled={toolsEnabled}
                agentMode={agentMode}
                onToggleAgentMode={() => setToolsEnabled(!toolsEnabled)}
                chatOnlyMode={chatOnlyMode}
                autoApprove={agentAutoApprove}
                onToggleAutoApprove={handleToggleAgentAutoApprove}
                enabledIntegrationTools={enabledIntegrationTools}
                onEnabledIntegrationToolsChange={handleEnabledIntegrationToolsChange}
                reasoningEffort={reasoningEffort}
                onReasoningEffortChange={handleReasoningEffortChange}
                isRunning={agentRunning}
                onStop={handleAgentStop}
                runStartedAt={runStartedAtRef.current}
                externalFileAttachment={externalFileAttachment}
                workingContext={workingContext}
                onWorkingContextChange={setWorkingContext}
                tokenUsage={latestTokenUsage}
                multimodalCapabilities={multimodalCapabilities}
              />
            </div>
          </>
        )}
      </div>

      {showActivitySidebar && (sidePanelTab === 'history' || sidePanelTab === 'saved' || sidePanelTab === 'preview' || sidePanelTab === 'artifacts' || sidePanelTab === 'artifact' || sidePanelTab === 'nav' || sidePanelTab === 'code' || gitState?.detected || sourceCatalog.totalCount > 0 || persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && (
        <aside
          style={{ width: sidePanelWidth }}
          className="hidden xl:flex xl:shrink-0 relative border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700"
        >
          {/* Drag handle — hover shows a subtle line, cursor changes to resize */}
          <div
            onMouseDown={handlePanelDragStart}
            className="absolute left-0 top-0 bottom-0 w-1.5 z-10 cursor-col-resize group hover:bg-indigo-400/20 transition-colors"
            title="Drag to resize"
          >
            <div className="absolute left-0.5 top-1/2 -translate-y-1/2 h-10 w-0.5 rounded-full bg-transparent group-hover:bg-indigo-400 transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <CommandCenterSidePanel
              activeTab={sidePanelTab}
              onBack={handleArtifactPanelBack}
              stepsItems={agentActivityItems}
              stepsLoading={agentLoadingSession}
              isRunning={agentRunning}
              sourceCatalog={sourceCatalog}
              gitState={gitState}
              gitLoading={gitLoading}
              gitError={gitError}
              onGitRefresh={refreshGitState}
              onGitChanged={handleGitChanged}
              onAttachGitFile={handleAttachGitFile}
              workingDir={workingContext?.workingDir || null}
              workingContext={workingContext}
              recentConversations={recentConversations}
              recentConversationsLoading={recentConversationsLoading}
              recentConversationsError={recentConversationsError}
              activeConversationIds={activeConversationIds}
              currentConversationId={currentConversationId}
              onOpenConversation={handleOpenConversation}
              navigate={navigate}
              highlights={conversationHighlights}
              onOpenSavedMessage={handleOpenSavedMessage}
              previewUrl={effectivePreviewUrl}
              artifacts={conversationArtifacts}
              onSelectArtifact={handleViewArtifactInPanel}
              selectedArtifact={selectedArtifact}
              chatNavItems={chatNavItems}
            />
          </div>
        </aside>
      )}

      {showActivitySidebar && (sidePanelTab === 'history' || sidePanelTab === 'saved' || sidePanelTab === 'preview' || sidePanelTab === 'artifacts' || sidePanelTab === 'artifact' || sidePanelTab === 'nav' || sidePanelTab === 'code' || gitState?.detected || sourceCatalog.totalCount > 0 || persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && (
        <div className="fixed inset-0 z-50 flex bg-black/35 xl:hidden">
          <button
            type="button"
            className="flex-1"
            onClick={() => setShowActivitySidebar(false)}
            aria-label="Close side panel"
          />
          <div className="h-full w-[min(24rem,92vw)] border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-950">
            <CommandCenterSidePanel
              activeTab={sidePanelTab}
              onClose={() => setShowActivitySidebar(false)}
              onBack={handleArtifactPanelBack}
              stepsItems={agentActivityItems}
              stepsLoading={agentLoadingSession}
              isRunning={agentRunning}
              sourceCatalog={sourceCatalog}
              gitState={gitState}
              gitLoading={gitLoading}
              gitError={gitError}
              onGitRefresh={refreshGitState}
              onGitChanged={handleGitChanged}
              onAttachGitFile={handleAttachGitFile}
              workingDir={workingContext?.workingDir || null}
              workingContext={workingContext}
              recentConversations={recentConversations}
              recentConversationsLoading={recentConversationsLoading}
              recentConversationsError={recentConversationsError}
              activeConversationIds={activeConversationIds}
              currentConversationId={currentConversationId}
              onOpenConversation={handleOpenConversation}
              navigate={navigate}
              highlights={conversationHighlights}
              onOpenSavedMessage={handleOpenSavedMessage}
              previewUrl={effectivePreviewUrl}
              artifacts={conversationArtifacts}
              onSelectArtifact={handleViewArtifactInPanel}
              selectedArtifact={selectedArtifact}
              chatNavItems={chatNavItems}
            />
          </div>
        </div>
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

      {/* ── Skill-learned floating toast ── */}
      <SkillLearnedToast
        toast={skillToast}
        onDismiss={() => {
          if (skillToastTimerRef.current) clearTimeout(skillToastTimerRef.current);
          setSkillToast(null);
        }}
      />

    </div>
  );
};

export default CommandCenterV2Enhanced;
