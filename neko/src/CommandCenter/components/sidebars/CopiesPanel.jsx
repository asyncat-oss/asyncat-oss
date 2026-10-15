// Code panel → Copies: copies of the project (a git worktree or a plain
// folder copy) to try changes in, review, and bring back.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, File, Folder, GitBranch, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { filesApi, sandboxesApi } from '../../api';
import { useConfirm } from '../../../components/confirmContext';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import Checkbox from '../../../components/ui/Checkbox.jsx';
import Notice from '../../../components/ui/Notice.jsx';
import { Input } from '../../../components/ui/Field.jsx';
import UnifiedDiffViewer from '../code/UnifiedDiffViewer';

const STATUS_TONES = {
  ready: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  succeeded: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
  deleted: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

function StatusPill({ value }) {
  const label = value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[11px] font-medium leading-4 ${STATUS_TONES[value] || 'bg-hover text-fg-muted'}`}>
      {label}
    </span>
  );
}

function SectionTitle({ children, aside = null }) {
  return (
    <div className="mb-1.5 flex min-h-7 items-center justify-between gap-2">
      <h3 className="min-w-0 truncate text-[13px] font-semibold text-fg">{children}</h3>
      {aside}
    </div>
  );
}

const PRE_CLASS = 'overflow-auto rounded-lg border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-fg';

function shortPath(value = '') {
  const parts = String(value).split('/').filter(Boolean);
  if (parts.length <= 3) return value;
  return `.../${parts.slice(-3).join('/')}`;
}

function isMissingSandboxPathError(value = '') {
  return /sandbox path no longer exists|copy's folder no longer exists/i.test(String(value || ''));
}

export default function CopiesPanel() {
  const [sandboxes, setSandboxes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [diff, setDiff] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [sandboxRoot, setSandboxRoot] = useState('');
  const [browserPath, setBrowserPath] = useState('.');
  const [browserEntry, setBrowserEntry] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [command, setCommand] = useState('npm test');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const confirm = useConfirm();

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
    if (selected?.id === id && selected.exists === false) {
      setDiff(null);
      setJobs([]);
      setError("This copy's folder no longer exists.");
      return;
    }
    setError('');
    const [diffRes, jobsRes] = await Promise.all([
      sandboxesApi.diff(id, { file: file || null }).catch(err => ({ success: false, error: err.message })),
      sandboxesApi.listJobs(id).catch(() => ({ jobs: [] })),
    ]);
    if (diffRes.success === false) {
      setDiff(null);
      setError(diffRes.error || "Couldn't load the copy's changes");
    } else {
      setDiff(diffRes);
    }
    setJobs(jobsRes.jobs || []);
  }

  useEffect(() => {
    loadSandboxes().catch(err => setError(err.message || "Couldn't load the copies"));
  }, []);

  useEffect(() => {
    setSelectedFile(null);
    setSelectedPaths([]);
    setBrowserPath('.');
    setOpenFile(null);
    setBrowserEntry(null);
  }, [selectedId]);

  useEffect(() => {
    loadReview(selected?.id, selectedFile).catch(err => setError(err.message || "Couldn't load the copy's changes"));
  }, [selected?.id, selectedFile]);

  const sandboxRelativePath = useMemo(() => {
    if (!selected?.sandboxPath || !sandboxRoot) return null;
    const root = sandboxRoot.replace(/\/+$/, '');
    if (!selected.sandboxPath.startsWith(root)) return null;
    return selected.sandboxPath.slice(root.length).replace(/^\/+/, '') || '.';
  }, [selected?.sandboxPath, sandboxRoot]);

  async function loadBrowser(pathValue = browserPath) {
    if (!sandboxRelativePath || selected?.exists === false) {
      setBrowserEntry(null);
      setOpenFile(null);
      return;
    }
    const rel = [sandboxRelativePath, pathValue === '.' ? '' : pathValue].filter(Boolean).join('/');
    const entry = await filesApi.loadEntry('sandboxes', rel, false, { limit: 500 });
    setBrowserEntry(entry);
    if (entry.type === 'file') setOpenFile(entry);
    else setOpenFile(null);
  }

  useEffect(() => {
    loadBrowser(browserPath).catch(err => setError(err.message || "Couldn't load the copy's files"));
  }, [sandboxRelativePath, browserPath, selected?.exists]);

  async function runAction(action) {
    if (!selected?.id || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await action(selected.id);
      if (res?.success === false) setError(res.error || res.message || "That didn't work");
      else setNotice(res?.message || 'Done');
      await loadSandboxes(selected.id);
      await loadReview(selected.id, selectedFile);
    } catch (err) {
      setError(err.message || "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  async function createSandbox() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await sandboxesApi.create({ name: `Copy ${new Date().toLocaleTimeString()}`, strategy: 'auto' });
      const id = res.sandbox?.id;
      setNotice('Copy made');
      await loadSandboxes(id);
    } catch (err) {
      setError(err.message || "Couldn't make a copy");
    } finally {
      setBusy(false);
    }
  }

  const files = diff?.files || [];
  const selectedPatch = diff?.patch || '';
  const currentEntries = browserEntry?.type === 'dir' ? (browserEntry.entries || []) : [];
  const pathParts = browserPath === '.' ? [] : browserPath.split('/').filter(Boolean);
  const selectedPathSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const promoteFilePaths = selectedPaths.length > 0 ? selectedPaths : [];
  const promoteScope = selectedPaths.length > 0
    ? `${selectedPaths.length} selected file${selectedPaths.length === 1 ? '' : 's'}`
    : 'all changes';
  const staleSandbox = Boolean(selected && (selected.exists === false || isMissingSandboxPathError(error)));

  useEffect(() => {
    if (!files.length || selectedPaths.length === 0) return;
    const valid = new Set(files.map(file => file.path));
    const next = selectedPaths.filter(filePath => valid.has(filePath));
    if (next.length !== selectedPaths.length) setSelectedPaths(next);
  }, [files, selectedPaths]);

  function toggleSelectedPath(filePath) {
    setSelectedPaths(prev => (
      prev.includes(filePath)
        ? prev.filter(item => item !== filePath)
        : [...prev, filePath]
    ));
  }

  function toggleAllChangedPaths() {
    if (!files.length) return;
    if (selectedPaths.length === files.length) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(files.map(file => file.path));
    }
  }

  async function askThenRun(question, action) {
    if (await confirm(question)) runAction(action);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line p-3">
        <div className="mb-2 flex items-center gap-1">
          <Button variant="secondary" size="xs" icon={Plus} loading={busy} onClick={createSandbox}>
            New
          </Button>
          <IconButton size="sm" icon={RefreshCw} label="Refresh" onClick={() => loadSandboxes().then(() => loadReview())} />
          <span className="ml-auto text-[12px] tabular-nums text-fg-subtle">{sandboxes.length}</span>
        </div>

        <div className="-mx-1 max-h-32 space-y-px overflow-y-auto">
          {sandboxes.map(item => {
            const current = item.id === selected?.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-current={current ? 'true' : undefined}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  current ? 'bg-selected' : 'hover:bg-hover'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate text-[13px] ${current ? 'font-medium text-fg' : 'text-fg'}`}>{item.name}</span>
                  <StatusPill value={item.status} />
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-subtle">
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.branchName || item.strategy}</span>
                </div>
              </button>
            );
          })}
          {!sandboxes.length && (
            <p className="mx-1 rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-[12px] text-fg-subtle">
              No copies yet
            </p>
          )}
        </div>
      </div>

      {error && !staleSandbox && <Notice tone="error" className="mx-3 mt-3">{error}</Notice>}
      {staleSandbox && selected && (
        <div className="mx-3 mt-3 space-y-2">
          <Notice tone="warning">
            <span className="font-medium">This copy&apos;s folder is gone.</span> Its folder was already removed. Remove it from the list.
          </Notice>
          <Button
            variant="secondary"
            size="xs"
            icon={Trash2}
            disabled={busy}
            onClick={() => askThenRun({
              title: 'Remove this copy from the list?',
              message: "Its folder is already gone; this only removes it from Asyncat's list.",
              confirmLabel: 'Remove',
              destructive: true,
            }, id => sandboxesApi.delete(id, { force: true }))}
          >
            Remove from list
          </Button>
        </div>
      )}
      {notice && (
        <p className="mx-3 mt-3 flex items-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400" role="status">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {notice}
        </p>
      )}

      {selected ? (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
          {!staleSandbox && <section>
            <SectionTitle aside={<IconButton size="sm" icon={RefreshCw} label="Refresh files" onClick={() => loadBrowser(browserPath)} />}>
              Files
            </SectionTitle>
            <nav aria-label="Folder" className="mb-1 flex min-w-0 items-center gap-1 overflow-hidden text-[12px] text-fg-muted">
              <button type="button" onClick={() => setBrowserPath('.')} className="shrink-0 rounded-md px-1 py-0.5 hover:bg-hover hover:text-fg">
                root
              </button>
              {pathParts.map((part, index) => {
                const nextPath = pathParts.slice(0, index + 1).join('/');
                return (
                  <span key={nextPath} className="flex min-w-0 items-center gap-1">
                    <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle" />
                    <button type="button" onClick={() => setBrowserPath(nextPath)} className="truncate rounded-md px-1 py-0.5 hover:bg-hover hover:text-fg">
                      {part}
                    </button>
                  </span>
                );
              })}
            </nav>
            {browserPath !== '.' && !openFile && (
              <button
                type="button"
                onClick={() => {
                  const next = pathParts.slice(0, -1).join('/');
                  setBrowserPath(next || '.');
                }}
                className="-mx-1 flex min-h-8 w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-fg-subtle hover:bg-hover hover:text-fg"
                title="Up one folder"
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                ..
              </button>
            )}
            {openFile ? (
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={ArrowLeft}
                    className="-ml-1"
                    onClick={() => {
                      setOpenFile(null);
                      const parent = browserPath.split('/').slice(0, -1).join('/');
                      setBrowserPath(parent || '.');
                    }}
                  >
                    Back
                  </Button>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-muted">{openFile.path?.replace(`${sandboxRelativePath}/`, '')}</span>
                </div>
                <pre className={`max-h-80 ${PRE_CLASS}`}>
                  {openFile.tooLarge ? 'This file is too large to preview.' : openFile.binary ? 'This file isn’t text, so there’s no preview.' : openFile.content || ''}
                </pre>
              </div>
            ) : (
              <div className="-mx-1 max-h-64 space-y-px overflow-y-auto">
                {currentEntries.map(entry => {
                  const relPath = entry.path.replace(`${sandboxRelativePath}/`, '');
                  const Icon = entry.type === 'dir' ? Folder : File;
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => {
                        if (entry.type === 'dir') setBrowserPath(relPath || '.');
                        else setBrowserPath(relPath);
                      }}
                      className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] hover:bg-hover"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-fg">{entry.name}</span>
                      {entry.type === 'file' && <span className="text-[11px] text-fg-subtle">{entry.ext || 'file'}</span>}
                    </button>
                  );
                })}
                {!currentEntries.length && (
                  <p className="px-2.5 py-2 text-[12px] text-fg-subtle">No files</p>
                )}
              </div>
            )}
          </section>}

          {!staleSandbox && <section>
            <SectionTitle
              aside={files.length ? (
                <label className="flex items-center gap-1.5 text-[12px] tabular-nums text-fg-subtle">
                  <Checkbox
                    checked={selectedPaths.length === files.length && files.length > 0}
                    onChange={toggleAllChangedPaths}
                    aria-label={selectedPaths.length === files.length ? 'Clear selected files' : 'Select all changed files'}
                  />
                  {selectedPaths.length ? `${selectedPaths.length}/${files.length}` : `${diff?.summary?.changed || files.length} files`}
                </label>
              ) : null}
            >
              Changes
            </SectionTitle>
            <div className="-mx-1 space-y-px">
              {files.map(file => {
                const open = selectedFile === file.path;
                return (
                  <div key={`${file.status}-${file.path}`} className={`flex items-center gap-2 rounded-lg pl-2.5 transition-colors ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
                    <Checkbox
                      checked={selectedPathSet.has(file.path)}
                      onChange={() => toggleSelectedPath(file.path)}
                      aria-label={selectedPathSet.has(file.path) ? `Leave ${file.path} out` : `Include ${file.path}`}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedFile(file.path)}
                      aria-pressed={open}
                      className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-r-lg pr-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <span className="w-6 shrink-0 font-mono text-[11px] text-fg-subtle">{file.status.trim() || 'M'}</span>
                      <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${open ? 'text-fg' : 'text-fg'}`}>{file.path}</span>
                    </button>
                  </div>
                );
              })}
              {!files.length && (
                <p className="px-1 text-[12px] text-fg-subtle">No changes</p>
              )}
            </div>
          </section>}

          {!staleSandbox && selectedFile && (
            <section>
              <SectionTitle aside={<IconButton size="sm" icon={X} label="Close diff" onClick={() => setSelectedFile(null)} />}>
                <span className="font-mono text-[12px] font-medium">{shortPath(selectedFile)}</span>
              </SectionTitle>
              {selectedPatch
                ? <UnifiedDiffViewer diff={selectedPatch} filePath={selectedFile} className="max-h-72 overflow-y-auto" />
                : <p className="text-[12px] text-fg-subtle">No text diff</p>}
            </section>
          )}

          {!staleSandbox && <section>
            <SectionTitle>Run</SectionTitle>
            <div className="flex gap-1.5">
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                aria-label="Command to run in the copy"
                className="!h-8 min-w-0 flex-1 font-mono !text-[12px]"
                spellCheck={false}
              />
              <Button variant="secondary" icon={Play} loading={busy} disabled={!command.trim()} onClick={() => runAction(id => sandboxesApi.runJob(id, { command, kind: 'test' }))}>
                Run
              </Button>
            </div>
          </section>}

          {!staleSandbox && <section>
            <SectionTitle aside={<span className="truncate text-[12px] text-fg-subtle">{promoteScope}</span>}>
              Promote
            </SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="secondary"
                onClick={() => runAction(id => sandboxesApi.apply(id, { filePaths: promoteFilePaths, dryRun: true }))}
                disabled={busy || !files.length}
              >
                Check
              </Button>
              <Button
                variant="secondary"
                onClick={() => runAction(id => sandboxesApi.createPatch(id, { filePaths: promoteFilePaths }))}
                disabled={busy || !files.length}
              >
                Patch
              </Button>
              <Button
                variant="secondary"
                icon={GitBranch}
                onClick={() => runAction(id => sandboxesApi.commitBranch(id, { filePaths: promoteFilePaths }))}
                disabled={busy || !files.length}
              >
                Branch
              </Button>
              <Button
                variant="primary"
                icon={Check}
                onClick={() => askThenRun({
                  title: 'Apply changes?',
                  message: `Apply ${promoteScope} to the source workspace? This cannot be undone.`,
                  confirmLabel: 'Apply',
                }, id => sandboxesApi.apply(id, { filePaths: promoteFilePaths }))}
                disabled={busy || !files.length}
              >
                Apply
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                className="col-span-2"
                onClick={() => askThenRun({
                  title: 'Delete this copy?',
                  message: 'The copy and all its changes are deleted for good.',
                  confirmLabel: 'Delete',
                  destructive: true,
                }, id => sandboxesApi.delete(id, { force: true }))}
                disabled={busy}
              >
                Reject
              </Button>
            </div>
          </section>}

          <section>
            <SectionTitle aside={<span className="text-[12px] tabular-nums text-fg-subtle">{jobs.length}</span>}>Jobs</SectionTitle>
            <div className="space-y-1.5">
              {jobs.map(job => (
                <details key={job.id} className="group rounded-lg border border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-hover [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform group-open:rotate-90" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{job.command}</span>
                    <StatusPill value={job.status} />
                    <span className="w-5 text-right text-[11px] tabular-nums text-fg-subtle" title="Exit code">{job.exitCode ?? '-'}</span>
                  </summary>
                  <pre className={`m-2 mt-0 max-h-48 ${PRE_CLASS}`}>
                    {[job.stdout, job.stderr].filter(Boolean).join('\n') || 'No output'}
                  </pre>
                </details>
              ))}
              {!jobs.length && (
                <p className="text-[12px] text-fg-subtle">No jobs</p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-fg-subtle">
          Pick a copy, or make one with New
        </p>
      )}
    </div>
  );
}
