// Keeping Tab inside a full-screen viewer: which of its focusable items gets
// focus next, or -1 to let the browser move focus as usual.

/**
 * `count` focusable items, focus on item `index` (-1 when focus is outside
 * them), Tab pressed (`backwards` with Shift). Wraps from the last item to
 * the first and back, and brings focus back in from outside.
 */
export function wrapFocusIndex(count, index, backwards = false) {
  if (count <= 0) return -1;
  if (index < 0) return backwards ? count - 1 : 0;
  if (backwards && index === 0) return count - 1;
  if (!backwards && index === count - 1) return 0;
  return -1;
}
