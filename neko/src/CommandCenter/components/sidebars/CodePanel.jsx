// The side panel's Code tab: the Project folder's files, code search, the
// open file's outline, Git, and copies of the project.

import { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { ArrowLeft, ChevronRight, File, Folder, Loader2, RefreshCw } from 'lucide-react';
import { filesApi } from '../../api';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import Notice from '../../../components/ui/Notice.jsx';
import { Segmented } from '../../../components/ui/Tabs.jsx';
import GitPanel from '../git/GitPanel';
import CopiesPanel from './CopiesPanel';
import CodeSearchPanel from '../code/CodeSearchPanel';
import SymbolOutlinePanel from '../code/SymbolOutlinePanel';

// Lazy-load Monaco viewer to keep initial bundle smaller
const SyntaxFileViewer = lazy(() => import('../code/SyntaxFileViewer'));

// ── File icon: one neutral icon for folders, one for files ────────────────────

function FileIcon({ isDir }) {
  const Icon = isDir ? Folder : File;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />;
}

function formatSize(size) {
  if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}

// ── Workspace file browser ────────────────────────────────────────────────────

function basename(pathValue = '') {
  const parts = String(pathValue || '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || 'workspace';
}

function joinRelativePath(parent = '.', child = '') {
  const cleanParent = !parent || parent === '.' ? '' : String(parent).replace(/\/+$/, '');
  const cleanChild = !child || child === '.' ? '' : String(child).replace(/^\/+/, '');
  if (!cleanParent) return cleanChild || '.';
  if (!cleanChild) return cleanParent;
  return `${cleanParent}/${cleanChild}`;
}

function relativeToContext(entryPath = '.', contextPath = '.') {
  if (!contextPath || contextPath === '.') return entryPath || '.';
  const prefix = `${String(contextPath).replace(/\/+$/, '')}/`;
  if (entryPath === contextPath) return '.';
  return String(entryPath || '').startsWith(prefix)
    ? String(entryPath).slice(prefix.length) || '.'
    : entryPath || '.';
}

function contextKeyFor(workingContext, workingDir) {
  return `${workingContext?.rootId || 'none'}:${workingContext?.relativePath || '.'}:${workingDir || ''}`;
}

function WorkspaceFilesBrowser({ onFileOpen, navigateTo, workingContext = null }) {
  const rootId = workingContext?.rootId || null;
  const basePath = workingContext?.relativePath || '.';
  const contextLabel = workingContext?.relativePath && workingContext.relativePath !== '.'
    ? basename(workingContext.relativePath)
    : workingContext?.rootLabel || 'Project folder';
  // No Project means no implicit global filesystem fallback.
  const noWorkspace = !rootId || workingContext?.rootId === 'none' || workingContext?.noWorkspace === true;
  const [entryPath, setEntryPath] = useState('.');
  const [entry, setEntry] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const onFileOpenRef = useRef(onFileOpen);

  useEffect(() => {
    onFileOpenRef.current = onFileOpen;
  }, [onFileOpen]);

  const load = useCallback(async (pathValue = entryPath) => {
    if (noWorkspace) {
      setEntry(null);
      setOpenFile(null);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await filesApi.loadEntry(rootId, joinRelativePath(basePath, pathValue || '.'), false, { limit: 800 });
      setEntry(res);
      if (res.type === 'file') {
        const contextPath = relativeToContext(res.path, basePath);
        setOpenFile({ ...res, contextPath });
        onFileOpenRef.current?.({ ...res, contextPath });
      } else {
        setOpenFile(null);
        onFileOpenRef.current?.(null);
      }
    } catch (err) {
      setError(err.message || 'Could not load files');
    } finally {
      setLoading(false);
    }
  }, [basePath, entryPath, noWorkspace, rootId]);

  useEffect(() => { load(entryPath); }, [entryPath, load]);

  useEffect(() => {
    if (navigateTo) setEntryPath(navigateTo);
  }, [navigateTo]);

  useEffect(() => {
    setEntryPath('.');
    setEntry(null);
    setOpenFile(null);
    onFileOpen?.(null);
  }, [basePath, rootId]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = entry?.type === 'dir' ? (entry.entries || []) : [];
  const parts = entryPath === '.' ? [] : entryPath.split('/').filter(Boolean);

  // Sort: dirs first, then files, both alphabetically
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Breadcrumb */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line py-1.5 pl-3 pr-1.5">
        <nav aria-label="Folder" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[12px] text-fg-muted">
          <button type="button" onClick={() => setEntryPath('.')} className="shrink-0 rounded-md px-1 py-0.5 font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40">
            {contextLabel}
          </button>
          {parts.map((part, index) => {
            const nextPath = parts.slice(0, index + 1).join('/');
            return (
              <span key={nextPath} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle" />
                <button type="button" onClick={() => setEntryPath(nextPath)} className="truncate rounded-md px-1 py-0.5 outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40">
                  {part}
                </button>
              </span>
            );
          })}
        </nav>
        <IconButton size="sm" icon={RefreshCw} label="Refresh" loading={loading} onClick={() => load(entryPath)} />
      </div>

      {error && <Notice tone="error" className="m-3">{error}</Notice>}

      {!noWorkspace && <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {openFile ? (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                icon={ArrowLeft}
                className="-ml-1"
                onClick={() => {
                  const parent = entryPath.split('/').slice(0, -1).join('/');
                  setEntryPath(parent || '.');
                }}
              >
                Back
              </Button>
            </div>
            <Suspense fallback={
              <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-fg-subtle">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            }>
              <SyntaxFileViewer
                filePath={openFile.contextPath || openFile.path}
                content={openFile.content || ''}
                tooLarge={openFile.tooLarge}
                binary={openFile.binary}
                maxHeight="calc(100vh - 280px)"
              />
            </Suspense>
          </div>
        ) : (
          <div className="-mx-1.5 -mt-1.5 space-y-px">
            {entryPath !== '.' && (
              <button
                type="button"
                onClick={() => {
                  const parent = parts.slice(0, -1).join('/');
                  setEntryPath(parent || '.');
                }}
                className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-fg-subtle outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
                title="Up one folder"
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                ..
              </button>
            )}
            {sortedEntries.map(item => (
              <button
                key={item.path}
                type="button"
                onClick={() => setEntryPath(relativeToContext(item.path, basePath))}
                className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <FileIcon isDir={item.type === 'dir'} />
                <span className="min-w-0 flex-1 truncate text-fg">{item.name}</span>
                {item.type === 'file' && item.size > 0 && (
                  <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{formatSize(item.size)}</span>
                )}
              </button>
            ))}
            {!entries.length && !loading && (
              <p className="px-3 py-6 text-center text-[12px] text-fg-subtle">This folder is empty.</p>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}

// ── Main CodePanel ─────────────────────────────────────────────────────────────

export default function CodePanel({
  gitState,
  gitLoading,
  gitError,
  onGitRefresh,
  onGitChanged,
  onAttachGitFile,
  workingDir,
  workingContext = null,
}) {
  const [section, setSection] = useState(() => {
    try { return localStorage.getItem('asyncat_code_panel_section') || 'files'; }
    catch { return 'files'; }
  });
  const [openFilePath, setOpenFilePath] = useState(null);
  const [navigateTarget, setNavigateTarget] = useState(null);
  const contextKey = useMemo(
    () => contextKeyFor(workingContext, workingDir),
    [workingContext, workingDir],
  );

  useEffect(() => {
    setOpenFilePath(null);
    setNavigateTarget(null);
  }, [contextKey]);

  const selectSection = (next) => {
    setSection(next);
    try { localStorage.setItem('asyncat_code_panel_section', next); } catch { /* ignore */ }
  };

  const buttons = [
    { id: 'files', label: 'Files' },
    { id: 'search', label: 'Search' },
    { id: 'outline', label: 'Outline' },
    { id: 'git', label: 'Git', count: gitState?.changedCount || 0 },
    { id: 'sandboxes', label: 'Copies' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-3 py-2">
        <Segmented
          size="sm"
          label="Code tools"
          value={section}
          onChange={selectSection}
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
          items={buttons.map((item) => ({
            value: item.id,
            label: item.label,
            meta: item.count > 0 ? (item.count > 99 ? '99+' : String(item.count)) : null,
          }))}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {section === 'files' && (
          <WorkspaceFilesBrowser
            key={contextKey}
            workingContext={workingContext}
            onFileOpen={(f) => setOpenFilePath(f?.contextPath || null)}
            navigateTo={navigateTarget}
          />
        )}
        {section === 'search' && (
          <CodeSearchPanel
            workingDir={workingDir}
            disabled={workingContext?.rootId === 'none' || workingContext?.noWorkspace}
            onLocateResult={(r) => {
              setNavigateTarget(r.file);
              selectSection('files');
            }}
          />
        )}
        {section === 'outline' && (
          <SymbolOutlinePanel
            filePath={openFilePath}
            workingDir={workingDir}
            disabled={workingContext?.rootId === 'none' || workingContext?.noWorkspace}
          />
        )}
        {section === 'git' && (
          <GitPanel
            state={gitState}
            loading={gitLoading}
            error={gitError}
            onRefresh={onGitRefresh}
            onChanged={onGitChanged}
            onAttachFile={onAttachGitFile}
            workingDir={workingDir}
          />
        )}
        {section === 'sandboxes' && <CopiesPanel />}
      </div>
    </div>
  );
}
