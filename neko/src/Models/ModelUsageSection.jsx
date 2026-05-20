/* eslint-disable react/prop-types */
import { BarChart3, Clock, Gauge, RefreshCw } from 'lucide-react';
import { Badge, providerLabel } from './modelPageShared.jsx';

const fmtTokens = (value = 0) => {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
};

const fmtDate = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const pct = (value, total) => {
  const n = Number(value) || 0;
  const d = Number(total) || 0;
  if (!d) return 0;
  return Math.min(100, Math.max(0, Math.round((n / d) * 100)));
};

const Stat = ({ icon: Icon, label, value, detail }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/60 midnight:border-slate-800 midnight:bg-slate-900/60">
    <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="mt-2 text-xl font-semibold tabular-nums text-gray-950 dark:text-gray-100 midnight:text-slate-100">{value}</div>
    {detail && <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-400">{detail}</div>}
  </div>
);

const RangeButton = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 midnight:bg-slate-800 midnight:text-slate-100 midnight:ring-1 midnight:ring-slate-700'
        : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 midnight:hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
);

const ModelUsageSection = ({ usage, loading, error, range, onRangeChange, onRefresh, catalog = [] }) => {
  const totals = usage?.totals || {};
  const models = usage?.models || [];
  const recent = usage?.recent || [];
  const exactCount = Math.max(0, (totals.request_count || 0) - (totals.estimated_count || 0));
  const exactPct = pct(exactCount, totals.request_count);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Usage</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Model calls, token totals, and estimate quality for this workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
            <RangeButton active={range === '24h'} onClick={() => onRangeChange('24h')}>24h</RangeButton>
            <RangeButton active={range === '7d'} onClick={() => onRangeChange('7d')}>7d</RangeButton>
            <RangeButton active={range === '30d'} onClick={() => onRangeChange('30d')}>30d</RangeButton>
            <RangeButton active={range === '90d'} onClick={() => onRangeChange('90d')}>90d</RangeButton>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            title="Refresh usage"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !usage ? (
        <div className="h-36 rounded-2xl bg-gray-100 dark:bg-gray-800 midnight:bg-slate-900 animate-pulse" />
      ) : totals.request_count ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={BarChart3} label="Total Tokens" value={fmtTokens(totals.total_tokens)} detail={`${fmtTokens(totals.input_tokens)} in / ${fmtTokens(totals.output_tokens)} out`} />
            <Stat icon={Gauge} label="Requests" value={totals.request_count} detail={`${exactPct}% exact provider counts`} />
            <Stat icon={Clock} label="Cached" value={fmtTokens(totals.cached_tokens)} detail={`${fmtTokens(totals.reasoning_tokens)} reasoning tokens`} />
            <Stat icon={Clock} label="Last Used" value={fmtDate(totals.last_seen_at)} detail={totals.first_seen_at ? `Since ${fmtDate(totals.first_seen_at)}` : ''} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-900">
              <span>Top models</span>
              <span>Tokens</span>
              <span>Last</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
              {models.map(model => {
                const exact = model.request_count - model.estimated_count;
                return (
                  <div key={`${model.provider_id}:${model.model}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{model.model}</p>
                        {model.estimated_count > 0 ? <Badge color="amber">{model.estimated_count === model.request_count ? 'Estimated' : 'Mixed'}</Badge> : <Badge color="green">Exact</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        {providerLabel({ provider_id: model.provider_id, name: model.provider_name }, catalog)} · {model.request_count} request{model.request_count === 1 ? '' : 's'} · {pct(exact, model.request_count)}% exact
                      </p>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtTokens(model.total_tokens)}</div>
                    <div className="text-right text-xs text-gray-500 dark:text-gray-400">{fmtDate(model.last_used_at)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {recent.slice(0, 8).map(item => (
              <span key={item.id} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 midnight:border-slate-800">
                <span className="max-w-[180px] truncate">{item.model}</span>
                <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">{fmtTokens(item.total_tokens)}</span>
                {item.estimated && <span className="text-amber-500">~</span>}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
          <BarChart3 className="mx-auto h-7 w-7 text-gray-300 dark:text-gray-600 midnight:text-gray-500" />
          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">No model usage recorded yet</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400">Run an agent or chat once, then this panel will start filling in.</p>
        </div>
      )}
    </div>
  );
};

export default ModelUsageSection;
