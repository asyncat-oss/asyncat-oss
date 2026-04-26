// CommandCenterV2Enhanced.jsx

// ── Agent status badge (module-level to avoid re-mount on every render) ────────
function AgentStatusBadge({ session }) {
  if (!session) return null;
  const hasAnswer = session.scratchpad?.finalAnswer || session.status === 'complete';
  const hasError  = session.status === 'error' || session.status === 'failed';
  if (hasError) return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800/50">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Failed
    </span>
  );
  if (!hasAnswer) return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Incomplete
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Complete
    </span>
  );
}

const AGENT_EXAMPLES = [
  { label: 'Research & summarize', prompt: 'Search the web for the latest AI agent frameworks in 2025 and write a concise comparison.' },
  { label: 'Plan my week',         prompt: 'Review my tasks and calendar, then build a prioritized daily plan for the week ahead.' },
  { label: 'Save a note',          prompt: 'Research the key differences between REST and GraphQL APIs and save a concise reference note.' },
  { label: 'Shell task',           prompt: 'List all files larger than 10MB in the current directory and show their sizes.' },
  { label: 'Remember context',     prompt: 'Remember that I prefer TypeScript over JavaScript and concise, commented code style.' },
  { label: 'Browse & extract',     prompt: 'Go to https://news.ycombinator.com and summarize the top 5 stories right now.' },
];

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { MessageListV2 } from "./components/MessageListV2";
import { MessageInputV2 } from "./components/MessageInputV2";
import AgentRunFeed from '../Agent/components/AgentRunFeed';
import AgentToolsView from '../Agent/components/AgentToolsView';
import AgentSkillsView from '../Agent/components/AgentSkillsView';
import ArtifactsGallery from "./components/artifacts/ArtifactsGallery";
import SaveAsNoteModal from "./components/SaveAsNoteModal";
import ClarifyingQuestionsWidget from "./components/ClarifyingQuestionsWidget";
import ArtifactSidePanel from "./components/artifacts/ArtifactSidePanel";
import DeleteConfirmationModal from "./components/DeleteConfirmationModal";
import ExplainTermPanel from "./components/ExplainTermPanel";
import GlossaryGallery from "./components/GlossaryGallery";
import ConversationNavigation from "./components/ConversationNavigation";
import { useCommandCenter } from "./CommandCenterContextEnhanced";
import { chatApi, agentApi } from "./commandCenterApi";
import { useUser } from "../contexts/UserContext";
import {
  Edit2,
  Trash2,
  Check,
  X,
  Ghost,
  Grid3x3,
  LayoutList,
  Calendar,
  PenLine,
  Lightbulb,
  Download,
  Library,
  Menu,
  BookOpen,
  Bot,
  MessageSquare,
  Loader2,
  RotateCcw,
} from "lucide-react";

const CommandCenterV2Enhanced = ({ initialMode = 'chat', agentSessionId = null, initialAgentView = 'run' }) => {
  const commandCenterContext = useCommandCenter();
  const { userName } = useUser();

  const {
    messages = [],
    isProcessing = false,
    isStreaming = false,
    isConversationLoading = false,
    handleStreamingMessage = () => {},
    handleRegenerate = () => {},
    handleClearConversation = () => {},
    currentConversationId = null,
    conversationTitle = "",
    triggerConversationRefresh = () => {},
    setConversationTitle = () => {},
    isGhostMode = false,
    toggleGhostMode = () => {},
    conversationSummaries = null,
    conversationHistory = [],
  } = commandCenterContext || {};

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArtifactsGallery, setShowArtifactsGallery] = useState(false);
  const [showSaveNoteModal, setShowSaveNoteModal] = useState(false);
  const [artifactToSave, setArtifactToSave] = useState(null);
  const [clarifyQuestions, setClarifyQuestions] = useState(null);
  const [sideArtifact, setSideArtifact] = useState(null);
  const [explainPanel, setExplainPanel] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showNavigation, setShowNavigation] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // ── Agent mode ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState(initialMode);
  const [agentEvents, setAgentEvents] = useState([]);
  const [agentStreamingText, setAgentStreamingText] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentCurrentGoal, setAgentCurrentGoal] = useState('');
  const [agentCurrentSession, setAgentCurrentSession] = useState(null);
  const [agentLoadingSession, setAgentLoadingSession] = useState(false);
  const [agentConversationHistory, setAgentConversationHistory] = useState([]);
  const [agentCurrentSessionId, setAgentCurrentSessionId] = useState(null);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [editGoalText, setEditGoalText] = useState('');
  const [showDeleteAgentConfirm, setShowDeleteAgentConfirm] = useState(false);
  const agentAbortRef = useRef(null);
  const agentFeedEndRef = useRef(null);
  const [agentView, setAgentView] = useState(initialAgentView); // 'run' | 'tools' | 'skills'

  const conversationTokens = useMemo(() => {
    const historyChars = (conversationHistory || []).reduce(
      (sum, m) => sum + (m.content?.length || 0),
      0,
    );
    return Math.round(historyChars / 4) + 500;
  }, [conversationHistory]);

  // Count total artifacts in conversation - memoized for performance
  const totalArtifacts = useMemo(() => {
    // Messages use 'type' not 'role'
    const count = messages
      .filter(
        (msg) =>
          msg.type === "assistant" &&
          msg.artifacts &&
          Array.isArray(msg.artifacts),
      )
      .reduce((count, msg) => count + msg.artifacts.length, 0);

    return count;
  }, [messages]);

  // Count unique annotated glossary terms across all assistant messages
  const totalGlossaryTerms = useMemo(() => {
    const seen = new Set();
    const regex = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
    messages
      .filter((msg) => msg.type === "assistant" && msg.content)
      .forEach((msg) => {
        let m;
        const r = new RegExp(regex.source, "g");
        while ((m = r.exec(msg.content)) !== null) {
          seen.add(m[1].trim().toLowerCase());
        }
      });
    return seen.size;
  }, [messages]);

  // Count headings in messages for navigation
  const hasNavigableHeadings = useMemo(() => {
    return messages.some(
      (msg) =>
        msg.type === "assistant" &&
        msg.content &&
        (msg.content.includes("## ") || msg.content.includes("### ")),
    );
  }, [messages]);

  // Improved auto-scroll with smooth animation
  const scrollToBottom = useCallback((force = false) => {
    let shouldScroll = force;
    if (!shouldScroll && scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      // Allow a larger margin to be considered "at bottom" in case of fast token streaming
      shouldScroll = scrollHeight - scrollTop - clientHeight < 400;
    } else if (!scrollContainerRef.current && !force) {
      shouldScroll = true; // Fallback if ref is not attached yet
    }

    if (shouldScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: force ? "smooth" : "auto", // Token streaming better with auto, user msgs smooth
        block: "end",
        inline: "nearest",
      });
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      const isLastMessageUser = messages[messages.length - 1]?.type === "user";
      // Small delay to ensure DOM is updated
      requestAnimationFrame(() => {
        setTimeout(() => scrollToBottom(isLastMessageUser), 100);
      });
    }
  }, [messages, scrollToBottom]);


  // Handler for saving artifacts to notes - opens modal
  const handleSaveArtifactToNotes = useCallback(async (artifact) => {
    setArtifactToSave(artifact);
    setShowSaveNoteModal(true);
  }, []);

  // Detect <clarify> blocks in the last assistant message once streaming ends
  useEffect(() => {
    if (isStreaming || isProcessing) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.type !== "assistant") return;
    const match = lastMsg.content?.match(/<clarify>([\s\S]*?)<\/clarify>/);
    if (!match) return;
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.questions?.length) {
        setClarifyQuestions(parsed.questions);
      }
    } catch (err) {
        console.error('Failed to parse clarify questions:', err);
      }
  }, [messages, isStreaming, isProcessing]);

  // Load agent session on mount if agentSessionId provided
  useEffect(() => {
    if (!agentSessionId || mode !== 'agent') return;

    const loadSession = async () => {
      setAgentLoadingSession(true);
      try {
        const res = await agentApi.getSession(agentSessionId);
        if (res?.success && res.session) {
          const session = res.session;
          setAgentCurrentSessionId(session.id);
          setAgentCurrentGoal(session.goal || 'Agent session');
          setAgentCurrentSession(session);

          // Reconstruct event feed from conversation rounds
          const rounds = session.scratchpad?.conversationRounds || [];
          const reconstructedEvents = [];
          rounds.forEach((round, idx) => {
            if (idx > 0) {
              reconstructedEvents.push({
                type: 'run_start',
                data: { goal: round.goal }
              });
            }
            reconstructedEvents.push({
              type: 'answer',
              data: { answer: round.answer, round: idx }
            });
          });
          setAgentEvents(reconstructedEvents);

          // Reconstruct conversation history for context
          const history = [];
          rounds.forEach(round => {
            history.push({ role: 'user', content: round.goal });
            history.push({ role: 'assistant', content: round.answer });
          });
          setAgentConversationHistory(history);
        }
      } catch (err) {
        console.error('Failed to load agent session:', err);
      } finally {
        setAgentLoadingSession(false);
      }
    };

    loadSession();
  }, [agentSessionId, mode]);

  // Close export menu on outside click
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

  // Chat management handlers (only for chat/image modes)
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

  const handleQuestionClick = useCallback(
    (questionText) => {
      handleStreamingMessage(questionText, []);
    },
    [handleStreamingMessage],
  );

  const handleSendMessage = useCallback(
    (message, projects) => {
      return handleStreamingMessage(message, projects);
    },
    [handleStreamingMessage],
  );

  // Reset UI states when switching conversations
  useEffect(() => {
    setSideArtifact(null);
    setClarifyQuestions(null);
    setShowArtifactsGallery(false);
    setExplainPanel(null);
    setShowGlossary(false);
  }, [currentConversationId]);

  // Sync mode + agentView when route changes
  useEffect(() => {
    setAgentView(initialAgentView);
  }, [initialAgentView]);

  useEffect(() => {
    setMode(initialMode);
    if (initialMode === 'chat') {
      setAgentEvents([]);
      setAgentCurrentGoal('');
      setAgentCurrentSession(null);
      setAgentConversationHistory([]);
      setAgentCurrentSessionId(null);
      setIsEditingGoal(false);
    }
  }, [initialMode]);

  // Load agent session from URL param
  useEffect(() => {
    if (mode !== 'agent' || !agentSessionId) return;
    setAgentLoadingSession(true);
    setAgentCurrentSession(null);
    setAgentCurrentSessionId(agentSessionId);
    agentApi.getSession(agentSessionId).then(async res => {
      const sess = res?.session;
      if (!sess) return;
      setAgentCurrentGoal(sess.goal || '');
      setAgentCurrentSession(sess);
      let auditRows = [];
      try {
        const auditRes = await agentApi.getSessionAudit(agentSessionId);
        auditRows = auditRes?.audit || [];
      } catch { /* ignore */ }
      const sourceRows = auditRows.length
        ? auditRows.map(r => ({ tool: r.tool_name, args: r.args, result: r.result, round: r.round,
            permission: r.permission_level, permissionDecision: r.permission_decision,
            permissionReason: r.permission_reason, workingDir: r.working_dir }))
        : (sess.toolHistory || []);
      const toolEvents = sourceRows.map(tc => ({
        type: 'tool_start',
        data: { tool: tc.tool, args: tc.args, round: tc.round, permission: tc.permission,
          permissionDecision: tc.permissionDecision, permissionReason: tc.permissionReason, workingDir: tc.workingDir },
        result: tc.result,
      }));
      const finalAnswer = sess.scratchpad?.finalAnswer;
      const answerEvents = finalAnswer
        ? [{ type: 'answer', data: { answer: finalAnswer, round: sess.totalRounds } }] : [];
      const errorEvents = (sess.status === 'error' || sess.status === 'failed')
        ? [{ type: 'error', data: { message: sess.error || 'This run encountered an error.' } }] : [];
      setAgentEvents([...toolEvents, ...answerEvents, ...errorEvents]);
    }).catch(() => {}).finally(() => setAgentLoadingSession(false));
  }, [agentSessionId, mode]);

  // Handler for annotated term clicks — opens explain panel with pre-baked data
  const handleTermClick = useCallback((term, definition) => {
    setExplainPanel({ term, definition });
    setSideArtifact(null);
  }, []);

  // Auto-open side panel when last assistant message has artifacts
  useEffect(() => {
    if (isStreaming || isProcessing) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.type !== "assistant") return;

    // Only auto-open if we just received a new message (we don't want to force it open just by switching chats)
    // Actually, the easiest way to prevent it forcing open when switching to an old chat is to track
    // if the last message was recently added, but let's just stick to the basic reset for now.
    // However, if we evaluate `messages` here, it will trigger on conversation load.
    // If the last message has artifacts, it auto-opens. This might be fine, or annoying.
    // We'll leave it as is but let's fix the bug where the artifact stays open *incorrectly* first.
    if (lastMsg.artifacts?.length) {
      setSideArtifact(lastMsg.artifacts[lastMsg.artifacts.length - 1]);
    }
  }, [messages, isStreaming, isProcessing]);

  const handleClarifySubmit = useCallback(
    (formattedAnswers) => {
      setClarifyQuestions(null);
      handleSendMessage(formattedAnswers, []);
    },
    [handleSendMessage],
  );

  const handleClarifyClose = useCallback(() => {
    setClarifyQuestions(null);
    handleSendMessage(
      "I'd prefer not to specify details right now — please do your best with what you have.",
      [],
    );
  }, [handleSendMessage]);

  // ── Agent handlers ──────────────────────────────────────────────────────────
  const handleAgentRun = useCallback(async (messageObj) => {
    const goal = typeof messageObj === 'string' ? messageObj : messageObj?.content;
    if (!goal?.trim() || agentRunning) return;
    const submittedGoal = goal.trim();
    setAgentCurrentGoal(submittedGoal);

    // If continuing a session, append a divider; otherwise start fresh
    setAgentEvents(prev =>
      prev.length > 0
        ? [...prev, { type: 'run_start', data: { goal: submittedGoal } }]
        : []
    );

    setAgentStreamingText('');
    setAgentRunning(true);
    setAgentCurrentSession(null);
    const controller = new AbortController();
    agentAbortRef.current = controller;

    let capturedFinalAnswer = '';

    try {
      for await (const event of agentApi.runStream(submittedGoal, agentConversationHistory, null, 25, controller.signal, agentCurrentSessionId)) {
        if (controller.signal.aborted) break;
        if (event.type === 'delta') {
          setAgentStreamingText(prev => prev + (event.data?.content || ''));
          continue;
        }
        if (event.type === 'thinking' || event.type === 'tool_start' || event.type === 'answer') {
          setAgentStreamingText('');
        }
        if (event.type === 'done') {
          if (event.data?.sessionId) setAgentCurrentSessionId(event.data.sessionId);
          continue;
        }
        if (event.type === 'answer') {
          capturedFinalAnswer = event.data?.answer || '';
        }
        if (event.type === 'tool_result') {
          setAgentEvents(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].type === 'tool_start' && updated[i].data?.tool === event.data?.tool && updated[i].result === undefined) {
                updated[i] = { ...updated[i], result: event.data?.result };
                return updated;
              }
            }
            return updated;
          });
          continue;
        }
        setAgentEvents(prev => [...prev, event]);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setAgentStreamingText('');
        setAgentEvents(prev => [...prev, { type: 'error', data: { message: err.message } }]);
      }
    } finally {
      // Accumulate history so follow-up goals have context
      if (capturedFinalAnswer) {
        setAgentConversationHistory(prev => [
          ...prev,
          { role: 'user', content: submittedGoal },
          { role: 'assistant', content: capturedFinalAnswer },
        ]);
      }
      setAgentStreamingText('');
      setAgentRunning(false);
      agentAbortRef.current = null;
      window.dispatchEvent(new CustomEvent('agent-run-complete'));
    }
  }, [agentRunning, agentConversationHistory]);

  const handleAgentPermission = useCallback(async (requestId, decision) => {
    if (!requestId) return;
    setAgentEvents(prev => prev.map(ev =>
      ev.type === 'permission_request' && ev.data?.requestId === requestId
        ? { ...ev, data: { ...ev.data, resolving: true } } : ev
    ));
    try {
      await agentApi.respondPermission(requestId, decision);
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

  // Export conversation as Markdown
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
      // Include artifact content inline
      if (msg.artifacts?.length) {
        msg.artifacts.forEach((a) => {
          lines.push("");
          lines.push(`**Artifact: ${a.title}** (\`${a.type}\`)`);
          lines.push("");
          lines.push("```" + (a.language || a.type || ""));
          lines.push(a.content || "");
          lines.push("```");
        });
      }
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

  // Export conversation as HTML
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
    .artifact { margin-top: 15px; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; }
    .artifact-title { font-weight: 600; margin-bottom: 8px; color: #555; }
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
      const artifactsHTML =
        msg.artifacts
          ?.map(
            (a) => `
      <div class="artifact">
        <div class="artifact-title">${a.title} (${a.type})</div>
        <pre><code>${a.content || ""}</code></pre>
      </div>
    `,
          )
          .join("") || "";
      return `
      <div class="message ${msg.type}">
        <div class="speaker">${speaker}${time ? `<span class="time">${time}</span>` : ""}</div>
        <div class="content">${msg.content || ""}</div>
        ${artifactsHTML}
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

  // Export conversation as JSON
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
        artifacts: msg.artifacts || [],
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

  // Export conversation as PDF (using print dialog)
  const handleExportPDF = useCallback(() => {
    if (!messages.length) return;
    // Open print dialog - user can save as PDF
    window.print();
  }, [messages]);

  // Loading skeleton for conversation - matches actual message UI with thinking indicator
  const ConversationLoadingSkeleton = () => (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header skeleton */}
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

      {/* Messages skeleton - matches MessageListV2 structure */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-8">
          {/* User message skeleton */}
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

          {/* Assistant message skeleton with thinking indicator */}
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

  // Categorised suggestions — category tabs → sub-prompts on click
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

  // ── Unified top bar ──────────────────────────────────────────────────────────
  const TopBar = (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800">
      <div className="flex items-center gap-2">
        <img src="/cat.svg" alt="The Cat" className="w-6 h-6" />
      </div>
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
        <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 p-0.5">
          <button
            onClick={() => setMode('chat')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === 'chat'
                ? 'bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <MessageSquare className="w-3 h-3" /> Chat
          </button>
          <button
            onClick={() => setMode('agent')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === 'agent'
                ? 'bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Bot className="w-3 h-3" /> Agent
          </button>
        </div>
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

  // Welcome screen
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
  const welcomeScreenJSX =
    messages.length === 0 ? (
      <div className="flex flex-col min-h-full relative">
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-8">
          <div className="max-w-2xl w-full">
            {/* Greeting */}
            <div className="flex items-center gap-3 mb-6 justify-center">
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

            {/* Input */}
            <MessageInputV2
              onSubmit={handleSendMessage}
              disabled={isProcessing || isStreaming}
              autoFocus={true}
              placeholder={
                isGhostMode
                  ? "👻 Ghost Mode — messages won't be saved..."
                  : "Ask anything, or create tasks, events, notes..."
              }
              hasMessages={messages.length > 0}
              conversationTokens={conversationTokens}
            />

            {/* Categorised suggestions — below input */}
            {!isGhostMode && (
              <div className="mt-4">
                {/* Category tabs */}
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

                {/* Sub-prompts dropdown */}
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
      {/* Main column */}
      <div className="flex flex-col h-full transition-all duration-300 min-w-0 flex-1">
        {/* Unified top bar — consistent across all modes */}
        {TopBar}
        {mode === 'agent' ? (
          // ── Agent mode ────────────────────────────────────────────────────────
          <>
            {/* Agent sub-nav bar */}
            <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-4 py-2 flex items-center gap-2">
              {/* Sub-tabs: Run | Tools | Skills */}
              <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                {[
                  { id: 'run',    label: 'Run' },
                  { id: 'tools',  label: 'Tools' },
                  { id: 'skills', label: 'Skills' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setAgentView(tab.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      agentView === tab.id
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Run tab extras */}
              {agentView === 'run' && agentEvents.length > 0 && !agentRunning && (
                <>
                  {agentCurrentSession && <AgentStatusBadge session={agentCurrentSession} />}
                  <button
                    onClick={() => { setAgentEvents([]); setAgentCurrentGoal(''); setAgentCurrentSession(null); setAgentConversationHistory([]); setAgentCurrentSessionId(null); setIsEditingGoal(false); }}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> New run
                  </button>
                </>
              )}
            </div>

            {/* Goal title bar — shown when there's an active/completed run, mirrors chat header */}
            {agentView === 'run' && agentEvents.length > 0 && (
              <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-4 py-2.5 flex items-center gap-2">
                {isEditingGoal ? (
                  <>
                    <input
                      type="text"
                      value={editGoalText}
                      onChange={e => setEditGoalText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAgentRename(); if (e.key === 'Escape') setIsEditingGoal(false); }}
                      onBlur={handleAgentRename}
                      className="flex-1 text-sm bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-300 dark:border-gray-600 midnight:border-slate-600 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                      autoFocus
                    />
                    <button onClick={handleAgentRename} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setIsEditingGoal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditGoalText(agentCurrentGoal); setIsEditingGoal(true); }}
                      className="group flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors cursor-text min-w-0 flex-1 text-left"
                      title="Click to rename"
                    >
                      <span className="truncate">{agentCurrentGoal || 'Agent run'}</span>
                      <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-40 flex-shrink-0 transition-opacity" />
                    </button>
                    {agentCurrentSessionId && !agentRunning && (
                      <button
                        onClick={() => setShowDeleteAgentConfirm(true)}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
                        title="Delete this run"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Sub-view content */}
            {agentView === 'tools' ? (
              <AgentToolsView />
            ) : agentView === 'skills' ? (
              <AgentSkillsView />
            ) : agentEvents.length === 0 && !agentRunning && !agentLoadingSession ? (
              // Run tab — empty state
              <div className="flex flex-col items-center justify-center flex-1 px-6 py-10 overflow-y-auto">
                <div className="max-w-xl w-full">
                  <div className="mb-7 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Give it a goal — it figures out the steps</p>
                  </div>
                  <MessageInputV2
                    onSubmit={handleAgentRun}
                    disabled={agentRunning}
                    autoFocus
                    placeholder="Give the agent a goal…"
                    hasMessages={false}
                    conversationTokens={0}
                  />
                  <div className="mt-4">
                    <p className="text-xs text-gray-400 dark:text-gray-600 mb-2 text-center">Try one of these</p>
                    <div className="grid grid-cols-2 gap-2">
                      {AGENT_EXAMPLES.map((eg, i) => (
                        <button
                          key={i}
                          onClick={() => handleAgentRun({ content: eg.prompt })}
                          className="text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                        >
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">{eg.label}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 line-clamp-2 leading-snug">{eg.prompt}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Run tab — active/history
              <>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {agentLoadingSession ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading session…
                    </div>
                  ) : (
                    <AgentRunFeed
                      events={agentEvents}
                      isRunning={agentRunning}
                      streamingText={agentStreamingText}
                      onPermissionDecision={handleAgentPermission}
                    />
                  )}
                  <div ref={agentFeedEndRef} />
                </div>
                {!agentRunning && !agentLoadingSession && (
                  <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-4 py-3">
                    <MessageInputV2
                      onSubmit={handleAgentRun}
                      disabled={agentRunning}
                      placeholder="Run another goal…"
                      hasMessages={false}
                      conversationTokens={0}
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : isConversationLoading ? (
          <ConversationLoadingSkeleton />
        ) : messages.length === 0 ? (
          welcomeScreenJSX
        ) : (
          <>
            {/* Header */}
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
                    {/* Export Dropdown */}
                    {messages.length > 0 && (
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

                    {/* Artifacts Gallery Button */}
                    {totalArtifacts > 0 && (
                      <button
                        onClick={() => setShowArtifactsGallery(true)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30 text-blue-700 dark:text-blue-300 midnight:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 midnight:hover:bg-blue-900/40 rounded-lg transition-colors"
                        title="View all artifacts from this conversation"
                      >
                        <Grid3x3 className="w-4 h-4" />
                        <span>Artifacts</span>
                        <span className="px-1.5 py-0.5 text-xs bg-blue-600 dark:bg-blue-500 text-white rounded-full">
                          {totalArtifacts}
                        </span>
                      </button>
                    )}

                    {/* Glossary Button */}
                    {totalGlossaryTerms > 0 && (
                      <button
                        onClick={() => setShowGlossary(true)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 midnight:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 midnight:hover:bg-indigo-900/40 rounded-lg transition-colors"
                        title="View all defined terms from this conversation"
                      >
                        <Library className="w-4 h-4" />
                        <span>Glossary</span>
                        <span className="px-1.5 py-0.5 text-xs bg-indigo-600 dark:bg-indigo-500 text-white rounded-full">
                          {totalGlossaryTerms}
                        </span>
                      </button>
                    )}

                    {/* Toggle navigation sidebar */}
                    {!showNavigation && (
                      <button
                        onClick={() => setShowNavigation(true)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded transition-colors"
                        title="Show navigation"
                      >
                        <Menu className="w-4 h-4" />
                      </button>
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
              <MessageListV2
                ref={scrollContainerRef}
                messages={messages}
                isLoading={isProcessing}
                isConversationLoading={isConversationLoading}
                onRegenerate={handleRegenerate}
                onEdit={null}
                messagesEndRef={messagesEndRef}
                onReset={handleClearConversation}
                onQuestionClick={handleQuestionClick}
                projectIds={[]}
                userContext={null}
                onSaveArtifactToNotes={handleSaveArtifactToNotes}
                onArtifactOpen={setSideArtifact}
                onTermClick={handleTermClick}
                conversationSummaries={conversationSummaries || []}
              />
            </div>

            {clarifyQuestions && (
              <div className="shrink-0">
                <ClarifyingQuestionsWidget
                  questions={clarifyQuestions}
                  onSubmit={handleClarifySubmit}
                  onClose={handleClarifyClose}
                />
              </div>
            )}

            <div className="shrink-0">
              <MessageInputV2
                onSubmit={handleSendMessage}
                disabled={isProcessing || isStreaming}
                autoFocus={!isProcessing && !isStreaming}
                onReset={handleClearConversation}
                placeholder={
                  isGhostMode
                    ? "👻 Ghost Mode - Messages won't be saved..."
                    : "Ask anything..."
                }
                hasMessages={messages.length > 0}
                conversationTokens={conversationTokens}
              />
            </div>
          </>
        )}
      </div>

      {/* Center: artifact/explain panel (chat mode only) */}
      {mode !== 'agent' && (sideArtifact || explainPanel) && (
        <div className="w-[45%] max-w-[640px] border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700 flex flex-col h-full">
          {explainPanel ? (
            <ExplainTermPanel
              term={explainPanel.term}
              definition={explainPanel.definition}
              onClose={() => setExplainPanel(null)}
              onOpenGlossary={() => {
                setExplainPanel(null);
                setShowGlossary(true);
              }}
            />
          ) : (
            <ArtifactSidePanel
              artifact={sideArtifact}
              onClose={() => setSideArtifact(null)}
              onSaveToNotes={handleSaveArtifactToNotes}
            />
          )}
        </div>
      )}

      {/* Right: "On this page" navigation sidebar (chat mode only) */}
      {mode !== 'agent' && hasNavigableHeadings && showNavigation && (
        <div className="w-60 border-l border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50/30 dark:bg-gray-900/30 midnight:bg-slate-950/30">
          <ConversationNavigation
            messages={messages}
            onClose={() => setShowNavigation(false)}
          />
        </div>
      )}

      {/* Artifacts Gallery Modal */}
      {showArtifactsGallery && (
        <ArtifactsGallery
          messages={messages}
          onClose={() => setShowArtifactsGallery(false)}
          onSaveToNotes={handleSaveArtifactToNotes}
        />
      )}

      {/* Delete Conversation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConversation}
        title={conversationTitle}
      />

      {/* Delete Agent Run Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteAgentConfirm}
        onClose={() => setShowDeleteAgentConfirm(false)}
        onConfirm={handleAgentDelete}
        title={agentCurrentGoal}
      />

      {/* Glossary Modal */}
      {showGlossary && (
        <GlossaryGallery
          messages={messages}
          onClose={() => setShowGlossary(false)}
          onTermClick={(term, definition) => {
            setShowGlossary(false);
            setExplainPanel({ term, definition });
            setSideArtifact(null);
          }}
        />
      )}

      {/* Save Note Modal */}
      {showSaveNoteModal && artifactToSave && (
        <SaveAsNoteModal
          isOpen={showSaveNoteModal}
          onClose={() => {
            setShowSaveNoteModal(false);
            setArtifactToSave(null);
          }}
          content={artifactToSave.content}
          title={artifactToSave.title}
          blocks={null}
        />
      )}
    </div>
  );
};

export default CommandCenterV2Enhanced;
