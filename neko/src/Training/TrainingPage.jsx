// Training/TrainingPage.jsx — Fine-tuning / LoRA training page
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  HardDrive, Zap, AlertTriangle,
  Play, Square, Trash2, RefreshCw, ChevronDown, ChevronUp,
  Download, XCircle, Settings2, Brain, Check, FileJson,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { trainingApi } from './trainingApi.js';

// Matches the palette used elsewhere in the app (BlockBasedMessageRenderer).
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4'];

// Curated, known-good fine-tuning bases — free text still works, this is just
// autocomplete so users aren't stuck guessing a HF repo id from scratch.
const SUGGESTED_MODELS = [
  { id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', note: '1.1B — fastest, good for testing the pipeline' },
  { id: 'unsloth/Llama-3.2-1B-Instruct', note: '1B — low VRAM' },
  { id: 'Qwen/Qwen2.5-1.5B-Instruct', note: '1.5B — strong instruction following' },
  { id: 'unsloth/Qwen3-1.7B', note: '1.7B — good quality/VRAM balance' },
  { id: 'microsoft/Phi-3.5-mini-instruct', note: '3.8B — needs ~6GB+ VRAM (4-bit)' },
  { id: 'unsloth/Mistral-7B-Instruct-v0.3', note: '7B — needs ~8GB+ VRAM (4-bit QLoRA)' },
  { id: 'unsloth/Llama-3.1-8B-Instruct', note: '8B — needs ~8GB+ VRAM (4-bit QLoRA)' },
];

const readinessShape = PropTypes.shape({
  backend: PropTypes.string,
  canInstall: PropTypes.bool,
  canTrain: PropTypes.bool,
  envReady: PropTypes.bool,
  gpu: PropTypes.shape({
    name: PropTypes.string,
    vendor: PropTypes.string,
    vramGb: PropTypes.number,
  }),
  disk: PropTypes.shape({ freeGb: PropTypes.number }),
  warnings: PropTypes.arrayOf(PropTypes.string),
});

const jobShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  name: PropTypes.string,
  status: PropTypes.string,
  baseModel: PropTypes.string,
  backend: PropTypes.string,
  outputDir: PropTypes.string,
  error: PropTypes.string,
  createdAt: PropTypes.string,
  completedAt: PropTypes.string,
  hyperparams: PropTypes.shape({ rank: PropTypes.number }),
  progress: PropTypes.shape({
    percent: PropTypes.number,
    loss: PropTypes.number,
    step: PropTypes.number,
    totalSteps: PropTypes.number,
    message: PropTypes.string,
  }),
});

// Rough heuristic from a "<N>B" pattern in the model id — not exact, just a hint.
function estimateVramFit(modelId, availableVramGb) {
  const match = (modelId || '').match(/(\d+(?:\.\d+)?)\s*[bB](?:[-_]|$|[^a-zA-Z])/);
  if (!match) return null;
  const paramsB = parseFloat(match[1]);
  if (!paramsB || paramsB > 200) return null;
  const estGb = +(paramsB * 0.7 + 1.5).toFixed(1);
  if (availableVramGb == null) return { paramsB, estGb, fit: 'unknown' };
  const fit = estGb <= availableVramGb ? 'ok' : estGb <= availableVramGb * 1.3 ? 'tight' : 'risky';
  return { paramsB, estGb, fit };
}

// ── Status badge ────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const styles = {
    queued: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
    running: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-400',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400',
    failed: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400',
    cancelled: 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${styles[status] || styles.queued}`}>
      {status}
    </span>
  );
};

StatusBadge.propTypes = {
  status: PropTypes.string.isRequired,
};

// ── Progress bar ────────────────────────────────────────────────────────────

const ProgressBar = ({ percent = 0, loss = null }) => (
  <div className="w-full">
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="text-gray-500 dark:text-gray-400">{percent.toFixed(1)}%</span>
      {loss !== null && (
        <span className="text-gray-500 dark:text-gray-400">Loss: {loss.toFixed(4)}</span>
      )}
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800/60">
      <div
        className="h-full rounded-full bg-gray-700 transition-[width] duration-500 ease-out dark:bg-gray-300"
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  </div>
);

ProgressBar.propTypes = {
  percent: PropTypes.number,
  loss: PropTypes.number,
};

// ── Readiness banner ────────────────────────────────────────────────────────

const ReadinessBanner = ({ readiness, onInstall, installing, onRemove }) => {
  if (!readiness) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3.5 dark:border-gray-800 midnight:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white">Environment</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Local hardware and training runtime.</p>
        </div>
        {readiness.envReady && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Ready
          </span>
        )}
      </div>
      <div className="px-5 py-4">
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
            {/* GPU */}
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">
                {readiness.gpu
                  ? `${readiness.gpu.name || readiness.gpu.vendor}${readiness.gpu.vramGb ? ` (${readiness.gpu.vramGb}GB)` : ''}`
                  : 'No GPU detected (CPU only)'}
              </span>
            </div>
            {/* Backend */}
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">
                Backend: <span className="font-medium">{(readiness.backend || 'cpu').toUpperCase()}</span>
              </span>
            </div>
            {/* Disk */}
            <div className="flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">
                {readiness.disk?.freeGb != null ? `${readiness.disk.freeGb}GB free` : 'Disk: unknown'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {readiness.warnings?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {readiness.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Install / Status */}
          <div className="mt-3 flex items-center gap-3">
            {readiness.envReady ? (
              <button
                onClick={onRemove}
                className="text-xs font-medium text-gray-500 transition-colors hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                title="Uninstall training environment"
              >
                Remove environment
              </button>
            ) : (
              <button
                onClick={onInstall}
                disabled={installing || !readiness.canInstall}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-150"
              >
                {installing ? (
                  'Installing…'
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Install Training Environment
                  </>
                )}
              </button>
            )}
          </div>
      </div>
    </section>
  );
};

ReadinessBanner.propTypes = {
  readiness: readinessShape,
  onInstall: PropTypes.func.isRequired,
  installing: PropTypes.bool.isRequired,
  onRemove: PropTypes.func.isRequired,
};

// ── Dataset dropdown ────────────────────────────────────────────────────────
// A native <select>'s open menu can't be styled (plain OS popup, breaks dark
// mode). This matches the app's own popup pattern instead — see the mode
// selector dropdown in MessageInputV2.jsx — for a panel that's actually ours.

const DatasetSelect = ({ datasets, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const selected = datasets.find((d) => d.path === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700
          bg-white dark:bg-gray-900 midnight:bg-gray-900
          focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
      >
        <span className={`flex items-center gap-2 truncate ${selected ? 'text-gray-900 dark:text-white midnight:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
          <FileJson className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
          <span className="truncate">{selected ? selected.filename : 'Select a dataset…'}</span>
          {selected && <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">({selected.sizeMb} MB)</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 midnight:border-slate-800
          bg-white dark:bg-gray-950 midnight:bg-slate-950 p-1 shadow-xl">
          {datasets.map((d) => (
            <button
              key={d.path}
              type="button"
              onClick={() => { onChange(d.path); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                value === d.path
                  ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800 midnight:text-slate-100'
                  : 'text-gray-600 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-slate-800'
              }`}
            >
              <FileJson className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
              <span className="flex-1 min-w-0 truncate">{d.filename}</span>
              <span className="text-[10px] opacity-60 flex-shrink-0">{d.sizeMb} MB</span>
              {value === d.path && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

DatasetSelect.propTypes = {
  datasets: PropTypes.arrayOf(PropTypes.shape({
    path: PropTypes.string.isRequired,
    filename: PropTypes.string.isRequired,
    sizeMb: PropTypes.number,
  })).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

// ── New Job Form ────────────────────────────────────────────────────────────

const DEFAULT_HYPERPARAMS = {
  epochs: 3,
  lr: 0.0002,
  rank: 16,
  alpha: 32,
  batchSize: 4,
  maxSeqLen: 2048,
};

const NewJobForm = ({ readiness, onSubmit, submitting }) => {
  const [name, setName] = useState('');
  const [baseModel, setBaseModel] = useState('');
  const [datasetPath, setDatasetPath] = useState('');
  const [datasets, setDatasets] = useState([]);
  const [datasetMode, setDatasetMode] = useState('pick'); // 'pick' | 'custom'
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hyper, setHyper] = useState(DEFAULT_HYPERPARAMS);

  useEffect(() => {
    trainingApi.listDatasets()
      .then((data) => {
        const files = data.files || [];
        setDatasets(files);
        if (files.length === 0) setDatasetMode('custom');
      })
      .catch(() => setDatasetMode('custom'));
  }, []);

  const vramHint = useMemo(
    () => estimateVramFit(baseModel, readiness?.gpu?.vramGb),
    [baseModel, readiness?.gpu?.vramGb]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !baseModel.trim() || !datasetPath.trim()) return;
    onSubmit({
      name: name.trim(),
      baseModel: baseModel.trim(),
      datasetPath: datasetPath.trim(),
      backend: readiness?.backend || 'cpu',
      ...hyper,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white">New training job</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Choose a model and JSONL dataset, then adjust advanced settings if needed.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Job Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. alpaca-qwen-lora"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700
              bg-white dark:bg-gray-900 midnight:bg-gray-900
              text-gray-900 dark:text-white midnight:text-white
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Base Model</label>
          <input
            type="text"
            list="suggested-base-models"
            value={baseModel}
            onChange={(e) => setBaseModel(e.target.value)}
            placeholder="e.g. unsloth/Qwen3-1.7B"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700
              bg-white dark:bg-gray-900 midnight:bg-gray-900
              text-gray-900 dark:text-white midnight:text-white
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
            required
          />
          <datalist id="suggested-base-models">
            {SUGGESTED_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.note}</option>
            ))}
          </datalist>
          {vramHint && (
            <p className={`mt-1 text-[10px] ${
              vramHint.fit === 'risky' ? 'text-red-500' : vramHint.fit === 'tight' ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'
            }`}>
              ~{vramHint.paramsB}B params · est. {vramHint.estGb}GB VRAM (4-bit QLoRA)
              {vramHint.fit === 'risky' && ' — likely too large for your GPU'}
              {vramHint.fit === 'tight' && ' — tight fit, lower rank/batch size if it OOMs'}
            </p>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Dataset (JSONL)</label>
          {datasets.length > 0 && (
            <button
              type="button"
              onClick={() => setDatasetMode(datasetMode === 'pick' ? 'custom' : 'pick')}
              className="text-[10px] font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {datasetMode === 'pick' ? 'Enter custom path' : 'Pick from downloaded datasets'}
            </button>
          )}
        </div>
        {datasetMode === 'pick' ? (
          <DatasetSelect datasets={datasets} value={datasetPath} onChange={setDatasetPath} />
        ) : (
          <input
            type="text"
            value={datasetPath}
            onChange={(e) => setDatasetPath(e.target.value)}
            placeholder="e.g. ~/.asyncat/datasets/alpaca-train-alpaca.jsonl"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700
              bg-white dark:bg-gray-900 midnight:bg-gray-900
              text-gray-900 dark:text-white midnight:text-white
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
            required
          />
        )}
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          {datasets.length === 0
            ? 'No downloaded datasets found. Ask the agent: "download alpaca dataset for fine-tuning"'
            : 'Download more datasets using the agent: "download alpaca dataset for fine-tuning"'}
        </p>
      </div>

      {/* Advanced settings toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-2 transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        Hyperparameters
        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 midnight:bg-gray-800/30">
          {[
            { key: 'epochs', label: 'Epochs', type: 'number', min: 1, max: 50 },
            { key: 'lr', label: 'Learning Rate', type: 'number', step: '0.0001' },
            { key: 'rank', label: 'LoRA Rank', type: 'number', min: 4, max: 256 },
            { key: 'alpha', label: 'LoRA Alpha', type: 'number', min: 4, max: 512 },
            { key: 'batchSize', label: 'Batch Size', type: 'number', min: 1, max: 64 },
            { key: 'maxSeqLen', label: 'Max Seq Length', type: 'number', min: 128, max: 8192 },
          ].map(({ key, label, ...props }) => (
            <div key={key}>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{label}</label>
              <input
                {...props}
                value={hyper[key]}
                onChange={(e) => setHyper({ ...hyper, [key]: key === 'lr' ? parseFloat(e.target.value) : parseInt(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                  focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !readiness?.canTrain || !name.trim() || !baseModel.trim() || !datasetPath.trim()}
        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-150"
      >
        {submitting ? (
          <>
            Starting…
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Start Training
          </>
        )}
      </button>
    </form>
  );
};

NewJobForm.propTypes = {
  readiness: readinessShape,
  onSubmit: PropTypes.func.isRequired,
  submitting: PropTypes.bool.isRequired,
};

// ── Job Card ────────────────────────────────────────────────────────────────

// ── Metrics chart ───────────────────────────────────────────────────────────

const MetricChart = ({ title, data, lines }) => (
  <div className="rounded-lg border border-gray-200/60 dark:border-white/[0.06] midnight:border-white/[0.04] p-2">
    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 px-1">{title}</p>
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
        <XAxis dataKey="step" tick={{ fontSize: 9 }} stroke="#9ca3af" />
        <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" width={32} />
        <Tooltip contentStyle={{ fontSize: 11, padding: '4px 8px' }} labelFormatter={(s) => `Step ${s}`} />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name || l.key}
            stroke={l.color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  </div>
);

MetricChart.propTypes = {
  title: PropTypes.string.isRequired,
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  lines: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    name: PropTypes.string,
    color: PropTypes.string.isRequired,
  })).isRequired,
};

// ── Job details: live log feed + metrics dashboard ──────────────────────────

const JobDetails = ({ job }) => {
  const [metrics, setMetrics] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const logRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    trainingApi.getJobMetrics(job.id)
      .then((data) => { if (!cancelled) setMetrics(data.metrics || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingMetrics(false); });

    const isLive = job.status === 'running' || job.status === 'queued';
    let unsubscribe = () => {};
    if (isLive) {
      unsubscribe = trainingApi.streamJobProgress(job.id, (payload) => {
        if (cancelled) return;
        if (payload.type === 'progress') {
          setMetrics((prev) => [...prev, {
            step: payload.step, loss: payload.loss, lr: payload.lr,
            gradNorm: payload.gradNorm, perplexity: payload.perplexity,
            gpuMemGb: payload.gpuMemGb, gpuUtilPct: payload.gpuUtilPct, cpuPct: payload.cpuPct,
          }]);
          return;
        }
        const text = payload.type === 'preflight'
          ? `Preflight: ${payload.datasetRows} rows · model ${payload.model} · backend ${payload.backend}`
          : payload.message;
        if (!text) return;
        setLogs((prev) => (prev.length && prev[prev.length - 1].text === text)
          ? prev
          : [...prev.slice(-199), { text }]);
      }, () => {});
    }

    return () => { cancelled = true; unsubscribe(); };
  }, [job.id, job.status]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const hasMetric = (key) => metrics.some((m) => m[key] != null);

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06] space-y-3">
      {logs.length > 0 && (
        <div
          ref={logRef}
          className="max-h-32 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-900/60 midnight:bg-gray-900/40 p-2 font-mono text-[10px] text-gray-500 dark:text-gray-400 space-y-0.5"
        >
          {logs.map((l, i) => <div key={i}>{l.text}</div>)}
        </div>
      )}

      {loadingMetrics ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading metrics…</p>
      ) : metrics.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No metrics yet — they&apos;ll appear once training starts logging steps.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {hasMetric('loss') && (
            <MetricChart title="Loss" data={metrics} lines={[{ key: 'loss', color: CHART_COLORS[0] }]} />
          )}
          {hasMetric('lr') && (
            <MetricChart title="Learning Rate" data={metrics} lines={[{ key: 'lr', color: CHART_COLORS[4] }]} />
          )}
          {hasMetric('gradNorm') && (
            <MetricChart title="Grad Norm" data={metrics} lines={[{ key: 'gradNorm', color: CHART_COLORS[3] }]} />
          )}
          {hasMetric('perplexity') && (
            <MetricChart title="Perplexity" data={metrics} lines={[{ key: 'perplexity', color: CHART_COLORS[2] }]} />
          )}
          {(hasMetric('gpuMemGb') || hasMetric('gpuUtilPct')) && (
            <MetricChart
              title="GPU Mem (GB) / Util %"
              data={metrics}
              lines={[
                { key: 'gpuMemGb', name: 'GPU Mem (GB)', color: CHART_COLORS[1] },
                { key: 'gpuUtilPct', name: 'GPU Util %', color: CHART_COLORS[5] },
              ]}
            />
          )}
          {hasMetric('cpuPct') && (
            <MetricChart title="CPU %" data={metrics} lines={[{ key: 'cpuPct', color: '#64748b' }]} />
          )}
        </div>
      )}
    </div>
  );
};

JobDetails.propTypes = {
  job: jobShape.isRequired,
};

const JobCard = ({ job, onStop, onDelete }) => {
  const progress = job.progress || {};
  const isActive = job.status === 'running' || job.status === 'queued';
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-colors dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white truncate">
              {job.name}
            </h4>
            <StatusBadge status={job.status} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            <span title="Base model">{job.baseModel}</span>
            <span>•</span>
            <span title="Backend">{job.backend?.toUpperCase()}</span>
            {job.hyperparams?.rank && (
              <>
                <span>•</span>
                <span>r={job.hyperparams.rank}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            title={expanded ? 'Hide details' : 'Show metrics & logs'}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {isActive && (
            <button
              onClick={() => onStop(job.id)}
              title="Stop training"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          {!isActive && (
            <button
              onClick={() => onDelete(job.id)}
              title="Delete job"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {isActive && progress.percent != null && (
        <div className="mt-2">
          <ProgressBar percent={progress.percent || 0} loss={progress.loss} />
          {progress.step != null && progress.totalSteps != null && (
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              <span>Step {progress.step} / {progress.totalSteps}</span>
              {progress.epoch != null && <span>Epoch {progress.epoch}</span>}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {job.status === 'failed' && job.error && (
        <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/10">
          <p className="text-xs text-red-600 dark:text-red-400 break-words">{job.error}</p>
        </div>
      )}

      {/* Completed output */}
      {job.status === 'completed' && job.outputDir && (
        <div className="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/10 midnight:bg-green-900/10">
          <p className="text-xs text-green-600 dark:text-green-400">
            ✓ Adapter saved to: <code className="text-[10px] bg-green-100 dark:bg-green-900/30 px-1 rounded">{job.outputDir}</code>
          </p>
        </div>
      )}

      {/* Timestamps */}
      <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
        Created {new Date(job.createdAt).toLocaleString()}
        {job.completedAt && ` • Finished ${new Date(job.completedAt).toLocaleString()}`}
      </div>

      {expanded && <JobDetails job={job} />}
    </div>
  );
};

JobCard.propTypes = {
  job: jobShape.isRequired,
  onStop: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

// ── Main Page ───────────────────────────────────────────────────────────────

const TrainingPage = () => {
  const [readiness, setReadiness] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const pollCleanups = useRef([]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [readinessData, jobsData] = await Promise.all([
        trainingApi.getReadiness(),
        trainingApi.listJobs(),
      ]);
      setReadiness(readinessData);
      setJobs(jobsData.jobs || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const activePollCleanups = pollCleanups.current;
    loadData();
    // Poll active jobs
    const interval = setInterval(() => {
      trainingApi.listJobs().then((data) => {
        setJobs(data.jobs || []);
      }).catch(() => {});
    }, 5000);
    return () => {
      clearInterval(interval);
      activePollCleanups.forEach(fn => fn());
    };
  }, [loadData]);

  // ── Install handler ───────────────────────────────────────────────────────
  const handleInstall = async () => {
    setInstalling(true);
    setInstallProgress(null);
    try {
      const { job } = await trainingApi.startInstall(readiness?.backend || 'cpu');
      const cleanup = trainingApi.pollInstallJob(
        job.id,
        (j) => setInstallProgress(j),
        () => {
          setInstalling(false);
          setInstallProgress(null);
          loadData(); // Refresh readiness
        },
        (j) => {
          setInstalling(false);
          setError(j?.error || 'Installation failed');
          setInstallProgress(null);
        },
      );
      pollCleanups.current.push(cleanup);
    } catch (err) {
      setInstalling(false);
      setError(err.message);
    }
  };

  // ── Remove handler ────────────────────────────────────────────────────────
  const handleRemove = async () => {
    if (!window.confirm('Are you sure you want to remove the training virtual environment? This will delete the venv directory.')) {
      return;
    }
    setLoading(true);
    try {
      await trainingApi.removeEnv();
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Start job ─────────────────────────────────────────────────────────────
  const handleStartJob = async (jobConfig) => {
    setSubmitting(true);
    try {
      await trainingApi.createJob(jobConfig);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Stop job ──────────────────────────────────────────────────────────────
  const handleStopJob = async (id) => {
    try {
      await trainingApi.stopJob(id);
      setTimeout(loadData, 1000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Delete job ────────────────────────────────────────────────────────────
  const handleDeleteJob = async (id) => {
    try {
      await trainingApi.deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto" role="status" aria-label="Loading training environment">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6">
          <div className="mb-7 space-y-2">
            <div className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-3 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800/70" />
          </div>
          {[112, 260].map((height) => (
            <div key={height} className="animate-pulse rounded-xl border border-gray-200 p-5 dark:border-gray-800" style={{ height }}>
              <div className="h-3.5 w-32 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mt-4 h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-800/70" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-7">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white midnight:text-white">Training</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Fine-tune a local model with a LoRA adapter.</p>
            </div>
            <button
              onClick={loadData}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Install progress */}
        {installing && installProgress && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {installProgress.message || 'Installing…'}
              </span>
            </div>
            <ProgressBar percent={installProgress.percent || 0} />
          </div>
        )}

        <div className="space-y-4">
          {/* Readiness */}
          <ReadinessBanner
            readiness={readiness}
            onInstall={handleInstall}
            installing={installing}
            onRemove={handleRemove}
          />

          {/* New job form — only show when environment is ready */}
          {readiness?.canTrain && (
            <NewJobForm
              readiness={readiness}
              onSubmit={handleStartJob}
              submitting={submitting}
            />
          )}

          {/* Jobs list */}
          {jobs.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white midnight:text-white">
                Training jobs
                <span className="text-xs font-normal text-gray-400">({jobs.length})</span>
              </h2>
              <div className="space-y-3">
                {jobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onStop={handleStopJob}
                    onDelete={handleDeleteJob}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {jobs.length === 0 && readiness?.canTrain && (
            <div className="border-t border-gray-100 py-7 text-center dark:border-gray-800">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                No training jobs yet
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Create a job above, or ask the agent to start fine-tuning.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingPage;
