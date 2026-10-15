// Keeps the chosen item of a switch that scrolls sideways (tabs or segments)
// in view on narrow screens, so the one that is on is never the one cut off.

/**
 * How far to scroll a track so an item shows whole, from their screen rects
 * ({ left, right }). Negative scrolls left; 0 means it already shows. An item
 * wider than the track lines up with its left edge.
 */
export function scrollToShow(track, item) {
  if (item.left < track.left) return item.left - track.left;
  if (item.right > track.right) return Math.min(item.right - track.right, item.left - track.left);
  return 0;
}

/**
 * Scrolls the switch inside `container` sideways until its selected item
 * shows. Only that track moves, never the page.
 */
export function keepActiveInView(container) {
  const item = container?.querySelector('[aria-selected="true"], [aria-checked="true"]');
  const track = item?.parentElement;
  if (!track || track.scrollWidth <= track.clientWidth) return;
  const delta = scrollToShow(track.getBoundingClientRect(), item.getBoundingClientRect());
  if (delta) track.scrollLeft += delta;
}
