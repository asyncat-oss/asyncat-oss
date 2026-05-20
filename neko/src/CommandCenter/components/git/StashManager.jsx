/* eslint-disable react/prop-types */
import { useCallback, useState, useEffect } from 'react';
import { Loader2, AlertCircle, Inbox, Trash2, ArrowUpFromLine } from 'lucide-react';
import { gitApi } from '../../api';

export default function StashManager({ onRefresh, workingDir = null }) {
  const [stashes, setStashes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyIndex, setBusyIndex] = useState(null);

  const fetchStashes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await gitApi.stash({ action: 'list', path: workingDir });
      if (res.success) {
        setStashes(res.stashes || []);
      } else {
        setError(res.error || 'Failed to list stashes');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workingDir]);

  useEffect(() => {
    fetchStashes();
  }, [fetchStashes]);

  const handleAction = async (action, index) => {
    try {
      setBusyIndex(index);
      const res = await gitApi.stash({ action, index, path: workingDir });
      if (!res.success) {
        setError(res.error || `Failed to ${action} stash`);
      }
      await fetchStashes();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyIndex(null);
    }
  };

  if (loading && stashes.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-500 midnight:text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading stashes...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {error && (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-md bg-red-500/10 p-2 text-xs font-medium text-red-500 midnight:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 truncate">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {stashes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 midnight:text-slate-500">
            <Inbox className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-sm font-medium">No stashes found</p>
            <p className="mt-1 text-xs opacity-70">Your stash list is clean.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stashes.map((stash) => (
              <div
                key={stash.index}
                className="group relative flex flex-col gap-1 rounded-md border border-gray-200 bg-white/50 p-2 text-sm shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-800/60 dark:bg-[#0b1220]/50 dark:hover:bg-slate-800/80 midnight:border-slate-800/60 midnight:bg-slate-950/60 midnight:hover:bg-slate-800/80"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 midnight:bg-indigo-500/20 midnight:text-indigo-400">
                      stash@&#123;{stash.index}&#125;
                    </span>
                    <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200 midnight:text-slate-200" title={stash.message}>
                      {stash.message}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleAction('pop', stash.index)}
                      disabled={busyIndex !== null}
                      title="Pop Stash (Apply and Drop)"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10 midnight:text-emerald-400 midnight:hover:bg-emerald-500/10"
                    >
                      {busyIndex === stash.index ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => handleAction('drop', stash.index)}
                      disabled={busyIndex !== null}
                      title="Drop Stash"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 midnight:text-red-400 midnight:hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
