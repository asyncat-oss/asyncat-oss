// Made by agents as a grid: a card per item with its picture (or icon), its
// name and one line of details. A click opens it; "…" has the rest.

import { useState } from 'react';
import PropTypes from 'prop-types';
import Skeleton from '../components/ui/Skeleton.jsx';
import { shortDate } from './fileFormat.js';
import { kindIcon } from './fileIcons.js';
import { Badges, ItemMenu } from './fileParts.jsx';
import { serverUrl } from './storageApi.js';

export function FileTile({ item, desktop, onOpen, onAction }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const Icon = kindIcon(item);
  const title = item.title || item.name || 'Untitled';
  return (
    <div
      role="listitem"
      data-file-tile={item.kind}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-surface transition-colors ${menuOpen ? 'border-line-strong' : 'border-line hover:border-line-strong'}`}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        title={title}
        aria-label={title}
        className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-hover/60 outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
      >
        {item.thumbUrl && !broken ? (
          <img src={serverUrl(item.thumbUrl)} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-7 w-7 text-fg-subtle" strokeWidth={1.5} />
        )}
      </button>
      <div className="flex min-w-0 items-start gap-1 py-2 pl-3 pr-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg">{title}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-fg-subtle">
            <Badges badges={item.badges} />
            <span className="truncate">{[item.kindLabel, item.whereId === 'pictures' ? null : item.where, shortDate(item.modifiedAt)].filter(Boolean).join(' · ')}</span>
          </p>
        </div>
        <span className="relative z-10">
          <ItemMenu item={item} desktop={desktop} onAction={onAction} onOpenChange={setMenuOpen} />
        </span>
      </div>
    </div>
  );
}

FileTile.propTypes = {
  item: PropTypes.object.isRequired,
  desktop: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
};

// Columns by the grid's own width (a container query), not the window's.
const GRID = 'grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5';

/** Grey cards in the grid's places while a place loads. */
export function FileGridSkeleton() {
  return (
    <div className="@container" aria-hidden="true">
      <div className={GRID}>
        {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="aspect-[4/3] rounded-xl" />)}
      </div>
    </div>
  );
}

export default function FileGrid({ items, desktop, onOpen, onAction, label }) {
  return (
    <div className="@container">
      <div role="list" aria-label={label} className={GRID}>
        {items.map((item) => <FileTile key={item.id} item={item} desktop={desktop} onOpen={onOpen} onAction={onAction} />)}
      </div>
    </div>
  );
}

FileGrid.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  desktop: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
  label: PropTypes.string,
};
