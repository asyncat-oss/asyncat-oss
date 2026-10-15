/**
 * UnifiedDiffViewer — renders a git-style unified diff with:
 *  - line numbers (old + new) in the gutter
 *  - syntax-highlighted context lines
 *  - colored add/remove lines with full-row backgrounds
 *  - file header with +N/-N stats
 *  - a one-line note for a binary or mode-only change, which has no lines
 * diffParse.js reads the diff.
 */

import { useMemo } from 'react';
// The common build (~36 languages) instead of all ~190: the full build added
// 1.7 MB to the startup bundle. It shares one core with the chat renderer.
import { highlightCode, useHighlighter } from '../../../utils/lazyRenderers.js';
import 'highlight.js/styles/github.css';
import { diffFilePath, emptyDiffNote, parseUnifiedDiff } from './diffParse.js';

function detectLangFromPath(filePath) {
  const ext = filePath?.split('.').pop()?.toLowerCase() || '';
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', h: 'cpp',
    rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    css: 'css', scss: 'css', less: 'css',
    html: 'xml', xml: 'xml', svg: 'xml',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql', md: 'markdown',
  };
  return map[ext] || 'plaintext';
}

// ── Line component ────────────────────────────────────────────────────────────

function DiffLine({ line, lang }) {
  const hljs = useHighlighter();
  const html = useMemo(() => highlightCode(hljs, line.text, lang), [hljs, line.text, lang]);

  const rowBg = line.type === 'add'
    ? 'bg-emerald-500/10'
    : line.type === 'del'
      ? 'bg-red-500/10'
      : '';

  const marker = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
  const markerColor = line.type === 'add'
    ? 'text-emerald-600 dark:text-emerald-400'
    : line.type === 'del'
      ? 'text-red-600 dark:text-red-400'
      : 'text-fg-subtle';

  return (
    <tr className={`group ${rowBg}`}>
      {/* old line number */}
      <td className="w-10 select-none border-r border-line px-1.5 py-0 text-right font-mono text-[11px] text-fg-subtle">
        {line.oldLine ?? ''}
      </td>
      {/* new line number */}
      <td className="w-10 select-none border-r border-line px-1.5 py-0 text-right font-mono text-[11px] text-fg-subtle">
        {line.newLine ?? ''}
      </td>
      {/* +/- marker */}
      <td className={`w-5 select-none px-1 py-0 text-center font-mono text-[11px] font-semibold ${markerColor}`}>
        {marker}
      </td>
      {/* code */}
      <td className="py-0 px-2 w-full overflow-hidden">
        <code
          className="block whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-fg"
          dangerouslySetInnerHTML={{ __html: html || '​' }}
        />
      </td>
    </tr>
  );
}

// ── Hunk component ────────────────────────────────────────────────────────────

function Hunk({ hunk, lang }) {
  return (
    <tbody>
      <tr className="select-none">
        <td colSpan={4} className="border-y border-line bg-hover px-3 py-0.5 font-mono text-[11px] text-fg-subtle">
          {hunk.header}
        </td>
      </tr>
      {hunk.lines.map((line, i) => (
        <DiffLine key={i} line={line} lang={lang} />
      ))}
    </tbody>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UnifiedDiffViewer({ diff, filePath, className = '' }) {
  const files = useMemo(() => parseUnifiedDiff(diff, filePath), [diff, filePath]);

  if (files.length === 0) {
    return <div className={`px-4 py-3 text-[12px] text-fg-subtle ${className}`}>No changes to show.</div>;
  }

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      {files.map((file, i) => <FileDiff key={i} file={file} fallbackPath={filePath} />)}
    </div>
  );
}

function FileDiff({ file, fallbackPath }) {
  const displayPath = diffFilePath(file, fallbackPath);
  const lang = detectLangFromPath(file.newPath || file.oldPath || fallbackPath);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-canvas">
      {/* file header */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3 py-1.5">
        <span className="min-w-0 truncate font-mono text-[12px] text-fg-muted" title={displayPath}>{displayPath}</span>
        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
          {file.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>}
          {file.deletions > 0 && <span className="text-red-600 dark:text-red-400">−{file.deletions}</span>}
        </div>
      </div>
      {/* A binary or mode-only change has no lines: say so instead of an empty table. */}
      {file.hunks.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-fg-subtle">{emptyDiffNote(file)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed" style={{ minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: '2.5rem' }} />
              <col style={{ width: '2.5rem' }} />
              <col style={{ width: '1.25rem' }} />
              <col style={{ width: 'auto' }} />
            </colgroup>
            {file.hunks.map((hunk, i) => <Hunk key={i} hunk={hunk} lang={lang} />)}
          </table>
        </div>
      )}
    </div>
  );
}
