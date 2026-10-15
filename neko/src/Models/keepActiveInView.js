// Keeps the chosen item of a switch that scrolls sideways (tabs or segments)
// in view on narrow screens, so the one that is on is never the one cut off.

/**
 * How far to scroll a track so an item shows whole, from their screen rects
 * ({ left, right }). Negative scrolls left; 0 means it already shows. An item
 * wider than the track lines up with its left edge.
 */
export function scrollToShow(track, item, margin = 0) {
  if (item.left - margin < track.left) return item.left - margin - track.left;
  if (item.right + margin > track.right) return Math.min(item.right + margin - track.right, item.left - margin - track.left);
  return 0;
}

// Room left beside the chosen item, clear of the row's edge fade (edgeFade.js).
const FADE_ROOM = 24;

/**
 * Scrolls the switch inside `container` sideways until its selected item
 * shows. Only that track moves, never the page.
 */
export function keepActiveInView(container) {
  const item = container?.querySelector('[aria-selected="true"], [aria-checked="true"]');
  const track = item?.parentElement;
  if (!track || track.scrollWidth <= track.clientWidth) return;
  const delta = scrollToShow(track.getBoundingClientRect(), item.getBoundingClientRect(), FADE_ROOM);
  if (delta) track.scrollLeft += delta;
}
