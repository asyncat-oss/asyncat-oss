/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, X, Copy, Check, FileCode } from 'lucide-react';
import { gitApi } from '../../api';
import Portal from '../../../components/Portal';
import UnifiedDiffViewer from '../code/UnifiedDiffViewer';

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

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const copyDiff = async () => {
    try {
      await navigator.clipboard.writeText(diff?.diff || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  if (!file) return null;

  const title = compare
    ? `${file.path} — ${compare.slice(0, 7)}`
    : file.path;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <div
          className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800 midnight:border-slate-800">
            <div className="flex min-w-0 items-center gap-2">
              <FileCode className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 midnight:text-slate-400" />
              <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100" title={title}>
                {title}
              </span>
              {diff && (
                <span className="shrink-0 text-[10px] tabular-nums text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                  +{diff.additions || 0} -{diff.deletions || 0}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={copyDiff}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
                title="Copy diff"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-auto bg-gray-50 dark:bg-[#0b1220] midnight:bg-slate-950">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 midnight:text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading diff...
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-300 midnight:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {!loading && !error && (
              diff?.diff
                ? <UnifiedDiffViewer diff={diff.diff} filePath={file.path} className="rounded-none border-0" />
                : <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-slate-600 midnight:text-slate-600">No diff available for this file.</div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
