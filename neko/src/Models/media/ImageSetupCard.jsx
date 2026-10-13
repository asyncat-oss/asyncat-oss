// Models → Images: "Set up images". On this computer (stable-diffusion.cpp
// and a model that suits the graphics card, sizes first, one OK) or with a
// cloud service and the user's key. ComfyUI stays in Advanced. Once set up
// it shows what is used and makes a test picture.

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Download, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import { Segmented } from '../../components/ui/Tabs.jsx';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { formatBytes } from '../engineProgress.js';
import { mediaApi, mediaUrl } from './mediaApi.js';
import { FIT, gpuLine, totalText } from './mediaFormat.js';
import { KeyField, PlanList, SetupProgress } from './MediaParts.jsx';
import { useMediaSetup } from './useMediaSetup.js';

const CLOUD_ORDER = ['openai', 'gemini', 'stability', 'fal'];
const TONE = {
  green: 'text-emerald-700 dark:text-emerald-400',
  amber: 'text-amber-700 dark:text-amber-400',
  red: 'text-red-700 dark:text-red-400',
  muted: 'text-fg-subtle',
};

function TryPicture({ onMade }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState('A small cat asleep on a sunny windowsill');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(null);
  const make = async () => {
    setBusy(true);
    try {
      const res = await mediaApi.images.tryIt(prompt);
      setImage(res.image);
      onMade?.();
    } catch (err) {
      toast.error("Couldn't make the picture", { detail: errorDetail(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') make(); }} aria-label="Describe a picture" />
        <Button icon={Sparkles} loading={busy} onClick={make} disabled={!prompt.trim()}>Make it</Button>
      </div>
      {busy ? <p className="text-[12px] text-fg-subtle">The first picture takes longest while the model loads.</p> : null}
      {image?.url ? <img src={mediaUrl(image.url)} alt={image.prompt} className="max-h-72 rounded-xl border border-line" /> : null}
    </div>
  );
}

TryPicture.propTypes = { onMade: PropTypes.func };

function ReadyView({ status, onChange, onMade }) {
  const local = status.provider === 'local' || status.provider === 'comfyui';
  const what = status.provider === 'comfyui'
    ? 'ComfyUI on this computer'
    : local ? `${status.model?.name || 'ComfyUI'} · on this computer` : `${status.title} · ${status.model}`;
  return (
    <div className="space-y-4" data-images-ready>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-hover/50 px-3.5 py-2.5 text-[13px]">
        <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Pictures</span>
        <span className="text-fg">{what}</span>
        {local && status.gpu ? <span className="text-[12px] text-fg-subtle">{gpuLine(status.gpu)}</span> : null}
        <Button size="sm" variant="ghost" onClick={onChange} className="ml-auto">Change</Button>
      </div>
      <TryPicture onMade={onMade} />
      <p className="text-[12px] text-fg-subtle">Ask for a picture in any chat, or to change one: agents use this.</p>
    </div>
  );
}

ReadyView.propTypes = { status: PropTypes.object.isRequired, onChange: PropTypes.func.isRequired, onMade: PropTypes.func };

function LocalSetup({ catalog, onStarted }) {
  const toast = useToast();
  const best = catalog.models.find((model) => model.recommended && model.fit !== 'too_big') || catalog.models[0];
  const [modelId, setModelId] = useState(best?.id);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setPlanError('');
    mediaApi.images.plan(modelId)
      .then((res) => { if (!cancelled) setPlan(res.plan); })
      .catch((err) => { if (!cancelled) setPlanError(err.message || "Couldn't work out the sizes."); });
    return () => { cancelled = true; };
  }, [modelId]);

  const start = async () => {
    setStarting(true);
    try {
      const res = await mediaApi.images.setup(modelId);
      onStarted(res.job);
    } catch (err) {
      toast.error("Couldn't start the setup", { detail: errorDetail(err) });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-fg-muted">Your graphics card: <span className="text-fg">{gpuLine(catalog.gpu)}</span></p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Image model">
        {catalog.models.map((model) => {
          const fit = FIT[model.fit] || FIT.unknown;
          return (
            <label key={model.id} className={`flex cursor-pointer flex-col rounded-xl border px-3.5 py-3 ${modelId === model.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-hover'}`} data-image-model={model.id}>
              <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <input type="radio" name="image-model" className="h-4 w-4 accent-[var(--as-accent)]" checked={modelId === model.id} onChange={() => setModelId(model.id)} />
                {model.title}
                <span className="ml-auto text-[12px] font-normal text-fg-subtle">{model.installed ? 'On this computer' : formatBytes(model.bytes)}</span>
              </span>
              <span className="mt-1 text-[12px] leading-5 text-fg-muted">{model.note}</span>
              <span className={`mt-1 text-[12px] ${TONE[fit.tone]}`}>{fit.label}</span>
            </label>
          );
        })}
      </div>
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-fg-muted">What it downloads</p>
        {plan ? <PlanList steps={plan.steps} /> : planError ? <p className="text-[13px] text-red-600 dark:text-red-400">{planError}</p> : (
          <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking sizes…</p>
        )}
        <p className="text-[12px] text-fg-subtle">Nothing downloads until you click the button. You can cancel at any time.</p>
      </div>
      <Button variant="primary" icon={Download} loading={starting} disabled={!plan} onClick={start}>
        {plan?.totalBytes ? `Download ${totalText(plan.totalBytes)} and set up` : 'Set up'}
      </Button>
    </div>
  );
}

LocalSetup.propTypes = { catalog: PropTypes.object.isRequired, onStarted: PropTypes.func.isRequired };

function CloudSetup({ catalog, status, onChosen, onKeySaved }) {
  const toast = useToast();
  const [provider, setProvider] = useState(CLOUD_ORDER.includes(status?.provider) ? status.provider : 'openai');
  const service = catalog.cloud[provider];
  const [model, setModel] = useState(service.defaultModel || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setModel(catalog.cloud[provider].defaultModel || ''); }, [provider, catalog.cloud]);

  const use = async () => {
    setSaving(true);
    try {
      await mediaApi.images.choose({ provider, model });
      onChosen();
    } catch (err) {
      toast.error(`Couldn't switch to ${service.title}`, { detail: errorDetail(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Field label="Service" htmlFor="image-cloud-service">
        <Select id="image-cloud-service" value={provider} onChange={(event) => setProvider(event.target.value)}>
          {CLOUD_ORDER.map((id) => <option key={id} value={id}>{catalog.cloud[id].title}{catalog.cloud[id].edits ? '' : ' (makes pictures, no editing)'}</option>)}
        </Select>
      </Field>
      {!service.hasKey ? <KeyField keyName={service.keyName} title={service.title} onSaved={onKeySaved} /> : null}
      {service.models.length > 1 ? (
        <Field label="Model" htmlFor="image-cloud-model">
          <Select id="image-cloud-model" value={model} onChange={(event) => setModel(event.target.value)}>
            {service.models.map((item) => <option key={item.id} value={item.id}>{item.name}{item.note ? ` — ${item.note}` : ''}</option>)}
          </Select>
        </Field>
      ) : <p className="text-[13px] text-fg-muted">Model: {service.models[0]?.name}</p>}
      <p className="text-[12px] text-fg-subtle">Each picture is billed to your {service.title} account.</p>
      <Button variant="primary" loading={saving} disabled={!service.hasKey} onClick={use}>Use {service.title}</Button>
    </div>
  );
}

CloudSetup.propTypes = { catalog: PropTypes.object.isRequired, status: PropTypes.object, onChosen: PropTypes.func.isRequired, onKeySaved: PropTypes.func.isRequired };

export default function ImageSetupCard({ onPictureMade }) {
  const toast = useToast();
  const { status, catalog, job, error, loading, reload, setJob } = useMediaSetup('images');
  const [changing, setChanging] = useState(false);
  const [where, setWhere] = useState(null);
  const [watchJobId, setWatchJobId] = useState(null);
  const running = job?.status === 'running';
  const watching = job && (running || job.id === watchJobId);
  const mode = where || (status && !['local', 'comfyui'].includes(status.provider) ? 'cloud' : 'local');

  useEffect(() => {
    if (job?.id === watchJobId && job.status === 'complete') {
      toast.success('Pictures are set up');
      setWatchJobId(null);
      setChanging(false);
    }
  }, [job, watchJobId, toast]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" data-image-setup>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><ImageIcon className="h-4 w-4" /></span>
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Pictures</h2>
          <p className="text-[13px] text-fg-muted">Let Asyncat make and change pictures.</p>
        </div>
      </div>
      {error ? <p role="alert" className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}
      {loading || !status ? (
        <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</p>
      ) : watching ? (
        <div className="space-y-3">
          <SetupProgress job={job} onCancel={() => mediaApi.setup.cancel(job.id).then((res) => setJob(res.job)).catch(() => {})} />
          {!running ? <Button size="sm" onClick={() => setWatchJobId(null)}>{job.status === 'complete' ? 'Done' : 'Back'}</Button> : null}
        </div>
      ) : status.ready && !changing ? (
        <ReadyView status={status} onChange={() => setChanging(true)} onMade={onPictureMade} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={mode}
              onChange={setWhere}
              items={[{ value: 'local', label: 'On this computer' }, { value: 'cloud', label: 'With a cloud service' }]}
              label="Where pictures are made"
            />
            {status.ready ? <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>Cancel</Button> : null}
          </div>
          <p className="text-[12px] text-fg-subtle">
            {mode === 'local' ? 'Free and private, using your graphics card. Downloads the engine and a model once.' : 'Uses your account with the service; prompts and pictures you edit are sent to it.'}
          </p>
          {mode === 'local'
            ? <LocalSetup catalog={catalog} onStarted={(started) => { setWatchJobId(started.id); setJob(started); }} />
            : <CloudSetup catalog={catalog} status={status} onChosen={() => { toast.success('Pictures are set up'); setChanging(false); reload(); }} onKeySaved={reload} />}
        </div>
      )}
    </section>
  );
}

ImageSetupCard.propTypes = { onPictureMade: PropTypes.func };
