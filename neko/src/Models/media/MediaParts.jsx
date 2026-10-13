// Small pieces shared by "Set up voice" and "Set up images": the setup
// progress list, the plan with sizes, an API key field, and the Advanced
// disclosure that holds the older, manual controls.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Check, ChevronDown, ChevronRight, CircleAlert, KeyRound, Loader2, Minus, X } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { configApi } from '../../Settings/settingApi.js';
import { STEP_STATUS, jobPercent, stepProgressText, stepSizeText } from './mediaFormat.js';

function StepIcon({ status }) {
  if (status === 'done' || status === 'skipped') return <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />;
  if (status === 'error') return <CircleAlert className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />;
  if (status === 'cancelled') return <X className="h-3.5 w-3.5 text-fg-subtle" />;
  return <Minus className="h-3.5 w-3.5 text-fg-subtle" />;
}

StepIcon.propTypes = { status: PropTypes.string };

/** A plan's steps with their sizes, before anything starts. */
export function PlanList({ steps }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
          <span className={`flex min-w-0 items-center gap-2 ${step.done ? 'text-fg-subtle' : 'text-fg'}`}>
            {step.done ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle" />}
            <span className="truncate">{step.label}</span>
          </span>
          <span className={`shrink-0 tabular-nums text-[12px] ${step.done ? 'text-fg-subtle' : 'text-fg-muted'}`} title={step.error || undefined}>
            {stepSizeText(step)}
          </span>
        </li>
      ))}
    </ul>
  );
}

PlanList.propTypes = { steps: PropTypes.array.isRequired };

/** A running (or finished) setup: each step, its progress, Cancel. */
export function SetupProgress({ job, onCancel = null }) {
  const percent = jobPercent(job);
  const running = job.status === 'running';
  return (
    <div className="space-y-3" data-setup-job={job.status}>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[12px] text-fg-muted">
          <span>{running ? `${job.title}…` : job.status === 'complete' ? 'Done' : job.status === 'cancelled' ? 'Cancelled' : "Didn't finish"}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-hover">
          <div className={`h-full rounded-full transition-[width] duration-300 ${job.status === 'error' ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="space-y-1.5">
        {job.steps.map((step) => (
          <li key={step.key} className="flex items-start gap-2.5 text-[13px]">
            <span className="mt-0.5"><StepIcon status={step.status} /></span>
            <span className="min-w-0 flex-1">
              <span className={step.status === 'waiting' ? 'text-fg-subtle' : 'text-fg'}>{step.label}</span>
              {step.error ? <span className="block text-[12px] text-red-600 dark:text-red-400">{step.error}</span> : null}
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">{step.status === 'waiting' ? stepSizeText(step) : stepProgressText(step) || STEP_STATUS[step.status]}</span>
          </li>
        ))}
      </ul>
      {running && onCancel ? <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button> : null}
    </div>
  );
}

SetupProgress.propTypes = { job: PropTypes.object.isRequired, onCancel: PropTypes.func };

/** Paste a cloud service's key; it is saved encrypted. */
export function KeyField({ keyName, title, onSaved }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setError('');
    try {
      await configApi.updateSecret(keyName, value.trim());
      setValue('');
      onSaved?.();
    } catch (err) {
      setError(err.message || "Couldn't save the key.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="password"
            className="pl-8"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }}
            placeholder={`Your ${title} API key`}
            autoComplete="off"
            aria-label={`${title} API key`}
          />
        </div>
        <Button onClick={save} loading={saving} disabled={!value.trim()}>Save key</Button>
      </div>
      {error ? <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{error}</p> : <p className="mt-1 text-[12px] text-fg-subtle">Saved encrypted on this computer.</p>}
    </div>
  );
}

KeyField.propTypes = { keyName: PropTypes.string.isRequired, title: PropTypes.string.isRequired, onSaved: PropTypes.func };

/** The manual, older controls, folded away. */
export function Advanced({ title = 'Advanced', hint = null, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <section className="rounded-2xl border border-line">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Icon className="h-4 w-4 text-fg-subtle" />
        <span className="text-[13px] font-medium text-fg">{title}</span>
        {hint ? <span className="truncate text-[12px] text-fg-subtle">{hint}</span> : null}
      </button>
      {open ? <div className="space-y-6 border-t border-line p-4">{children}</div> : null}
    </section>
  );
}

Advanced.propTypes = { title: PropTypes.string, hint: PropTypes.string, children: PropTypes.node, defaultOpen: PropTypes.bool };
