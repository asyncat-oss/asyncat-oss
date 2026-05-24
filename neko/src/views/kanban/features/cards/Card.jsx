import { useState } from 'react';
import {
  Bot, ExternalLink, RotateCcw, X, Play,
  MessageCircle, CheckCircle2, AlertCircle, Clock, Loader2,
} from 'lucide-react';
import { agentTaskRunsApi } from '../../../../CommandCenter/api';

const PROFILE_COLOR_MAP = {
  indigo:  'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  blue:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  violet:  'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  amber:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  rose:    'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  cyan:    'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  gray:    'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};

function profileColorClass(color) {
  return PROFILE_COLOR_MAP[color] || PROFILE_COLOR_MAP.gray;
}

function StatusBadge({ run }) {
  if (!run) return null;
  const status = run.displayStatus || run.status;
  if (status === 'queued') return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">
      <Clock className="w-3 h-3" /> queued
    </span>
  );
  if (status === 'running') return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
      <Loader2 className="w-3 h-3 animate-spin" /> running
    </span>
  );
  if (status === 'needs_input') return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
      <MessageCircle className="w-3 h-3" /> needs input
    </span>
  );
  if (status === 'completed') return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> done
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400">
      <AlertCircle className="w-3 h-3" /> failed
    </span>
  );
}

const AgentCard = ({ task, columnId, onClick, onRefresh }) => {
  const [acting, setActing] = useState(false);
  const run = task.agentRun;
  const profile = run?.profile;
  const status = run ? (run.displayStatus || run.status) : null;

  const handleRetry = async (e) => {
    e.stopPropagation();
    if (!run?.profileId) return;
    setActing(true);
    try {
      await agentTaskRunsApi.create({ cardId: task.id, profileId: run.profileId });
      onRefresh?.();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };

  const handleCancel = async (e) => {
    e.stopPropagation();
    if (!run?.id) return;
    setActing(true);
    try {
      await agentTaskRunsApi.cancel(run.id);
      onRefresh?.();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };

  return (
    <div
      onClick={onClick}
      className="w-full cursor-pointer rounded-xl border border-gray-900/5 dark:border-white/10 bg-white dark:bg-gray-900 midnight:bg-gray-950 shadow-sm hover:shadow-md hover:border-gray-900/10 dark:hover:border-white/20 transition-all duration-150 p-4 space-y-3"
    >
      {/* Profile + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {profile ? (
            <span className={`text-sm w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${profileColorClass(profile.color)}`}>
              {profile.icon || '🤖'}
            </span>
          ) : (
            <span className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 bg-gray-100 dark:bg-gray-800">
              <Bot className="w-3.5 h-3.5 text-gray-400" />
            </span>
          )}
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
            {profile?.name || 'No agent'}
          </span>
        </div>
        <StatusBadge run={run} />
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100 line-clamp-2 leading-snug">
        {task.title || 'Untitled task'}
      </p>

      {/* Live event label */}
      {(status === 'running' || status === 'queued') && run?.lastEventLabel && (
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
          {run.lastEventLabel}
        </p>
      )}

      {/* Summary when done */}
      {status === 'completed' && run?.summary && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
          {run.summary}
        </p>
      )}

      {/* Error when failed */}
      {status === 'failed' && run?.error && (
        <p className="text-xs text-red-500 dark:text-red-400 line-clamp-2">
          {run.error}
        </p>
      )}

      {/* Needs-input message */}
      {status === 'needs_input' && (run?.error || run?.summary) && (
        <p className="text-xs text-amber-600 dark:text-amber-400 line-clamp-2">
          {run.error || run.summary}
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center gap-1.5 pt-0.5" onClick={e => e.stopPropagation()}>
        {run?.sessionId && (
          <a
            href={`/agents/${run.sessionId}`}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={status === 'needs_input' ? 'Reply to agent' : 'View session'}
          >
            <ExternalLink className="w-3 h-3" />
            {status === 'needs_input' ? 'Reply' : 'Session'}
          </a>
        )}
        {status === 'failed' && run?.profileId && (
          <button
            onClick={handleRetry}
            disabled={acting}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
          >
            {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Retry
          </button>
        )}
        {(status === 'running' || status === 'queued') && (
          <button
            onClick={handleCancel}
            disabled={acting}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Cancel
          </button>
        )}
        {/* Backlog: dispatch hint */}
        {!run && (
          <button
            onClick={onClick}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Play className="w-3 h-3" />
            Dispatch
          </button>
        )}
      </div>
    </div>
  );
};

export default AgentCard;
