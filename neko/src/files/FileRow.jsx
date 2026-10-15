// A Files listing as rows: a column header (Name, Kind, Where, Size,
// Modified) and one row per item. A click or Enter opens the item; its "…"
// shows on hover or focus. The columns follow the list's own width (a
// container query), not the window's: on a narrow list the details and
// badges drop to a second line, and Kind and Where show only when there is room.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { formatBytes, metaLine, shortDate } from './fileFormat.js';
import { Badges, ItemMenu, ItemThumb } from './fileParts.jsx';

const COLUMNS = 'grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-x-3 @md:grid-cols-[minmax(0,1fr)_4rem_4.5rem_1.75rem] @2xl:grid-cols-[minmax(0,1fr)_6.5rem_8rem_4rem_4.5rem_1.75rem]';
const CELL = 'truncate text-[12px] tabular-nums text-fg-subtle';

export function FileRow({ item, desktop, onOpen, onAction }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const title = item.title || item.name || 'Untitled';
  // Where the Kind column (or the details line) already says "Unfinished",
  // the same badge would only take the name's room.
  const badges = item.badges || [];
  const otherBadges = badges.filter((badge) => badge.label !== item.kindLabel);
  return (
    <div
      role="listitem"
      data-file-row={item.id}
      className={`group relative grid ${COLUMNS} min-h-10 rounded-lg px-3 py-1.5 transition-colors @md:h-10 @md:py-0 ${menuOpen ? 'bg-selected' : 'hover:bg-hover'}`}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        title={item.path || title}
        className="flex min-w-0 items-center gap-2.5 text-left outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
      >
        <ItemThumb item={item} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] text-fg">{title}</span>
            <span className="hidden @md:contents @2xl:hidden"><Badges badges={badges} /></span>
            <span className="hidden @2xl:contents"><Badges badges={otherBadges} /></span>
          </span>
          {/* A narrow list: badges join the details, so the name keeps its room. */}
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] tabular-nums text-fg-subtle @md:hidden">
            <Badges badges={otherBadges} />
            <span className="truncate">{metaLine(item)}</span>
          </span>
        </span>
      </button>
      <span className={`hidden @2xl:block ${CELL}`}>{item.kindLabel}</span>
      <span className={`hidden @2xl:block ${CELL}`} title={item.where}>{item.where}</span>
      <span className={`hidden text-right @md:block ${CELL}`}>{formatBytes(item.bytes)}</span>
      <span className={`hidden text-right @md:block ${CELL}`}>{shortDate(item.modifiedAt)}</span>
      <span className="relative z-10 flex justify-end">
        <ItemMenu item={item} desktop={desktop} onAction={onAction} onOpenChange={setMenuOpen} />
      </span>
    </div>
  );
}

FileRow.propTypes = {
  item: PropTypes.object.isRequired,
  desktop: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
};

/** Rows under a column header that only labels (sorting is the Sort menu's job). */
export default function FileList({ items, desktop, onOpen, onAction, label }) {
  return (
    <div className="@container">
      <div aria-hidden="true" className={`hidden px-3 pb-1 text-[11px] text-fg-subtle @md:grid ${COLUMNS}`}>
        <span>Name</span>
        <span className="hidden @2xl:block">Kind</span>
        <span className="hidden @2xl:block">Where</span>
        <span className="text-right">Size</span>
        <span className="text-right">Modified</span>
        <span />
      </div>
      <div role="list" aria-label={label} className="space-y-px">
        {items.map((item) => <FileRow key={item.id} item={item} desktop={desktop} onOpen={onOpen} onAction={onAction} />)}
      </div>
    </div>
  );
}

FileList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  desktop: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
  label: PropTypes.string,
};
