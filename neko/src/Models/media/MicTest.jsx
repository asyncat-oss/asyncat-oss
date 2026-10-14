// Listening → Try it: record a few words from the mic (it stops by itself
// when you go quiet, or on Stop or Escape) and show what listening made of
// them, with whatever "Runs on" is set to.

import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Mic, Square } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { audioApi } from '../../Settings/settingApi.js';
import { startWavRecording } from '../../utils/wavRecorder.js';

/**
 *   <PropertyRow label="Try it" value={<MicTest stt={status.stt} />} />
 *
 * `stt` is the listening status; on this computer a model that isn't loaded
 * yet says "Starting the model…" while the first words load it.
 */
export default function MicTest({ stt = null }) {
  const [state, setState] = useState('idle'); // idle | listening | working | done | error
  const [text, setText] = useState('');
  const [level, setLevel] = useState(0);
  const recorderRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      recorderRef.current?.cancel?.();
    };
  }, []);

  const finish = useCallback(async (result) => {
    recorderRef.current = null;
    if (!aliveRef.current) return;
    setLevel(0);
    if (!result?.blob) {
      setState('error');
      setText("I didn't hear anything. Check the mic and try again.");
      return;
    }
    setState('working');
    try {
      const res = await audioApi.whisper.transcribe(result.blob);
      if (!aliveRef.current) return;
      const said = String(res?.text || '').trim();
      setText(said || "I didn't hear anything. Check the mic and try again.");
      setState(said ? 'done' : 'error');
    } catch (err) {
      if (!aliveRef.current) return;
      setText(err.message || "Couldn't make out the words.");
      setState('error');
    }
  }, []);

  const start = async () => {
    setText('');
    try {
      recorderRef.current = await startWavRecording({ autoStop: true, onAutoStop: finish, onLevel: setLevel });
      setState('listening');
    } catch (err) {
      setState('error');
      setText(`Couldn't use the mic: ${err.message}`);
    }
  };

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (recorder) finish(await recorder.stop());
  }, [finish]);

  // Escape stops a recording, like Stop.
  useEffect(() => {
    if (state !== 'listening') return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      stop();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state, stop]);

  const loadingModel = stt?.provider === 'local' && stt.running !== 'ready';
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2" data-mic-test={state}>
      {state === 'listening' ? (
        <Button size="sm" icon={Square} onClick={stop}>Stop</Button>
      ) : (
        <Button size="sm" icon={Mic} loading={state === 'working'} onClick={start}>Test the mic</Button>
      )}
      {state === 'listening' ? (
        <span className="flex items-center gap-2 text-[13px] text-fg-muted">
          <Progress className="w-16" value={Math.round(level * 100)} label="Mic level" />
          Say something…
        </span>
      ) : state === 'working' ? (
        <span className="text-[13px] text-fg-muted">{loadingModel ? 'Starting the model…' : 'Working it out…'}</span>
      ) : text ? (
        <span
          className={`min-w-0 flex-1 basis-48 text-[13px] leading-5 line-clamp-2 ${state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-fg'}`}
          title={text}
          role={state === 'error' ? 'alert' : undefined}
        >
          {state === 'done' ? `You said: “${text}”` : text}
        </span>
      ) : null}
    </div>
  );
}

MicTest.propTypes = {
  stt: PropTypes.shape({ provider: PropTypes.string, running: PropTypes.string }),
};
