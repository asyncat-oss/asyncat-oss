// First-run setup, "Run a model on this computer": one or two models that
// suit this computer with their sizes, a Download button that says how much
// it fetches, then the download (Cancel, and the setup carries on meanwhile)
// and whether the model is ready.

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Download, RotateCw } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import StatusLine from '../components/ui/StatusLine.jsx';
import { DownloadLine } from '../components/ui/Progress.jsx';
import { formatBytes } from '../components/ui/progressFormat.js';
import { FIT_TEXT, chatModelName, downloadBytes, downloadLabel, hardwareText, localSetupState } from './setupFlow.js';

function Downloading({ job, onCancel }) {
  const steps = job.steps.filter((step) => step.status !== 'skipped');
  return (
    <div className="space-y-3" data-local-downloading>
      {steps.map((step) => {
        const done = step.status === 'done';
        const known = Number.isFinite(step.downloaded) && step.downloaded > 0;
        let detail;
        if (done) detail = 'Done';
        else if (step.status === 'waiting') detail = step.total ? `Next · ${formatBytes(step.total)}` : 'Next';
        else if (!known && step.detail) detail = step.detail;
        return (
          <DownloadLine
            key={step.key}
            label={step.label}
            bytes={done ? step.total ?? undefined : step.downloaded ?? undefined}
            total={step.total ?? undefined}
            percent={done ? 100 : step.progress}
            detail={detail}
            onCancel={step.status === 'running' ? onCancel : undefined}
          />
        );
      })}
      <Notice>You can carry on with the setup while it downloads.</Notice>
    </div>
  );
}

Downloading.propTypes = { job: PropTypes.object.isRequired, onCancel: PropTypes.func.isRequired };

export default function LocalModelChoice({ local, brain }) {
  const { plan, job, loading, loaded, error } = local;
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!loaded && !loading) local.load();
    // Asked once, when this choice is first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A download already under way shows straight away, before what den offers is in.
  if (!plan && job?.status === 'running') return <Downloading job={job} onCancel={local.cancel} />;
  if (!plan) {
    if (error) {
      return (
        <Notice tone="error" action={<Button size="xs" variant="ghost" icon={RotateCw} onClick={local.load}>Try again</Button>}>
          {error}
        </Notice>
      );
    }
    return (
      <div className="space-y-2" role="status" aria-label="Checking this computer">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-[116px]" />
      </div>
    );
  }

  const modelId = picked || plan.models.find((model) => model.recommended)?.id || plan.models[0]?.id;
  const state = localSetupState(job, brain);
  const jobModel = plan.models.find((model) => model.id === job?.options?.modelId);
  const jobLabel = jobModel?.label || job?.steps?.find((step) => step.key === 'model')?.label || 'The model';
  const bytes = downloadBytes(plan, modelId);
  const engine = plan.engine || {};
  const hardware = hardwareText(plan.hardware);

  if (state === 'running') return <Downloading job={job} onCancel={local.cancel} />;
  if (state === 'loading') return <StatusLine tone="progress" text={`Loading ${jobLabel}…`} detail="It's downloaded" />;
  if (state === 'ready') return <StatusLine tone="ok" text={`${jobLabel} is ready`} detail="Runs on this computer" />;
  if (state === 'kept') {
    return (
      <StatusLine
        tone="ok"
        text={`${jobLabel} is downloaded`}
        detail={chatModelName(brain) ? `Chats still use ${chatModelName(brain)}; switch in Models.` : 'Load it in Models.'}
      />
    );
  }

  let failure = '';
  if (state === 'error') failure = job?.error || job?.result?.error || "The model didn't load. Try another one, or look in Models.";
  return (
    <div className="space-y-4" data-local-choice>
      {hardware ? <p className="text-[12px] text-fg-subtle">This computer: {hardware}</p> : null}
      <RadioGroup
        value={modelId}
        onChange={setPicked}
        label="Model to download"
        options={plan.models.map((model) => ({
          value: model.id,
          label: model.label,
          aside: model.recommended ? 'Recommended' : null,
          meta: model.installed ? 'Downloaded' : formatBytes(model.bytes),
          description: `${model.note} ${FIT_TEXT[model.fit] || ''}`.trim(),
        }))}
      />
      {!engine.installed && engine.error ? (
        <Notice tone="warning" action={<Button size="xs" variant="ghost" icon={RotateCw} loading={loading} onClick={local.load}>Try again</Button>}>
          {engine.error}
        </Notice>
      ) : !engine.installed ? (
        <Notice>Also downloads llama.cpp, the engine that runs it{engine.bytes ? ` (${formatBytes(engine.bytes)})` : ''}.</Notice>
      ) : null}
      {failure || error ? <Notice tone="error">{failure || error}</Notice> : null}
      <Button
        variant="secondary"
        size="md"
        icon={bytes > 0 ? Download : null}
        disabled={!modelId || (!engine.installed && Boolean(engine.error))}
        onClick={() => local.start(modelId)}
      >
        {downloadLabel(bytes)}
      </Button>
    </div>
  );
}

LocalModelChoice.propTypes = {
  local: PropTypes.shape({
    plan: PropTypes.object,
    job: PropTypes.object,
    loading: PropTypes.bool,
    loaded: PropTypes.bool,
    error: PropTypes.string,
    load: PropTypes.func.isRequired,
    start: PropTypes.func.isRequired,
    cancel: PropTypes.func.isRequired,
  }).isRequired,
  brain: PropTypes.object,
};
