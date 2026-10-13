// Models → Voice: "Set up voice". On this computer (whisper.cpp to listen,
// Piper to speak: the engines and one recommended model each, sizes first,
// one OK) or with a cloud service and its voices. Once set up it shows what
// is used, with a quick test of the voice and the mic.

import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Download, Loader2, Mic, Square, Volume2 } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { Segmented } from '../../components/ui/Tabs.jsx';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { audioApi } from '../../Settings/settingApi.js';
import { startWavRecording } from '../../utils/wavRecorder.js';
import { formatBytes } from '../engineProgress.js';
import { mediaApi } from './mediaApi.js';
import { totalText, userLanguage } from './mediaFormat.js';
import { KeyField, PlanList, SetupProgress } from './MediaParts.jsx';
import { CloudVoicePicker, LocalVoicePicker } from './VoicePicker.jsx';
import { useMediaSetup } from './useMediaSetup.js';
import { usePlayer } from './usePlayer.js';

const CLOUD_ORDER = ['openai', 'elevenlabs', 'gemini'];

function MicTest() {
  const [state, setState] = useState('idle'); // idle | listening | working | done | error
  const [text, setText] = useState('');
  const [level, setLevel] = useState(0);
  const recorderRef = useRef(null);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  const handle = async (result) => {
    recorderRef.current = null;
    setLevel(0);
    if (!result?.blob) {
      setState('error');
      setText("I didn't hear anything. Check the mic and try again.");
      return;
    }
    setState('working');
    try {
      const res = await audioApi.whisper.transcribe(result.blob);
      setText(res.text?.trim() || '(nothing recognised)');
      setState('done');
    } catch (err) {
      setText(err.message || "Couldn't recognise it.");
      setState('error');
    }
  };

  const start = async () => {
    setText('');
    try {
      recorderRef.current = await startWavRecording({ autoStop: true, onAutoStop: handle, onLevel: setLevel });
      setState('listening');
    } catch (err) {
      setState('error');
      setText(`Couldn't use the mic: ${err.message}`);
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    if (recorder) handle(await recorder.stop());
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {state === 'listening' ? (
        <Button size="sm" icon={Square} onClick={stop}>Stop</Button>
      ) : (
        <Button size="sm" icon={Mic} onClick={start} loading={state === 'working'}>Test the mic</Button>
      )}
      {state === 'listening' ? (
        <span className="flex items-center gap-2 text-[12px] text-fg-muted">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hover"><span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} /></span>
          Say something…
        </span>
      ) : text ? (
        <span className={`min-w-0 truncate text-[12px] ${state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-fg'}`} title={text}>
          {state === 'done' ? `You said: “${text}”` : text}
        </span>
      ) : null}
    </div>
  );
}

function ReadyView({ status, onChange }) {
  const player = usePlayer();
  const { stt, tts } = status;
  const where = (part, local) => (part.provider === 'local' ? local : `${part.title}${part.model && typeof part.model === 'string' ? ` · ${part.model}` : ''}`);
  return (
    <div className="space-y-3" data-voice-ready>
      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="rounded-xl bg-hover/50 px-3.5 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Listening</dt>
          <dd className="mt-0.5 text-fg">{stt.ready ? where(stt, `${stt.model?.name} · on this computer`) : 'Not set up'}</dd>
        </div>
        <div className="rounded-xl bg-hover/50 px-3.5 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Speaking</dt>
          <dd className="mt-0.5 text-fg">{tts.ready ? (tts.provider === 'local' ? `${tts.voice?.name} · on this computer` : `${tts.title} · ${tts.voice?.name}`) : 'Not set up'}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {tts.ready ? (
          <Button
            size="sm"
            icon={player.playing ? Square : Volume2}
            loading={Boolean(player.loading)}
            onClick={() => (player.playing ? player.stop() : player.play('voice', () => mediaApi.voice.preview({ provider: tts.provider, voice: tts.provider === 'local' ? tts.voice?.path : tts.voice?.id })))}
          >
            {player.playing ? 'Stop' : 'Hear the voice'}
          </Button>
        ) : null}
        {stt.ready ? <MicTest /> : null}
        <Button size="sm" variant="ghost" onClick={onChange} className="ml-auto">Change</Button>
      </div>
      {player.error ? <p className="text-[12px] text-red-600 dark:text-red-400">{player.error}</p> : null}
      <p className="text-[12px] text-fg-subtle">The mic button and hands-free voice mode in chats use these.</p>
    </div>
  );
}

ReadyView.propTypes = { status: PropTypes.object.isRequired, onChange: PropTypes.func.isRequired };

function LocalSetup({ catalog, onStarted }) {
  const toast = useToast();
  const language = userLanguage();
  const recommendedVoice = useMemo(() => {
    const lang = language.toLowerCase();
    return catalog.voices.find((voice) => voice.locale.toLowerCase() === lang)?.id
      || catalog.voices.find((voice) => voice.locale.slice(0, 2).toLowerCase() === lang.slice(0, 2))?.id
      || catalog.voices.find((voice) => voice.recommended)?.id;
  }, [catalog.voices, language]);
  const [listen, setListen] = useState(true);
  const [speak, setSpeak] = useState(true);
  const [whisperId, setWhisperId] = useState(catalog.whisper.find((model) => model.recommended)?.id || 'base');
  const [english, setEnglish] = useState(language.toLowerCase().startsWith('en'));
  const [voiceId, setVoiceId] = useState(recommendedVoice);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState('');
  const [starting, setStarting] = useState(false);
  const options = { listen, speak, whisper: whisperId, english, voice: voiceId, language };
  const key = JSON.stringify(options);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setPlanError('');
    const timer = setTimeout(() => {
      mediaApi.voice.plan(JSON.parse(key))
        .then((res) => { if (!cancelled) setPlan(res.plan); })
        .catch((err) => { if (!cancelled) setPlanError(err.message || "Couldn't work out the sizes."); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key]);

  const start = async () => {
    setStarting(true);
    try {
      const res = await mediaApi.voice.setup(options);
      onStarted(res.job);
    } catch (err) {
      toast.error("Couldn't start the setup", { detail: errorDetail(err) });
    } finally {
      setStarting(false);
    }
  };

  const nothing = !listen && !speak;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--as-accent)]" checked={listen} onChange={(event) => setListen(event.target.checked)} /> Listen (the mic turns speech into text)</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--as-accent)]" checked={speak} onChange={(event) => setSpeak(event.target.checked)} /> Speak (reads answers aloud)</label>
      </div>

      {listen ? (
        <Field label="Listening model" hint="Bigger models understand more, but take longer on this computer's processor.">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Listening model">
            {catalog.whisper.map((model) => (
              <label key={model.id} className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 ${whisperId === model.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-hover'}`}>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-fg">
                  <input type="radio" name="whisper-model" className="h-4 w-4 accent-[var(--as-accent)]" checked={whisperId === model.id} onChange={() => setWhisperId(model.id)} />
                  {model.title}
                  {model.recommended ? <span className="text-[11px] font-normal text-accent">Recommended</span> : null}
                </span>
                <span className="mt-1 text-[12px] leading-5 text-fg-muted">{model.note}</span>
                <span className="mt-1 text-[11px] text-fg-subtle">{model.installed || (english && model.installedEnglish) ? 'On this computer' : formatBytes(model.bytes)}</span>
              </label>
            ))}
          </div>
          {catalog.whisper.find((model) => model.id === whisperId)?.englishFile ? (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-fg-muted">
              <input type="checkbox" className="h-4 w-4 accent-[var(--as-accent)]" checked={english} onChange={(event) => setEnglish(event.target.checked)} />
              I only speak English to it (a little more accurate)
            </label>
          ) : null}
        </Field>
      ) : null}

      {speak ? (
        <Field label="Voice">
          <LocalVoicePicker voices={catalog.voices} value={voiceId} onChange={setVoiceId} />
        </Field>
      ) : null}

      {!nothing ? (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-fg-muted">What it downloads</p>
          {plan ? <PlanList steps={plan.steps} /> : planError ? <p className="text-[13px] text-red-600 dark:text-red-400">{planError}</p> : (
            <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking sizes…</p>
          )}
          <p className="text-[12px] text-fg-subtle">Nothing downloads until you click the button. You can cancel at any time.</p>
        </div>
      ) : null}

      <Button variant="primary" icon={Download} loading={starting} disabled={nothing || !plan} onClick={start}>
        {plan?.totalBytes ? `Download ${totalText(plan.totalBytes, { estimated: plan.estimated })} and set up` : 'Set up'}
      </Button>
    </div>
  );
}

LocalSetup.propTypes = { catalog: PropTypes.object.isRequired, onStarted: PropTypes.func.isRequired };

function CloudSetup({ catalog, status, onChosen, onKeySaved }) {
  const toast = useToast();
  const [provider, setProvider] = useState(CLOUD_ORDER.includes(status?.tts?.provider) ? status.tts.provider : 'openai');
  const service = catalog.cloud[provider];
  const [listen, setListen] = useState(Boolean(service?.stt));
  const [speak, setSpeak] = useState(true);
  const [model, setModel] = useState(service?.stt?.defaultModel || '');
  const [voice, setVoice] = useState(service?.tts?.defaultVoice || '');
  const [voices, setVoices] = useState(service?.tts?.voices || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = catalog.cloud[provider];
    setListen(Boolean(next?.stt));
    setModel(next?.stt?.defaultModel || '');
    setVoice(next?.tts?.defaultVoice || '');
    setVoices(next?.tts?.voices || []);
    if (provider === 'elevenlabs' && next?.hasKey) {
      mediaApi.voice.elevenLabsVoices().then((res) => { if (res.voices?.length) setVoices(res.voices); }).catch(() => {});
    }
  }, [provider, catalog.cloud]);

  const use = async () => {
    setSaving(true);
    try {
      await mediaApi.voice.choose({
        stt: listen && service.stt ? { provider, model } : null,
        tts: speak && service.tts ? { provider, voice } : null,
      });
      onChosen();
    } catch (err) {
      toast.error(`Couldn't switch to ${service.title}`, { detail: errorDetail(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Field label="Service" htmlFor="voice-cloud-service">
        <Select id="voice-cloud-service" value={provider} onChange={(event) => setProvider(event.target.value)}>
          {CLOUD_ORDER.map((id) => <option key={id} value={id}>{catalog.cloud[id].title}{catalog.cloud[id].stt ? '' : ' (speaking only)'}</option>)}
        </Select>
      </Field>
      {!service.hasKey ? <KeyField keyName={service.keyName} title={service.title} onSaved={onKeySaved} /> : null}
      {service.stt ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[var(--as-accent)]" checked={listen} onChange={(event) => setListen(event.target.checked)} /> Use it to listen</label>
          {listen ? (
            <Select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Listening model">
              {service.stt.models.map((id) => <option key={id} value={id}>{id}</option>)}
            </Select>
          ) : null}
        </div>
      ) : null}
      {service.tts ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[var(--as-accent)]" checked={speak} onChange={(event) => setSpeak(event.target.checked)} /> Use it to speak</label>
          {speak ? <CloudVoicePicker provider={provider} voices={voices} value={voice} onChange={setVoice} canPreview={service.hasKey} /> : null}
          {speak && service.hasKey ? <p className="text-[12px] text-fg-subtle">Hearing a voice uses a little of your {service.title} credit.</p> : null}
        </div>
      ) : null}
      <Button variant="primary" loading={saving} disabled={!service.hasKey || (!listen && !speak)} onClick={use}>Use {service.title}</Button>
    </div>
  );
}

CloudSetup.propTypes = { catalog: PropTypes.object.isRequired, status: PropTypes.object, onChosen: PropTypes.func.isRequired, onKeySaved: PropTypes.func.isRequired };

export default function VoiceSetupCard() {
  const toast = useToast();
  const { status, catalog, job, error, loading, reload, setJob } = useMediaSetup('voice');
  const [changing, setChanging] = useState(false);
  const [where, setWhere] = useState(null);
  const [watchJobId, setWatchJobId] = useState(null);

  const running = job?.status === 'running';
  const watching = job && (running || job.id === watchJobId);
  const mode = where || (status && status.tts?.provider !== 'local' && status.stt?.provider !== 'local' ? 'cloud' : 'local');

  useEffect(() => {
    if (job?.id === watchJobId && job.status === 'complete') {
      toast.success('Voice is set up');
      setWatchJobId(null);
      setChanging(false);
      window.dispatchEvent(new Event('asyncat-voice-changed'));
    }
  }, [job, watchJobId, toast]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" data-voice-setup>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Mic className="h-4 w-4" /></span>
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Voice</h2>
          <p className="text-[13px] text-fg-muted">Talk to Asyncat and hear its answers.</p>
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
      ) : status.setUp && !changing ? (
        <ReadyView status={status} onChange={() => setChanging(true)} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={mode}
              onChange={setWhere}
              items={[{ value: 'local', label: 'On this computer' }, { value: 'cloud', label: 'With a cloud service' }]}
              label="Where voice runs"
            />
            {status.setUp ? <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>Cancel</Button> : null}
          </div>
          <p className="text-[12px] text-fg-subtle">
            {mode === 'local' ? 'Free and private: nothing you say leaves this computer. Downloads the engines and models once.' : 'Uses your account with the service; what you say is sent to it.'}
          </p>
          {mode === 'local'
            ? <LocalSetup catalog={catalog} onStarted={(started) => { setWatchJobId(started.id); setJob(started); }} />
            : <CloudSetup catalog={catalog} status={status} onChosen={() => { toast.success('Voice is set up'); setChanging(false); reload(); window.dispatchEvent(new Event('asyncat-voice-changed')); }} onKeySaved={reload} />}
        </div>
      )}
    </section>
  );
}
