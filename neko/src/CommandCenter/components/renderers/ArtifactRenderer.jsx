// neko/src/CommandCenter/components/renderers/ArtifactRenderer.jsx
// ─── Artifact Preview & Download Component ──────────────────────────────────
// Renders agent-created artifacts inline with preview and download.
// Matches the minimal, compact design language of the AgentRunFeed.

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import {
  Download, FileText, Table2, Code2,
  BarChart3, Globe, Image, ChevronDown, ChevronRight,
  X, Maximize2, Copy, Check, FileDown, PanelRight, BookOpen, Palette, FileArchive,
  Film, Music, Video, Loader2,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import Button from '../../../components/ui/Button.jsx';
import { parseAIResponseToBlocks, BlockRenderer, headingId } from './BlockBasedMessageRenderer';
import { agentApi } from '../../api';
import { notesApi } from '../../../notes/noteApi';
import { NoteProvider } from '../../../notes/context/NoteProvider';
import { sanitizeSvg } from '../../../utils/sanitizer';

// ── Type config ─────────────────────────────────────────────────────────────
// One neutral icon per type and a plain name; no colour per kind.
const TYPE_META = {
  markdown: { icon: FileText,    label: 'Document' },
  html:     { icon: Globe,       label: 'HTML' },
  design:   { icon: Palette,     label: 'Design' },
  animation:{ icon: Film,        label: 'Animation' },
  image:    { icon: Image,       label: 'Image' },
  video:    { icon: Video,       label: 'Video' },
  audio:    { icon: Music,       label: 'Audio' },
  mermaid:  { icon: BarChart3,   label: 'Diagram' },
  csv:      { icon: Table2,      label: 'CSV' },
  json:     { icon: Code2,       label: 'JSON' },
  code:     { icon: Code2,       label: 'Code' },
  svg:      { icon: Image,       label: 'SVG' },
  pdf:      { icon: FileDown,    label: 'PDF' },
  zip:      { icon: FileArchive, label: 'Bundle' },
  text:     { icon: FileText,    label: 'Text' },
  note:     { icon: BookOpen,    label: 'Note' },
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

  if (rows.length < 2) return <pre className="text-[12px] text-fg-muted font-mono">{content}</pre>;

  const headers = rows[0];
  const dataRows = rows.slice(1, maxRows + 1);
  const truncated = rows.length - 1 > maxRows;

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 text-left font-medium text-fg bg-hover border-b border-line whitespace-nowrap first:rounded-tl last:rounded-tr">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {dataRows.map((row, ri) => (
            <tr key={ri} className="hover:bg-hover transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2.5 py-1 text-fg whitespace-nowrap font-mono">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="text-[11px] text-fg-subtle mt-1.5 text-center">
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
        type="button"
        onClick={handleCopy}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-fg-subtle opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
        title="Copy"
        aria-label={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className={`${fullHeight ? 'h-full min-h-[320px]' : 'max-h-64'} overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-2.5 font-mono text-[12px] leading-relaxed text-fg`}>
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
    <div className="text-[14px] leading-relaxed text-fg">
      {blocks.length > 0
        ? blocks.map((block, i) => <BlockRenderer key={i} block={block} />)
        : <pre className="whitespace-pre-wrap text-[12px]">{content}</pre>}
    </div>
  );
}

// ── HTML iframe ─────────────────────────────────────────────────────────────
function HtmlPreview({ content, title, fullHeight = false, allowFullscreen = true }) {
  const [fullscreen, setFullscreen] = useState(false);
  // A blob: URL shares the app's origin, so the sandbox must not add
  // allow-same-origin: agent-written HTML would then run as the app itself.
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
      <div className={`relative overflow-hidden rounded-lg border border-line ${fullHeight ? 'h-full min-h-[360px]' : ''}`}>
        {/* White like a browser page: agent-written HTML expects it. */}
        <iframe
          src={blob}
          title={title || 'Preview'}
          className={`w-full bg-white ${fullHeight ? 'h-full' : 'h-56'}`}
          sandbox="allow-scripts allow-downloads allow-popups allow-presentation"
          allow="autoplay"
        />
        {allowFullscreen && (
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-fg-subtle transition-colors hover:text-fg"
            title="Full screen"
            aria-label="Full screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {fullscreen && (
        <FullscreenViewer title={title} onClose={() => setFullscreen(false)}>
          <iframe src={blob} title={title} className="h-full w-full bg-white" sandbox="allow-scripts allow-downloads allow-popups allow-presentation" allow="autoplay" />
        </FullscreenViewer>
      )}
    </>
  );
}

// ── Full-window viewer ──────────────────────────────────────────────────────
// Not a dialog: the artifact takes the whole window, with a title bar on top.
// Escape closes it and focus goes back where it was.
function FullscreenViewer({ title, subtitle = '', onClose, children }) {
  // Read while rendering, before the viewer takes focus, so the button that
  // opened it gets focus back on close.
  const [opener] = useState(() => document.activeElement);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Focus lands on Close, so Escape and Enter work straight away.
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.({ preventScroll: true });
    };
    // Once per opening: a new onClose from a parent re-render is read from the ref.
  }, [opener]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title || 'Artifact'} className="fixed inset-0 z-[200] flex flex-col bg-canvas animate-[fadeIn_120ms_ease-out]">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-fg">{title}</p>
          {subtitle ? <p className="truncate font-mono text-[11px] text-fg-subtle">{subtitle}</p> : null}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
          title="Close full screen"
          aria-label="Close full screen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ── Video player ─────────────────────────────────────────────────────────────
function VideoPreview({ filename, root = null, fullHeight = false }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    agentApi.downloadArtifact(filename, root)
      .then(({ blob }) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(err => setError(err.message));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [filename, root]);

  if (error) return <p className="py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>;
  if (!src) return (
    <div className="py-4 flex items-center justify-center text-[12px] text-fg-subtle">Loading video…</div>
  );
  return (
    <div className={`rounded-lg overflow-hidden bg-black ${fullHeight ? 'h-full flex items-center justify-center' : ''}`}>
      <video controls src={src} className={`w-full block ${fullHeight ? 'max-h-full' : 'max-h-64'}`} />
    </div>
  );
}

// ── Audio player ─────────────────────────────────────────────────────────────
function AudioPreview({ filename, root = null }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    agentApi.downloadArtifact(filename, root)
      .then(({ blob }) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(err => setError(err.message));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [filename, root]);

  if (error) return <p className="py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>;
  if (!src) return (
    <div className="py-3 flex items-center justify-center text-[12px] text-fg-subtle">Loading audio…</div>
  );
  return (
    <div className="py-2 px-1">
      <audio controls src={src} className="w-full" />
    </div>
  );
}

// ── Image preview ─────────────────────────────────────────────────────────────
function ImagePreview({ filename, root = null, fullHeight = false }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    agentApi.downloadArtifact(filename, root)
      .then(({ blob }) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(err => setError(err.message));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [filename, root]);

  if (error) return <p className="py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>;
  if (!src) return (
    <div className="py-4 flex items-center justify-center text-[12px] text-fg-subtle">Loading image…</div>
  );
  return (
    <div className={`rounded-lg overflow-hidden bg-hover flex items-center justify-center ${fullHeight ? 'h-full' : ''}`}>
      <img src={src} alt={filename} className={`object-contain ${fullHeight ? 'max-h-full max-w-full' : 'max-h-64 w-full'}`} />
    </div>
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
          <div className="h-full overflow-auto px-8 py-7">
            <div className="mx-auto max-w-3xl">
              <MarkdownPreview content={content} />
            </div>
          </div>
        );
      case 'html':
      case 'design':
      case 'animation':
      case 'mermaid':
        return <HtmlPreview content={content} title={title} fullHeight allowFullscreen={false} />;
      case 'image':
        return (
          <div className="flex h-full items-center justify-center bg-hover">
            <ImagePreview filename={artifact.filename} root={artifact.root} fullHeight />
          </div>
        );
      case 'video':
        return (
          <div className="flex h-full items-center justify-center bg-black">
            <VideoPreview filename={artifact.filename} root={artifact.root} fullHeight />
          </div>
        );
      case 'audio':
        return (
          <div className="flex h-full items-center justify-center p-8">
            <div className="w-full max-w-lg">
              <p className="mb-4 text-center text-[13px] font-medium text-fg">{title}</p>
              <AudioPreview filename={artifact.filename} root={artifact.root} />
            </div>
          </div>
        );
      case 'csv':
        return (
          <div className="h-full overflow-auto p-6">
            <CsvPreview content={content} maxRows={500} />
          </div>
        );
      case 'svg':
        return (
          <div className="flex h-full items-center justify-center overflow-auto p-6">
            <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(content) }} className="max-h-full max-w-full" />
          </div>
        );
      case 'json':
      case 'code':
      default:
        return <div className="h-full p-4"><CodePreview content={content} fullHeight /></div>;
    }
  };

  return (
    <FullscreenViewer title={title} subtitle={artifact.path || artifact.filename || type} onClose={onClose}>
      {renderFullscreenContent()}
    </FullscreenViewer>
  );
}

// ── Note panel — always the full rich editor, embedded in the side panel ─────
// The editor is large; load it only when a note artifact is opened.
const ModernNoteEditor = lazy(() => import('../../../notes/modern/ModernNoteEditor'));

function NotePanel({ html, noteId, title, fullHeight }) {
  return (
    <div className={`flex flex-col ${fullHeight ? 'h-full' : 'h-[640px]'} -mx-3 -my-2.5`}>
      <NoteProvider>
        <Suspense fallback={<div className="flex-1" />}>
          <ModernNoteEditor
            note={{ id: noteId, title: title || 'Untitled note', content: html || '' }}
            onBack={() => {}}
          />
        </Suspense>
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
  const isBinaryType = type === 'audio' || type === 'video' || type === 'image';
  const meta = getTypeMeta(type);
  const Icon = meta.icon;
  const title = artifactData.title || artifactData.filename || 'Untitled';
  const size = formatSize(artifactData.size || artifactData.sizeBytes);
  const filename = artifactData.filename || '';
  const root = artifactData.root || null;
  const artifactPath = artifactData.path || '';
  const downloadOnly = type === 'zip' || type === 'pdf';
  const canFullscreen = !downloadOnly;

  const loadContent = async () => {
    if (downloadOnly || isBinaryType) return null;
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
        const data = await agentApi.getArtifact(filename, root);
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
    if (expanded && !isBinaryType) loadContent();
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
    if (!expanded && !isBinaryType) loadContent();
    setExpanded(v => !v);
  };

  const handleDownload = async (e) => {
    e?.stopPropagation?.();
    if (downloading) return;
    try {
      setDownloading(true);
      if (filename) {
        const { blob } = await agentApi.downloadArtifact(filename, root);
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
    if (isBinaryType) { setFullscreenOpen(true); return; }
    const loadedContent = content || await loadContent();
    if (loadedContent != null || type === 'note') setFullscreenOpen(true);
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="py-4 flex items-center justify-center gap-2 text-[12px] text-fg-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading preview…
        </div>
      );
    }
    if (downloadOnly) {
      return (
        <div className="px-1 py-1 text-[13px] text-fg-muted">
          <p className="mb-2">
            {type === 'zip' ? 'This bundle is a download.' : 'This PDF is a download.'}
          </p>
          <Button variant="secondary" size="xs" icon={Download} loading={downloading} onClick={handleDownload}>
            {downloading ? 'Downloading…' : 'Download'}
          </Button>
        </div>
      );
    }
    if (type === 'image') return <ImagePreview filename={filename} root={root} fullHeight={fullHeight} />;
    if (type === 'video') return <VideoPreview filename={filename} root={root} fullHeight={fullHeight} />;
    if (type === 'audio') return <AudioPreview filename={filename} root={root} />;
    if (!content) {
      return (
        <div className="py-3 text-center">
          {fetchError && (
            <p className="mb-2 text-[12px] text-red-600 dark:text-red-400">
              {fetchError}
            </p>
          )}
          <Button variant="secondary" size="xs" onClick={loadContent}>
            Load preview
          </Button>
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
          <div className={`flex items-center justify-center rounded-lg p-3 ${fullHeight ? 'h-full min-h-[320px]' : ''}`}>
            <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(content) }} className={`max-w-full ${fullHeight ? 'max-h-full' : 'max-h-52'}`} />
          </div>
        );
      default:
        return <CodePreview content={content} fullHeight={fullHeight} />;
    }
  };

  return (
    // A container, so a narrow card (a phone, a side panel) gives the title the
    // room and drops the type label and button words first.
    <div className={`@container overflow-hidden rounded-xl border border-line bg-surface ${fullHeight ? 'flex flex-col h-full' : ''}`}>
      {/* Header — interactive only when inline toggle is active */}
      <div
        {...((!onOpen && !fullHeight) ? {
          role: 'button',
          tabIndex: 0,
          onClick: handleToggle,
          onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && handleToggle(),
          'aria-expanded': expanded,
          className: 'flex w-full items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer select-none outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40',
        } : {
          className: 'flex w-full items-center gap-2.5 px-3 py-2.5',
        })}
      >
        <Icon className="h-4 w-4 flex-shrink-0 text-fg-subtle" strokeWidth={1.75} />

        {/* Title and meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-medium text-fg truncate">
              {title}
            </span>
            <span className="hidden flex-shrink-0 text-[12px] text-fg-subtle @sm:inline">
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-fg-subtle font-mono">
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
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg disabled:opacity-50"
              title={downloading ? 'Downloading…' : `Download ${filename}`}
              aria-label={`Download ${filename}`}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </button>
          )}
          {canFullscreen && (
            <button
              type="button"
              onClick={handleFullscreen}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg disabled:opacity-50"
              title="Open full screen"
              aria-label="Open full screen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpen ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              className="inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg @xs:px-2"
              title="Open in side panel"
              aria-label="Open in side panel"
            >
              <span className="hidden @xs:inline">Open</span><PanelRight className="h-3.5 w-3.5" />
            </button>
          ) : !fullHeight && (
            <span className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-fg-muted @xs:px-2">
              <span className="hidden @xs:inline">{expanded ? 'Hide' : 'View'}</span>
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>
      </div>

      {/* Description (always visible if present) */}
      {artifactData.description && !expanded && (
        <p className="px-3 pb-2.5 -mt-1 text-[12px] text-fg-muted pl-[2.375rem]">
          {artifactData.description}
        </p>
      )}

      {/* TOC navigation — only in full-height (side panel) mode with headings */}
      {expanded && !onOpen && fullHeight && tocItems.length > 0 && (
        <div className="shrink-0 overflow-x-auto border-t border-line px-3 py-1.5">
          <div className="flex items-center gap-x-1 min-w-max">
            {tocItems.map((item, i) => (
              <button
                key={`${item.id}-${i}`}
                type="button"
                onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] transition-colors hover:bg-hover hover:text-fg ${
                  item.level === 1
                    ? 'font-medium text-fg'
                    : item.level === 2
                    ? 'font-medium text-fg-muted pl-3'
                    : 'text-fg-subtle pl-5'
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
        <div className={`border-t border-line px-3 py-2.5 overflow-y-auto ${fullHeight ? 'flex-1 min-h-0' : 'max-h-80'}`}>
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
