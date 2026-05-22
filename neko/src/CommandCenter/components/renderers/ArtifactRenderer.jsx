// neko/src/CommandCenter/components/ArtifactRenderer.jsx
// ─── Artifact Preview & Download Component ──────────────────────────────────
// Renders agent-created artifacts inline with preview and download.
// Matches the minimal, compact design language of the AgentRunFeed.

import { useEffect, useState, useMemo } from 'react';
import {
  Download, FileText, Table2, Code2,
  BarChart3, Globe, Image, ChevronDown, ChevronRight,
  X, Maximize2, Copy, Check, FileDown, PanelRight, BookOpen, Palette, FileArchive,
} from 'lucide-react';
import { parseAIResponseToBlocks, BlockRenderer, headingId } from './BlockBasedMessageRenderer';
import { agentApi } from '../../api';
import { notesApi } from '../../../notes/noteApi';
import { NoteProvider } from '../../../notes/context/NoteProvider';
import ModernNoteEditor from '../../../notes/modern/ModernNoteEditor';

// ── Type config ─────────────────────────────────────────────────────────────
const TYPE_META = {
  markdown: { icon: FileText,  label: 'Document',   accent: 'bg-blue-500' },
  html:     { icon: Globe,     label: 'HTML',        accent: 'bg-orange-500' },
  design:   { icon: Palette,   label: 'Design',      accent: 'bg-fuchsia-500' },
  animation:{ icon: Palette,   label: 'Animation',   accent: 'bg-cyan-500' },
  mermaid:  { icon: BarChart3, label: 'Diagram',     accent: 'bg-violet-500' },
  csv:      { icon: Table2,    label: 'CSV Data',    accent: 'bg-emerald-500' },
  json:     { icon: Code2,     label: 'JSON',        accent: 'bg-amber-500' },
  code:     { icon: Code2,     label: 'Code',        accent: 'bg-cyan-500' },
  svg:      { icon: Image,     label: 'SVG',         accent: 'bg-pink-500' },
  pdf:      { icon: FileDown,  label: 'PDF',         accent: 'bg-red-500' },
  zip:      { icon: FileArchive, label: 'Bundle',    accent: 'bg-fuchsia-500' },
  text:     { icon: FileText,  label: 'Text',        accent: 'bg-gray-500' },
  note:     { icon: BookOpen,  label: 'Note',        accent: 'bg-indigo-500' },
};

function getTypeMeta(type) {
  return TYPE_META[type] || TYPE_META.text;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

// ── CSV Table ───────────────────────────────────────────────────────────────
function CsvPreview({ content, maxRows = 15 }) {
  const rows = useMemo(() => {
    if (!content) return [];
    return content.split('\n').filter(Boolean).map(line => {
      const fields = [];
      let field = '';
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { fields.push(field); field = ''; continue; }
        field += ch;
      }
      fields.push(field);
      return fields;
    });
  }, [content]);

  if (rows.length < 2) return <pre className="text-[11px] text-gray-500 font-mono">{content}</pre>;

  const headers = rows[0];
  const dataRows = rows.slice(1, maxRows + 1);
  const truncated = rows.length - 1 > maxRows;

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 bg-gray-50/80 dark:bg-gray-800/60 border-b border-gray-150 dark:border-gray-700/80 whitespace-nowrap first:rounded-tl last:rounded-tr">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
          {dataRows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2.5 py-1 text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5 text-center">
          {maxRows} of {rows.length - 1} rows shown
        </p>
      )}
    </div>
  );
}

// ── Code block ──────────────────────────────────────────────────────────────
function CodePreview({ content, fullHeight = false }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative group ${fullHeight ? 'h-full min-h-[320px]' : ''}`}>
      <button
        onClick={handleCopy}
        className="absolute right-1.5 top-1.5 p-1 rounded text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-300 hover:bg-gray-800"
        title="Copy"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
      <pre className={`${fullHeight ? 'h-full min-h-[320px]' : 'max-h-64'} overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-2.5 font-mono text-[11px] leading-relaxed text-gray-300`}>
        {content?.slice(0, 5000)}
        {content?.length > 5000 && '\n\n… [truncated]'}
      </pre>
    </div>
  );
}

// ── Markdown ────────────────────────────────────────────────────────────────
function MarkdownPreview({ content }) {
  let blocks = [];
  try { blocks = parseAIResponseToBlocks(content || ''); } catch { blocks = []; }

  return (
    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      {blocks.length > 0
        ? blocks.map((block, i) => <BlockRenderer key={i} block={block} />)
        : <pre className="whitespace-pre-wrap text-[12px]">{content}</pre>}
    </div>
  );
}

// ── HTML iframe ─────────────────────────────────────────────────────────────
function HtmlPreview({ content, title, fullHeight = false, allowFullscreen = true }) {
  const [fullscreen, setFullscreen] = useState(false);
  const blob = useMemo(() => {
    if (!content) return null;
    return URL.createObjectURL(new Blob([content], { type: 'text/html' }));
  }, [content]);

  useEffect(() => {
    return () => {
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [blob]);

  return (
    <>
      <div className={`relative rounded overflow-hidden border border-gray-200 dark:border-gray-700 ${fullHeight ? 'h-full min-h-[360px]' : ''}`}>
        <iframe
          src={blob}
          title={title || 'Preview'}
          className={`w-full bg-white ${fullHeight ? 'h-full' : 'h-56'}`}
          sandbox="allow-scripts allow-same-origin"
        />
        {allowFullscreen && (
          <button
            onClick={() => setFullscreen(true)}
            className="absolute bottom-1.5 right-1.5 p-1 rounded bg-black/40 text-white/80 hover:bg-black/60 transition-colors"
            title="Full screen"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
      </div>
      {fullscreen && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900">
            <span className="text-sm font-medium text-white">{title}</span>
            <button onClick={() => setFullscreen(false)} className="p-1 rounded hover:bg-gray-700 text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <iframe src={blob} title={title} className="flex-1 w-full bg-white" sandbox="allow-scripts allow-same-origin" />
        </div>
      )}
    </>
  );
}

function ArtifactFullscreenOverlay({ artifact, content, type, title, onClose }) {
  const renderFullscreenContent = () => {
    switch (type) {
      case 'note':
        return <NotePanel html={content} noteId={artifact.noteId} title={title} fullHeight />;
      case 'markdown':
      case 'pdf_source':
        return (
          <div className="h-full overflow-auto bg-white px-8 py-7 dark:bg-gray-950">
            <MarkdownPreview content={content} />
          </div>
        );
      case 'html':
      case 'design':
      case 'animation':
      case 'mermaid':
        return <HtmlPreview content={content} title={title} fullHeight allowFullscreen={false} />;
      case 'csv':
        return (
          <div className="h-full overflow-auto bg-white p-6 dark:bg-gray-950">
            <CsvPreview content={content} maxRows={500} />
          </div>
        );
      case 'svg':
        return (
          <div className="flex h-full items-center justify-center overflow-auto bg-white p-6 dark:bg-gray-950">
            <div dangerouslySetInnerHTML={{ __html: content }} className="max-h-full max-w-full" />
          </div>
        );
      case 'json':
      case 'code':
      default:
        return <CodePreview content={content} fullHeight />;
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-gray-950/90 backdrop-blur-sm">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-gray-950 px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="truncate text-[10px] text-gray-400">{artifact.path || artifact.filename || type}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          title="Close full screen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-white dark:bg-gray-950">
        {renderFullscreenContent()}
      </div>
    </div>
  );
}

// ── Note panel — always the full rich editor, embedded in the side panel ─────
function NotePanel({ html, noteId, title, fullHeight }) {
  return (
    <div className={`flex flex-col ${fullHeight ? 'h-full' : 'h-[640px]'} -mx-3 -my-2.5`}>
      <NoteProvider>
        <ModernNoteEditor
          note={{ id: noteId, title: title || 'Untitled Note', content: html || '' }}
          onBack={() => {}}
          embedded
        />
      </NoteProvider>
    </div>
  );
}

// ── Main ArtifactCard ───────────────────────────────────────────────────────
// Uses a <div> wrapper with onClick for toggle instead of nested buttons.
export default function ArtifactCard({ artifact, defaultExpanded = false, onOpen = null, fullHeight = false }) {
  const artifactData = artifact || {};
  const [expanded, setExpanded] = useState(defaultExpanded && !onOpen);
  const [content, setContent] = useState(artifactData.content || null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const type = artifactData.type || artifactData.originalType || 'text';
  const meta = getTypeMeta(type);
  const Icon = meta.icon;
  const title = artifactData.title || artifactData.filename || 'Untitled';
  const size = formatSize(artifactData.size || artifactData.sizeBytes);
  const filename = artifactData.filename || '';
  const artifactPath = artifactData.path || '';
  const downloadOnly = type === 'zip' || type === 'pdf';
  const canFullscreen = !downloadOnly;

  const loadContent = async () => {
    if (downloadOnly) return null;
    if (content) return content;
    if (loading) return null;
    setLoading(true);
    setFetchError(null);
    try {
      if (artifactData.content) {
        setContent(artifactData.content);
        return artifactData.content;
      } else if (type === 'note' && artifactData.noteId) {
        const note = await notesApi.fetchNoteWithContent(artifactData.noteId);
        if (note) {
          const nextContent = note.content || '';
          setContent(nextContent);
          return nextContent;
        }
      } else if (filename) {
        const data = await agentApi.getArtifact(filename);
        if (data.success) {
          setContent(data.content);
          return data.content;
        }
      }
    } catch (err) {
      console.error('Failed to load artifact:', err);
      setFetchError(err.message || 'Failed to load preview');
    } finally {
      setLoading(false);
    }
    return null;
  };

  useEffect(() => {
    if (expanded) loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, filename]);

  const tocItems = useMemo(() => {
    if (!fullHeight || !content || (type !== 'markdown' && type !== 'pdf_source')) return [];
    const re = /^(#{1,3})\s+(.+)$/gm;
    const items = [];
    let m;
    while ((m = re.exec(content)) !== null) {
      const text = m[2].replace(/[*_`[\]()]/g, '').trim();
      items.push({ level: m[1].length, text, id: headingId(text) });
    }
    return items;
  }, [fullHeight, content, type]);

  if (!artifact) return null;

  const handleToggle = async (e) => {
    if (onOpen) { e?.stopPropagation(); onOpen(); return; }
    if (!expanded) loadContent();
    setExpanded(v => !v);
  };

  const handleDownload = async (e) => {
    e?.stopPropagation?.();
    if (downloading) return;
    try {
      setDownloading(true);
      if (filename) {
        const { blob } = await agentApi.downloadArtifact(filename);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      if (content || artifactData.content) {
        // Fallback: download from content already in memory
        const data = content || artifactData.content;
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'artifact.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download artifact:', err);
      setFetchError(err.message || 'Failed to download artifact');
    } finally {
      setDownloading(false);
    }
  };

  const handleFullscreen = async (e) => {
    e?.stopPropagation?.();
    if (!canFullscreen) return;
    const loadedContent = content || await loadContent();
    if (loadedContent != null || type === 'note') setFullscreenOpen(true);
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="py-4 flex items-center justify-center gap-2 text-[11px] text-gray-400 dark:text-gray-600">
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          Loading preview…
        </div>
      );
    }
    if (downloadOnly) {
      return (
        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
          <p className="mb-2">
            {type === 'zip' ? 'This bundle is available as a download.' : 'This PDF is available as a download.'}
          </p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            <Download className="h-3 w-3" />
            {downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      );
    }
    if (!content) {
      return (
        <div className="py-3 text-center">
          {fetchError && (
            <p className="mb-2 text-[11px] text-red-500 dark:text-red-400">
              {fetchError}
            </p>
          )}
          <button
            type="button"
            onClick={loadContent}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
          >
            Load preview
          </button>
        </div>
      );
    }
    switch (type) {
      case 'note':
        return <NotePanel html={content} noteId={artifactData.noteId} title={title} fullHeight={fullHeight} />;
      case 'markdown':
      case 'pdf_source':
        return <MarkdownPreview content={content} />;
      case 'html':
      case 'design':
      case 'animation':
      case 'mermaid':
        return <HtmlPreview content={content} title={title} fullHeight={fullHeight} />;
      case 'csv':
        return <CsvPreview content={content} maxRows={fullHeight ? 100 : 15} />;
      case 'json':
        return <CodePreview content={content} fullHeight={fullHeight} />;
      case 'code':
        return <CodePreview content={content} fullHeight={fullHeight} />;
      case 'svg':
        return (
          <div className={`flex items-center justify-center p-3 bg-white dark:bg-gray-900 rounded ${fullHeight ? 'h-full min-h-[320px]' : ''}`}>
            <div dangerouslySetInnerHTML={{ __html: content }} className={`max-w-full ${fullHeight ? 'max-h-full' : 'max-h-52'}`} />
          </div>
        );
      default:
        return <CodePreview content={content} fullHeight={fullHeight} />;
    }
  };

  return (
    <div className={`overflow-hidden rounded-lg border border-gray-100 bg-white/80 dark:border-gray-800 dark:bg-gray-950/30 ${fullHeight ? 'flex flex-col h-full' : ''}`}>
      {/* Header — interactive only when inline toggle is active */}
      <div
        {...((!onOpen && !fullHeight) ? {
          role: 'button',
          tabIndex: 0,
          onClick: handleToggle,
          onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && handleToggle(),
          className: 'flex w-full items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer select-none transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40',
        } : {
          className: 'flex w-full items-center gap-2.5 px-3 py-2.5',
        })}
      >
        {/* Accent dot */}
        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${meta.accent}`} />

        {/* Icon */}
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />

        {/* Title and meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
              {title}
            </span>
            <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-600 font-mono">
            {type === 'note'
              ? (artifactData.noteId ? `note:${artifactData.noteId.slice(0, 8)}…` : 'saved note')
              : (artifactPath || filename)}
            {size && <span className="ml-1.5">· {size}</span>}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {type !== 'note' && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title={downloading ? 'Downloading…' : `Download ${filename}`}
            >
              {downloading ? <span className="block h-3.5 w-3.5 animate-pulse rounded-full bg-current opacity-50" /> : <Download className="h-3.5 w-3.5" />}
            </button>
          )}
          {canFullscreen && (
            <button
              type="button"
              onClick={handleFullscreen}
              disabled={loading}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="Open full screen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpen ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-gray-800 dark:hover:text-indigo-400"
            >
              Open <PanelRight className="h-3 w-3" />
            </button>
          ) : !fullHeight && (
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
              {expanded ? 'Hide' : 'View'}
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>
      </div>

      {/* Description (always visible if present) */}
      {artifactData.description && !expanded && (
        <p className="px-3 pb-2 -mt-0.5 text-[10px] text-gray-400 dark:text-gray-600 italic pl-[2.25rem]">
          {artifactData.description}
        </p>
      )}

      {/* TOC navigation — only in full-height (side panel) mode with headings */}
      {expanded && !onOpen && fullHeight && tocItems.length > 0 && (
        <div className="shrink-0 overflow-x-auto border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/50 px-3 py-1.5">
          <div className="flex items-center gap-x-1 min-w-max">
            {tocItems.map((item, i) => (
              <button
                key={`${item.id}-${i}`}
                type="button"
                onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-gray-200/70 hover:text-indigo-600 dark:hover:bg-gray-800 dark:hover:text-indigo-400 ${
                  item.level === 1
                    ? 'font-semibold text-gray-600 dark:text-gray-300'
                    : item.level === 2
                    ? 'font-medium text-gray-500 dark:text-gray-400 pl-3'
                    : 'text-gray-400 dark:text-gray-500 pl-5'
                }`}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Expandable preview */}
      {expanded && !onOpen && (
        <div className={`border-t border-gray-100 dark:border-gray-800 px-3 py-2.5 overflow-y-auto ${fullHeight ? 'flex-1 min-h-0' : 'max-h-80'}`}>
          {renderPreview()}
        </div>
      )}

      {fullscreenOpen && (
        <ArtifactFullscreenOverlay
          artifact={artifactData}
          content={content}
          type={type}
          title={title}
          onClose={() => setFullscreenOpen(false)}
        />
      )}
    </div>
  );
}

export { CsvPreview, CodePreview, MarkdownPreview, HtmlPreview };
