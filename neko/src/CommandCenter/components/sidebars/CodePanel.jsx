/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import {
  ChevronRight, Code2, Folder, GitBranch, Loader2, RefreshCw,
  Search, List, FileCode
} from 'lucide-react';
import { filesApi } from '../../api';
import GitPanel from '../git/GitPanel';
import SandboxPanel from './SandboxPanel';
import CodeSearchPanel from '../code/CodeSearchPanel';
import SymbolOutlinePanel from '../code/SymbolOutlinePanel';

// Lazy-load Monaco viewer to keep initial bundle smaller
const SyntaxFileViewer = lazy(() => import('../code/SyntaxFileViewer'));

// ── File-type icon helpers ────────────────────────────────────────────────────

const EXT_COLOR = {
  js: 'text-yellow-400', jsx: 'text-sky-400', ts: 'text-blue-500', tsx: 'text-blue-400',
  py: 'text-green-500', rs: 'text-orange-500', go: 'text-cyan-500', java: 'text-red-500',
  css: 'text-pink-400', scss: 'text-pink-500', html: 'text-orange-400', json: 'text-gray-400',
  md: 'text-gray-500', yml: 'text-purple-400', yaml: 'text-purple-400',
  sh: 'text-gray-600', sql: 'text-teal-500', svg: 'text-green-400',
};

function FileIcon({ name, isDir }) {
  if (isDir) return <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400 dark:text-amber-300 midnight:text-amber-300" />;
  const ext = name?.split('.').pop()?.toLowerCase();
  const color = EXT_COLOR[ext] || 'text-gray-300 dark:text-slate-600 midnight:text-slate-600';
  return <FileCode className={`h-3.5 w-3.5 shrink-0 ${color}`} />;
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
  return `${workingContext?.rootId || 'workspace'}:${workingContext?.relativePath || '.'}:${workingDir || ''}`;
}

function WorkspaceFilesBrowser({ onFileOpen, navigateTo, workingContext = null }) {
  const rootId = workingContext?.rootId || 'workspace';
  const basePath = workingContext?.relativePath || '.';
  const contextLabel = workingContext?.relativePath && workingContext.relativePath !== '.'
    ? basename(workingContext.relativePath)
    : workingContext?.rootLabel || 'workspace';
  // Defensive: a legacy "No workspace" context may still be persisted from
  // before chat-only mode was retired. Treat it as "nothing to browse" rather
  // than firing a listing against a root that no longer exists.
  const noWorkspace = workingContext?.rootId === 'none' || workingContext?.noWorkspace === true;
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
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950 midnight:bg-slate-950">
      {/* Breadcrumb */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 midnight:border-slate-800 midnight:bg-slate-950">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-500 dark:bg-slate-800/60 dark:text-slate-400 midnight:bg-slate-900/70 midnight:text-slate-400">
          <button type="button" onClick={() => setEntryPath('.')} className="shrink-0 hover:text-gray-900 dark:hover:text-slate-100 midnight:hover:text-slate-100">
            {contextLabel}
          </button>
          {parts.map((part, index) => {
            const nextPath = parts.slice(0, index + 1).join('/');
            return (
              <span key={nextPath} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 shrink-0 text-gray-300 dark:text-slate-600 midnight:text-slate-600" />
                <button type="button" onClick={() => setEntryPath(nextPath)} className="truncate hover:text-gray-900 dark:hover:text-slate-100 midnight:hover:text-slate-100">
                  {part}
                </button>
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => load(entryPath)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300 midnight:text-slate-500 midnight:hover:bg-slate-800 midnight:hover:text-slate-300"
          title="Refresh"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {error && (
        <div className="m-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-950/50 dark:bg-rose-950/20 dark:text-rose-300 midnight:border-rose-950/50 midnight:bg-rose-950/20 midnight:text-rose-300">
          {error}
        </div>
      )}

      {!noWorkspace && <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {openFile ? (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const parent = entryPath.split('/').slice(0, -1).join('/');
                  setEntryPath(parent || '.');
                }}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 midnight:border-slate-700 midnight:text-slate-300 midnight:hover:bg-slate-800"
              >
                ← Back
              </button>
            </div>
            <Suspense fallback={
              <div className="flex items-center justify-center py-12 text-xs text-gray-400 midnight:text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading editor…
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
          <div className="overflow-hidden rounded-md border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900/40 midnight:border-slate-800 midnight:bg-slate-900/40">
            {entryPath !== '.' && (
              <button
                type="button"
                onClick={() => {
                  const parent = parts.slice(0, -1).join('/');
                  setEntryPath(parent || '.');
                }}
                className="flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-50 dark:border-slate-800 dark:text-slate-500 dark:hover:bg-slate-800/60 midnight:border-slate-800 midnight:text-slate-500 midnight:hover:bg-slate-800/60"
              >
                ..
              </button>
            )}
            {sortedEntries.map(item => (
              <button
                key={item.path}
                type="button"
                onClick={() => setEntryPath(relativeToContext(item.path, basePath))}
                className="flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/60 midnight:border-slate-800 midnight:hover:bg-slate-800/60"
              >
                <FileIcon name={item.name} isDir={item.type === 'dir'} />
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-slate-200 midnight:text-slate-200">{item.name}</span>
                {item.type === 'file' && (
                  <span className="text-[10px] text-gray-300 dark:text-slate-700 midnight:text-slate-700">{item.ext || ''}</span>
                )}
                {item.type === 'file' && item.size > 0 && (
                  <span className="text-[10px] text-gray-300 dark:text-slate-700 midnight:text-slate-700 tabular-nums">
                    {item.size > 1024 * 1024
                      ? `${(item.size / (1024 * 1024)).toFixed(1)}MB`
                      : item.size > 1024
                        ? `${(item.size / 1024).toFixed(0)}KB`
                        : `${item.size}B`
                    }
                  </span>
                )}
              </button>
            ))}
            {!entries.length && !loading && (
              <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500 midnight:text-slate-500">Empty directory</div>
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
    { id: 'files', label: 'Files', icon: Code2 },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'outline', label: 'Outline', icon: List },
    { id: 'git', label: 'Git', icon: GitBranch, count: gitState?.changedCount || 0 },
    { id: 'sandboxes', label: 'Boxes', icon: Folder },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950 midnight:bg-slate-950">
      {/* Tab bar — 5 columns */}
      <div className="grid shrink-0 grid-cols-5 gap-0.5 border-b border-gray-100 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-950 midnight:border-slate-800 midnight:bg-slate-950">
        {buttons.map(item => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              title={item.label}
              className={`inline-flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-[9px] font-medium transition-colors ${
                active
                  ? 'bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100 midnight:bg-slate-800 midnight:text-slate-100'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-800/60 dark:hover:text-slate-300 midnight:text-slate-500 midnight:hover:bg-slate-800/60 midnight:hover:text-slate-300'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? 'text-indigo-500 dark:text-indigo-400 midnight:text-indigo-400' : ''}`} />
              <span className="leading-none">{item.label}</span>
              {item.count > 0 && (
                <span className="rounded-full bg-indigo-500 px-1 py-0 text-[8px] font-semibold text-white leading-none">
                  {item.count > 99 ? '99+' : item.count}
                </span>
              )}
            </button>
          );
        })}
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
        {section === 'sandboxes' && <SandboxPanel />}
      </div>
    </div>
  );
}
