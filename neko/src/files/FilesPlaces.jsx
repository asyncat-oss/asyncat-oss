// The places in Files and how much room Asyncat takes. On wide screens a
// column with the disk summary on top and each place's size; on narrow
// ones a one-line summary and the places in a row that scrolls sideways.

import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Skeleton from '../components/ui/Skeleton.jsx';
import { formatBytes, PLACES } from './fileFormat.js';
import { PLACE_ICONS } from './fileIcons.js';

function sizeOf(summary, id) {
  return summary?.places?.find((place) => place.id === id) || null;
}

function PlaceSize({ size }) {
  if (!size || size.bytes === null || size.bytes === undefined) return <Skeleton className="h-3 w-10" />;
  const text = formatBytes(size.bytes);
  return size.partial
    ? <span title="Still counting">{text}+</span>
    : <span>{text}</span>;
}

PlaceSize.propTypes = { size: PropTypes.object };

/** "Asyncat uses 23.4 GB", a bar of the disk, and what is free. */
export function DiskSummary({ summary, compact = false }) {
  const disk = summary?.disk;
  const known = summary && !summary.error && summary.places?.some((place) => place.bytes !== null);
  const partial = summary?.places?.some((place) => place.partial || place.bytes === null);
  const uses = known ? `Asyncat uses ${formatBytes(summary.appBytes)}${partial ? '+' : ''}` : null;
  const free = disk?.totalBytes ? `${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}` : null;

  if (compact) {
    return (
      <p className="flex min-h-5 items-center gap-1.5 text-[12px] tabular-nums text-fg-muted" data-disk-summary>
        {uses || <Skeleton className="h-3 w-32" />}
        {uses && disk?.totalBytes ? <span className="text-fg-subtle">· {formatBytes(disk.freeBytes)} free</span> : null}
      </p>
    );
  }

  const total = disk?.totalBytes || 0;
  const used = total ? Math.max(0, total - (disk.freeBytes || 0)) : 0;
  const app = Math.min(used, summary?.appBytes || 0);
  const percent = (bytes) => `${total ? Math.max(0, Math.min(100, (bytes / total) * 100)) : 0}%`;
  return (
    <div className="space-y-2 px-2.5" data-disk-summary>
      <p className="text-[13px] font-medium text-fg" title={partial ? 'Still counting' : undefined}>{uses || <Skeleton className="h-4 w-36" />}</p>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-hover"
        role="img"
        aria-label={total ? `${formatBytes(app)} used by Asyncat, ${formatBytes(used - app)} by everything else, ${formatBytes(disk.freeBytes)} free` : 'Disk use'}
      >
        <div className="h-full bg-accent" style={{ width: percent(app) }} />
        <div className="h-full bg-line-strong" style={{ width: percent(used - app) }} />
      </div>
      <p className="text-[12px] tabular-nums text-fg-subtle">{free || ' '}</p>
    </div>
  );
}

DiskSummary.propTypes = { summary: PropTypes.object, compact: PropTypes.bool };

/** The places column (wide screens). */
export default function FilesPlaces({ summary, current, onPick }) {
  return (
    <nav aria-label="Places" className="space-y-px">
      {PLACES.map((place) => {
        const Icon = PLACE_ICONS[place.id];
        const selected = place.id === current;
        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onPick(place.id)}
            aria-current={selected ? 'page' : undefined}
            data-place={place.id}
            className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected ? 'bg-selected font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate">{place.label}</span>
            <span className="shrink-0 text-[12px] font-normal tabular-nums text-fg-subtle">
              <PlaceSize size={sizeOf(summary, place.id)} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}

FilesPlaces.propTypes = { summary: PropTypes.object, current: PropTypes.string, onPick: PropTypes.func.isRequired };

/** The places as a row that scrolls sideways (narrow screens), the current one in view. */
export function PlacesRow({ current, onPick }) {
  const navRef = useRef(null);
  useEffect(() => {
    const nav = navRef.current;
    const button = nav?.querySelector('[aria-current="page"]');
    if (!nav || !button) return;
    const left = button.offsetLeft - nav.offsetLeft;
    const right = left + button.offsetWidth;
    // Scrolls the row only (scrollIntoView would move the page too).
    if (left < nav.scrollLeft + 24 || right > nav.scrollLeft + nav.clientWidth - 24) {
      nav.scrollLeft = Math.max(0, left - (nav.clientWidth - button.offsetWidth) / 2);
    }
  }, [current]);
  // A thin scrollbar: on Linux the desktop app otherwise draws a thick one
  // with arrows. The page's scrollbar-color is reset, as it would switch these
  // styles off.
  return (
    <nav
      ref={navRef}
      aria-label="Places"
      className="-mx-6 flex gap-1 overflow-x-auto px-6 pb-3 [scrollbar-color:auto] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line-strong [&::-webkit-scrollbar]:h-1"
    >
      {PLACES.map((place) => {
        const Icon = PLACE_ICONS[place.id];
        const selected = place.id === current;
        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onPick(place.id)}
            aria-current={selected ? 'page' : undefined}
            className={`flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected ? 'bg-selected font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
            {place.label}
          </button>
        );
      })}
    </nav>
  );
}

PlacesRow.propTypes = { current: PropTypes.string, onPick: PropTypes.func.isRequired };
