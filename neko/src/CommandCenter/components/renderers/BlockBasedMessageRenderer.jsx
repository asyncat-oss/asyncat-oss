// BlockBasedMessageRenderer.jsx - Shared markdown/block renderer for agent answers
import { lazy, Suspense, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { escapeHtml, highlightCode, useHighlighter, useKatex } from '../../../utils/lazyRenderers.js';
import { Copy, Check, ChevronRight, ExternalLink, File, Globe2, FolderOpen, Loader2 } from 'lucide-react';
import { useUiPreferences } from '../../../contexts/UiPreferencesContext.jsx';
import Button from '../../../components/ui/Button.jsx';
import Dialog from '../../../components/ui/Dialog.jsx';
import { openWebLink } from '../../../utils/openWebLink.js';
import { FollowUps, InteractiveTable } from './InteractiveBlocks.jsx';
import { diffLineKind } from './diffLines.js';

// mhchem extension — enables \ce{H2O}, \ce{CO2}, chemical equations in KaTeX
import 'highlight.js/styles/github.css';

// Register languages

// ─── KaTeX Math Renderer ────────────────────────────────────────────────────

/**
 * Render a LaTeX string to HTML using KaTeX.
 * For display mode: renders as a block with a copy button.
 * For inline mode: renders inline with a hover copy button.
 */
const MathSpan = ({ latex, displayMode = false }) => {
  const [copied, setCopied] = useState(false);

  const katex = useKatex();
  const html = useMemo(() => {
    if (!katex) return escapeHtml(latex);
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        errorColor: '#cc0000',
        trust: false,
        strict: 'ignore'
      });
    } catch {
      return `<span style="color:#cc0000">${escapeHtml(latex)}</span>`;
    }
  }, [katex, latex, displayMode]);

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
          type="button"
          onClick={handleCopy}
          className="absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-fg-subtle opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover/math:opacity-100"
          title="Copy LaTeX"
          aria-label={copied ? 'Copied' : 'Copy LaTeX'}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </span>
    );
  }

  return (
    <span className="inline relative group/imath">
      <span dangerouslySetInnerHTML={{ __html: html }} />
      <button
        type="button"
        onClick={handleCopy}
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover/imath:opacity-100 transition-opacity rounded-md border border-line bg-elevated px-1.5 py-0.5 text-[11px] text-fg-muted shadow-sm z-10 pointer-events-none group-hover/imath:pointer-events-auto whitespace-nowrap"
        title="Copy LaTeX"
      >
        {copied ? 'Copied' : 'Copy LaTeX'}
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

// ─── Inline links ───────────────────────────────────────────────────────────
// Plain links that open with the user's Workbench choice (the built-in
// browser or the system one). No favicons: fetching one would tell a third
// party about every link in an answer.

const useOpenLink = (href) => {
  const { workbenchPreferences } = useUiPreferences();
  return useCallback((event) => {
    event.preventDefault();
    openWebLink(href, workbenchPreferences.browserOpenLinks);
  }, [href, workbenchPreferences.browserOpenLinks]);
};

const InlineLink = ({ href, label, variant = 'inline' }) => {
  const open = useOpenLink(href);

  if (variant === 'chip') {
    return (
      <a
        href={href}
        onClick={open}
        title={href}
        className="inline-flex max-w-full items-center gap-1 text-accent underline-offset-2 hover:underline"
      >
        <span className="truncate">{label || getUrlDomain(href)}</span>
      </a>
    );
  }

  return (
    <a href={href} onClick={open} title={href} className="break-words text-accent underline-offset-2 hover:underline">
      {label}
    </a>
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
  const Icon = isDir ? FolderOpen : File;

  const displayPath = segments.length > 2
    ? `…/${segments.slice(-2).join('/')}`
    : (rawPath.replace(/\/$/, '') || rawPath);

  return (
    <span
      title={rawPath}
      className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-md font-mono leading-normal align-middle text-[0.86em] max-w-[32ch] bg-hover text-fg select-all"
    >
      <Icon className="w-3 h-3 flex-shrink-0 text-fg-subtle" />
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
  const plainLink = markdownLink ? null : text.match(/https?:\/\/[^\s<>"')\]]+/);
  const rawUrl = markdownLink?.[2] || plainLink?.[0];
  if (!rawUrl) return null;

  const matchStart = markdownLink?.index ?? plainLink?.index ?? text.indexOf(rawUrl);
  const matchLength = markdownLink?.[0]?.length ?? rawUrl.length;
  const beforeUrl = text.slice(0, matchStart);
  const afterUrl = text.slice(matchStart + matchLength);
  const beforeParts = beforeUrl.split(/\s+[—-]\s+/).map(part => part.trim()).filter(Boolean);
  const titleSource = markdownLink?.[1] || beforeParts[0] || beforeUrl;
  const descriptionSource = afterUrl.replace(/^[\s)—–—:|,-]+/, '') || beforeParts.slice(1).join(' — ');
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
  const open = useOpenLink(item.url);

  return (
    <a
      href={item.url}
      onClick={open}
      className="group flex min-w-0 items-start gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:bg-hover"
      title={item.url}
    >
      {item.isImage ? (
        <img
          src={item.url}
          alt=""
          loading="lazy"
          className="h-14 w-16 flex-shrink-0 rounded-lg border border-line object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <Globe2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-fg-subtle" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          {number && <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">{number}</span>}
          <span className="truncate text-[14px] font-medium text-fg">{item.title}</span>
        </span>
        {item.description && (
          <span className="mt-1 line-clamp-2 text-[12px] leading-4 text-fg-muted">{item.description}</span>
        )}
        <span className="mt-1.5 flex min-w-0 items-center gap-1 text-[12px] text-accent">
          <span className="truncate">{item.domain}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
        </span>
      </span>
    </a>
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
        className="my-1 inline-flex align-middle overflow-hidden rounded-md border border-line bg-hover transition-colors hover:border-line-strong"
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
      <Dialog
        open={open}
        size="xl"
        title={label}
        onClose={() => setOpen(false)}
        footer={(
          <Button variant="secondary" icon={ExternalLink} onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}>
            Open
          </Button>
        )}
      >
        <div className="flex justify-center rounded-lg bg-hover p-2">
          <img src={src} alt={label} className="max-h-[65vh] max-w-full object-contain" />
        </div>
      </Dialog>
    </>
  );
};

// ─── Annotated term (clickable, opens explain panel) ────────────────────────
// A dotted underline, so a term reads as part of the sentence.

const AnnotatedTerm = ({ term, definition, onTermClick }) => (
  <button
    type="button"
    onClick={() => onTermClick && onTermClick(term, definition)}
    className="inline rounded-sm text-fg underline decoration-fg-subtle decoration-dotted underline-offset-4 transition-colors hover:decoration-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    title={definition}
  >
    {term}
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
        parts.push(<strong key={`b-${key++}`} className="font-semibold">{m[8]}</strong>);
      } else if (m[9] !== undefined) {
        // *italic*
        parts.push(<em key={`i-${key++}`} className="italic">{m[9]}</em>);
      } else if (m[10] !== undefined) {
        // `code` — if it looks like a file path, render as clickable chip; else plain code
        if (looksLikeAnyFilePath(m[10])) {
          parts.push(<InlineFilePath key={`fp-${key++}`} rawPath={m[10]} />);
        } else {
          parts.push(
            <code key={`c-${key++}`} className="rounded-md bg-hover px-1.5 py-0.5 font-mono text-[0.86em] text-fg">
              {m[10]}
            </code>
          );
        }
      } else if (m[11] !== undefined) {
        // (from Source)
        parts.push(
          <span key={`cite-${key++}`} className="ml-1 text-[13px] text-fg-subtle">
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
  // break-words: a long path or JSON line wraps instead of running off a
  // narrow window.
  const baseStyles = "leading-7 text-fg break-words";

  const renderContent = (content, options) => {
    const parsed = parseInlineMarkdown(content, onTermClick, options);
    return <span>{parsed}</span>;
  };

  switch (block.type) {
    case 'heading1':
      return (
        <h1 id={headingId(block.content)} className={`mb-3 mt-8 text-[22px] font-semibold tracking-[-0.02em] first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h1>
      );

    case 'heading2':
      return (
        <h2 id={headingId(block.content)} className={`mb-2.5 mt-7 text-[19px] font-semibold tracking-[-0.015em] first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h2>
      );

    case 'heading3':
      return (
        <h3 id={headingId(block.content)} className={`mb-2 mt-6 text-[16px] font-semibold first:mt-0 ${baseStyles}`}>
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
                  <div key={i} className={`rounded-xl border border-line p-3 text-[14px] ${baseStyles}`}>
                    {renderContent(item)}
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <ul className="mb-4 space-y-1 pl-1">
            {items.map((item, i) => {
            // Block parser already stripped the bullet prefix before storing content.
            // Only strip real bullet chars (•, -) here — never *, which could be italic markdown.
            const text = item.replace(/^[•-]\s+/, '');
            const hasSubContent = text.includes('→') || text.match(/^\s+[-•]/);

            return (
              <li key={i} className={`${baseStyles} relative flex gap-2.5`}>
                <span className="min-w-[0.5rem] select-none font-normal text-fg-subtle" aria-hidden="true">
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
          const subMatch = line.match(/^[→-]\s+(.+)/);

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
                  <div key={i} className={`rounded-xl border border-line p-3 text-[14px] ${baseStyles}`}>
                    {item.number}. {renderContent(item.text)}
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <ol className="mb-4 space-y-1.5">
            {structuredItems.map((item, i) => (
              <li key={i} className="relative flex gap-3" style={{ listStyle: 'none' }}>
                <span className="min-w-[1.5rem] text-right font-medium tabular-nums leading-7 text-fg-subtle">
                  {item.number}.
                </span>
                <div className="flex-1 space-y-1.5">
                  <div className={baseStyles}>
                    {renderContent(item.text)}
                  </div>
                  {item.subItems.length > 0 && (
                    <div className="pl-6 space-y-1 text-[14px]">
                      {item.subItems.map((sub, j) => (
                        <div key={j} className="flex gap-2 items-start">
                          <span className="mt-0.5 text-[12px] font-normal text-fg-subtle">→</span>
                          <span className="flex-1 leading-relaxed text-fg-muted">
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

    case 'todo': {
      // A read-only box: the answer's own to-do list, not a control.
      const done = Boolean(block.properties?.completed || block.properties?.checked);
      return (
        <div className="mb-2 flex items-start gap-3 px-1">
          <span
            role="img"
            aria-label={done ? 'Done' : 'Not done'}
            className={`mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${done ? 'border-accent bg-accent' : 'border-line-strong bg-canvas'}`}
          >
            {done ? <Check className="h-3 w-3 text-canvas" strokeWidth={3} /> : null}
          </span>
          <span className={`${baseStyles} ${done ? 'line-through opacity-60' : ''}`}>
            {renderContent(block.content)}
          </span>
        </div>
      );
    }

    case 'quote':
      return (
        <blockquote className="mb-4 border-l-[3px] border-line-strong py-0.5 pl-4">
          <div className="leading-7 text-fg-muted">
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
      // Follow-up suggestions — buttons that send the next message
      if (block.properties?.language?.toLowerCase() === 'followups') {
        return <FollowUps content={block.content} />;
      }
      // Chart blocks — render as interactive Recharts
      if (block.properties?.language?.toLowerCase() === 'chart') {
        return (
          <Suspense fallback={<div className="my-3 h-64 rounded-xl border border-line" />}>
            <ChartBlock content={block.content} fallback={<CodeBlock content={block.content} language="json" />} />
          </Suspense>
        );
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

    case 'table': {
      const tableData = block.properties?.tableData || [];
      if (tableData.length === 0) return null;
      const columnCount = Math.max(...tableData.map(row => row.length), 1);
      const normalizedRows = tableData.map(row =>
        Array.from({ length: columnCount }, (_, index) => row[index] ?? '')
      );
      // Sortable by column, filterable when long, copyable as CSV.
      return <InteractiveTable rows={normalizedRows} renderCell={(cell) => renderContent(cell, { linkVariant: 'chip' })} />;
    }

    case 'divider':
      return <hr className="my-7 border-t border-line" />;

    case 'callout':
      return (
        <div className="mb-4 rounded-xl border border-line bg-hover px-4 py-3">
          <div className={`${baseStyles} text-[14px]`}>
              {renderContent(block.content)}
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
        <p className={`mb-4 ${baseStyles}`}>
          {renderContent(block.content)}
        </p>
      );
  }
};

// ─── Shared header for code-like blocks ─────────────────────────────────────
// Code, LaTeX, diagrams and diffs all start with the same line: what the
// block is on the left, quiet actions on the right.

// The surface the highlight.js palette below is tuned for (GitHub light and
// dark), shared by every block that shows code.
const CODE_SURFACE = 'bg-[#f6f8fa] dark:bg-[#0d1117]';

const BlockHeader = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-1.5">
    <span className="select-none text-[12px] font-medium text-fg-subtle">{label}</span>
    <div className="flex items-center gap-0.5">{children}</div>
  </div>
);

const BlockAction = ({ onClick, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="flex h-7 select-none items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
  >
    {children}
  </button>
);

// Copy, or a green check for a moment once copied.
const useCopy = (text) => {
  const [copyStatus, setCopyStatus] = useState(null);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
    } catch (error) {
      console.error('Failed to copy:', error);
      setCopyStatus('failed');
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }, [text]);
  return [copyStatus, copy];
};

const CopyAction = ({ status, onCopy, label = 'Copy' }) => (
  <BlockAction onClick={onCopy}>
    {status === 'copied' ? (
      <>
        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        Copied
      </>
    ) : (
      <>
        <Copy className="w-3.5 h-3.5" />
        {status === 'failed' ? "Couldn't copy" : label}
      </>
    )}
  </BlockAction>
);

// ─── Math block with copy-as-LaTeX button ───────────────────────────────────
const MathBlock = ({ latex }) => {
  const [copyStatus, handleCopy] = useCopy(latex);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-line">
      <BlockHeader label="LaTeX">
        <CopyAction status={copyStatus} onCopy={handleCopy} label="Copy LaTeX" />
      </BlockHeader>
      <div className="overflow-x-auto px-6 py-5 text-center">
        <MathSpan latex={latex} displayMode={true} />
      </div>
    </div>
  );
};

// ─── Code block with syntax highlighting ────────────────────────────────────
// `actions` are extra header buttons beside Copy (the HTML block's preview).
const CodeBlock = ({ content, language = 'text', actions = null }) => {
  const [copyStatus, handleCopy] = useCopy(content);

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

  const hljs = useHighlighter();
  const highlighted = useMemo(() => highlightCode(hljs, content, language || 'text'), [hljs, content, language]);

  return (
    <div className={`mb-4 overflow-hidden rounded-xl border border-line ${CODE_SURFACE}`}>
      <BlockHeader label={language || 'text'}>
        {actions}
        <CopyAction status={copyStatus} onCopy={handleCopy} />
      </BlockHeader>

      <pre className="overflow-x-auto px-4 py-3.5">
        <code
          className="text-[13px] font-mono leading-relaxed hljs"
          // highlight.js's stylesheet pads `pre code.hljs`; the pre already does.
          style={{ padding: 0, overflow: 'visible' }}
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
        // Loaded on first use: mermaid is large and most chats have no diagrams.
        const { default: mermaid } = await import('mermaid');
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: document.documentElement.matches('.dark, .midnight') ? 'dark' : 'neutral',
            // Diagrams come from model output: keep mermaid's default sanitizing of
            // labels and links (loose allowed javascript: URLs in click handlers).
            securityLevel: 'strict',
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
    <div className="mb-6 overflow-hidden rounded-xl border border-line">
      <BlockHeader label="Diagram">
        <BlockAction onClick={() => setShowSource(v => !v)}>
          {showSource ? 'Show diagram' : 'View source'}
        </BlockAction>
      </BlockHeader>
      {showSource ? (
        <pre className={`overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg ${CODE_SURFACE}`}>
          {content}
        </pre>
      ) : svg ? (
        <div
          ref={containerRef}
          className="flex justify-center overflow-x-auto p-4"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex items-center justify-center gap-2 p-8 text-[12px] text-fg-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Drawing the diagram…
        </div>
      )}
    </div>
  );
};

// ─── Diff block with colored +/- lines ──────────────────────────────────────
// Added and removed lines keep green and red: there they are status.
const DIFF_LINE = {
  added: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  removed: 'bg-red-500/10 text-red-700 dark:text-red-300',
  hunk: 'text-fg-subtle',
  meta: 'text-fg-subtle',
  plain: 'text-fg',
};

const DiffBlock = ({ content }) => {
  const [copyStatus, handleCopy] = useCopy(content);
  const lines = (content || '').split('\n');

  return (
    <div className={`mb-6 overflow-hidden rounded-xl border border-line ${CODE_SURFACE}`}>
      <BlockHeader label="Diff">
        <CopyAction status={copyStatus} onCopy={handleCopy} />
      </BlockHeader>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className={`-mx-1 px-1 ${DIFF_LINE[diffLineKind(line)]}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
};

// ─── Interactive chart block (Recharts, loaded on first use) ───────────────
const ChartBlock = lazy(() => import('./ChartBlock.jsx'));

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
    <div className="mb-6 overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
      >
        <ChevronRight className={`h-3.5 w-3.5 text-fg-subtle transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        <span className="text-[14px] font-medium text-fg">
          {summary}
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
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

// ─── HTML block — code view + open in Preview panel ─────────────────────────
const HtmlPreviewBlock = ({ content }) => {
  const handleOpenPreview = () => {
    let previewUrl;
    if (window?.electronAPI) {
      // Blob URLs are renderer-process-specific; data URLs cross the webview boundary
      const b64 = btoa(unescape(encodeURIComponent(content || '')));
      previewUrl = `data:text/html;base64,${b64}`;
    } else {
      previewUrl = URL.createObjectURL(new Blob([content || ''], { type: 'text/html' }));
    }
    window.dispatchEvent(new CustomEvent('asyncat-open-preview', { detail: { url: previewUrl } }));
  };

  return (
    <CodeBlock
      content={content}
      language="html"
      actions={(
        <BlockAction onClick={handleOpenPreview}>
          <ExternalLink className="w-3.5 h-3.5" />
          Open in preview
        </BlockAction>
      )}
    />
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
export const parseAIResponseToBlocks = (content, options = {}) => {
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
    if (trimmed.match(/^[→-]\s+/) && currentBlock?.type === BlockType.NUMBERED_LIST) {
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

  if (inCodeBlock) {
    blocks.push({
      id: createId(),
      type: BlockType.CODE,
      content: codeContent.join('\n'),
      properties: {
        language: codeLanguage || 'text',
        showLineNumbers: codeContent.length > 10,
        streaming: Boolean(options.streaming)
      }
    });
  }

  if (inDetailsBlock) {
    blocks.push({
      id: createId(),
      type: options.streaming ? BlockType.DETAILS : BlockType.TEXT,
      content: detailsContent.join('\n').trim(),
      properties: { summary: detailsSummary || 'Details', streaming: Boolean(options.streaming) }
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
