import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/api';

const WINDOWS = [7, 14, 30, 90];

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatPercent(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${Math.round(Number(value) * 100)}%`;
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return 'n/a';
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function formatTime(value) {
  if (!value) return 'n/a';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function healthMeta(successRate, totalCalls) {
  if (!totalCalls) {
    return {
      label: 'No data',
      tone: 'text-gray-500 dark:text-gray-400',
      bg: 'bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800',
      icon: Activity,
    };
  }
  if (successRate >= 0.95) {
    return {
      label: 'Healthy',
      tone: 'text-emerald-700 dark:text-emerald-300',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/20',
      icon: CheckCircle2,
    };
  }
  if (successRate >= 0.8) {
    return {
      label: 'Watch',
      tone: 'text-amber-700 dark:text-amber-300',
      bg: 'bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/20',
      icon: ShieldAlert,
    };
  }
  return {
    label: 'Degraded',
    tone: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20',
    icon: XCircle,
  };
}

function SummaryTile({ icon: Icon, label, value, sublabel }) {
  return (
    <div className="rounded-lg border border-gray-200/80 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          {label}
        </span>
        <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white midnight:text-slate-100">
        {value}
      </div>
      {sublabel ? (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-500">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function CommandRow({ label, command }) {
  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800/70 midnight:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-200">
        <Terminal className="h-4 w-4 text-gray-400" />
        {label}
      </div>
      <code className="overflow-x-auto rounded-md bg-gray-100 px-2.5 py-1.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200 midnight:bg-slate-900 midnight:text-slate-200">
        {command}
      </code>
    </div>
  );
}

export default function AgentHealthPage() {
  const [days, setDays] = useState(30);
  const [summaryData, setSummaryData] = useState(null);
  const [toolData, setToolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [summary, tools] = await Promise.all([
        agentApi.getMetricsSummary({ days }),
        agentApi.getToolMetrics({ days, limit: 120 }),
      ]);
      setSummaryData(summary);
      setToolData(tools);
    } catch (err) {
      setError(err.message || 'Failed to load agent health metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = summaryData?.summary || {};
  const tools = toolData?.tools || [];
  const recentFailures = summaryData?.recentFailures || [];
  const totalCalls = Number(summary.totalCalls || 0);
  const failedCalls = Number(summary.failedCalls || 0);
  const successRate = summary.successRate;
  const meta = healthMeta(successRate, totalCalls);
  const HealthIcon = meta.icon;

  const attentionTools = useMemo(() => (
    [...tools]
      .filter(tool => tool.failedCalls || tool.invalidArguments || tool.readBeforeWriteBlocks || tool.permissionDenied)
      .sort((a, b) => (
        (b.failedCalls + b.invalidArguments + b.readBeforeWriteBlocks + b.permissionDenied)
        - (a.failedCalls + a.invalidArguments + a.readBeforeWriteBlocks + a.permissionDenied)
      ))
      .slice(0, 6)
  ), [tools]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 midnight:bg-gray-950 midnight:text-slate-100">
      <header className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 midnight:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h1 className="text-lg font-semibold tracking-tight">Agent Health</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${meta.bg} ${meta.tone}`}>
              <HealthIcon className="h-3.5 w-3.5" />
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-500">
            Tool reliability, safety guard activity, latency, and eval entrypoints.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
            {WINDOWS.map(windowDays => (
              <button
                key={windowDays}
                type="button"
                onClick={() => setDays(windowDays)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === windowDays
                    ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-white midnight:bg-slate-800 midnight:text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {windowDays}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => refresh({ quiet: true })}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:text-slate-200 midnight:hover:bg-slate-900"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5">
        {error ? (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[45vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryTile icon={BarChart3} label="Success Rate" value={formatPercent(successRate)} sublabel={`${formatNumber(totalCalls)} tool calls`} />
              <SummaryTile icon={CheckCircle2} label="Passed" value={formatNumber(summary.successfulCalls)} sublabel={`Last ${days} days`} />
              <SummaryTile icon={XCircle} label="Failed" value={formatNumber(failedCalls)} sublabel={`${recentFailures.length} recent failures`} />
              <SummaryTile icon={Wrench} label="Tools Used" value={formatNumber(summary.toolsUsed)} sublabel={`${formatNumber(summary.sessions)} sessions`} />
              <SummaryTile icon={ShieldAlert} label="Guard Blocks" value={formatNumber(tools.reduce((sum, tool) => sum + tool.readBeforeWriteBlocks + tool.permissionDenied, 0))} sublabel="Edit and permission checks" />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Tool Metrics</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Sorted by failures, then volume.</p>
                  </div>
                  <span className="text-xs text-gray-400">{tools.length} tools</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800/70 midnight:divide-slate-800">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400 dark:bg-gray-950 midnight:bg-slate-950">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Tool</th>
                        <th className="px-4 py-3 text-right font-medium">Calls</th>
                        <th className="px-4 py-3 text-right font-medium">Success</th>
                        <th className="px-4 py-3 text-right font-medium">Failed</th>
                        <th className="px-4 py-3 text-right font-medium">Invalid</th>
                        <th className="px-4 py-3 text-right font-medium">Guards</th>
                        <th className="px-4 py-3 text-right font-medium">Avg</th>
                        <th className="px-4 py-3 text-right font-medium">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
                      {tools.map(tool => (
                        <tr key={tool.toolName} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.03]">
                          <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-gray-800 dark:text-gray-200">{tool.toolName}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{formatNumber(tool.totalCalls)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{formatPercent(tool.successRate)}</td>
                          <td className={`px-4 py-3 text-right ${tool.failedCalls ? 'font-medium text-red-600 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}>{formatNumber(tool.failedCalls)}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatNumber(tool.invalidArguments)}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatNumber(tool.readBeforeWriteBlocks + tool.permissionDenied)}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatDuration(tool.avgDurationMs)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatTime(tool.lastSeenAt)}</td>
                        </tr>
                      ))}
                      {!tools.length ? (
                        <tr>
                          <td className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={8}>
                            No tool audit data for this window.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-5">
                <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Needs Attention</h2>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
                    {attentionTools.map(tool => (
                      <div key={tool.toolName} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-xs text-gray-800 dark:text-gray-200">{tool.toolName}</span>
                          <span className="text-xs font-medium text-red-600 dark:text-red-300">{tool.failedCalls} failed</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                          <span>{tool.invalidArguments} invalid args</span>
                          <span>{tool.readBeforeWriteBlocks} edit guards</span>
                          <span>{tool.permissionDenied} denied</span>
                        </div>
                      </div>
                    ))}
                    {!attentionTools.length ? (
                      <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                        No failing or blocked tools in this window.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Eval Commands</h2>
                  </div>
                  <CommandRow label="Deterministic" command="npm run eval:agent -w den" />
                  <CommandRow label="Live sandbox" command="npm run eval:agent -w den -- --live" />
                </section>

                <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Recent Failures</h2>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
                    {recentFailures.map((failure, index) => (
                      <div key={`${failure.sessionId}-${failure.toolName}-${index}`} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-xs text-gray-800 dark:text-gray-200">{failure.toolName}</span>
                          <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-400">
                            <Clock3 className="h-3 w-3" />
                            {formatTime(failure.startedAt)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{failure.error}</p>
                      </div>
                    ))}
                    {!recentFailures.length ? (
                      <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                        No recent failures in this window.
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
