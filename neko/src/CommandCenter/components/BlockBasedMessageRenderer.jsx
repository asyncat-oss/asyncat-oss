// BlockBasedMessageRenderer.jsx - Updated for New Mode System
import { useMemo, useState, useCallback, memo, useEffect } from 'react';
import SaveAsNoteModal from './SaveAsNoteModal';
import ArtifactViewer from './artifacts/ArtifactViewer';
import { Copy, Check, RotateCcw, Zap } from 'lucide-react';
import { useCommandCenter } from '../CommandCenterContextEnhanced';
import { tokenTracker } from './LocalModelStats';
import katex from 'katex';
import 'katex/dist/katex.min.css';
// mhchem extension — enables \ce{H2O}, \ce{CO2}, chemical equations in KaTeX
import 'katex/contrib/mhchem/mhchem.js';
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
          className="absolute top-0 right-0 opacity-0 group-hover/math:opacity-100 transition-opacity px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded"
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
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover/imath:opacity-100 transition-opacity px-1.5 py-0.5 text-[10px] text-gray-600 bg-white shadow-md border border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded z-10 pointer-events-none group-hover/imath:pointer-events-auto whitespace-nowrap"
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
            <span className="font-semibold text-gray-900 dark:text-white text-sm">External link</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg leading-none">×</button>
        </div>
        <div className="mx-5 mb-4 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            <img src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" className="w-4 h-4 rounded flex-shrink-0 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono select-all">{href}</span>
          </div>
        </div>
        <p className="px-5 pb-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          This link was generated by AI and <span className="font-medium text-gray-700 dark:text-gray-300">may not be accurate</span>. Verify the URL before proceeding.
        </p>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
          <button onClick={handleOpen} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5">Open ↗</button>
        </div>
      </div>
    </div>
  );
};

const InlineLink = ({ href, label }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-blue-600 dark:text-blue-400 midnight:text-blue-300 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
      >
        {label}
      </button>
      {open && <InlineLinkModal href={href} label={label} onClose={() => setOpen(false)} />}
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

const parseInlineMarkdown = (text, onTermClick) => {
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
    // then markdown links, bare URLs, bold, italic, code, citations.
    // Groups: 1=annot-term, 2=annot-def, 3=md-label, 4=md-url, 5=bare-url,
    //         6=bold, 7=italic, 8=code, 9=citation
    const inlineRegex = /\[\[([^\]|]+)\|([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\*?\(from ([^)]+)\)\*?/g;

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
        // [label](url) — markdown link
        parts.push(<InlineLink key={`lnk-${key++}`} href={m[4]} label={m[3]} />);
      } else if (m[5] !== undefined) {
        // bare https://... URL
        parts.push(<InlineLink key={`url-${key++}`} href={m[5]} label={m[5]} />);
      } else if (m[6] !== undefined) {
        // **bold**
        parts.push(<strong key={`b-${key++}`} className="font-bold">{m[6]}</strong>);
      } else if (m[7] !== undefined) {
        // *italic*
        parts.push(<em key={`i-${key++}`} className="italic">{m[7]}</em>);
      } else if (m[8] !== undefined) {
        // `code`
        parts.push(
          <code key={`c-${key++}`} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-700 rounded text-sm font-mono">
            {m[8]}
          </code>
        );
      } else if (m[9] !== undefined) {
        // (from Source)
        parts.push(
          <span key={`cite-${key++}`} className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 italic ml-1">
            (from {m[9]})
          </span>
        );
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

export const BlockRenderer = ({ block, onTermClick }) => {
  const baseStyles = "leading-relaxed text-gray-900 dark:text-gray-100 midnight:text-slate-100";

  const renderContent = (content) => {
    const parsed = parseInlineMarkdown(content, onTermClick);
    return <span>{parsed}</span>;
  };

  switch (block.type) {
    case 'heading1':
      return (
        <h1 className={`text-3xl font-bold mb-5 mt-8 first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h1>
      );

    case 'heading2':
      return (
        <h2 className={`text-2xl font-bold mb-4 mt-6 first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h2>
      );

    case 'heading3':
      return (
        <h3 className={`text-xl font-bold mb-3 mt-5 first:mt-0 ${baseStyles}`}>
          {renderContent(block.content)}
        </h3>
      );

    case 'bulletList':
      return (
        <ul className="mb-5 space-y-2.5 ml-2">
          {block.content.split('\n').filter(line => line.trim()).map((item, i) => {
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

    case 'numberedList':
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
        <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 midnight:border-blue-400 pl-5 py-3 mb-6 italic bg-blue-50/50 dark:bg-blue-900/10 midnight:bg-blue-900/20 rounded-r-lg">
          <div className={`${baseStyles} opacity-90`}>
            {renderContent(block.content)}
          </div>
        </blockquote>
      );

    case 'code':
      return (
        <CodeBlock content={block.content} language={block.properties?.language} />
      );

    case 'math':
      // Standalone display-mode math block with copy-as-LaTeX button
      return <MathBlock latex={block.content} />;

    case 'table':
      const tableData = block.properties?.tableData || [];
      if (tableData.length === 0) return null;

      return (
        <div className="mb-6 overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 midnight:border-slate-500 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800 midnight:bg-slate-700">
                {tableData[0]?.map((header, i) => (
                  <th key={i} className={`border border-gray-300 dark:border-gray-600 midnight:border-slate-500 px-4 py-3 text-left font-semibold ${baseStyles}`}>
                    {renderContent(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.slice(1).map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-700/50 transition-colors">
                  {row.map((cell, j) => (
                    <td key={j} className={`border border-gray-300 dark:border-gray-600 midnight:border-slate-500 px-4 py-3 ${baseStyles}`}>
                      {renderContent(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'divider':
      return <hr className="my-8 border-t-2 border-gray-200 dark:border-gray-700 midnight:border-slate-600" />;

    case 'callout':
      return (
        <div className="mb-6 p-5 rounded-lg border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30 shadow-sm">
          <div className={`${baseStyles} font-medium`}>
            {renderContent(block.content)}
          </div>
        </div>
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

  // Apply syntax highlighting
  const highlighted = useMemo(() => {
    const lang = (language || 'text').toLowerCase();
    try {
      if (hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang }).value;
      }
      // Auto-detect if language not registered
      return hljs.highlightAuto(content).value;
    } catch {
      // Fallback: escape HTML and return plain
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

  return (
    <div className="mb-6 relative group">
      <div className="bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 midnight:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 midnight:text-slate-300 uppercase tracking-wide">
            {language}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-slate-600 rounded transition-colors"
          >
            {copyStatus === 'copied' ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
                <span className="text-green-600 dark:text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
        </div>

        <pre className="p-5 overflow-x-auto bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900">
          <code
            className="text-sm font-mono leading-7 hljs"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
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
  DIVIDER: 'divider',
  VIDEO: 'video',
  AUDIO: 'audio',
  CALLOUT: 'callout'
};

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
      tableRows.push(trimmed.split('|').map(cell => cell.trim()).filter(cell => cell));
      continue;
    } else if (inTable) {
      if (tableRows.length >= 2) {
        const headers = tableRows[0];
        const dataRows = tableRows.slice(1).filter(row =>
          !row.every(cell => cell.match(/^[-:]+$/))
        );

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
    const dataRows = tableRows.slice(1).filter(row =>
      !row.every(cell => cell.match(/^[-:]+$/))
    );

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
  artifacts = null,
  artifactExplanation = null,
  _onSaveArtifactToNotes = null,
  _onArtifactOpen = null,
  onTermClick = null,
  isStreaming = false
}) => {
  const [copyStatus, setCopyStatus] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [tokensPerSec, setTokensPerSec] = useState(null);

  const { shouldSaveConversations } = useCommandCenter();

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

  // Check if message has artifacts
  const hasArtifacts = artifacts && artifacts.length > 0;

  // Parse AI response into blocks
  const blocks = useMemo(() => {
    const parsedBlocks = parseAIResponseToBlocks(content);

    // When artifacts exist, filter out code blocks from content (they're shown as artifacts)
    if (hasArtifacts) {
      return parsedBlocks.filter(block => block.type !== 'code');
    }

    return parsedBlocks;
  }, [content, hasArtifacts]);

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

  const _handleSaveAsNote = useCallback(() => {
    setShowSaveModal(true);
  }, []);


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

      {/* Handle text content with simple block display - Show BEFORE artifacts like Claude */}
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

      {/* Artifacts — only show inline card when no side panel handler exists */}
      {hasArtifacts && !_onArtifactOpen && (
        <div className="artifacts-section">
          <ArtifactViewer
            artifacts={artifacts}
            explanation={artifactExplanation}
            showExplanation={!!artifactExplanation}
            onSaveToNotes={_onSaveArtifactToNotes}
            onArtifactOpen={_onArtifactOpen}
          />
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


      {/* Save Modal - Only for saveable modes */}
      {!isPublicView && shouldSaveConversations && shouldSaveConversations() && (
        <SaveAsNoteModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          content={content}
          blocks={blocks}
          suggestedTitle={`AI Response - ${new Date().toLocaleDateString()}`}
        />
      )}
    </div>
  );
});

BlockBasedMessageRenderer.displayName = 'BlockBasedMessageRenderer';

export default BlockBasedMessageRenderer;
