// Shared plumbing for panels that float over the page (Menu, Select,
// Combobox, Popover) and for dialogs: where to put a panel next to its anchor
// and keeping it there while it is open, and a stack of open layers so
// Escape and outside clicks reach only the top one.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const GAP = 6;
export const EDGE = 8;
/** A panel already open on one side moves to the other only when less room than this is left there (a search field and two rows). */
export const MIN_ROOM = 120;

const OPPOSITE = { top: 'bottom', bottom: 'top' };

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function currentViewport() {
  return typeof window === 'undefined'
    ? { width: Infinity, height: Infinity }
    : { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Where to put a panel next to its anchor. `anchor` and `panel` are
 * DOMRect-like ({ left, top, right, bottom, width, height }); `placement` is
 * bottom-start, bottom-end, top-start, top-end, right-start or right-end.
 *
 * A bottom panel that doesn't fit below the anchor opens above it when there
 * is more room there, and a top one does the reverse. The result stays inside
 * the viewport and never covers the anchor: `maxHeight` is the room on the
 * chosen side, so a long panel scrolls instead.
 *
 * `keepSide` is for a panel that is already open on the side `placement`
 * names: it stays there, getting shorter if it must, so a list that shrinks
 * as you type doesn't jump across its anchor. It moves only when that side
 * has less room than the panel needs and than MIN_ROOM.
 *
 * Returns { left, top, placement, maxHeight }.
 */
export function placeFloating(anchor, panel, placement = 'bottom-start', viewport = currentViewport(), { keepSide = false } = {}) {
  const { width: vw, height: vh } = viewport;
  const [wanted, align = 'start'] = String(placement).split('-');
  const room = { top: anchor.top - GAP - EDGE, bottom: vh - anchor.bottom - GAP - EDGE };

  let side = wanted;
  const other = OPPOSITE[side];
  const needed = keepSide ? Math.min(panel.height, MIN_ROOM) : panel.height;
  if (other && needed > room[side] && room[other] > room[side]) side = other;

  if (side === 'right') {
    const maxHeight = vh - EDGE * 2;
    const height = Math.min(panel.height, maxHeight);
    const top = align === 'end' ? anchor.bottom - height : anchor.top;
    return {
      left: clamp(anchor.right + GAP, EDGE, vw - panel.width - EDGE),
      top: clamp(top, EDGE, vh - height - EDGE),
      placement: `right-${align}`,
      maxHeight: Math.max(0, Math.floor(maxHeight)),
    };
  }

  const maxHeight = Math.max(0, Math.floor(room[side]));
  const height = Math.min(panel.height, maxHeight);
  const left = align === 'end' ? anchor.right - panel.width : anchor.left;
  const top = side === 'top' ? anchor.top - GAP - height : anchor.bottom + GAP;
  return {
    left: clamp(left, EDGE, vw - panel.width - EDGE),
    top: clamp(top, EDGE, vh - height - EDGE),
    placement: `${side}-${align}`,
    maxHeight,
  };
}

// ── Layers ──────────────────────────────────────────────────────────────────
// Every open floating panel and dialog is a layer, newest last. Escape and
// outside clicks belong to the top layer only, so Escape in a Select inside a
// Dialog closes the Select and leaves the Dialog open.

const layers = [];

/** Adds a layer ({ contains(node) }) on top; returns a function that removes it. */
export function openLayer(layer) {
  layers.push(layer);
  return () => {
    const index = layers.indexOf(layer);
    if (index !== -1) layers.splice(index, 1);
  };
}

export function isTopLayer(layer) {
  return layers.length > 0 && layers[layers.length - 1] === layer;
}

/** True when `node` is inside a layer opened after `layer` (a Select's list over a Popover, say). */
export function insideLayerAbove(layer, node) {
  const index = layers.indexOf(layer);
  if (index === -1) return false;
  return layers.slice(index + 1).some((above) => above.contains?.(node));
}

/**
 * Whether a mousedown on an overlay's backdrop closes it: only a press on the
 * backdrop itself, and only while the overlay is the top layer. With a Select
 * open in a Dialog, that press closes just the Select (through useDismiss),
 * as the native <select> did, so nothing typed in the Dialog is lost.
 */
export function backdropCloses(event, layer) {
  return event.target === event.currentTarget && isTopLayer(layer);
}

/**
 * Registers a layer while `enabled`. `containsRef` points at the layer's
 * element, so clicks inside it don't count as outside clicks for the layers
 * underneath. Returns a ref to the layer, for isTopLayer().
 */
export function useLayer(enabled, containsRef) {
  const layerRef = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const layer = { contains: (node) => Boolean(containsRef?.current?.contains(node)) };
    layerRef.current = layer;
    const close = openLayer(layer);
    return () => {
      close();
      if (layerRef.current === layer) layerRef.current = null;
    };
  }, [enabled, containsRef]);
  return layerRef;
}

/** True when scrolling `scroller` (an element, or the document) moves `anchor`. */
export function scrollMovesAnchor(scroller, anchor) {
  if (!scroller || !anchor) return true;
  if (scroller.nodeType === 9 || scroller === globalThis.window) return true;
  return scroller !== anchor && Boolean(scroller.contains?.(anchor));
}

/**
 * Closes a floating panel on Escape (and gives focus back to the anchor), on a
 * click outside the panel and its anchor, on a scroll that moves the anchor,
 * and on a window resize.
 *
 *   useDismiss(panelRef, anchorRef, () => setOpen(false), open);
 */
export function useDismiss(panelRef, anchorRef, onClose, enabled = true) {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const layerRef = useLayer(enabled, panelRef);

  useEffect(() => {
    if (!enabled) return undefined;
    const close = () => onCloseRef.current?.();
    const inside = (node) => (
      panelRef.current?.contains(node) || insideLayerAbove(layerRef.current, node)
    );
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || !isTopLayer(layerRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      anchorRef.current?.focus?.({ preventScroll: true });
    };
    const onPointerDown = (event) => {
      if (inside(event.target) || anchorRef.current?.contains(event.target)) return;
      close();
    };
    const onScroll = (event) => {
      // Only scrolls that move the anchor: a text field scrolling its own
      // text back on blur, or an unrelated list, leaves the panel in place.
      if (inside(event.target)) return;
      if (scrollMovesAnchor(event.target, anchorRef.current)) close();
    };
    // Capture phase, so Escape reaches the top panel before anything under it.
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, enabled, layerRef, panelRef]);
}

/** Panels sit at z-[250], above dialogs (z-[200]). */
export const PANEL_Z = 250;

/**
 * The z-index a panel needs to show above everything its anchor sits in.
 * Some older overlays (a full-screen artifact, say) sit far above dialogs,
 * so a panel opened inside one goes one above the highest z-index among the
 * anchor's ancestors. `zIndexOf(node)` reads one node's z-index (a number,
 * or NaN for auto).
 */
export function panelZIndex(anchor, zIndexOf) {
  let highest = PANEL_Z - 1;
  for (let node = anchor; node; node = node.parentElement) {
    const z = zIndexOf(node);
    if (Number.isFinite(z) && z > highest) highest = z;
  }
  return highest + 1;
}

function computedZIndex(node) {
  return node.nodeType === 1 ? Number.parseInt(getComputedStyle(node).zIndex, 10) : Number.NaN;
}

/**
 * Places a panel that may already be open. `opened` is the `opened` this
 * returned last time, or null when the panel has just opened: the side it
 * opened on is kept (placeFloating's keepSide). With `holdHeight`, a panel
 * above its anchor also stays as tall as it has been, so a search field at
 * its top stays still while the list under it gets shorter.
 *
 * Returns { position, opened }; `position` is placeFloating's result plus the
 * `minHeight` the panel keeps (0 for none).
 */
export function placeOpenPanel(anchor, panel, opened, { placement = 'bottom-start', holdHeight = false } = {}, viewport = currentViewport()) {
  const kept = opened?.placement || null;
  const held = holdHeight && kept?.startsWith('top') ? opened.height : 0;
  const height = Math.max(panel.height, held);
  const position = placeFloating(anchor, { width: panel.width, height }, kept || placement, viewport, { keepSide: Boolean(kept) });
  const above = position.placement.startsWith('top');
  const shown = Math.min(height, position.maxHeight);
  return {
    position: { ...position, minHeight: holdHeight && above ? shown : 0 },
    opened: { placement: position.placement, height: above ? Math.max(held, shown) : 0 },
  };
}

/** The panel's natural size at `width`, without the max-height or min-height it was given last time. */
function measurePanel(panel, width) {
  const { style } = panel;
  const saved = [style.maxHeight, style.minHeight, style.width];
  style.maxHeight = '';
  style.minHeight = '';
  if (width) style.width = `${width}px`;
  // Layout sizes, which an opening animation's transform doesn't scale.
  const size = { width: panel.offsetWidth, height: panel.offsetHeight };
  [style.maxHeight, style.minHeight, style.width] = saved;
  return size;
}

const POSITION_KEYS = ['left', 'top', 'placement', 'maxHeight', 'minHeight', 'width', 'zIndex'];

/**
 * Where the panel goes while `open` (see placeOpenPanel), with its z-index
 * and width, or null until it has been measured.
 *
 *   useFloatingPosition(anchorRef, panelRef, open, { placement, measureKey, minWidth, holdHeight, keepSideWhile })
 *
 * Change `measureKey` when the panel's content changes size (a filtered list,
 * say) to place it again before it paints. `minWidth` makes the panel as wide
 * as its anchor and never narrower than that. While open, the panel follows
 * its anchor: when the page moves or resizes the anchor (a dialog growing
 * around it, rows loading above it) or the panel changes size, it is placed
 * again on the next frame.
 *
 * The side the panel opened on is remembered while `keepSideWhile` is true
 * (by default, while it is open). Combobox passes its own open state, so a
 * list hidden while nothing matches comes back on the same side.
 */
export function useFloatingPosition(anchorRef, panelRef, open, { placement = 'bottom-start', measureKey = null, minWidth = null, holdHeight = false, keepSideWhile = open } = {}) {
  const [position, setPosition] = useState(null);
  // What placeOpenPanel remembers between calls; forgotten once keepSideWhile is false.
  const openedRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) {
      if (!keepSideWhile) openedRef.current = null;
      setPosition(null);
      return undefined;
    }
    let seen = null;
    const snapshot = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor?.isConnected || !panel) return null;
      const { left, top, width, height } = anchor.getBoundingClientRect();
      return [left, top, width, height, panel.offsetWidth, panel.offsetHeight];
    };
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor?.isConnected || !panel) return;
      const anchorRect = anchor.getBoundingClientRect();
      const width = minWidth === null ? null : Math.max(minWidth, anchorRect.width);
      const next = placeOpenPanel(anchorRect, measurePanel(panel, width), openedRef.current, { placement, holdHeight });
      openedRef.current = next.opened;
      const value = { ...next.position, width, zIndex: panelZIndex(anchor, computedZIndex) };
      setPosition((current) => (current && POSITION_KEYS.every((key) => current[key] === value[key]) ? current : value));
      seen = snapshot();
    };
    place();
    let frame = requestAnimationFrame(function follow() {
      const now = snapshot();
      if (now && !(seen && now.every((value, index) => Math.abs(value - seen[index]) < 0.5))) place();
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorRef, panelRef, open, placement, measureKey, minWidth, holdHeight, keepSideWhile]);
  return position;
}

/**
 * The inline style for a panel at `position`: fixed, hidden until measured,
 * and no taller than `maxHeight` or the room on its side. A width measured
 * from the anchor wins over `width`.
 */
export function floatingStyle(position, { width, maxHeight } = {}) {
  const room = position?.maxHeight;
  const limit = maxHeight && room ? Math.min(maxHeight, room) : (room || maxHeight);
  const panelWidth = position?.width || width;
  const minHeight = position?.minHeight && limit ? Math.min(position.minHeight, limit) : position?.minHeight;
  return {
    position: 'fixed',
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    visibility: position ? 'visible' : 'hidden',
    ...(position?.zIndex > PANEL_Z ? { zIndex: position.zIndex } : null),
    ...(panelWidth ? { width: panelWidth } : null),
    ...(limit ? { maxHeight: limit } : null),
    ...(minHeight ? { minHeight } : null),
  };
}
