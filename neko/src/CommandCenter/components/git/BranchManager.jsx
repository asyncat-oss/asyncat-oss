// The branch button in the Git panel: a list of branches to switch to, and
// a field to create one.

import { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, Loader2, Plus, Check } from 'lucide-react';
import { gitApi } from '../../api';
import Popover from '../../../components/ui/Popover.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import Button from '../../../components/ui/Button.jsx';
import Notice from '../../../components/ui/Notice.jsx';
import { Input } from '../../../components/ui/Field.jsx';

export default function BranchManager({ currentBranch, onSwitch, workingDir = null }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [busyBranch, setBusyBranch] = useState(null);
  const anchorRef = useRef(null);
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

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
    setNewBranchName('');
  }, []);

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
    <>
      <IconButton
        ref={anchorRef}
        size="sm"
        icon={GitBranch}
        label="Manage branches"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
      />
      <Popover anchorRef={anchorRef} open={open} onClose={close} label="Branches" placement="bottom-end" width={256} className="!p-1.5">
        <div className="flex items-center justify-between gap-2 py-0.5 pl-2">
          <span className="text-[13px] font-semibold text-fg">Branches</span>
          <IconButton size="sm" icon={Plus} label="Create branch" onClick={() => setCreating(v => !v)} />
        </div>

        {creating && (
          <form
            className="flex items-center gap-1.5 px-1 pb-1.5 pt-1"
            onSubmit={(event) => { event.preventDefault(); handleCreate(); }}
          >
            <Input
              ref={inputRef}
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              placeholder="new-branch-name"
              aria-label="New branch name"
              spellCheck={false}
              className="!h-8 min-w-0 flex-1 font-mono !text-[12px]"
            />
            <Button type="submit" variant="primary" size="sm" loading={busyBranch === '__create__'} disabled={!newBranchName.trim()}>
              Create
            </Button>
          </form>
        )}

        {error && <Notice tone="error" className="mx-1 mb-1.5 !text-[12px]">{error}</Notice>}

        <div className="max-h-56 overflow-y-auto border-t border-line pt-1">
          {loading && branches.length === 0 && (
            <div className="flex items-center justify-center gap-1.5 py-4 text-[12px] text-fg-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          )}
          {branches.map(branch => (
            <button
              key={branch.name}
              type="button"
              onClick={() => handleSwitch(branch.name)}
              disabled={busyBranch === branch.name}
              aria-current={branch.current ? 'true' : undefined}
              className={`flex min-h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] outline-none transition-colors hover:bg-hover focus-visible:bg-hover ${
                branch.current ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>
              {busyBranch === branch.name && <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-subtle" />}
              {branch.current && <Check className="h-3.5 w-3.5 shrink-0 text-fg" aria-label="Current branch" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
