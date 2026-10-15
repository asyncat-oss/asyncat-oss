// electron/quick.js — The Quick ask window: a small frameless window that
// shows the app's /quick page. It is made on first use, then hidden and shown
// again, so it opens instantly and an answer keeps streaming while it's hidden.
// Size and position rules live in quick-geometry.js.
import { BrowserWindow, nativeTheme, screen, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { FRONTEND_PORT, IS_LINUX, IS_MAC, IS_WIN } from './constants.js';
import { guardNavigation } from './navigation.js';
import {
  QUICK_MIN_HEIGHT, quickBounds, maxQuickHeight, clampQuickHeight, toggleAction,
  shouldHideOnBlur, hiddenTimerAction, normalizeQuickState, normalizeBackground,
} from './quick-geometry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUICK_PRELOAD = path.join(__dirname, 'quick-preload.js');
const TITLE = 'Asyncat Quick ask';
// The page has this long to say it has drawn itself before we give up.
const READY_TIMEOUT_MS = 15000;
// A window hidden this long is closed to free its memory; the next open makes
// a new one. One still streaming an answer is looked at again a minute later.
const DESTROY_AFTER_MS = 15 * 60 * 1000;
const DESTROY_RETRY_MS = 60 * 1000;

let win = null;
let ready = null;          // Promise<boolean>: the page sent quick:ready
let markReady = null;
let getOrigin = null;      // () => Promise<string>, set by initQuick
let state = 'empty';
let shownAt = 0;
let bounds = null;         // where the window is (its top-left stays put)
let destroyTimer = null;
let showing = null;
let destroying = false;

/** `ensureFrontend` returns the app's origin, starting its server if needed. */
export function initQuick({ ensureFrontend }) {
  getOrigin = ensureFrontend;
}

function alive() {
  return win && !win.isDestroyed() ? win : null;
}

function send(channel, payload) {
  const current = alive();
  if (current && !current.webContents.isDestroyed()) current.webContents.send(channel, payload);
}

function createWindow(origin) {
  win = new BrowserWindow({
    title: TITLE,
    width: quickBounds(null).width,
    height: QUICK_MIN_HEIGHT,
    frame: false,
    // Keep it fixed-size: Hyprland floats such windows and takes their new
    // size; a resizable one it tiles and won't let resize itself.
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    // The page draws a rounded card, so the window itself is see-through.
    // Windows has no transparent corners worth having: an opaque window it
    // rounds and shadows itself, coloured like the card (quick:background;
    // until the page says, the dark card is --as-elevated in neko/src/index.css).
    ...(IS_WIN
      ? { transparent: false, backgroundColor: nativeTheme.shouldUseDarkColors ? '#282828' : '#ffffff' }
      : { transparent: true, backgroundColor: '#00000000', hasShadow: IS_MAC }),
    ...(IS_MAC && { type: 'panel' }),
    webPreferences: {
      preload: QUICK_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Keep "Asyncat Quick ask" so window rules can tell it from the main window.
  win.on('page-title-updated', (event) => event.preventDefault());
  // No app menu here: its Ctrl+N and Ctrl+W belong to the page.
  if (!IS_MAC) win.setMenu(null);
  if (IS_MAC) {
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
  guardNavigation(win.webContents, {
    frontendPort: FRONTEND_PORT,
    openExternal: (url) => shell.openExternal(url),
  });

  ready = new Promise((resolve) => { markReady = resolve; });
  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) markReady?.(false); // -3: aborted by a newer load
  });
  win.webContents.on('render-process-gone', () => destroyQuick());

  win.on('blur', () => {
    if (shouldHideOnBlur({ state, shownAt })) hideQuick();
  });
  // Closing (Cmd+W, the window manager) only hides it; destroyQuick closes it.
  win.on('close', (event) => {
    if (destroying) return;
    event.preventDefault();
    hideQuick();
  });
  win.on('closed', () => {
    win = null;
    ready = null;
    markReady = null;
    bounds = null;
    state = 'empty';
  });

  win.loadURL(`${origin}/quick`);
}

function waitForReady() {
  return Promise.race([
    ready,
    new Promise((resolve) => setTimeout(() => resolve(false), READY_TIMEOUT_MS)),
  ]);
}

function position() {
  const current = alive();
  if (!current) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const height = bounds?.height || QUICK_MIN_HEIGHT;
  bounds = quickBounds(display.workArea, height);
  bounds.maxHeight = maxQuickHeight(display.workArea);
  current.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
}

/** Open the window on the display under the pointer and focus the input. */
export function showQuick() {
  if (showing) return showing;
  showing = (async () => {
    clearTimeout(destroyTimer);
    if (!alive()) {
      if (!getOrigin) return false;
      createWindow(await getOrigin());
    }
    if (!(await waitForReady())) {
      console.warn('[Asyncat] Quick ask did not load');
      destroyQuick();
      return false;
    }
    const current = alive();
    if (!current) return false;
    position();
    current.show();
    current.focus();
    shownAt = Date.now();
    send('quick:shown', { maxHeight: bounds?.maxHeight });
    return true;
  })().finally(() => { showing = null; });
  return showing;
}

/** Hide it (an answer keeps streaming); it is closed after a long while. */
export function hideQuick() {
  const current = alive();
  if (!current || !current.isVisible()) return;
  current.hide();
  send('quick:hidden');
  closeWhenIdle(DESTROY_AFTER_MS);
}

function closeWhenIdle(delay) {
  clearTimeout(destroyTimer);
  destroyTimer = setTimeout(() => {
    const current = alive();
    const action = hiddenTimerAction({ exists: Boolean(current), visible: current?.isVisible(), state });
    if (action === 'close') destroyQuick();
    else if (action === 'wait') closeWhenIdle(DESTROY_RETRY_MS);
  }, delay);
}

/** Tray item, shortcut and --quick-ask: hide, focus or show. */
export function toggleQuick() {
  const current = alive();
  const action = toggleAction({
    visible: Boolean(current?.isVisible()),
    focused: Boolean(current?.isFocused()),
    linux: IS_LINUX,
  });
  if (action === 'hide') return hideQuick();
  if (action === 'focus') {
    current.focus();
    return undefined;
  }
  if (action === 'reshow') current.hide();
  return showQuick();
}

export function destroyQuick() {
  clearTimeout(destroyTimer);
  const current = alive();
  if (!current) return;
  destroying = true;
  try { current.destroy(); } finally { destroying = false; }
}

export function isQuickSender(webContents) {
  const current = alive();
  return Boolean(current && webContents && current.webContents === webContents);
}

/** The page drew itself for the first time. */
export function markQuickReady() {
  markReady?.(true);
}

/**
 * The page's card changed height; grow or shrink downward from the top.
 * Wayland desktops ignore the position (Hyprland keeps it centred instead).
 */
export function resizeQuick(height) {
  const current = alive();
  if (!current) return;
  const next = clampQuickHeight(height, bounds?.maxHeight);
  if (bounds && bounds.height === next) return;
  bounds = { ...(bounds || quickBounds(null)), height: next };
  current.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: next });
  if (IS_MAC) current.invalidateShadow();
}

/** 'empty' | 'thread' | 'busy': only an empty popup hides when it loses focus. */
export function setQuickState(next) {
  const value = normalizeQuickState(next);
  if (value) state = value;
}

/** Windows: the opaque window takes the card's colour, so the theme matches. */
export function setQuickBackground(color) {
  const value = normalizeBackground(color);
  if (IS_WIN && value) alive()?.setBackgroundColor(value);
}
