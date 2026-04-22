import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { agentApi } from '../CommandCenter/commandCenterApi';
import AgentRunFeed from './components/AgentRunFeed';
import {
  Send, Square, Loader2, Trash2, RotateCcw, Clock, CheckCircle2, AlertCircle,
  ChevronDown
} from 'lucide-react';

const EXAMPLE_GOALS = [
  { label: 'Research & summarize', prompt: 'Search the web for the latest AI agent frameworks in 2025 and write a concise comparison.' },
  { label: 'Plan my week', prompt: 'Review my tasks and calendar, then build a prioritized daily plan for the week ahead.' },
  { label: 'Save a note', prompt: 'Research the key differences between REST and GraphQL APIs and save a concise reference note.' },
  { label: 'Shell task', prompt: 'List all files larger than 10MB in the current directory and show their sizes.' },
  { label: 'Remember context', prompt: 'Remember that I prefer TypeScript over JavaScript and concise, commented code style.' },
  { label: 'Browse & extract', prompt: 'Go to https://news.ycombinator.com and summarize the top 5 stories right now.' },
];

// ── Goal input ────────────────────────────────────────────────────────────────
function GoalInput({ value, onChange, onSubmit, isRunning, autoFocus = false, compact = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Give the agent a goal…"
        rows={compact ? 1 : 2}
        disabled={isRunning}
        className={`w-full resize-none rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-800 midnight:bg-slate-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 focus:border-gray-400 dark:focus:border-gray-500 transition-all disabled:opacity-50 pr-12 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
      />
      <button
        onClick={onSubmit}
        disabled={isRunning || !value.trim()}
        className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-gray-600 hover:bg-gray-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 transition-colors"
        title="Run agent (Enter)"
      >
        {isRunning
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Send className="w-3.5 h-3.5" />}
      </button>
      {!compact && (
        <div className="absolute bottom-2.5 right-10 text-[10px] text-gray-300 dark:text-gray-700 hidden sm:flex items-center gap-0.5">
          <span>Enter to send · Shift+Enter for newline</span>
        </div>
      )}
    </div>
  );
}

// ── Session status badge ──────────────────────────────────────────────────────
function SessionBadge({ session }) {
  if (!session) return null;
  const hasAnswer = session.scratchpad?.finalAnswer || session.status === 'complete';
  const hasError  = session.status === 'error' || session.status === 'failed';

  if (hasError) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800/50">
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  if (!hasAnswer) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50">
        <Clock className="w-3 h-3" /> Incomplete
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
      <CheckCircle2 className="w-3 h-3" /> Complete
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AgentPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [goal, setGoal] = useState('');
  const [events, setEvents] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentGoal, setCurrentGoal] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const feedEndRef = useRef(null);
  const abortRef = useRef(null);

  // Load a specific session when URL changes
  useEffect(() => {
    if (!sessionId) {
      if (!isRunning) {
        setEvents([]);
        setCurrentGoal('');
        setCurrentSession(null);
      }
      return;
    }
    setLoadingSession(true);
    setCurrentSession(null);
    agentApi.getSession(sessionId).then(async res => {
      const session = res?.session;
      if (session) {
        setCurrentGoal(session.goal || '');
        setCurrentSession(session);
        // Reconstruct events from persisted tool history + final answer
        let auditRows = [];
        try {
          const auditRes = await agentApi.getSessionAudit(sessionId);
          auditRows = auditRes?.audit || [];
        } catch {}

        const sourceRows = auditRows.length ? auditRows.map(row => ({
          tool: row.tool_name,
          args: row.args,
          result: row.result,
          round: row.round,
          permission: row.permission_level,
          permissionDecision: row.permission_decision,
          permissionReason: row.permission_reason,
          workingDir: row.working_dir,
        })) : (session.toolHistory || []);

        const toolEvents = sourceRows.map(tc => ({
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
        }));
        const finalAnswer = session.scratchpad?.finalAnswer;
        const answerEvents = finalAnswer
          ? [{ type: 'answer', data: { answer: finalAnswer, round: session.totalRounds } }]
          : [];
        const errorEvents = (session.status === 'error' || session.status === 'failed')
          ? [{ type: 'error', data: { message: session.error || 'This run encountered an error.' } }]
          : [];
        setEvents([...toolEvents, ...answerEvents, ...errorEvents]);
      }
    }).catch(() => {}).finally(() => setLoadingSession(false));
  }, [sessionId]);

  // Auto-scroll on new events or streaming text
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, streamingText]);

  // Stop running — abort the fetch stream
  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsRunning(false);
    setStreamingText('');
  }, []);

  // Delete the currently-viewed session
  const handleDeleteSession = useCallback(async () => {
    if (!sessionId || isDeleting) return;
    setIsDeleting(true);
    try {
      await agentApi.deleteSession(sessionId);
      window.dispatchEvent(new CustomEvent('agent-run-complete'));
      navigate('/agents');
    } catch {}
    setIsDeleting(false);
  }, [sessionId, isDeleting, navigate]);

  // Retry — prefill goal from history session
  const handleRetry = useCallback(() => {
    if (currentSession?.goal) {
      setGoal(currentSession.goal);
      navigate('/agents');
    }
  }, [currentSession, navigate]);

  const handleRun = useCallback(async () => {
    if (!goal.trim() || isRunning) return;

    const submittedGoal = goal.trim();
    setGoal('');
    setCurrentGoal(submittedGoal);
    setEvents([]);
    setStreamingText('');
    setIsRunning(true);
    setCurrentSession(null);

    // Navigate off any loaded session URL
    if (sessionId) navigate('/agents');

    // Create a real AbortController so Stop actually cancels the stream
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const event of agentApi.runStream(submittedGoal, [], null, 25, controller.signal)) {
        // Check abort between events
        if (controller.signal.aborted) break;

        if (event.type === 'delta') {
          setStreamingText(prev => prev + (event.data?.content || ''));
          continue;
        }

        if (event.type === 'thinking' || event.type === 'tool_start' || event.type === 'answer') {
          setStreamingText('');
        }

        if (event.type === 'tool_result') {
          setEvents(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (
                updated[i].type === 'tool_start' &&
                updated[i].data?.tool === event.data?.tool &&
                updated[i].result === undefined
              ) {
                updated[i] = { ...updated[i], result: event.data?.result };
                return updated;
              }
            }
            return updated;
          });
          continue;
        }

        setEvents(prev => [...prev, event]);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setStreamingText('');
        setEvents(prev => [...prev, { type: 'error', data: { message: err.message } }]);
      }
    } finally {
      setStreamingText('');
      setIsRunning(false);
      abortRef.current = null;
      window.dispatchEvent(new CustomEvent('agent-run-complete'));
    }
  }, [goal, isRunning, sessionId, navigate]);

  const handlePermissionDecision = useCallback(async (requestId, decision) => {
    if (!requestId) return;

    setEvents(prev => prev.map(ev => (
      ev.type === 'permission_request' && ev.data?.requestId === requestId
        ? { ...ev, data: { ...ev.data, resolving: true } }
        : ev
    )));

    try {
      await agentApi.respondPermission(requestId, decision);
      setEvents(prev => prev.map(ev => (
        ev.type === 'permission_request' && ev.data?.requestId === requestId
          ? { ...ev, data: { ...ev.data, resolving: false, resolved: true, decision } }
          : ev
      )));
    } catch (err) {
      setEvents(prev => prev.map(ev => (
        ev.type === 'permission_request' && ev.data?.requestId === requestId
          ? { ...ev, data: { ...ev.data, resolving: false, resolved: true, decision: 'error', error: err.message } }
          : ev
      )));
    }
  }, []);

  const hasEvents = events.length > 0;
  const isViewingHistory = !!sessionId && !isRunning;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">

      {/* Header — shown when there's a run active or history loaded */}
      {(hasEvents || isRunning || loadingSession) && (
        <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-4 py-2.5 flex items-center gap-2.5">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
            {currentGoal || 'Agent run'}
          </span>

          {/* Status badge for history sessions */}
          {isViewingHistory && !loadingSession && currentSession && (
            <SessionBadge session={currentSession} />
          )}

          {/* Retry button for history view */}
          {isViewingHistory && currentSession?.goal && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              title="Re-run this goal"
            >
              <RotateCcw className="w-3 h-3" /> Retry
            </button>
          )}

          {/* Delete button for history view */}
          {isViewingHistory && sessionId && (
            <button
              onClick={handleDeleteSession}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
              title="Delete this session"
            >
              {isDeleting
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
          )}

          {/* Stop button when running */}
          {isRunning && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      {!hasEvents && !isRunning && !loadingSession ? (
        // Empty state / new run
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-10 overflow-y-auto">
          <div className="max-w-xl w-full">
            {/* Title */}
            <div className="mb-7 justify-center">
              <h1 className="text-lg font-medium text-gray-900 dark:text-white text-center">Agent</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">Give it a goal — it figures out the steps</p>
            </div>

            <GoalInput
              value={goal}
              onChange={setGoal}
              onSubmit={handleRun}
              isRunning={isRunning}
              autoFocus
            />

            {/* Example goals */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 dark:text-gray-600 mb-2 text-center">Try one of these</p>
              <div className="grid grid-cols-2 gap-2">
                {EXAMPLE_GOALS.map((eg, i) => (
                  <button
                    key={i}
                    onClick={() => setGoal(eg.prompt)}
                    className="text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 hover:bg-gray-50 dark:hover:bg-gray-800/60 midnight:hover:bg-slate-800/60 transition-colors"
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
        // Event feed
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loadingSession ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading session…
              </div>
            ) : (
              <AgentRunFeed
                events={events}
                isRunning={isRunning}
                streamingText={streamingText}
                onPermissionDecision={handlePermissionDecision}
              />
            )}
            <div ref={feedEndRef} />
          </div>

          {/* Always-visible goal input at bottom — even for history (allows new run) */}
          <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-4 py-3 bg-white dark:bg-gray-900 midnight:bg-slate-950">
            {isViewingHistory && (
              <p className="text-[11px] text-gray-400 dark:text-gray-600 mb-1.5 text-center">
                Viewing history — start a new run below
              </p>
            )}
            <GoalInput
              value={goal}
              onChange={setGoal}
              onSubmit={handleRun}
              isRunning={isRunning}
              compact
            />
          </div>
        </>
      )}
    </div>
  );
}
