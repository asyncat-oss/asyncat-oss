// One file's changes in a dialog: in the working tree, staged, or in a
// commit (`compare` is the commit's hash).

import { useEffect, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { gitApi } from '../../api';
import Dialog from '../../../components/ui/Dialog.jsx';
import Button from '../../../components/ui/Button.jsx';
import Notice from '../../../components/ui/Notice.jsx';
import UnifiedDiffViewer from '../code/UnifiedDiffViewer';
import { diffDescription } from './gitLabels.js';

export default function DiffModal({ file, staged = false, compare = null, workingDir = null, onClose }) {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    gitApi.getDiff({ file: file.path, staged, compare, path: workingDir })
      .then(res => {
        if (!cancelled) setDiff(res);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Could not load diff');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [file, staged, compare, workingDir]);

  const copyDiff = async () => {
    try {
      await navigator.clipboard.writeText(diff?.diff || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  if (!file) return null;

  return (
    <Dialog
      open
      size="xl"
      title={String(file.path || '').split('/').pop() || file.path}
      description={diffDescription(file.path, { staged, compare })}
      onClose={onClose}
      footer={(
        <Button variant="ghost" icon={copied ? Check : Copy} onClick={copyDiff} disabled={!diff?.diff}>
          {copied ? 'Copied' : 'Copy diff'}
        </Button>
      )}
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-fg-subtle">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !error && (
        diff?.diff
          ? <UnifiedDiffViewer diff={diff.diff} filePath={file.path} />
          : <p className="py-8 text-center text-[13px] text-fg-subtle">No changes to show for this file.</p>
      )}
    </Dialog>
  );
}
