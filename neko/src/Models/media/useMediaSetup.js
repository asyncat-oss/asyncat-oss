import { useCallback, useEffect, useState } from 'react';
import { subscribeAppEvent } from '../../services/appEvents.js';
import { mediaApi } from './mediaApi.js';

/**
 * Voice or image setup state for its card: { status, catalog, job } with
 * live job progress, refreshed when a setup finishes. `kind`: 'voice' | 'images'.
 */
export function useMediaSetup(kind) {
  const [state, setState] = useState({ status: null, catalog: null, job: null, error: null, loading: true });

  const reload = useCallback(async () => {
    try {
      const res = await (kind === 'voice' ? mediaApi.voice.get() : mediaApi.images.get());
      setState({ status: res.status, catalog: res.catalog, job: res.setup || null, error: null, loading: false });
    } catch (err) {
      setState((current) => ({ ...current, error: err.message || "Couldn't load it.", loading: false }));
    }
  }, [kind]);

  useEffect(() => {
    reload();
    const jobKind = kind === 'voice' ? 'voice' : 'images';
    const off = subscribeAppEvent('media.setup', (event) => {
      const job = event?.data?.job;
      if (!job || job.kind !== jobKind) return;
      setState((current) => ({ ...current, job }));
      if (job.status !== 'running') reload();
    });
    const offReconnect = subscribeAppEvent('events.reconnected', reload);
    return () => {
      off();
      offReconnect();
    };
  }, [kind, reload]);

  // Live events carry the progress; a slow poll covers a dropped stream.
  const runningJobId = state.job?.status === 'running' ? state.job.id : null;
  useEffect(() => {
    if (!runningJobId) return undefined;
    const timer = setInterval(() => {
      mediaApi.setup.get(runningJobId).then((res) => {
        if (!res?.job) return;
        setState((current) => (current.job?.id === res.job.id ? { ...current, job: res.job } : current));
        if (res.job.status !== 'running') reload();
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [runningJobId, reload]);

  const setJob = useCallback((job) => setState((current) => ({ ...current, job })), []);
  return { ...state, reload, setJob };
}
