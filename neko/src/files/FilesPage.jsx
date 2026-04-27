import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Bot, Check, ChevronRight, Copy, Edit3,
  Eye, EyeOff, FilePlus, Folder, FolderPlus, Grid3X3, List, Loader2, MoreHorizontal,
  RefreshCw, Save, Search, Trash2, X,
} from 'lucide-react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import 'highlight.js/styles/github-dark-dimmed.css';
import { filesApi } from '../CommandCenter/commandCenterApi';
import {
  BINARY_EXTS,
  basename,
  dirname,
  fileIconMeta,
  formatDate,
  formatSize,
  joinPath,
} from './fileUtils';

hljs.registerLanguage('javascript', javascript); hljs.registerLanguage('js', javascript); hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript); hljs.registerLanguage('ts', typescript); hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('python', python); hljs.registerLanguage('py', python);
hljs.registerLanguage('html', xml); hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css); hljs.registerLanguage('scss', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash); hljs.registerLanguage('sh', bash);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp); hljs.registerLanguage('c', cpp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust); hljs.registerLanguage('rs', rust);

function escapeHtml(text) {
  return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function Breadcrumb({ path, onNavigate }) {
  const parts = (!path || path === '.') ? [] : path.split('/').filter(Boolean);
  return (
    <nav className="flex items-center gap-0.5 min-w-0 flex-wrap">
      <button
        onClick={() => onNavigate('.')}
        className="px-1.5 py-0.5 rounded text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        root
      </button>
      {parts.map((part, i) => {
        const partPath = parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <span key={partPath} className="flex items-center gap-0.5 min-w-0">
            <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />
            {isLast ? (
              <span className="px-1.5 py-0.5 text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[220px]">
                {part}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(partPath)}
                className="px-1.5 py-0.5 rounded text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors truncate max-w-[140px]"
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function DirectoryRow({ entry, selected, onSelect, onOpen }) {
  const { Icon, color } = fileIconMeta(entry.ext || '', entry.type);
  return (
    <button
      onClick={() => onSelect(entry)}
      onDoubleClick={() => onOpen(entry)}
      className={`w-full grid grid-cols-[minmax(0,1fr)_96px_172px_64px] items-center gap-3 px-4 py-2 text-left border-b border-gray-100 dark:border-gray-800/60 transition-colors ${
        selected ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
        <span className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate">
          {entry.name}{entry.type === 'dir' ? '/' : ''}
        </span>
      </span>
      <span className="text-xs text-gray-400 tabular-nums text-right">{entry.type === 'dir' ? '--' : formatSize(entry.size)}</span>
      <span className="text-xs text-gray-400 text-right hidden md:block">{formatDate(entry.mtime)}</span>
      <span className="text-[10px] text-gray-400 uppercase text-right">{entry.type}</span>
    </button>
  );
}

function DirectoryGrid({ entries, selectedPath, onSelect, onOpen }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 p-4">
      {entries.map(entry => {
        const { Icon, color } = fileIconMeta(entry.ext || '', entry.type);
        const selected = selectedPath === entry.path;
        return (
          <button
            key={entry.path}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => onOpen(entry)}
            className={`min-h-[104px] flex flex-col items-center justify-center gap-2 rounded-md border px-3 py-3 transition-colors ${
              selected
                ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
                : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <Icon className={`w-8 h-8 ${color}`} />
            <span className="w-full text-xs font-mono text-gray-800 dark:text-gray-200 text-center truncate">
              {entry.name}{entry.type === 'dir' ? '/' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DirectoryView({ entries, viewMode, selectedPath, onSelect, onOpen }) {
  if (!entries.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <Folder className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Empty directory</p>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return <DirectoryGrid entries={entries} selectedPath={selectedPath} onSelect={onSelect} onOpen={onOpen} />;
  }

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_96px_172px_64px] items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Name</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Size</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right hidden md:block">Modified</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Kind</span>
      </div>
      {entries.map(entry => (
        <DirectoryRow
          key={entry.path}
          entry={entry}
          selected={selectedPath === entry.path}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function FilePreview({ entry, onCopy }) {
  const highlighted = useMemo(() => {
    if (!entry?.content || entry.tooLarge || entry.binary || BINARY_EXTS.has(entry.ext || '')) return '';
    try {
      if (hljs.getLanguage(entry.ext || '')) return hljs.highlight(entry.content, { language: entry.ext }).value;
      return hljs.highlightAuto(entry.content).value;
    } catch {
      return escapeHtml(entry.content);
    }
  }, [entry]);

  if (!entry) return null;
  if (entry.tooLarge) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 text-center">
        <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm font-medium">File too large to preview</p>
        <p className="text-xs mt-1">{formatSize(entry.size)} · preview limit is 1 MB</p>
      </div>
    );
  }
  if (entry.binary || BINARY_EXTS.has(entry.ext || '')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 text-center">
        <FilePlus className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm font-medium">Preview unavailable</p>
        <p className="text-xs mt-1">This file is handled as binary or media.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 bg-[#22272e] relative">
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/10 text-gray-300 hover:bg-white/20 border border-white/10"
      >
        <Copy className="w-3 h-3" />
        Copy
      </button>
      <pre className="h-full overflow-auto m-0 p-4 pt-10 text-[12px] font-mono leading-5">
        <code className="hljs block whitespace-pre" dangerouslySetInnerHTML={{ __html: highlighted || escapeHtml(entry.content || '') }} />
      </pre>
    </div>
  );
}

function Inspector({ selected, activeEntry, saving, onCopyPath, onAgent, onEdit, onSave, editText, setEditText, editing }) {
  if (!selected && !activeEntry) {
    return (
      <aside className="hidden xl:flex w-96 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-col">
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Select a file or folder</div>
      </aside>
    );
  }

  const item = activeEntry?.type === 'file' ? activeEntry : selected;
  const { Icon, color } = fileIconMeta(item?.ext || '', item?.type);
  return (
    <aside className="hidden xl:flex w-96 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-col min-h-0">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-start gap-3">
          <Icon className={`w-8 h-8 flex-shrink-0 ${color}`} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100 truncate">{item?.name || basename(item?.path)}</div>
            <div className="text-xs text-gray-400 truncate">{item?.path}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
          <div className="rounded border border-gray-200 dark:border-gray-800 p-2">
            <div className="text-gray-400">Kind</div>
            <div className="text-gray-800 dark:text-gray-200 uppercase">{item?.type}</div>
          </div>
          <div className="rounded border border-gray-200 dark:border-gray-800 p-2">
            <div className="text-gray-400">Size</div>
            <div className="text-gray-800 dark:text-gray-200">{item?.type === 'file' ? formatSize(item.size) : '--'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={onAgent} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-indigo-600 text-white hover:bg-indigo-700">
            <Bot className="w-3.5 h-3.5" />
            Agent
          </button>
          <button onClick={onCopyPath} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Copy className="w-3.5 h-3.5" />
            Path
          </button>
          {activeEntry?.type === 'file' && !BINARY_EXTS.has(activeEntry.ext || '') && !activeEntry.tooLarge && (
            <button onClick={editing ? onSave : onEdit} disabled={saving} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60">
              {editing ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              {editing ? 'Save' : 'Edit'}
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          className="flex-1 min-h-0 resize-none bg-gray-950 text-gray-100 font-mono text-xs leading-5 p-4 outline-none"
          spellCheck={false}
        />
      ) : (
        <FilePreview entry={activeEntry?.type === 'file' ? activeEntry : null} onCopy={() => navigator.clipboard?.writeText(activeEntry?.content || '')} />
      )}
    </aside>
  );
}

export default function FilesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rootId = searchParams.get('rootId') || 'workspace';
  const currentPath = searchParams.get('path') || '.';
  const viewMode = searchParams.get('view') || 'list';
  const showHidden = searchParams.get('hidden') === 'true';

  const [roots, setRoots] = useState([]);
  const [entry, setEntry] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const activeRoot = roots.find(root => root.id === rootId) || roots[0];
  const activeEntry = entry?.type === 'file' ? entry : selectedPreview;
  const entries = searchResults || (entry?.type === 'dir' ? entry.entries : []);
  const isRoot = currentPath === '.';

  const navigateTo = useCallback((path, nextRootId = rootId, extra = {}) => {
    const nextParams = {
      rootId: nextRootId,
      path: path || '.',
      view: extra.view || viewMode,
    };
    const hidden = extra.hidden ?? showHidden;
    if (hidden) nextParams.hidden = 'true';
    setSearchParams(nextParams);
  }, [rootId, setSearchParams, showHidden, viewMode]);

  const loadRoots = useCallback(async () => {
    const res = await filesApi.getRoots();
    if (res.success) setRoots(res.roots || []);
  }, []);

  const loadEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntry(null);
    setSearchResults(null);
    setSelectedPreview(null);
    setEditing(false);
    try {
      const res = await filesApi.loadEntry(rootId, currentPath, showHidden);
      if (res.success) {
        setEntry(res);
        setSelected(res.type === 'file' ? res : null);
        setEditText(res.type === 'file' ? (res.content || '') : '');
      } else {
        setError(res.error || 'Could not load path');
      }
    } catch (err) {
      setError(err.message || 'Failed to load path');
    } finally {
      setLoading(false);
    }
  }, [rootId, currentPath, showHidden]);

  useEffect(() => { loadRoots().catch(() => {}); }, [loadRoots]);
  useEffect(() => { loadEntry(); }, [loadEntry]);

  useEffect(() => {
    let cancelled = false;
    setSelectedPreview(null);
    if (!selected || selected.type !== 'file' || entry?.type !== 'dir') return undefined;

    filesApi.loadEntry(rootId, selected.path, showHidden)
      .then(res => {
        if (!cancelled && res.success && res.type === 'file') {
          setSelectedPreview(res);
          setEditText(res.content || '');
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [entry?.type, rootId, selected, showHidden]);

  const goUp = useCallback(() => {
    if (isRoot) return;
    navigateTo(dirname(currentPath));
  }, [currentPath, isRoot, navigateTo]);

  const openEntry = useCallback((item) => {
    if (item.type === 'dir') navigateTo(item.path);
    else navigateTo(item.path);
  }, [navigateTo]);

  const setViewMode = useCallback((nextMode) => {
    navigateTo(currentPath, rootId, { view: nextMode });
  }, [currentPath, navigateTo, rootId]);

  const toggleHidden = useCallback(() => {
    navigateTo(currentPath, rootId, { hidden: !showHidden });
  }, [currentPath, navigateTo, rootId, showHidden]);

  const copyPath = useCallback(() => {
    const target = selected?.path || currentPath;
    navigator.clipboard?.writeText(target);
    setNotice('Path copied');
    setTimeout(() => setNotice(null), 1200);
  }, [currentPath, selected]);

  const agentPrompt = useCallback(() => {
    const target = selected || entry;
    const prompt = `Use the file explorer selection as context.\nRoot: ${activeRoot?.label || rootId} (${rootId})\nPath: ${target?.path || currentPath}\nType: ${target?.type || entry?.type || 'path'}\n\nHelp me work with this path.`;
    window.dispatchEvent(new CustomEvent('asyncat:prefill-agent', { detail: { prompt, rootId, path: target?.path || currentPath } }));
    navigate('/agents');
  }, [activeRoot, currentPath, entry, navigate, rootId, selected]);

  const makeName = useCallback((label, fallback) => {
    const name = window.prompt(label, fallback);
    return name?.trim();
  }, []);

  const createFolder = useCallback(async () => {
    const name = makeName('Folder name', 'New Folder');
    if (!name) return;
    await filesApi.createFolder(rootId, joinPath(entry?.type === 'dir' ? currentPath : dirname(currentPath), name));
    await loadEntry();
  }, [currentPath, entry, loadEntry, makeName, rootId]);

  const createFile = useCallback(async () => {
    const name = makeName('File name', 'untitled.txt');
    if (!name) return;
    const filePath = joinPath(entry?.type === 'dir' ? currentPath : dirname(currentPath), name);
    await filesApi.writeFile(rootId, filePath, '');
    navigateTo(filePath);
  }, [currentPath, entry, makeName, navigateTo, rootId]);

  const renameSelected = useCallback(async () => {
    if (!selected) return;
    const name = makeName('Rename to', selected.name);
    if (!name || name === selected.name) return;
    const dest = joinPath(dirname(selected.path), name);
    await filesApi.move(rootId, selected.path, dest);
    navigateTo(dest);
  }, [makeName, navigateTo, rootId, selected]);

  const copySelected = useCallback(async () => {
    if (!selected) return;
    const base = selected.name || basename(selected.path);
    const name = makeName('Copy as', `Copy of ${base}`);
    if (!name) return;
    await filesApi.copy(rootId, selected.path, joinPath(dirname(selected.path), name));
    await loadEntry();
  }, [loadEntry, makeName, rootId, selected]);

  const deleteSelected = useCallback(async () => {
    if (!selected) return;
    const ok = window.confirm(`Delete ${selected.name}? This cannot be undone from Asyncat yet.`);
    if (!ok) return;
    await filesApi.delete(rootId, selected.path, selected.type === 'dir');
    const nextPath = selected.type === 'file' && currentPath === selected.path ? dirname(selected.path) : currentPath;
    setSelected(null);
    if (nextPath !== currentPath) navigateTo(nextPath);
    else await loadEntry();
  }, [currentPath, loadEntry, navigateTo, rootId, selected]);

  const runSearch = useCallback(async () => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    const res = await filesApi.search(rootId, entry?.type === 'dir' ? currentPath : dirname(currentPath), search, showHidden);
    if (res.success) setSearchResults(res.entries || []);
  }, [currentPath, entry, rootId, search, showHidden]);

  const saveEdit = useCallback(async () => {
    if (!activeEntry) return;
    setSaving(true);
    try {
      await filesApi.writeFile(rootId, activeEntry.path, editText);
      setEditing(false);
      await loadEntry();
    } finally {
      setSaving(false);
    }
  }, [activeEntry, editText, loadEntry, rootId]);

  return (
    <div className="h-full flex bg-white dark:bg-gray-900 midnight:bg-gray-950 overflow-hidden">
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={goUp}
              disabled={isRoot}
              title="Go up"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <select
                  value={rootId}
                  onChange={e => navigateTo('.', e.target.value)}
                  className="max-w-40 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 outline-none"
                  title={activeRoot?.path || 'File root'}
                >
                  {roots.map(root => <option key={root.id} value={root.id}>{root.label}</option>)}
                </select>
                <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-700" />
                <Breadcrumb path={currentPath} onNavigate={navigateTo} />
              </div>
            </div>
            {notice && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                {notice}
              </span>
            )}
            <div className="flex items-center gap-1">
              <button onClick={() => setViewMode('list')} title="List view" className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('grid')} title="Grid view" className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={toggleHidden}
                title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
                className={`p-1.5 rounded-md ${showHidden ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={loadEntry} title="Refresh" className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 pb-3">
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-800 px-2 py-1.5 bg-gray-50 dark:bg-gray-950">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') { setSearch(''); setSearchResults(null); } }}
                placeholder="Search in this folder"
                className="w-full bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400"
              />
              {searchResults && (
                <button onClick={() => { setSearch(''); setSearchResults(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={createFile} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              <FilePlus className="w-3.5 h-3.5" />
              File
            </button>
            <button onClick={createFolder} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              <FolderPlus className="w-3.5 h-3.5" />
              Folder
            </button>
            <button onClick={agentPrompt} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-indigo-600 text-white hover:bg-indigo-700">
              <Bot className="w-3.5 h-3.5" />
              Agent
            </button>
            <div className="relative group">
              <button disabled={!selected} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30">
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {selected && (
                <div className="absolute right-0 top-8 z-20 hidden group-hover:block w-40 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
                  <button onClick={renameSelected} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"><Edit3 className="w-3 h-3" />Rename</button>
                  <button onClick={copySelected} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"><Copy className="w-3 h-3" />Copy</button>
                  <button onClick={deleteSelected} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="w-3 h-3" />Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading && (
            <div className="h-full flex items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading files</span>
            </div>
          )}
          {!loading && error && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <AlertCircle className="w-9 h-9 text-red-400 mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{error}</p>
              <button onClick={loadEntry} className="text-xs underline text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">Try again</button>
            </div>
          )}
          {!loading && !error && entry?.type === 'dir' && (
            <DirectoryView
              entries={entries}
              viewMode={viewMode}
              selectedPath={selected?.path}
              onSelect={setSelected}
              onOpen={openEntry}
            />
          )}
          {!loading && !error && entry?.type === 'file' && (
            <FilePreview entry={entry} onCopy={() => navigator.clipboard?.writeText(entry.content || '')} />
          )}
        </div>
      </main>

      <Inspector
        selected={selected}
        activeEntry={activeEntry}
        saving={saving}
        onCopyPath={copyPath}
        onAgent={agentPrompt}
        onEdit={() => setEditing(true)}
        onSave={saveEdit}
        editing={editing}
        editText={editText}
        setEditText={setEditText}
      />
    </div>
  );
}
