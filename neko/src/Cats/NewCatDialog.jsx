// "New Cat", in four short steps: who it is and its mission, what wakes it,
// its brain and space, and how much it may do alone.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Check } from 'lucide-react';
import Dialog from '../components/ui/Dialog.jsx';
import Button from '../components/ui/Button.jsx';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import { CAT_TEMPLATES } from './catFormat.js';
import { BrainSection, FreedomSection, IdentitySection, SpaceSection, WakesSection } from './CatForm.jsx';
import { formFromCat, payloadFromForm, useCatFormOptions } from './catFormState.js';

const STEPS = [
  { key: 'mission', title: 'Mission', description: 'Give it a name, a picture and something to look after.' },
  { key: 'wakes', title: 'Wakes up', description: 'What starts it: a time, or something it watches for.' },
  { key: 'brain', title: 'Brain & space', description: 'Which of your agents it thinks with, and where it works.' },
  { key: 'freedom', title: 'Freedom', description: 'How much it may do before asking you, and its daily limits.' },
];

export default function NewCatDialog({ onClose, onCreated, template = null }) {
  const options = useCatFormOptions();
  const [form, setForm] = useState(() => formFromCat(null, template));
  const [step, setStep] = useState(0);
  const [scheduleError, setScheduleError] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const problem = () => {
    if (step === 0 && !form.mission.trim()) return 'Write its mission.';
    if (step === 1 && scheduleError) return scheduleError;
    if (step === 1) {
      const empty = form.triggers.find((trigger) => (trigger.kind === 'rss' || trigger.kind === 'webpage') && !String(trigger.config?.url || '').trim());
      if (empty) return 'Give the address of the feed or page to watch.';
      const noFolder = form.triggers.find((trigger) => trigger.kind === 'folder' && !String(trigger.config?.path || '').trim());
      if (noFolder) return 'Choose the folder to watch.';
    }
    if (step === 2 && form.folderMode === 'custom' && !form.folder.trim()) return 'Choose the folder it works in.';
    return null;
  };

  const next = async () => {
    const issue = problem();
    if (issue) {
      setError(issue);
      return;
    }
    setError('');
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    try {
      const result = await catsApi.create(payloadFromForm(form));
      onCreated(result.cat);
    } catch (err) {
      setError(err.message || "Couldn't make the Cat.");
      setSaving(false);
    }
  };

  const current = STEPS[step];
  return (
    <Dialog
      as="form"
      onSubmit={(event) => { event.preventDefault(); next(); }}
      size="lg"
      title="New Cat"
      description="A Cat works on its own: it wakes up when something happens, does its mission, and reports to your inbox."
      onClose={() => !saving && onClose()}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          <ol className="hidden items-center gap-1.5 sm:flex" aria-label="Steps">
            {STEPS.map((item, index) => (
              <li key={item.key} className={`flex items-center gap-1 text-[12px] ${index === step ? 'font-medium text-fg' : index < step ? 'text-fg-muted' : 'text-fg-subtle'}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${index < step ? 'bg-accent text-white dark:text-gray-950' : index === step ? 'bg-fg text-canvas' : 'bg-hover'}`}>
                  {index < step ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                {item.title}
                {index < STEPS.length - 1 ? <span className="mx-0.5 text-fg-subtle">·</span> : null}
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            {step > 0 ? <Button variant="ghost" onClick={() => { setError(''); setStep(step - 1); }} disabled={saving}>Back</Button> : <Button variant="ghost" onClick={onClose}>Cancel</Button>}
            <Button variant="primary" type="submit" loading={saving}>{step < STEPS.length - 1 ? 'Next' : 'Make the Cat'}</Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <p className="text-[14px] font-semibold text-fg">{current.title}</p>
          <p className="text-[12px] text-fg-muted">{current.description}</p>
        </div>

        {step === 0 && !template && !form.mission ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Start from an example">
            {CAT_TEMPLATES.map((example) => (
              <button
                key={example.name}
                type="button"
                onClick={() => setForm(formFromCat(null, example))}
                className="rounded-full border border-line px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              >
                {example.avatar} {example.title}
              </button>
            ))}
          </div>
        ) : null}

        {step === 0 ? <IdentitySection form={form} set={set} autoFocus /> : null}
        {step === 1 ? <WakesSection form={form} set={set} onError={setScheduleError} /> : null}
        {step === 2 ? (
          <div className="space-y-6">
            <BrainSection form={form} set={set} options={options} />
            <SpaceSection form={form} set={set} />
          </div>
        ) : null}
        {step === 3 ? <FreedomSection form={form} set={set} options={options} /> : null}

        {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}
      </div>
    </Dialog>
  );
}

NewCatDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
  template: PropTypes.object,
};
