/* eslint-disable react/prop-types */
// Unified history for work that runs asynchronously: task agents, scheduled
// agent jobs, workflows, and outbound notifications.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, Bot, CalendarClock, CheckCircle2, Clock3,
  Info, Loader2, MessageCircleQuestion, RefreshCw, SquareCheck,
  Workflow, XCircle,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/api';

function when(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function compact(value, max = 180) {
  const text = String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

const STATUS_ICON = {
  queued:      { icon: Clock3, cls: 'text-gray-400' },
  running:     { icon: Loader2, cls: 'text-sky-500', spin: true },
  completed:   { icon: CheckCircle2, cls: 'text-emerald-500' },
  failed:      { icon: XCircle, cls: 'text-red-500' },
  cancelled:   { icon: XCircle, cls: 'text-gray-400' },
  needs_input: { icon: MessageCircleQuestion, cls: 'text-amber-500' },
};

const TYPE_META = {
  task: { label: 'Task', icon: SquareCheck, cls: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  schedule: { label: 'Agent job', icon: CalendarClock, cls: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300' },
  workflow: { label: 'Workflow', icon: Workflow, cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300' },
};

const TABS = [
  { key: 'runs', label: 'Runs', icon: Bot },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

function StatusIcon({ status }) {
  const meta = STATUS_ICON[status] || STATUS_ICON.queued;
  const Icon = meta.icon;
  return <Icon className={`h-4 w-4 flex-none ${meta.cls} ${meta.spin ? 'animate-spin' : ''}`} />;
}

function Empty({ children }) {
  return <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">{children}</div>;
}

function RunRow({ item, onOpen }) {
  const type = TYPE_META[item.type] || TYPE_META.task;
  const TypeIcon = type.icon;
  const canOpen = Boolean(item.sessionId || item.type === 'workflow' || item.type === 'schedule');
  return (
    <button
      type="button"
      onClick={() => canOpen && onOpen(item)}
      disabled={!canOpen}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-gray-50/80 dark:enabled:hover:bg-white/[0.03]"
    >
      <StatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.name}</span>
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${type.cls}`}>
            <TypeIcon className="h-2.5 w-2.5" /> {type.label}
          </span>
          <span className="text-[10px] capitalize text-gray-400">{String(item.status || '').replace('_', ' ')}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
          {item.context ? <span>{item.context}</span> : null}
          {item.profileName ? <span>· {item.profileName}</span> : null}
        </div>
        {(item.error || item.detail) ? (
          <p className={`mt-1 line-clamp-2 text-[12px] leading-5 ${item.error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
            {compact(item.error || item.detail)}
          </p>
        ) : null}
      </div>
      <span className="flex-none text-[11px] text-gray-400">{when(item.startedAt)}</span>
    </button>
  );
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('runs');
  const [data, setData] = useState({ runs: [], notifications: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (which = tab, quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      if (which === 'runs') {
        const result = await agentApi.getRecentActivity(60);
        setData(current => ({ ...current, runs: result.items || [] }));
      } else {
        const result = await agentApi.getNotificationLog(40);
        setData(current => ({ ...current, notifications: result.entries || [] }));
      }
    } catch (err) {
      setError(err.message || 'Failed to load activity.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(tab); }, [tab, load]);

  const openRun = (item) => {
    if (item.sessionId) navigate(`/agents/${item.sessionId}`);
    else if (item.type === 'workflow') navigate(`/workflows?workflow=${encodeURIComponent(item.targetId)}`);
    else if (item.type === 'schedule') navigate('/schedules');
  };

  const rows = data[tab] || [];

  return (
    <div className="flex h-full w-full flex-col bg-white font-sans text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200/80 px-5 py-4 dark:border-gray-800/80 midnight:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h1 className="text-lg font-semibold tracking-tight">Activity</h1>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">Task agents, scheduled jobs, workflows, and notifications in one place.</p>
        </div>
        <button type="button" onClick={() => load(tab, true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-800">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200/80 px-4 dark:border-gray-800/80 midnight:border-slate-800/80">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'border-indigo-500 text-gray-900 dark:text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="mx-auto max-w-4xl px-4 py-4">
            {tab === 'runs' ? (rows.length ? (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800/70 dark:border-gray-800 midnight:divide-slate-800 midnight:border-slate-800">
                {rows.map(item => <RunRow key={`${item.type}-${item.id}`} item={item} onOpen={openRun} />)}
              </div>
            ) : <Empty>No agent or workflow runs yet. Dispatch a task, run a workflow, or create a schedule to see it here.</Empty>) : null}

            {tab === 'notifications' ? (rows.length ? (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800/70 dark:border-gray-800 midnight:divide-slate-800 midnight:border-slate-800">
                {rows.map(notification => (
                  <div key={notification.id} className="flex items-start gap-3 px-4 py-3">
                    {notification.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 flex-none text-red-500" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{notification.title}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">{notification.channel}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-gray-500 dark:text-gray-400">{notification.message}</p>
                      {notification.error ? <p className="mt-0.5 text-[11px] text-red-500">{notification.error}</p> : null}
                    </div>
                    <span className="flex-none text-[11px] text-gray-400">{when(notification.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty><Info className="mx-auto mb-2 h-5 w-5 opacity-50" />No notifications yet.</Empty>
            )) : null}
          </div>
        )}
      </div>
    </div>
  );
}
