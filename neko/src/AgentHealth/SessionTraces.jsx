/* eslint-disable react/prop-types */
// neko/src/AgentHealth/SessionTraces.jsx
// Per-session observability: lists recent agent sessions with tool-call + token
// aggregates, and drills into one session's ordered tool-call timeline and
// per-model token/latency usage. Backed by /api/agent/metrics/sessions[/:id].

import { useCallback, useEffect, useState } from 'react';
import {
  Activity, ChevronRight, ChevronDown, CheckCircle2, XCircle,
  Clock3, ExternalLink, Loader2, Cpu, Wrench, ShieldAlert,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/api';

const num = (v) => Number(v || 0).toLocaleString();
const tokens = (v) => {
  const n = Number(v || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return num(n);
};
const dur = (ms) => {
  if (ms == null) return '—';
  const v = Number(ms);
  if (v < 1000) return `${Math.round(v)}ms`;
  return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}s`;
};
const when = (v) => {
  if (!v) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v));
  } catch { return v; }
};

const STATUS_META = {
  active:    { label: 'Active',    cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300' },
  paused:    { label: 'Paused',    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
};

function MetaChip({ icon: Icon, children, tone = 'gray' }) {
  const cls = tone === 'red'
    ? 'text-red-600 dark:text-red-300'
    : 'text-gray-500 dark:text-gray-400 midnight:text-slate-400';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${cls}`}>
      {Icon ? <Icon className="h-3 w-3" /> : null}{children}
    </span>
  );
}

function SessionDetail({ detail, loading, error }) {
  if (loading) {
    return <div className="flex items-center gap-2 px-4 py-6 text-xs text-gray-500 dark:text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading trace…</div>;
  }
  if (error) {
    return <div className="px-4 py-6 text-xs text-red-600 dark:text-red-300">{error}</div>;
  }
  if (!detail) return null;
  const { timeline = [], usage = [], totals = {} } = detail;

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-gray-800/70 dark:bg-gray-950/40 midnight:border-slate-800 midnight:bg-slate-950/40">
      {/* Token / latency usage */}
      {usage.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {usage.map((u, i) => (
            <div key={`${u.model}-${i}`} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-900">
              <div className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200">
                <Cpu className="h-3 w-3 text-gray-400" />{u.model || 'model'}
              </div>
              <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                {tokens(u.totalTokens)} tok · {num(u.requests)} req{u.avgLatencyMs != null ? ` · ${dur(u.avgLatencyMs)}` : ''}{u.avgTps != null ? ` · ${u.avgTps} t/s` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tool-call timeline */}
      {timeline.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800 midnight:border-slate-800">
          {timeline.map((t, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-1.5 last:border-b-0 dark:border-gray-800/70 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-900">
              {t.ok
                ? <CheckCircle2 className="h-3.5 w-3.5 flex-none text-emerald-500" />
                : (t.decision === 'denied' || t.decision === 'deny')
                  ? <ShieldAlert className="h-3.5 w-3.5 flex-none text-amber-500" />
                  : <XCircle className="h-3.5 w-3.5 flex-none text-red-500" />}
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-700 dark:text-gray-200">{t.tool}</span>
              {t.round != null && <span className="flex-none text-[10px] text-gray-400">r{t.round}</span>}
              <span className="flex-none text-[10px] tabular-nums text-gray-400">{dur(t.durationMs)}</span>
              {!t.ok && t.error ? <span className="max-w-[40%] flex-none truncate text-[10px] text-red-500" title={t.error}>{t.code || t.error}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-1 py-2 text-[11px] text-gray-400">No tool calls recorded for this session (chat-only or pre-audit).</p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <MetaChip icon={Wrench}>{num(totals.toolCalls)} calls</MetaChip>
          {totals.failedCalls ? <MetaChip icon={XCircle} tone="red">{num(totals.failedCalls)} failed</MetaChip> : null}
          <MetaChip icon={Clock3}>{dur(totals.totalDurationMs)} tool time</MetaChip>
          <MetaChip icon={Cpu}>{tokens(totals.totalTokens)} tokens</MetaChip>
        </div>
        <a
          href={`/agents/${detail.session?.id}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          title="Open this agent session"
        >
          Open session <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export default function SessionTraces({ days = 30 }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await agentApi.getSessionTraces({ days, limit: 25 });
      setSessions(res.sessions || []);
    } catch (err) {
      setError(err.message || 'Failed to load session traces.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setExpandedId(null); setDetail(null); }, [days]);

  const toggle = useCallback(async (id) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const res = await agentApi.getSessionTrace(id);
      setDetail(res);
    } catch (err) {
      setDetailError(err.message || 'Failed to load trace.');
    } finally {
      setDetailLoading(false);
    }
  }, [expandedId]);

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800/70 midnight:border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-950 dark:text-white midnight:text-slate-100">Session Traces</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">Recent agent runs — expand for the tool-call timeline and token usage.</p>
          </div>
        </div>
        <span className="text-xs text-gray-400 midnight:text-slate-500">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…</div>
      ) : error ? (
        <div className="px-4 py-8 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : sessions.length === 0 ? (
        <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">No agent sessions in this window.</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800/70 midnight:divide-slate-800">
          {sessions.map((s) => {
            const meta = STATUS_META[s.status] || STATUS_META.paused;
            const open = expandedId === s.id;
            return (
              <div key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50/70 dark:hover:bg-white/[0.03] midnight:hover:bg-white/[0.03]"
                >
                  {open ? <ChevronDown className="h-4 w-4 flex-none text-gray-400" /> : <ChevronRight className="h-4 w-4 flex-none text-gray-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100 midnight:text-slate-200">{s.goal || 'Untitled session'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <MetaChip icon={Wrench}>{num(s.toolCalls)} calls</MetaChip>
                      {s.failedCalls ? <MetaChip icon={XCircle} tone="red">{num(s.failedCalls)} failed</MetaChip> : null}
                      <MetaChip icon={Cpu}>{tokens(s.totalTokens)} tok</MetaChip>
                      <MetaChip>{s.rounds} rounds</MetaChip>
                      <MetaChip icon={Clock3}>{when(s.updatedAt)}</MetaChip>
                    </div>
                  </div>
                  <span className={`flex-none rounded-md px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>{meta.label}</span>
                </button>
                {open && <SessionDetail detail={detail} loading={detailLoading} error={detailError} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
