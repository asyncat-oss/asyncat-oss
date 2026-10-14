// localModelSwitch.js — sharing the built-in llama.cpp server between chats.
//
// llama-server holds one model at a time, but each chat (and Cat) can run on
// its own local model. A run on a local model takes a lease on that model for
// as long as it runs. Runs on the loaded model share it; a run that needs
// another model waits until the runs on the loaded one are done, then loads
// its own. Requests are served in the order they came, so a chat waiting for
// its model isn't starved by chats that keep using the loaded one.
//
// Loading from the Models page doesn't go through here: that is the user's own
// choice, made on purpose, and takes effect at once.

import path from 'path';

function samePath(a, b) {
  return Boolean(a && b) && path.resolve(a) === path.resolve(b);
}

function abortError() {
  const err = new Error('Stopped while waiting for the local model.');
  err.name = 'AbortError';
  return err;
}

/** The reason in a llama-server error, without its code ("OOM: …" → "…"). */
export function loadErrorText(message) {
  return String(message || 'The model stopped loading.').replace(/^[A-Z_]+:\s*/, '');
}

/**
 * A switch over one llama-server. `getStatus`, `startServer(modelPath,
 * ctxSize)` and `subscribe(fn)` are llamaServerManager's (tests pass their own).
 */
export function createLocalModelSwitch({ getStatus, startServer, subscribe }) {
  const leases = new Map(); // model path → runs using it
  const queue = [];         // requests waiting, oldest first
  let loading = null;       // { modelPath, started } while a load we asked for runs
  let unsubscribe = null;

  function busyWith(modelPath) {
    for (const [held, count] of leases) {
      if (count > 0 && !samePath(held, modelPath)) return held;
    }
    return null;
  }

  function grant(request) {
    const key = path.resolve(request.modelPath);
    leases.set(key, (leases.get(key) || 0) + 1);
    request.cleanup();
    let released = false;
    request.resolve(() => {
      if (released) return;
      released = true;
      const left = (leases.get(key) || 1) - 1;
      if (left > 0) leases.set(key, left);
      else leases.delete(key);
      pump();
    });
  }

  function fail(modelPath, err) {
    for (const request of [...queue]) {
      if (!samePath(request.modelPath, modelPath)) continue;
      queue.splice(queue.indexOf(request), 1);
      request.cleanup();
      request.reject(err);
    }
  }

  function load(request) {
    loading = { modelPath: request.modelPath, started: false };
    for (const waiting of queue) {
      if (samePath(waiting.modelPath, request.modelPath)) waiting.onLoad?.();
    }
    Promise.resolve()
      .then(() => startServer(request.modelPath, request.ctxSize))
      .then(() => {
        if (!loading) return;
        loading.started = true;
        onStatus(getStatus());
      }, (err) => {
        const failed = loading?.modelPath || request.modelPath;
        loading = null;
        // Someone else's load began first: wait for it, then try again.
        if (!/already loading/i.test(err?.message || '')) fail(failed, new Error(loadErrorText(err?.message)));
        pump();
      });
  }

  function pump() {
    while (queue.length) {
      const head = queue[0];
      const status = getStatus();
      if (status.status === 'ready' && samePath(status.modelPath, head.modelPath)) {
        queue.shift();
        grant(head);
        continue;
      }
      // A load is under way (ours, or one from the Models page): wait for it.
      if (loading || status.status === 'loading') return;
      const busy = busyWith(head.modelPath);
      if (busy) {
        if (head.waitingFor !== busy) {
          head.waitingFor = busy;
          head.onWait?.(busy);
        }
        return;
      }
      load(head);
      return;
    }
  }

  function onStatus(status) {
    if (loading?.started) {
      if (status.status === 'ready') {
        loading = null;
      } else if (status.status === 'error' || status.status === 'idle') {
        const failed = loading.modelPath;
        loading = null;
        fail(failed, new Error(loadErrorText(status.error)));
      }
    }
    pump();
  }

  /**
   * Wait until `modelPath` is loaded and take a lease on it. Resolves to a
   * release function, called once the run is over. `onWait(busyPath)` is
   * called while runs on another model hold the server; `onLoad()` when this
   * model starts loading.
   */
  function acquire(modelPath, { ctxSize = null, signal = null, onWait = null, onLoad = null } = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    if (!unsubscribe) unsubscribe = subscribe(onStatus);
    return new Promise((resolve, reject) => {
      const request = { modelPath, ctxSize, onWait, onLoad, resolve, reject, waitingFor: null, cleanup: () => {} };
      if (signal) {
        const onAbort = () => {
          const index = queue.indexOf(request);
          if (index < 0) return;
          queue.splice(index, 1);
          reject(abortError());
          pump();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        request.cleanup = () => signal.removeEventListener('abort', onAbort);
      }
      queue.push(request);
      if (loading && samePath(loading.modelPath, modelPath)) onLoad?.();
      pump();
    });
  }

  /** What the switch is doing, for tests and diagnostics. */
  function state() {
    return {
      leases: Object.fromEntries(leases),
      waiting: queue.map((request) => request.modelPath),
      loading: loading?.modelPath || null,
    };
  }

  return { acquire, state };
}
