// CommandCenterV2Enhanced.jsx — Unified agent interface (tools ON = acts, tools OFF = answers only)

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
import { MessageInputV2 } from "./components/MessageInputV2";
import AgentRunFeed, { CurrentPlanPanel } from './components/AgentRunFeed';
import AgentChangesPanel from './components/AgentChangesPanel';
import CommandCenterSidePanel from './components/CommandCenterSidePanel';
import ConversationLoadingSkeleton from './components/ConversationLoadingSkeleton';
import DeleteConfirmationModal from "./components/DeleteConfirmationModal";
import { useCommandCenter } from "./context/CommandCenterContextEnhanced";
import { chatApi, agentApi, gitApi } from "./api";
import { cleanReasoningAnswer } from "./utils/reasoningParser.js";
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
  Download,
  Loader2,
  History,
  Plus,
  MessageSquare,
  PanelRightOpen,
  Image,
  GitBranch,
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
    setChatRuns = () => {},
    updateChatRun = () => {},
    activeConversationIds = new Set(),
    hasActiveRuns = false,
    agentAbortControllersRef = fallbackAgentAbortControllersRef,
    runStartedAtRef = fallbackRunStartedAtRef,
    currentConversationIdRef = fallbackCurrentConversationIdRef,
  } = commandCenterContext || {};

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const exportMenuRef = useRef(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

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
  const [gitState, setGitState] = useState(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState(null);
  const [externalFileAttachment, setExternalFileAttachment] = useState(null);
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
  // Extract latest token usage for the input toolbar
  const latestTokenUsage = useMemo(() => {
    for (let i = agentEvents.length - 1; i >= 0; i--) {
      if (agentEvents[i]?.type === 'usage_update') return agentEvents[i].data;
    }
    return null;
  }, [agentEvents]);
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
      if (!exportMenuRef.current?.contains(e.target)) {
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
    if (showActivitySidebar && sidePanelTab === 'history') loadRecentConversations();
  }, [showActivitySidebar, sidePanelTab, loadRecentConversations]);



  const handleStartNewConversation = useCallback(async () => {

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
      const res = await gitApi.getState();
      setGitState(res);
    } catch (error) {
      setGitError(error.message || 'Could not load Git state');
      setGitState(null);
    } finally {
      setGitLoading(false);
    }
  }, []);

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

  const handleGitChanged = useCallback(() => {
    refreshGitState();
  }, [refreshGitState]);

  const handleAttachGitFile = useCallback((file) => {
    setExternalFileAttachment({ ...file, nonce: Date.now() });
  }, []);

  const ConversationSwitcher = useCallback(({ compact = false } = {}) => (
    <button
      type="button"
      onClick={() => toggleSidePanelTab('history')}
      className={`relative ${compact ? 'p-2' : 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium'} transition-colors ${
        showActivitySidebar && sidePanelTab === 'history' && !compact
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
      }`}
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
  ), [
    hasActiveRuns,
    showActivitySidebar,
    sidePanelTab,
    toggleSidePanelTab,
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
    const agentMentions = Array.isArray(messageObj?.agentMentions) ? messageObj.agentMentions : [];
    const fileAttachments = Array.isArray(messageObj?.fileAttachments) ? messageObj.fileAttachments : [];
    const selectedReasoningEffort = runOptions.reasoningEffort || messageObj?.reasoningEffort || reasoningEffort || 'auto';
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
        fileAttachments,
        events: [
          ...baseEvents,
          { type: 'user_goal', data: { goal: submittedGoal, timestamp: new Date().toISOString(), toolsEnabled: effectiveToolsEnabled, reasoningEffort: selectedReasoningEffort, agentMentions, fileAttachments, profileId: effectiveProfileId || null }, arrivedAt: Date.now() },
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
      { type: 'user_goal', data: { goal: submittedGoal, timestamp: new Date().toISOString(), toolsEnabled: effectiveToolsEnabled, reasoningEffort: selectedReasoningEffort, agentMentions, fileAttachments, profileId: effectiveProfileId || null } },
    ];

    try {
      for await (const event of agentApi.runStream(submittedGoal, activeConversationHistory, null, 25, controller.signal, agentCurrentSessionId, {
        autoApprove: agentAutoApprove,
        preApprovedTools: [...alwaysAllowedTools],
        profileId: effectiveProfileId,
        agentMentions,
        fileAttachments,
        enableTools: effectiveToolsEnabled,
        reasoningEffort: selectedReasoningEffort,
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
        // Handle streaming tool progress (real-time command output)
        if (event.type === 'tool_progress') {
          updateChatRun(runKey, prev => {
            const updated = [...(prev.events || [])];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].type === 'tool_start' && updated[i].data?.tool === event.data?.tool && updated[i].result === undefined) {
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
          { role: 'user', content: submittedGoal, toolsEnabled: effectiveToolsEnabled, reasoningEffort: selectedReasoningEffort, agentMentions, fileAttachments },
          { role: 'assistant', content: capturedFinalAnswer, toolsEnabled: effectiveToolsEnabled, reasoningEffort: selectedReasoningEffort, agentSessionId: runSessionId },
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
          reasoningEffort: selectedReasoningEffort,
          agentMentions,
          fileAttachments,
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
          reasoningEffort: selectedReasoningEffort,
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
    reasoningEffort,
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
    refreshGitState,
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

  const handleRunWithTools = useCallback((goal) => {
    if (!goal?.trim() || agentRunning) return;
    setToolsEnabled(true);
    handleAgentRun({ content: goal }, { enableTools: true });
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
              onClick={() => toggleSidePanelTab('git')}
              className={`relative p-2 rounded-lg transition-colors ${
                showActivitySidebar && sidePanelTab === 'git'
                  ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
              }`}
              title="Git status"
            >
              <GitBranch className="w-5 h-5" />
              {gitState && gitState.staged?.length > 0 && (
                <span className="absolute top-1 right-1 inline-flex items-center justify-center bg-blue-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] h-3.5 ring-2 ring-white dark:ring-gray-900 midnight:ring-slate-900">
                  {gitState.staged.length}
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

            <MessageInputV2
              key={`welcome-input-${currentConversationId || 'draft'}-${messageInputResetKey}`}
              onSubmit={handleAgentRun}
              disabled={isProcessing || agentRunning}
              autoFocus={true}
              placeholder={
                isGhostMode
                  ? "👻 Ghost Mode — messages won't be saved..."
                  : "Ask anything, or create tasks, events, notes..."
              }
              hasMessages={hasConversationContent}
              toolsEnabled={toolsEnabled}
              onToggleTools={() => setToolsEnabled(!toolsEnabled)}
              autoApprove={agentAutoApprove}
              onToggleAutoApprove={handleToggleAgentAutoApprove}
              reasoningEffort={reasoningEffort}
              onReasoningEffortChange={handleReasoningEffortChange}
              externalFileAttachment={externalFileAttachment}
            />


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
                      {isEditingTitle ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleSaveRename}
                          className="text-sm bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900 border border-gray-300 dark:border-gray-700 midnight:border-slate-700 rounded-md px-2 py-0.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[160px] max-w-[280px] text-gray-900 dark:text-gray-100 midnight:text-slate-100"
                          autoFocus
                        />
                      ) : currentConversationId && conversationTitle ? (
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
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800"
                          title="Start new conversation"
                        >
                          <Plus className="h-4 w-4" />
                          New
                        </button>
                        <ConversationSwitcher />
                      </>
                    )}

                    {gitState?.detected && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('git')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          showActivitySidebar && sidePanelTab === 'git'
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                        }`}
                        title="Show Git changes"
                      >
                        <GitBranch className="h-4 w-4" />
                        Git
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {gitState.changedCount || 0}
                          {(gitState.ahead || gitState.behind) ? ` · ${gitState.ahead || 0}/${gitState.behind || 0}` : ''}
                        </span>
                      </button>
                    )}

                    {sourceCatalog.totalCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSidePanelTab('media')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          showActivitySidebar && sidePanelTab === 'media'
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800'
                        }`}
                        title="Show all sources and media"
                      >
                        <Image className="h-4 w-4" />
                        Media
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
                        className={`hidden xl:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
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

                    {hasConversationContent && (
                      <div ref={exportMenuRef} className="relative">
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
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
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
                key={`conversation-input-${currentConversationId || 'draft'}-${messageInputResetKey}`}
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
                toolsEnabled={toolsEnabled}
                onToggleTools={() => setToolsEnabled(!toolsEnabled)}
                autoApprove={agentAutoApprove}
                onToggleAutoApprove={handleToggleAgentAutoApprove}
                reasoningEffort={reasoningEffort}
                onReasoningEffortChange={handleReasoningEffortChange}
                isRunning={agentRunning}
                onStop={handleAgentStop}
                runStartedAt={runStartedAtRef.current}
                externalFileAttachment={externalFileAttachment}
                tokenUsage={latestTokenUsage}
              />
            </div>
          </>
        )}
      </div>

      {showActivitySidebar && (sidePanelTab === 'history' || gitState?.detected || sourceCatalog.totalCount > 0 || persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && (
        <aside className="hidden xl:block w-96 shrink-0 border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700">
          <CommandCenterSidePanel
            activeTab={sidePanelTab}
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
            recentConversations={recentConversations}
            recentConversationsLoading={recentConversationsLoading}
            recentConversationsError={recentConversationsError}
            activeConversationIds={activeConversationIds}
            currentConversationId={currentConversationId}
            onOpenConversation={handleOpenConversation}
            navigate={navigate}
          />
        </aside>
      )}

      {showActivitySidebar && (sidePanelTab === 'history' || gitState?.detected || sourceCatalog.totalCount > 0 || persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && (
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
              recentConversations={recentConversations}
              recentConversationsLoading={recentConversationsLoading}
              recentConversationsError={recentConversationsError}
              activeConversationIds={activeConversationIds}
              currentConversationId={currentConversationId}
              onOpenConversation={handleOpenConversation}
              navigate={navigate}
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

    </div>
  );
};

export default CommandCenterV2Enhanced;
