import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { agentApi } from '../CommandCenter/commandCenterApi';
import AgentRunFeed from './components/AgentRunFeed';
import {
  Bot, Send, Square, Loader2,
  CornerDownLeft, Zap
} from 'lucide-react';

const EXAMPLE_GOALS = [
  { label: 'Search & summarize', prompt: 'Search the web for the latest news on AI agents and summarize the top 3 stories.' },
  { label: 'Plan my week', prompt: 'Check my tasks and calendar events this week and suggest a prioritized daily plan.' },
  { label: 'Research & save notes', prompt: 'Research the key differences between REST and GraphQL APIs, then save a concise note to my workspace.' },
  { label: 'Find overdue tasks', prompt: 'Find all my overdue tasks across projects and draft a catch-up plan with realistic new deadlines.' },
];

function GoalInput({ value, onChange, onSubmit, isRunning, autoFocus = false, compact = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
        rows={compact ? 2 : 3}
        disabled={isRunning}
        className={`w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-800 midnight:bg-slate-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all disabled:opacity-50 pr-12 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
      />
      <button
        onClick={onSubmit}
        disabled={isRunning || !value.trim()}
        className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 transition-colors"
        title="Run agent (⌘↵)"
      >
        {isRunning
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Send className="w-3.5 h-3.5" />}
      </button>
      {!compact && (
        <div className="absolute bottom-2.5 right-10 text-[10px] text-gray-300 dark:text-gray-700 hidden sm:flex items-center gap-0.5">
          <CornerDownLeft className="w-2.5 h-2.5" />
          <span>⌘↵</span>
        </div>
      )}
    </div>
  );
}

export default function AgentPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [goal, setGoal] = useState('');
  const [events, setEvents] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentGoal, setCurrentGoal] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const feedEndRef = useRef(null);

  // Load a specific session when URL changes
  useEffect(() => {
    if (!sessionId) {
      if (!isRunning) {
        setEvents([]);
        setCurrentGoal('');
      }
      return;
    }
    setLoadingSession(true);
    agentApi.getSession(sessionId).then(res => {
      const session = res?.session;
      if (session) {
        setCurrentGoal(session.goal || '');
        // Reconstruct events from persisted tool history + final answer
        const toolEvents = (session.toolHistory || []).map(tc => ({
          type: 'tool_start',
          data: { tool: tc.tool, args: tc.args, round: tc.round },
          result: tc.result,
        }));
        const finalAnswer = session.scratchpad?.finalAnswer;
        const answerEvents = finalAnswer
          ? [{ type: 'answer', data: { answer: finalAnswer, round: session.totalRounds } }]
          : [];
        setEvents([...toolEvents, ...answerEvents]);
      }
    }).catch(() => {}).finally(() => setLoadingSession(false));
  }, [sessionId]);

  // Auto-scroll on new events or streaming text
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, streamingText]);

  const handleRun = useCallback(async () => {
    if (!goal.trim() || isRunning) return;

    const submittedGoal = goal.trim();
    setGoal('');
    setCurrentGoal(submittedGoal);
    setEvents([]);
    setStreamingText('');
    setIsRunning(true);

    // Navigate off any loaded session URL so there's no conflict
    if (sessionId) navigate('/agents');

    try {
      for await (const event of agentApi.runStream(submittedGoal)) {
        if (event.type === 'delta') {
          setStreamingText(prev => prev + (event.data?.content || ''));
          continue;
        }

        // Structured event arriving — clear live preview for this round
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
      setStreamingText('');
      setEvents(prev => [...prev, { type: 'error', data: { message: err.message } }]);
    } finally {
      setStreamingText('');
      setIsRunning(false);
      // Tell the sidebar to refresh its session list
      window.dispatchEvent(new CustomEvent('agent-run-complete'));
    }
  }, [goal, isRunning, sessionId, navigate]);

  const hasEvents = events.length > 0;
  const isViewingHistory = !!sessionId && !isRunning;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header — shown when there's content */}
      {(hasEvents || isRunning || loadingSession) && (
        <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-6 py-3 flex items-center gap-3">
          <Bot className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
            {currentGoal || 'Agent run'}
          </span>
          {isRunning && (
            <button
              onClick={() => setIsRunning(false)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      {!hasEvents && !isRunning && !loadingSession ? (
        // Empty state / new run
        <div className="flex flex-col items-center justify-center flex-1 px-8 py-12">
          <div className="max-w-lg w-full">
            <div className="flex items-center gap-3 mb-8 justify-center">
              <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
                  Agent
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                  Give it a goal — it figures out the steps
                </p>
              </div>
            </div>

            <GoalInput
              value={goal}
              onChange={setGoal}
              onSubmit={handleRun}
              isRunning={isRunning}
              autoFocus
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              {EXAMPLE_GOALS.map((eg, i) => (
                <button
                  key={i}
                  onClick={() => setGoal(eg.prompt)}
                  className="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600/60 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all group"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="w-3 h-3 text-indigo-400 group-hover:text-indigo-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                      {eg.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 line-clamp-2 leading-snug">
                    {eg.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        // Event feed
        <>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loadingSession ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading session…
              </div>
            ) : (
              <AgentRunFeed events={events} isRunning={isRunning} streamingText={streamingText} />
            )}
            <div ref={feedEndRef} />
          </div>

          {/* Goal input at bottom — not shown when viewing saved history */}
          {!isViewingHistory && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-6 py-3">
              <GoalInput
                value={goal}
                onChange={setGoal}
                onSubmit={handleRun}
                isRunning={isRunning}
                compact
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
