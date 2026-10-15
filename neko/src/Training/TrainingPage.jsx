// Training/TrainingPage.jsx — Models → Training: this computer, the guided
// steps, the advanced form for any model and dataset, and the jobs.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Check, HardDrive, Zap,
  Play, Square, Trash2, ChevronDown, ChevronRight, ChevronUp,
  Download, X, Settings2, Brain, FileJson,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { trainingApi } from './trainingApi.js';
import { axisNumber } from './chartFormat.js';
import GuidedTraining from './GuidedTraining.jsx';
import Button from '../components/ui/Button.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Notice from '../components/ui/Notice.jsx';
import Select from '../components/ui/Select.jsx';
import Combobox from '../components/ui/Combobox.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import StatusLine from '../components/ui/StatusLine.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { Badge } from '../Models/modelPageShared.jsx';

// Curated, known-good fine-tuning bases — free text still works, these are just
// suggestions so users aren't stuck guessing a HF repo id from scratch.
const SUGGESTED_MODELS = [
  { id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', note: '1.1B — fastest, good for testing the pipeline' },
  { id: 'unsloth/Llama-3.2-1B-Instruct', note: '1B — low VRAM' },
  { id: 'Qwen/Qwen2.5-1.5B-Instruct', note: '1.5B — strong instruction following' },
  { id: 'unsloth/Qwen3-1.7B', note: '1.7B — good quality/VRAM balance' },
  { id: 'microsoft/Phi-3.5-mini-instruct', note: '3.8B — needs ~6GB+ VRAM (4-bit)' },
  { id: 'unsloth/Mistral-7B-Instruct-v0.3', note: '7B — needs ~8GB+ VRAM (4-bit QLoRA)' },
  { id: 'unsloth/Llama-3.1-8B-Instruct', note: '8B — needs ~8GB+ VRAM (4-bit QLoRA)' },
];

const BASE_MODEL_OPTIONS = SUGGESTED_MODELS.map((m) => ({ value: m.id, description: m.note }));

const readinessShape = PropTypes.shape({
  backend: PropTypes.string,
  canInstall: PropTypes.bool,
  canTrain: PropTypes.bool,
  envReady: PropTypes.bool,
  gpu: PropTypes.shape({
    name: PropTypes.string,
    vendor: PropTypes.string,
    vramGb: PropTypes.number,
    driverIssue: PropTypes.bool,
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

// ── Job status ──────────────────────────────────────────────────────────────

const STATUS = {
  queued: { label: 'Queued', color: 'gray' },
  running: { label: 'Running', color: 'blue' },
  completed: { label: 'Completed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const StatusBadge = ({ status }) => {
  const meta = STATUS[status] || { label: status, color: 'gray' };
  return <Badge color={meta.color}>{meta.label}</Badge>;
};

StatusBadge.propTypes = {
  status: PropTypes.string.isRequired,
};

// ── Progress bar ────────────────────────────────────────────────────────────

const ProgressBar = ({ percent = 0, loss = null }) => (
  <div className="w-full">
    <div className="mb-1.5 flex items-center justify-between text-[12px] tabular-nums text-fg-muted">
      <span>{percent.toFixed(1)}%</span>
      {loss !== null && <span>Loss {loss.toFixed(4)}</span>}
    </div>
    <Progress value={percent} label="Training progress" />
  </div>
);

ProgressBar.propTypes = {
  percent: PropTypes.number,
  loss: PropTypes.number,
};

// ── This computer ───────────────────────────────────────────────────────────

// Where training would run, in words. A card whose driver isn't answering
// doesn't count until it does (the warning below says so).
function runsOnText(readiness) {
  if (readiness.gpu?.driverIssue) return 'Runs on the processor until the graphics driver answers';
  if (readiness.backend === 'cuda') return 'Runs on the graphics card (CUDA)';
  if (readiness.backend === 'mlx') return 'Runs on Apple silicon (MLX)';
  return 'Runs on the processor';
}

const Fact = ({ icon: Icon, children }) => (
  <div className="flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">
    <Icon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
    <span className="min-w-0 truncate">{children}</span>
  </div>
);

Fact.propTypes = { icon: PropTypes.elementType.isRequired, children: PropTypes.node };

const ReadinessBanner = ({ readiness, onInstall, installing, onRemove }) => {
  if (!readiness) return null;
  const gpu = readiness.gpu;

  return (
    <section className="rounded-2xl border border-line bg-surface px-5 py-4">
      {/* On a phone the status goes under the title instead of squeezing it. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2 className="text-[14px] font-semibold text-fg">This computer</h2>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">What training can use here.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {readiness.envReady && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Training tools ready
            </span>
          )}
        </div>
      </div>

      {/* Facts take the room their words need (a long graphics card name
          isn't squeezed into a third) and wrap on a narrow window. */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <Fact icon={Zap}>
          {gpu
            ? `${gpu.name || gpu.vendor}${gpu.vramGb ? `, ${gpu.vramGb} GB` : ''}`
            : 'No GPU found (processor only)'}
        </Fact>
        <Fact icon={Brain}>{runsOnText(readiness)}</Fact>
        <Fact icon={HardDrive}>
          {readiness.disk?.freeGb != null ? `${readiness.disk.freeGb} GB free` : 'Free space unknown'}
        </Fact>
      </div>

      {readiness.warnings?.length > 0 && (
        <div className="mt-3 space-y-1">
          {readiness.warnings.map((w, i) => <Notice key={i} tone="warning">{w}</Notice>)}
        </div>
      )}

      <div className="mt-3">
        {readiness.envReady ? (
          <Button variant="ghost" size="xs" icon={Trash2} onClick={onRemove} className="-ml-2">
            Remove the training tools
          </Button>
        ) : (
          <Button icon={Download} loading={installing} disabled={!readiness.canInstall} onClick={onInstall}>
            {installing ? 'Installing…' : 'Install the training tools'}
          </Button>
        )}
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

const DatasetSelect = ({ datasets, value, onChange }) => (
  <Select
    value={value}
    onChange={onChange}
    placeholder="Choose a dataset…"
    aria-label="Dataset"
    options={datasets.map((d) => ({ value: d.path, label: d.filename, hint: `${d.sizeMb} MB`, icon: FileJson }))}
  />
);

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

const HYPERPARAM_FIELDS = [
  { key: 'epochs', label: 'Epochs', type: 'number', min: 1, max: 50 },
  { key: 'lr', label: 'Learning rate', type: 'number', step: '0.0001' },
  { key: 'rank', label: 'LoRA rank', type: 'number', min: 4, max: 256 },
  { key: 'alpha', label: 'LoRA alpha', type: 'number', min: 4, max: 512 },
  { key: 'batchSize', label: 'Batch size', type: 'number', min: 1, max: 64 },
  { key: 'maxSeqLen', label: 'Max sequence length', type: 'number', min: 128, max: 8192 },
];

const VRAM_TONE = {
  risky: 'text-red-600 dark:text-red-400',
  tight: 'text-amber-700 dark:text-amber-400',
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
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
      <div>
        <h3 className="text-[13px] font-semibold text-fg">New training job</h3>
        <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">Choose a model and a JSONL dataset, then change the settings if you need to.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Job name" htmlFor="training-job-name">
          <Input
            id="training-job-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. alpaca-qwen-lora"
            required
          />
        </Field>
        <Field label="Base model" htmlFor="training-base-model">
          <Combobox
            id="training-base-model"
            value={baseModel}
            onChange={setBaseModel}
            options={BASE_MODEL_OPTIONS}
            placeholder="e.g. unsloth/Qwen3-1.7B"
            required
          />
          {vramHint && (
            <p className={`mt-1.5 text-[12px] leading-5 ${VRAM_TONE[vramHint.fit] || 'text-fg-subtle'}`}>
              About {vramHint.paramsB}B parameters · needs about {vramHint.estGb} GB of GPU memory (4-bit QLoRA)
              {vramHint.fit === 'risky' && ': likely too big for your GPU'}
              {vramHint.fit === 'tight' && ': a tight fit; lower the rank or batch size if it runs out of memory'}
            </p>
          )}
        </Field>
      </div>

      <Field
        label="Dataset (JSONL)"
        htmlFor={datasetMode === 'custom' ? 'training-dataset-path' : undefined}
        hint={datasets.length === 0
          ? 'No downloaded datasets yet. Ask the agent: "download alpaca dataset for fine-tuning"'
          : 'Download more by asking the agent: "download alpaca dataset for fine-tuning"'}
        action={datasets.length > 0 ? (
          <button
            type="button"
            onClick={() => setDatasetMode(datasetMode === 'pick' ? 'custom' : 'pick')}
            className="rounded text-[12px] text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {datasetMode === 'pick' ? 'Enter a path' : 'Pick a downloaded dataset'}
          </button>
        ) : null}
      >
        {datasetMode === 'pick' ? (
          <DatasetSelect datasets={datasets} value={datasetPath} onChange={setDatasetPath} />
        ) : (
          <Input
            id="training-dataset-path"
            type="text"
            value={datasetPath}
            onChange={(e) => setDatasetPath(e.target.value)}
            placeholder="e.g. ~/.asyncat/datasets/alpaca-train-alpaca.jsonl"
            aria-label="Dataset path"
            required
          />
        )}
      </Field>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Settings
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
            {HYPERPARAM_FIELDS.map(({ key, label, ...props }) => (
              <Field key={key} label={label} htmlFor={`training-${key}`}>
                <Input
                  id={`training-${key}`}
                  {...props}
                  value={hyper[key]}
                  onChange={(e) => setHyper({ ...hyper, [key]: key === 'lr' ? parseFloat(e.target.value) : parseInt(e.target.value) })}
                  className="h-8 tabular-nums"
                />
              </Field>
            ))}
          </div>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        icon={Play}
        loading={submitting}
        disabled={!readiness?.canTrain || !name.trim() || !baseModel.trim() || !datasetPath.trim()}
      >
        {submitting ? 'Starting…' : 'Start training'}
      </Button>
    </form>
  );
};

NewJobForm.propTypes = {
  readiness: readinessShape,
  onSubmit: PropTypes.func.isRequired,
  submitting: PropTypes.bool.isRequired,
};

// ── Metrics chart ───────────────────────────────────────────────────────────

// Charts use the accent for their line, and a second line (GPU use) in grey.
const LINE = 'var(--as-accent)';
const SECOND_LINE = 'var(--as-fg-subtle)';
const AXIS_TICK = { fontSize: 10, fill: 'var(--as-fg-subtle)' };
const TOOLTIP_STYLE = {
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid var(--as-line-strong)',
  background: 'var(--as-elevated)',
  color: 'var(--as-fg)',
};

const MetricChart = ({ title, data, lines }) => (
  <div className="rounded-xl border border-line p-2">
    <p className="mb-1 px-1 text-[11px] font-medium text-fg-subtle">{title}</p>
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="step" tick={AXIS_TICK} stroke="var(--as-line-strong)" />
        <YAxis tick={AXIS_TICK} tickFormatter={axisNumber} stroke="var(--as-line-strong)" width={34} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'var(--as-fg-muted)' }} labelFormatter={(s) => `Step ${s}`} />
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
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {logs.length > 0 && (
        <div
          ref={logRef}
          className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg bg-hover p-2 font-mono text-[11px] leading-4 text-fg-muted"
        >
          {logs.map((l, i) => <div key={i}>{l.text}</div>)}
        </div>
      )}

      {loadingMetrics ? (
        <p className="text-[12px] text-fg-subtle">Loading metrics…</p>
      ) : metrics.length === 0 ? (
        <p className="text-[12px] text-fg-subtle">No metrics yet. They appear once training logs its first steps.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {hasMetric('loss') && (
            <MetricChart title="Loss" data={metrics} lines={[{ key: 'loss', color: LINE }]} />
          )}
          {hasMetric('lr') && (
            <MetricChart title="Learning rate" data={metrics} lines={[{ key: 'lr', color: LINE }]} />
          )}
          {hasMetric('gradNorm') && (
            <MetricChart title="Gradient norm" data={metrics} lines={[{ key: 'gradNorm', color: LINE }]} />
          )}
          {hasMetric('perplexity') && (
            <MetricChart title="Perplexity" data={metrics} lines={[{ key: 'perplexity', color: LINE }]} />
          )}
          {(hasMetric('gpuMemGb') || hasMetric('gpuUtilPct')) && (
            <MetricChart
              title="GPU memory (GB) and use (%)"
              data={metrics}
              lines={[
                { key: 'gpuMemGb', name: 'GPU memory (GB)', color: LINE },
                { key: 'gpuUtilPct', name: 'GPU use (%)', color: SECOND_LINE },
              ]}
            />
          )}
          {hasMetric('cpuPct') && (
            <MetricChart title="Processor use (%)" data={metrics} lines={[{ key: 'cpuPct', color: LINE }]} />
          )}
        </div>
      )}
    </div>
  );
};

JobDetails.propTypes = {
  job: jobShape.isRequired,
};

// ── Job card ────────────────────────────────────────────────────────────────

const JobCard = ({ job, onStop, onDelete }) => {
  const progress = job.progress || {};
  const isActive = job.status === 'running' || job.status === 'queued';
  const [expanded, setExpanded] = useState(false);
  const meta = [job.baseModel, job.backend?.toUpperCase(), job.hyperparams?.rank ? `r=${job.hyperparams.rank}` : null].filter(Boolean);

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-[13px] font-medium text-fg">{job.name}</h4>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-0.5 truncate text-[12px] text-fg-subtle">{meta.join(' · ')}</p>
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          <IconButton
            icon={expanded ? ChevronUp : ChevronDown}
            label={expanded ? 'Hide metrics and logs' : 'Show metrics and logs'}
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          />
          {isActive
            ? <IconButton icon={Square} label="Stop training" size="sm" onClick={() => onStop(job.id)} />
            : <IconButton icon={Trash2} label="Delete job" size="sm" onClick={() => onDelete(job.id)} />}
        </div>
      </div>

      {isActive && progress.percent != null && (
        <div className="mt-3">
          <ProgressBar percent={progress.percent || 0} loss={progress.loss} />
          {progress.step != null && progress.totalSteps != null && (
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-fg-subtle">
              <span>Step {progress.step} of {progress.totalSteps}</span>
              {progress.epoch != null && <span>Epoch {progress.epoch}</span>}
            </div>
          )}
        </div>
      )}

      {job.status === 'failed' && job.error && (
        <p className="mt-2 break-words rounded-lg bg-red-500/10 px-3 py-2 text-[12px] leading-5 text-red-700 dark:text-red-400">{job.error}</p>
      )}

      {job.status === 'completed' && job.outputDir && (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-muted">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="shrink-0">Adapter saved to</span>
          <code className="truncate font-mono text-[11px] text-fg">{job.outputDir}</code>
        </p>
      )}

      <p className="mt-2 text-[11px] text-fg-subtle">
        Created {new Date(job.createdAt).toLocaleString()}
        {job.completedAt && ` · Finished ${new Date(job.completedAt).toLocaleString()}`}
      </p>

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

// `refreshKey`: the Models page header's Refresh, which looks again.
const TrainingPage = ({ refreshKey = 0 }) => {
  const [readiness, setReadiness] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const pollCleanups = useRef([]);
  const confirm = useConfirm();

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

  // The Models header's Refresh.
  useEffect(() => {
    if (refreshKey) loadData();
  }, [refreshKey, loadData]);

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
    const confirmed = await confirm({
      title: 'Remove the training tools?',
      message: 'This deletes the folder with PyTorch and the training libraries. Trained adapters and datasets stay. You can install the tools again later.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
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
      <div className="h-full overflow-y-auto" role="status" aria-label="Loading training">
        <div className="max-w-4xl space-y-4 px-6 py-6 lg:px-8">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl space-y-4 px-6 py-6 lg:px-8">
        {error && (
          <Notice
            tone="error"
            action={(
              <span className="flex items-center gap-1">
                {!readiness ? <Button variant="ghost" size="xs" onClick={loadData}>Try again</Button> : null}
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="flex h-6 w-6 items-center justify-center rounded-md outline-none hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-accent/40">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          >
            {error}
          </Notice>
        )}

        {installing && installProgress && (
          <div className="rounded-xl border border-line px-4 py-3">
            <StatusLine tone="progress" text={installProgress.message || 'Installing…'} percent={installProgress.percent || 0} />
          </div>
        )}

        <ReadinessBanner
          readiness={readiness}
          onInstall={handleInstall}
          installing={installing}
          onRemove={handleRemove}
        />

        {readiness ? (
          <GuidedTraining
            readiness={readiness}
            jobs={jobs}
            onInstall={handleInstall}
            installing={installing}
            onStop={handleStopJob}
            onJobsChanged={loadData}
          />
        ) : null}

        {/* Any model and any dataset, with every setting — only when the environment is ready */}
        {readiness?.canTrain && (
          <details className="group rounded-2xl border border-line bg-surface" data-advanced-training>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-5 py-3.5 text-[13px] font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-90" />
              Advanced: train any model on any dataset, with every setting
            </summary>
            <div className="border-t border-line">
              <NewJobForm
                readiness={readiness}
                onSubmit={handleStartJob}
                submitting={submitting}
              />
            </div>
          </details>
        )}

        {jobs.length > 0 && (
          <section className="pt-2">
            <h2 className="mb-2 text-[13px] font-semibold text-fg">
              Training jobs <span className="font-normal text-fg-subtle">{jobs.length}</span>
            </h2>
            <div className="space-y-2">
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  onStop={handleStopJob}
                  onDelete={handleDeleteJob}
                />
              ))}
            </div>
          </section>
        )}

        {jobs.length === 0 && readiness?.canTrain && (
          <div className="py-6 text-center">
            <p className="text-[13px] font-medium text-fg-muted">No training jobs yet</p>
            <p className="mt-0.5 text-[12px] text-fg-subtle">Follow the steps above, or ask the agent to start fine-tuning.</p>
          </div>
        )}
      </div>
    </div>
  );
};

TrainingPage.propTypes = { refreshKey: PropTypes.number };

export default TrainingPage;
