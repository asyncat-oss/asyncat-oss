import { useCallback, useEffect, useState } from 'react';
import { subscribeAppEvent } from '../services/appEvents.js';
import { connectorsApi } from './connectorsApi.js';

/**
 * The saved connectors with their live status, the catalog, and a problem
 * with data/mcp.json if there is one. Refreshes when den reports a change.
 */
export function useConnectors() {
  const [state, setState] = useState({ connectors: null, catalog: [], fileError: null, error: null });

  const reload = useCallback(async () => {
    try {
      const res = await connectorsApi.list();
      setState({ connectors: res.connectors || [], catalog: res.catalog || [], fileError: res.error || null, error: null });
    } catch (err) {
      setState((current) => ({ ...current, connectors: current.connectors || [], error: err.message || "Couldn't load connectors." }));
    }
  }, []);

  useEffect(() => {
    reload();
    const offUpdated = subscribeAppEvent('connectors.updated', reload);
    const offReconnected = subscribeAppEvent('events.reconnected', reload);
    return () => {
      offUpdated();
      offReconnected();
    };
  }, [reload]);

  return { ...state, reload };
}
