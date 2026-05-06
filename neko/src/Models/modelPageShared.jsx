export const Badge = ({ children, color = 'gray' }) => {
  const colors = {
    green: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/30 midnight:bg-slate-900/30 midnight:text-green-400',
    gray:  'bg-gray-50 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 midnight:bg-slate-800 midnight:text-slate-400',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/30 midnight:bg-slate-900/30 midnight:text-amber-400',
    red:   'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/30 midnight:bg-slate-900/30 midnight:text-red-400',
    blue:  'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/30 midnight:bg-slate-900/30 midnight:text-blue-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
};

export const Panel = ({ children, className = '' }) => (
  <section className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 ${className}`}>
    {children}
  </section>
);

export const SectionHeader = ({ eyebrow, title, description, action }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-1 text-lg font-semibold text-gray-950 dark:text-white midnight:text-slate-100">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
          {description}
        </p>
      )}
    </div>
    {action}
  </div>
);

export const STATUS_META = {
  idle:    { label: 'No model loaded', color: 'gray'  },
  loading: { label: 'Loading model…',  color: 'amber' },
  ready:   { label: 'Ready',           color: 'green' },
  error:   { label: 'Error',           color: 'red'   },
};

export const INSTALL_PROFILE_LABELS = {
  cpu_safe: 'CPU-safe build',
  nvidia_gpu: 'NVIDIA CUDA build',
  apple_metal: 'Apple Metal build',
  amd_rocm: 'AMD ROCm build',
};

export const DEFAULT_LOAD_CTX_SIZE = 32768;
export const MAX_LOAD_CTX_SIZE = 1048576;

export const MODEL_LOAD_CONTEXT_STORAGE_KEY = 'asyncat_model_load_contexts';

export const normalizeLoadCtxSize = (value, fallback = DEFAULT_LOAD_CTX_SIZE, max = MAX_LOAD_CTX_SIZE) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 512) return fallback;
  return Math.min(n, max);
};

export const getModelContextLimit = (model) => {
  const n = Number(model?.contextLength);
  if (!Number.isFinite(n) || n < 512) return MAX_LOAD_CTX_SIZE;
  return Math.min(n, MAX_LOAD_CTX_SIZE);
};

export const getModelLoadCtxError = (value, max = MAX_LOAD_CTX_SIZE) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 512) return 'Set a load context of at least 512.';
  if (n > max) return `Set within this model's limit: ${max.toLocaleString()} ctx.`;
  return '';
};

export const loadSavedModelContextSizes = () => {
  try {
    const raw = localStorage.getItem(MODEL_LOAD_CONTEXT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([filename]) => typeof filename === 'string' && filename)
        .map(([filename, value]) => [filename, String(normalizeLoadCtxSize(value))])
    );
  } catch {
    return {};
  }
};

export const saveModelContextSizes = (contexts) => {
  try {
    localStorage.setItem(MODEL_LOAD_CONTEXT_STORAGE_KEY, JSON.stringify(contexts));
  } catch {}
};

export const conciseHardwareSummary = (hardware) => {
  const gpu = hardware?.gpu;
  if (!gpu) return `${hardware?.arch || 'unknown'} · CPU-safe`;
  const vram = gpu.vramGb ? ` · ${gpu.vramGb} GB` : '';
  return `${gpu.vendor}${vram}`;
};

export const capabilityBadgeColor = (hint) => {
  if (hint === 'nvidia') return 'green';
  if (hint === 'apple') return 'blue';
  if (hint === 'amd') return 'amber';
  return 'gray';
};

export const providerLabel = (profile, catalog = []) => {
  const preset = catalog.find(item => item.providerId === profile?.provider_id || item.id === profile?.provider_id);
  return preset?.name || profile?.name || profile?.provider_id || 'Provider';
};
