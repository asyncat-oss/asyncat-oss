import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  HardDrive, ChevronRight, Folder, FolderOpen,
  File, FileText, FileCode, Terminal,
  RefreshCw, AlertCircle, Loader2,
  Copy, Check, ArrowLeft, Bot,
  Clock, Database,
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
import { agentApi } from '../CommandCenter/commandCenterApi';

hljs.registerLanguage('javascript', javascript); hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript); hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
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

const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','bmp','ico','webp','svg',
  'woff','woff2','ttf','eot','otf',
  'pdf','zip','tar','gz','rar','7z',
  'exe','dll','so','dylib','bin',
  'mp3','mp4','wav','ogg','mov','avi','mkv',
]);

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(mtime) {
  if (!mtime) return '';
  const d = new Date(mtime);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fileIconMeta(ext) {
  const codeExts  = ['js','jsx','ts','tsx','py','go','rs','rb','java','c','cpp','h','cs','php','swift','kt','vue','astro'];
  const docExts   = ['md','mdx','txt','rst','csv'];
  const dataExts  = ['json','yaml','yml','toml','ini','env','xml'];
  const styleExts = ['css','scss','less','sass'];
  const shellExts = ['sh','bash','zsh','fish','ps1','bat','cmd'];
  if (codeExts.includes(ext))  return { Icon: FileCode, color: 'text-blue-400' };
  if (docExts.includes(ext))   return { Icon: FileText, color: 'text-gray-400' };
  if (dataExts.includes(ext))  return { Icon: Database, color: 'text-orange-400' };
  if (styleExts.includes(ext)) return { Icon: FileCode, color: 'text-pink-400' };
  if (shellExts.includes(ext)) return { Icon: Terminal, color: 'text-green-400' };
  if (ext === 'html' || ext === 'htm') return { Icon: FileCode, color: 'text-orange-500' };
  return { Icon: File, color: 'text-gray-400' };
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────────

function Breadcrumb({ path, onNavigate }) {
  const parts = (!path || path === '.') ? [] : path.split('/').filter(Boolean);
  return (
    <nav className="flex items-center gap-0.5 min-w-0 flex-wrap">
      <button
        onClick={() => onNavigate('.')}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
      >
        <HardDrive className="w-3.5 h-3.5" />
        <span>root</span>
      </button>
      {parts.map((part, i) => {
        const partPath = parts.slice(0, i + 1).join('/');
        const isLast   = i === parts.length - 1;
        return (
          <span key={partPath} className="flex items-center gap-0.5 min-w-0">
            <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            {isLast ? (
              <span className="px-1.5 py-0.5 text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
                {part}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(partPath)}
                className="px-1.5 py-0.5 rounded text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors truncate max-w-[120px]"
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

// ── Directory view ─────────────────────────────────────────────────────────────

function DirEntry({ entry, onNavigate }) {
  const isDir = entry.type === 'dir';
  const { Icon, color } = isDir
    ? { Icon: FolderOpen, color: 'text-amber-400' }
    : fileIconMeta(entry.ext || '');

  return (
    <button
      onClick={() => onNavigate(entry.path)}
      className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
      <span className="flex-1 text-sm font-mono text-gray-800 dark:text-gray-200 truncate group-hover:text-gray-900 dark:group-hover:text-white">
        {entry.name}{isDir ? '/' : ''}
      </span>
      {!isDir && entry.size != null && (
        <span className="text-xs text-gray-400 tabular-nums w-20 text-right flex-shrink-0">
          {formatSize(entry.size)}
        </span>
      )}
      {isDir && <span className="w-20 flex-shrink-0" />}
      <span className="text-xs text-gray-400 w-44 text-right flex-shrink-0 hidden md:block">
        {formatDate(entry.mtime)}
      </span>
    </button>
  );
}

function DirectoryView({ entries, onNavigate }) {
  const dirs  = entries.filter(e => e.type === 'dir');
  const files = entries.filter(e => e.type === 'file');

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-400">
        <Folder className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Empty directory</p>
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
        <div className="w-4 flex-shrink-0" />
        <span className="flex-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Name</span>
        <span className="w-20 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">Size</span>
        <span className="w-44 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0 hidden md:block">Modified</span>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
        {dirs.map(e => <DirEntry key={e.path} entry={e} onNavigate={onNavigate} />)}
        {dirs.length > 0 && files.length > 0 && (
          <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
        )}
        {files.map(e => <DirEntry key={e.path} entry={e} onNavigate={onNavigate} />)}
      </div>
    </div>
  );
}

// ── File viewer ────────────────────────────────────────────────────────────────

function FileView({ data }) {
  const [highlighted, setHighlighted] = useState('');
  const [copied, setCopied]           = useState(false);

  const isBinary = BINARY_EXTS.has(data.ext || '');

  useEffect(() => {
    if (isBinary || data.tooLarge || !data.content) return;
    const lang = data.ext || '';
    let result;
    try {
      if (hljs.getLanguage(lang)) {
        result = hljs.highlight(data.content, { language: lang }).value;
      } else {
        const auto = hljs.highlightAuto(data.content);
        result = auto.value;
      }
    } catch {
      result = data.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    setHighlighted(result);
  }, [data.content, data.ext, isBinary, data.tooLarge]);

  if (isBinary) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-400">
        <File className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm font-medium mb-1">Binary file</p>
        <p className="text-xs">.{data.ext} files cannot be previewed as text</p>
      </div>
    );
  }

  if (data.tooLarge) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-400">
        <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium mb-1">File too large to preview</p>
        <p className="text-xs">{formatSize(data.size)} — limit is 1 MB</p>
      </div>
    );
  }

  const lineCount = (data.content || '').split('\n').length;

  return (
    <div className="relative bg-[#22272e]">
      {/* Top-right toolbar */}
      <div className="absolute top-3 right-4 z-10 flex items-center gap-1.5">
        {data.ext && (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 text-gray-300 border border-white/10">
            .{data.ext}
          </span>
        )}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(data.content || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-white/10 text-gray-300 hover:bg-white/20 border border-white/10 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Line numbers + code — flex side by side */}
      <div className="flex overflow-auto min-h-full text-[13px] font-mono leading-5">
        {/* Line numbers column */}
        <div className="select-none text-right text-[#636e7b] bg-[#1c2128] px-4 py-4 border-r border-[#30363d] flex-shrink-0">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="leading-5 tabular-nums">{i + 1}</div>
          ))}
        </div>

        {/* Code column */}
        <pre className="flex-1 m-0 py-4 px-5 overflow-x-auto bg-[#22272e]">
          <code
            className="hljs text-[13px] leading-5 block whitespace-pre"
            dangerouslySetInnerHTML={{
              __html: highlighted || (data.content || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;'),
            }}
          />
        </pre>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentPath = searchParams.get('path') || '.';

  const [entry, setEntry]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    setEntry(null);
    try {
      const res = await agentApi.loadEntry(p);
      if (res.success) setEntry(res);
      else setError(res.error || 'Could not load path');
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(currentPath); }, [currentPath, load]);

  const handleNavigate = useCallback((p) => {
    setSearchParams({ path: p });
  }, [setSearchParams]);

  const goUp = useCallback(() => {
    if (!currentPath || currentPath === '.') return;
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length <= 1) handleNavigate('.');
    else handleNavigate(parts.slice(0, -1).join('/'));
  }, [currentPath, handleNavigate]);

  const handleOpenInAgent = useCallback(() => {
    window.dispatchEvent(new CustomEvent('asyncat:prefill-agent', {
      detail: { prompt: currentPath }
    }));
    navigate('/agents');
  }, [currentPath, navigate]);

  const isRoot = !currentPath || currentPath === '.';
  const isFile = entry?.type === 'file';
  const isDir  = entry?.type === 'dir';
  const dirCount  = isDir ? entry.entries.filter(e => e.type === 'dir').length : 0;
  const fileCount = isDir ? entry.entries.filter(e => e.type === 'file').length : 0;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950 overflow-hidden">

      {/* ── Header bar ── */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 px-4 py-3">
          {!isRoot && (
            <button
              onClick={goUp}
              title="Go up one level"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <Breadcrumb path={currentPath} onNavigate={handleNavigate} />
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isFile && (
              <button
                onClick={handleOpenInAgent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                <Bot className="w-3.5 h-3.5" />
                Open in agent
              </button>
            )}
            <button
              onClick={() => load(currentPath)}
              title="Refresh"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-header: file meta or dir summary */}
        {isFile && entry && (
          <div className="flex items-center gap-4 px-5 pb-2 text-xs text-gray-400">
            {entry.size != null && (
              <span className="flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                {formatSize(entry.size)}
              </span>
            )}
            {entry.mtime && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Modified {formatDate(entry.mtime)}
              </span>
            )}
          </div>
        )}
        {isDir && (dirCount > 0 || fileCount > 0) && (
          <div className="px-5 pb-2 text-xs text-gray-400">
            {dirCount > 0 && `${dirCount} folder${dirCount !== 1 ? 's' : ''}`}
            {dirCount > 0 && fileCount > 0 && ' · '}
            {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? 's' : ''}`}
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-32 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-32">
            <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{error}</p>
            <button
              onClick={() => load(currentPath)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && isDir && (
          <DirectoryView entries={entry.entries} onNavigate={handleNavigate} />
        )}

        {!loading && !error && isFile && (
          <FileView data={entry} />
        )}
      </div>
    </div>
  );
}
