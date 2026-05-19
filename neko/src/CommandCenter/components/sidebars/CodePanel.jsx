/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import { ChevronRight, Code2, File, Folder, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import { filesApi } from '../../api';
import GitPanel from '../git/GitPanel';
import SandboxPanel from './SandboxPanel';

function WorkspaceFilesBrowser() {
  const [entryPath, setEntryPath] = useState('.');
  const [entry, setEntry] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(pathValue = entryPath) {
    setLoading(true);
    setError('');
    try {
      const res = await filesApi.loadEntry('workspace', pathValue || '.', false, { limit: 800 });
      setEntry(res);
      setOpenFile(res.type === 'file' ? res : null);
    } catch (err) {
      setError(err.message || 'Could not load files');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(entryPath);
  }, [entryPath]);

  const entries = entry?.type === 'dir' ? (entry.entries || []) : [];
  const parts = entryPath === '.' ? [] : entryPath.split('/').filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-500 dark:bg-slate-800/60 dark:text-slate-400">
          <button type="button" onClick={() => setEntryPath('.')} className="shrink-0 hover:text-gray-900 dark:hover:text-slate-100">
            workspace
          </button>
          {parts.map((part, index) => {
            const nextPath = parts.slice(0, index + 1).join('/');
            return (
              <span key={nextPath} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 shrink-0 text-gray-300 dark:text-slate-600" />
                <button type="button" onClick={() => setEntryPath(nextPath)} className="truncate hover:text-gray-900 dark:hover:text-slate-100">
                  {part}
                </button>
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => load(entryPath)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          title="Refresh"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {error && (
        <div className="m-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-950/50 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {openFile ? (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const parent = entryPath.split('/').slice(0, -1).join('/');
                  setEntryPath(parent || '.');
                }}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Back
              </button>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600 dark:text-slate-300">{openFile.path}</span>
            </div>
            <pre className="max-h-[calc(100vh-260px)] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              {openFile.tooLarge ? 'File is too large to preview.' : openFile.binary ? 'Binary file preview is not available.' : openFile.content || ''}
            </pre>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900/40">
            {entryPath !== '.' && (
              <button
                type="button"
                onClick={() => {
                  const parent = parts.slice(0, -1).join('/');
                  setEntryPath(parent || '.');
                }}
                className="flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-50 dark:border-slate-800 dark:text-slate-500 dark:hover:bg-slate-800/60"
              >
                ..
              </button>
            )}
            {entries.map(item => (
              <button
                key={item.path}
                type="button"
                onClick={() => setEntryPath(item.path)}
                className="flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              >
                {item.type === 'dir'
                  ? <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                  : <File className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-slate-600" />}
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-slate-200">{item.name}</span>
                {item.type === 'file' && <span className="text-[10px] text-gray-300 dark:text-slate-600">{item.ext || 'file'}</span>}
              </button>
            ))}
            {!entries.length && !loading && (
              <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">No files</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CodePanel({
  gitState,
  gitLoading,
  gitError,
  onGitRefresh,
  onGitChanged,
  onAttachGitFile,
  workingDir,
}) {
  const [section, setSection] = useState(() => {
    try { return localStorage.getItem('asyncat_code_panel_section') || 'files'; }
    catch { return 'files'; }
  });

  const selectSection = (next) => {
    setSection(next);
    try { localStorage.setItem('asyncat_code_panel_section', next); } catch { /* ignore */ }
  };

  const buttons = [
    { id: 'files', label: 'Files', icon: Code2 },
    { id: 'git', label: 'Git', icon: GitBranch, count: gitState?.changedCount || 0 },
    { id: 'sandboxes', label: 'Sandboxes', icon: Folder },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-gray-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
        {buttons.map(item => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-800/60 dark:hover:text-slate-300'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? 'text-indigo-500 dark:text-indigo-400' : ''}`} />
              {item.label}
              {item.count > 0 && (
                <span className="rounded-full bg-indigo-100 px-1.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {section === 'files' && <WorkspaceFilesBrowser />}
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
