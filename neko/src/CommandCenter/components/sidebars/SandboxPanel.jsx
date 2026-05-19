/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, File, Folder, GitBranch, Loader2, Play, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { filesApi, sandboxesApi } from '../../api';

function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', confirmClass, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">{title}</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ value }) {
  const ok = value === 'ready' || value === 'succeeded';
  const bad = value === 'failed' || value === 'deleted';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      ok
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
        : bad
          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
          : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
    }`}>
      {value || 'unknown'}
    </span>
  );
}

function shortPath(value = '') {
  const parts = String(value).split('/').filter(Boolean);
  if (parts.length <= 3) return value;
  return `.../${parts.slice(-3).join('/')}`;
}

export default function SandboxPanel() {
  const [sandboxes, setSandboxes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [diff, setDiff] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sandboxRoot, setSandboxRoot] = useState('');
  const [browserPath, setBrowserPath] = useState('.');
  const [browserEntry, setBrowserEntry] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [command, setCommand] = useState('npm test');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);

  const selected = useMemo(
    () => sandboxes.find(item => item.id === selectedId) || sandboxes[0] || null,
    [sandboxes, selectedId],
  );

  async function loadSandboxes(nextSelectedId = selectedId) {
    setError('');
    const res = await sandboxesApi.list();
    const list = res.sandboxes || [];
    setSandboxRoot(res.root || '');
    setSandboxes(list);
    setSelectedId(nextSelectedId || list[0]?.id || null);
  }

  async function loadReview(id = selected?.id, file = selectedFile) {
    if (!id) {
      setDiff(null);
      setJobs([]);
      return;
    }
    setError('');
    const [diffRes, jobsRes] = await Promise.all([
      sandboxesApi.diff(id, { file: file || null }).catch(err => ({ success: false, error: err.message })),
      sandboxesApi.listJobs(id).catch(() => ({ jobs: [] })),
    ]);
    if (diffRes.success === false) setError(diffRes.error || 'Could not load sandbox diff');
    else setDiff(diffRes);
    setJobs(jobsRes.jobs || []);
  }

  useEffect(() => {
    loadSandboxes().catch(err => setError(err.message || 'Could not load sandboxes'));
  }, []);

  useEffect(() => {
    setSelectedFile(null);
    setBrowserPath('.');
    setOpenFile(null);
    setBrowserEntry(null);
  }, [selectedId]);

  useEffect(() => {
    loadReview(selected?.id, selectedFile).catch(err => setError(err.message || 'Could not load sandbox review'));
  }, [selected?.id, selectedFile]);

  const sandboxRelativePath = useMemo(() => {
    if (!selected?.sandboxPath || !sandboxRoot) return null;
    const root = sandboxRoot.replace(/\/+$/, '');
    if (!selected.sandboxPath.startsWith(root)) return null;
    return selected.sandboxPath.slice(root.length).replace(/^\/+/, '') || '.';
  }, [selected?.sandboxPath, sandboxRoot]);

  async function loadBrowser(pathValue = browserPath) {
    if (!sandboxRelativePath) return;
    const rel = [sandboxRelativePath, pathValue === '.' ? '' : pathValue].filter(Boolean).join('/');
    const entry = await filesApi.loadEntry('sandboxes', rel, false, { limit: 500 });
    setBrowserEntry(entry);
    if (entry.type === 'file') setOpenFile(entry);
    else setOpenFile(null);
  }

  useEffect(() => {
    loadBrowser(browserPath).catch(err => setError(err.message || 'Could not load sandbox files'));
  }, [sandboxRelativePath, browserPath]);

  async function runAction(action) {
    if (!selected?.id || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await action(selected.id);
      if (res?.success === false) setError(res.error || res.message || 'Sandbox action failed');
      else setNotice(res?.message || 'Done');
      await loadSandboxes(selected.id);
      await loadReview(selected.id, selectedFile);
    } catch (err) {
      setError(err.message || 'Sandbox action failed');
    } finally {
      setBusy(false);
    }
  }

  async function createSandbox() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await sandboxesApi.create({ name: `Sandbox ${new Date().toLocaleTimeString()}`, strategy: 'auto' });
      const id = res.sandbox?.id;
      setNotice('Sandbox created');
      await loadSandboxes(id);
    } catch (err) {
      setError(err.message || 'Could not create sandbox');
    } finally {
      setBusy(false);
    }
  }

  const files = diff?.files || [];
  const selectedPatch = diff?.patch || '';
  const currentEntries = browserEntry?.type === 'dir' ? (browserEntry.entries || []) : [];
  const pathParts = browserPath === '.' ? [] : browserPath.split('/').filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConfirmModal
        open={!!modal}
        title={modal?.title}
        message={modal?.message}
        confirmLabel={modal?.confirmLabel}
        confirmClass={modal?.confirmClass}
        onConfirm={modal?.onConfirm}
        onCancel={() => setModal(null)}
      />
      <div className="shrink-0 border-b border-gray-100 p-3 dark:border-slate-800">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={createSandbox}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New
          </button>
          <button
            type="button"
            onClick={() => loadSandboxes().then(() => loadReview())}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <span className="ml-auto text-[10px] text-gray-400 dark:text-slate-500">{sandboxes.length}</span>
        </div>

        <div className="max-h-32 space-y-1 overflow-y-auto">
          {sandboxes.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                item.id === selected?.id
                  ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/60 dark:bg-indigo-950/20'
                  : 'border-gray-100 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-slate-100">{item.name}</span>
                <StatusPill value={item.status} />
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500">
                <GitBranch className="h-3 w-3" />
                <span className="truncate">{item.branchName || item.strategy}</span>
              </div>
            </button>
          ))}
          {!sandboxes.length && (
            <div className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400 dark:border-slate-800 dark:text-slate-500">
              No sandboxes
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-950/50 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mx-3 mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-950/50 dark:bg-emerald-950/20 dark:text-emerald-300">
          {notice}
        </div>
      )}

          {selected ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-slate-200">Files</h3>
              <button
                type="button"
                onClick={() => loadBrowser(browserPath)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="Refresh files"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mb-2 flex min-w-0 items-center gap-1 overflow-hidden rounded-md bg-gray-50 px-2 py-1 text-[10px] text-gray-500 dark:bg-slate-900 dark:text-slate-400">
              <button type="button" onClick={() => setBrowserPath('.')} className="shrink-0 hover:text-gray-800 dark:hover:text-slate-100">
                root
              </button>
              {pathParts.map((part, index) => {
                const nextPath = pathParts.slice(0, index + 1).join('/');
                return (
                  <span key={nextPath} className="flex min-w-0 items-center gap-1">
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <button type="button" onClick={() => setBrowserPath(nextPath)} className="truncate hover:text-gray-800 dark:hover:text-slate-100">
                      {part}
                    </button>
                  </span>
                );
              })}
            </div>
            {browserPath !== '.' && !openFile && (
              <button
                type="button"
                onClick={() => {
                  const next = pathParts.slice(0, -1).join('/');
                  setBrowserPath(next || '.');
                }}
                className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-900"
              >
                ..
              </button>
            )}
            {openFile ? (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFile(null);
                      const parent = browserPath.split('/').slice(0, -1).join('/');
                      setBrowserPath(parent || '.');
                    }}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                  >
                    Back
                  </button>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700 dark:text-slate-200">{openFile.path?.replace(`${sandboxRelativePath}/`, '')}</span>
                </div>
                <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-100">
                  {openFile.tooLarge ? 'File is too large to preview.' : openFile.binary ? 'Binary file preview is not available.' : openFile.content || ''}
                </pre>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border border-gray-100 dark:border-slate-800">
                {currentEntries.map(entry => {
                  const relPath = entry.path.replace(`${sandboxRelativePath}/`, '');
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => {
                        if (entry.type === 'dir') setBrowserPath(relPath || '.');
                        else setBrowserPath(relPath);
                      }}
                      className="flex w-full items-center gap-2 border-b border-gray-50 px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-900"
                    >
                      {entry.type === 'dir' ? <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <File className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                      <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-slate-200">{entry.name}</span>
                      {entry.type === 'file' && <span className="text-[10px] text-gray-400">{entry.ext || 'file'}</span>}
                    </button>
                  );
                })}
                {!currentEntries.length && (
                  <div className="px-3 py-3 text-center text-xs text-gray-400 dark:text-slate-500">No files</div>
                )}
              </div>
            )}
          </section>

          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-slate-200">Changes</h3>
              <span className="text-[10px] text-gray-400 dark:text-slate-500">{diff?.summary?.changed || files.length} files</span>
            </div>
            <div className="space-y-1">
              {files.map(file => (
                <button
                  key={`${file.status}-${file.path}`}
                  type="button"
                  onClick={() => setSelectedFile(file.path)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    selectedFile === file.path
                      ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="w-7 shrink-0 font-mono text-[10px]">{file.status.trim() || 'M'}</span>
                  <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                </button>
              ))}
              {!files.length && (
                <div className="rounded-md bg-gray-50 px-3 py-3 text-center text-xs text-gray-400 dark:bg-slate-900 dark:text-slate-500">
                  No changes
                </div>
              )}
            </div>
          </section>

          {selectedFile && (
            <section className="mb-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="min-w-0 truncate text-xs font-semibold text-gray-700 dark:text-slate-200">{shortPath(selectedFile)}</h3>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  title="Close diff"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-100">
                {selectedPatch || 'No text diff'}
              </pre>
            </section>
          )}

          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-200">Run</h3>
            <div className="flex gap-1.5">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 font-mono text-xs text-gray-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                spellCheck={false}
              />
              <button
                type="button"
                disabled={busy || !command.trim()}
                onClick={() => runAction(id => sandboxesApi.runJob(id, { command, kind: 'test' }))}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
                title="Run"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              </button>
            </div>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-200">Promote</h3>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => runAction(id => sandboxesApi.apply(id, { dryRun: true }))}
                disabled={busy || !files.length}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Check
              </button>
              <button
                type="button"
                onClick={() => runAction(id => sandboxesApi.createPatch(id))}
                disabled={busy || !files.length}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Patch
              </button>
              <button
                type="button"
                onClick={() => runAction(id => sandboxesApi.commitBranch(id))}
                disabled={busy || !files.length}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <GitBranch className="h-3 w-3" />
                Branch
              </button>
              <button
                type="button"
                onClick={() => setModal({
                  title: 'Apply changes',
                  message: 'Apply sandbox changes to the source workspace? This cannot be undone.',
                  confirmLabel: 'Apply',
                  confirmClass: 'inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500',
                  onConfirm: () => { setModal(null); runAction(id => sandboxesApi.apply(id)); },
                })}
                disabled={busy || !files.length}
                className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                <CheckCircle2 className="h-3 w-3" />
                Apply
              </button>
              <button
                type="button"
                onClick={() => setModal({
                  title: 'Delete sandbox',
                  message: 'This sandbox and all its changes will be permanently deleted.',
                  confirmLabel: 'Delete',
                  confirmClass: 'inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-500',
                  onConfirm: () => { setModal(null); runAction(id => sandboxesApi.delete(id, { force: true })); },
                })}
                disabled={busy}
                className="col-span-2 inline-flex items-center justify-center gap-1 rounded-md border border-rose-200 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-950/20"
              >
                <Trash2 className="h-3 w-3" />
                Reject
              </button>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-slate-200">Jobs</h3>
              <span className="text-[10px] text-gray-400 dark:text-slate-500">{jobs.length}</span>
            </div>
            <div className="space-y-2">
              {jobs.map(job => (
                <details key={job.id} className="rounded-md border border-gray-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-950/40">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center gap-2">
                      <StatusPill value={job.status} />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700 dark:text-slate-200">{job.command}</span>
                      <span className="text-[10px] text-gray-400">{job.exitCode ?? '-'}</span>
                    </div>
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-[10px] leading-relaxed text-slate-100">
                    {[job.stdout, job.stderr].filter(Boolean).join('\n') || 'No output'}
                  </pre>
                </details>
              ))}
              {!jobs.length && (
                <div className="rounded-md bg-gray-50 px-3 py-3 text-center text-xs text-gray-400 dark:bg-slate-900 dark:text-slate-500">
                  No jobs
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-400 dark:text-slate-500">
          Select or create a sandbox
        </div>
      )}
    </div>
  );
}
