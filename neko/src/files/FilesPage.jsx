import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  return (text || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}

// ─── Root Selector ──────────────────────────────────────────────────────────
function RootDropdown({ roots, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = roots.find(r => r.id === value) || roots[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 midnight:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      >
        <span className="truncate max-w-[110px]">{active?.label || 'Files'}</span>
        <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-gray-200 dark:border-gray-800 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 shadow-lg py-1 max-h-60 overflow-y-auto">
          {roots.map(root => (
            <button
              key={root.id}
              onClick={() => { onChange(root.id); setOpen(false); }}
              className={`w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                root.id === value
                  ? 'bg-gray-50 dark:bg-white/[0.05] midnight:bg-white/[0.05]'
                  : 'hover:bg-gray-50 dark:hover:bg-white/[0.05] midnight:hover:bg-white/[0.05]'
              }`}
            >
              <span className={`text-xs font-medium ${
                root.id === value
                  ? 'text-gray-900 dark:text-white midnight:text-white'
                  : 'text-gray-700 dark:text-gray-300 midnight:text-gray-300'
              }`}>{root.label}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-600 midnight:text-gray-600 truncate w-full">{root.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────
function Breadcrumb({ path, onNavigate }) {
  const parts = (!path || path === '.') ? [] : path.split('/').filter(Boolean);
  return (
    <nav className="flex items-center gap-0.5 min-w-0 flex-wrap">
      <button
        onClick={() => onNavigate('.')}
        className="px-1.5 py-0.5 rounded text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
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
                className="px-1.5 py-0.5 rounded text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors truncate max-w-[140px]"
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

// ─── Modal Shell ────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/25 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-800 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Name Input Modal ───────────────────────────────────────────────────────
function NameModal({ open, onClose, title, placeholder, onConfirm }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setValue('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const submit = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-gray-50 dark:bg-gray-950 midnight:bg-black px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-[#5555a0]"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={submit} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#5555a0] text-white hover:bg-[#4a4a8f] transition-colors">Create</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Delete Confirm Modal ───────────────────────────────────────────────────
function DeleteModal({ open, onClose, itemName, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose} title="Delete">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">Delete <span className="font-medium text-gray-900 dark:text-gray-100">{itemName}</span>? This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Delete</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Editor Panel ───────────────────────────────────────────────────────────
function EditorPanel({ name, editText, setEditText, onSave, onCancel, saving }) {
  return (
    <div className="flex flex-col h-full animate-fadeIn">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center gap-2 min-w-0">
          <Edit3 className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{name}</span>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#5555a0] text-white hover:bg-[#4a4a8f] disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      <textarea
        value={editText}
        onChange={e => setEditText(e.target.value)}
        className="flex-1 min-h-0 resize-none bg-[#0d1117] text-gray-100 font-mono text-sm leading-6 p-5 outline-none"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Actions Dropdown (toolbar) ─────────────────────────────────────────────
function ActionsDropdown({ selected, onRename, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!selected) {
    return (
      <button disabled className="p-1.5 rounded-md text-gray-400 disabled:opacity-30">
        <MoreHorizontal className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-44 rounded-lg border border-gray-200 dark:border-gray-800 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 shadow-lg py-1">
          <button onClick={() => { onRename(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">
            <Edit3 className="w-3.5 h-3.5" /> Rename
          </button>
          <button onClick={() => { onDuplicate(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800" />
          <button onClick={() => { onDelete(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 midnight:hover:bg-red-950/30 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Directory Row ──────────────────────────────────────────────────────────
function DirectoryRow({ entry, selected, onSelect, onOpen }) {
  const { Icon, color } = fileIconMeta(entry.ext || '', entry.type);
  return (
    <button
      onClick={() => onSelect(entry)}
      onDoubleClick={() => onOpen(entry)}
      className={`group w-full grid grid-cols-[minmax(0,1fr)_96px_172px] items-center gap-3 px-4 py-2 text-left outline-none transition-colors ${
        selected
          ? 'bg-gray-100/70 dark:bg-white/[0.04] midnight:bg-white/[0.04]'
          : 'hover:bg-gray-50/60 dark:hover:bg-white/[0.02] midnight:hover:bg-white/[0.02]'
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <div className={`w-1 h-5 rounded-full transition-all duration-200 ${selected ? 'bg-[#5555a0] scale-y-100' : 'bg-transparent scale-y-0'}`} />
        <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
        <span className={`text-sm truncate ${selected ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
          {entry.name}{entry.type === 'dir' ? '/' : ''}
        </span>
      </span>
      <span className="text-xs text-gray-400 tabular-nums text-right">{entry.type === 'dir' ? '—' : formatSize(entry.size)}</span>
      <span className="text-xs text-gray-400 text-right hidden md:block">{formatDate(entry.mtime)}</span>
    </button>
  );
}

// ─── Directory Grid ─────────────────────────────────────────────────────────
function DirectoryGrid({ entries, selectedPath, onSelect, onOpen }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 p-5">
      {entries.map(entry => {
        const { Icon, color } = fileIconMeta(entry.ext || '', entry.type);
        const selected = selectedPath === entry.path;
        return (
          <button
            key={entry.path}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => onOpen(entry)}
            className={`group flex flex-col items-center justify-center gap-2.5 rounded-lg border px-3 py-4 transition-all ${
              selected
                ? 'border-gray-300 dark:border-gray-600 midnight:border-gray-600 bg-gray-50 dark:bg-white/[0.04] midnight:bg-white/[0.04] ring-1 ring-gray-200 dark:ring-gray-700 midnight:ring-gray-700'
                : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700 midnight:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/[0.03] midnight:hover:bg-white/[0.03]'
            }`}
          >
            <Icon className={`w-7 h-7 ${color}`} />
            <span className={`w-full text-xs text-center truncate px-1 ${selected ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
              {entry.name}{entry.type === 'dir' ? '/' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Directory View ─────────────────────────────────────────────────────────
function DirectoryView({ entries, viewMode, selectedPath, onSelect, onOpen, searchActive }) {
  if (!entries.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <Folder className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">{searchActive ? 'No results' : 'Empty folder'}</p>
        <p className="text-xs mt-1">{searchActive ? 'Try a different search term' : 'This folder contains no items'}</p>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return <DirectoryGrid entries={entries} selectedPath={selectedPath} onSelect={onSelect} onOpen={onOpen} />;
  }

  return (
    <div className="pb-20">
      <div className="grid grid-cols-[minmax(0,1fr)_96px_172px] items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pl-6">Name</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Size</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right hidden md:block">Modified</span>
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

// ─── File Preview ───────────────────────────────────────────────────────────
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
        <p className="text-xs mt-1">{formatSize(entry.size)} · preview limit is 5 MB</p>
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
    <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
      <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 bg-[#22262d]">
        <span className="text-xs font-mono text-gray-400">{entry.name}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <pre className="m-0 p-5 text-[13px] font-mono leading-6">
          <code className="hljs block whitespace-pre" dangerouslySetInnerHTML={{ __html: highlighted || escapeHtml(entry.content || '') }} />
        </pre>
      </div>
    </div>
  );
}

// ─── Details Panel ──────────────────────────────────────────────────────────
function DetailsPanel({ selected, activeEntry, onCopyPath, onAgent, onEdit, onOpen, onRename, onDuplicate, onDelete }) {
  if (!selected && !activeEntry) {
    return (
      <aside className="hidden xl:flex w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-3">
            <Folder className="w-6 h-6 opacity-40" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No selection</p>
          <p className="text-xs text-gray-400 mt-1 text-center">Click an item to view details and actions</p>
        </div>
      </aside>
    );
  }

  const item = activeEntry || selected;
  const isFile = item?.type === 'file';
  const canEdit = activeEntry?.type === 'file' && !BINARY_EXTS.has(activeEntry.ext || '') && !activeEntry.tooLarge;
  const { Icon, color } = fileIconMeta(item?.ext || '', item?.type);

  const meta = [
    { label: 'Kind', value: isFile ? (item?.ext?.toUpperCase() || 'File') : 'Folder' },
    { label: 'Size', value: isFile ? formatSize(item?.size) : '—' },
    { label: 'Modified', value: item?.mtime ? formatDate(item.mtime) : '—' },
    { label: 'Location', value: dirname(item?.path) || 'root' },
  ];

  return (
    <aside className="hidden xl:flex w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-col min-h-0">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-900 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item?.name}</div>
            <div className="text-xs text-gray-400 truncate mt-0.5">{item?.path}</div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
        {meta.map(m => (
          <div key={m.label}>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{m.label}</div>
            <div className="text-xs text-gray-700 dark:text-gray-200 mt-0.5">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={onOpen}
            className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
          >
            Open
          </button>
          {isFile && canEdit && (
            <button
              onClick={onEdit}
              className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAgent}
            className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Bot className="w-3.5 h-3.5" />
            Agent
          </button>
          <button
            onClick={onCopyPath}
            className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Copy Path
          </button>
        </div>
        <div className="h-px bg-gray-100 dark:bg-gray-800" />
        <div className="flex gap-2">
          <button
            onClick={onRename}
            className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Rename
          </button>
          <button
            onClick={onDuplicate}
            className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
        </div>
        <button
          onClick={onDelete}
          className="w-full inline-flex justify-center items-center gap-1.5 px-3 py-2 rounded-md text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </aside>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
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

  // Modals
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameModalConfig, setNameModalConfig] = useState({ title: '', placeholder: '', onConfirm: () => {} });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  // Cancel editing when selection changes
  useEffect(() => {
    setEditing(false);
  }, [selected?.path]);

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

  const openNameModal = useCallback((title, placeholder, onConfirm) => {
    setNameModalConfig({ title, placeholder, onConfirm });
    setShowNameModal(true);
  }, []);

  const createFolder = useCallback(() => {
    openNameModal('New Folder', 'New Folder', async (name) => {
      await filesApi.createFolder(rootId, joinPath(entry?.type === 'dir' ? currentPath : dirname(currentPath), name));
      await loadEntry();
    });
  }, [currentPath, entry, loadEntry, openNameModal, rootId]);

  const createFile = useCallback(() => {
    openNameModal('New File', 'untitled.txt', async (name) => {
      const filePath = joinPath(entry?.type === 'dir' ? currentPath : dirname(currentPath), name);
      await filesApi.writeFile(rootId, filePath, '');
      navigateTo(filePath);
    });
  }, [currentPath, entry, navigateTo, openNameModal, rootId]);

  const renameSelected = useCallback(() => {
    if (!selected) return;
    openNameModal('Rename', selected.name, async (name) => {
      if (name === selected.name) return;
      const dest = joinPath(dirname(selected.path), name);
      await filesApi.move(rootId, selected.path, dest);
      navigateTo(dest);
    });
  }, [openNameModal, rootId, selected, navigateTo]);

  const copySelected = useCallback(() => {
    if (!selected) return;
    const base = selected.name || basename(selected.path);
    openNameModal('Copy as', `Copy of ${base}`, async (name) => {
      await filesApi.copy(rootId, selected.path, joinPath(dirname(selected.path), name));
      await loadEntry();
    });
  }, [openNameModal, rootId, selected, loadEntry]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    setDeleteTarget(selected);
    setShowDeleteModal(true);
  }, [selected]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await filesApi.delete(rootId, deleteTarget.path, deleteTarget.type === 'dir');
    const nextPath = deleteTarget.type === 'file' && currentPath === deleteTarget.path ? dirname(deleteTarget.path) : currentPath;
    setSelected(null);
    if (nextPath !== currentPath) navigateTo(nextPath);
    else await loadEntry();
    setShowDeleteModal(false);
    setDeleteTarget(null);
  }, [currentPath, deleteTarget, loadEntry, navigateTo, rootId]);

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
        {/* Toolbar */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {/* Top row: navigation */}
          <div className="flex items-center gap-3 px-5 py-3">
            <button
              onClick={goUp}
              disabled={isRoot}
              title="Go up"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <RootDropdown roots={roots} value={rootId} onChange={id => navigateTo('.', id)} />
              <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-700 flex-shrink-0" />
              <Breadcrumb path={currentPath} onNavigate={navigateTo} />
            </div>
            {notice && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 animate-fadeIn">
                <Check className="w-3 h-3" />
                {notice}
              </span>
            )}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => setViewMode('list')} title="List view" className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('grid')} title="Grid view" className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={toggleHidden}
                title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
                className={`p-1.5 rounded-md transition-colors ${showHidden ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={loadEntry} title="Refresh" className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bottom row: search + actions */}
          <div className="flex items-center gap-3 px-5 pb-3">
            <div className="flex-1 min-w-0 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') { setSearch(''); setSearchResults(null); } }}
                placeholder="Search in this folder"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 pl-8 pr-8 py-1.5 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-[#5555a0] transition-colors"
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setSearchResults(null); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={createFile} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <FilePlus className="w-3.5 h-3.5" />
                New File
              </button>
              <button onClick={createFolder} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <FolderPlus className="w-3.5 h-3.5" />
                New Folder
              </button>
              <button onClick={agentPrompt} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-gray-100 dark:bg-white/[0.08] midnight:bg-white/[0.08] border border-gray-200 dark:border-gray-700 midnight:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.12] midnight:hover:bg-white/[0.12] transition-colors">
                <Bot className="w-3.5 h-3.5" />
                Agent
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
              <ActionsDropdown selected={selected} onRename={renameSelected} onDuplicate={copySelected} onDelete={deleteSelected} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto">
          {loading && (
            <div className="h-full flex items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading</span>
            </div>
          )}
          {!loading && error && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <AlertCircle className="w-9 h-9 text-red-400 mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{error}</p>
              <button onClick={loadEntry} className="text-xs underline text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">Try again</button>
            </div>
          )}

          {/* Directory + inline editing when a file is selected */}
          {!loading && !error && entry?.type === 'dir' && editing && activeEntry?.type === 'file' && (
            <EditorPanel
              name={activeEntry.name}
              editText={editText}
              setEditText={setEditText}
              onSave={saveEdit}
              onCancel={() => { setEditing(false); setEditText(activeEntry?.content || ''); }}
              saving={saving}
            />
          )}
          {!loading && !error && entry?.type === 'dir' && !editing && (
            <>
              {searchResults !== null && (
                <div className="px-5 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {`${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${search}"`}
                  </span>
                  <button
                    onClick={() => { setSearch(''); setSearchResults(null); }}
                    className="text-xs text-[#5555a0] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
              <DirectoryView
                entries={entries}
                viewMode={viewMode}
                selectedPath={selected?.path}
                onSelect={setSelected}
                onOpen={openEntry}
                searchActive={searchResults !== null}
              />
            </>
          )}

          {/* File: preview or edit */}
          {!loading && !error && entry?.type === 'file' && editing && (
            <EditorPanel
              name={entry.name}
              editText={editText}
              setEditText={setEditText}
              onSave={saveEdit}
              onCancel={() => { setEditing(false); setEditText(entry?.content || ''); }}
              saving={saving}
            />
          )}
          {!loading && !error && entry?.type === 'file' && !editing && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
                <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{entry.name}</span>
                <div className="flex items-center gap-2">
                  {!BINARY_EXTS.has(entry.ext || '') && !entry.tooLarge && (
                    <button
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => navigator.clipboard?.writeText(entry.content || '')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>
              <FilePreview entry={entry} onCopy={() => navigator.clipboard?.writeText(entry.content || '')} />
            </div>
          )}
        </div>
      </main>

      <DetailsPanel
        selected={selected}
        activeEntry={activeEntry}
        onCopyPath={copyPath}
        onAgent={agentPrompt}
        onEdit={() => setEditing(true)}
        onOpen={() => selected && openEntry(selected)}
        onRename={renameSelected}
        onDuplicate={copySelected}
        onDelete={deleteSelected}
      />

      <NameModal
        open={showNameModal}
        onClose={() => setShowNameModal(false)}
        title={nameModalConfig.title}
        placeholder={nameModalConfig.placeholder}
        onConfirm={nameModalConfig.onConfirm}
      />

      <DeleteModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        itemName={deleteTarget?.name}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
