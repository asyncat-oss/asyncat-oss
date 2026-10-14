// Model downloads into one tab's folder ("audio/" for Voice, "image" for
// Images), picked up again when the page opens while they run. It checks
// every second while one is going, says when one finishes so the file lists
// catch up, and leaves out the files a running setup already shows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localModelsApi } from '../../Settings/settingApi.js';
import { downloadsFor } from './mediaFormat.js';
import { DOWNLOADS_EVENT, notifyForSubDir, onEvents } from './notify.js';

const POLL_MS = 1000;

function inFolder(item, prefix) {
  return String(item?.subDir || '').replace(/\\/g, '/').replace(/^\/+/, '').startsWith(String(prefix).replace(/^\/+/, ''));
}

/**
 *   const { downloads, cancel, refresh } = useDownloads('audio/', { job });
 *
 * `downloads` are GET /local-models/downloads items (see downloadsFor);
 * `job` is the tab's setup job, whose own downloads are left out.
 * `cancel(downloadId)` stops one; it rejects when that fails.
 */
export function useDownloads(prefix, { job = null } = {}) {
  const [list, setList] = useState([]);
  const lastRef = useRef(new Map()); // downloadId → { status, subDir } as last seen
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    let next;
    try {
      next = (await localModelsApi.listDownloads())?.downloads || [];
    } catch {
      return;
    }
    if (!aliveRef.current) return;
    const seen = new Map(next.map((item) => [item.downloadId, item]));
    // A download that was going and has finished (or already left the list)
    // put a file on disk: the lists showing that folder load again.
    for (const [id, before] of lastRef.current) {
      if (before.status !== 'downloading') continue;
      const now = seen.get(id);
      if (!now || now.status === 'complete') notifyForSubDir(before.subDir);
    }
    lastRef.current = new Map(next.map((item) => [item.downloadId, { status: item.status, subDir: item.subDir }]));
    setList(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const off = onEvents([DOWNLOADS_EVENT, 'focus'], refresh);
    return () => {
      aliveRef.current = false;
      off();
    };
  }, [refresh]);

  const active = list.some((item) => item.status === 'downloading' && inFolder(item, prefix));
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const cancel = useCallback(async (downloadId) => {
    await localModelsApi.cancelDownload(downloadId);
    await refresh();
  }, [refresh]);

  const downloads = useMemo(() => downloadsFor(list, prefix, job), [list, prefix, job]);
  return { downloads, cancel, refresh };
}

export default useDownloads;
