/* eslint-disable react/prop-types */
import {
  CheckCircle2,
  CircleHelp,
  Cpu,
  Gauge,
  MemoryStick,
  RefreshCw,
  TriangleAlert,
  Zap,
} from 'lucide-react';

const FIT_META = {
  great: {
    icon: Zap,
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 midnight:border-emerald-900/60 midnight:bg-emerald-950/30 midnight:text-emerald-300',
  },
  fits: {
    icon: CheckCircle2,
    classes: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300 midnight:border-green-900/60 midnight:bg-green-950/30 midnight:text-green-300',
  },
  partial: {
    icon: Gauge,
    classes: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 midnight:border-amber-900/60 midnight:bg-amber-950/30 midnight:text-amber-300',
  },
  cpu: {
    icon: Cpu,
    classes: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 midnight:border-blue-900/60 midnight:bg-blue-950/30 midnight:text-blue-300',
  },
  tight: {
    icon: TriangleAlert,
    classes: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300 midnight:border-orange-900/60 midnight:bg-orange-950/30 midnight:text-orange-300',
  },
  too_large: {
    icon: TriangleAlert,
    classes: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 midnight:border-red-900/60 midnight:bg-red-950/30 midnight:text-red-300',
  },
  unknown: {
    icon: CircleHelp,
    classes: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 midnight:border-slate-700 midnight:bg-slate-800 midnight:text-slate-300',
  },
};

const formatGb = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `${number < 10 ? number.toFixed(1) : Math.round(number)} GB`;
};

const normalizeGpus = (hardware) => {
  if (Array.isArray(hardware?.gpu)) return hardware.gpu;
  if (hardware?.gpu) return [hardware.gpu];
  if (Array.isArray(hardware?.gpus)) return hardware.gpus;
  return [];
};

export const ModelFitBadge = ({ fit, showMemory = true, className = '' }) => {
  if (!fit) return null;
  const meta = FIT_META[fit.status] || FIT_META.unknown;
  const Icon = meta.icon;
  const memory = showMemory ? formatGb(fit.estimatedMemoryGb) : null;
  return (
    <span
      title={fit.description || 'Approximate model fit for this machine'}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${meta.classes} ${className}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {fit.label || 'Unknown fit'}
      {memory && <span className="font-medium opacity-75">· ~{memory}</span>}
    </span>
  );
};

export const ModelFitExplanation = ({ fit }) => {
  if (!fit) return null;
  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/40 midnight:border-slate-800 midnight:bg-slate-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <ModelFitBadge fit={fit} />
        <span className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          {Number(fit.memory?.contextLength || 4096).toLocaleString()} context
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
        {fit.description}
      </p>
    </div>
  );
};

export const HardwareFitOverview = ({ hardware, loading = false, onRefresh, compact = false }) => {
  const gpus = normalizeGpus(hardware);
  const primaryGpu = gpus[0];
  const unified = gpus.some(gpu => gpu.unifiedMemory);
  const ramTotal = formatGb(hardware?.ram?.totalGb ?? hardware?.totalRamGb);
  const ramFree = formatGb(hardware?.ram?.freeGb ?? hardware?.freeRamGb);
  const vram = formatGb(primaryGpu?.vramTotalGb ?? primaryGpu?.totalGb ?? primaryGpu?.vramGb);

  if (loading && !hardware) {
    return (
      <div className={`${compact ? 'mt-4' : ''} flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-400 midnight:border-slate-800 midnight:bg-slate-900/50 midnight:text-slate-400`}>
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Detecting RAM, GPU memory, and memory architecture…
      </div>
    );
  }

  if (!hardware) {
    return (
      <div className={`${compact ? 'mt-4' : ''} flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300 midnight:border-amber-900/60 midnight:bg-amber-950/20 midnight:text-amber-300`}>
        <span>RAM and GPU memory could not be detected. Fit badges may be unavailable.</span>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300/70 px-2 py-1 text-[10px] font-semibold hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/50">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-800/30 midnight:border-slate-800 midnight:bg-slate-900/40">
        <div className="flex min-w-0 items-center gap-2.5">
          <MemoryStick className="h-4 w-4 shrink-0 text-gray-400" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-gray-700 dark:text-gray-200 midnight:text-slate-200">
              {unified
                ? `${primaryGpu?.name || 'Unified memory'} · ${ramTotal || 'RAM unknown'}`
                : `${primaryGpu?.name || 'CPU inference'}${vram ? ` · ${vram} VRAM` : ''} · ${ramTotal || 'RAM unknown'}`}
            </div>
            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
              File choices are checked against this hardware before download. Estimates include a 4K context cache and runtime headroom.
            </p>
          </div>
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[10px] font-medium text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:hover:bg-slate-800">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        )}
      </div>
    );
  }

  const capacityItems = [
    {
      label: unified ? 'Unified memory' : 'System memory',
      value: ramTotal || 'Unknown',
      detail: ramFree ? `${ramFree} free now` : 'Current availability unknown',
      icon: MemoryStick,
    },
    {
      label: unified ? 'Shared GPU pool' : 'Graphics memory',
      value: unified ? 'Shared with RAM' : (vram || 'Not detected'),
      detail: primaryGpu?.name || (unified ? 'CPU and GPU use one pool' : 'CPU fallback remains available'),
      icon: Zap,
    },
    {
      label: 'Processor',
      value: `${hardware?.cpu?.cores || '?'} logical cores`,
      detail: hardware?.cpu?.model || `${hardware?.platform || ''} ${hardware?.arch || ''}`.trim(),
      icon: Cpu,
    },
  ];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Model fit hardware</h4>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
            Asyncat uses this profile to estimate full GPU fit, partial offload, CPU fallback, and models that are likely too large.
          </p>
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-300">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {capacityItems.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/35 midnight:border-slate-800 midnight:bg-slate-950/35">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-slate-500"><Icon className="h-3 w-3" />{label}</div>
            <div className="mt-2 text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-slate-200">{value}</div>
            <div className="mt-1 truncate text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500" title={detail}>{detail}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-4 text-gray-400 dark:text-gray-500 midnight:text-slate-500">
        These are planning estimates, not guarantees. Model architecture, context length, batch size, runtime, and other open applications affect actual memory use.
      </p>
    </section>
  );
};
