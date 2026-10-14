// First-run setup, "Run a model on this computer": what den offers here
// (asked for only once that choice is made, since it looks up the engine
// online) and the download job, followed live with 'media.setup' events and
// a slow poll in case the stream drops. Kept by the page, so it survives
// moving between steps; a download started before the page opened (a
// reload, or the setup run again) is picked up when it opens.

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeAppEvent } from '../services/appEvents.js';
import { setupApi } from './setupApi.js';
import { laterJob } from './setupFlow.js';

const KIND = 'chat-model';

const notifyModelRuntimeUpdated = () => window.dispatchEvent(new CustomEvent('asyncat-model-runtime-updated'));

export function useLocalModelSetup() {
  const [state, setState] = useState({ plan: null, job: null, loading: false, loaded: false, error: '' });
  const jobRef = useRef(null);

  const setJob = useCallback((job) => {
    jobRef.current = job;
    setState((current) => ({ ...current, job }));
  }, []);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const res = await setupApi.local();
      jobRef.current = laterJob(jobRef.current, res.job);
      setState((current) => ({ ...current, plan: res.plan, job: jobRef.current, loading: false, loaded: true }));
    } catch (err) {
      setState((current) => ({ ...current, loading: false, error: err.message || "Couldn't check this computer." }));
    }
  }, []);

  const follow = useCallback((job) => {
    if (!job || job.kind !== KIND) return;
    const before = jobRef.current;
    const same = before?.id === job.id;
    // A poll answered after the event that finished it.
    if (same && before.status !== 'running' && job.status === 'running') return;
    setJob(job);
    if (same && before.status === 'running' && job.status !== 'running') {
      // A finished download changes what is installed, and may have loaded the model.
      notifyModelRuntimeUpdated();
      setupApi.local().then((res) => setState((current) => ({ ...current, plan: res.plan }))).catch(() => {});
    }
  }, [setJob]);

  useEffect(() => subscribeAppEvent('media.setup', (event) => follow(event?.data?.job)), [follow]);

  // GET /api/setup brings the latest download without looking anything up online.
  useEffect(() => {
    setupApi.get()
      .then((res) => {
        const job = laterJob(jobRef.current, res?.job);
        if (job !== jobRef.current) setJob(job);
      })
      .catch(() => {});
  }, [setJob]);

  const runningId = state.job?.status === 'running' ? state.job.id : null;
  useEffect(() => {
    if (!runningId) return undefined;
    const timer = setInterval(() => {
      setupApi.job(runningId).then((res) => follow(res?.job)).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [runningId, follow]);

  const start = useCallback(async (modelId) => {
    setState((current) => ({ ...current, error: '' }));
    try {
      const res = await setupApi.startLocal(modelId);
      setJob(res.job);
    } catch (err) {
      setState((current) => ({ ...current, error: err.message || "Couldn't start the download." }));
      // One is already running (started in another window): show that one.
      if (err.status === 409) load();
    }
  }, [setJob, load]);

  const cancel = useCallback(async () => {
    if (!runningId) return;
    try {
      const res = await setupApi.cancel(runningId);
      follow(res?.job);
    } catch { /* it finished meanwhile */ }
  }, [runningId, follow]);

  return { ...state, load, start, cancel };
}

export default useLocalModelSetup;
