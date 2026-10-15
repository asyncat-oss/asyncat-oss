// Models → Training as four steps: pick data (chat answers you marked good,
// notes, project files), see what fits the GPU and roughly how long it
// takes, train, then use the adapter in llama.cpp and compare answers
// with it off and on.

import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeft, ArrowRight, Check, Cpu, Database, Download, FileText, GitCompare, Layers, Loader2, MessageSquare, Play, Square, Trash2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Checkbox from '../components/ui/Checkbox.jsx';
import { CONTROL_CLASS, Field, Input } from '../components/ui/Field.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import Switch from '../components/ui/Switch.jsx';
import { Badge, Panel } from '../Models/modelPageShared.jsx';
import { formatBytes } from '../Models/engineProgress.js';
import { llamaServerApi, localModelsApi } from '../Settings/settingApi.js';
import guideApi from './guideApi.js';

const STEPS = [
  { id: 1, label: 'Data' },
  { id: 2, label: 'Model' },
  { id: 3, label: 'Train' },
  { id: 4, label: 'Use it' },
];
const SAVED_KEY = 'asyncat_training_guide';

const JOB_STATUS = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const FIT = {
  ok: { label: 'Fits', color: 'green' },
  tight: { label: 'Tight fit', color: 'amber' },
  no: { label: 'Too big for this GPU', color: 'red' },
  cpu: { label: 'No usable GPU: hours', color: 'amber' },
};

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || 'null') || {}; } catch { return {}; }
}

function minutesText([low, high]) {
  if (high >= 120) return `about ${Math.round(low / 60)}–${Math.round(high / 60)} hours`;
  return `about ${low}–${high} minutes`;
}

function Stepper({ step, reached, onPick }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Steps">
      {STEPS.map((item, index) => {
        const current = item.id === step;
        const done = item.id < step;
        const clickable = item.id <= reached && !current;
        return (
          <li key={item.id} className="flex items-center gap-1.5">
            {index ? <span className="h-px w-4 bg-line" aria-hidden /> : null}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onPick(item.id)}
              aria-current={current ? 'step' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${current ? 'bg-selected text-fg' : done ? 'text-fg-muted hover:bg-hover hover:text-fg' : 'text-fg-subtle'} disabled:cursor-default`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[11px] tabular-nums ${current ? 'bg-fg text-canvas' : done ? 'bg-accent text-canvas' : 'bg-hover text-fg-muted'}`}>{done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : item.id}</span>
              {item.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

Stepper.propTypes = { step: PropTypes.number.isRequired, reached: PropTypes.number.isRequired, onPick: PropTypes.func.isRequired };

// One row in the list of what to learn from: the label around the checkbox
// names it, so a click anywhere on the row ticks it.
function Choice({ checked, onChange, disabled = false, icon: Icon, title, hint }) {
  return (
    <label className={`flex items-start gap-3 px-3.5 py-2.5 transition-colors ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:bg-hover'}`}>
      <span className="flex h-5 shrink-0 items-center"><Checkbox checked={checked} disabled={disabled} onChange={onChange} /></span>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{title}</span>
        {hint ? <span className="block text-[12px] leading-5 text-fg-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

Choice.propTypes = { checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired, disabled: PropTypes.bool, icon: PropTypes.elementType.isRequired, title: PropTypes.node.isRequired, hint: PropTypes.node };

function DataStep({ onBuilt }) {
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [choice, setChoice] = useState({ ratedChats: true, notes: false, projectIds: [] });
  const [name, setName] = useState('My style');
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    guideApi.sources().then((res) => setSources(res.sources)).catch((err) => setSources({ error: err.message }));
  }, []);

  const build = async () => {
    setBuilding(true);
    try {
      const res = await guideApi.buildDataset({
        ratedChats: choice.ratedChats && sources.ratedAnswers > 0,
        notes: choice.notes && sources.notes > 0,
        projectIds: choice.projectIds,
        name,
      });
      onBuilt({ ...res.dataset, name: name.trim() || 'My style' });
    } catch (err) {
      toast.error("Couldn't build the training data", { detail: errorDetail(err) });
    } finally {
      setBuilding(false);
    }
  };

  if (!sources) return <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Looking at your data…</p>;
  if (sources.error) return <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{sources.error}</p>;
  // Only a source with something in it counts as picked (rated answers start
  // ticked, but not when there are none).
  const projectFiles = new Map(sources.projects.map((project) => [project.id, project.files]));
  const picked = (choice.ratedChats && sources.ratedAnswers > 0)
    || (choice.notes && sources.notes > 0)
    || choice.projectIds.some((id) => projectFiles.get(id) > 0);
  const toggleProject = (id, on) => setChoice((current) => ({ ...current, projectIds: on ? [...current.projectIds, id] : current.projectIds.filter((item) => item !== id) }));

  return (
    <div className="space-y-4" data-guide-step="data">
      <p className="text-[13px] leading-5 text-fg-muted">Pick what the model should learn from. It learns how answers should sound and look; for facts, a project&apos;s knowledge files work better.</p>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        <Choice
          checked={choice.ratedChats && sources.ratedAnswers > 0}
          disabled={!sources.ratedAnswers}
          onChange={(value) => setChoice((current) => ({ ...current, ratedChats: value }))}
          icon={MessageSquare}
          title={`Chat answers you marked good (${sources.ratedAnswers})`}
          hint={sources.ratedAnswers ? `From ${sources.ratedChats} chat${sources.ratedChats === 1 ? '' : 's'}, each with the conversation before it.` : 'None yet. Mark a good answer with the thumbs up under it in a chat.'}
        />
        <Choice
          checked={choice.notes && sources.notes > 0}
          disabled={!sources.notes}
          onChange={(value) => setChoice((current) => ({ ...current, notes: value }))}
          icon={FileText}
          title={`Notes (${sources.notes})`}
          hint="As plain text, to pick up how you write."
        />
        {sources.projects.map((project) => (
          <Choice
            key={project.id}
            checked={choice.projectIds.includes(project.id)}
            disabled={!project.files}
            onChange={(value) => toggleProject(project.id, value)}
            icon={Database}
            title={`Files in ${project.name}`}
            hint={project.files ? `${project.files} text or Markdown file${project.files === 1 ? '' : 's'}, ${formatBytes(project.bytes)}.` : 'No text or Markdown files in its folders.'}
          />
        ))}
      </div>
      <Field label="Name" htmlFor="guide-name" hint="What this teaches, for the adapter's name.">
        <Input id="guide-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" icon={ArrowRight} loading={building} disabled={!picked} onClick={build}>Build training data</Button>
      </div>
    </div>
  );
}

DataStep.propTypes = { onBuilt: PropTypes.func.isRequired };

function DatasetSummary({ dataset }) {
  return (
    <div className="rounded-xl bg-hover/50 px-3.5 py-3 text-[12px] leading-5 text-fg-muted" data-guide-dataset>
      <p className="text-[13px] font-medium text-fg">{dataset.examples} examples, about {dataset.tokens < 1000 ? dataset.tokens : `${Math.round(dataset.tokens / 1000)}k`} tokens</p>
      <p>{[dataset.bySource.chats && `${dataset.bySource.chats} from chats`, dataset.bySource.notes && `${dataset.bySource.notes} from notes`, dataset.bySource.files && `${dataset.bySource.files} from files`].filter(Boolean).join(' · ')}</p>
      {dataset.examples < 30 ? <p className="mt-1 text-amber-700 dark:text-amber-400">That&apos;s very little: expect a small change. A few hundred examples teach much more.</p> : null}
      {dataset.preview?.length ? (
        <ul className="mt-2 space-y-1.5">
          {dataset.preview.map((item, index) => (
            <li key={index} className="rounded-lg bg-canvas px-2.5 py-1.5">
              {item.kind === 'chat' ? <><span className="text-fg">Q:</span> {item.question}<br /><span className="text-fg">A:</span> {item.answer}</> : <span className="whitespace-pre-line">{item.text}</span>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

DatasetSummary.propTypes = { dataset: PropTypes.object.isRequired };

function ModelStep({ dataset, modelId, onPick, onNext, plan }) {
  if (!plan) return <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Checking this computer…</p>;
  if (plan.error) return <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{plan.error}</p>;
  const { readiness } = plan;
  const gpu = readiness.gpu;
  return (
    <div className="space-y-4" data-guide-step="model">
      <DatasetSummary dataset={dataset} />
      <p className="flex items-start gap-2 text-[13px] leading-5 text-fg-muted">
        <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
        {gpu?.driverIssue
          ? <span>{gpu.name} is installed, but its driver isn&apos;t answering (<code className="font-mono">nvidia-smi</code> fails), so training would run on the processor and take hours. Restarting the computer usually fixes it.</span>
          : readiness.backend === 'cuda' && gpu
          ? <span>Your GPU: {gpu.name}{gpu.vramGb ? `, ${gpu.vramGb} GB` : ''}.</span>
          : readiness.backend === 'mlx'
            ? <span>On a Mac these steps can&apos;t load the result into llama.cpp yet. The Advanced form below trains with MLX.</span>
            : <span>No NVIDIA GPU is available, so training would run on the processor and take hours. If this computer has an NVIDIA GPU, check that its driver works (<code className="font-mono">nvidia-smi</code> in a terminal), then come back.</span>}
      </p>
      <RadioGroup
        label="Model"
        value={modelId}
        onChange={onPick}
        options={plan.models.map((model) => {
          const fit = FIT[model.plan.fit] || FIT.cpu;
          return {
            value: model.id,
            label: model.label,
            aside: (
              <span className="inline-flex flex-wrap gap-1.5">
                <Badge color={fit.color}>{fit.label}</Badge>
                {plan.recommended === model.id ? <Badge color="blue">Suggested</Badge> : null}
              </span>
            ),
            description: (
              <>
                <span className="block">{model.note} Needs about {model.plan.vramNeedGb} GB of GPU memory.</span>
                <span className="block">Training: {minutesText(model.plan.minutes)}, {model.plan.epochs} pass{model.plan.epochs === 1 ? '' : 'es'} over your data.</span>
                <span className="block text-fg-subtle">
                  {model.plan.downloads.length ? `Downloads first: ${model.plan.downloads.map((item) => `${item.what} ${formatBytes(item.bytes)}`).join(' · ')}` : 'Nothing to download.'}
                </span>
              </>
            ),
          };
        })}
      />
      <p className="text-[12px] text-fg-subtle">Times are rough guesses from the data size and the GPU; the first run also spends a few minutes loading.</p>
      <div className="flex justify-end">
        <Button variant="primary" icon={ArrowRight} disabled={!modelId || readiness.backend === 'mlx'} onClick={onNext}>Next</Button>
      </div>
    </div>
  );
}

ModelStep.propTypes = { dataset: PropTypes.object.isRequired, modelId: PropTypes.string, onPick: PropTypes.func.isRequired, onNext: PropTypes.func.isRequired, plan: PropTypes.object };

function useGgufDownload(model, onDone) {
  const toast = useToast();
  const [download, setDownload] = useState(null);
  const start = async () => {
    try {
      const res = await localModelsApi.startDownload(model.gguf.url, model.gguf.file);
      setDownload({ status: 'downloading', progress: 0 });
      localModelsApi.streamDownloadProgress(
        res.downloadId,
        (data) => setDownload(data),
        (data) => {
          setDownload(data);
          if (data.status === 'complete') onDone?.();
          else if (data.status === 'error') toast.error("The download didn't finish", { detail: data.error });
        },
        (err) => toast.error("The download didn't finish", { detail: errorDetail(err) }),
      );
    } catch (err) {
      toast.error("Couldn't start the download", { detail: errorDetail(err) });
    }
  };
  return { download, start };
}

function GgufRow({ model, onDownloaded }) {
  const { download, start } = useGgufDownload(model, onDownloaded);
  if (model.gguf.path || download?.status === 'complete') {
    return <p className="flex items-center gap-2 text-[12px] text-fg-muted"><Check className="h-3.5 w-3.5 text-emerald-500" /> {model.gguf.file} is downloaded, for chats.</p>;
  }
  const busy = download && download.status !== 'error' && download.status !== 'cancelled';
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] text-fg-muted" data-guide-gguf>
      <span>The chat model, {model.gguf.file} ({formatBytes(model.gguf.bytes)}), can download while training runs.</span>
      {busy ? (
        <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {Math.round(download.progress || 0)}%</span>
      ) : (
        <Button size="sm" icon={Download} onClick={start}>Download {formatBytes(model.gguf.bytes)}</Button>
      )}
    </div>
  );
}

GgufRow.propTypes = { model: PropTypes.object.isRequired, onDownloaded: PropTypes.func };

function TrainStep({ dataset, model, readiness, onInstall, installing, job, onStarted, onStop, onDownloaded }) {
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const trainDownloads = model.plan.downloads.filter((item) => !/GGUF/.test(item.what) && !/Training tools/.test(item.what));
  const start = async () => {
    setStarting(true);
    try {
      const res = await guideApi.train({ modelId: model.id, datasetPath: dataset.path, name: dataset.name || undefined });
      onStarted(res.job);
    } catch (err) {
      toast.error("Couldn't start training", { detail: errorDetail(err) });
    } finally {
      setStarting(false);
    }
  };

  const running = job && (job.status === 'running' || job.status === 'queued');
  return (
    <div className="space-y-4" data-guide-step="train">
      {!readiness.envReady ? (
        <div className="rounded-xl border border-line px-3.5 py-3">
          <p className="text-[13px] font-medium text-fg">First, the training tools</p>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">PyTorch and the libraries that train adapters, in a folder of their own: about {formatBytes(model.plan.downloads.find((item) => /Training tools/.test(item.what))?.bytes || 3_500_000_000)} to download and {readiness.disk?.estimatedVenvSizeGb || 8} GB on disk.</p>
          <Button className="mt-2" size="sm" icon={Download} loading={installing} onClick={onInstall} disabled={!readiness.canInstall}>{installing ? 'Installing…' : 'Install the training tools'}</Button>
        </div>
      ) : null}
      {job ? (
        <div className="rounded-xl border border-line px-3.5 py-3" data-guide-job={job.status}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-fg">{job.name}</p>
            <Badge color={job.status === 'completed' ? 'green' : job.status === 'failed' ? 'red' : 'blue'}>{JOB_STATUS[job.status] || job.status}</Badge>
          </div>
          {running ? (
            <>
              <Progress className="mt-2" value={job.progress?.percent || 0} label="Training progress" />
              <p className="mt-1 text-[12px] text-fg-muted">{job.progress?.message || (job.progress?.totalSteps ? `Step ${job.progress.step} of ${job.progress.totalSteps}${job.progress.loss != null ? ` · loss ${Number(job.progress.loss).toFixed(3)}` : ''}` : 'Starting… the first run downloads and loads the model.')}</p>
              <Button className="mt-2" size="sm" variant="ghost" icon={Square} onClick={() => onStop(job.id)}>Stop</Button>
            </>
          ) : null}
          {job.status === 'failed' ? <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{job.error || 'Training stopped on an error.'}</p> : null}
        </div>
      ) : (
        <div className="rounded-xl border border-line px-3.5 py-3">
          <p className="text-[13px] font-medium text-fg">Train {model.label} on {dataset.examples} examples</p>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">{minutesText(model.plan.minutes)}. You can leave this page; it keeps going.{trainDownloads.length ? ` It first downloads ${trainDownloads.map((item) => `${item.what} (${formatBytes(item.bytes)})`).join(' and ')}.` : ''}</p>
          <Button className="mt-2" variant="primary" icon={Play} loading={starting} disabled={!readiness.envReady} onClick={start}>
            {trainDownloads.length ? `Download ${formatBytes(trainDownloads.reduce((sum, item) => sum + item.bytes, 0))} and train` : 'Start training'}
          </Button>
        </div>
      )}
      <GgufRow model={model} onDownloaded={onDownloaded} />
    </div>
  );
}

TrainStep.propTypes = {
  dataset: PropTypes.object.isRequired,
  model: PropTypes.object.isRequired,
  readiness: PropTypes.object.isRequired,
  onInstall: PropTypes.func.isRequired,
  installing: PropTypes.bool,
  job: PropTypes.object,
  onStarted: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  onDownloaded: PropTypes.func,
};

export function AdapterCard({ adapter, onChanged, defaultPrompt = '' }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      await guideApi.setActive(adapter.id, true);
      await llamaServerApi.start(adapter.ggufPath || adapter.baseGguf);
      for (let i = 0; i < 120; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await llamaServerApi.getStatus();
        if (status.status === 'ready' || status.status === 'error') {
          if (status.status === 'error') throw new Error(status.error || "The model didn't load.");
          break;
        }
      }
      onChanged();
    } catch (err) {
      toast.error(`Couldn't load ${adapter.modelLabel}`, { detail: errorDetail(err) });
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (active) => {
    try {
      await guideApi.setActive(adapter.id, active);
      onChanged();
    } catch (err) {
      toast.error("Couldn't change that", { detail: errorDetail(err) });
    }
  };

  const compare = async () => {
    setComparing(true);
    setResult(null);
    try {
      setResult(await guideApi.compare(adapter.id, prompt));
    } catch (err) {
      toast.error("Couldn't compare", { detail: errorDetail(err) });
    } finally {
      setComparing(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${adapter.name}?`, message: 'The trained adapter file is removed. The training job and its data stay.', confirmLabel: 'Delete', destructive: true }))) return;
    try {
      await guideApi.remove(adapter.id);
      onChanged();
    } catch (err) {
      toast.error("Couldn't delete it", { detail: errorDetail(err) });
    }
  };

  return (
    <div className="rounded-xl border border-line px-3.5 py-3" data-adapter={adapter.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-fg-subtle" strokeWidth={1.75} />
        <span className="text-[13px] font-medium text-fg">{adapter.name}</span>
        <span className="text-[12px] text-fg-subtle">for {adapter.modelLabel}</span>
        {adapter.loaded ? <Badge color="green">Loaded</Badge> : null}
        {adapter.loaded && !adapter.active ? <span className="text-[12px] text-fg-subtle">Off from the next time the model loads</span> : null}
        <span className="ml-auto flex items-center gap-2 text-[12px] text-fg-muted">
          Loads with its model
          <Switch checked={Boolean(adapter.active)} onChange={toggle} label={`Load ${adapter.name} with ${adapter.modelLabel}`} />
        </span>
      </div>
      {!adapter.ggufPath ? (
        <p className="mt-2 text-[12px] text-fg-muted">Download {adapter.baseGguf} (step 3) to use it.</p>
      ) : !adapter.loaded ? (
        <Button className="mt-2" size="sm" icon={Play} loading={loading} onClick={load}>{loading ? 'Loading…' : `Load ${adapter.modelLabel} with it`}</Button>
      ) : (
        <div className="mt-3 space-y-2">
          <Field label="Ask both" htmlFor={`compare-${adapter.id}`} hint="The same question, answered without the adapter and with it.">
            <textarea id={`compare-${adapter.id}`} rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} className={`${CONTROL_CLASS} block py-2`} />
          </Field>
          <Button size="sm" icon={GitCompare} loading={comparing} disabled={!prompt.trim()} onClick={compare}>Compare</Button>
          {result ? (
            <div className="grid gap-2 sm:grid-cols-2" data-compare>
              {[['Without the adapter', result.before], ['With the adapter', result.after]].map(([title, text]) => (
                <div key={title} className="rounded-lg bg-hover/50 px-3 py-2">
                  <p className="mb-1 text-[12px] font-medium text-fg-subtle">{title}</p>
                  <p className="whitespace-pre-wrap text-[13px] leading-5 text-fg">{text || '(no answer)'}</p>
                </div>
              ))}
              {result.same ? <p className="text-[12px] text-fg-muted sm:col-span-2">Both answers are the same. More examples or another pass may help; an older llama.cpp also ignores per-request adapter settings (update it in Models → Local models).</p> : null}
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" icon={Trash2} onClick={remove} disabled={adapter.loaded}>Delete</Button>
      </div>
    </div>
  );
}

AdapterCard.propTypes = { adapter: PropTypes.object.isRequired, onChanged: PropTypes.func.isRequired, defaultPrompt: PropTypes.string };

function UseStep({ job, adapters, onChanged, defaultPrompt }) {
  const toast = useToast();
  const [making, setMaking] = useState(false);
  const made = adapters.find((adapter) => adapter.jobId === job.id);
  const make = async () => {
    setMaking(true);
    try {
      await guideApi.makeAdapter(job.id, job.name);
      onChanged();
    } catch (err) {
      toast.error("Couldn't make the adapter", { detail: errorDetail(err) });
    } finally {
      setMaking(false);
    }
  };
  return (
    <div className="space-y-3" data-guide-step="use">
      {made ? (
        <AdapterCard adapter={made} onChanged={onChanged} defaultPrompt={defaultPrompt} />
      ) : (
        <div className="rounded-xl border border-line px-3.5 py-3">
          <p className="text-[13px] font-medium text-fg">Training finished</p>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">Turn the result into an adapter llama.cpp can load. It stays small and sits on top of the model, so the model itself is unchanged.</p>
          <Button className="mt-2" variant="primary" icon={Layers} loading={making} onClick={make}>Make the adapter</Button>
        </div>
      )}
    </div>
  );
}

UseStep.propTypes = { job: PropTypes.object.isRequired, adapters: PropTypes.array.isRequired, onChanged: PropTypes.func.isRequired, defaultPrompt: PropTypes.string };

export default function GuidedTraining({ readiness, jobs, onInstall, installing, onStop, onJobsChanged }) {
  const saved = useMemo(loadSaved, []);
  const [step, setStep] = useState(saved.step || 1);
  const [reached, setReached] = useState(saved.reached || 1);
  const [dataset, setDataset] = useState(saved.dataset || null);
  const [modelId, setModelId] = useState(saved.modelId || null);
  const [jobId, setJobId] = useState(saved.jobId || null);
  const [plan, setPlan] = useState(null);
  const [adapters, setAdapters] = useState([]);

  useEffect(() => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify({ step, reached, dataset, modelId, jobId })); } catch { /* storage may be unavailable */ }
  }, [step, reached, dataset, modelId, jobId]);

  const loadAdapters = useCallback(() => {
    guideApi.adapters().then((res) => setAdapters(res.adapters || [])).catch(() => {});
  }, []);
  useEffect(() => { loadAdapters(); }, [loadAdapters]);

  const loadPlan = useCallback(() => {
    if (!dataset) return;
    guideApi.plan(dataset)
      .then((res) => {
        setPlan(res);
        setModelId((current) => current || res.recommended);
      })
      .catch((err) => setPlan({ error: err.message }));
  }, [dataset]);
  useEffect(() => { if (step >= 2) loadPlan(); }, [loadPlan, step, readiness?.envReady]);

  const go = useCallback((next) => {
    setStep(next);
    setReached((current) => Math.max(current, next));
  }, []);

  const job = jobs.find((item) => item.id === jobId) || null;
  // When training finishes, move on to using it.
  useEffect(() => {
    if (job?.status === 'completed' && step === 3) go(4);
  }, [go, job?.status, step]);

  const model = plan?.models?.find((item) => item.id === modelId) || null;
  const startOver = () => {
    setDataset(null);
    setJobId(null);
    setPlan(null);
    setStep(1);
    setReached(1);
  };
  const defaultPrompt = dataset?.preview?.find((item) => item.kind === 'chat')?.question?.replace(/…$/, '') || '';

  return (
    <Panel className="p-5" data-guided-training>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Teach a model your style</h2>
          <p className="mt-0.5 max-w-2xl text-[12px] leading-5 text-fg-muted">A small local model learns from your rated answers, notes and files, and an adapter carries what it learned into your chats. Works on NVIDIA GPUs with 6 GB or more for models up to about 3B. Labs: new, and only tried with stand-ins so far.</p>
        </div>
        {reached > 1 ? <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={startOver}>Start over</Button> : null}
      </div>
      <div className="mb-5"><Stepper step={step} reached={reached} onPick={setStep} /></div>

      {step === 1 ? <DataStep onBuilt={(built) => { setDataset(built); setPlan(null); setJobId(null); go(2); }} /> : null}
      {step === 2 && dataset ? <ModelStep dataset={dataset} plan={plan} modelId={modelId} onPick={setModelId} onNext={() => go(3)} /> : null}
      {step === 3 && dataset && model ? (
        <TrainStep
          dataset={dataset}
          model={model}
          readiness={readiness}
          onInstall={onInstall}
          installing={installing}
          job={job}
          onStarted={(started) => { setJobId(started.id); onJobsChanged(); }}
          onStop={onStop}
          onDownloaded={loadPlan}
        />
      ) : null}
      {step === 3 && dataset && !model ? <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p> : null}
      {step === 4 && job ? <UseStep job={job} adapters={adapters} onChanged={loadAdapters} defaultPrompt={defaultPrompt} /> : null}
      {step === 4 && !job ? <p className="text-[13px] text-fg-muted">That training job is gone. <button type="button" className="text-accent hover:underline" onClick={startOver}>Start over</button></p> : null}

      {adapters.filter((adapter) => adapter.jobId !== jobId || step !== 4).length ? (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 text-[13px] font-semibold text-fg">Your adapters</h3>
          <div className="space-y-2">
            {adapters.filter((adapter) => adapter.jobId !== jobId || step !== 4).map((adapter) => (
              <AdapterCard key={adapter.id} adapter={adapter} onChanged={loadAdapters} />
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

GuidedTraining.propTypes = {
  readiness: PropTypes.object.isRequired,
  jobs: PropTypes.array.isRequired,
  onInstall: PropTypes.func.isRequired,
  installing: PropTypes.bool,
  onStop: PropTypes.func.isRequired,
  onJobsChanged: PropTypes.func.isRequired,
};
