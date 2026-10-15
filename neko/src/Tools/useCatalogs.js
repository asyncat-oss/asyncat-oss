// What the Tools & Skills tabs show, with their searches, filters and the
// open item. The page holds these, so a tab keeps them while another tab is
// open, and the tab row can count tools and skills before either is opened.

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentApi } from '../CommandCenter/api';

/** The tool catalog: { tools, loading, error, reload, query, setQuery, os, setOs, selectedName, select }. */
export function useToolCatalog() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [os, setOs] = useState('all');
  const [selectedName, select] = useState(null);
  const fetched = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await agentApi.getTools();
      setTools(res.tools || []);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    reload();
  }, [reload]);

  return { tools, loading, error, reload, query, setQuery, os, setOs, selectedName, select };
}
