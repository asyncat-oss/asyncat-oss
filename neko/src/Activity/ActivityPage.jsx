/* eslint-disable react/prop-types */
// neko/src/Activity/ActivityPage.jsx
// One place where async agent activity lands: recent workflow runs, agent
// sessions, and outbound notifications. Read-only feed built on existing
// endpoints (/agent/workflows/runs/recent, /agent/metrics/sessions,
// /integrations/notifications/log).

import { useCallback, useEffect, useState } from 'react';
import {
  Bell, Workflow, RefreshCw, Loader2,
  CheckCircle2, XCircle, Clock3, AlertTriangle, Info,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/api';

function when(v) {
  if (!v) return '—';
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v)); }
  catch { return v; }
}

const STATUS_ICON = {
  running:   { icon: Loader2, cls: 'text-sky-500', spin: true },
  completed: { icon: CheckCircle2, cls: 'text-emerald-500' },
  failed:    { icon: XCircle, cls: 'text-red-500' },
  active:    { icon: Loader2, cls: 'text-sky-500', spin: true },
  paused:    { icon: Clock3, cls: 'text-gray-400' },
};

function StatusIcon({ status }) {
  const m = STATUS_ICON[status] || STATUS_ICON.paused;
  const Icon = m.icon;
  return <Icon className={`h-4 w-4 flex-none ${m.cls} ${m.spin ? 'animate-spin' : ''}`} />;
}

const TABS = [
  { key: 'workflows', label: 'Workflow runs', icon: Workflow },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

function Empty({ children }) {
  return <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">{children}</div>;
}

export default function ActivityPage() {
  const [tab, setTab] = useState('workflows');
  const [data, setData] = useState({ workflows: [], notifications: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (which = tab, quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      if (which === 'workflows') {
        const res = await agentApi.getRecentWorkflowRuns(30);
        setData(d => ({ ...d, workflows: res.runs || [] }));
      } else {
        const res = await agentApi.getNotificationLog(40);
        setData(d => ({ ...d, notifications: res.entries || [] }));
      }
    } catch (err) {
      setError(err.message || 'Failed to load activity.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(tab); }, [tab, load]);

  const rows = data[tab] || [];

  return (
    <div className="flex h-full w-full flex-col bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100 font-sans">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200/80 px-5 py-4 dark:border-gray-800/80 midnight:border-slate-800/80">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h1 className="text-lg font-semibold tracking-tight">Activity</h1>
        </div>
        <button type="button" onClick={() => load(tab, true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-800">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200/80 px-4 dark:border-gray-800/80 midnight:border-slate-800/80">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'border-indigo-500 text-gray-900 dark:text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-4">
            {/* Workflow runs */}
            {tab === 'workflows' && (rows.length ? (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800/70 dark:border-gray-800 midnight:divide-slate-800 midnight:border-slate-800">
                {rows.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <StatusIcon status={r.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{r.workflowName || 'Workflow'}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                        <span className="capitalize">{r.status}</span>
                        <span>· {r.stepsCompleted}/{r.stepsTotal} steps</span>
                        <span>· {r.trigger}</span>
                        {r.error && <span className="truncate text-red-500" title={r.error}>· {r.error}</span>}
                      </div>
                    </div>
                    <span className="flex-none text-[11px] text-gray-400">{when(r.startedAt)}</span>
                  </div>
                ))}
              </div>
            ) : <Empty>No workflow runs yet. Create and run a workflow to see activity here.</Empty>)}

            {/* Notifications */}
            {tab === 'notifications' && (rows.length ? (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800/70 dark:border-gray-800 midnight:divide-slate-800 midnight:border-slate-800">
                {rows.map(n => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                    {n.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 flex-none text-red-500" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{n.title}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">{n.channel}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-gray-500 dark:text-gray-400">{n.message}</p>
                      {n.error && <p className="mt-0.5 text-[11px] text-red-500">{n.error}</p>}
                    </div>
                    <span className="flex-none text-[11px] text-gray-400">{when(n.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>
                <Info className="mx-auto mb-2 h-5 w-5 opacity-50" />
                No notifications yet. Agent + workflow outbound notifications will appear here.
              </Empty>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
