// Interactive parts of answers: tables you can sort, filter and copy, and
// follow-up buttons (a ```followups block) that send the next message.

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, CornerDownRight, Search } from 'lucide-react';
import { filterRows, sortRows, toCsv } from './tableTools.js';
import { FOLLOW_UP_EVENT } from './interactiveEvents.js';

const FILTER_FROM_ROWS = 7;

export function InteractiveTable({ rows, renderCell }) {
  const [sort, setSort] = useState({ column: null, direction: 'asc' });
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const header = rows[0] || [];
  const body = useMemo(() => rows.slice(1), [rows]);
  const shown = useMemo(() => sortRows(filterRows(body, query), sort.column, sort.direction), [body, query, sort]);

  // Ascending, then descending, then back to the answer's own order.
  const sortBy = (column) => setSort((current) => {
    if (current.column !== column) return { column, direction: 'asc' };
    if (current.direction === 'asc') return { column, direction: 'desc' };
    return { column: null, direction: 'asc' };
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(header, shown));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="group/table mb-4 max-w-full overflow-hidden rounded-xl border border-line" data-interactive-table>
      {body.length >= FILTER_FROM_ROWS ? (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter rows"
            aria-label="Filter rows"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
          />
          {query ? <span className="shrink-0 text-[12px] text-fg-subtle">{shown.length} of {body.length}</span> : null}
        </div>
      ) : null}
      <div className="relative overflow-x-auto">
        <button
          type="button"
          onClick={copy}
          title="Copy as CSV"
          aria-label="Copy table as CSV"
          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-surface/80 text-fg-subtle opacity-0 transition-opacity hover:text-fg focus:opacity-100 group-hover/table:opacity-100"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <table className="min-w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line bg-hover">
              {header.map((cell, i) => {
                const active = sort.column === i;
                const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th key={i} className="whitespace-nowrap px-0 py-0 text-left align-top text-[13px] font-semibold leading-6 text-fg" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => sortBy(i)} className="group/sort flex w-full items-center gap-1.5 px-4 py-2 text-left [overflow-wrap:anywhere] hover:bg-selected" title="Sort by this column">
                      <span>{renderCell(cell)}</span>
                      <Icon className={`h-3 w-3 shrink-0 ${active ? 'text-fg' : 'text-fg-subtle opacity-0 group-hover/sort:opacity-100'}`} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-hover">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 align-top leading-6 text-fg [overflow-wrap:anywhere]">{renderCell(cell)}</td>
                ))}
              </tr>
            ))}
            {!shown.length ? (
              <tr><td colSpan={header.length} className="px-4 py-3 text-[13px] text-fg-muted">No rows match.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

InteractiveTable.propTypes = { rows: PropTypes.arrayOf(PropTypes.array).isRequired, renderCell: PropTypes.func.isRequired };

/** Suggestions from a ```followups block; each sends itself as the next message. */
export function FollowUps({ content }) {
  const items = String(content || '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!items.length) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-1.5" data-follow-ups>
      {items.map((text) => (
        <button
          key={text}
          type="button"
          // Bubbles up to the chat it's in, which sends it.
          onClick={(event) => event.currentTarget.dispatchEvent(new CustomEvent(FOLLOW_UP_EVENT, { bubbles: true, detail: { text } }))}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px] text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
        >
          <CornerDownRight className="h-3 w-3" />
          {text}
        </button>
      ))}
    </div>
  );
}

FollowUps.propTypes = { content: PropTypes.string };
