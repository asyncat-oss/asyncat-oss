// One engine Asyncat can install (whisper.cpp, Piper, stable-diffusion.cpp)
// for its Engine row: what is installed, how much room Asyncat's copy takes,
// and an install that keeps going when the page closes. Opening the page
// again picks the install back up through the runtime list's installJob.

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioApi, runtimeApi } from '../../Settings/settingApi.js';
import { useManagedRuntime } from '../useManagedRuntime.js';
import { IMAGE_EVENTS, notifyImagesChanged, notifyVoiceChanged, onEvents } from './notify.js';

// Disk use of every engine, shared by the rows on a page (one walk of the folders).
let diskCache = null;
let diskInflight = null;

function loadDisk({ fresh = false } = {}) {
  if (fresh) diskCache = null;
  if (diskCache) return Promise.resolve(diskCache);
  if (!diskInflight) {
    diskInflight = runtimeApi.diskUsage()
      .then((res) => {
        diskCache = Array.isArray(res?.engines) ? res.engines : [];
        return diskCache;
      })
      .catch(() => diskCache || [])
      .finally(() => { diskInflight = null; });
  }
  return diskInflight;
}

const RUNNING = new Set(['running', 'queued']);

function notifyEngine(runtimeId) {
  if (runtimeId === 'sd') notifyImagesChanged();
  else notifyVoiceChanged();
}

/**
 *   const engine = useEngine('whisper');
 *   engine.runtime    // GET /runtimes entry, or null while loading
 *   engine.bytes      // disk use of Asyncat's copy, or null
 *   engine.job        // the install running now, live, or null
 *   engine.error      // why the last install failed
 *   engine.plan()     // → what an install downloads (size, version, build)
 *   engine.install(), engine.cancel(), engine.remove(), engine.freeMemory()
 *
 * `onChanged` runs after an install finishes, a removal and freeing memory.
 */
export function useEngine(runtimeId, { onChanged = null } = {}) {
  const { runtime, refresh } = useManagedRuntime(runtimeId);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [bytes, setBytes] = useState(() => diskCache?.find((item) => item.id === runtimeId)?.bytes ?? null);
  const stopRef = useRef(null);
  const followingRef = useRef(null);
  const aliveRef = useRef(true);
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

  const readDisk = useCallback(async (fresh = false) => {
    const engines = await loadDisk({ fresh });
    if (aliveRef.current) setBytes(engines.find((item) => item.id === runtimeId)?.bytes ?? null);
  }, [runtimeId]);

  const changed = useCallback(async () => {
    await Promise.all([refresh(), readDisk(true)]);
    notifyEngine(runtimeId);
    await onChangedRef.current?.();
  }, [readDisk, refresh, runtimeId]);

  const follow = useCallback((started) => {
    if (!started?.id || followingRef.current === started.id) return;
    stopRef.current?.();
    followingRef.current = started.id;
    setJob(started);
    setError('');
    stopRef.current = runtimeApi.pollJob(
      started.id,
      (next) => { if (aliveRef.current && next) setJob(next); },
      async () => {
        stopRef.current = null;
        followingRef.current = null;
        if (!aliveRef.current) return;
        setJob(null);
        await changed();
      },
      (next) => {
        stopRef.current = null;
        followingRef.current = null;
        if (!aliveRef.current) return;
        setJob(null);
        if (next?.status !== 'cancelled') setError(next?.error || "The install didn't finish.");
        refresh();
      },
    );
  }, [changed, refresh]);

  useEffect(() => {
    aliveRef.current = true;
    // Fresh, so an install started elsewhere (or before the page opened) shows.
    refresh();
    readDisk();
    const off = onEvents(['asyncat-model-runtime-updated', ...IMAGE_EVENTS], () => {
      refresh();
      readDisk(true);
    });
    return () => {
      aliveRef.current = false;
      off();
      stopRef.current?.();
      stopRef.current = null;
      followingRef.current = null;
    };
  }, [readDisk, refresh]);

  const listedJob = runtime?.installJob && RUNNING.has(runtime.installJob.status) ? runtime.installJob : null;
  useEffect(() => {
    if (listedJob) follow(listedJob);
  }, [follow, listedJob]);

  const install = useCallback(async () => {
    setError('');
    try {
      const res = await runtimeApi.install(runtimeId);
      follow(res.job);
    } catch (err) {
      // Already installing (from setup, say): follow that one instead.
      const list = await refresh();
      const running = list?.find?.((item) => item.id === runtimeId)?.installJob;
      if (running && RUNNING.has(running.status)) follow(running);
      else throw err;
    }
  }, [follow, refresh, runtimeId]);

  const cancel = useCallback(async () => {
    if (job?.id) await runtimeApi.cancelJob(job.id);
  }, [job]);

  const remove = useCallback(async () => {
    await runtimeApi.remove(runtimeId);
    await changed();
  }, [changed, runtimeId]);

  const freeMemory = useCallback(async () => {
    if (runtimeId === 'whisper') await audioApi.whisper.stop();
    else if (runtimeId === 'piper') await audioApi.tts.stop();
    notifyEngine(runtimeId);
    await onChangedRef.current?.();
  }, [runtimeId]);

  const plan = useCallback(async () => (await runtimeApi.plan(runtimeId)).plan, [runtimeId]);

  return { runtime, bytes, job, installing: Boolean(job), error, plan, install, cancel, remove, freeMemory, refresh };
}

export default useEngine;
