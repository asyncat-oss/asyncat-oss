import { useCallback, useEffect, useState } from 'react';
import { profilesApi } from '../CommandCenter/api/agentApi.js';
import eventBus from '../utils/eventBus.js';

// One shared, cached list of the user's agents for the composer, the chat
// screen and the Agents page. Emit 'agentsUpdated' after changing agents.
let cache = null;
let inflight = null;

function fetchAgents() {
  if (!inflight) {
    inflight = profilesApi.listProfiles()
      .then((res) => {
        cache = Array.isArray(res?.profiles) ? res.profiles : [];
        return cache;
      })
      .catch(() => cache || [])
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useAgents() {
  const [agents, setAgents] = useState(cache || []);
  const [loaded, setLoaded] = useState(Boolean(cache));

  const reload = useCallback(async () => {
    cache = null;
    const list = await fetchAgents();
    setAgents(list);
    setLoaded(true);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAgents().then((list) => {
      if (cancelled) return;
      setAgents(list);
      setLoaded(true);
    });
    const off = eventBus.on('agentsUpdated', () => { reload(); });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [reload]);

  return { agents, loaded, reload };
}

export default useAgents;
