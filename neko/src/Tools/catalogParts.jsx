// Pieces the Tools and Skills tabs share: the list beside its inspector,
// the grouped rows, the inspector's sections, and the light Markdown that
// tool and skill descriptions use.

import { Fragment, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { inlineTokens, parseMarkdownBlocks, plainText } from './markdownBlocks.js';

/**
 * Toolbar and list on the left, the open item on the right. Below xl the
 * list takes the whole height, and an item someone opened (`opened`) takes
 * its place, with a way back (`onBack`): a strip under the list left the
 * list one row tall in a smaller window.
 */
export function ListWithInspector({ toolbar, list, inspector, label, opened = false, onBack = null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
      <section className={`${opened ? 'hidden xl:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col`} aria-label={label}>
        <div className="shrink-0 space-y-2 px-4 pb-3 pt-4 sm:px-6 lg:px-8">{toolbar}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8">{list}</div>
      </section>
      <aside className={`${opened ? 'flex' : 'hidden xl:flex'} min-h-0 flex-1 flex-col xl:w-[400px] xl:flex-none xl:border-l xl:border-line`} data-inspector>
        {onBack ? (
          <div className="shrink-0 border-b border-line px-2 py-1.5 sm:px-4 xl:hidden">
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>{label ? `All ${label.toLowerCase()}` : 'Back'}</Button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">{inspector}</div>
      </aside>
    </div>
  );
}

ListWithInspector.propTypes = {
  toolbar: PropTypes.node,
  list: PropTypes.node,
  inspector: PropTypes.node,
  label: PropTypes.string,
  opened: PropTypes.bool,
  onBack: PropTypes.func,
};

/** A group heading with its count, then its rows in one bordered box. */
export function CatalogGroup({ title, count, hint, children }) {
  return (
    <section className="mt-5 first:mt-1" aria-label={title}>
      <div className="mb-1.5 flex min-w-0 items-baseline gap-2 px-1">
        <h3 className="shrink-0 text-[13px] font-semibold text-fg">{title}</h3>
        <span className="text-[12px] tabular-nums text-fg-subtle">{count}</span>
        {hint ? <span className="min-w-0 truncate text-[12px] text-fg-subtle">· {hint}</span> : null}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">{children}</div>
    </section>
  );
}

CatalogGroup.propTypes = {
  title: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
  hint: PropTypes.string,
  children: PropTypes.node,
};

/** One row of a group: a name with small badges, then a line of description. */
export function CatalogRow({ name, mono = false, badges = null, description, meta = null, selected, onSelect }) {
  const ref = useRef(null);
  // A row opened from elsewhere (a new skill, a filter) scrolls into view.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`block w-full px-3.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${selected ? 'bg-selected' : 'hover:bg-hover'}`}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`min-w-0 truncate text-[13px] font-medium text-fg ${mono ? 'font-mono' : ''}`}>{name}</span>
        {badges}
      </span>
      <span className="mt-0.5 block truncate text-[12px] leading-5 text-fg-muted">{plainText(description) || 'No description'}</span>
      {meta ? <span className="block truncate text-[11px] leading-4 text-fg-subtle">{meta}</span> : null}
    </button>
  );
}

CatalogRow.propTypes = {
  name: PropTypes.string.isRequired,
  mono: PropTypes.bool,
  badges: PropTypes.node,
  description: PropTypes.string,
  meta: PropTypes.node,
  selected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
};

/** A tag: smaller and quieter than a Badge, outlined instead of filled. */
export function TagChip({ children }) {
  return <span className="inline-flex items-center rounded-md border border-line px-1.5 py-px text-[11px] leading-4 text-fg-muted">{children}</span>;
}

TagChip.propTypes = { children: PropTypes.node };

/** Grey rows while the list loads. */
export function ListSkeleton() {
  return (
    <div className="mt-1 space-y-2" aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <div className="divide-y divide-line rounded-xl border border-line">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-2 px-3.5 py-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A labelled part of the inspector, below a line. */
export function InspectorSection({ title, children }) {
  return (
    <section className="mt-5 border-t border-line pt-4">
      <h3 className="mb-2 text-[12px] font-medium text-fg-subtle">{title}</h3>
      {children}
    </section>
  );
}

InspectorSection.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node };

/** What the inspector says with nothing open. */
export function InspectorEmpty({ children }) {
  return <p className="flex h-full min-h-[200px] items-center justify-center px-6 text-center text-[13px] text-fg-subtle">{children}</p>;
}

InspectorEmpty.propTypes = { children: PropTypes.node };

function Inline({ text }) {
  return inlineTokens(text).map((token, index) => {
    if (token.type === 'code') return <code key={index} className="rounded bg-hover px-1 py-0.5 font-mono text-[0.92em] text-fg">{token.text}</code>;
    if (token.type === 'strong') return <strong key={index} className="font-semibold text-fg">{token.text}</strong>;
    return <Fragment key={index}>{token.text}</Fragment>;
  });
}

/** A description or a skill's steps, drawn from its light Markdown. */
export function MarkdownPanel({ content, emptyText = 'No description' }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content || ''), [content]);
  if (!blocks.length) return <p className="text-[13px] leading-6 text-fg-subtle">{emptyText}</p>;

  return (
    <div className="space-y-2.5 text-[13px] leading-6 text-fg-muted">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Heading = block.depth === 1 ? 'h4' : 'h5';
          return (
            <Heading key={index} className={`font-semibold text-fg ${block.depth === 1 ? 'pt-1 text-[14px]' : 'pt-2 text-[13px]'}`}>
              <Inline text={block.text} />
            </Heading>
          );
        }
        if (block.type === 'numbered') {
          return (
            <div key={index} className="flex gap-2.5">
              <span className="w-4 shrink-0 text-right tabular-nums text-fg-subtle">{block.number}.</span>
              <p className="min-w-0"><Inline text={block.text} /></p>
            </div>
          );
        }
        if (block.type === 'bullet') {
          return (
            <div key={index} className="flex gap-2.5">
              <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
              <p className="min-w-0"><Inline text={block.text} /></p>
            </div>
          );
        }
        return <p key={index} className="min-w-0"><Inline text={block.text} /></p>;
      })}
    </div>
  );
}

MarkdownPanel.propTypes = { content: PropTypes.string, emptyText: PropTypes.string };
