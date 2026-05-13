/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, Loader2, Plus, Check, AlertCircle } from 'lucide-react';
import { gitApi } from '../api';

export default function BranchManager({ currentBranch, onSwitch, workingDir = null }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [busyBranch, setBusyBranch] = useState(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await gitApi.branches({ path: workingDir });
      if (res.success) {
        setBranches(res.branches || []);
      } else {
        setError(res.error || 'Failed to load branches');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workingDir]);

  useEffect(() => {
    if (open) fetchBranches();
  }, [open, fetchBranches]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
        setCreating(false);
        setNewBranchName('');
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  const handleSwitch = async (name) => {
    if (name === currentBranch) {
      setOpen(false);
      return;
    }
    try {
      setBusyBranch(name);
      const res = await gitApi.branch({ action: 'switch', name, path: workingDir });
      if (!res.success) {
        setError(res.error || 'Failed to switch branch');
      } else {
        setOpen(false);
        onSwitch?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyBranch(null);
    }
  };

  const handleCreate = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    try {
      setBusyBranch('__create__');
      const res = await gitApi.branch({ action: 'create', name, path: workingDir });
      if (!res.success) {
        setError(res.error || 'Failed to create branch');
      } else {
        setNewBranchName('');
        setCreating(false);
        await fetchBranches();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyBranch(null);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        title="Manage branches"
      >
        <GitBranch className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-gray-100 px-3 py-2 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Branches</span>
              <button
                type="button"
                onClick={() => setCreating(v => !v)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="Create branch"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          {creating && (
            <div className="border-b border-gray-100 px-3 py-2 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="new-branch-name"
                  className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-gray-400 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newBranchName.trim() || busyBranch === '__create__'}
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                >
                  {busyBranch === '__create__' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mx-2 mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-600 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto py-1">
            {loading && branches.length === 0 && (
              <div className="flex items-center justify-center py-4 text-xs text-gray-400">
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Loading...
              </div>
            )}
            {branches.map(branch => (
              <button
                key={branch.name}
                type="button"
                onClick={() => handleSwitch(branch.name)}
                disabled={busyBranch === branch.name}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  branch.current
                    ? 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <GitBranch className={`h-3 w-3 shrink-0 ${branch.current ? 'text-sky-500' : 'text-gray-400 dark:text-slate-500'}`} />
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {busyBranch === branch.name && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                {branch.current && <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-sky-600 dark:text-sky-400">Current</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
