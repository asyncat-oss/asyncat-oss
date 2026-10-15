// First-run setup (/welcome): one question per step in a centred column.
// Welcome and your name, how Asyncat thinks (a model online or on this
// computer), bringing chats from ChatGPT or Claude, how careful Asyncat is,
// and done. Skip and Back always work; finishing or skipping marks it done
// (den/src/setup), and Settings → General can open it again.

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Cat from '../components/ui/Cat.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { useUser } from '../contexts/UserContext.jsx';
import { useActiveBrainStatus } from '../CommandCenter/hooks/useActiveBrainStatus.js';
import { profileApi } from '../Settings/settingApi.js';
import { ImportChats } from '../Settings/PrivacyDataParts.jsx';
import eventBus from '../utils/eventBus.js';
import ModelStep from './ModelStep.jsx';
import SafetyStep from './SafetyStep.jsx';
import { setupApi } from './setupApi.js';
import { SETUP_STEPS, doneText, localSetupState, nameToPrefill, stepIndex } from './setupFlow.js';
import { useLocalModelSetup } from './useLocalModelSetup.js';

const MAX_NAME = 50;

const DESCRIPTIONS = {
  welcome: 'Asyncat is an AI assistant that runs on your computer and can work with your files.',
  model: 'Asyncat needs a model to answer. Use one online with your API key, or run one on this computer.',
  chats: 'Your ChatGPT or Claude history can come along, so you can pick up where you left off.',
  safety: 'Choose how much Asyncat does on its own. You can change this any time in Settings → Privacy & safety.',
};

const TITLES = {
  welcome: 'Welcome to Asyncat',
  done: "You're all set",
};

/** A quiet row of short bars: done, this one, still to come. */
function StepBars({ index }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Step ${index + 1} of ${SETUP_STEPS.length}`}>
      {SETUP_STEPS.map((step, i) => (
        <span
          key={step.id}
          className={`h-1 rounded-full transition-[width,background-color] duration-300 ${
            i === index ? 'w-6 bg-fg' : i < index ? 'w-3 bg-fg-subtle' : 'w-3 bg-line-strong'
          }`}
        />
      ))}
    </div>
  );
}

StepBars.propTypes = { index: PropTypes.number.isRequired };

export default function WelcomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const index = stepIndex(params.get('step'));
  const step = SETUP_STEPS[index];
  const last = SETUP_STEPS.length - 1;
  const local = useLocalModelSetup();
  const brain = useActiveBrainStatus();
  const { profileData } = useUser();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef(null);

  // The profile arrives after the page; fill the field until it is typed in.
  useEffect(() => {
    if (!nameTouched) setName(nameToPrefill(profileData?.name));
  }, [profileData?.name, nameTouched]);

  // Each step starts at the top, with its heading focused for screen readers.
  useEffect(() => {
    headingRef.current?.closest('[data-welcome]')?.scrollTo?.({ top: 0 });
    if (index > 0) headingRef.current?.focus({ preventScroll: true });
  }, [index]);

  const go = (next) => setParams({ step: SETUP_STEPS[next].id }, { replace: true });

  const saveName = async () => {
    const wanted = name.trim();
    if (!wanted || wanted === String(profileData?.name || '').trim()) return;
    try {
      await profileApi.updateProfile({ name: wanted });
      eventBus.emit('profile-updated', { name: wanted });
    } catch (err) {
      toast.error("Couldn't save your name", { detail: errorDetail(err) });
    }
  };

  const next = async () => {
    if (step.id === 'welcome') {
      setBusy(true);
      await saveName();
      setBusy(false);
    }
    go(Math.min(index + 1, last));
  };

  // Finishing and skipping are the same to den: don't open it again.
  const finish = async () => {
    setBusy(true);
    try {
      await setupApi.setDone(true);
    } catch { /* it opens again next time, which is harmless */ }
    navigate('/home', { replace: true });
  };

  const localState = localSetupState(local.job, brain);
  const localName = local.job?.steps?.find((item) => item.key === 'model')?.label || '';
  const description = step.id === 'done' ? doneText({ brain, localState, localName }) : DESCRIPTIONS[step.id];
  const showCat = step.id === 'welcome' || step.id === 'done';

  return (
    <div className="h-full overflow-y-auto bg-canvas text-fg" data-welcome data-step={step.id}>
      <div className="sticky top-0 z-10 grid h-14 grid-cols-[1fr_auto_1fr] items-center bg-canvas px-4 sm:px-6">
        <span />
        <StepBars index={index} />
        <div className="flex justify-end">
          {step.id !== 'done' ? <Button variant="ghost" size="sm" onClick={finish} disabled={busy}>Skip setup</Button> : null}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[480px] px-4 pb-16 pt-6 sm:pt-[9vh]">
        {showCat ? <Cat pose="sit" className="mb-5 w-16" outline={6} /> : null}
        <h1 ref={headingRef} tabIndex={-1} className="text-[22px] font-semibold tracking-[-0.02em] text-fg outline-none">
          {TITLES[step.id] || step.label}
        </h1>
        <p className="mt-1.5 text-[14px] leading-6 text-fg-muted">{description}</p>

        <div className="mt-6">
          {step.id === 'welcome' ? (
            <form onSubmit={(event) => { event.preventDefault(); next(); }}>
              <Field label="What should Asyncat call you?" htmlFor="welcome-name" hint="Optional. You can change it in Settings → General.">
                <Input
                  id="welcome-name"
                  value={name}
                  maxLength={MAX_NAME}
                  autoFocus
                  autoComplete="off"
                  placeholder="Your name"
                  onChange={(event) => { setNameTouched(true); setName(event.target.value); }}
                />
              </Field>
            </form>
          ) : null}
          {step.id === 'model' ? <ModelStep local={local} brain={brain} /> : null}
          {step.id === 'chats' ? <ImportChats title={null} actionVariant="secondary" /> : null}
          {step.id === 'safety' ? <SafetyStep /> : null}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          {index > 0 ? (
            <Button variant="ghost" size="md" icon={ArrowLeft} onClick={() => go(index - 1)} disabled={busy}>Back</Button>
          ) : <span />}
          {step.id === 'done' ? (
            <Button variant="primary" size="md" onClick={finish} loading={busy}>Start chatting</Button>
          ) : (
            <Button variant="primary" size="md" onClick={next} loading={busy && step.id === 'welcome'}>Continue</Button>
          )}
        </div>
      </main>
    </div>
  );
}
