// Models → Usage: requests and tokens over a chosen range, the models that
// used the most, and the latest requests.

import { BarChart3, Clock, Gauge, History, RefreshCw } from 'lucide-react';
import Cat from '../components/ui/Cat.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Notice from '../components/ui/Notice.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { Badge, providerLabel } from './modelPageShared.jsx';

const RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

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
  <div className="rounded-xl border border-line bg-surface p-4">
    <div className="flex items-center gap-2 text-[12px] text-fg-muted">
      <Icon className="h-3.5 w-3.5 text-fg-subtle" />
      {label}
    </div>
    <div className="mt-2 text-[20px] font-semibold tabular-nums tracking-[-0.01em] text-fg">{value}</div>
    {detail && <div className="mt-1 text-[12px] text-fg-subtle">{detail}</div>}
  </div>
);

const ModelUsageSection = ({ usage, loading, error, range, onRangeChange, onRefresh, catalog = [] }) => {
  const totals = usage?.totals || {};
  const models = usage?.models || [];
  const recent = usage?.recent || [];
  const exactCount = Math.max(0, (totals.request_count || 0) - (totals.estimated_count || 0));
  const exactPct = pct(exactCount, totals.request_count);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Segmented value={range} onChange={onRangeChange} items={RANGES} label="Time range" role="radiogroup" />
        <IconButton icon={RefreshCw} label="Refresh usage" onClick={onRefresh} loading={loading} />
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading && !usage ? (
        <Skeleton className="h-36 rounded-xl" />
      ) : totals.request_count ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={BarChart3} label="Total tokens" value={fmtTokens(totals.total_tokens)} detail={`${fmtTokens(totals.input_tokens)} in / ${fmtTokens(totals.output_tokens)} out`} />
            <Stat icon={Gauge} label="Requests" value={totals.request_count} detail={`${exactPct}% exact provider counts`} />
            <Stat icon={History} label="Cached" value={fmtTokens(totals.cached_tokens)} detail={`${fmtTokens(totals.reasoning_tokens)} reasoning tokens`} />
            <Stat icon={Clock} label="Last used" value={fmtDate(totals.last_seen_at)} detail={totals.first_seen_at ? `Since ${fmtDate(totals.first_seen_at)}` : ''} />
          </div>

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line px-4 py-2 text-[12px] text-fg-subtle">
              <span>Top models</span>
              <span>Tokens</span>
              <span>Last</span>
            </div>
            <div className="divide-y divide-line">
              {models.map(model => {
                const exact = model.request_count - model.estimated_count;
                return (
                  <div key={`${model.provider_id}:${model.model}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-fg">{model.model}</p>
                        {model.estimated_count > 0 ? <Badge color="amber">{model.estimated_count === model.request_count ? 'Estimated' : 'Mixed'}</Badge> : <Badge color="gray">Exact</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-fg-muted">
                        {providerLabel({ provider_id: model.provider_id, name: model.provider_name }, catalog)} · {model.request_count} request{model.request_count === 1 ? '' : 's'} · {pct(exact, model.request_count)}% exact
                      </p>
                    </div>
                    <div className="text-right text-[13px] font-medium tabular-nums text-fg">{fmtTokens(model.total_tokens)}</div>
                    <div className="text-right text-[12px] tabular-nums text-fg-subtle">{fmtDate(model.last_used_at)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {recent.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] text-fg-subtle">Latest requests</p>
              <div className="flex flex-wrap gap-2">
                {recent.slice(0, 8).map(item => (
                  <span key={item.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] text-fg-muted">
                    <span className="min-w-0 max-w-[180px] truncate">{item.model}</span>
                    <span className="font-medium tabular-nums text-fg">{fmtTokens(item.total_tokens)}</span>
                    {item.estimated && <span className="text-amber-700 dark:text-amber-400" title="Estimated" aria-label="Estimated">~</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mx-auto max-w-md py-8 text-center">
          <Cat pose="sleep" className="mx-auto w-28" outline={4} />
          <p className="mt-4 text-[15px] font-medium text-fg">No usage yet</p>
          <p className="mt-1.5 text-[13px] leading-5 text-fg-muted">Chat or run an agent once, and its requests and tokens show up here.</p>
        </div>
      )}
    </div>
  );
};

export default ModelUsageSection;
