// Tools & Skills → Memory's list with its search and filters, and the counts
// above it. The page holds it, so the tab keeps its search while another tab
// is open; it loads while the Memory tab is open.

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentApi } from '../CommandCenter/api';

/**
 * { memories, setMemories, query, setQuery, kind, setKind, scope, setScope,
 *   loading, error, reload, stats, reloadStats }.
 * `linkedScope` (?scope=project:<id> | agent:<id> | cat:<id> | shared) picks
 * one owner's memories, e.g. from "See its memories" on a Cat's page.
 */
export function useMemories(active, linkedScope) {
  const [memories, setMemories] = useState([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [scope, setScope] = useState(() => linkedScope || 'all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (linkedScope) setScope(linkedScope);
  }, [linkedScope]);

  // The search waits for a pause in typing, and only the latest request's
  // answer is shown, so a slow earlier one can't replace it.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const res = await agentApi.getMemories({ q: search, kind, scope, limit: 200 });
      if (request === latest.current) setMemories(res.memories || []);
    } catch (err) {
      if (request === latest.current) setError(err.message || 'Something went wrong');
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [search, kind, scope]);

  const reloadStats = useCallback(() => (
    agentApi.getMemoryStats().then((res) => { if (res?.success) setStats(res); }).catch(() => {})
  ), []);

  useEffect(() => {
    if (active) reload();
  }, [active, reload]);

  useEffect(() => {
    if (active) reloadStats();
  }, [active, reloadStats]);

  return { memories, setMemories, query, setQuery, kind, setKind, scope, setScope, loading, error, reload, stats, reloadStats };
}
