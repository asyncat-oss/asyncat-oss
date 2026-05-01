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

function AgentActivitySidebar({ items = [], isLoading = false, isRunning = false }) {
  const feedEndRef = useRef(null);

  useEffect(() => {
    if (isRunning) feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length, isRunning]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 flex items-center gap-2">
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
import { MessageInputV2 } from "./components/MessageInputV2";
import AgentRunFeed from './components/AgentRunFeed';
import AgentChangesPanel, { AgentRunSummary } from './components/AgentChangesPanel';
import DeleteConfirmationModal from "./components/DeleteConfirmationModal";
import { useCommandCenter } from "./CommandCenterContextEnhanced";
import { chatApi, agentApi } from "./commandCenterApi";
import { useUser } from "../contexts/UserContext";
import {
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
  Wrench,
} from "lucide-react";

const CommandCenterV2Enhanced = () => {
  const commandCenterContext = useCommandCenter();
  const { userName } = useUser();

  const {
    messages = [],
    isProcessing = false,
    isConversationLoading = false,
    handleClearConversation = () => {},
    currentConversationId = null,
    conversationTitle = "",
    triggerConversationRefresh = () => {},
    setConversationTitle = () => {},
    isGhostMode = false,
    toggleGhostMode = () => {},
    conversationHistory = [],
    setMessages,
    setConversationHistory,
    setProcessing,
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentEvents, setAgentEvents] = useState([]);
  const [agentCurrentGoal, setAgentCurrentGoal] = useState('');
  const [agentCurrentSessionId, setAgentCurrentSessionId] = useState(null);
  const [agentCurrentSession, setAgentCurrentSession] = useState(null);
  const [agentConversationHistory, setAgentConversationHistory] = useState([]);
  const [agentAutoApprove, setAgentAutoApprove] = useState(false);
  const [alwaysAllowedTools, setAlwaysAllowedTools] = useState(() => {
    try {
      const stored = localStorage.getItem('asyncat_always_allow_tools');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [agentLoadingSession, setAgentLoadingSession] = useState(false);
  const [agentStreamingText, setAgentStreamingText] = useState('');
  const [agentRunDuration, setAgentRunDuration] = useState(null);
  const [editGoalText, setEditGoalText] = useState('');
  const [showDeleteAgentConfirm, setShowDeleteAgentConfirm] = useState(false);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const agentAbortRef = useRef(null);
  const agentRunStartTime = useRef(null);

  const conversationTokens = useMemo(() => {
    const historyChars = (conversationHistory || []).reduce(
      (sum, m) => sum + (m.content?.length || 0),
      0,
    );
    return Math.round(historyChars / 4) + 500;
  }, [conversationHistory]);

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
  const handleAgentRun = useCallback(async (messageObj) => {
    const goal = typeof messageObj === 'string' ? messageObj : messageObj?.content;
    if (!goal?.trim() || agentRunning) return;
    const submittedGoal = goal.trim();

    if (!currentConversationId && messages.length === 0) {
      generateAndSetTitle(submittedGoal);
    }

    setProcessing(true);
    setError(null);
    setAgentCurrentGoal(submittedGoal);

    setAgentEvents(prev => [
      ...prev,
      { type: 'user_goal', data: { goal: submittedGoal, timestamp: new Date().toISOString() }, arrivedAt: Date.now() },
    ]);

    setAgentStreamingText('');
    setAgentRunning(true);
    setAgentRunDuration(null);
    setAgentCurrentSession(null);
    agentRunStartTime.current = Date.now();
    const controller = new AbortController();
    agentAbortRef.current = controller;

    let capturedFinalAnswer = '';
    let sawFinalResponse = false;
    let sawErrorEvent = false;
    let sawDoneWithoutAnswer = false;
    let runSessionId = agentCurrentSessionId;

    try {
      for await (const event of agentApi.runStream(submittedGoal, agentConversationHistory, null, 25, controller.signal, agentCurrentSessionId, {
        autoApprove: agentAutoApprove,
        preApprovedTools: [...alwaysAllowedTools],
        profileId: selectedProfileId,
        enableTools: toolsEnabled,
      })) {
        if (controller.signal.aborted) break;
        if (event.type === 'session_start') {
          if (event.data?.sessionId) {
            runSessionId = event.data.sessionId;
            setAgentCurrentSessionId(event.data.sessionId);
          }
          continue;
        }
        if (event.type === 'delta') {
          setAgentStreamingText(prev => prev + (event.data?.content || ''));
          continue;
        }
        if (event.type === 'thinking' || event.type === 'tool_start' || event.type === 'answer') {
          setAgentStreamingText('');
        }
        if (event.type === 'done') {
          if (event.data?.sessionId) {
            runSessionId = event.data.sessionId;
            setAgentCurrentSessionId(event.data.sessionId);
          }
          const doneAnswer = String(event.data?.answer || '').trim();
          if (doneAnswer) {
            sawFinalResponse = true;
          }
          if (!capturedFinalAnswer && doneAnswer) {
            capturedFinalAnswer = doneAnswer;
            setAgentEvents(prev => [...prev, {
              type: 'answer',
              data: {
                answer: doneAnswer,
                round: event.data.rounds,
              },
              arrivedAt: Date.now(),
            }]);
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
          setAgentEvents(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].type === 'tool_start' && updated[i].data?.tool === event.data?.tool && updated[i].result === undefined) {
                updated[i] = { ...updated[i], result: event.data?.result, completedAt };
                return updated;
              }
            }
            return updated;
          });
          continue;
        }
        setAgentEvents(prev => [...prev, { ...event, arrivedAt: Date.now() }]);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        sawErrorEvent = true;
        setAgentStreamingText('');
        setAgentEvents(prev => [...prev, { type: 'error', data: { message: err.message } }]);
      }
    } finally {
      if (!controller.signal.aborted && !sawFinalResponse && !sawErrorEvent) {
        setAgentEvents(prev => [...prev, {
          type: 'status',
          data: {
            message: sawDoneWithoutAnswer
              ? 'Agent finished but did not return a final answer.'
              : 'Agent stream ended before a final answer was received.',
          },
        }]);
      }
      if (capturedFinalAnswer) {
        const nextHistory = [
          ...agentConversationHistory,
          { role: 'user', content: submittedGoal },
          { role: 'assistant', content: capturedFinalAnswer },
        ];
        setAgentConversationHistory(nextHistory);
        setConversationHistory(nextHistory);

        const userMsg = {
          id: `msg_${Date.now()}_user_${Math.random().toString(36).substr(2, 9)}`,
          content: submittedGoal,
          type: 'user',
          timestamp: new Date().toISOString(),
        };
        const assistantMsg = {
          id: `msg_${Date.now()}_assistant_${Math.random().toString(36).substr(2, 9)}`,
          content: capturedFinalAnswer,
          type: 'assistant',
          timestamp: new Date().toISOString(),
          agentSessionId: runSessionId,
          toolsEnabled,
        };
        const finalMessages = [...messages, userMsg, assistantMsg];
        setMessages(finalMessages);

        if (!isGhostMode) {
          const saveResult = await saveCurrentConversation({ messages: finalMessages });
          if (!currentConversationId && saveResult?.conversationId) {
            setCurrentConversationId(saveResult.conversationId);
            if (saveResult.title) setConversationTitle(saveResult.title);
            setTimeout(() => triggerConversationRefresh(), 50);
          }
          if (!currentConversationId && messages.length === 0) {
            chatApi.generateTitle(submittedGoal, capturedFinalAnswer).then(result => {
              if (result?.success && result.title) setConversationTitle(result.title);
            }).catch(() => {});
          }
        }
      } else if (!controller.signal.aborted && sawErrorEvent) {
        setError('Agent run failed');
      }
      if (agentRunStartTime.current) {
        setAgentRunDuration(Date.now() - agentRunStartTime.current);
        agentRunStartTime.current = null;
      }
      setAgentStreamingText('');
      setAgentRunning(false);
      setProcessing(false);
      agentAbortRef.current = null;
      window.dispatchEvent(new CustomEvent('agent-run-complete'));
    }
  }, [
    agentRunning,
    agentConversationHistory,
    agentCurrentSessionId,
    agentAutoApprove,
    alwaysAllowedTools,
    selectedProfileId,
    toolsEnabled,
    currentConversationId,
    messages,
    isGhostMode,
    generateAndSetTitle,
    setProcessing,
    setError,
    setConversationHistory,
    setMessages,
    saveCurrentConversation,
    setCurrentConversationId,
    setConversationTitle,
    triggerConversationRefresh,
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

  const handleAgentStop = useCallback(() => {
    if (!agentAbortRef.current) return;
    agentAbortRef.current.abort();
    if (agentRunStartTime.current) {
      setAgentRunDuration(Date.now() - agentRunStartTime.current);
      agentRunStartTime.current = null;
    }
    setAgentStreamingText('');
    setAgentRunning(false);
    setAgentEvents(prev => [...prev, { type: 'status', data: { message: 'Stopped by user.' } }]);
    agentAbortRef.current = null;
  }, []);

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

    setAgentEvents(prev => prev.map(ev =>
      ev.type === 'permission_request' && ev.data?.requestId === requestId
        ? { ...ev, data: { ...ev.data, resolving: true } } : ev
    ));
    try {
      await agentApi.respondPermission(requestId, resolvedDecision);
      setAgentEvents(prev => prev.map(ev =>
        ev.type === 'permission_request' && ev.data?.requestId === requestId
          ? { ...ev, data: { ...ev.data, resolving: false, resolved: true, decision } } : ev
      ));
    } catch (err) {
      setAgentEvents(prev => prev.map(ev =>
        ev.type === 'permission_request' && ev.data?.requestId === requestId
          ? { ...ev, data: { ...ev.data, resolving: false, resolved: true, decision: 'error', error: err.message } } : ev
      ));
    }
  }, [agentEvents]);

  const handleAgentAskUser = useCallback(async (requestId, answer) => {
    if (!requestId) return;
    setAgentEvents(prev => prev.map(ev =>
      ev.type === 'ask_user' && ev.data?.requestId === requestId
        ? { ...ev, data: { ...ev.data, answered: true } } : ev
    ));
    try {
      await agentApi.respondAskUser(requestId, answer);
    } catch (err) {
      console.error('Failed to respond to ask_user:', err);
    }
  }, []);

  const handleAgentRename = useCallback(async () => {
    const newGoal = editGoalText.trim();
    if (newGoal && newGoal !== agentCurrentGoal && agentCurrentSessionId) {
      try {
        await agentApi.renameSession(agentCurrentSessionId, newGoal);
        setAgentCurrentGoal(newGoal);
        triggerConversationRefresh();
      } catch { /* non-fatal */ }
    }
    setIsEditingGoal(false);
  }, [editGoalText, agentCurrentGoal, agentCurrentSessionId, triggerConversationRefresh]);

  const handleNewAgentRun = useCallback(() => {
    setAgentEvents([]);
    setAgentCurrentGoal('');
    setAgentCurrentSession(null);
    setAgentConversationHistory([]);
    setAgentCurrentSessionId(null);
    setIsEditingGoal(false);
  }, []);

  const handleAgentDelete = useCallback(async () => {
    if (!agentCurrentSessionId) return;
    try {
      await agentApi.deleteSession(agentCurrentSessionId);
      setAgentEvents([]);
      setAgentCurrentGoal('');
      setAgentCurrentSession(null);
      setAgentCurrentSessionId(null);
      setAgentConversationHistory([]);
      triggerConversationRefresh();
    } catch { /* non-fatal */ }
    setShowDeleteAgentConfirm(false);
  }, [agentCurrentSessionId, triggerConversationRefresh]);

  const persistedAgentEvents = useMemo(() => {
    if (agentEvents.length > 0) return agentEvents;
    const events = [];
    for (const msg of messages) {
      if (msg.type === 'user') {
        events.push({ type: 'user_goal', data: { goal: msg.content, timestamp: msg.timestamp } });
      } else if (msg.type === 'assistant') {
        events.push({ type: msg.isError ? 'error' : 'answer', data: msg.isError ? { message: msg.content } : { answer: msg.content } });
      }
    }
    return events;
  }, [agentEvents, messages]);

  const agentActivityItems = useMemo(() => {
    return persistedAgentEvents
      .filter(event => ['thinking', 'tool_start', 'permission_request', 'ask_user', 'answer', 'error', 'status'].includes(event.type))
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
                    : 'Status';
        const detail = event.data?.thought || event.data?.description || event.data?.message || event.data?.answer || '';
        const dot = type === 'error'
          ? 'bg-red-400'
          : type === 'answer'
            ? 'bg-emerald-400'
            : type === 'tool_start'
              ? 'bg-blue-400'
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

  const TopBar = (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800">
      <div />
      <div className="flex items-center gap-2">
        {isGhostMode && (
          <button
            onClick={toggleGhostMode}
            className="p-1.5 rounded-lg transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50"
            title={isGhostMode ? "Exit Ghost Mode" : "Ghost Mode"}
          >
            <Ghost className={`w-4 h-4 ${isGhostMode ? "text-gray-600 dark:text-gray-400" : "text-gray-300 dark:text-gray-600"}`} />
          </button>
        )}
      </div>
    </div>
  );

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
              toolsEnabled={toolsEnabled}
              onToggleTools={() => setToolsEnabled(!toolsEnabled)}
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
    <div className="flex h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      <div className="flex flex-col h-full transition-all duration-300 min-w-0 flex-1">
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
              </div>
            </div>

            <div className="flex-1 overflow-hidden h-full relative">
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto h-full relative"
                style={{ maxHeight: '100%' }}
              >
                <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 min-h-full">
                  <AgentRunFeed
                    events={persistedAgentEvents}
                    isRunning={agentRunning}
                    streamingText={agentStreamingText}
                    onPermissionDecision={handleAgentPermission}
                    onAskUserAnswer={handleAgentAskUser}
                    onRetryTool={handleRetryTool}
                  />
                  {!agentRunning && (
                    <>
                      <AgentRunSummary events={persistedAgentEvents} duration={agentRunDuration} />
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
              <MessageInputV2
                onSubmit={handleAgentRun}
                disabled={isProcessing || agentRunning}
                autoFocus={!isProcessing && !agentRunning}
                onReset={handleClearConversation}
                placeholder={
                  isGhostMode
                    ? "👻 Ghost Mode - Messages won't be saved..."
                    : "Ask anything..."
                }
                hasMessages={hasConversationContent}
                conversationTokens={conversationTokens}
                toolsEnabled={toolsEnabled}
                onToggleTools={() => setToolsEnabled(!toolsEnabled)}
              />
            </div>
          </>
        )}
      </div>

      {(persistedAgentEvents.length > 0 || agentRunning || agentLoadingSession) && (
        <aside className="hidden xl:block w-60 shrink-0 border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50/30 dark:bg-gray-900/30 midnight:bg-slate-950/30">
          <AgentActivitySidebar
            items={agentActivityItems}
            isLoading={agentLoadingSession}
            isRunning={agentRunning}
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
