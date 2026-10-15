// What the Tools & Skills tabs show, with their searches, filters and the
// open item. The page holds these, so a tab keeps them while another tab is
// open, and the tab row can count tools and skills before either is opened.

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentApi } from '../CommandCenter/api';

/**
 * Loads a list once and keeps it: { loading, error, reload }. `reload({ quiet: true })`
 * refreshes without showing the loading state, e.g. after a delete.
 */
function useLoaded(load) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetched = useRef(false);

  const reload = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    reload();
  }, [reload]);

  return { loading, error, reload };
}

/** The tool catalog: { tools, loading, error, reload, query, setQuery, os, setOs, selectedName, select }. */
export function useToolCatalog() {
  const [tools, setTools] = useState([]);
  const [query, setQuery] = useState('');
  const [os, setOs] = useState('all');
  const [selectedName, select] = useState(null);
  const load = useCallback(async () => {
    const res = await agentApi.getTools();
    setTools(res.tools || []);
  }, []);
  const { loading, error, reload } = useLoaded(load);
  return { tools, loading, error, reload, query, setQuery, os, setOs, selectedName, select };
}

/**
 * The skills: { skills, categories, loading, error, reload, query, setQuery,
 * origin, setOrigin, selectedName, select }. `categories` are den's plain
 * categories in order (den/src/agent/skillCategories.js).
 */
export function useSkillCatalog() {
  const [skills, setSkills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState('all');
  const [selectedName, select] = useState(null);
  const load = useCallback(async () => {
    const res = await agentApi.getSkills();
    setSkills(res.skills || []);
    setCategories(res.categories || []);
  }, []);
  const { loading, error, reload } = useLoaded(load);
  return { skills, categories, loading, error, reload, query, setQuery, origin, setOrigin, selectedName, select };
}
