import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import ConfirmModal from '../CommandCenter/components/modals/ConfirmModal';
import { aiProviderApi } from '../Settings/settingApi';
import SessionTraces from './SessionTraces';

const WINDOWS = [7, 14, 30, 90];

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatTokens(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return formatNumber(n);
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
      prefix: 'Tool reliability',
      description: 'No agent tool calls were recorded in this window.',
      tone: 'text-gray-500 dark:text-gray-400 midnight:text-slate-400',
      bg: 'bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800',
      icon: Activity,
    };
  }
  if (successRate >= 0.95) {
    return {
      label: 'Healthy',
      prefix: 'Tool reliability',
      description: 'At least 95% of agent tool calls completed without an error.',
      tone: 'text-emerald-700 dark:text-emerald-300 midnight:text-emerald-400/80',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-950/30',
      icon: CheckCircle2,
    };
  }
  if (successRate >= 0.8) {
    return {
      label: 'Watch',
      prefix: 'Tool reliability',
      description: '80-94% of agent tool calls completed. Some tools need attention.',
      tone: 'text-amber-700 dark:text-amber-300 midnight:text-amber-400/80',
      bg: 'bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-950/30',
      icon: ShieldAlert,
    };
  }
  return {
    label: 'Degraded',
    prefix: 'Tool reliability',
    description: 'Fewer than 80% of agent tool calls completed without an error in this window.',
    tone: 'text-red-700 dark:text-red-300 midnight:text-red-400/80',
    bg: 'bg-red-50 dark:bg-red-900/20 midnight:bg-red-950/30',
    icon: XCircle,
  };
}

function SummaryTile({ icon: Icon, label, value, sublabel, title }) {
  return (
    <div
      className="rounded-lg border border-gray-200/80 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950"
      title={title}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          {label}
        </span>
        <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500 midnight:text-slate-500" />
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

function DefinitionRow({ label, children }) {
  return (
    <div className="grid gap-1 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800/70 midnight:border-slate-800 sm:grid-cols-[130px_minmax(0,1fr)]">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 midnight:text-slate-500">
        {label}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300 midnight:text-slate-300">
        {children}
      </div>
    </div>
  );
}

function BreakdownPill({ label, value, tone = 'gray' }) {
  const toneClass = {
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 midnight:border-red-900/50 midnight:bg-red-950/30 midnight:text-red-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 midnight:border-amber-900/50 midnight:bg-amber-950/30 midnight:text-amber-300',
    blue: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300 midnight:border-sky-900/50 midnight:bg-sky-950/30 midnight:text-sky-300',
    gray: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 midnight:border-slate-800 midnight:bg-slate-950 midnight:text-slate-300',
  }[tone];
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <div className="text-lg font-semibold leading-tight">{formatNumber(value)}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide">{label}</div>
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

function EvalResultDetails({ result }) {
  if (!result?.results?.length) return null;
  return (
    <div className="max-h-52 overflow-y-auto rounded-md border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
      {result.results.map(item => (
        <div key={item.id} className="flex gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-800/70 midnight:border-slate-800">
          {item.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-600 dark:text-emerald-300" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-red-600 dark:text-red-300" />
          )}
          <div className="min-w-0">
            <div className="truncate font-mono text-[11px] text-gray-800 dark:text-gray-200">{item.id}</div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EvalProgress({ progress, evalRunning }) {
  if (!evalRunning && !progress) return null;
  const label = progress?.label || (evalRunning === 'live' ? 'Running live sandbox eval' : 'Running deterministic eval');
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
      <div className="flex items-center gap-2 font-medium">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {label}
      </div>
      {progress?.elapsedMs !== undefined ? (
        <div className="mt-0.5 opacity-80">{formatDuration(progress.elapsedMs)}</div>
      ) : null}
    </div>
  );
}

function EvalHistoryList({ evals = [], loading = false }) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Eval History</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">Recent deterministic and live checks.</p>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
        {loading ? (
          <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">Loading eval history...</div>
        ) : evals.length ? evals.map(item => (
          <div key={item.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {item.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                  ) : item.status === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-300" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-300" />
                  )}
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-200">{item.mode}</span>
                </div>
                <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                  {item.model || item.phase || item.status}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200 midnight:text-slate-200">
                  {item.passed}/{item.total || 0}
                </div>
                <div className="mt-1 whitespace-nowrap text-[11px] text-gray-400 midnight:text-slate-500">{formatTime(item.createdAt)}</div>
              </div>
            </div>
          </div>
        )) : (
          <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">No eval runs recorded yet.</div>
        )}
      </div>
    </section>
  );
}

function ModelContextPanel({ activeProvider, usage, loading, error }) {
  const topModel = usage?.models?.[0] || null;
  const totals = usage?.totals || {};
  const activeModel = activeProvider?.model || topModel?.model || 'Not configured';
  const activeProviderLabel = activeProvider?.provider_id || activeProvider?.provider_type || topModel?.provider_name || topModel?.provider_id || 'No provider';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Model Context</div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
            Agent health is measured from tool calls. Model usage is shown here so failures can be compared with the active provider and recent token activity.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>
          ) : null}
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[560px] lg:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-900">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400 midnight:text-slate-500">Active model</div>
            <div className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-200" title={activeModel}>{loading ? 'Loading...' : activeModel}</div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-900">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400 midnight:text-slate-500">Provider</div>
            <div className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-200" title={activeProviderLabel}>{loading ? 'Loading...' : activeProviderLabel}</div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-900">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400 midnight:text-slate-500">Model requests</div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 midnight:text-slate-200">{loading ? '...' : formatNumber(totals.request_count)}</div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-900">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400 midnight:text-slate-500">Tokens</div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 midnight:text-slate-200">{loading ? '...' : formatTokens(totals.total_tokens)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AgentHealthPage() {
  const [days, setDays] = useState(30);
  const [summaryData, setSummaryData] = useState(null);
  const [toolData, setToolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [evalRunning, setEvalRunning] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [evalError, setEvalError] = useState('');
  const [showLiveEvalConfirm, setShowLiveEvalConfirm] = useState(false);
  const [activeProvider, setActiveProvider] = useState(null);
  const [modelUsage, setModelUsage] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState('');
  const [evalHistory, setEvalHistory] = useState([]);
  const [evalHistoryLoading, setEvalHistoryLoading] = useState(true);
  const [evalProgress, setEvalProgress] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingDiagnostics, setClearingDiagnostics] = useState(false);
  const [clearMessage, setClearMessage] = useState('');

  const modelUsageRange = days <= 7 ? '7d' : days >= 90 ? '90d' : '30d';

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

  const refreshModelContext = useCallback(async () => {
    setModelLoading(true);
    setModelError('');
    try {
      const [config, usage] = await Promise.all([
        aiProviderApi.getConfig(),
        aiProviderApi.getUsage({ range: modelUsageRange, limit: 6 }),
      ]);
      setActiveProvider(config);
      setModelUsage(usage);
    } catch (err) {
      setModelError(err.message || 'Failed to load model context.');
    } finally {
      setModelLoading(false);
    }
  }, [modelUsageRange]);

  useEffect(() => {
    refreshModelContext();
  }, [refreshModelContext]);

  const refreshEvalHistory = useCallback(async () => {
    setEvalHistoryLoading(true);
    try {
      const history = await agentApi.getEvalHistory({ limit: 12 });
      setEvalHistory(history.evals || []);
    } catch {
      setEvalHistory([]);
    } finally {
      setEvalHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshEvalHistory();
  }, [refreshEvalHistory]);

  useEffect(() => {
    if (!evalRunning) {
      setEvalProgress(null);
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await agentApi.getActiveEval();
        if (!cancelled) setEvalProgress(res.active || null);
      } catch {
        if (!cancelled) setEvalProgress(null);
      }
    };
    poll();
    const timer = window.setInterval(poll, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [evalRunning]);

  const summary = summaryData?.summary || {};
  const tools = toolData?.tools || [];
  const recentFailures = summaryData?.recentFailures || [];
  const totalCalls = Number(summary.totalCalls || 0);
  const failedCalls = Number(summary.failedCalls || 0);
  const invalidArguments = Number(summary.invalidArguments || 0);
  const readBeforeWriteBlocks = Number(summary.readBeforeWriteBlocks || 0);
  const permissionDenied = Number(summary.permissionDenied || 0);
  const guardBlocks = Number(summary.guardBlocks ?? (readBeforeWriteBlocks + permissionDenied));
  const unknownTools = Number(summary.unknownTools || 0);
  const executionErrors = Number(summary.executionErrors || Math.max(0, failedCalls - invalidArguments - guardBlocks - unknownTools));
  const successRate = summary.successRate;
  const meta = healthMeta(successRate, totalCalls);
  const HealthIcon = meta.icon;
  const windowLabel = `Last ${days} days`;

  const attentionTools = useMemo(() => (
    [...tools]
      .filter(tool => tool.failedCalls || tool.invalidArguments || tool.guardBlocks || tool.readBeforeWriteBlocks || tool.permissionDenied || tool.unknownTools || tool.executionErrors)
      .sort((a, b) => (
        ((b.failedCalls || 0) + (b.invalidArguments || 0) + (b.guardBlocks || 0) + (b.unknownTools || 0))
        - ((a.failedCalls || 0) + (a.invalidArguments || 0) + (a.guardBlocks || 0) + (a.unknownTools || 0))
      ))
      .slice(0, 6)
  ), [tools]);

  const runEval = useCallback(async (mode, skipConfirm = false) => {
    if (mode === 'live' && !skipConfirm) {
      setShowLiveEvalConfirm(true);
      return;
    }
    setEvalRunning(mode);
    setEvalError('');
    setEvalResult(null);
    try {
      const result = await agentApi.runEval({
        mode,
        confirmLive: mode === 'live',
      });
      setEvalResult(result);
      await refresh({ quiet: true });
      await refreshModelContext();
      await refreshEvalHistory();
    } catch (err) {
      setEvalError(err.message || 'Agent eval failed.');
    } finally {
      setEvalRunning(null);
    }
  }, [refresh, refreshModelContext, refreshEvalHistory]);

  const clearDiagnostics = useCallback(async () => {
    setClearingDiagnostics(true);
    setClearMessage('');
    try {
      const result = await agentApi.clearDiagnostics({ days, all: false });
      setShowClearConfirm(false);
      setClearMessage(`Cleared ${formatNumber(result.deleted)} diagnostic row${result.deleted === 1 ? '' : 's'} from the last ${days} days.`);
      await refresh({ quiet: true });
    } catch (err) {
      setClearMessage(err.message || 'Failed to clear diagnostics.');
    } finally {
      setClearingDiagnostics(false);
    }
  }, [days, refresh]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 midnight:bg-gray-950 midnight:text-slate-100">
      <header className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 midnight:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400" />
            <h1 className="text-lg font-semibold tracking-tight">Agent Health</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${meta.bg} ${meta.tone}`}>
              <HealthIcon className="h-3.5 w-3.5" />
              {meta.prefix}: {meta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-500">
            Diagnostics for agent tool calls, safety blocks, latency, and eval checks.
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
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:text-slate-250'
                }`}
              >
                {windowDays}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-gray-800 dark:text-gray-200 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-300 midnight:border-slate-800 midnight:text-slate-200 midnight:hover:bg-red-950/30 midnight:hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Clear diagnostics
          </button>
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
        {clearMessage ? (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 midnight:border-slate-800 midnight:bg-slate-950 midnight:text-slate-300">
            <Info className="h-4 w-4" />
            {clearMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[45vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">
                    <Info className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    What this status means
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300 midnight:text-slate-300">
                    {meta.description} It is measured from {formatNumber(totalCalls)} recorded tool calls across {formatNumber(summary.sessions)} agent sessions in the {windowLabel.toLowerCase()}.
                  </p>
                  <p className="mt-1 max-w-3xl text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-500">
                    This is agent tool reliability, not backend uptime. Safety blocks can be a useful guardrail, while invalid arguments and unknown tools usually point to model/tool contract problems.
                  </p>
                </div>
                <div className="grid min-w-full grid-cols-2 gap-2 sm:min-w-[420px] sm:grid-cols-4 xl:min-w-[480px]">
                  <BreakdownPill label="Invalid args" value={invalidArguments} tone={invalidArguments ? 'red' : 'gray'} />
                  <BreakdownPill label="Safety blocks" value={guardBlocks} tone={guardBlocks ? 'amber' : 'gray'} />
                  <BreakdownPill label="Unknown tools" value={unknownTools} tone={unknownTools ? 'red' : 'gray'} />
                  <BreakdownPill label="Runtime errors" value={executionErrors} tone={executionErrors ? 'red' : 'gray'} />
                </div>
              </div>
            </section>

            <ModelContextPanel
              activeProvider={activeProvider}
              usage={modelUsage}
              loading={modelLoading}
              error={modelError}
            />

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryTile icon={BarChart3} label="Tool Success" value={formatPercent(successRate)} sublabel={`${formatNumber(totalCalls)} tool calls`} title="Share of agent tool calls that completed without an error." />
              <SummaryTile icon={CheckCircle2} label="Successful Calls" value={formatNumber(summary.successfulCalls)} sublabel={windowLabel} title="Recorded tool calls that completed successfully." />
              <SummaryTile icon={XCircle} label="Failed Calls" value={formatNumber(failedCalls)} sublabel={`${recentFailures.length} recent failure events`} title="Tool calls that returned an error, were blocked, or could not be executed." />
              <SummaryTile icon={Wrench} label="Tools Used" value={formatNumber(summary.toolsUsed)} sublabel={`${formatNumber(summary.sessions)} sessions`} title="Distinct agent tools used during this window." />
              <SummaryTile icon={ShieldAlert} label="Safety Blocks" value={formatNumber(guardBlocks)} sublabel="Read-first and permission checks" title="Protective blocks from permission checks or attempts to edit existing files before reading them." />
            </section>

            <SessionTraces days={days} />

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Tool Metrics</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">Sorted by failed calls, then volume.</p>
                  </div>
                  <span className="text-xs text-gray-400 midnight:text-slate-500">{tools.length} tools</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800/70 midnight:divide-slate-800">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400 dark:bg-gray-950 midnight:bg-slate-950 midnight:text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Tool</th>
                        <th className="px-4 py-3 text-right font-medium">Calls</th>
                        <th className="px-4 py-3 text-right font-medium">Success</th>
                        <th className="px-4 py-3 text-right font-medium">Failed</th>
                        <th className="px-4 py-3 text-right font-medium">Invalid</th>
                        <th className="px-4 py-3 text-right font-medium">Safety</th>
                        <th className="px-4 py-3 text-right font-medium">Avg</th>
                        <th className="px-4 py-3 text-right font-medium">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
                      {tools.map(tool => (
                        <tr key={tool.toolName} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.03] midnight:hover:bg-white/[0.03]">
                          <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-gray-800 dark:text-gray-200 midnight:text-slate-200">{tool.toolName}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 midnight:text-slate-300">{formatNumber(tool.totalCalls)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 midnight:text-slate-300">{formatPercent(tool.successRate)}</td>
                          <td className={`px-4 py-3 text-right ${tool.failedCalls ? 'font-medium text-red-600 dark:text-red-300 midnight:text-red-400/80' : 'text-gray-500 dark:text-gray-400 midnight:text-slate-400'}`}>{formatNumber(tool.failedCalls)}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 midnight:text-slate-400">{formatNumber(tool.invalidArguments)}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 midnight:text-slate-400">{formatNumber(tool.guardBlocks ?? (tool.readBeforeWriteBlocks + tool.permissionDenied))}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 midnight:text-slate-400">{formatDuration(tool.avgDurationMs)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-gray-500 dark:text-gray-400 midnight:text-slate-400">{formatTime(tool.lastSeenAt)}</td>
                        </tr>
                      ))}
                      {!tools.length ? (
                        <tr>
                          <td className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400" colSpan={8}>
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
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Needs Attention</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">Highest failure and block counts in this window.</p>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
                    {attentionTools.map(tool => (
                       <div key={tool.toolName} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-xs text-gray-800 dark:text-gray-200 midnight:text-slate-200">{tool.toolName}</span>
                          <span className="text-xs font-medium text-red-600 dark:text-red-300 midnight:text-red-400/80">{tool.failedCalls} failed</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                          <span>{tool.invalidArguments} invalid args</span>
                          <span>{tool.readBeforeWriteBlocks} read-first</span>
                          <span>{tool.permissionDenied} denied</span>
                          <span>{tool.unknownTools || 0} unknown</span>
                        </div>
                      </div>
                    ))}
                    {!attentionTools.length ? (
                      <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                        No failing or blocked tools in this window.
                      </div>
                    ) : null}
                  </div>
                </section>

                <EvalHistoryList evals={evalHistory} loading={evalHistoryLoading} />

                <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Metric Guide</h2>
                  </div>
                  <DefinitionRow label="Degraded">
                    Tool success is below 80% for the selected time window.
                  </DefinitionRow>
                  <DefinitionRow label="Invalid args">
                    The model called a known tool with missing or incorrectly typed parameters.
                  </DefinitionRow>
                  <DefinitionRow label="Safety">
                    A permission check or read-before-write guard blocked a risky action.
                  </DefinitionRow>
                  <DefinitionRow label="Runtime">
                    The tool executed but returned an error, such as a missing file or failed command.
                  </DefinitionRow>
                </section>

                <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Eval Harness</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                      Deterministic checks verify tool contracts. Live sandbox uses your active model in a disposable project and can take a few minutes.
                    </p>
                  </div>
                  <div className="space-y-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => runEval('deterministic')}
                      disabled={Boolean(evalRunning)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:text-slate-200 midnight:hover:bg-slate-800"
                    >
                      {evalRunning === 'deterministic' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Run deterministic eval
                    </button>
                    <button
                      type="button"
                      onClick={() => runEval('live')}
                      disabled={Boolean(evalRunning)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-60 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/20 midnight:border-amber-900/50 midnight:text-amber-400/80 midnight:hover:bg-amber-950/20"
                    >
                      {evalRunning === 'live' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Run live sandbox eval
                    </button>
                    {evalError ? (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                        {evalError}
                      </div>
                    ) : null}
                    <EvalProgress progress={evalProgress} evalRunning={evalRunning} />
                    {evalResult ? (
                      <div className={`rounded-md border px-3 py-2 text-xs ${
                        evalResult.success
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                      }`}>
                        <div className="font-medium">
                          {evalResult.mode} eval: {evalResult.passed}/{evalResult.total} passed
                        </div>
                        {evalResult.durationMs !== undefined ? (
                          <div className="mt-0.5 opacity-80">{formatDuration(evalResult.durationMs)}</div>
                        ) : null}
                        {evalResult.model ? (
                          <div className="mt-0.5 opacity-80">
                            Model: {evalResult.model}{evalResult.isLocal ? ' (local)' : ''}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <EvalResultDetails result={evalResult} />
                  </div>
                  <details className="border-t border-gray-100 dark:border-gray-800/70 midnight:border-slate-800">
                    <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-450 midnight:hover:text-slate-200">
                      Developer CLI commands
                    </summary>
                    <CommandRow label="Deterministic" command="npm run eval:agent -w den" />
                    <CommandRow label="Live sandbox" command="npm run eval:agent -w den -- --live" />
                  </details>
                </section>

                <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
                    <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Recent Failures</h2>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
                    {recentFailures.map((failure, index) => (
                      <div key={`${failure.sessionId}-${failure.toolName}-${index}`} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-mono text-xs text-gray-800 dark:text-gray-200 midnight:text-slate-200">{failure.toolName}</span>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-400 midnight:text-slate-500">
                              <Clock3 className="h-3 w-3" />
                              {formatTime(failure.startedAt)}
                            </span>
                            {failure.sessionId ? (
                              <a
                                href={`/agents/${failure.sessionId}`}
                                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
                                title="Open related agent session"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                        {failure.code ? (
                          <div className="mt-1 font-mono text-[11px] text-gray-400 midnight:text-slate-400">{failure.code}</div>
                        ) : null}
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{failure.error}</p>
                      </div>
                    ))}
                    {!recentFailures.length ? (
                      <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
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

      <ConfirmModal
        isOpen={showLiveEvalConfirm}
        onClose={() => setShowLiveEvalConfirm(false)}
        onConfirm={() => {
          setShowLiveEvalConfirm(false);
          runEval('live', true);
        }}
        title="Run Live Eval"
        message="Live eval runs a real agent session with your active model provider inside a disposable sandbox. Continue?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
      />
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => {
          if (!clearingDiagnostics) setShowClearConfirm(false);
        }}
        onConfirm={clearDiagnostics}
        title="Clear Diagnostics"
        message={`Clear agent tool-call diagnostics from the last ${days} days?\n\nThis does not delete conversations, agent sessions, model usage, files, or eval history.`}
        confirmLabel="Clear diagnostics"
        cancelLabel="Cancel"
        isDestructive
        isProcessing={clearingDiagnostics}
      />
    </div>
  );
}
