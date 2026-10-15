// Git → Stashes: saved changes, to bring back (pop) or throw away (drop).

import { useCallback, useState, useEffect } from 'react';
import { Loader2, Trash2, ArrowUpFromLine } from 'lucide-react';
import { gitApi } from '../../api';
import IconButton from '../../../components/ui/IconButton.jsx';
import Notice from '../../../components/ui/Notice.jsx';

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
      <div className="flex h-32 items-center justify-center gap-2 text-[13px] text-fg-subtle">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {error && <Notice tone="error" className="mx-3 mt-2">{error}</Notice>}

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {stashes.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-fg">No stashes</p>
            <p className="mt-1 text-[12px] text-fg-subtle">Stashed changes wait here until you bring them back.</p>
          </div>
        ) : (
          <div className="space-y-px">
            {stashes.map((stash) => (
              <div
                key={stash.index}
                className="group flex items-center gap-2 rounded-lg py-1 pl-2.5 pr-1 transition-colors hover:bg-hover"
              >
                <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                  stash@&#123;{stash.index}&#125;
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg" title={stash.message}>
                  {stash.message}
                </span>
                <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <IconButton
                    size="sm"
                    icon={ArrowUpFromLine}
                    loading={busyIndex === stash.index}
                    label="Pop stash (apply and drop)"
                    onClick={() => handleAction('pop', stash.index)}
                    disabled={busyIndex !== null}
                  />
                  <IconButton
                    size="sm"
                    icon={Trash2}
                    label="Drop stash"
                    onClick={() => handleAction('drop', stash.index)}
                    disabled={busyIndex !== null}
                    className="hover:!text-red-600 dark:hover:!text-red-400"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
