// electron/quick-geometry.js — Size, position and show/hide rules for the
// Quick ask window (quick.js).
//
// No Electron imports, so it can be unit-tested with plain node.

export const QUICK_WIDTH = 680;
export const QUICK_MIN_HEIGHT = 56;
export const QUICK_MAX_HEIGHT = 560;
// The top edge sits this far down the work area; the window grows downward
// from there, so the input never moves while an answer streams in.
export const QUICK_TOP_RATIO = 0.22;
// Space kept free between the window and the screen's edges.
const EDGE = 16;
// Focus-follows-mouse desktops can blur a window right as it appears.
export const BLUR_GRACE_MS = 250;

const STATES = new Set(['empty', 'thread', 'busy']);

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** The tallest the window may be on this work area (never more than 560). */
export function maxQuickHeight(workArea) {
  const height = finite(workArea?.height, QUICK_MAX_HEIGHT);
  const top = Math.round(height * QUICK_TOP_RATIO);
  return Math.max(QUICK_MIN_HEIGHT, Math.min(QUICK_MAX_HEIGHT, height - top - EDGE));
}

/** The height the renderer asked for, rounded and kept within the limits. */
export function clampQuickHeight(height, max = QUICK_MAX_HEIGHT) {
  const wanted = Math.ceil(finite(height, QUICK_MIN_HEIGHT));
  const ceiling = Math.max(QUICK_MIN_HEIGHT, finite(max, QUICK_MAX_HEIGHT));
  return Math.min(ceiling, Math.max(QUICK_MIN_HEIGHT, wanted));
}

/**
 * Where the window goes on a display: centred horizontally, its top edge 22%
 * down the work area. Narrow screens get a narrower window.
 */
export function quickBounds(workArea, height = QUICK_MIN_HEIGHT) {
  const area = {
    x: finite(workArea?.x, 0),
    y: finite(workArea?.y, 0),
    width: finite(workArea?.width, QUICK_WIDTH + EDGE * 2),
    height: finite(workArea?.height, 800),
  };
  const width = Math.max(320, Math.min(QUICK_WIDTH, area.width - EDGE * 2));
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: area.y + Math.round(area.height * QUICK_TOP_RATIO),
    width,
    height: clampQuickHeight(height, maxQuickHeight(area)),
  };
}

/**
 * What the shortcut or tray item does: hide it, focus it, or show it.
 * On Linux an unfocused popup may sit on another workspace, where focusing
 * it shows nothing (Wayland won't let an app raise itself), so it is shown
 * again instead ('reshow'), which brings it to the workspace in use.
 */
export function toggleAction({ visible = false, focused = false, linux = false } = {}) {
  if (visible && focused) return 'hide';
  if (visible) return linux ? 'reshow' : 'focus';
  return 'show';
}

/** Only an empty popup closes when it loses focus; a chat stays until Esc. */
export function shouldHideOnBlur({ state, shownAt = 0, now = Date.now() } = {}) {
  return state === 'empty' && now - shownAt >= BLUR_GRACE_MS;
}

/**
 * What the timer does once the popup has been hidden a long while: close it
 * to free its memory, or 'wait' and look again while an answer still streams.
 * Nothing when it is showing again (or already closed).
 */
export function hiddenTimerAction({ exists = false, visible = false, state = 'empty' } = {}) {
  if (!exists || visible) return null;
  return state === 'busy' ? 'wait' : 'close';
}

/** The renderer's state, or null for anything else. */
export function normalizeQuickState(value) {
  return STATES.has(value) ? value : null;
}

/** A #rrggbb colour for the window background (Windows), or null. */
export function normalizeBackground(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : null;
}
