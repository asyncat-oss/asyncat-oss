// Small pieces shared by the Models pages: a badge (grey, or a status
// colour; blue means in use), a panel, a section heading, and model helpers.

export const Badge = ({ children, color = 'gray', title }) => {
  const colors = {
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    gray: 'bg-hover text-fg-muted',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400',
    blue: 'bg-accent-soft text-accent',
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

export const Panel = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-line bg-surface ${className}`}>
    {children}
  </section>
);

export const SectionHeader = ({ eyebrow, title, description, action }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-[12px] font-medium text-fg-subtle">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-fg">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-[13px] leading-5 text-fg-muted">
          {description}
        </p>
      )}
    </div>
    {action ? <div className="shrink-0 self-start sm:self-auto">{action}</div> : null}
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
  vulkan: 'Vulkan build',
  intel_sycl: 'Intel (SYCL) build',
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

export const providerLabel = (profile, catalog = []) => {
  const preset = catalog.find(item => item.providerId === profile?.provider_id || item.id === profile?.provider_id);
  return preset?.name || profile?.name || profile?.provider_id || 'Provider';
};
