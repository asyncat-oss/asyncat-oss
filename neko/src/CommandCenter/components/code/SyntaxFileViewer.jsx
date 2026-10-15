/**
 * SyntaxFileViewer — a read-only view of a file: highlighted code with line
 * numbers, the language, and a copy button. Highlighting uses highlight.js,
 * loaded on demand like code in chat, so it works offline; until it loads the
 * code shows as plain text.
 */

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Copy, Check } from 'lucide-react';
import 'highlight.js/styles/github.css';
import IconButton from '../../../components/ui/IconButton.jsx';
import { escapeHtml, useHighlighter } from '../../../utils/lazyRenderers.js';

// File extension → highlight.js language.
const EXT_TO_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp', cs: 'csharp',
  rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  css: 'css', scss: 'scss', less: 'less',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml',
  json: 'json', jsonc: 'json', json5: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini', env: 'ini', ini: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell',
  sql: 'sql', md: 'markdown', mdx: 'markdown',
  graphql: 'graphql', r: 'r', lua: 'lua', pl: 'perl', diff: 'diff',
};

function detectLanguage(filePath) {
  const name = String(filePath || '').split(/[\\/]/).pop().toLowerCase();
  if (name === 'dockerfile' || name.endsWith('.dockerfile')) return 'dockerfile';
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
  return EXT_TO_LANG[name.includes('.') ? name.split('.').pop() : ''] || 'plaintext';
}

export default function SyntaxFileViewer({ filePath, content, tooLarge, binary, maxHeight = 'calc(100vh - 240px)' }) {
  const [copied, setCopied] = useState(false);
  const hljs = useHighlighter();
  const lang = detectLanguage(filePath);
  const text = content || '';

  const html = useMemo(() => {
    if (!hljs || !hljs.getLanguage(lang)) return escapeHtml(text);
    try {
      return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(text);
    }
  }, [hljs, lang, text]);
  const lineCount = useMemo(() => Math.max(1, text.split('\n').length - (text.endsWith('\n') ? 1 : 0)), [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  if (binary || tooLarge) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-[12px] text-fg-subtle">
        {binary ? 'This file isn’t text, so there’s no preview.' : 'This file is too large to preview.'}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-canvas">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface py-1 pl-3 pr-1">
        <span className="min-w-0 truncate font-mono text-[12px] text-fg-muted">{filePath}</span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] text-fg-subtle">{lang === 'plaintext' ? 'text' : lang}</span>
          <IconButton size="sm" icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy'} onClick={copy} />
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight }}>
        <div className="flex min-w-max font-mono text-[12px] leading-5">
          <pre
            aria-hidden="true"
            className="sticky left-0 select-none border-r border-line bg-canvas px-3 py-2 text-right text-fg-subtle"
          >
            {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
          </pre>
          <pre className="hljs flex-1 !bg-transparent px-3 py-2 text-fg">
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        </div>
      </div>
    </div>
  );
}

SyntaxFileViewer.propTypes = {
  filePath: PropTypes.string,
  content: PropTypes.string,
  tooLarge: PropTypes.bool,
  binary: PropTypes.bool,
  maxHeight: PropTypes.string,
};
