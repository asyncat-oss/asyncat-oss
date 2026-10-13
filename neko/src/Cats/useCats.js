// Cats and their inbox, kept current by the backend's live updates
// (cat.updated, cat.inbox, cat.timeline over /api/events).

import { useCallback, useEffect, useRef, useState } from 'react';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import { subscribeAppEvent } from '../services/appEvents.js';

const EMPTY_COUNTS = { approval: 0, question: 0, result: 0, notice: 0, waiting: 0, total: 0 };

/** Call `reload` (debounced) when any of `types` arrives, and after a reconnect. */
function useLiveReload(types, reload, matches = () => true) {
  const timer = useRef(null);
  useEffect(() => {
    const later = (event) => {
      if (event && !matches(event)) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => reload(), 200);
    };
    const offs = [...types, 'events.reconnected'].map((type) => subscribeAppEvent(type, later));
    return () => {
      clearTimeout(timer.current);
      offs.forEach((off) => off());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, types.join(',')]);
}

export function useCats() {
  const [cats, setCats] = useState(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const result = await catsApi.list();
      setCats(result.cats || []);
      setCounts(result.inbox || EMPTY_COUNTS);
      setError('');
    } catch (err) {
      setError(err.message || "Couldn't load the Cats.");
      setCats((current) => current || []);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useLiveReload(['cat.updated', 'cat.inbox'], reload);
  return { cats, counts, error, reload, loading: cats === null };
}

export function useCat(id) {
  const [cat, setCat] = useState(null);
  const [missing, setMissing] = useState(false);
  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const result = await catsApi.get(id);
      setCat(result.cat);
      setMissing(false);
    } catch (err) {
      if (err.status === 404) setMissing(true);
    }
  }, [id]);
  useEffect(() => {
    setCat(null);
    reload();
  }, [reload]);
  useLiveReload(['cat.updated', 'cat.inbox'], reload, (event) => !event.data?.catId || event.data.catId === id);
  return { cat, setCat, missing, reload };
}

export function useInbox({ catId = null, status = 'open' } = {}) {
  const [items, setItems] = useState(null);
  const reload = useCallback(async () => {
    try {
      const result = await catsApi.inbox({ catId, status });
      setItems(result.items || []);
    } catch {
      setItems((current) => current || []);
    }
  }, [catId, status]);
  useEffect(() => { reload(); }, [reload]);
  useLiveReload(['cat.inbox'], reload, (event) => !catId || event.data?.catId === catId);
  return { items, reload, setItems };
}

export function useTimeline(catId) {
  const [events, setEvents] = useState(null);
  const reload = useCallback(async () => {
    if (!catId) return;
    try {
      const result = await catsApi.timeline(catId, { limit: 200 });
      setEvents(result.events || []);
    } catch {
      setEvents((current) => current || []);
    }
  }, [catId]);
  useEffect(() => { reload(); }, [reload]);
  useLiveReload(['cat.timeline', 'cat.updated'], reload, (event) => event.data?.catId === catId);
  return { events, reload };
}

/** Open approvals and questions across Cats, for the sidebar badge. */
export function useWaitingCount() {
  const [waiting, setWaiting] = useState(0);
  const reload = useCallback(async () => {
    try {
      const result = await catsApi.inbox({ status: 'open', kind: 'approval,question', limit: 1 });
      setWaiting(Number(result.counts?.waiting || 0));
    } catch { /* keep the last count */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useLiveReload(['cat.inbox'], reload);
  return waiting;
}
