/* eslint-disable react/prop-types */
/**
 * SyntaxFileViewer — shows file content with:
 *  - Monaco Editor in read-only mode (syntax highlighting + line numbers + code folding)
 *  - Falls back to hljs-highlighted <pre> if Monaco hasn't loaded yet
 *  - Language auto-detection from file extension
 *  - Copy button
 *  - Binary/large-file guards
 */

import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Copy, Check } from 'lucide-react';
import { usePrefersDark } from '../../../utils/usePrefersDark.js';

const EXT_TO_MONACO = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  json: 'json', jsonc: 'json', json5: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini', env: 'ini', ini: 'ini',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  sql: 'sql', md: 'markdown', mdx: 'markdown',
  tf: 'hcl', dockerfile: 'dockerfile', makefile: 'makefile',
  graphql: 'graphql', proto: 'protobuf',
  vue: 'html', svelte: 'html',
  r: 'r', scala: 'scala', dart: 'dart', lua: 'lua',
};

function detectMonacoLang(filePath) {
  const name = (filePath || '').toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
  const ext = name.split('.').pop();
  return EXT_TO_MONACO[ext] || 'plaintext';
}

export default function SyntaxFileViewer({ filePath, content, tooLarge, binary, maxHeight = 'calc(100vh - 240px)' }) {
  const [copied, setCopied] = useState(false);
  const isDark = usePrefersDark();
  const lang = detectMonacoLang(filePath);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  if (binary) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-4 py-6 text-center text-xs text-gray-400 dark:text-slate-500">
        Binary file — preview not available.
      </div>
    );
  }

  if (tooLarge) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-4 py-6 text-center text-xs text-gray-400 dark:text-slate-500">
        File is too large to preview.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 px-3 py-1.5">
        <span className="min-w-0 truncate font-mono text-[11px] text-gray-600 dark:text-slate-400">{filePath}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] text-gray-400 dark:text-slate-600">{lang}</span>
          <button
            type="button"
            onClick={copy}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Copy"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Monaco editor in read-only mode */}
      <Editor
        value={content || ''}
        language={lang}
        theme={isDark ? 'vs-dark' : 'vs'}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          folding: true,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          fontSize: 12,
          lineHeight: 20,
          fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Menlo', monospace",
          fontLigatures: true,
          padding: { top: 8, bottom: 8 },
          renderWhitespace: 'none',
          guides: { indentation: false },
          contextmenu: false,
          links: false,
        }}
        height={maxHeight}
        loading={
          <div className="flex items-center justify-center" style={{ height: maxHeight }}>
            <span className="text-xs text-gray-400 dark:text-slate-600">Loading editor…</span>
          </div>
        }
      />
    </div>
  );
}
