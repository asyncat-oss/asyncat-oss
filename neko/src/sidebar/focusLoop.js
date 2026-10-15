// Keeps Tab inside a modal panel (the search palette): Tab from the last
// control goes back to the first, and Shift+Tab from the first to the last,
// so focus never lands on the page underneath.

export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Which of `count` stops Tab moves to from `current` (-1 = none of them); -1 when there are none. */
export function nextStop(count, current, backwards = false) {
  if (!count) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? -1 : 1) + count) % count;
}

/** Handles a Tab keydown for `panel`: moves focus to its next control and stops the browser's own move. */
export function keepTabInside(event, panel, active = globalThis.document?.activeElement) {
  if (event.key !== 'Tab' || !panel) return false;
  const stops = [...panel.querySelectorAll(FOCUSABLE)];
  event.preventDefault();
  const next = nextStop(stops.length, stops.indexOf(active), event.shiftKey);
  if (next >= 0) stops[next].focus();
  return true;
}
