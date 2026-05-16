import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle, Archive, ArrowLeft, Bot, Check, ChevronRight, Copy, Edit3,
  Eye, EyeOff, FilePlus, Folder, FolderPlus, Grid3X3, List, Loader2, Lock,
  MoreHorizontal, RefreshCw, Save, Search, Square, CheckSquare, Table2,
  Trash2, Upload, X,
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
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
import { filesApi } from '../CommandCenter/api';
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

marked.setOptions({ breaks: true, gfm: true });

const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'tbz']);

function escapeHtml(text) {
  return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isUnsafeName(name) {
  return !name || name === '.' || name === '..' || name.includes('/') || name.includes('\\');
}

function duplicateName(name) {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `${name.slice(0, dot)} copy${name.slice(dot)}`;
  return `${name} copy`;
}

function uniqueDuplicatePath(item, siblings) {
  const dir = dirname(item.path);
  const taken = new Set((siblings || []).map(entry => entry.path));
  const base = duplicateName(item.name || basename(item.path));
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let candidate = joinPath(dir, base);
  let i = 2;
  while (taken.has(candidate)) {
    candidate = joinPath(dir, `${stem} ${i}${ext}`);
    i += 1;
  }
  return candidate;
}

function getPreviewText(entry) {
  const text = entry?.content || '';
  if ((entry?.ext || '').toLowerCase() !== 'json') return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function lineNumberHtml(html) {
  const lines = (html || '').split('\n');
  return lines.map((line, index) => (
    `<span class="select-none text-gray-600 pr-4">${index + 1}</span>${line || ' '}`
  )).join('\n');
}

function parseCSV(text) {
  const lines = (text || '').trim().split('\n');
  return lines.map(line => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current); current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  });
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
function NameModal({ open, onClose, title, placeholder, initialValue = '', confirmLabel = 'Create', validate, onConfirm }) {
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setLocalError('');
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [initialValue, open]);

  const submit = () => {
    const nextValue = value.trim();
    const validationError = validate?.(nextValue);
    if (!nextValue || validationError) {
      setLocalError(validationError || 'Name is required');
      return;
    }
    onConfirm(nextValue);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setLocalError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-gray-50 dark:bg-gray-950 midnight:bg-black px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-[#5555a0]"
        />
        {localError && <p className="text-xs text-red-500">{localError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={submit} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#5555a0] text-white hover:bg-[#4a4a8f] transition-colors">{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Delete Confirm Modal ───────────────────────────────────────────────────
function DeleteModal({ open, onClose, targets = [], onConfirm }) {
  const folders = targets.filter(item => item.type === 'dir').length;
  const files = targets.length - folders;
  const label = targets.length === 1 ? targets[0]?.name : `${targets.length} items`;
  return (
    <Modal open={open} onClose={onClose} title="Delete">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Delete <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>? This cannot be undone.
        </p>
        {folders > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            This includes {folders} folder{folders !== 1 ? 's' : ''}{files ? ` and ${files} file${files !== 1 ? 's' : ''}` : ''}. Folder contents will be deleted recursively.
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Delete</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmModal({ open, onClose, title, message, confirmLabel = 'Continue', destructive = false, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">Cancel</button>
          <button
            onClick={() => { onConfirm?.(); onClose(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#5555a0] hover:bg-[#4a4a8f]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === 'error';
  return (
    <div className={`fixed right-4 top-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 shadow-lg animate-fadeIn ${
      isError
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950 dark:text-red-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-300'
    }`}>
      {isError ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
      <span className="text-xs">{toast.text}</span>
      <button onClick={onClose} className="ml-1 text-current opacity-60 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
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
function ActionsDropdown({ selectedCount, selected, onRename, onDuplicate, onCopyPaths, onDelete, onCreateArchive }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!selectedCount) {
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
          {selectedCount === 1 && (
            <button onClick={() => { onRename(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Rename
            </button>
          )}
          <button onClick={() => { onDuplicate(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">
            <Copy className="w-3.5 h-3.5" /> Duplicate{selectedCount > 1 ? ` ${selectedCount}` : ''}
          </button>
          <button onClick={() => { onCopyPaths(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">
            <Copy className="w-3.5 h-3.5" /> Copy path{selectedCount > 1 ? 's' : ''}
          </button>
          <button onClick={() => { onCreateArchive(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors">
            <Archive className="w-3.5 h-3.5" /> Create Archive
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

// ─── Context Menu ────────────────────────────────────────────────────────────
function ContextMenu({ x, y, item, onClose, onOpen, onEdit, onRename, onDuplicate, onCopyPath, onDelete, onExtract, onCreateArchive, onAgent }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      left: x + width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - width - 8) : x,
      top: y + height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - height - 8) : y,
    });
  }, [x, y]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.type === 'mousedown' && ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', handler);
    document.addEventListener('mousedown', handler);
    return () => { document.removeEventListener('keydown', handler); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  const isArchive = ARCHIVE_EXTS.has(item?.ext || '');
  const canEdit = item?.type === 'file' && item?.isEditable && !item?.tooLarge;
  const perms = item?.permissions;

  const menuItem = (icon, label, action, danger = false) => (
    <button
      onClick={() => { action(); onClose(); }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
        danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 60 }}
      className="w-52 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl py-1"
    >
      {perms && (
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <div className="text-[10px] font-mono text-gray-400 flex items-center gap-1.5">
            <Lock className="w-2.5 h-2.5" />
            {perms.symbolic} · {perms.octal}
          </div>
        </div>
      )}
      {menuItem(<Eye className="w-3.5 h-3.5" />, 'Open', onOpen)}
      {canEdit && menuItem(<Edit3 className="w-3.5 h-3.5" />, 'Edit', onEdit)}
      <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
      {menuItem(<Edit3 className="w-3.5 h-3.5" />, 'Rename', onRename)}
      {menuItem(<Copy className="w-3.5 h-3.5" />, 'Duplicate', onDuplicate)}
      {menuItem(<Copy className="w-3.5 h-3.5" />, 'Copy Path', onCopyPath)}
      {menuItem(<Bot className="w-3.5 h-3.5" />, 'Use with Agent', onAgent)}
      {(isArchive || true) && (
        <>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          {isArchive && menuItem(<Archive className="w-3.5 h-3.5" />, 'Extract here', onExtract)}
          {menuItem(<Archive className="w-3.5 h-3.5" />, 'Create Archive…', onCreateArchive)}
        </>
      )}
      <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
      {menuItem(<Trash2 className="w-3.5 h-3.5" />, 'Delete', onDelete, true)}
    </div>
  );
}

// ─── Directory Row ──────────────────────────────────────────────────────────
function SelectionBox({ checked, onClick }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={-1}
      onClick={onClick}
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:text-[#5555a0]"
    >
      {checked ? <CheckSquare className="h-4 w-4 text-[#5555a0]" /> : <Square className="h-4 w-4" />}
    </span>
  );
}

function DirectoryRow({ entry, selected, checked, onSelect, onToggleSelect, onOpen, onContextMenu }) {
  const { Icon, color } = fileIconMeta(entry.ext || '', entry.type);
  const sizeLabel = entry.type === 'dir'
    ? (entry.childrenCount != null ? `${entry.childrenCount} item${entry.childrenCount !== 1 ? 's' : ''}` : '—')
    : formatSize(entry.size);

  return (
    <button
      onClick={() => onSelect(entry)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
      className={`group w-full grid grid-cols-[minmax(0,1fr)_96px_172px] items-center gap-3 px-4 py-2 text-left outline-none transition-colors ${
        selected || checked
          ? 'bg-gray-100/70 dark:bg-white/[0.04] midnight:bg-white/[0.04]'
          : 'hover:bg-gray-50/60 dark:hover:bg-white/[0.02] midnight:hover:bg-white/[0.02]'
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <div className={`w-1 h-5 rounded-full transition-all duration-200 ${selected ? 'bg-[#5555a0] scale-y-100' : 'bg-transparent scale-y-0'}`} />
        <SelectionBox checked={checked} onClick={(e) => { e.stopPropagation(); onToggleSelect(entry); }} />
        <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
        <span className={`text-sm truncate ${selected ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
          {entry.name}{entry.type === 'dir' ? '/' : ''}
        </span>
        {entry.snippet && (
          <span className="hidden lg:block text-[10px] text-gray-400 italic truncate max-w-[200px]">{entry.snippet}</span>
        )}
      </span>
      <span className="text-xs text-gray-400 tabular-nums text-right">{sizeLabel}</span>
      <span className="text-xs text-gray-400 text-right hidden md:block">{formatDate(entry.mtime)}</span>
    </button>
  );
}

// ─── Directory Grid ─────────────────────────────────────────────────────────
function DirectoryGrid({ entries, selectedPath, selectedPaths, onSelect, onToggleSelect, onOpen, onContextMenu }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3 p-5">
      {entries.map(entry => {
        const { Icon, color } = fileIconMeta(entry.ext || '', entry.type);
        const selected = selectedPath === entry.path;
        const checked = selectedPaths.has(entry.path);
        return (
          <button
            key={entry.path}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
            className={`group relative flex min-h-[108px] flex-col items-center justify-center gap-2 rounded-lg border px-3 py-4 transition-all ${
              selected || checked
                ? 'border-gray-300 dark:border-gray-600 midnight:border-gray-600 bg-gray-50 dark:bg-white/[0.04] midnight:bg-white/[0.04] ring-1 ring-gray-200 dark:ring-gray-700 midnight:ring-gray-700'
                : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700 midnight:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/[0.03] midnight:hover:bg-white/[0.03]'
            }`}
          >
            <SelectionBox checked={checked} onClick={(e) => { e.stopPropagation(); onToggleSelect(entry); }} />
            <Icon className={`w-7 h-7 ${color}`} />
            <span className={`w-full text-xs text-center truncate px-1 ${selected ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
              {entry.name}{entry.type === 'dir' ? '/' : ''}
            </span>
            {entry.type === 'dir' && entry.childrenCount != null && (
              <span className="text-[10px] text-gray-400">{entry.childrenCount} item{entry.childrenCount !== 1 ? 's' : ''}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Directory View ─────────────────────────────────────────────────────────
function SortHeader({ label, sortKey, activeSort, activeOrder, onSort, className = '' }) {
  const active = activeSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ${className}`}
    >
      {label}
      {active && <ChevronRight className={`h-3 w-3 transition-transform ${activeOrder === 'desc' ? 'rotate-90' : '-rotate-90'}`} />}
    </button>
  );
}

function DirectoryView({ entries, viewMode, selectedPath, selectedPaths, onSelect, onToggleSelect, onToggleAll, allSelected, onOpen, onContextMenu, searchActive, sort, order, onSort }) {
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
    return <DirectoryGrid entries={entries} selectedPath={selectedPath} selectedPaths={selectedPaths} onSelect={onSelect} onToggleSelect={onToggleSelect} onOpen={onOpen} onContextMenu={onContextMenu} />;
  }

  return (
    <div className="pb-20">
      <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_96px_172px] items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur">
        <span className="flex items-center gap-3 pl-1">
          <SelectionBox checked={allSelected} onClick={(e) => { e.stopPropagation(); onToggleAll(); }} />
          <SortHeader label="Name" sortKey="name" activeSort={sort} activeOrder={order} onSort={onSort} />
        </span>
        <SortHeader label="Size" sortKey="size" activeSort={sort} activeOrder={order} onSort={onSort} className="justify-end" />
        <SortHeader label="Modified" sortKey="mtime" activeSort={sort} activeOrder={order} onSort={onSort} className="hidden justify-end md:inline-flex" />
      </div>
      {entries.map(entry => (
        <DirectoryRow
          key={entry.path}
          entry={entry}
          selected={selectedPath === entry.path}
          checked={selectedPaths.has(entry.path)}
          onSelect={onSelect}
          onToggleSelect={onToggleSelect}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

// ─── File Preview ───────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a']);
const MD_EXTS = new Set(['md', 'mdx']);

function PreviewHeader({ entry, extra, actions }) {
  const perms = entry?.permissions;
  return (
    <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 bg-[#22262d] gap-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-mono text-gray-400 truncate">{entry?.name}</span>
        {perms && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-gray-600 flex-shrink-0">
            <Lock className="w-2.5 h-2.5" />
            {perms.symbolic}
          </span>
        )}
        {extra}
      </div>
      {actions && <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>}
    </div>
  );
}

function FilePreview({ entry, rootId, onCopy, onExtract, extracting }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [blobError, setBlobError] = useState(null);
  const [mdRendered, setMdRendered] = useState(true);
  const [csvTable, setCsvTable] = useState(true);
  const previewText = useMemo(() => getPreviewText(entry), [entry]);

  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    setBlobError(null);
    if (!entry || entry.type !== 'file') return undefined;
    if (![...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS].includes(entry.ext || '') && entry.ext !== 'pdf') return undefined;
    filesApi.fetchRawBlob(rootId, entry.path)
      .then(url => { if (!cancelled) setBlobUrl(url); })
      .catch(err => { if (!cancelled) setBlobError(err.message || 'Failed to load preview'); });
    return () => { cancelled = true; };
  }, [entry, rootId]);

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const highlighted = useMemo(() => {
    if (!previewText || entry?.tooLarge || entry?.binary || BINARY_EXTS.has(entry?.ext || '')) return '';
    if (MD_EXTS.has(entry?.ext || '')) return '';
    if ((entry?.ext || '') === 'csv') return '';
    try {
      if (hljs.getLanguage(entry?.ext || '')) return hljs.highlight(previewText, { language: entry.ext }).value;
      return hljs.highlightAuto(previewText).value;
    } catch {
      return escapeHtml(previewText);
    }
  }, [entry, previewText]);

  const renderedMd = useMemo(() => {
    if (!mdRendered || !previewText || !MD_EXTS.has(entry?.ext || '')) return '';
    return DOMPurify.sanitize(marked.parse(previewText));
  }, [mdRendered, previewText, entry?.ext]);

  const csvRows = useMemo(() => {
    if (!csvTable || (entry?.ext || '') !== 'csv' || !previewText) return null;
    return parseCSV(previewText);
  }, [csvTable, previewText, entry?.ext]);

  const rawUrl = blobUrl || (entry ? filesApi.getRawUrl(rootId, entry.path) : null);

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

  if (IMAGE_EXTS.has(entry.ext || '')) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
        <PreviewHeader entry={entry} />
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-5">
          {blobError ? (
            <p className="text-sm text-red-300">{blobError}</p>
          ) : rawUrl ? (
            <img src={rawUrl} alt={entry.name} className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          )}
        </div>
      </div>
    );
  }

  if (VIDEO_EXTS.has(entry.ext || '')) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
        <PreviewHeader entry={entry} />
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-5">
          {blobError ? <p className="text-sm text-red-300">{blobError}</p> : <video src={rawUrl} controls className="max-w-full max-h-full rounded-lg shadow-lg" />}
        </div>
      </div>
    );
  }

  if (AUDIO_EXTS.has(entry.ext || '')) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
        <PreviewHeader entry={entry} />
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-5">
          {blobError ? <p className="text-sm text-red-300">{blobError}</p> : <audio src={rawUrl} controls className="w-full max-w-md" />}
        </div>
      </div>
    );
  }

  if (entry.ext === 'pdf') {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
        <PreviewHeader entry={entry} />
        {blobError ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-300">{blobError}</div>
        ) : (
          <iframe title={entry.name} src={rawUrl} className="flex-1 min-h-0 w-full border-0 bg-white" />
        )}
      </div>
    );
  }

  // Archive files
  if (ARCHIVE_EXTS.has(entry.ext || '')) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
        <PreviewHeader entry={entry} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <Archive className="w-8 h-8 text-amber-400 opacity-80" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-300">{entry.name}</p>
            <p className="text-xs text-gray-500 mt-1">{formatSize(entry.size)} archive</p>
          </div>
          <button
            onClick={onExtract}
            disabled={extracting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#5555a0] text-white hover:bg-[#4a4a8f] disabled:opacity-50 transition-colors"
          >
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            {extracting ? 'Extracting…' : 'Extract here'}
          </button>
        </div>
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

  // Markdown
  if (MD_EXTS.has(entry.ext || '')) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
        <PreviewHeader
          entry={entry}
          actions={
            <>
              <button
                onClick={onCopy}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
              <button
                onClick={() => setMdRendered(r => !r)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                {mdRendered ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {mdRendered ? 'Source' : 'Preview'}
              </button>
            </>
          }
        />
        {mdRendered ? (
          <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-950 p-6">
            <article
              className="max-w-none text-sm leading-relaxed text-gray-900 dark:text-gray-100
                [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-2
                [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4
                [&_p]:mb-3
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3
                [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3
                [&_li]:mb-1
                [&_a]:text-[#5555a0] [&_a]:underline [&_a]:underline-offset-2
                [&_code]:bg-gray-100 [&_code]:dark:bg-gray-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:font-mono
                [&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-800 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-auto [&_pre]:mb-3 [&_pre]:text-[12px]
                [&_pre_code]:bg-transparent [&_pre_code]:p-0
                [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:dark:border-gray-600 [&_blockquote]:pl-4 [&_blockquote]:text-gray-500 [&_blockquote]:dark:text-gray-400 [&_blockquote]:mb-3 [&_blockquote]:italic
                [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
                [&_td]:border [&_td]:border-gray-200 [&_td]:dark:border-gray-700 [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm
                [&_th]:border [&_th]:border-gray-200 [&_th]:dark:border-gray-700 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:bg-gray-50 [&_th]:dark:bg-gray-900 [&_th]:text-sm
                [&_hr]:border-gray-200 [&_hr]:dark:border-gray-700 [&_hr]:my-6
                [&_img]:max-w-full [&_img]:rounded-lg"
              dangerouslySetInnerHTML={{ __html: renderedMd }}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <pre className="m-0 p-5 text-[13px] font-mono leading-6">
              <code className="hljs block whitespace-pre" dangerouslySetInnerHTML={{ __html: lineNumberHtml(highlighted || escapeHtml(previewText || '')) }} />
            </pre>
          </div>
        )}
      </div>
    );
  }

  // CSV
  if ((entry.ext || '') === 'csv') {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
        <PreviewHeader
          entry={entry}
          extra={csvRows && <span className="text-[10px] text-gray-600">{csvRows.length} rows</span>}
          actions={
            <>
              <button
                onClick={onCopy}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
              <button
                onClick={() => setCsvTable(t => !t)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                {csvTable ? <EyeOff className="w-3 h-3" /> : <Table2 className="w-3 h-3" />}
                {csvTable ? 'Raw' : 'Table'}
              </button>
            </>
          }
        />
        {csvTable && csvRows ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 bg-[#1e2228]">
                {csvRows.slice(0, 1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <th key={ci} className="px-3 py-2 text-left font-semibold text-gray-300 border-b border-white/10 border-r border-white/5 whitespace-nowrap">
                        {cell}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {csvRows.slice(1).map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-gray-300 border-b border-white/5 border-r border-white/[0.04] max-w-[260px] truncate">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <pre className="m-0 p-5 text-[13px] font-mono leading-6">
              <code className="hljs block whitespace-pre" dangerouslySetInnerHTML={{ __html: lineNumberHtml(escapeHtml(previewText || '')) }} />
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Generic text / code
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#1a1d21]">
      <PreviewHeader
        entry={entry}
        actions={
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <pre className="m-0 p-5 text-[13px] font-mono leading-6">
          <code className="hljs block whitespace-pre" dangerouslySetInnerHTML={{ __html: lineNumberHtml(highlighted || escapeHtml(previewText || '')) }} />
        </pre>
      </div>
    </div>
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
  const sort = searchParams.get('sort') || 'name';
  const order = searchParams.get('order') || 'asc';

  const [roots, setRoots] = useState([]);
  const [entry, setEntry] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState('name'); // 'name' | 'content'
  const [searchResults, setSearchResults] = useState(null);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item }

  // Modals
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameModalConfig, setNameModalConfig] = useState({ title: '', placeholder: '', onConfirm: () => {} });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState([]);
  const [overwriteConfirm, setOverwriteConfirm] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const activeEntry = entry?.type === 'file' ? entry : selectedPreview;
  const entries = searchResults || (entry?.type === 'dir' ? entry.entries : []);
  const selectedItems = useMemo(() => entries.filter(item => selectedPaths.has(item.path)), [entries, selectedPaths]);
  const selectedCount = selectedItems.length;
  const allSelected = entries.length > 0 && selectedPaths.size === entries.length;
  const isRoot = currentPath === '.';

  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const navigateTo = useCallback((path, nextRootId = rootId, extra = {}) => {
    const nextParams = {
      rootId: nextRootId,
      path: path || '.',
      view: extra.view || viewMode,
      sort: extra.sort || sort,
      order: extra.order || order,
    };
    const hidden = extra.hidden ?? showHidden;
    if (hidden) nextParams.hidden = 'true';
    setSearchParams(nextParams);
  }, [order, rootId, setSearchParams, showHidden, sort, viewMode]);

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
    setSelectedPaths(new Set());
    setEditing(false);
    try {
      const res = await filesApi.loadEntry(rootId, currentPath, showHidden, { sort, order });
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
  }, [rootId, currentPath, showHidden, sort, order]);

  useEffect(() => { loadRoots().catch(() => {}); }, [loadRoots]);
  useEffect(() => { loadEntry(); }, [loadEntry]);

  useEffect(() => {
    let cancelled = false;
    setSelectedPreview(null);
    if (!selected || selected.type !== 'file' || entry?.type !== 'dir') return undefined;

    filesApi.loadEntry(rootId, selected.path, showHidden, { sort, order })
      .then(res => {
        if (!cancelled && res.success && res.type === 'file') {
          setSelectedPreview(res);
          setEditText(res.content || '');
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [entry?.type, order, rootId, selected, showHidden, sort]);

  useEffect(() => { setEditing(false); }, [selected?.path]);

  const goUp = useCallback(() => {
    if (isRoot) return;
    navigateTo(dirname(currentPath));
  }, [currentPath, isRoot, navigateTo]);

  const openEntry = useCallback((item) => {
    navigateTo(item.path);
  }, [navigateTo]);

  const setViewMode = useCallback((nextMode) => {
    navigateTo(currentPath, rootId, { view: nextMode });
  }, [currentPath, navigateTo, rootId]);

  const setSortMode = useCallback((nextSort) => {
    const nextOrder = sort === nextSort && order === 'asc' ? 'desc' : 'asc';
    navigateTo(currentPath, rootId, { sort: nextSort, order: nextOrder });
  }, [currentPath, navigateTo, order, rootId, sort]);

  const toggleHidden = useCallback(() => {
    navigateTo(currentPath, rootId, { hidden: !showHidden });
  }, [currentPath, navigateTo, rootId, showHidden]);

  const copyPath = useCallback((target) => {
    const paths = target
      ? [target.path]
      : selectedItems.length ? selectedItems.map(item => item.path) : [selected?.path || currentPath];
    navigator.clipboard?.writeText(paths.join('\n'));
    showToast(paths.length === 1 ? 'Path copied' : `${paths.length} paths copied`);
  }, [currentPath, selected, selectedItems, showToast]);

  const agentPrompt = useCallback((target) => {
    const items = target ? [target] : (selectedItems.length ? selectedItems : [selected || entry].filter(Boolean));
    const targetLines = items.map(item => `- ${item.path || currentPath} (${item.type || 'path'})`).join('\n');
    const prompt = `Use the file explorer selection as context.\nRoot: ${rootId}\n${items.length > 1 ? `Selected paths:\n${targetLines}` : `Path: ${items[0]?.path || currentPath}\nType: ${items[0]?.type || entry?.type || 'path'}`}\n\nHelp me work with this path.`;
    window.dispatchEvent(new CustomEvent('asyncat:prefill-agent', { detail: { prompt, rootId, path: items[0]?.path || currentPath } }));
    navigate('/agents');
  }, [currentPath, entry, navigate, rootId, selected, selectedItems]);

  const openNameModal = useCallback((config) => {
    setNameModalConfig({
      validate: (name) => isUnsafeName(name) ? 'Use a name without slashes or reserved path segments' : '',
      ...config,
    });
    setShowNameModal(true);
  }, []);

  const createFolder = useCallback(() => {
    openNameModal({
      title: 'New Folder',
      placeholder: 'New Folder',
      confirmLabel: 'Create',
      onConfirm: async (name) => {
        try {
          await filesApi.createFolder(rootId, joinPath(entry?.type === 'dir' ? currentPath : dirname(currentPath), name), { overwrite: false });
          showToast('Folder created');
          await loadEntry();
        } catch (err) {
          showToast(err.code === 'CONFLICT' ? 'A folder or file with that name already exists' : (err.message || 'Create folder failed'), 'error');
        }
      },
    });
  }, [currentPath, entry, loadEntry, openNameModal, rootId, showToast]);

  const createFile = useCallback(() => {
    openNameModal({
      title: 'New File',
      placeholder: 'untitled.txt',
      confirmLabel: 'Create',
      onConfirm: async (name) => {
        const filePath = joinPath(entry?.type === 'dir' ? currentPath : dirname(currentPath), name);
        try {
          await filesApi.writeFile(rootId, filePath, '', { overwrite: false });
          showToast('File created');
          navigateTo(filePath);
        } catch (err) {
          showToast(err.code === 'CONFLICT' ? 'A file or folder with that name already exists' : (err.message || 'Create file failed'), 'error');
        }
      },
    });
  }, [currentPath, entry, navigateTo, openNameModal, rootId, showToast]);

  const renameSelected = useCallback((target) => {
    const item = target || (selectedItems.length === 1 ? selectedItems[0] : selected);
    if (!item || (!target && selectedItems.length > 1)) return;
    openNameModal({
      title: 'Rename',
      placeholder: item.name,
      initialValue: item.name,
      confirmLabel: 'Rename',
      onConfirm: async (name) => {
        if (name === item.name) return;
        const dest = joinPath(dirname(item.path), name);
        try {
          await filesApi.move(rootId, item.path, dest, { overwrite: false });
          showToast('Renamed');
          navigateTo(dest);
        } catch (err) {
          showToast(err.code === 'CONFLICT' ? 'A file or folder with that name already exists' : (err.message || 'Rename failed'), 'error');
        }
      },
    });
  }, [navigateTo, openNameModal, rootId, selected, selectedItems, showToast]);

  const copySelected = useCallback((target) => {
    const targets = target ? [target] : (selectedItems.length ? selectedItems : (selected ? [selected] : []));
    if (!targets.length) return;
    if (targets.length > 1) {
      const batchEntries = targets.map(item => ({
        source: item.path,
        destination: uniqueDuplicatePath(item, entries),
        overwrite: false,
      }));
      filesApi.batchCopy(rootId, batchEntries)
        .then(async (res) => {
          if (res.errors?.length) showToast(`${res.errors.length} item${res.errors.length !== 1 ? 's' : ''} could not be duplicated`, 'error');
          else showToast(`${targets.length} items duplicated`);
          await loadEntry();
        })
        .catch(err => showToast(err.message || 'Duplicate failed', 'error'));
      return;
    }
    const item = targets[0];
    const base = item.name || basename(item.path);
    openNameModal({
      title: 'Copy as',
      placeholder: duplicateName(base),
      initialValue: duplicateName(base),
      confirmLabel: 'Duplicate',
      onConfirm: async (name) => {
        try {
          await filesApi.copy(rootId, item.path, joinPath(dirname(item.path), name), { overwrite: false });
          showToast('Duplicated');
          await loadEntry();
        } catch (err) {
          showToast(err.code === 'CONFLICT' ? 'A file or folder with that name already exists' : (err.message || 'Duplicate failed'), 'error');
        }
      },
    });
  }, [entries, loadEntry, openNameModal, rootId, selected, selectedItems, showToast]);

  const deleteSelected = useCallback((target) => {
    const targets = target ? [target] : (selectedItems.length ? selectedItems : (selected ? [selected] : []));
    if (!targets.length) return;
    setDeleteTargets(targets);
    setShowDeleteModal(true);
  }, [selected, selectedItems]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets.length) return;
    const nextPath = deleteTargets.some(target => target.type === 'file' && currentPath === target.path) ? dirname(currentPath) : currentPath;
    if (deleteTargets.length === 1) {
      const target = deleteTargets[0];
      await filesApi.delete(rootId, target.path, target.type === 'dir');
    } else {
      const res = await filesApi.batchDelete(rootId, deleteTargets.map(target => ({ path: target.path, recursive: target.type === 'dir' })));
      if (res.errors?.length) showToast(`${res.errors.length} item${res.errors.length !== 1 ? 's' : ''} could not be deleted`, 'error');
    }
    showToast(deleteTargets.length === 1 ? 'Deleted' : `${deleteTargets.length} items deleted`);
    setSelected(null);
    setSelectedPaths(new Set());
    if (nextPath !== currentPath) navigateTo(nextPath);
    else await loadEntry();
    setShowDeleteModal(false);
    setDeleteTargets([]);
  }, [currentPath, deleteTargets, loadEntry, navigateTo, rootId, showToast]);

  const runSearch = useCallback(async () => {
    if (!search.trim()) { setSearchResults(null); return; }
    const options = { sort: 'relevance', order };
    if (searchMode === 'content') options.contentQuery = search;
    const res = await filesApi.search(rootId, entry?.type === 'dir' ? currentPath : dirname(currentPath), search, showHidden, 120, options);
    if (res.success) setSearchResults(res.entries || []);
  }, [currentPath, entry, order, rootId, search, searchMode, showHidden]);

  const saveEdit = useCallback(async () => {
    if (!activeEntry) return;
    setSaving(true);
    try {
      await filesApi.writeFile(rootId, activeEntry.path, editText, { overwrite: true });
      setEditing(false);
      showToast('Saved');
      await loadEntry();
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [activeEntry, editText, loadEntry, rootId, showToast]);

  const extractCurrentArchive = useCallback(async (target) => {
    const item = target || activeEntry;
    if (!item) return;
    setExtracting(true);
    try {
      const res = await filesApi.extractArchive(rootId, item.path);
      if (res.success) {
        showToast(`Extracted to ${res.extractedTo}`);
        await loadEntry();
      } else {
        showToast(res.error || 'Extraction failed', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Extraction failed', 'error');
    } finally {
      setExtracting(false);
    }
  }, [activeEntry, loadEntry, rootId, showToast]);

  const createArchiveFromSelection = useCallback((target) => {
    const targets = target ? [target] : (selectedItems.length ? selectedItems : (selected ? [selected] : []));
    if (!targets.length) return;
    const defaultName = targets.length === 1
      ? `${targets[0].name || basename(targets[0].path)}.zip`
      : 'archive.zip';
    openNameModal({
      title: 'Create Archive',
      placeholder: defaultName,
      initialValue: defaultName,
      confirmLabel: 'Create',
      onConfirm: async (name) => {
        const destination = joinPath(entry?.type === 'dir' ? currentPath : dirname(currentPath), name);
        try {
          const res = await filesApi.createArchive(rootId, targets.map(t => t.path), destination);
          if (res.success) {
            showToast(`Archive created: ${basename(res.archivePath)}`);
            await loadEntry();
          } else {
            showToast(res.error || 'Archive creation failed', 'error');
          }
        } catch (err) {
          showToast(err.message || 'Archive creation failed', 'error');
        }
      },
    });
  }, [currentPath, entry, loadEntry, openNameModal, rootId, selected, selectedItems, showToast]);

  const uploadFiles = useCallback(async (fileList, options = {}) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const basePath = entry?.type === 'dir' ? currentPath : dirname(currentPath);
    setUploading(true);
    try {
      let uploadedCount = 0;
      for (const file of files) {
        const targetPath = joinPath(basePath, file.name);
        try {
          await filesApi.upload(rootId, targetPath, file, { overwrite: options.overwrite === true });
          uploadedCount += 1;
        } catch (err) {
          if (err.code === 'CONFLICT' && !options.overwrite) {
            setOverwriteConfirm({
              title: 'Replace existing file?',
              message: `${file.name} already exists in this folder.`,
              onConfirm: () => uploadFiles([file], { overwrite: true }),
            });
          } else {
            showToast(err.message || `Upload failed for ${file.name}`, 'error');
          }
        }
      }
      if (uploadedCount > 0) showToast(uploadedCount === 1 ? 'Uploaded' : `${uploadedCount} files uploaded`);
      await loadEntry();
    } finally {
      setUploading(false);
    }
  }, [currentPath, entry, loadEntry, rootId, showToast]);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const onDragEnter = useCallback((e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current += 1; setIsDragOver(true); }, []);
  const onDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragOver(false); }
  }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false); dragCounterRef.current = 0;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) uploadFiles(files);
  }, [uploadFiles]);

  const selectEntry = useCallback((item) => { setSelected(item); }, []);
  const toggleSelect = useCallback((item) => {
    setSelected(item);
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setSelectedPaths(prev => {
      if (entries.length > 0 && prev.size === entries.length) return new Set();
      return new Set(entries.map(item => item.path));
    });
  }, [entries]);

  const handleContextMenu = useCallback((e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(item);
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
            {selectedCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[#5555a0]/10 px-2 py-1 text-xs font-medium text-[#5555a0] animate-fadeIn">
                {selectedCount} selected
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
          <div className="flex flex-col gap-3 px-5 pb-3 lg:flex-row lg:items-center">
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') { setSearch(''); setSearchResults(null); } }}
                  placeholder={searchMode === 'content' ? 'Search file contents…' : 'Search in this folder'}
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
              <button
                onClick={() => setSearchMode(m => m === 'name' ? 'content' : 'name')}
                title={searchMode === 'name' ? 'Switch to content search' : 'Switch to filename search'}
                className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                  searchMode === 'content'
                    ? 'border-[#5555a0] bg-[#5555a0]/10 text-[#5555a0]'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {searchMode === 'content' ? 'Content' : 'Name'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              <button onClick={createFile} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <FilePlus className="w-3.5 h-3.5" />
                New File
              </button>
              <button onClick={createFolder} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <FolderPlus className="w-3.5 h-3.5" />
                New Folder
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? 'Uploading' : 'Upload'}
              </button>
              <button onClick={() => agentPrompt()} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-gray-100 dark:bg-white/[0.08] midnight:bg-white/[0.08] border border-gray-200 dark:border-gray-700 midnight:border-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.12] midnight:hover:bg-white/[0.12] transition-colors">
                <Bot className="w-3.5 h-3.5" />
                Agent
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
              <ActionsDropdown
                selectedCount={selectedCount || (selected ? 1 : 0)}
                selected={selected}
                onRename={() => renameSelected()}
                onDuplicate={() => copySelected()}
                onCopyPaths={() => copyPath()}
                onDelete={() => deleteSelected()}
                onCreateArchive={() => createArchiveFromSelection()}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className={`flex-1 min-h-0 overflow-auto relative ${isDragOver ? 'bg-[#5555a0]/5' : ''}`}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { uploadFiles(e.target.files); e.target.value = ''; }}
          />
          {isDragOver && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#5555a0]/10 border-2 border-dashed border-[#5555a0] m-4 rounded-xl pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-[#5555a0]">
                <Upload className="w-10 h-10" />
                <span className="text-sm font-medium">Drop files to upload</span>
              </div>
            </div>
          )}
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
                    {`${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${search}" (${searchMode})`}
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
                selectedPaths={selectedPaths}
                onSelect={selectEntry}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                allSelected={allSelected}
                onOpen={openEntry}
                onContextMenu={handleContextMenu}
                searchActive={searchResults !== null}
                sort={sort}
                order={order}
                onSort={setSortMode}
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
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{entry.name}</span>
                  {entry.permissions && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-gray-400 flex-shrink-0">
                      <Lock className="w-2.5 h-2.5" />
                      {entry.permissions.symbolic}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {entry.isEditable && !entry.tooLarge && (
                    <button
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => { navigator.clipboard?.writeText(getPreviewText(entry)); showToast('Content copied'); }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>
              <FilePreview
                entry={entry}
                rootId={rootId}
                onCopy={() => { navigator.clipboard?.writeText(getPreviewText(entry)); showToast('Content copied'); }}
                onExtract={() => extractCurrentArchive()}
                extracting={extracting}
              />
            </div>
          )}

          {/* Selected file preview in dir view */}
          {!loading && !error && entry?.type === 'dir' && !editing && selectedPreview && (
            <div className="hidden">
              {/* selectedPreview is available for context menu and agent actions */}
            </div>
          )}
        </div>
      </main>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={closeContextMenu}
          onOpen={() => openEntry(contextMenu.item)}
          onEdit={() => setEditing(true)}
          onRename={() => renameSelected(contextMenu.item)}
          onDuplicate={() => copySelected(contextMenu.item)}
          onCopyPath={() => copyPath(contextMenu.item)}
          onDelete={() => deleteSelected(contextMenu.item)}
          onExtract={() => extractCurrentArchive(contextMenu.item)}
          onCreateArchive={() => createArchiveFromSelection(contextMenu.item)}
          onAgent={() => agentPrompt(contextMenu.item)}
        />
      )}

      <NameModal
        open={showNameModal}
        onClose={() => setShowNameModal(false)}
        title={nameModalConfig.title}
        placeholder={nameModalConfig.placeholder}
        initialValue={nameModalConfig.initialValue}
        confirmLabel={nameModalConfig.confirmLabel}
        validate={nameModalConfig.validate}
        onConfirm={nameModalConfig.onConfirm}
      />

      <DeleteModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        targets={deleteTargets}
        onConfirm={confirmDelete}
      />
      <ConfirmModal
        open={!!overwriteConfirm}
        onClose={() => setOverwriteConfirm(null)}
        title={overwriteConfirm?.title}
        message={overwriteConfirm?.message}
        confirmLabel="Replace"
        destructive
        onConfirm={overwriteConfirm?.onConfirm}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
