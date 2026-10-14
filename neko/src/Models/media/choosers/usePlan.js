// The download plan (what it fetches and how big that is) for the option a
// chooser has selected, fetched once the selection settles.

import { useEffect, useRef, useState } from 'react';

/**
 *   const plan = usePlan(needsDownload ? `small:${english}` : null, () => mediaApi.voice.plan({ … }).then((res) => res.plan));
 *   plan.loading, plan.plan, plan.error
 *
 * `key` names what is selected; a new key fetches again, null fetches nothing.
 */
export function usePlan(key, load) {
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  const [state, setState] = useState({ key: null, plan: null, error: '', loading: false });

  useEffect(() => {
    if (!key) {
      setState({ key: null, plan: null, error: '', loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ key, plan: null, error: '', loading: true });
    // Clicking through a few options asks once, for the last one.
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => loadRef.current())
        .then((plan) => { if (!cancelled) setState({ key, plan, error: '', loading: false }); })
        .catch((err) => { if (!cancelled) setState({ key, plan: null, error: err?.message || "Couldn't check the size.", loading: false }); });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return state;
}

export default usePlan;
