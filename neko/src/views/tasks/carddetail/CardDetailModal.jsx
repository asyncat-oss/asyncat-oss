import { useState, useEffect, useCallback } from 'react';
import {
  X, Bot, ExternalLink, RotateCcw, Play, Loader2,
  CheckCircle2, AlertCircle, Clock, MessageCircle,
  ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { agentTaskRunsApi, profilesApi } from '../../../CommandCenter/api';
import { cardAPI } from '../../viewsApi';

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

function StatusIcon({ status }) {
  if (status === 'queued') return <Clock className="w-4 h-4 text-gray-400" />;
  if (status === 'running') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  if (status === 'needs_input') return <MessageCircle className="w-4 h-4 text-amber-500" />;
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-500" />;
  return <Bot className="w-4 h-4 text-gray-400" />;
}

function statusLabel(status) {
  const labels = {
    queued: 'Queued',
    running: 'Running',
    needs_input: 'Needs Input',
    completed: 'Done',
    failed: 'Failed',
  };
  return labels[status] || status || 'Unknown';
}

const AgentTaskDetail = ({ task, onClose, onRefresh }) => {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(
    task.agentRun?.profileId || ''
  );
  const [runs, setRuns] = useState(
    task.agentRun
      ? [task.agentRun, ...(task.agentRun.agentRuns || []).slice(1)]
      : []
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dispatchError, setDispatchError] = useState(null);

  const latestRun = runs[0] || null;
  const latestStatus = latestRun ? (latestRun.displayStatus || latestRun.status) : null;
  const isLive = latestStatus === 'running' || latestStatus === 'queued';

  useEffect(() => {
    profilesApi.listProfiles()
      .then(r => {
        const list = r.profiles || [];
        setProfiles(list);
        if (!selectedProfileId && list.length > 0) {
          setSelectedProfileId(list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const result = await agentTaskRunsApi.list({ cardId: task.id });
      const found = (result.tasks || []).find(t => String(t.id) === String(task.id));
      if (found) {
        const allRuns = found.agentRuns || (found.agentRun ? [found.agentRun] : []);
        setRuns(allRuns);
      }
    } catch {}
  }, [task.id]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(loadRuns, 3000);
    return () => clearInterval(timer);
  }, [isLive, loadRuns]);

  const handleDispatch = async () => {
    if (!selectedProfileId) return;
    setActing(true);
    setDispatchError(null);
    try {
      await agentTaskRunsApi.create({ cardId: task.id, profileId: selectedProfileId });
      await loadRuns();
      onRefresh?.();
    } catch (err) {
      setDispatchError(err.message || 'Failed to dispatch');
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    if (!latestRun?.id) return;
    setActing(true);
    try {
      await agentTaskRunsApi.cancel(latestRun.id);
      await loadRuns();
      onRefresh?.();
    } catch {}
    finally { setActing(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await cardAPI.delete(task.id);
      onRefresh?.();
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/50 midnight:bg-black/70 backdrop-blur-[2px]"
        onClick={e => e.target === e.currentTarget && onClose()}
      />
      <div className="relative z-10 w-full max-w-xl mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/10 flex flex-col overflow-hidden max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-start gap-3 min-w-0">
            {latestRun?.profile ? (
              <span className={`w-9 h-9 flex items-center justify-center rounded-xl text-base flex-shrink-0 ${profileColorClass(latestRun.profile.color)}`}>
                {latestRun.profile.icon || '🤖'}
              </span>
            ) : (
              <span className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 bg-gray-100 dark:bg-gray-800">
                <Bot className="w-4 h-4 text-gray-400" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">
                {task.title || 'Untitled task'}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                {latestRun && <StatusIcon status={latestStatus} />}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {latestRun
                    ? `${latestRun.profile?.name || 'Agent'} · ${statusLabel(latestStatus)}`
                    : 'No agent assigned yet'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-2.5 py-1 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? '…' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  No
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Goal / description */}
          {task.description && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Goal</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">{task.description}</p>
            </div>
          )}

          {/* Current run details */}
          {latestRun && (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3">
              {isLive && latestRun.lastEventLabel && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{latestRun.lastEventLabel}</p>
              )}

              {latestStatus === 'completed' && latestRun.summary && (
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">{latestRun.summary}</p>
              )}

              {latestStatus === 'needs_input' && (latestRun.error || latestRun.summary) && (
                <p className="text-sm text-amber-700 dark:text-amber-300">{latestRun.error || latestRun.summary}</p>
              )}

              {latestStatus === 'failed' && latestRun.error && (
                <p className="text-sm text-red-600 dark:text-red-400">{latestRun.error}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                {latestRun.sessionId && (
                  <a
                    href={`/agents/${latestRun.sessionId}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {latestStatus === 'needs_input' ? 'Reply to agent' : 'View session'}
                  </a>
                )}
                {isLive && (
                  <button
                    onClick={handleCancel}
                    disabled={acting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-white/10 transition-colors disabled:opacity-50"
                  >
                    {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Dispatch controls */}
          {!isLive && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">
                {latestRun ? 'Run again' : 'Dispatch agent'}
              </p>
              <div className="flex gap-2">
                <select
                  value={selectedProfileId}
                  onChange={e => setSelectedProfileId(e.target.value)}
                  disabled={acting || profiles.length === 0}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white/30 disabled:opacity-50"
                >
                  {profiles.length === 0
                    ? <option value="">No agents available</option>
                    : profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>
                      ))
                  }
                </select>
                <button
                  onClick={handleDispatch}
                  disabled={!selectedProfileId || acting || profiles.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {acting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : latestStatus === 'failed'
                      ? <RotateCcw className="w-4 h-4" />
                      : <Play className="w-4 h-4" />
                  }
                  {latestStatus === 'failed' ? 'Retry' : 'Dispatch'}
                </button>
              </div>
              {dispatchError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400">{dispatchError}</p>
              )}
            </div>
          )}

          {/* Run history */}
          {runs.length > 1 && (
            <div>
              <button
                onClick={() => setHistoryOpen(p => !p)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                {historyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {runs.length - 1} previous run{runs.length > 2 ? 's' : ''}
              </button>
              {historyOpen && (
                <div className="mt-2 space-y-1.5">
                  {runs.slice(1).map(run => {
                    const s = run.displayStatus || run.status;
                    return (
                      <div key={run.id} className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-white/10 px-3 py-2 bg-gray-50 dark:bg-gray-800/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusIcon status={s} />
                          <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                            {run.profile?.name || 'Agent'} · {statusLabel(s)}
                          </span>
                        </div>
                        {run.sessionId && (
                          <a
                            href={`/agents/${run.sessionId}`}
                            className="ml-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentTaskDetail;
