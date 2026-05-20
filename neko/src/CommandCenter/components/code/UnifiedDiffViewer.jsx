/* eslint-disable react/prop-types */
/**
 * UnifiedDiffViewer — renders a git-style unified diff with:
 *  - line numbers (old + new) in the gutter
 *  - syntax-highlighted context lines
 *  - colored add/remove lines with full-row backgrounds
 *  - collapsible unchanged hunks
 *  - file header with +N/-N stats
 */

import { useMemo } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

// ── Diff parser ───────────────────────────────────────────────────────────────

function parseDiff(diffText) {
  if (!diffText) return [];
  const lines = diffText.split('\n');
  const files = [];
  let current = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of lines) {
    if (raw.startsWith('diff --git') || raw.startsWith('--- ') || raw.startsWith('+++ ')) {
      if (raw.startsWith('+++ ') && current) {
        current.newPath = raw.slice(4).replace(/^b\//, '');
      } else if (raw.startsWith('--- ') && !raw.startsWith('--- /dev/null')) {
        if (!current) { current = { oldPath: '', newPath: '', hunks: [], additions: 0, deletions: 0 }; files.push(current); }
        current.oldPath = raw.slice(4).replace(/^a\//, '');
      } else if (raw.startsWith('diff --git')) {
        current = { oldPath: '', newPath: '', hunks: [], additions: 0, deletions: 0 };
        files.push(current);
      }
      continue;
    }

    if (raw.startsWith('@@ ')) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (m) {
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[2], 10);
        hunk = { header: raw, lines: [] };
        if (current) current.hunks.push(hunk);
      }
      continue;
    }

    if (!hunk) continue;

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      hunk.lines.push({ type: 'add', text: raw.slice(1), oldLine: null, newLine: newLine++ });
      if (current) current.additions++;
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      hunk.lines.push({ type: 'del', text: raw.slice(1), oldLine: oldLine++, newLine: null });
      if (current) current.deletions++;
    } else if (raw.startsWith('\\')) {
      // "No newline at end of file" — skip
    } else {
      hunk.lines.push({ type: 'ctx', text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }

  return files;
}

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

function highlight(code, lang) {
  if (!code) return '';
  try {
    if (lang && lang !== 'plaintext') {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
  } catch { /* fallback */ }
  return hljs.highlightAuto(code).value;
}

// ── Line component ────────────────────────────────────────────────────────────

function DiffLine({ line, lang }) {
  const html = useMemo(() => highlight(line.text, lang), [line.text, lang]);

  const rowBg = line.type === 'add'
    ? 'bg-emerald-50/80 dark:bg-emerald-950/30 midnight:bg-emerald-950/30'
    : line.type === 'del'
      ? 'bg-red-50/80 dark:bg-red-950/30 midnight:bg-red-950/30'
      : '';

  const marker = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
  const markerColor = line.type === 'add'
    ? 'text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400'
    : line.type === 'del'
      ? 'text-red-600 dark:text-red-400 midnight:text-red-400'
      : 'text-gray-300 dark:text-slate-700 midnight:text-slate-700';

  return (
    <tr className={`group ${rowBg}`}>
      {/* old line number */}
      <td className="w-10 select-none px-1.5 py-0 text-right font-mono text-[10px] text-gray-300 dark:text-slate-700 midnight:text-slate-700 border-r border-gray-100 dark:border-slate-800 midnight:border-slate-800">
        {line.oldLine ?? ''}
      </td>
      {/* new line number */}
      <td className="w-10 select-none px-1.5 py-0 text-right font-mono text-[10px] text-gray-300 dark:text-slate-700 midnight:text-slate-700 border-r border-gray-100 dark:border-slate-800 midnight:border-slate-800">
        {line.newLine ?? ''}
      </td>
      {/* +/- marker */}
      <td className={`w-5 select-none px-1 py-0 text-center font-mono text-[11px] font-bold ${markerColor}`}>
        {marker}
      </td>
      {/* code */}
      <td className="py-0 px-2 w-full overflow-hidden">
        <code
          className="block font-mono text-[11px] leading-5 whitespace-pre-wrap break-all"
          // eslint-disable-next-line react/no-danger
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
        <td colSpan={4} className="px-3 py-0.5 font-mono text-[10px] text-sky-600 dark:text-sky-400 midnight:text-sky-400 bg-sky-50/60 dark:bg-sky-950/20 midnight:bg-sky-950/20 border-y border-sky-100 dark:border-sky-900/40 midnight:border-sky-900/40">
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
  const files = useMemo(() => parseDiff(diff), [diff]);

  if (!diff || files.length === 0) {
    // Try rendering as a single-file diff (no file header)
    const lines = (diff || '').split('\n');
    const hasHunks = lines.some(l => l.startsWith('@@'));
    if (hasHunks) {
      const syntheticFile = { oldPath: filePath || 'file', newPath: filePath || 'file', hunks: [], additions: 0, deletions: 0 };
      let hunk = null;
      let oldL = 1, newL = 1;
      for (const raw of lines) {
        if (raw.startsWith('@@ ')) {
          const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          if (m) { oldL = parseInt(m[1]); newL = parseInt(m[2]); }
          hunk = { header: raw, lines: [] };
          syntheticFile.hunks.push(hunk);
        } else if (hunk) {
          if (raw.startsWith('+') && !raw.startsWith('+++')) { hunk.lines.push({ type: 'add', text: raw.slice(1), oldLine: null, newLine: newL++ }); syntheticFile.additions++; }
          else if (raw.startsWith('-') && !raw.startsWith('---')) { hunk.lines.push({ type: 'del', text: raw.slice(1), oldLine: oldL++, newLine: null }); syntheticFile.deletions++; }
          else if (!raw.startsWith('\\')) { hunk.lines.push({ type: 'ctx', text: raw.slice(1), oldLine: oldL++, newLine: newL++ }); }
        }
      }
      if (syntheticFile.hunks.length > 0) {
        return <FileDiff key="single" file={syntheticFile} />;
      }
    }
    return <div className={`px-4 py-3 text-xs text-gray-400 midnight:text-slate-500 ${className}`}>No diff available.</div>;
  }

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      {files.map((file, i) => <FileDiff key={i} file={file} />)}
    </div>
  );
}

function FileDiff({ file }) {
  const displayPath = file.newPath || file.oldPath || 'unknown';
  const lang = detectLangFromPath(displayPath);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-800 midnight:border-slate-800 bg-white dark:bg-slate-950 midnight:bg-slate-950">
      {/* file header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-800 midnight:border-slate-800 bg-gray-50 dark:bg-slate-900 midnight:bg-slate-900 px-3 py-1.5">
        <span className="min-w-0 truncate font-mono text-[11px] text-gray-700 dark:text-slate-300 midnight:text-slate-300">{displayPath}</span>
        <div className="flex shrink-0 items-center gap-2 font-mono text-[10px]">
          {file.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400">+{file.additions}</span>}
          {file.deletions > 0 && <span className="text-red-600 dark:text-red-400 midnight:text-red-400">-{file.deletions}</span>}
        </div>
      </div>
      {/* diff table */}
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
    </div>
  );
}
