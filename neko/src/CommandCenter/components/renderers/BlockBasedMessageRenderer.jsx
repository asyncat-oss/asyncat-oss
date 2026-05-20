// BlockBasedMessageRenderer.jsx - Shared markdown/block renderer for agent answers
import { useMemo, useState, useCallback, memo, useEffect, useRef } from 'react';
import { Copy, Check, RotateCcw, Zap, ExternalLink, Globe2, FolderOpen } from 'lucide-react';
import { fileIconMeta } from '../../../files/fileUtils.js';
import { tokenTracker } from '../stats/LocalModelStats';

import katex from 'katex';
import 'katex/dist/katex.min.css';
// mhchem extension — enables \ce{H2O}, \ce{CO2}, chemical equations in KaTeX
import 'katex/contrib/mhchem/mhchem.js';
import mermaid from 'mermaid';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml'; // html
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import markdown from 'highlight.js/lib/languages/markdown';
import 'highlight.js/styles/github.css';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

// ─── KaTeX Math Renderer ────────────────────────────────────────────────────

/**
 * Render a LaTeX string to HTML using KaTeX.
 * For display mode: renders as a block with a copy button.
 * For inline mode: renders inline with a hover copy button.
 */
const MathSpan = ({ latex, displayMode = false }) => {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        errorColor: '#cc0000',
        trust: false,
        strict: 'warn'
      });
    } catch {
      return `<span style="color:#cc0000">${latex}</span>`;
    }
  }, [latex, displayMode]);

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [latex]);

  if (displayMode) {
    return (
      <span className="block my-4 overflow-x-auto text-center relative group/math">
        <span dangerouslySetInnerHTML={{ __html: html }} />
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 opacity-0 group-hover/math:opacity-100 transition-opacity px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 midnight:text-slate-500 midnight:hover:text-slate-300 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 rounded"
          title="Copy LaTeX"
        >
          {copied ? '✓' : 'copy'}
        </button>
      </span>
    );
  }

  return (
    <span className="inline relative group/imath">
      <span dangerouslySetInnerHTML={{ __html: html }} />
      <button
        onClick={handleCopy}
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover/imath:opacity-100 transition-opacity px-1.5 py-0.5 text-[10px] text-gray-600 bg-white shadow-md border border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 midnight:text-slate-300 midnight:bg-slate-800 midnight:border-slate-700 rounded z-10 pointer-events-none group-hover/imath:pointer-events-auto whitespace-nowrap"
        title="Copy LaTeX"
      >
        {copied ? '✓ Copied' : 'Copy LaTeX'}
      </button>
    </span>
  );
};

/**
 * Split text into segments: plain text, inline math ($...$), block math ($$...$$).
 * Returns an array of { type: 'text'|'math-inline'|'math-block', value: string }
 */
const splitMath = (text) => {
  if (!text || typeof text !== 'string') return [{ type: 'text', value: text || '' }];

  const segments = [];
  // Match $$...$$ first (block), then $...$ (inline)
  // Also handle \(...\) inline and \[...\] block
  const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([^)]+?\\\))/g;

  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith('$$') || raw.startsWith('\\[')) {
      const inner = raw.startsWith('$$')
        ? raw.slice(2, -2)
        : raw.slice(2, -2); // \[...\]
      segments.push({ type: 'math-block', value: inner.trim() });
    } else {
      const inner = raw.startsWith('$')
        ? raw.slice(1, -1)
        : raw.slice(2, -2); // \(...\)
      segments.push({ type: 'math-inline', value: inner.trim() });
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
};

// ─── Safe inline link component ─────────────────────────────────────────────

const InlineLinkModal = ({ href, onClose }) => {
  const getDomain = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } };
  const domain = getDomain(href);
  const handleOpen = () => { window.open(href, '_blank', 'noopener,noreferrer'); onClose(); };
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 midnight:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-amber-600 dark:text-amber-400 text-sm">⚠</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white midnight:text-slate-100 text-sm">External link</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors text-lg leading-none">×</button>
        </div>
        <div className="mx-5 mb-4 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700">
          <div className="flex items-center gap-2 min-w-0">
            <img src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" className="w-4 h-4 rounded flex-shrink-0 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
            <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 truncate font-mono select-all">{href}</span>
          </div>
        </div>
        <p className="px-5 pb-4 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 leading-relaxed">
          This link was generated by AI and <span className="font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">may not be accurate</span>. Verify the URL before proceeding.
        </p>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 transition-colors">Cancel</button>
          <button onClick={handleOpen} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5">Open ↗</button>
        </div>
      </div>
    </div>
  );
};

const InlineLink = ({ href, label, variant = 'inline' }) => {
  const [open, setOpen] = useState(false);

  if (variant === 'chip') {
    const domain = getUrlDomain(href);
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 midnight:border-slate-700 midnight:bg-slate-800"
          title={href}
        >
          <img
            src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
            alt=""
            className="h-3.5 w-3.5 flex-shrink-0 rounded object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span className="truncate">{label || domain}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50" />
        </button>
        {open && <InlineLinkModal href={href} label={label} onClose={() => setOpen(false)} />}
      </>
    );
  }

  const domain = getUrlDomain(href);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-[1px] rounded border border-blue-200/60 bg-blue-50/50 text-blue-700 hover:bg-blue-100/70 hover:border-blue-300 dark:border-blue-800/40 dark:bg-blue-900/10 dark:text-blue-300 dark:hover:bg-blue-900/30 midnight:border-blue-800/40 midnight:bg-blue-900/10 midnight:text-blue-300 midnight:hover:bg-blue-900/30 transition-colors cursor-pointer font-medium text-[0.95em]"
      >
        <img
          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
          alt=""
          className="h-3.5 w-3.5 flex-shrink-0 rounded-sm object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <span className="truncate">{label}</span>
        <ExternalLink className="w-3 h-3 opacity-60" />
      </button>
      {open && <InlineLinkModal href={href} label={label} onClose={() => setOpen(false)} />}
    </>
  );
};

const getUrlDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Heuristic: does this string look like a file path?
 * Used for backtick-wrapped content — more permissive than the bare-text regex.
 * macOS paths commonly contain spaces (e.g. "Application Support") so we allow them.
 */
function looksLikeAnyFilePath(str) {
  if (!str || str.length < 4) return false;
  // Not a URL
  if (/^https?:\/\//i.test(str)) return false;
  // Must contain a forward slash
  if (!str.includes('/')) return false;
  // Must not contain shell-special or quoting chars
  if (/["'<>[\]{}|*?]/.test(str)) return false;
  // Normalise leading ./ ../ ~/
  const clean = str.replace(/^(?:\.{1,2}|~)\//, '/');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  const hasExt = /\.\w{1,12}$/.test(last);
  return hasExt || parts.length >= 3;
}

/** File-path chip — displays path inline in chat messages. */
const InlineFilePath = ({ rawPath }) => {
  const segments = rawPath.replace(/\/$/, '').split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] || rawPath;
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  const isDir = !ext || ext.length > 12 || rawPath.endsWith('/');
  const { Icon, color } = fileIconMeta(ext, isDir ? 'dir' : 'file');

  const displayPath = segments.length > 2
    ? `…/${segments.slice(-2).join('/')}`
    : (rawPath.replace(/\/$/, '') || rawPath);

  return (
    <span
      title={rawPath}
      className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded font-mono leading-normal align-middle text-[0.88em] max-w-[32ch] bg-gray-100 dark:bg-gray-800 midnight:bg-slate-700 text-[#5555a0] dark:text-indigo-300 midnight:text-indigo-300 select-all"
    >
      {isDir ? (
        <FolderOpen className={`w-3 h-3 flex-shrink-0 ${color}`} />
      ) : (
        <Icon className={`w-3 h-3 flex-shrink-0 ${color}`} />
      )}
      <span className="truncate">{displayPath}</span>
    </span>
  );
};

const cleanMarkdownLabel = (value = '') => value
  .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^[-•\d.\s]+/, '')
  .replace(/\s+/g, ' ')
  .trim();

const isLikelyImageUrl = (url = '') => /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(url);

const parseWebLinkItem = (text = '') => {
  const markdownLink = text.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  const rawUrl = markdownLink?.[2] || text.match(/https?:\/\/[^\s<>"')\]]+/)?.[0];
  if (!rawUrl) return null;

  const beforeUrl = text.slice(0, text.indexOf(rawUrl));
  const afterUrl = text.slice(text.indexOf(rawUrl) + rawUrl.length);
  const beforeParts = beforeUrl.split(/\s+[—-]\s+/).map(part => part.trim()).filter(Boolean);
  const titleSource = markdownLink?.[1] || beforeParts[0] || beforeUrl;
  const descriptionSource = afterUrl.replace(/^[\s—-]+/, '') || beforeParts.slice(1).join(' — ');
  const title = cleanMarkdownLabel(titleSource) || getUrlDomain(rawUrl);
  const description = cleanMarkdownLabel(descriptionSource);

  return {
    title,
    description: description && description !== title ? description : '',
    url: rawUrl,
    domain: getUrlDomain(rawUrl),
    isImage: isLikelyImageUrl(rawUrl),
  };
};

const WebsiteCard = ({ item, number }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-w-0 items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 midnight:border-slate-700 midnight:bg-slate-900 midnight:hover:bg-slate-800"
        title={item.url}
      >
        {item.isImage ? (
          <img
            src={item.url}
            alt=""
            loading="lazy"
            className="h-14 w-16 flex-shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-700"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-800">
            <img
              src={`https://icons.duckduckgo.com/ip3/${item.domain}.ico`}
              alt=""
              className="h-5 w-5 rounded object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <Globe2 className="hidden h-4 w-4 text-gray-400 midnight:text-slate-500" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {number && <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">{number}</span>}
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{item.title}</span>
          </span>
          {item.description && (
            <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{item.description}</span>
          )}
          <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300">
            <span className="truncate">{item.domain}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-55 transition-opacity group-hover:opacity-100" />
          </span>
        </span>
      </button>
      {open && <InlineLinkModal href={item.url} onClose={() => setOpen(false)} />}
    </>
  );
};

const InlineImage = ({ src, alt }) => {
  const [open, setOpen] = useState(false);
  const label = alt || 'Image';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-1 inline-flex align-middle overflow-hidden rounded-md border border-gray-200 bg-gray-50 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-800"
        title={label}
      >
        <img
          src={src}
          alt={label}
          loading="lazy"
          className="h-16 w-20 object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </button>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 midnight:border-slate-700">
              <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100 midnight:text-slate-100">{label}</span>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
                  className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800"
                  aria-label="Close image preview"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="max-h-[calc(90vh-3.5rem)] overflow-auto bg-gray-950/95 p-3">
              <img src={src} alt={label} className="mx-auto max-h-[78vh] max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Annotated term chip (clickable, opens explain panel) ───────────────────

const AnnotatedTerm = ({ term, definition, onTermClick }) => (
  <button
    type="button"
    onClick={() => onTermClick && onTermClick(term, definition)}
    className="inline-flex items-baseline gap-0.5 mx-0.5 px-1.5 py-0.5 rounded-md text-indigo-700 dark:text-indigo-300 midnight:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 midnight:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 midnight:hover:bg-indigo-900/50 transition-colors cursor-pointer leading-normal font-medium text-[0.92em]"
    title="Click to learn more"
  >
    {term}
    <span className="text-[0.65em] text-indigo-400 dark:text-indigo-500 midnight:text-indigo-500 leading-none select-none">●</span>
  </button>
);

// ─── Inline Markdown Parser (with math + link + term annotation support) ─────

const parseInlineMarkdown = (text, onTermClick, options = {}) => {
  if (!text) return [];

  // First split by math expressions
  const mathSegments = splitMath(text);

  const result = [];
  let key = 0;

  mathSegments.forEach((seg) => {
    if (seg.type === 'math-inline') {
      result.push(<MathSpan key={`mi-${key++}`} latex={seg.value} displayMode={false} />);
      return;
    }
    if (seg.type === 'math-block') {
      result.push(<MathSpan key={`mb-${key++}`} latex={seg.value} displayMode={true} />);
      return;
    }

    // Plain text segment — scan for all inline patterns in one pass
    const t = seg.value;
    // Combined regex — term annotations first (before [label](url) to avoid conflict),
    // then markdown images, markdown links, bare URLs, bold, italic, code, citations,
    // and bare absolute file paths (3+ segments, e.g. /Users/foo/bar.js).
    // Groups: 1=annot-term, 2=annot-def, 3=img-alt, 4=img-url,
    //         5=md-label, 6=md-url, 7=bare-url, 8=bold, 9=italic,
    //         10=code, 11=citation, 12=abs-file-path
    const inlineRegex = /\[\[([^\]|]+)\|([^\]]+)\]\]|!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|((?:https?:\/\/|data:image\/)[^\s<>"')\]]+)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\*?\(from ([^)]+)\)\*?|(\/[\w.\-~@]+(?:\/[\w.\-~@]+){2,})/g;

    let last = 0;
    let m;
    const parts = [];

    while ((m = inlineRegex.exec(t)) !== null) {
      // Push plain text before this match
      if (m.index > last) {
        parts.push(t.slice(last, m.index));
      }

      if (m[1] !== undefined) {
        // [[term|explanation]] — annotated term chip
        parts.push(
          <AnnotatedTerm
            key={`ann-${key++}`}
            term={m[1].trim()}
            definition={m[2].trim()}
            onTermClick={onTermClick}
          />
        );
      } else if (m[3] !== undefined && m[4] !== undefined) {
        // ![alt](url) — inline image preview
        parts.push(<InlineImage key={`img-${key++}`} src={m[4]} alt={m[3]} />);
      } else if (m[5] !== undefined && m[6] !== undefined) {
        // [label](url) — markdown link
        parts.push(<InlineLink key={`lnk-${key++}`} href={m[6]} label={m[5]} variant={options.linkVariant} />);
      } else if (m[7] !== undefined) {
        // bare https://... URL
        if (isLikelyImageUrl(m[7]) || String(m[7]).startsWith('data:image/')) {
          parts.push(<InlineImage key={`imgurl-${key++}`} src={m[7]} alt="Image" />);
        } else {
          parts.push(<InlineLink key={`url-${key++}`} href={m[7]} label={m[7]} variant={options.linkVariant} />);
        }
      } else if (m[8] !== undefined) {
        // **bold**
        parts.push(<strong key={`b-${key++}`} className="font-bold">{m[8]}</strong>);
      } else if (m[9] !== undefined) {
        // *italic*
        parts.push(<em key={`i-${key++}`} className="italic">{m[9]}</em>);
      } else if (m[10] !== undefined) {
        // `code` — if it looks like a file path, render as clickable chip; else plain code
        if (looksLikeAnyFilePath(m[10])) {
          parts.push(<InlineFilePath key={`fp-${key++}`} rawPath={m[10]} />);
        } else {
          parts.push(
            <code key={`c-${key++}`} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-700 rounded text-sm font-mono">
              {m[10]}
            </code>
          );
        }
      } else if (m[11] !== undefined) {
        // (from Source)
        parts.push(
          <span key={`cite-${key++}`} className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 italic ml-1">
            (from {m[11]})
          </span>
        );
      } else if (m[12] !== undefined) {
        // bare absolute file path: /Users/foo/bar/baz.ext
        parts.push(<InlineFilePath key={`absfp-${key++}`} rawPath={m[12]} />);
      }

      last = m.index + m[0].length;
    }

    // Remaining plain text
    if (last < t.length) {
      parts.push(t.slice(last));
    }

    result.push(...(parts.length > 0 ? parts : [seg.value]));
  });

  return result.length > 0 ? result : [text];
};

export function headingId(text) {
  return (text || '').replace(/[*_`[\]()#]/g, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export const BlockRenderer = ({ block, onTermClick }) => {
  const baseStyles = "leading-relaxed text-gray-900 dark:text-gray-100 midnight:text-slate-100";

  const renderContent = (content, options) => {
    const parsed = parseInlineMarkdown(content, onTermClick, options);
    return <span>{parsed}</span>;
  };

  switch (block.type) {
    case 'heading1':
      return (
        <h1 id={headingId(block.content)} className={`text-3xl font-bold mb-5 mt-8 first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h1>
      );

    case 'heading2':
      return (
        <h2 id={headingId(block.content)} className={`text-2xl font-bold mb-4 mt-6 first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h2>
      );

    case 'heading3':
      return (
        <h3 id={headingId(block.content)} className={`text-xl font-bold mb-3 mt-5 first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h3>
      );

    case 'bulletList':
      {
        const items = block.content.split('\n').filter(line => line.trim());
        const linkItems = items.map(parseWebLinkItem);
        const shouldRenderCards = linkItems.filter(Boolean).length >= Math.max(2, Math.ceil(items.length * 0.6));

        if (shouldRenderCards) {
          return (
            <div className="mb-6 grid gap-2 sm:grid-cols-2">
              {items.map((item, i) => {
                const linkItem = linkItems[i];
                if (linkItem) return <WebsiteCard key={`${linkItem.url}-${i}`} item={linkItem} />;

                return (
                  <div key={i} className={`rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900 ${baseStyles}`}>
                    {renderContent(item)}
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <ul className="mb-5 space-y-2.5 ml-2">
            {items.map((item, i) => {
            // Block parser already stripped the bullet prefix before storing content.
            // Only strip real bullet chars (•, -) here — never *, which could be italic markdown.
            const text = item.replace(/^[•\-]\s+/, '');
            const hasSubContent = text.includes('→') || text.match(/^\s+[-•]/);

            return (
              <li key={i} className={`${baseStyles} pl-2 relative flex gap-3`}>
                <span className="text-gray-600 dark:text-gray-400 midnight:text-slate-400 font-bold min-w-[0.5rem] mt-[0.15rem]">
                  •
                </span>
                <span className={`flex-1 ${hasSubContent ? 'space-y-1.5' : ''}`}>
                  {renderContent(text)}
                </span>
              </li>
            );
          })}
          </ul>
        );
      }

    case 'numberedList':
      {
        const allLines = block.content.split('\n').filter(line => line.trim());
        const structuredItems = [];
        let currentItem = null;

        allLines.forEach(line => {
          const mainMatch = line.match(/^(\d+)\.\s+(.+)/);
          const subMatch = line.match(/^[→\-]\s+(.+)/);

          if (mainMatch) {
            if (currentItem) structuredItems.push(currentItem);
            currentItem = {
              number: mainMatch[1],
              text: mainMatch[2],
              subItems: []
            };
          } else if (subMatch && currentItem) {
            currentItem.subItems.push(subMatch[1]);
          }
        });
        if (currentItem) structuredItems.push(currentItem);

        const linkItems = structuredItems.map(item => parseWebLinkItem(item.text));
        const shouldRenderCards = linkItems.filter(Boolean).length >= Math.max(2, Math.ceil(structuredItems.length * 0.6));

        if (shouldRenderCards) {
          return (
            <div className="mb-6 grid gap-2 sm:grid-cols-2">
              {structuredItems.map((item, i) => {
                const linkItem = linkItems[i];
                if (linkItem) {
                  const withSubtext = item.subItems.length > 0 && !linkItem.description
                    ? { ...linkItem, description: cleanMarkdownLabel(item.subItems.join(' ')) }
                    : linkItem;
                  return <WebsiteCard key={`${withSubtext.url}-${i}`} item={withSubtext} number={`${item.number}.`} />;
                }

                return (
                  <div key={i} className={`rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900 ${baseStyles}`}>
                    {item.number}. {renderContent(item.text)}
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <ol className="mb-6 space-y-3.5 ml-1">
            {structuredItems.map((item, i) => (
              <li key={i} className="relative flex gap-3" style={{ listStyle: 'none' }}>
                <span className="font-bold text-gray-700 dark:text-gray-300 midnight:text-slate-300 min-w-[1.75rem] text-base mt-0.5">
                  {item.number}.
                </span>
                <div className="flex-1 space-y-1.5">
                  <div className={baseStyles}>
                    {renderContent(item.text)}
                  </div>
                  {item.subItems.length > 0 && (
                    <div className="pl-6 space-y-1 text-sm">
                      {item.subItems.map((sub, j) => (
                        <div key={j} className="flex gap-2 items-start">
                          <span className="text-gray-500 dark:text-gray-500 midnight:text-slate-500 font-normal mt-0.5 text-xs">→</span>
                          <span className="flex-1 text-gray-600 dark:text-gray-400 midnight:text-slate-400 leading-relaxed">
                            {renderContent(sub)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        );
      }

    case 'todo':
      return (
        <div className="mb-3">
          <label className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-700/50 p-2 rounded-lg transition-colors">
            <input
              type="checkbox"
              checked={block.properties?.completed || false}
              readOnly
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className={`${baseStyles} ${block.properties?.completed ? 'line-through opacity-60' : ''}`}>
              {renderContent(block.content)}
            </span>
          </label>
        </div>
      );

    case 'quote':
      return (
        <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 midnight:border-slate-600 pl-4 py-2 mb-6 italic">
          <div className={`${baseStyles} opacity-80`}>
            {renderContent(block.content)}
          </div>
        </blockquote>
      );

    case 'code':
      // Mermaid diagrams — render as interactive SVG
      if (block.properties?.language?.toLowerCase() === 'mermaid') {
        return <MermaidBlock content={block.content} />;
      }
      // Diff blocks — render with colored +/- lines
      if (block.properties?.language?.toLowerCase() === 'diff') {
        return <DiffBlock content={block.content} />;
      }
      // Chart blocks — render as interactive Recharts
      if (block.properties?.language?.toLowerCase() === 'chart') {
        return <ChartBlock content={block.content} />;
      }
      // HTML blocks — render as live sandboxed preview
      if (block.properties?.language?.toLowerCase() === 'html') {
        return <HtmlPreviewBlock content={block.content} />;
      }
      return (
        <CodeBlock content={block.content} language={block.properties?.language} />
      );

    case 'math':
      // Standalone display-mode math block with copy-as-LaTeX button
      return <MathBlock latex={block.content} />;

    case 'table':
      const tableData = block.properties?.tableData || [];
      if (tableData.length === 0) return null;
      const columnCount = Math.max(...tableData.map(row => row.length), 1);
      const normalizedRows = tableData.map(row =>
        Array.from({ length: columnCount }, (_, index) => row[index] ?? '')
      );

      return (
        <div className="mb-6 max-w-full overflow-hidden rounded-xl border border-gray-200/80 dark:border-gray-700/60 midnight:border-slate-700/60">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50/80 dark:bg-gray-800/60 midnight:bg-slate-800/60">
                  {normalizedRows[0]?.map((header, i) => (
                    <th key={i} className={`px-4 py-2.5 text-left align-top text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 midnight:text-slate-400 [overflow-wrap:anywhere] whitespace-nowrap ${baseStyles}`}>
                      {renderContent(header, { linkVariant: 'chip' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
                {normalizedRows.slice(1).map((row, i) => (
                  <tr key={i} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/30 midnight:hover:bg-slate-800/40">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-4 py-2.5 align-top [overflow-wrap:anywhere] ${baseStyles}`}>
                        {renderContent(cell, { linkVariant: 'chip' })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'divider':
      return <hr className="my-8 border-t-2 border-gray-200 dark:border-gray-700 midnight:border-slate-600" />;

    case 'callout':
      return (
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <span className="mt-0.5 text-sm">ℹ️</span>
            <div className={`${baseStyles} text-sm leading-relaxed`}>
              {renderContent(block.content)}
            </div>
          </div>
        </div>
      );

    case 'details':
      return (
        <CollapsibleBlock
          summary={block.properties?.summary || 'Details'}
          content={block.content}
          onTermClick={onTermClick}
        />
      );

    case 'text':
    default:
      if (!block.content || !block.content.trim()) return null;
      return (
        <p className={`mb-6 leading-7 ${baseStyles}`}>
          {renderContent(block.content)}
        </p>
      );
  }
};

// ─── Math block with copy-as-LaTeX button ───────────────────────────────────
const MathBlock = ({ latex }) => {
  const [copyStatus, setCopyStatus] = useState(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latex);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 overflow-hidden shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 midnight:text-slate-400 uppercase tracking-wide">
          LaTeX
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-slate-600 rounded transition-colors"
          title="Copy LaTeX source"
        >
          {copyStatus === 'copied' ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
              <span className="text-green-600 dark:text-green-500">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy LaTeX
            </>
          )}
        </button>
      </div>
      {/* Rendered math */}
      <div className="py-5 px-6 bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900 overflow-x-auto text-center">
        <MathSpan latex={latex} displayMode={true} />
      </div>
    </div>
  );
};

// ─── Code block with syntax highlighting ────────────────────────────────────
const CodeBlock = ({ content, language = 'text' }) => {
  const [copyStatus, setCopyStatus] = useState(null);

  // Inject explicit hljs palettes once
  useEffect(() => {
    if (document.getElementById('hljs-palette')) return;
    const style = document.createElement('style');
    style.id = 'hljs-palette';
    style.textContent = `
      .hljs { background: transparent !important; }
      /* ── Light mode (GitHub-ish) ── */
      .hljs { color: #24292e; }
      .hljs-keyword { color: #cf222e; }
      .hljs-string { color: #0a3069; }
      .hljs-number { color: #0550ae; }
      .hljs-function .hljs-title,
      .hljs-title.function_ { color: #8250df; }
      .hljs-comment { color: #6e7781; font-style: italic; }
      .hljs-class .hljs-title,
      .hljs-title.class_ { color: #953800; }
      .hljs-variable { color: #953800; }
      .hljs-operator { color: #cf222e; }
      .hljs-punctuation { color: #24292e; }
      .hljs-params { color: #24292e; }
      .hljs-built_in { color: #953800; }
      .hljs-meta { color: #0550ae; }
      .hljs-literal { color: #0550ae; }
      .hljs-attr { color: #0550ae; }
      .hljs-property { color: #0550ae; }
      .hljs-tag { color: #116329; }
      /* ── Dark / Midnight mode (GitHub Dark Dimmed-ish) ── */
      .dark .hljs, .midnight .hljs { color: #c9d1d9; }
      .dark .hljs-keyword, .midnight .hljs-keyword { color: #ff7b72; }
      .dark .hljs-string, .midnight .hljs-string { color: #a5d6ff; }
      .dark .hljs-number, .midnight .hljs-number { color: #79c0ff; }
      .dark .hljs-function .hljs-title, .midnight .hljs-function .hljs-title,
      .dark .hljs-title.function_, .midnight .hljs-title.function_ { color: #d2a8ff; }
      .dark .hljs-comment, .midnight .hljs-comment { color: #8b949e; font-style: italic; }
      .dark .hljs-class .hljs-title, .midnight .hljs-class .hljs-title,
      .dark .hljs-title.class_, .midnight .hljs-title.class_ { color: #ffa657; }
      .dark .hljs-variable, .midnight .hljs-variable { color: #ffa657; }
      .dark .hljs-operator, .midnight .hljs-operator { color: #ff7b72; }
      .dark .hljs-punctuation, .midnight .hljs-punctuation { color: #c9d1d9; }
      .dark .hljs-params, .midnight .hljs-params { color: #c9d1d9; }
      .dark .hljs-built_in, .midnight .hljs-built_in { color: #ffa657; }
      .dark .hljs-meta, .midnight .hljs-meta { color: #79c0ff; }
      .dark .hljs-literal, .midnight .hljs-literal { color: #79c0ff; }
      .dark .hljs-attr, .midnight .hljs-attr { color: #79c0ff; }
      .dark .hljs-property, .midnight .hljs-property { color: #79c0ff; }
      .dark .hljs-tag, .midnight .hljs-tag { color: #7ee787; }
    `;
    document.head.appendChild(style);
  }, []);

  const highlighted = useMemo(() => {
    const lang = (language || 'text').toLowerCase();
    try {
      if (hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang }).value;
      }
      return hljs.highlightAuto(content).value;
    } catch {
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }, [content, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const { Icon, color } = fileIconMeta(language, 'file');

  return (
    <div className="mb-6 rounded-xl bg-[#f6f8fa] dark:bg-[#0d1117] midnight:bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${color} opacity-70`} />
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 midnight:text-slate-500 select-none">
            {language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 midnight:text-slate-500 midnight:hover:text-slate-300 transition-colors select-none"
        >
          {copyStatus === 'copied' ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
              <span className="text-green-600 dark:text-green-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      <pre className="px-4 pb-4 overflow-x-auto">
        <code
          className="text-[13px] font-mono leading-relaxed hljs"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
};

// ─── Mermaid diagram block ──────────────────────────────────────────────────
let mermaidInitialized = false;

const MermaidBlock = ({ content }) => {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [showSource, setShowSource] = useState(false);
  const idRef = useRef(`mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (!content?.trim()) return;
    let cancelled = false;

    (async () => {
      try {
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
            securityLevel: 'loose',
            fontFamily: 'inherit',
          });
          mermaidInitialized = true;
        }
        const { svg: rendered } = await mermaid.render(idRef.current, content.trim());
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to render diagram');
          setShowSource(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [content]);

  if (error && showSource) {
    return <CodeBlock content={content} language="mermaid" />;
  }

  return (
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-800 midnight:border-slate-800">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 tracking-wide uppercase">
          Diagram
        </span>
        <button
          onClick={() => setShowSource(v => !v)}
        className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-slate-300 transition-colors"
        >
          {showSource ? 'Show diagram' : 'View source'}
        </button>
      </div>
      {showSource ? (
        <pre className="p-5 overflow-x-auto bg-gray-50 dark:bg-gray-950 midnight:bg-slate-950 text-[13px] font-mono leading-relaxed text-gray-700 dark:text-gray-300 midnight:text-slate-300">
          {content}
        </pre>
      ) : svg ? (
        <div
          ref={containerRef}
          className="p-4 bg-white dark:bg-gray-950 midnight:bg-slate-950 overflow-x-auto flex justify-center"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="p-8 flex items-center justify-center text-xs text-gray-400 midnight:text-slate-500">
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span className="ml-2">Rendering diagram…</span>
        </div>
      )}
    </div>
  );
};

// ─── Diff block with colored +/- lines ──────────────────────────────────────
const DiffBlock = ({ content }) => {
  const [copyStatus, setCopyStatus] = useState(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const lines = (content || '').split('\n');

  return (
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-800 midnight:border-slate-800">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 tracking-wide uppercase">Diff</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded transition-colors"
        >
          {copyStatus === 'copied' ? (
            <><Check className="w-3.5 h-3.5 text-green-600 dark:text-green-500" /><span className="text-green-600 dark:text-green-500">Copied!</span></>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> Copy</>
          )}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto bg-gray-50 dark:bg-gray-950 midnight:bg-slate-950 text-[13px] font-mono leading-relaxed">
        {lines.map((line, i) => {
          let className = 'text-gray-700 dark:text-gray-300 midnight:text-slate-300';
          let bgClass = '';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            className = 'text-emerald-700 dark:text-emerald-300 midnight:text-emerald-300';
            bgClass = 'bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/20';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            className = 'text-red-700 dark:text-red-300 midnight:text-red-300';
            bgClass = 'bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20';
          } else if (line.startsWith('@@')) {
            className = 'text-sky-600 dark:text-sky-300 midnight:text-sky-300 font-medium';
            bgClass = 'bg-sky-50/50 dark:bg-sky-900/10 midnight:bg-sky-900/10';
          } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
            className = 'text-gray-500 dark:text-gray-500 midnight:text-slate-500 italic';
          }
          return (
            <div key={i} className={`px-1 -mx-1 ${bgClass}`}>
              <span className={className}>{line || ' '}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
};

// ─── Interactive chart block (Recharts) ─────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#d946ef', '#0ea5e9'];

const ChartBlock = ({ content }) => {
  const [showData, setShowData] = useState(false);

  const config = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      if (!parsed?.data || !Array.isArray(parsed.data)) return null;
      return {
        type: parsed.type || 'bar',
        data: parsed.data,
        xKey: parsed.xKey || parsed.x || Object.keys(parsed.data[0] || {})[0] || 'name',
        yKeys: parsed.yKeys || parsed.y || Object.keys(parsed.data[0] || {}).filter(k => k !== (parsed.xKey || parsed.x || Object.keys(parsed.data[0] || {})[0])),
        title: parsed.title || '',
      };
    } catch {
      return null;
    }
  }, [content]);

  if (!config) {
    return <CodeBlock content={content} language="json" />;
  }

  const renderChart = () => {
    const { type, data, xKey, yKeys } = config;

    const commonProps = {
      data,
      margin: { top: 5, right: 20, left: 0, bottom: 5 },
    };

    const axes = (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            border: '1px solid #374151',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#f3f4f6',
          }}
        />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
      </>
    );

    if (type === 'line') {
      return (
        <LineChart {...commonProps}>
          {axes}
          {yKeys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      );
    }

    if (type === 'area') {
      return (
        <AreaChart {...commonProps}>
          {axes}
          {yKeys.map((key, i) => (
            <Area key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </AreaChart>
      );
    }

    if (type === 'pie') {
      const valueKey = yKeys[0] || 'value';
      return (
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={xKey}
            cx="50%" cy="50%"
            outerRadius={80}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={{ stroke: '#9ca3af' }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#f3f4f6',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
        </PieChart>
      );
    }

    // Default: bar chart
    return (
      <BarChart {...commonProps}>
        {axes}
        {yKeys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    );
  };

  return (
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-800 midnight:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide uppercase">
            {config.type === 'pie' ? 'Pie Chart' : config.type === 'line' ? 'Line Chart' : config.type === 'area' ? 'Area Chart' : 'Bar Chart'}
          </span>
          {config.title && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">— {config.title}</span>
          )}
        </div>
        <button
          onClick={() => setShowData(v => !v)}
          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {showData ? 'Show chart' : 'View data'}
        </button>
      </div>
      {showData ? (
        <pre className="p-4 overflow-x-auto bg-gray-50 dark:bg-gray-950 text-[12px] font-mono text-gray-600 dark:text-gray-400">
          {JSON.stringify(config.data, null, 2)}
        </pre>
      ) : (
        <div className="p-4 bg-white dark:bg-gray-950 midnight:bg-slate-950">
          <ResponsiveContainer width="100%" height={280}>
            {renderChart()}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ─── Collapsible details block ──────────────────────────────────────────────
const CollapsibleBlock = ({ summary, content, onTermClick }) => {
  const [open, setOpen] = useState(false);

  // Parse the inner content as blocks so formatting is preserved
  const innerBlocks = useMemo(() => {
    if (!content?.trim()) return [];
    // Lazy import: parseAIResponseToBlocks is defined below, but hoisted
    try { return parseAIResponseToBlocks(content); } catch { return []; }
  }, [content]);

  return (
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 midnight:text-slate-200">
          {summary}
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-white dark:bg-gray-950 midnight:bg-slate-950">
          <div className="space-y-1">
            {innerBlocks.map((block, i) => (
              <BlockRenderer key={`details-${i}`} block={block} onTermClick={onTermClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── HTML Preview block (sandboxed iframe) ──────────────────────────────────
const HtmlPreviewBlock = ({ content }) => {
  const [showCode, setShowCode] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null);

  const blobUrl = useMemo(() => {
    if (!content) return null;
    return URL.createObjectURL(new Blob([content], { type: 'text/html' }));
  }, [content]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  return (
    <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 midnight:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-800 midnight:border-slate-800">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide uppercase">
          HTML Preview
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {copyStatus === 'copied' ? (
              <><Check className="w-3 h-3 text-green-500" /> Copied</>
            ) : (
              <><Copy className="w-3 h-3" /> Copy</>
            )}
          </button>
          <button
            onClick={() => setShowCode(v => !v)}
            className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {showCode ? 'Show preview' : 'View code'}
          </button>
        </div>
      </div>
      {showCode ? (
        <CodeBlock content={content} language="html" />
      ) : (
        <div className="bg-white dark:bg-gray-950 midnight:bg-slate-950">
          <iframe
            src={blobUrl}
            title="HTML Preview"
            className="w-full h-64 border-0"
            sandbox="allow-scripts"
          />
        </div>
      )}
    </div>
  );
};

// Block types from the notes system
const BlockType = {
  TEXT: 'text',
  HEADING1: 'heading1',
  HEADING2: 'heading2',
  HEADING3: 'heading3',
  NUMBERED_LIST: 'numberedList',
  BULLET_LIST: 'bulletList',
  TODO: 'todo',
  QUOTE: 'quote',
  TABLE: 'table',
  CODE: 'code',
  MATH: 'math',
  CHART: 'chart',
  DETAILS: 'details',
  DIVIDER: 'divider',
  VIDEO: 'video',
  AUDIO: 'audio',
  CALLOUT: 'callout'
};

const normalizeMarkdownTableRow = (line) => {
  const rawCells = line.split('|').map(cell => cell.trim());
  if (rawCells[0] === '') rawCells.shift();
  if (rawCells[rawCells.length - 1] === '') rawCells.pop();
  return rawCells;
};

const isMarkdownTableSeparator = (row) =>
  row.length > 0 && row.every(cell => /^:?-{3,}:?$/.test(cell));

// Helper to create unique block IDs
const createId = () => `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Enhanced AI response parser
// eslint-disable-next-line react-refresh/only-export-components
export const parseAIResponseToBlocks = (content) => {
  if (!content || !content.trim()) {
    return [{ id: createId(), type: BlockType.TEXT, content: '', properties: {} }];
  }

  // Strip <clarify>...</clarify> blocks — these are handled by the UI widget, not shown as text
  const stripped = content.replace(/<clarify>[\s\S]*?<\/clarify>/g, '').trim();
  if (!stripped) {
    return [{ id: createId(), type: BlockType.TEXT, content: '', properties: {} }];
  }

  const blocks = [];
  const lines = stripped.split('\n');
  let currentBlock = null;
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeContent = [];
  let inTable = false;
  let tableRows = [];
  let inMathBlock = false;
  let mathContent = [];
  let inDetailsBlock = false;
  let detailsSummary = '';
  let detailsContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle display math blocks ($$...$$) spanning multiple lines
    if (trimmed === '$$' || trimmed.startsWith('$$') && !trimmed.endsWith('$$')) {
      if (!inMathBlock) {
        if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
        inMathBlock = true;
        // If content after $$ on same line
        const inline = trimmed.slice(2).trim();
        mathContent = inline ? [inline] : [];
      } else {
        blocks.push({
          id: createId(),
          type: BlockType.MATH,
          content: mathContent.join('\n'),
          properties: {}
        });
        inMathBlock = false;
        mathContent = [];
      }
      continue;
    }

    if (inMathBlock) {
      if (trimmed === '$$') {
        blocks.push({
          id: createId(),
          type: BlockType.MATH,
          content: mathContent.join('\n'),
          properties: {}
        });
        inMathBlock = false;
        mathContent = [];
      } else {
        mathContent.push(line);
      }
      continue;
    }

    // Handle single-line display math: $$...$$
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
      blocks.push({
        id: createId(),
        type: BlockType.MATH,
        content: trimmed.slice(2, -2).trim(),
        properties: {}
      });
      continue;
    }
    // Handle <details> blocks
    if (!inCodeBlock && !inMathBlock && /^<details\b/i.test(trimmed)) {
      if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
      inDetailsBlock = true;
      detailsContent = [];
      const summaryMatch = trimmed.match(/<summary>(.*?)<\/summary>/i);
      detailsSummary = summaryMatch ? summaryMatch[1].trim() : 'Details';
      continue;
    }
    if (inDetailsBlock && !inCodeBlock) {
      if (/^<summary>(.*?)<\/summary>/i.test(trimmed)) {
        const m = trimmed.match(/<summary>(.*?)<\/summary>/i);
        detailsSummary = m ? m[1].trim() : 'Details';
        continue;
      }
      if (/^<\/details>/i.test(trimmed)) {
        blocks.push({
          id: createId(),
          type: BlockType.DETAILS,
          content: detailsContent.join('\n').trim(),
          properties: { summary: detailsSummary }
        });
        inDetailsBlock = false;
        detailsSummary = '';
        detailsContent = [];
        continue;
      }
      detailsContent.push(line);
      continue;
    }

    // Handle code blocks FIRST
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        inCodeBlock = true;
        codeLanguage = trimmed.replace('```', '') || 'text';
        codeContent = [];
      } else {
        blocks.push({
          id: createId(),
          type: BlockType.CODE,
          content: codeContent.join('\n'),
          properties: {
            language: codeLanguage,
            showLineNumbers: codeContent.length > 10
          }
        });
        inCodeBlock = false;
        codeLanguage = '';
        codeContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Handle headers EARLY - before numbered lists that might match numbers in headings
    if (trimmed.startsWith('### ')) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({
        id: createId(),
        type: BlockType.HEADING3,
        content: trimmed.replace('### ', ''),
        properties: {}
      });
      currentBlock = null;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({
        id: createId(),
        type: BlockType.HEADING2,
        content: trimmed.replace('## ', ''),
        properties: {}
      });
      currentBlock = null;
      continue;
    }

    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({
        id: createId(),
        type: BlockType.HEADING1,
        content: trimmed.replace('# ', ''),
        properties: {}
      });
      currentBlock = null;
      continue;
    }

    // Handle tables
    if (trimmed.includes('|') && (trimmed.match(/\|/g) || []).length >= 2) {
      if (!inTable) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        inTable = true;
        tableRows = [];
      }
      tableRows.push(normalizeMarkdownTableRow(trimmed));
      continue;
    } else if (inTable) {
      if (tableRows.length >= 2) {
        const headers = tableRows[0];
        const dataRows = tableRows.slice(1).filter(row => !isMarkdownTableSeparator(row));

        if (dataRows.length > 0) {
          blocks.push({
            id: createId(),
            type: BlockType.TABLE,
            content: '',
            properties: {
              tableData: [headers, ...dataRows],
              hasHeader: true
            }
          });
        }
      }
      inTable = false;
      tableRows = [];
    }

    // Handle dividers
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({
        id: createId(),
        type: BlockType.DIVIDER,
        content: '',
        properties: { style: 'solid' }
      });
      currentBlock = null;
      continue;
    }

    // Handle quotes
    if (trimmed.startsWith('> ')) {
      if (currentBlock?.type !== BlockType.QUOTE) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          id: createId(),
          type: BlockType.QUOTE,
          content: trimmed.replace('> ', ''),
          properties: {}
        };
      } else {
        currentBlock.content += '\n' + trimmed.replace('> ', '');
      }
      continue;
    }

    // Handle TODO items - push immediately as standalone blocks
    if (trimmed.match(/^- \[[ x]\]/)) {
      if (currentBlock) blocks.push(currentBlock);
      const isChecked = trimmed.includes('[x]');
      const todoContent = trimmed.replace(/^- \[[ x]\]\s*/, '');
      blocks.push({
        id: createId(),
        type: BlockType.TODO,
        content: todoContent,
        properties: { checked: isChecked }
      });
      currentBlock = null;
      continue;
    }

    // Handle sub-items (arrows) within lists
    if (trimmed.match(/^[→\-]\s+/) && currentBlock?.type === BlockType.NUMBERED_LIST) {
      currentBlock.content += '\n' + trimmed;
      continue;
    }

    // Handle numbered lists
    if (trimmed.match(/^\d+\.\s+/)) {
      if (currentBlock?.type !== BlockType.NUMBERED_LIST) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          id: createId(),
          type: BlockType.NUMBERED_LIST,
          content: trimmed,
          properties: { items: [trimmed] }
        };
      } else {
        currentBlock.content += '\n' + trimmed;
        currentBlock.properties.items = currentBlock.properties.items || [];
        currentBlock.properties.items.push(trimmed);
      }
      continue;
    }

    // Handle bullet lists
    if (trimmed.match(/^[-•*]\s+/)) {
      if (currentBlock?.type !== BlockType.BULLET_LIST) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          id: createId(),
          type: BlockType.BULLET_LIST,
          content: trimmed.replace(/^[-•*]\s+/, ''),
          properties: {}
        };
      } else {
        currentBlock.content += '\n' + trimmed.replace(/^[-•*]\s+/, '');
      }
      continue;
    }

    // Handle callouts
    if (trimmed.match(/^(NOTE|TIP|WARNING|INFO|IMPORTANT):/i)) {
      if (currentBlock) blocks.push(currentBlock);
      const type = trimmed.split(':')[0].toLowerCase();
      const calloutContent = trimmed.substring(trimmed.indexOf(':') + 1).trim();
      currentBlock = {
        id: createId(),
        type: BlockType.CALLOUT,
        content: calloutContent,
        properties: {
          type: type === 'note' ? 'info' : type,
          icon: type === 'warning' ? '⚠️' : type === 'tip' ? '💡' : 'ℹ️'
        }
      };
      continue;
    }

    // Handle empty lines
    if (!trimmed) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    // Regular text
    if (!currentBlock || currentBlock.type !== BlockType.TEXT) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        id: createId(),
        type: BlockType.TEXT,
        content: line,
        properties: {}
      };
    } else {
      currentBlock.content += '\n' + line;
    }
  }

  // Handle remaining content
  if (inTable && tableRows.length >= 2) {
    const headers = tableRows[0];
    const dataRows = tableRows.slice(1).filter(row => !isMarkdownTableSeparator(row));

    if (dataRows.length > 0) {
      blocks.push({
        id: createId(),
        type: BlockType.TABLE,
        content: '',
        properties: {
          tableData: [headers, ...dataRows],
          hasHeader: true
        }
      });
    }
  }

  if (inMathBlock && mathContent.length > 0) {
    blocks.push({
      id: createId(),
      type: BlockType.MATH,
      content: mathContent.join('\n'),
      properties: {}
    });
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  if (blocks.length === 0) {
    blocks.push({
      id: createId(),
      type: BlockType.TEXT,
      content: '',
      properties: {}
    });
  }

  return blocks;
};

// Block-based message renderer
const BlockBasedMessageRenderer = memo(({
  content,
  onRegenerate,
  _onEdit,
  _onQuestionClick = null,
  _mode = 'chat',
  _projectIds = [],
  _userContext = null,
  _isLastMessage = false,
  _suggestions = [],
  isPublicView = false,
  onTermClick = null,
  isStreaming = false
}) => {
  const [copyStatus, setCopyStatus] = useState(null);
  const [tokensPerSec, setTokensPerSec] = useState(null);

  // Subscribe to token tracker events for live tokens/sec
  useEffect(() => {
    if (!isStreaming) return;
    const unsub = tokenTracker.subscribe(event => {
      if (event.type === 'token') {
        setTokensPerSec(event.tokensPerSec);
      } else if (event.type === 'end') {
        setTokensPerSec(event.avgTps);
      } else if (event.type === 'start') {
        setTokensPerSec(null);
      }
    });
    return unsub;
  }, [isStreaming]);

  // Parse AI response into blocks
  const blocks = useMemo(() => {
    return parseAIResponseToBlocks(content);
  }, [content]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  }, [content]);

  const colors = {
    border: 'border-gray-200/50 dark:border-gray-700/50 midnight:border-slate-600/50'
  };

  if (!content) return null;

  return (
    <div className="space-y-6">
      {/* Streaming animation keyframes */}
      {isStreaming && (
        <style>{`
          @keyframes cc-block-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes cc-cursor-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
          .cc-block-fade { animation: cc-block-in 0.18s ease both; }
          .cc-cursor { display: inline-block; width: 2px; height: 1.1em; background: currentColor; border-radius: 1px; vertical-align: text-bottom; margin-left: 1px; opacity: 0.6; animation: cc-cursor-blink 0.9s ease-in-out infinite; }
        `}</style>
      )}

      {/* Handle text content with simple block display */}
      {content && blocks && (
        <div className="space-y-1">
          {blocks.map((block, idx) => (
            <div key={`${block.type}-${idx}`} className={isStreaming && idx === blocks.length - 1 ? 'cc-block-fade' : ''}>
              <BlockRenderer
                block={block}
                onTermClick={onTermClick}
                isLastBlock={isStreaming && idx === blocks.length - 1}
                isStreaming={isStreaming}
              />
            </div>
          ))}
          {isStreaming && <span className="cc-cursor" aria-hidden="true" />}
        </div>
      )}

      {/* Action Bar - Placed at top for quick access */}
      {!isPublicView && (
        <div className={`flex flex-wrap items-center justify-between gap-4 pt-5 mt-6 border-t ${colors.border}`}>
          <div className="flex items-center gap-4">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-700 rounded-lg transition-colors"
            >
              {copyStatus === 'copied' ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Regenerate
              </button>
            )}

            {/* Tokens/sec indicator — shown during/after streaming */}
            {tokensPerSec !== null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-800/50 rounded-lg">
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-xs font-mono text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                  {tokensPerSec} tok/s
                </span>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
});

BlockBasedMessageRenderer.displayName = 'BlockBasedMessageRenderer';

export default BlockBasedMessageRenderer;
