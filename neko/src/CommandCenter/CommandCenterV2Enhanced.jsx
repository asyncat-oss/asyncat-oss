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
  lazy,
  Suspense,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageInputV2 } from "./components/input/MessageInputV2";
import AgentRunFeed, { CurrentPlanPanel, buildEventSegments } from './components/agent/AgentRunFeed';
import { extractLocalhostUrl } from './utils/localhostUrl.js';
import CommandCenterSidePanel from './components/sidebars/CommandCenterSidePanel';
import SidePanelSheet from './components/SidePanelSheet.jsx';
import ChatFloatingNav from './components/nav/ChatFloatingNav';
import ConversationLoadingSkeleton from './components/loading/ConversationLoadingSkeleton';
import { useAudioStatus } from "./hooks/useAudioStatus";
import { useAgentNotifications } from './hooks/useAgentNotifications';
import { catsApi } from './api/catsApi.js';
import { useCat } from '../Cats/useCats.js';
import { useCommandCenter } from "./context/CommandCenterContextEnhanced";
import useActiveBrainStatus from "./hooks/useActiveBrainStatus.js";
import { useChatModels } from "./hooks/useChatModels.js";
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx';
import { useToast, errorDetail } from '../components/toastContext.js';
import { useConfirm } from '../components/confirmContext.js';
import { Menu, MenuItem } from '../components/ui/Menu.jsx';
import Popover from '../components/ui/Popover.jsx';
import { useLayer } from '../components/ui/floating.js';
import IconButton from '../components/ui/IconButton.jsx';
import { CONTROL_CLASS } from '../components/ui/Field.jsx';
import { chatApi, agentApi, gitApi } from "./api";
import { aiProviderApi, audioApi } from "../Settings/settingApi.js";
import { cleanReasoningAnswer } from "./utils/reasoningParser.js";
import {
  Code2,
  Edit2,
  Trash2,
  X,
  MessageCircleDashed,
  Download,
  PanelRightOpen,
  GitBranch,
  BookMarked,
  FilePlus,
  Globe,
  Link2,
  SquareTerminal,
  FolderOpen,
  Lightbulb,
  PenLine,
  Search,
  MessageSquareQuote,
  Loader2,
  Check,
} from "lucide-react";
import AgentAvatar from "../Agent/AgentAvatar.jsx";
import { useAgents } from "../Agent/useAgents.js";
import Cat from "../components/ui/Cat.jsx";
import { engineDisplayName, registerEngineNames, resumeCommand } from "../Agent/externalAgentFormat.js";
import { ALWAYS_ALLOW_EVENT, ALWAYS_ALLOW_KEY, alwaysAllowedChatTools } from "../services/chatDefaults.js";
import { FOLLOW_UP_EVENT, MODEL_ACTION_EVENT } from "./components/renderers/interactiveEvents.js";
import { linkedMessageId } from "../sidebar/chatSearch.js";
import { TEMPORARY_CHAT, engineForChat } from "./utils/temporaryChat.js";
import { currentToolName } from "./utils/toolNames.js";
import { agentModelOption, chatModelInfo, metadataWithRunModel, modelEventPatch, modelRef, sameModel } from "./utils/chatModel.js";

import { buildConversationSourceCatalog } from "./utils/conversationUtils.js";
import {
  sanitizeExportFilename,
  formatExportTime,
  triggerExportDownload,
  buildConversationExportEntries,
  buildExportHtmlDocument,
} from "./utils/exportUtils.js";

// The terminal loads the first time its dock opens, not with the app.
const CatChatBanner = lazy(() => import('../Cats/CatChatBanner.jsx'));
const CatWaitingBar = lazy(() => import('../Cats/CatChatBanner.jsx').then((module) => ({ default: module.CatWaitingBar })));
const TerminalPanel = lazy(() => import('./components/sidebars/TerminalPanel'));

const EMPTY_AGENT_EVENTS = [];

function getVoicePlaceholder(sttReady, ttsReady, fallback) {
  if (sttReady && ttsReady) return "Ask anything, or press the mic to talk…";
  if (sttReady) return "Ask anything, or press the mic to dictate…";
  return fallback;
}

// A header button that opens a panel: neutral, and selected while its panel shows.
function panelToggleClass(active, compact = false) {
  return `relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
    compact ? 'h-7 rounded-md px-2 text-xs' : 'h-8 rounded-lg px-2 text-xs sm:px-2.5 sm:text-sm'
  } ${active ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'}`;
}

// A small count beside a header button's label.
const COUNT_CLASS = 'rounded-full bg-hover px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-fg-subtle';

// The rename field in the Branches popover. onDone(name) saves the new name
// and onDone(null) keeps the old one; `fromKey` is true for Enter and Escape.
// Enter or leaving the field saves, and Escape cancels. While it is open it is
// a layer above the popover, so Escape reaches it instead of closing the
// popover (which would blur the field and save the half-typed name).
function BranchNameField({ value, onChange, onDone }) {
  const inputRef = useRef(null);
  const doneRef = useRef(false);
  useLayer(true, inputRef);
  const finish = (name, fromKey) => {
    doneRef.current = true;
    onDone(name, fromKey);
  };
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          // Or the key would also press the rename button that gets focus next.
          e.preventDefault();
          finish(value, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null, true);
        }
      }}
      onBlur={() => {
        if (!doneRef.current) finish(value.trim() ? value : null, false);
      }}
      aria-label="Branch name"
      className={`h-7 px-2 text-xs ${CONTROL_CLASS}`}
      autoFocus
    />
  );
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
      timestamp: msg.timestamp,
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

// ─────────────────────────────────────────────────────────────────────────────

const CommandCenterV2Enhanced = ({ agentSessionId = null }) => {
  const commandCenterContext = useCommandCenter();
  const { workbenchPreferences, setWorkbenchPreference } = useUiPreferences();
  const navigate = useNavigate();
  const toast = useToast();
  // Text to put back in the composer after a send fails (see handleAgentRun).
  const [composerRestore, setComposerRestore] = useState(null);
  const fallbackAgentAbortControllersRef = useRef(new Map());
  const fallbackCurrentConversationIdRef = useRef(null);

  const {
    messages = [],
    isProcessing = false,
    isConversationLoading = false,
    handleClearConversation = () => {},
    currentConversationId = null,
    conversationTitle = "",
    triggerConversationRefresh = () => {},
    setConversationTitle = () => {},
    isTemporaryChat = false,
    toggleTemporaryChat = () => {},
    conversationHistory = [],
    setMessages,
    setConversationHistory,
    setError,
    toolsEnabled,
    setToolsEnabled,
    saveCurrentConversation,
    setCurrentConversationId,
    chatRuns = {},
    updateChatRun = () => {},
    agentAbortControllersRef = fallbackAgentAbortControllersRef,
    currentConversationIdRef = fallbackCurrentConversationIdRef,
    workingContext = null,
    setWorkingContext = () => {},
    conversationMetadata = {},
    setConversationMetadata = () => {},
    pendingSend = null,
    clearPendingSend = () => {},
  } = commandCenterContext || {};

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  const confirm = useConfirm();
  const exportMenuRef = useRef(null);
  const branchMenuRef = useRef(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [branchNameDraft, setBranchNameDraft] = useState('');

  // Chat and Work are one conversation type now. The screen always offers the
  // full surface; each message picks direct chat or the agent (pickRunMode).
  const experienceMode = 'work';
  const [toolsPreference, setToolsPreferenceState] = useState(() => {
    try {
      const saved = localStorage.getItem('asyncat_tools_preference');
      return ['auto', 'on', 'off'].includes(saved) ? saved : 'auto';
    } catch {
      return 'auto';
    }
  });
  const activeBrain = useActiveBrainStatus();
  // Which agent answers: Asyncat's own, or an installed Claude Code / Codex CLI.
  const [selectedEngine, setSelectedEngineState] = useState(() => {
    try { return localStorage.getItem('asyncat_engine') || 'asyncat'; } catch { return 'asyncat'; }
  });
  const [engines, setEngines] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => agentApi.getEngines()
      .then(res => {
        registerEngineNames(res?.engines);
        if (!cancelled) setEngines(res?.engines || []);
      })
      .catch(() => {});
    refresh();
    // Runs report the agents' usage limits, so re-read them after each one.
    window.addEventListener('agent-run-complete', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('agent-run-complete', refresh);
    };
  }, []);
  // The model picked for each coding agent (null = the agent's own default).
  const [engineModels, setEngineModels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('asyncat_engine_models') || '{}') || {}; } catch { return {}; }
  });
  const setEngineModel = useCallback((engine, model) => {
    setEngineModels(prev => {
      const next = { ...prev, [engine]: model || null };
      try { localStorage.setItem('asyncat_engine_models', JSON.stringify(next)); } catch { /* localStorage may be unavailable */ }
      return next;
    });
  }, []);
  const setSelectedEngine = useCallback((value) => {
    setSelectedEngineState(value);
    try { localStorage.setItem('asyncat_engine', value); } catch { /* localStorage may be unavailable */ }
  }, []);
  const setToolsPreference = useCallback((value) => {
    setToolsPreferenceState(value);
    try { localStorage.setItem('asyncat_tools_preference', value); } catch { /* localStorage may be unavailable */ }
  }, []);
  const [showActivitySidebar, setShowActivitySidebar] = useState(() => {
    try {
      return workbenchPreferences.restoreOpenPanels && localStorage.getItem('asyncat_show_command_side_panel') === 'true';
    } catch {
      return false;
    }
  });
  const [sidePanelTab, setSidePanelTab] = useState(() => {
    try {
      const saved = localStorage.getItem('asyncat_command_side_panel_tab');
      return ['steps', 'code', 'media', 'saved', 'preview', 'artifacts', 'nav', 'runtime'].includes(saved) ? saved : 'steps';
    } catch { return 'steps'; }
  });
  const [prevSidePanelTab, setPrevSidePanelTab] = useState('steps');
  const [sidePanelWidth, setSidePanelWidth] = useState(workbenchPreferences.rightDockWidth);
  const [bottomDockHeight, setBottomDockHeight] = useState(workbenchPreferences.bottomDockHeight);
  const [showTerminalDock, setShowTerminalDock] = useState(() => {
    try {
      return workbenchPreferences.restoreOpenPanels && localStorage.getItem('asyncat_show_terminal_dock') === 'true';
    } catch { return false; }
  });
  const [terminalEverOpened, setTerminalEverOpened] = useState(showTerminalDock);
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const panelDragRef = useRef({ active: false, startX: 0, startW: 0 });
  const bottomDockDragRef = useRef({ active: false, startY: 0, startH: 0 });
  const [gitState, setGitState] = useState(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState(null);

  // Migrate any live state left by the former side-panel terminal. The terminal
  // is now exclusively rendered by its dedicated bottom/right dock.
  useEffect(() => {
    if (sidePanelTab !== 'terminal') return;
    setSidePanelTab('steps');
    setShowActivitySidebar(false);
  }, [sidePanelTab]);
  const [externalFileAttachment, setExternalFileAttachment] = useState(null);
  const [multimodalCapabilities, setMultimodalCapabilities] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [runtimeStatusLoading, setRuntimeStatusLoading] = useState(false);
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
  const [selectedAgentMode, setSelectedAgentMode] = useState(() => {
    try {
      // Design mode was retired from the composer; an old saved value falls back.
      const saved = localStorage.getItem('asyncat_agent_mode');
      return ['plan', 'action'].includes(saved) ? saved : null;
    } catch {
      return null;
    }
  });
  const voiceConversationActive = voiceMode && sttReady && ttsReady;
  const voiceAudioRef = useRef(null);
  const [voiceModeTtsState, setVoiceModeTtsState] = useState('idle'); // idle | loading | playing
  const [autoRecordAfterTts, setAutoRecordAfterTts] = useState(false);
  const [alwaysAllowedTools, setAlwaysAllowedTools] = useState(() => new Set(alwaysAllowedChatTools()));
  // Revoked in Settings → Privacy & safety.
  useEffect(() => {
    const reload = () => setAlwaysAllowedTools(new Set(alwaysAllowedChatTools()));
    window.addEventListener(ALWAYS_ALLOW_EVENT, reload);
    return () => window.removeEventListener(ALWAYS_ALLOW_EVENT, reload);
  }, []);
  const [enabledIntegrationTools, setEnabledIntegrationTools] = useState(() => {
    try {
      const stored = localStorage.getItem('asyncat_enabled_integration_tools');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });
  // The agent picked for this chat in the composer (saved with the chat).
  const selectedProfileId = conversationMetadata?.agentProfileId || null;
  // A Cat's chat: messages go to the Cat (see handleAgentRun).
  const { cat: catChat } = useCat(conversationMetadata?.catId || null);
  const { agents } = useAgents();
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedProfileId) || null, [agents, selectedProfileId]);
  const setSelectedAgent = useCallback((agentId) => {
    setConversationMetadata({ ...(conversationMetadata || {}), agentProfileId: agentId || null });
  }, [conversationMetadata, setConversationMetadata]);
  // The model this chat runs on: its own (kept in its metadata), else the
  // default, which new chats start on (utils/chatModel.js).
  const { options: modelOptions, loaded: modelOptionsLoaded, refresh: refreshModelOptions } = useChatModels({ loadedFile: activeBrain.loadedLocalModel });
  const chatModel = useMemo(() => chatModelInfo({
    chatRef: conversationMetadata?.model,
    defaultRef: activeBrain.defaultRef,
    options: modelOptions,
    fallback: activeBrain,
    loaded: modelOptionsLoaded,
  }), [activeBrain, conversationMetadata?.model, modelOptions, modelOptionsLoaded]);
  // An agent with a model of its own answers with it instead.
  const agentModel = useMemo(() => {
    const option = agentModelOption(selectedAgent, modelOptions);
    return option ? { ...option, name: option.label, agentName: selectedAgent.name } : null;
  }, [modelOptions, selectedAgent]);
  const answeringModel = agentModel || chatModel;
  const [savingChatModel, setSavingChatModel] = useState(false);
  const conversationMetadataRef = useRef(conversationMetadata);
  conversationMetadataRef.current = conversationMetadata;
  // Picking a model changes this chat only, and new chats start with it: a
  // saved chat keeps it on the server (which makes it the default too), a new
  // one keeps it until its first message and makes it the default now, and a
  // temporary chat keeps it to itself. Nothing loads until a message is sent.
  const handleChatModelChange = useCallback(async (option) => {
    const ref = modelRef(option?.ref ? { ...option.ref, name: option.label } : null);
    if (!ref) return;
    const previous = conversationMetadataRef.current?.model || null;
    if (sameModel(previous, ref)) return;
    const conversationId = currentConversationId;
    const withModel = (model) => (prev) => {
      const next = { ...(prev || {}) };
      if (model) next.model = model;
      else delete next.model;
      return next;
    };
    setConversationMetadata(withModel(ref));
    if (isTemporaryChat) return;
    setSavingChatModel(true);
    try {
      if (conversationId) await chatApi.setChatModel(conversationId, ref);
      else await aiProviderApi.setDefaultModel(ref);
      window.dispatchEvent(new CustomEvent('asyncat-model-runtime-updated'));
    } catch (err) {
      if (currentConversationIdRef.current === conversationId) setConversationMetadata(withModel(previous));
      toast.error("Couldn't switch the model", { detail: errorDetail(err) });
    } finally {
      setSavingChatModel(false);
    }
  }, [currentConversationId, currentConversationIdRef, isTemporaryChat, setConversationMetadata, toast]);
  const [agentLoadingSession, setAgentLoadingSession] = useState(false);
  // Track whether we're on an xl+ (≥1280px) viewport so we can skip mounting
  // the mobile-overlay SidePanel on desktop. CSS display:none alone is NOT
  // enough — a hidden <webview> still runs JS and plays audio in Electron.
  const [isXLScreen, setIsXLScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const handler = (e) => setIsXLScreen(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  // Brain stats (welcome screen ambient indicator)
  const currentRunKey = currentConversationId || '__draft__';
  const currentRun = chatRuns[currentRunKey] || {};
  const agentMode = selectedAgentMode || (toolsEnabled ? 'action' : 'plan');
  const agentRunning = Boolean(currentRun.running);
  const agentEvents = currentRun.events || EMPTY_AGENT_EVENTS;
  const agentCurrentGoal = currentRun.goal || '';
  const agentCurrentSessionId = currentRun.sessionId || null;
  // A temporary chat's run is never saved, so the server has no changes,
  // plan or undo to show for it.
  const savedSessionId = isTemporaryChat ? null : agentCurrentSessionId;
  const agentCurrentSession = currentRun.session || null;
  const agentConversationHistory = currentRun.conversationHistory || [];
  const agentStreamingText = currentRun.streamingText || '';
  const agentStreamingReasoning = currentRun.streamingReasoning || '';
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
  useEffect(() => {
    const derivedMode = toolsEnabled ? 'action' : 'plan';
    if (selectedAgentMode !== derivedMode) setSelectedAgentMode(derivedMode);
  }, [selectedAgentMode, setToolsEnabled, toolsEnabled]);
  const handleAgentModeChange = useCallback((nextMode) => {
    const mode = nextMode === 'plan' ? 'plan' : 'action';
    setSelectedAgentMode(mode);
    setToolsEnabled(mode !== 'plan');
    try { localStorage.setItem('asyncat_agent_mode', mode); } catch { /* localStorage may be unavailable */ }
  }, [setToolsEnabled]);
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
  const pendingInputInteraction = useMemo(() => {
    for (let i = agentEvents.length - 1; i >= 0; i--) {
      const event = agentEvents[i];
      // An answer event means the agent resolved this turn — no pending interactions before it
      if (event?.type === 'answer') break;
      if (event?.type === 'ask_user' && !event.data?.answered && !event.data?._inferred_answered) {
        return { type: 'ask_user', data: event.data };
      }
      if (event?.type === 'permission_request' && !event.data?.resolved && !event.data?.historical) {
        return { type: 'permission_request', data: event.data };
      }
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

  const loadRuntimeStatus = useCallback(async () => {
    setRuntimeStatusLoading(true);
    try {
      const res = await agentApi.getModelStatus();
      setRuntimeStatus(res || null);
    } catch {
      setRuntimeStatus(null);
    } finally {
      setRuntimeStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showActivitySidebar || sidePanelTab !== 'runtime') return;
    loadRuntimeStatus();
    const interval = setInterval(loadRuntimeStatus, 30000);
    window.addEventListener('asyncat-model-runtime-updated', loadRuntimeStatus);
    window.addEventListener('asyncat-visual-models-updated', loadRuntimeStatus);
    window.addEventListener('asyncat-audio-models-updated', loadRuntimeStatus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('asyncat-model-runtime-updated', loadRuntimeStatus);
      window.removeEventListener('asyncat-visual-models-updated', loadRuntimeStatus);
      window.removeEventListener('asyncat-audio-models-updated', loadRuntimeStatus);
    };
  }, [loadRuntimeStatus, showActivitySidebar, sidePanelTab]);


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
            streamingReasoning: '',
            events: [{ type: 'error', data: { message: 'Agent session not found.' } }],
          });
          return;
        }

        const firstGoalLine = String(session.goal || '').split('\n').find(Boolean) || '';
        const displayGoal = firstGoalLine || session.goal || '';
        setConversationTitle(displayGoal || 'Agent run');
        const events = buildAgentEventsFromSession(session, auditResult?.audit || []);
        updateChatRun(runKey, {
          goal: displayGoal,
          sessionId: session.id,
          session,
          running: session.status === 'active',
          streamingText: '',
          streamingReasoning: '',
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
          streamingReasoning: '',
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

  // Scrolls a message into the middle of the chat and highlights it briefly.
  // False when it isn't on screen (yet).
  const jumpToMessage = useCallback((messageId, { smooth = true } = {}) => {
    const container = scrollContainerRef.current;
    if (!messageId || !container) return false;
    const selector = typeof CSS !== 'undefined' && CSS.escape
      ? `[data-message-id="${CSS.escape(messageId)}"]`
      : `[data-message-id="${String(messageId).replace(/"/g, '\\"')}"]`;
    const findTarget = () => container.querySelector(selector);
    const target = findTarget();
    if (!target) return false;

    setHighlightedMessageId(messageId);
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center', inline: 'nearest' });
    if (window.innerWidth < 1280) {
      setShowActivitySidebar(false);
    }
    if (!smooth) {
      // Pictures and code above it can still change height as they render:
      // put it back in view once they have.
      window.setTimeout(() => {
        const node = findTarget();
        if (!node) return;
        const box = node.getBoundingClientRect();
        const view = container.getBoundingClientRect();
        if (box.bottom < view.top + 40 || box.top > view.bottom - 40) {
          node.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        }
      }, 400);
    }
    window.setTimeout(() => {
      setHighlightedMessageId(current => (current === messageId ? null : current));
    }, 1500);
    return true;
  }, []);

  const handleOpenSavedMessage = useCallback((messageId) => {
    jumpToMessage(messageId);
  }, [jumpToMessage]);

  useEffect(() => {
    if (messages.length > 0) {
      const isLastMessageUser = messages[messages.length - 1]?.type === "user";
      requestAnimationFrame(() => {
        setTimeout(() => scrollToBottom(isLastMessageUser), 100);
      });
    }
  }, [messages, scrollToBottom]);

  const refreshGitState = useCallback(async () => {
    if (!workingContext?.workingDir) {
      setGitState(null);
      setGitError(null);
      setGitLoading(false);
      return;
    }
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
    if (tab === 'terminal') {
      if (!workingContext?.workingDir) return;
      setTerminalEverOpened(true);
      setShowTerminalDock((open) => {
        const next = !open;
        try { localStorage.setItem('asyncat_show_terminal_dock', String(next)); } catch { /* localStorage may be unavailable */ }
        return next;
      });
      return;
    }
    if (tab === 'code' && !workingContext?.workingDir) return;
    setShowActivitySidebar(prev => {
      const shouldClose = prev && sidePanelTab === tab;
      const next = !shouldClose;
      if (next) {
        setSidePanelTab(tab);
        try { localStorage.setItem('asyncat_command_side_panel_tab', tab); } catch { /* localStorage may be unavailable */ }
      }
      try { localStorage.setItem('asyncat_show_command_side_panel', String(next)); } catch { /* localStorage may be unavailable */ }
      return next;
    });
  }, [sidePanelTab, workingContext?.workingDir]);

  useEffect(() => {
    if (workingContext?.workingDir) return;
    setShowTerminalDock(false);
    if (sidePanelTab === 'code') {
      setShowActivitySidebar(false);
      setSidePanelTab('steps');
    }
  }, [sidePanelTab, workingContext?.workingDir]);

  useEffect(() => {
    setSidePanelWidth(workbenchPreferences.rightDockWidth);
  }, [workbenchPreferences.rightDockWidth]);

  useEffect(() => {
    setBottomDockHeight(workbenchPreferences.bottomDockHeight);
  }, [workbenchPreferences.bottomDockHeight]);

  // Workbench shortcut: Ctrl/Cmd + ` toggles the interactive terminal dock.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        toggleSidePanelTab('terminal');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidePanelTab]);

  // Closing the side panel is remembered, as opening it is, on any width.
  const closeSidePanel = useCallback(() => {
    setShowActivitySidebar(false);
    try { localStorage.setItem('asyncat_show_command_side_panel', 'false'); } catch { /* localStorage may be unavailable */ }
  }, []);

  const openRuntimePanel = useCallback(() => {
    setSidePanelTab('runtime');
    setShowActivitySidebar(true);
    try { localStorage.setItem('asyncat_show_command_side_panel', 'true'); } catch { /* localStorage may be unavailable */ }
    loadRuntimeStatus();
  }, [loadRuntimeStatus]);

  // Drag-to-resize side panel
  useEffect(() => {
    const onMove = (e) => {
      const d = panelDragRef.current;
      if (d.active) {
        const dx = d.startX - e.clientX;
        const w = Math.max(320, Math.min(window.innerWidth * 0.5, d.startW + dx));
        d.currentW = w;
        setSidePanelWidth(w);
      }
      const bottom = bottomDockDragRef.current;
      if (bottom.active) {
        const dy = bottom.startY - e.clientY;
        const h = Math.max(180, Math.min(window.innerHeight * 0.65, bottom.startH + dy));
        bottom.currentH = h;
        setBottomDockHeight(h);
      }
    };
    const onUp = () => {
      if (panelDragRef.current.active && panelDragRef.current.currentW) {
        setWorkbenchPreference('rightDockWidth', panelDragRef.current.currentW);
      }
      if (bottomDockDragRef.current.active && bottomDockDragRef.current.currentH) {
        setWorkbenchPreference('bottomDockHeight', bottomDockDragRef.current.currentH);
      }
      panelDragRef.current.active = false;
      bottomDockDragRef.current.active = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [setWorkbenchPreference]);

  const handlePanelDragStart = useCallback((e) => {
    panelDragRef.current = { active: true, startX: e.clientX, startW: sidePanelWidth, currentW: sidePanelWidth };
    e.preventDefault();
  }, [sidePanelWidth]);

  const handleBottomDockDragStart = useCallback((event) => {
    bottomDockDragRef.current = { active: true, startY: event.clientY, startH: bottomDockHeight, currentH: bottomDockHeight };
    event.preventDefault();
  }, [bottomDockHeight]);

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

  // An artifact open in the side panel belongs to its chat: switching chats
  // closes it (its Download and Delete would act on the other chat's note).
  const artifactChatRef = useRef(currentConversationId);
  useEffect(() => {
    if (artifactChatRef.current === currentConversationId) return;
    artifactChatRef.current = currentConversationId;
    setSelectedArtifact(null);
    setSidePanelTab(prev => (prev === 'artifact' ? prevSidePanelTab : prev));
  }, [currentConversationId, prevSidePanelTab]);

  const handleGitChanged = useCallback(() => {
    refreshGitState();
  }, [refreshGitState]);

  const handleAttachGitFile = useCallback((file) => {
    if (!workingContext?.rootId) return;
    const basePath = workingContext?.relativePath && workingContext.relativePath !== '.'
      ? workingContext.relativePath.replace(/\/+$/, '')
      : '';
    const scopedPath = basePath && file?.path && !String(file.path).startsWith(`${basePath}/`)
      ? `${basePath}/${file.path}`
      : file?.path;
    setExternalFileAttachment({
      ...file,
      rootId: workingContext.rootId,
      path: scopedPath,
      nonce: Date.now(),
    });
  }, [workingContext?.relativePath, workingContext?.rootId]);

  const modelSeesImages = Boolean(
    answeringModel.capabilities?.supportsImageInput
      ?? (multimodalCapabilities?.vision?.supportsImageInput || multimodalCapabilities?.vision?.ready),
  );
  const handleDrop = useCallback((e) => {
    // A folder isn't an attachment: let it through to make a project of it.
    if (e.dataTransfer.items?.[0]?.webkitGetAsEntry?.()?.isDirectory) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    const file = files[0]; // handle one file at a time — matches externalFileAttachment (single)
    // The desktop app knows the real path; browsers don't.
    const absPath = window.electronAPI?.getPathForFile?.(file) || file.path || null;
    if (file.type.startsWith('image/')) {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(file.type || '').toLowerCase())) {
        setError('Image input supports PNG, JPEG, WebP, and GIF files.');
        return;
      }
      if (Number(file.size || 0) > 5_000_000) {
        setError('Each prompt image must be 5 MB or smaller.');
        return;
      }
      if (!modelSeesImages) {
        setError("This chat's model can't read images. Pick a model that can.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setExternalFileAttachment({
          name: file.name,
          type: 'image',
          mime: file.type,
          size: file.size,
          dataUrl: ev.target.result,
          path: absPath || `prompt://${Date.now()}-${file.name}`,
          nonce: Date.now(),
          promptOnly: true,
        });
      };
      reader.readAsDataURL(file);
    } else if (file.size < 500_000 && (file.type.startsWith('text/') || file.name.match(/\.(md|txt|js|ts|jsx|tsx|py|json|yaml|yml|sh|css|html|xml|csv|log|conf|env|toml|rs|go|java|cpp|c|h)$/i))) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setExternalFileAttachment({
          name: file.name,
          type: 'text',
          content: ev.target.result,
          path: absPath || `prompt://${Date.now()}-${file.name}`,
          mime: file.type,
          size: file.size,
          nonce: Date.now(),
          promptOnly: true,
        });
      };
      reader.readAsText(file);
    } else {
      // Binary or large file — pass path/name only
      setExternalFileAttachment({
        name: file.name,
        type: 'file',
        path: absPath || `prompt://${Date.now()}-${file.name}`,
        size: file.size,
        mime: file.type,
        nonce: Date.now(),
        promptOnly: true,
      });
    }
  }, [modelSeesImages, setError]);

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
      streamingReasoning: '',
      running: false,
    }));

    if (!isTemporaryChat && currentConversationId) {
      await saveCurrentConversation({
        messages: nextMessages,
        conversationId: currentConversationId,
        metadata: nextMetadata,
      });
    }
  }, [
    currentConversationId,
    isTemporaryChat,
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
    if (!isTemporaryChat && currentConversationId) {
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
    isTemporaryChat,
    messages,
    saveCurrentConversation,
    setConversationMetadata,
  ]);

  // Ends a branch rename: saves `name`, or keeps the old name when it is null.
  // After Enter or Escape, focus goes back to that branch's rename button, so
  // a second Escape closes the popover.
  const finishBranchRename = useCallback((branchId, name, fromKey) => {
    const finish = () => {
      if (name) {
        handleRenameBranch(branchId, name);
      } else {
        setEditingBranchId(null);
        setBranchNameDraft('');
      }
    };
    if (!fromKey) {
      finish();
      return;
    }
    flushSync(finish);
    document.querySelector(`[data-branch-rename="${CSS.escape(branchId)}"]`)?.focus({ preventScroll: true });
  }, [handleRenameBranch]);

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
        toast.error("Couldn't rename the chat", { detail: errorDetail(error) });
      }
    }
    setIsEditingTitle(false);
  }, [
    editTitle,
    conversationTitle,
    currentConversationId,
    setConversationTitle,
    triggerConversationRefresh,
    toast,
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
      toast.error("Couldn't delete the chat", { detail: errorDetail(error) });
    }
  }, [
    currentConversationId,
    handleClearConversation,
    navigate,
    triggerConversationRefresh,
    toast,
  ]);

  // The trash button in the header: the same question the sidebar asks.
  const askDeleteConversation = useCallback(async () => {
    const ok = await confirm({
      title: 'Delete chat?',
      message: `"${conversationTitle || 'Untitled conversation'}" will be moved to Trash, where you can restore it.`,
      confirmLabel: 'Move to Trash',
      destructive: true,
    });
    if (ok) handleDeleteConversation();
  }, [confirm, conversationTitle, handleDeleteConversation]);

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
    // A Cat's chat: the message goes to the Cat, which answers here when its
    // run ends (the chat refreshes live).
    if (conversationMetadata?.catId && !runOptions.regenerateAssistantMessageId && !runOptions.baseMessages) {
      try {
        await catsApi.wake(conversationMetadata.catId, submittedGoal);
      } catch (catError) {
        toast.error("Couldn't send it to the Cat", { detail: errorDetail(catError) });
        if (runOptions?.fromComposer) {
          setComposerRestore({ text: submittedGoal });
          throw catError;
        }
      }
      return;
    }
    const runExperienceMode = runOptions.experienceMode || experienceMode;
    // A conversation keeps the engine it started with; new ones use the picker.
    const runEngine = engineForChat(runOptions.engine || conversationMetadata?.engine || (messages.length > 0 ? 'asyncat' : selectedEngine), isTemporaryChat);
    const isExternalEngine = runEngine !== 'asyncat';
    const isDirectChat = runExperienceMode === 'chat' && !isExternalEngine;
    const agentMentions = isDirectChat ? [] : (Array.isArray(messageObj?.agentMentions) ? messageObj.agentMentions : []);
    const fileAttachments = Array.isArray(messageObj?.fileAttachments) ? messageObj.fileAttachments : [];
    const requestedIntegrationTools = Array.isArray(runOptions.enabledIntegrationTools)
      ? runOptions.enabledIntegrationTools
      : Array.isArray(messageObj?.enabledIntegrationTools)
        ? messageObj.enabledIntegrationTools
        : enabledIntegrationTools;
    const runEnabledIntegrationTools = isDirectChat ? [] : requestedIntegrationTools;
    const selectedReasoningEffort = runOptions.reasoningEffort || messageObj?.reasoningEffort || reasoningEffort || 'auto';
    const leadingProfileMention = getLeadingProfileMention(submittedGoal, agentMentions);
    const effectiveProfileId = leadingProfileMention?.id || selectedProfileId;
    let runKey = currentRunKey;
    let runConversationId = currentConversationId;
    const isFirstExchangeOfNewConversation = !currentConversationId && messages.length === 0;
    const runMessages = Array.isArray(runOptions.baseMessages) ? runOptions.baseMessages : messages;
    const effectiveAgentMode = isDirectChat
      ? 'chat'
      : runOptions.agentMode || (runOptions.enableTools === true ? 'action' : runOptions.enableTools === false ? 'plan' : agentMode);
    const effectiveToolsEnabled = !isDirectChat && effectiveAgentMode === 'action';
    const activeWorkingContext = isDirectChat ? null : (workingContext || null);
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
    // The chat's own model, else the default as the composer shows it. Claude
    // Code, Codex and other outside agents use their own.
    const runModel = isExternalEngine ? null : (modelRef(runMetadata?.model) || chatModel.ref || null);
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
      experienceMode: runExperienceMode,
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
      experienceMode: runExperienceMode,
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
        timestamp: submittedAt,
        toolsEnabled: effectiveToolsEnabled,
        agentMode: effectiveAgentMode,
        experienceMode: runExperienceMode,
        reasoningEffort: selectedReasoningEffort,
        enabledIntegrationTools: runEnabledIntegrationTools,
        agentMentions,
        fileAttachments,
        workingContext: activeWorkingContext,
        branchId: runBranchId,
      },
    ];

    setError(null);
    const runStartedAt = Date.now();
    if (runConversationId === currentConversationIdRef.current) {
      setMessages(optimisticMessages);
      setConversationHistory(optimisticConversationHistory);
    }

    // Show the chat's engine from the first message on; otherwise the composer
    // falls back to Asyncat's model until the first answer is saved.
    if (runConversationId === currentConversationIdRef.current && conversationMetadata?.engine !== runEngine) {
      setConversationMetadata({ ...(conversationMetadata || {}), engine: runEngine });
    }

    if (!isTemporaryChat) {
      try {
        const saveResult = await saveCurrentConversation({
          messages: optimisticMessages,
          conversationId: runConversationId,
          mode: runExperienceMode,
          metadata: {
            ...(runMetadata || {}),
            activeBranchId: runBranchId,
            experienceMode: runExperienceMode,
            engine: runEngine,
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
        setMessages(runMessages);
        setConversationHistory(activeConversationHistory);
        toast.error("Couldn't save your message, so it wasn't sent", { detail: errorDetail(saveError) });
        if (runOptions?.fromComposer) {
          // Sending swaps the start screen's composer for the conversation's,
          // and the revert swaps it back, so the typed text was lost. Hand it
          // to whichever composer is mounted now, and rethrow so one that
          // stayed mounted keeps its text too.
          setComposerRestore({ text: submittedGoal });
          throw saveError;
        }
        return;
      }
    }

    updateChatRun(runKey, prev => {
      const baseEvents = prev.events?.length ? prev.events : buildEventsFromMessages(runMessages);
      return {
        ...prev,
        goal: submittedGoal,
        running: true,
        // Kept with the run, so another chat's run never lends its start time.
        startedAt: runStartedAt,
        streamingText: '',
        streamingReasoning: '',
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
    let runSessionId = isDirectChat ? null : agentCurrentSessionId;
    let doneExternalSessionId = null;
    let doneWorkingDir = null;
    // The model the run said it uses ("chat_model"), unless an agent's own.
    let ranOnModel = null;
    const runEvents = [
      { type: 'user_goal', data: userGoalEventData },
    ];

    try {
      const eventStream = isDirectChat
        ? chatApi.runStream(submittedGoal, activeConversationHistory, controller.signal, {
            reasoningEffort: selectedReasoningEffort,
            fileAttachments,
            projectId: workingContext?.projectId || null,
            profileId: effectiveProfileId || null,
            conversationId: isTemporaryChat ? null : runConversationId,
            ephemeral: isTemporaryChat,
            model: runModel,
          })
        // maxRounds is left to the agent (or the default); it used to be
        // fixed at 25 here, which overrode every agent's own setting.
        : agentApi.runStream(submittedGoal, activeConversationHistory, activeWorkingContext?.workingDir || null, null, controller.signal, runOptions.continueSessionId !== undefined ? runOptions.continueSessionId : agentCurrentSessionId, {
        autoApprove: effectiveAgentMode === 'action' ? agentAutoApprove : false,
        preApprovedTools: effectiveAgentMode === 'action' ? [...alwaysAllowedTools] : [],
        profileId: effectiveProfileId,
        agentMentions,
        fileAttachments,
        workingContext: activeWorkingContext,
        enableTools: effectiveToolsEnabled,
        agentMode: effectiveAgentMode,
        experienceMode: runExperienceMode,
        reasoningEffort: selectedReasoningEffort,
        enabledIntegrationTools: runEnabledIntegrationTools,
        conversationId: runConversationId,
        userMessageId,
        assistantMessageId,
        clientTimestamp: submittedAt,
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        engine: runEngine,
        externalSessionId: isExternalEngine ? (runMetadata?.externalSessions?.[runEngine] || null) : null,
        // A chat opened from a Claude Code or Codex session keeps working in that session's folder.
        externalCwd: isExternalEngine ? (runMetadata?.externalCwd || null) : null,
        engineModel: isExternalEngine ? (engineModels[runEngine] || null) : null,
        model: runModel,
        ephemeral: isTemporaryChat,
      });
      for await (const event of eventStream) {
        if (controller.signal.aborted) break;
        // "Loading <model>…" in the composer while a local model loads for
        // this run; a chat without a model of its own keeps the one it ran on.
        const modelPatch = modelEventPatch(event);
        if (modelPatch) {
          updateChatRun(runKey, modelPatch);
          if (event.type === 'chat_model' && event.data?.source !== 'agent') {
            ranOnModel = event.data;
            if (runConversationId === currentConversationIdRef.current) {
              setConversationMetadata((prev) => metadataWithRunModel(prev, event.data));
            }
          }
          continue;
        }
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
        if (event.type === 'reasoning_delta') {
          updateChatRun(runKey, prev => ({ ...prev, streamingReasoning: (prev.streamingReasoning || '') + (event.data?.content || '') }));
          continue;
        }
        if (event.type === 'thinking') {
          updateChatRun(runKey, prev => ({ ...prev, streamingText: cleanReasoningAnswer(prev.streamingText || ''), streamingReasoning: '' }));
        } else if (event.type === 'tool_start' || event.type === 'answer') {
          updateChatRun(runKey, { streamingText: '', streamingReasoning: '' });
        }
        if (event.type === 'done') {
          if (event.data?.sessionId) {
            runSessionId = event.data.sessionId;
            updateChatRun(runKey, { sessionId: event.data.sessionId });
          }
          if (event.data?.externalSessionId) doneExternalSessionId = event.data.externalSessionId;
          if (event.data?.workingDir) doneWorkingDir = event.data.workingDir;
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
            ['write_file', 'create_file', 'edit_file', 'apply_patch', 'create_directory', 'file_delete', 'delete_file', 'file_copy', 'copy_file', 'file_move', 'move_file', 'run_command', 'run_python', 'run_node'].includes(currentToolName(resultTool))
          ) {
            refreshGitState();
          }
          runEvents.push(event);
          const incomingToolCallId = event.data?.toolCallId || null;
          const isSameToolCall = (candidate) => (incomingToolCallId
            ? candidate.data?.toolCallId === incomingToolCallId
            : candidate.data?.tool === event.data?.tool);
          // Attach the result to the saved events now, not inside the state
          // updater: React runs that later, and a quick run can be saved first.
          for (let j = runEvents.length - 1; j >= 0; j--) {
            if (runEvents[j].type === 'tool_start' && isSameToolCall(runEvents[j]) && runEvents[j].result === undefined) {
              runEvents[j] = { ...runEvents[j], result: event.data?.result, completedAt };
              break;
            }
          }
          updateChatRun(runKey, prev => {
            const updated = [...(prev.events || [])];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].type === 'tool_start' && isSameToolCall(updated[i]) && updated[i].result === undefined) {
                updated[i] = { ...updated[i], result: event.data?.result, completedAt };
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
        if (event.type === 'preview_url') {
          const url = event.data?.url;
          if (url) {
            setManualPreviewRequest({
              url,
              // Set when the agent already opened the page in one of its tabs.
              tabId: event.data?.tabId || null,
              id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            });
            setShowActivitySidebar(true);
            setSidePanelTab('preview');
            try { localStorage.setItem('asyncat_show_command_side_panel', 'true'); } catch { /* storage may be unavailable */ }
          }
        }

        const eventWithMode = event.type === 'answer'
          ? { ...event, data: { ...event.data, toolsEnabled: effectiveToolsEnabled, agentMode: effectiveAgentMode, experienceMode: runExperienceMode } }
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
          streamingReasoning: '',
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
        const answeredAt = new Date().toISOString();
        const nextHistory = [
          ...optimisticConversationHistory,
          { role: 'assistant', content: capturedFinalAnswer, timestamp: answeredAt, toolsEnabled: effectiveToolsEnabled, agentMode: effectiveAgentMode, experienceMode: runExperienceMode, reasoningEffort: selectedReasoningEffort, agentSessionId: runSessionId, branchId: runBranchId },
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
          timestamp: answeredAt,
          agentSessionId: runSessionId,
          toolsEnabled: effectiveToolsEnabled,
          agentMode: effectiveAgentMode,
          experienceMode: runExperienceMode,
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
        // The chat's model as it is now: picked during the run, else the one
        // it ran on.
        const keptModel = (runConversationId === currentConversationIdRef.current ? conversationMetadataRef.current?.model : null)
          || runMetadata?.model
          || metadataWithRunModel({}, ranOnModel)?.model
          || null;
        const finalMetadata = {
          ...(runMetadata || {}),
          ...(keptModel ? { model: keptModel } : {}),
          activeBranchId: runBranchId,
          experienceMode: runExperienceMode,
          engine: runEngine,
          ...(doneExternalSessionId
            ? { externalSessions: { ...(runMetadata?.externalSessions || {}), [runEngine]: doneExternalSessionId } }
            : {}),
          // Where the session lives, for "Continue in terminal".
          ...(isExternalEngine && doneWorkingDir ? { externalRunDir: doneWorkingDir } : {}),
          ...(shouldPersistCompactedHistory ? { compactedConversationHistory: nextHistory } : {}),
        };
        if (runConversationId === currentConversationIdRef.current) {
          setMessages(finalMessages);
        }
        updateChatRun(runKey, prev => ({
          ...prev,
          events: buildEventsFromMessages(finalMessages),
          conversationHistory: nextHistory,
        }));

        if (!isTemporaryChat) {
          await saveCurrentConversation({
            messages: finalMessages,
            conversationId: runConversationId,
            mode: runExperienceMode,
            metadata: finalMetadata,
          });
        }
        if (runConversationId === currentConversationIdRef.current) {
          setConversationMetadata(finalMetadata);
        }

        // Generate an AI title after the first exchange of a new conversation
        if (isFirstExchangeOfNewConversation && runConversationId && !isTemporaryChat) {
          chatApi.generateTitle(submittedGoal, capturedFinalAnswer)
            .then(res => {
              if (res?.title) {
                setConversationTitle(res.title);
                return chatApi.updateConversation(runConversationId, { title: res.title });
              }
            })
            .then(() => triggerConversationRefresh())
            .catch(() => {}); // non-fatal — instant title stays if this fails
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
          setError(isDirectChat ? 'Chat failed' : 'Agent run failed');
        }
      }
      updateChatRun(runKey, { streamingText: '', streamingReasoning: '', running: false, modelLoading: null });
      agentAbortControllersRef.current.delete(runKey);
      window.dispatchEvent(new CustomEvent('agent-run-complete'));
    }
  }, [
    toast,
    selectedEngine,
    engineModels,
    chatModel.ref,
    setConversationMetadata,
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
    experienceMode,
    activeBranchId,
    conversationMetadata,
    currentConversationId,
    messages,
    isTemporaryChat,
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
  ]);

  // Applied by the mounted composer on this commit; clear it so a later,
  // freshly mounted composer does not refill it.
  useEffect(() => {
    if (!composerRestore) return undefined;
    const frame = requestAnimationFrame(() => setComposerRestore(null));
    return () => cancelAnimationFrame(frame);
  }, [composerRestore]);

  // The composer's submit: on a failed save it gets the error back (see
  // handleAgentRun), so it keeps the typed message instead of clearing it.
  // Each message goes to the agent when it can help (a project is open, the
  // model can call tools, a profile is mentioned or a file is attached) and to
  // direct chat otherwise, which small local models handle far better.
  const pickRunMode = useCallback((messageObj) => {
    if ((conversationMetadata?.engine || (messages.length > 0 ? 'asyncat' : selectedEngine)) !== 'asyncat') return 'work';
    const attachments = Array.isArray(messageObj?.fileAttachments) ? messageObj.fileAttachments : [];
    if (attachments.some(file => file?.type && file.type !== 'image')) return 'work';
    if (toolsPreference === 'on') return 'work';
    if (toolsPreference === 'off') return 'chat';
    if (workingContext?.workingDir) return 'work';
    if (Array.isArray(messageObj?.agentMentions) && messageObj.agentMentions.length > 0) return 'work';
    return answeringModel.supportsTools ? 'work' : 'chat';
  }, [answeringModel.supportsTools, conversationMetadata?.engine, messages.length, selectedEngine, toolsPreference, workingContext?.workingDir]);

  const handleComposerSubmit = useCallback(
    (messageObj) => handleAgentRun(messageObj, { fromComposer: true, experienceMode: pickRunMode(messageObj) }),
    [handleAgentRun, pickRunMode],
  );

  // A message typed elsewhere (a project page's "Start a chat") is sent once
  // the new chat has opened with its project.
  useEffect(() => {
    if (!pendingSend?.text || messages.length > 0 || agentRunning) return;
    const text = pendingSend.text;
    clearPendingSend();
    handleComposerSubmit({ content: text, agentMentions: [], reasoningEffort: 'auto', enabledIntegrationTools: [] });
  }, [agentRunning, clearPendingSend, handleComposerSubmit, messages.length, pendingSend]);

  // A follow-up button under an answer in this chat sends its text as the
  // next message.
  useEffect(() => {
    const onFollowUp = (event) => {
      if (!scrollContainerRef.current?.contains(event.target)) return;
      const text = String(event.detail?.text || '').trim();
      if (!text || agentRunning) return;
      handleComposerSubmit({ content: text, agentMentions: [], reasoningEffort: 'auto', enabledIntegrationTools });
    };
    document.addEventListener(FOLLOW_UP_EVENT, onFollowUp);
    return () => document.removeEventListener(FOLLOW_UP_EVENT, onFollowUp);
  }, [agentRunning, enabledIntegrationTools, handleComposerSubmit]);

  // The buttons under a model error in this chat: "Pick another model" opens
  // the composer's model menu, "Open Models" the Models page.
  const [modelMenuRequest, setModelMenuRequest] = useState(0);
  useEffect(() => {
    const onModelAction = (event) => {
      if (!scrollContainerRef.current?.contains(event.target)) return;
      if (event.detail?.action === 'models') navigate('/models');
      else setModelMenuRequest((count) => count + 1);
    };
    document.addEventListener(MODEL_ACTION_EVENT, onModelAction);
    return () => document.removeEventListener(MODEL_ACTION_EVENT, onModelAction);
  }, [navigate]);

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
      streamingReasoning: '',
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
    if (!isTemporaryChat && currentConversationId) {
      await saveCurrentConversation({
        messages: nextMessages,
        conversationId: currentConversationId,
        metadata: nextMetadata,
      });
    }
  }, [
    conversationMetadata,
    currentConversationId,
    isTemporaryChat,
    saveCurrentConversation,
    setConversationHistory,
    setCurrentChatRun,
    setMessages,
  ]);

  const handleToggleMessageFlag = useCallback((messageId, field, value) => {
    if (!messageId) return;
    if (field === 'rating') {
      // 👍 / 👎 on the answer as shown (its version); the same again takes it
      // back. 👍 answers can teach a model in Models → Training.
      const nextMessages = messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const shown = Number.isInteger(msg.activeVariantIndex) ? msg.activeVariantIndex : 0;
        const { rating, ratedVariant, ...rest } = msg;
        const same = rating === value && (ratedVariant ?? 0) === shown;
        return same ? rest : { ...rest, rating: value, ratedVariant: shown };
      });
      persistMessageMutation(nextMessages);
      return;
    }
    if (field !== 'bookmarked') return;
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
    setSelectedAgentMode('action');
    setToolsEnabled(true);
    try { localStorage.setItem('asyncat_agent_mode', 'action'); } catch { /* localStorage may be unavailable */ }
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
      streamingReasoning: '',
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
          try { localStorage.setItem(ALWAYS_ALLOW_KEY, JSON.stringify([...next])); } catch { /* localStorage may be unavailable */ }
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
            ? { ...ev, data: { ...ev.data, resolving: false, resolved: true, decision, error: null } } : ev
        ),
      }));
    } catch (err) {
      // The agent never got the answer, so leave the request open (it would
      // otherwise read as "Resolved" while the agent waits and then auto-
      // denies) and say why, so the user can simply try again.
      setCurrentChatRun(prev => ({
        ...prev,
        events: (prev.events || []).map(ev =>
          ev.type === 'permission_request' && ev.data?.requestId === requestId
            ? { ...ev, data: { ...ev.data, resolving: false, error: err.message || 'Could not reach the agent.' } } : ev
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
          ? { ...ev, data: { ...ev.data, answered: true, error: null } } : ev
      ),
    }));
    try {
      await agentApi.respondAskUser(requestId, answer);
    } catch (err) {
      console.error('Failed to respond to ask_user:', err);
      // Reopen the question with the user's answer kept, instead of showing
      // it as answered while the agent is still waiting.
      setCurrentChatRun(prev => ({
        ...prev,
        events: (prev.events || []).map(ev =>
          ev.type === 'ask_user' && ev.data?.requestId === requestId
            ? { ...ev, data: { ...ev.data, answered: false, error: err.message || 'Could not reach the agent.', draft: answer } } : ev
        ),
      }));
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
    const value = ['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(next) ? next : 'auto';
    setReasoningEffort(value);
    try { localStorage.setItem('asyncat_reasoning_effort', value); } catch { /* localStorage may be unavailable */ }
  }, []);

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
      // `automatic` plans are the runtime's fixed four-step template (inspect,
      // identify the cause, apply, verify), not something the agent planned.
      // Its steps tick by heuristics and all turn "done" when the run ends even
      // if tools failed, so it is not shown as the agent's plan.
      if (event?.type === 'plan_update' && !event.data?.automatic && Array.isArray(event.data?.plan) && event.data.plan.length > 0) {
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
  const SHELL_URL_TOOLS = new Set(['run_command', 'run_shell_command', 'shell_session_run', 'run_python', 'run_node', 'open_preview']);

  const detectedPreviewUrl = useMemo(() => {
    for (let i = persistedAgentEvents.length - 1; i >= 0; i--) {
      const ev = persistedAgentEvents[i];
      if (ev?.type === 'tool_start' && SHELL_URL_TOOLS.has(ev.data?.tool)) {
        // Explicit preview_url from the open_preview tool
        if (ev.data?.tool === 'open_preview' && ev.data?.args?.url) return ev.data.args.url;
        // Check completed result output
        if (ev.result) {
          const output = typeof ev.result?.output === 'string' ? ev.result.output
            : typeof ev.result?.stdout === 'string' ? ev.result.stdout
            : typeof ev.result?.message === 'string' ? ev.result.message : null;
          if (output) {
            const url = extractLocalhostUrl(output);
            if (url) return url;
          }
        }
        // Also check streaming progress (catches URL before tool completes)
        if (ev.progress) {
          const url = extractLocalhostUrl(ev.progress);
          if (url) return url;
        }
      }
      // Handle the preview_url SSE event type emitted by the open_preview tool
      if (ev?.type === 'preview_url' && ev.data?.url) return ev.data.url;
    }
    return null;
  }, [persistedAgentEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  const [manualPreviewRequest, setManualPreviewRequest] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      const url = e.detail?.url;
      if (!url) return;
      setManualPreviewRequest({
        url,
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      });
      setShowActivitySidebar(true);
      setSidePanelTab('preview');
      try { localStorage.setItem('asyncat_show_command_side_panel', 'true'); } catch { /* storage may be unavailable */ }
    };
    window.addEventListener('asyncat-open-preview', handler);
    return () => window.removeEventListener('asyncat-open-preview', handler);
  }, []);

  // A search result opens a chat at a message (/conversations/:id?message=…):
  // once that chat's messages are on screen, scroll there, then drop the
  // parameter so it doesn't jump again.
  const location = useLocation();
  const linkedMessage = linkedMessageId(location.search);
  useEffect(() => {
    if (!linkedMessage || isConversationLoading || !currentConversationId) return undefined;
    if (!location.pathname.endsWith(`/${currentConversationId}`)) return undefined;
    const clearLink = () => navigate({ pathname: location.pathname, search: '' }, { replace: true, state: location.state });
    if (!messages.some((message) => message.id === linkedMessage)) {
      // Not in this chat any more (edited away, or on another branch).
      if (messages.length > 0) clearLink();
      return undefined;
    }
    let tries = 0;
    let timer = null;
    const attempt = () => {
      if (jumpToMessage(linkedMessage, { smooth: false })) {
        clearLink();
        return;
      }
      tries += 1;
      if (tries < 20) timer = window.setTimeout(attempt, 150);
      else clearLink();
    };
    // After the chat has rendered and made its first scroll to the end.
    timer = window.setTimeout(attempt, 250);
    return () => window.clearTimeout(timer);
  }, [linkedMessage, isConversationLoading, currentConversationId, messages, jumpToMessage, location.pathname, location.state, navigate]);

  // The Cats page opened a tab in a Cat's browser profile: show the browser.
  useEffect(() => {
    if (!location.state?.openBrowser) return;
    setShowActivitySidebar(true);
    setSidePanelTab('preview');
  }, [location.state]);

  // The agent handed a page to the user (sign-in, captcha): show the browser.
  useEffect(() => {
    const browser = window.electronAPI?.browser;
    if (!browser) return undefined;
    const showBrowser = () => {
      setShowActivitySidebar(true);
      setSidePanelTab('preview');
    };
    browser.getState?.().then((state) => { if (state?.handover) showBrowser(); }).catch(() => {});
    return browser.onEvent?.((event) => {
      if (event?.type === 'handover' && event.handover) showBrowser();
    });
  }, []);

  const effectivePreviewUrl = manualPreviewRequest?.url || detectedPreviewUrl;
  const previewNavigationKey = manualPreviewRequest?.id || detectedPreviewUrl;

  // Auto-open preview tab when agent first detects a localhost URL
  const prevDetectedUrlRef = useRef(null);
  useEffect(() => {
    if (detectedPreviewUrl && prevDetectedUrlRef.current === null) {
      setShowActivitySidebar(true);
      setSidePanelTab('preview');
      try { localStorage.setItem('asyncat_show_command_side_panel', 'true'); } catch { /* storage may be unavailable */ }
    }
    prevDetectedUrlRef.current = detectedPreviewUrl;
  }, [detectedPreviewUrl]);

  // Dock badge + tray tooltip: reflect active agent run count
  useEffect(() => {
    if (window.electronAPI?.setDockBadge) {
      window.electronAPI.setDockBadge(agentRunning ? 1 : 0);
    }
  }, [agentRunning]);

  // Collect agent shell command output for the terminal panel's Agent Output tab
  const [agentTerminalOutput, setAgentTerminalOutput] = useState([]);
  useEffect(() => {
    const shellTools = new Set(['run_command', 'run_shell_command', 'shell_session_run', 'run_python', 'run_node']);
    const newLines = [];
    persistedAgentEvents.forEach(ev => {
      if (ev.type !== 'tool_start') return;
      const tool = ev.data?.tool;
      if (!shellTools.has(tool)) return;
      const cmd = ev.data?.args?.command || ev.data?.args?.code || '';
      if (cmd) newLines.push(`\x1b[90m$ ${cmd}\x1b[0m`);
      if (ev.progress) {
        newLines.push(...String(ev.progress).split('\n').filter(Boolean));
      }
      if (ev.result?.output) {
        newLines.push(...String(ev.result.output).split('\n').filter(Boolean));
      } else if (ev.result?.stdout) {
        newLines.push(...String(ev.result.stdout).split('\n').filter(Boolean));
      }
    });
    setAgentTerminalOutput(newLines);
  }, [persistedAgentEvents]);

  const conversationHighlights = useMemo(
    () => buildConversationHighlights(messages),
    [messages],
  );
  const savedItemsCount = conversationHighlights.bookmarkedMessages.length;

  const agentActivityItems = useMemo(() => {
    return persistedAgentEvents
      .filter(event => ['thinking', 'tool_start', 'permission_request', 'ask_user', 'answer', 'error', 'status', 'plan_update'].includes(event.type))
      // Skip the runtime's template plan (see currentPlanEvent).
      .filter(event => !(event.type === 'plan_update' && event.data?.automatic))
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
        // Colour only for how it ended; every other step is a grey dot.
        const dot = type === 'error'
          ? 'bg-red-500'
          : type === 'answer'
            ? 'bg-emerald-500'
            : type === 'tool_start' || type === 'plan_update'
              ? 'bg-fg-subtle'
              : 'bg-line-strong';
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

  const TopBar = null;

  if (!commandCenterContext) {
    return (
      <div role="status" className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-muted">
        <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />
        Loading chat…
      </div>
    );
  }

  const getGreeting = () => {
    if (isTemporaryChat) return TEMPORARY_CHAT.title;
    return "What's on your mind today?";
  };
  // A picked agent's own conversation starters replace the general ones.
  const agentStarters = selectedAgent?.starter_prompts?.length
    ? selectedAgent.starter_prompts.map((text) => ({ icon: MessageSquareQuote, label: text.length > 42 ? `${text.slice(0, 40)}…` : text, text }))
    : null;
  // Starter prompts under the welcome composer; clicking one fills the box.
  const starterPrompts = [
    { icon: Lightbulb, label: 'Explain something', text: 'Explain how large language models work, in simple terms.' },
    { icon: PenLine, label: 'Write an email', text: 'Help me write a friendly email turning down a meeting invite.' },
    { icon: Search, label: 'Review a project', text: 'Look through this project and tell me what could be improved first.' },
    { icon: Globe, label: 'Research a topic', text: 'Research the current state of WebGPU support and write me a short summary.' },
  ];
  const hasConversationContent = messages.length > 0 || persistedAgentEvents.length > 0 || agentRunning;
  const conversationEngine = engineForChat(conversationMetadata?.engine || (hasConversationContent ? 'asyncat' : selectedEngine), isTemporaryChat);
  const conversationEngineName = engineDisplayName(conversationEngine);
  const externalSessionId = conversationEngine !== 'asyncat' ? conversationMetadata?.externalSessions?.[conversationEngine] : null;
  const terminalCommand = externalSessionId
    ? resumeCommand(conversationEngine, externalSessionId, workingContext?.workingDir || conversationMetadata?.externalCwd || conversationMetadata?.externalRunDir || null)
    : null;
  const copyTerminalCommand = async () => {
    try {
      await navigator.clipboard.writeText(terminalCommand);
      toast.success('Command copied', { detail: `Paste it in a terminal to continue this chat in ${conversationEngineName}.` });
    } catch {
      toast.error("Couldn't copy the command", { detail: terminalCommand });
    }
  };
  const shouldRenderSidePanel = showActivitySidebar && (
    sidePanelTab === 'preview'
    || ((
      sidePanelTab === 'saved'
      || sidePanelTab === 'artifacts'
      || sidePanelTab === 'artifact'
      || sidePanelTab === 'nav'
      || sidePanelTab === 'code'
      || sidePanelTab === 'runtime'
      || gitState?.detected
      || sourceCatalog.totalCount > 0
      || persistedAgentEvents.length > 0
      || agentRunning
      || agentLoadingSession
    ))
  );

  const welcomeScreenJSX =
    !hasConversationContent ? (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
          {!isTemporaryChat && workingContext?.workingDir && (
            <button
              type="button"
              onClick={() => toggleSidePanelTab('code')}
              aria-pressed={showActivitySidebar && sidePanelTab === 'code'}
              aria-label="Code and Git"
              className={panelToggleClass(showActivitySidebar && sidePanelTab === 'code')}
              title="Code and Git"
            >
              <Code2 className="h-4 w-4" />
              {gitState?.detected && (
                <span className={COUNT_CLASS}>
                  {gitState.changedCount || 0}
                  {(gitState.ahead || gitState.behind)
                    ? ` · ↑${gitState.ahead || 0} ↓${gitState.behind || 0}`
                    : ''}
                </span>
              )}
            </button>
          )}
          {!isTemporaryChat && (
            <button
              type="button"
              onClick={() => toggleSidePanelTab('preview')}
              aria-pressed={showActivitySidebar && sidePanelTab === 'preview'}
              aria-label="Browser"
              className={panelToggleClass(showActivitySidebar && sidePanelTab === 'preview')}
              title="Browser"
            >
              <Globe className="h-4 w-4" />
            </button>
          )}
          {!isTemporaryChat && workingContext?.workingDir && (
            <button
              type="button"
              onClick={() => toggleSidePanelTab('terminal')}
              aria-pressed={showTerminalDock}
              aria-label="Terminal"
              className={panelToggleClass(showTerminalDock)}
              title="Terminal"
            >
              <SquareTerminal className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isTemporaryChat) {
                setCurrentChatRun({ events: [], running: false, streamingText: '', streamingReasoning: '', goal: '' });
              }
              toggleTemporaryChat();
            }}
            aria-pressed={isTemporaryChat}
            aria-label={isTemporaryChat ? TEMPORARY_CHAT.end : TEMPORARY_CHAT.start}
            className={panelToggleClass(isTemporaryChat)}
            title={isTemporaryChat ? TEMPORARY_CHAT.end : TEMPORARY_CHAT.start}
          >
            <MessageCircleDashed className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-8">
          <div className="max-w-3xl w-full">
            {selectedAgent && !isTemporaryChat ? (
              <div className="mb-7 flex flex-col items-center text-center">
                <AgentAvatar agent={selectedAgent} size="lg" />
                <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.025em] text-fg">{selectedAgent.name}</h1>
                <p className="mt-2 max-w-lg text-[13px] leading-5 text-fg-subtle">
                  {selectedAgent.description || 'Your custom agent. Ask it anything.'}
                </p>
              </div>
            ) : (
              <div className="mb-7 flex flex-col items-center text-center">
                <Cat pose={isTemporaryChat ? 'sleep' : 'sit'} className={isTemporaryChat ? 'w-24' : 'w-12'} outline={7} />
                <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.025em] text-fg">
                  {getGreeting()}
                </h1>
                <p className="mt-2 max-w-lg text-[13px] leading-5 text-fg-subtle">
                  {isTemporaryChat ? TEMPORARY_CHAT.note : 'Ask anything. Open a project when you want Asyncat to work with your files.'}
                </p>
              </div>
            )}


            <MessageInputV2
              prefillValue={composerRestore?.text}
              key={`welcome-input-${currentConversationId || 'draft'}`}
              onSubmit={handleComposerSubmit}
              experienceMode={experienceMode}
              toolsPreference={toolsPreference}
              onToolsPreferenceChange={setToolsPreference}
              engine={conversationEngine}
              engines={engines}
              onEngineChange={hasConversationContent || isTemporaryChat ? undefined : setSelectedEngine}
              selectedAgentId={conversationMetadata?.agentProfileId}
              onAgentChange={setSelectedAgent}
              engineModel={engineModels[conversationEngine] || null}
              onEngineModelChange={(model) => setEngineModel(conversationEngine, model)}
              externalFolder={conversationMetadata?.externalCwd || null}
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
                  ? "Working…"
                  : isTemporaryChat
                  ? TEMPORARY_CHAT.placeholder
                  : getVoicePlaceholder(
                      sttReady,
                      ttsReady,
                      'Ask anything…'
                    )
              }
              hasMessages={hasConversationContent}
              toolsEnabled={toolsEnabled}
              agentMode={agentMode}
              onToggleAgentMode={() => setToolsEnabled(!toolsEnabled)}
              onAgentModeChange={handleAgentModeChange}
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
                pendingInteraction={pendingInputInteraction}
                onPermissionDecision={handleAgentPermission}
                onAskUserAnswer={handleAgentAskUser}
                onOpenRuntimePanel={openRuntimePanel}
                runtimeStatus={runtimeStatus}
                runtimePanelOpen={showActivitySidebar && sidePanelTab === 'runtime'}
                chatModel={chatModel}
                modelOptions={modelOptions}
                agentModel={agentModel}
                modelLoading={currentRun.modelLoading || null}
                modelBusy={savingChatModel}
                onChatModelChange={handleChatModelChange}
                onModelMenuOpen={refreshModelOptions}
                modelMenuRequest={modelMenuRequest}
                temporaryChat={isTemporaryChat}
              />

            {!isTemporaryChat && (
              <div className="mx-auto mt-2 flex max-w-3xl flex-wrap justify-center gap-2 px-4 sm:px-6">
                {(agentStarters || starterPrompts).map(({ icon: PromptIcon, label, text }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setComposerRestore({ text })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-fg-muted outline-none transition-colors hover:border-line-strong hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <PromptIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  // Chat Layout
  return (
    <div className="flex h-full min-h-0 bg-canvas">
      <div className="flex min-h-0 flex-1 min-w-0 flex-col h-full transition-all duration-300">
        {TopBar}
        {isConversationLoading ? (
          <ConversationLoadingSkeleton />
        ) : !hasConversationContent ? (
          welcomeScreenJSX
        ) : (
          // Fades in when a chat opens or its first message is sent.
          <div className="flex min-h-0 min-w-0 flex-1 flex-col animate-[fadeIn_200ms_ease-out]">
            <div className="shrink-0 border-b border-line bg-canvas">
              <div className={`mx-auto px-3 sm:px-4 md:px-6 ${shouldRenderSidePanel ? 'max-w-[min(100vw,96rem)]' : 'max-w-5xl'}`}>

                {/* ── Row 1: Title + conversation-level actions ──────────────── */}
                <div className="flex min-w-0 items-center gap-2 py-2">
                  {/* Title */}
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    {isEditingTitle ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSaveRename}
                        aria-label="Chat name"
                        className={`h-8 min-w-0 max-w-full px-2 text-[14px] ${CONTROL_CLASS}`}
                        autoFocus
                      />
                    ) : currentConversationId && conversationTitle ? (
                      <button
                        onClick={handleStartRename}
                        className="group flex min-w-0 max-w-full flex-1 items-center gap-1.5 overflow-hidden rounded-lg px-1.5 py-1 text-left text-[14px] font-medium text-fg transition-colors hover:bg-hover"
                        title="Click to rename"
                      >
                        <span className="block min-w-0 flex-1 truncate">{conversationTitle}</span>
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                      </button>
                    ) : (
                      <h1 className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">
                        {conversationTitle || "Untitled chat"}
                      </h1>
                    )}
                    {isTemporaryChat && (
                      <span className="hidden shrink-0 text-xs text-fg-subtle sm:inline">Not saved</span>
                    )}
                  </div>

                  {/* Conversation actions — non-scrollable so dropdowns aren't clipped */}
                  <div className="flex shrink-0 items-center gap-1">
                    {terminalCommand && (
                      <button
                        type="button"
                        onClick={copyTerminalCommand}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg sm:px-2.5 sm:text-sm"
                        title={`Copy a command that continues this chat in ${conversationEngineName}: ${terminalCommand}`}
                      >
                        <SquareTerminal className="h-4 w-4" />
                        <span className="hidden lg:inline">Continue in terminal</span>
                      </button>
                    )}
                    {!isTemporaryChat && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('preview')}
                        aria-pressed={showActivitySidebar && sidePanelTab === 'preview'}
                        className={panelToggleClass(showActivitySidebar && sidePanelTab === 'preview')}
                        title="Browser"
                      >
                        <Globe className="h-4 w-4" />
                        <span className="hidden sm:inline">Browser</span>
                      </button>
                    )}

                    {!isTemporaryChat && hasConversationBranches && (
                      <>
                        <button
                          ref={branchMenuRef}
                          type="button"
                          onClick={() => setShowBranchMenu(v => !v)}
                          aria-haspopup="dialog"
                          aria-expanded={showBranchMenu}
                          className={panelToggleClass(showBranchMenu)}
                          title="Conversation branches"
                        >
                          <GitBranch className="h-4 w-4" />
                          <span className="hidden sm:inline">Branches</span>
                          <span className={COUNT_CLASS}>{conversationBranches.length}</span>
                        </button>
                        <Popover
                          anchorRef={branchMenuRef}
                          open={showBranchMenu}
                          onClose={() => {
                            setShowBranchMenu(false);
                            // Closing it mid-rename (a click outside, say) saves
                            // the name, as leaving the field does.
                            if (editingBranchId) finishBranchRename(editingBranchId, branchNameDraft.trim() ? branchNameDraft : null, false);
                          }}
                          placement="bottom-end"
                          width={288}
                          label="Conversation branches"
                        >
                          <div className="-m-2">
                          <div className="px-2.5 pb-1.5 pt-1.5">
                            <div className="text-[13px] font-medium text-fg">Branches</div>
                            <div className="mt-0.5 text-[12px] leading-4 text-fg-subtle">Other ways this chat went. Pick one to switch to it.</div>
                          </div>
                          <div className="max-h-72 overflow-y-auto">
                            {conversationBranches.map(branch => (
                              <div
                                key={branch.id}
                                className={`group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                                  branch.active ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
                                }`}
                              >
                                <GitBranch className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${branch.active ? 'text-fg' : 'text-fg-subtle'}`} />
                                {editingBranchId === branch.id ? (
                                  <span className="min-w-0 flex-1">
                                    <BranchNameField
                                      value={branchNameDraft}
                                      onChange={setBranchNameDraft}
                                      onDone={(name, fromKey) => finishBranchRename(branch.id, name, fromKey)}
                                    />
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleSwitchBranch(branch.id)}
                                      disabled={branch.active || agentRunning}
                                      className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default"
                                    >
                                      <span className="block truncate text-[13px] font-medium">{branch.label}</span>
                                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                                        {branch.messageCount} messages{branch.active ? ' · current' : ''}
                                      </span>
                                    </button>
                                    {branch.active ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg" /> : null}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingBranchId(branch.id);
                                        setBranchNameDraft(branch.label || '');
                                      }}
                                      data-branch-rename={branch.id}
                                      aria-label={`Rename ${branch.label}`}
                                      className="rounded-md p-1 text-fg-subtle opacity-0 outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 group-hover:opacity-100"
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
                        </Popover>
                      </>
                    )}

                    {hasConversationContent && (
                      <>
                        <IconButton
                          ref={exportMenuRef}
                          icon={Download}
                          label="Export conversation"
                          side="bottom"
                          onClick={() => setShowExportMenu((v) => !v)}
                          aria-haspopup="menu"
                          aria-expanded={showExportMenu}
                        />
                        <Menu anchorRef={exportMenuRef} open={showExportMenu} onClose={() => setShowExportMenu(false)} placement="bottom-end" width={184} label="Export conversation">
                          <MenuItem label="Markdown (.md)" onSelect={handleExportMarkdown} />
                          <MenuItem label="HTML (.html)" onSelect={handleExportHTML} />
                          <MenuItem label="JSON (.json)" onSelect={handleExportJSON} />
                          <MenuItem label="PDF (print)" onSelect={handleExportPDF} />
                        </Menu>
                      </>
                    )}

                    {isTemporaryChat && (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentChatRun({ events: [], running: false, streamingText: '', streamingReasoning: '', goal: '' });
                          toggleTemporaryChat();
                        }}
                        aria-pressed="true"
                        aria-label={TEMPORARY_CHAT.end}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-selected text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
                        title={TEMPORARY_CHAT.end}
                      >
                        <MessageCircleDashed className="h-4 w-4" />
                      </button>
                    )}

                    {currentConversationId && conversationTitle && (
                      <IconButton
                        icon={Trash2}
                        label="Delete conversation"
                        side="bottom"
                        onClick={askDeleteConversation}
                        className="hover:text-red-600 dark:hover:text-red-400"
                      />
                    )}
                  </div>
                </div>

                {/* ── Row 2: Panel openers (scrollable) ─────────────────────── */}
                {/* Only when there is agent work to look at; plain chats don't need it. */}
                {(workingContext?.workingDir || persistedAgentEvents.length > 0 || agentEvents.length > 0) && (
                <div className="border-t border-line">
                  <div className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {workingContext?.workingDir && <>
                    <button
                      type="button"
                      onClick={() => toggleSidePanelTab('code')}
                      className={panelToggleClass(showActivitySidebar && sidePanelTab === 'code', true)}
                      title="Code files, Git and copies"
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      Code
                      {gitState?.detected && (
                        <span className={COUNT_CLASS}>
                          {gitState.changedCount || 0}
                          {(gitState.ahead || gitState.behind) ? ` · ${gitState.ahead || 0}/${gitState.behind || 0}` : ''}
                        </span>
                      )}
                    </button>

                    {/* Terminal — always visible */}
                    <button
                      type="button"
                      onClick={() => toggleSidePanelTab('terminal')}
                      className={panelToggleClass(showTerminalDock, true)}
                      title="Terminal and running processes"
                    >
                      <SquareTerminal className="h-3.5 w-3.5" />
                      Terminal
                      {detectedPreviewUrl && !showTerminalDock && (
                        <span role="img" className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="A server is running" title="A server is running" />
                      )}
                    </button>
                    </>}

                    {(persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('steps')}
                        className={panelToggleClass(showActivitySidebar && sidePanelTab === 'steps', true)}
                        title="Show steps"
                      >
                        <PanelRightOpen className="h-3.5 w-3.5" />
                        Steps
                      </button>
                    )}

                    {conversationArtifacts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('artifacts')}
                        className={panelToggleClass(showActivitySidebar && sidePanelTab === 'artifacts', true)}
                        title="Show artifacts"
                      >
                        <FilePlus className="h-3.5 w-3.5" />
                        Artifacts
                        <span className={COUNT_CLASS}>
                          {conversationArtifacts.length}
                        </span>
                      </button>
                    )}

                    {sourceCatalog.totalCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('media')}
                        className={panelToggleClass(showActivitySidebar && sidePanelTab === 'media', true)}
                        title="Show all sources and media"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Sources
                        <span className={COUNT_CLASS}>
                          {sourceCatalog.totalCount}
                        </span>
                      </button>
                    )}

                    {savedItemsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('saved')}
                        className={panelToggleClass(showActivitySidebar && sidePanelTab === 'saved', true)}
                        title="Show bookmarked messages"
                      >
                        <BookMarked className="h-3.5 w-3.5" />
                        Saved
                        <span className={COUNT_CLASS}>
                          {savedItemsCount}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                )}

              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-hidden relative"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onDrop={handleDrop}
            >
              <ChatFloatingNav items={chatNavItems} scrollContainerRef={scrollContainerRef} />
              <div
                ref={scrollContainerRef}
                className="h-full min-h-0 overflow-y-auto relative"
                style={{ maxHeight: '100%' }}
              >
                <div className="max-w-5xl mx-auto px-4 md:px-8 pt-10 pb-16 min-h-full">
                  {conversationMetadata?.catId ? (
                    <Suspense fallback={null}>
                      <CatChatBanner catId={conversationMetadata.catId} />
                    </Suspense>
                  ) : null}
                  <AgentRunFeed
                    events={persistedAgentEvents}
                    isRunning={agentRunning}
                    streamingText={agentStreamingText}
                    streamingReasoning={agentStreamingReasoning}
                    runStartedAt={currentRun.startedAt || null}
                    sessionId={savedSessionId}
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
                    renderPendingInteractionsInline={false}
                    conversationId={isTemporaryChat ? null : currentConversationId}
                  />
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </div>
            </div>

            <div className="shrink-0">
              {conversationMetadata?.catId ? (
                <Suspense fallback={null}>
                  <CatWaitingBar catId={conversationMetadata.catId} />
                </Suspense>
              ) : null}
              {currentPlanEvent && (
                <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-3">
                  <CurrentPlanPanel
                    data={currentPlanEvent.data}
                    isRunning={agentRunning}
                    sessionId={savedSessionId}
                  />
                </div>
              )}
              <MessageInputV2
                lockedTo={catChat ? { name: catChat.name, avatar: catChat.avatar } : null}
                prefillValue={composerRestore?.text}
                key={`conversation-input-${currentConversationId || 'draft'}`}
                onSubmit={handleComposerSubmit}
                experienceMode={experienceMode}
                toolsPreference={toolsPreference}
                onToolsPreferenceChange={setToolsPreference}
                engine={conversationEngine}
                engines={engines}
                onEngineChange={hasConversationContent || isTemporaryChat ? undefined : setSelectedEngine}
                selectedAgentId={conversationMetadata?.agentProfileId}
                onAgentChange={setSelectedAgent}
                engineModel={engineModels[conversationEngine] || null}
                onEngineModelChange={(model) => setEngineModel(conversationEngine, model)}
                externalFolder={conversationMetadata?.externalCwd || null}
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
                    ? 'Working…'
                    : isTemporaryChat
                    ? TEMPORARY_CHAT.placeholder
                    : getVoicePlaceholder(sttReady, ttsReady, "Ask anything…")
                }
                hasMessages={hasConversationContent}
                toolsEnabled={toolsEnabled}
                agentMode={agentMode}
                onToggleAgentMode={() => setToolsEnabled(!toolsEnabled)}
                onAgentModeChange={handleAgentModeChange}
                  autoApprove={agentAutoApprove}
                onToggleAutoApprove={handleToggleAgentAutoApprove}
                enabledIntegrationTools={enabledIntegrationTools}
                onEnabledIntegrationToolsChange={handleEnabledIntegrationToolsChange}
                reasoningEffort={reasoningEffort}
                onReasoningEffortChange={handleReasoningEffortChange}
                isRunning={agentRunning}
                onStop={handleAgentStop}
                runStartedAt={currentRun.startedAt || null}
                externalFileAttachment={externalFileAttachment}
                onNativeFileAttach={setExternalFileAttachment}
                workingContext={workingContext}
                onWorkingContextChange={setWorkingContext}
                tokenUsage={latestTokenUsage}
                multimodalCapabilities={multimodalCapabilities}
                pendingInteraction={pendingInputInteraction}
                onPermissionDecision={handleAgentPermission}
                onAskUserAnswer={handleAgentAskUser}
                chatModel={chatModel}
                modelOptions={modelOptions}
                agentModel={agentModel}
                modelLoading={currentRun.modelLoading || null}
                modelBusy={savingChatModel}
                onChatModelChange={handleChatModelChange}
                onModelMenuOpen={refreshModelOptions}
                modelMenuRequest={modelMenuRequest}
                temporaryChat={isTemporaryChat}
              />
            </div>
          </div>
        )}

        {terminalEverOpened && workingContext?.workingDir && (!isXLScreen || workbenchPreferences.terminalPosition === 'bottom') && (
          <section
            style={{ height: showTerminalDock ? bottomDockHeight : 0 }}
            className="relative shrink-0 overflow-hidden border-t border-line bg-canvas transition-[height] duration-150"
            aria-hidden={!showTerminalDock}
          >
            {showTerminalDock && (
              <div onMouseDown={handleBottomDockDragStart} className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize transition-colors hover:bg-line-strong" title="Drag to resize the terminal" />
            )}
            <div className="flex h-full min-h-0 flex-col pt-1">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5">
                <SquareTerminal className="h-3.5 w-3.5 text-fg-subtle" />
                <span className="text-[12px] font-medium text-fg-muted">Terminal</span>
                {workingContext?.workingDir && (
                  <span className="ml-2 flex min-w-0 items-center gap-1 text-[11px] text-fg-subtle" title={workingContext.workingDir}>
                    <FolderOpen className="h-3 w-3 shrink-0" /><span className="truncate">{workingContext.workingDir}</span>
                  </span>
                )}
                <div className="flex-1" />
                <IconButton icon={X} label="Close the terminal" size="sm" side="bottom" onClick={() => { setShowTerminalDock(false); try { localStorage.setItem('asyncat_show_terminal_dock', 'false'); } catch { /* noop */ } }} />
              </div>
              <div className="min-h-0 flex-1">
                <Suspense fallback={null}><TerminalPanel workingDir={workingContext?.workingDir || null} agentOutput={agentTerminalOutput} visible={showTerminalDock} /></Suspense>
              </div>
            </div>
          </section>
        )}
      </div>

      {shouldRenderSidePanel && (
        <aside
          style={{ width: sidePanelWidth }}
          className="hidden xl:flex xl:shrink-0 relative border-l border-line"
        >
          {/* Drag handle — hover shows a subtle line, cursor changes to resize */}
          <div
            onMouseDown={handlePanelDragStart}
            className="absolute left-0 top-0 bottom-0 w-1.5 z-10 cursor-col-resize group transition-colors hover:bg-hover"
            title="Drag to resize"
          >
            <div className="absolute left-0.5 top-1/2 -translate-y-1/2 h-10 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-fg-subtle" />
          </div>
          <div className="flex-1 min-w-0">
            <CommandCenterSidePanel
              activeTab={sidePanelTab}
              onClose={closeSidePanel}
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
              highlights={conversationHighlights}
              onOpenSavedMessage={handleOpenSavedMessage}
              previewUrl={effectivePreviewUrl}
              previewNavigationKey={previewNavigationKey}
              previewTabId={manualPreviewRequest?.tabId || null}
              artifacts={conversationArtifacts}
              onSelectArtifact={handleViewArtifactInPanel}
              selectedArtifact={selectedArtifact}
              chatNavItems={chatNavItems}
              runtimeStatus={runtimeStatus}
              runtimeStatusLoading={runtimeStatusLoading}
              onRuntimeStatusRefresh={loadRuntimeStatus}
              agentTerminalOutput={agentTerminalOutput}
            />
          </div>
        </aside>
      )}

      {terminalEverOpened && workingContext?.workingDir && isXLScreen && workbenchPreferences.terminalPosition === 'right' && (
        <aside
          style={{ width: showTerminalDock ? sidePanelWidth : 0 }}
          className="relative hidden shrink-0 overflow-hidden border-l border-line bg-canvas transition-[width] duration-150 xl:flex"
          aria-hidden={!showTerminalDock}
        >
          {showTerminalDock && (
            <div onMouseDown={handlePanelDragStart} className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize transition-colors hover:bg-line-strong" title="Drag to resize the terminal" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5">
              <SquareTerminal className="h-3.5 w-3.5 text-fg-subtle" />
              <span className="text-[12px] font-medium text-fg-muted">Terminal</span>
              <div className="flex-1" />
              <IconButton icon={X} label="Close the terminal" size="sm" side="bottom" onClick={() => { setShowTerminalDock(false); try { localStorage.setItem('asyncat_show_terminal_dock', 'false'); } catch { /* noop */ } }} />
            </div>
            <div className="min-h-0 flex-1"><Suspense fallback={null}><TerminalPanel workingDir={workingContext?.workingDir || null} agentOutput={agentTerminalOutput} visible={showTerminalDock} /></Suspense></div>
          </div>
        </aside>
      )}

      {/* Mobile overlay — only mount on non-xl screens. CSS display:none alone is not
          enough because Electron <webview> elements stay alive (play audio, run JS) even
          when hidden. By gating on !isXLScreen we guarantee only ONE webview mounts. */}
      {!isXLScreen && shouldRenderSidePanel && (
        <SidePanelSheet label="Side panel" onClose={closeSidePanel}>
          <CommandCenterSidePanel
            activeTab={sidePanelTab}
            onClose={closeSidePanel}
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
            highlights={conversationHighlights}
            onOpenSavedMessage={handleOpenSavedMessage}
            previewUrl={effectivePreviewUrl}
            previewNavigationKey={previewNavigationKey}
            previewTabId={manualPreviewRequest?.tabId || null}
            artifacts={conversationArtifacts}
            onSelectArtifact={handleViewArtifactInPanel}
            selectedArtifact={selectedArtifact}
            chatNavItems={chatNavItems}
            runtimeStatus={runtimeStatus}
            runtimeStatusLoading={runtimeStatusLoading}
            onRuntimeStatusRefresh={loadRuntimeStatus}
            agentTerminalOutput={agentTerminalOutput}
          />
        </SidePanelSheet>
      )}

    </div>
  );
};

export default CommandCenterV2Enhanced;
