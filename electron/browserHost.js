// electron/browserHost.js
// ─── The built-in browser, owned by the main process ─────────────────────────
// Every browser tab is a WebContentsView owned here, not a <webview> inside
// the chat screen. Tabs keep living while the browser panel is closed, on
// other pages, and with no window open; the panel is only a view onto them:
// it reports where it is on screen and the active tab's view is placed
// there. Tabs that are not on screen wait in a hidden "parking" window, so
// they keep their size and can still be read, clicked and photographed.
//
// The agent drives tabs through browser.command requests from the backend
// (den/src/agent/browserCommandQueue.js, over the host bridge), using the
// Chrome DevTools Protocol (browserCdp.js): accessibility snapshots with
// element refs, and real mouse and keyboard input.

import { app, BaseWindow, WebContentsView, ipcMain, session, dialog, shell, nativeImage } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { BACKEND_PORT, FRONTEND_PORT } from './constants.js';
import {
  STANDARD_PARTITION, INCOGNITO_PREFIX, isAllowedBrowserPartition, isAllowedBrowserUrl,
  isAsyncatInternalUrl, agentRequestBlockReason, windowOpenDecision, viewBoundsFromRect,
  isCatPartition, siteOnList,
} from './browserPolicy.js';
import { PageDriver, withTimeout } from './browserCdp.js';
import { pageText, describeSensitiveAction, approvalKey } from './browserSnapshot.js';
import { parseSavedTabs, readSavedTabsFile, serializeTabs, writeSavedTabsFile } from './browserTabsStore.js';

const PORTS = { frontendPort: FRONTEND_PORT, backendPort: BACKEND_PORT };
const AGENT_EXTRA_PORTS = [
  process.env.LLAMA_SERVER_PORT || 8765,
  process.env.MLX_SERVER_PORT,
  process.env.WHISPER_SERVER_PORT,
  process.env.TTS_SERVER_PORT,
].filter(Boolean).map(Number).filter(Number.isInteger);
const PARKING_SIZE = { width: 1280, height: 800 };
const ISOLATED_WORLD_ID = 1717;
const HANDOVER_MAX_MS = 15 * 60 * 1000;
const AGENT_DRAWN_MS = 3 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let options = {
  getMainWindow: () => null,
};
let parking = null;
const tabs = new Map(); // id → tab, in tab-strip order
let tabSeq = 0;
let activeTabId = null;
let mode = 'incognito';
let modeChosen = false;
let incognitoPartition = null;
let viewport = null; // { bounds } while the panel shows the browser
let lastPanelBounds = null;
let shownTab = null;
let openLinks = 'internal';
let agentPaused = false;
let handover = null; // { id, tabId, message, conversationId, startedAt, expiresAt, resolve, timer }
const agentCurrent = new Map(); // agent owner → tab id it works in
// A Cat's tabs use its own profile and keep to its sites (from its commands).
const ownerSettings = new Map(); // agent owner → { partition, allowedSites }
// Sites the user blocked for every agent (Settings → Privacy & safety); the
// backend sends the list with each agent command.
let agentBlockedSites = [];
const agentQueues = new Map();
let agentBusy = 0; // agent commands running; page dialogs are answered meanwhile
const downloads = [];
const configuredSessions = new Set();
const permissionGrants = new Map();
const wiredWindows = new WeakSet();
let broadcastTimer = null;
let shuttingDown = false;
// Standard tabs are saved here and reopened, asleep, at the next start.
let savedTabsFile = null;
let restoreTabs = true;
let saveTabsTimer = null;
let lastSavedTabs = null;
let lastStandardActiveId = null;
let restoredActiveId = null;

// ─── Sessions ─────────────────────────────────────────────────────────────────

function tabForWebContentsId(id) {
  if (!Number.isInteger(id)) return null;
  for (const tab of tabs.values()) {
    if (tab.wc && !tab.wc.isDestroyed() && tab.wc.id === id) return tab;
  }
  return null;
}

export function setupBrowserSession(partition) {
  if (configuredSessions.has(partition)) return session.fromPartition(partition);
  configuredSessions.add(partition);
  const browserSession = session.fromPartition(partition);
  const quietPermissions = new Set(['fullscreen', 'clipboard-sanitized-write']);
  const promptPermissions = new Set(['media', 'geolocation', 'notifications', 'midiSysex', 'pointerLock']);
  const grants = new Set();
  permissionGrants.set(partition, grants);
  const permissionKey = (origin, permission) => `${origin || 'unknown'}|${permission}`;

  // Frames and requests inside pages (iframes, fetches, redirects) get the
  // same check as the address bar; tabs the agent drives get its stricter one.
  browserSession.webRequest.onBeforeRequest((details, callback) => {
    let blocked = false;
    try {
      const url = new URL(details.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        blocked = isAsyncatInternalUrl(url, PORTS);
        if (!blocked) {
          const tab = tabForWebContentsId(details.webContentsId);
          if (tab?.agent) blocked = Boolean(agentRequestBlockReason(details.url, { ports: PORTS, extraPorts: AGENT_EXTRA_PORTS }));
        }
      }
    } catch { /* not a URL we judge */ }
    callback({ cancel: blocked });
  });

  browserSession.setPermissionCheckHandler((_guest, permission, requestingOrigin) => (
    quietPermissions.has(permission) || grants.has(permissionKey(requestingOrigin, permission))
  ));

  browserSession.setPermissionRequestHandler(async (_guest, permission, callback, details) => {
    if (quietPermissions.has(permission)) {
      callback(true);
      return;
    }
    if (!promptPermissions.has(permission)) {
      callback(false);
      return;
    }
    let host = 'This site';
    let origin = details.requestingUrl || details.securityOrigin || '';
    try {
      const parsed = new URL(origin);
      host = parsed.host || host;
      origin = parsed.origin;
    } catch { /* use generic host */ }
    const parent = options.getMainWindow();
    const result = await dialog.showMessageBox(parent || undefined, {
      type: 'question',
      title: 'Website permission',
      message: `${host} wants permission to use ${permission}.`,
      detail: 'Only allow this if you trust the site and expected the request.',
      buttons: ['Block', 'Allow'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    const granted = result.response === 1;
    if (granted) grants.add(permissionKey(origin, permission));
    callback(granted);
  });

  browserSession.on('will-download', (_event, item) => {
    const id = `download_${randomUUID()}`;
    const update = (state) => {
      const entry = {
        id,
        filename: item.getFilename(),
        url: item.getURL(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: item.getReceivedBytes(),
        savePath: item.getSavePath() || '',
        state,
      };
      const index = downloads.findIndex((d) => d.id === id);
      if (index >= 0) downloads.splice(index, 1);
      downloads.unshift(entry);
      downloads.splice(5);
      scheduleBroadcast();
    };
    update('progressing');
    item.on('updated', (_downloadEvent, state) => update(state));
    item.once('done', (_downloadEvent, state) => update(state));
  });

  return browserSession;
}

/**
 * Tabs the agent opened never show the page's own alert/confirm boxes:
 * Chrome answers them (alert: OK, confirm: Cancel) and the agent is told.
 * A native box for a tab waiting in the hidden window would have no visible
 * parent (on Wayland that ends the app), and nobody would answer it.
 */
function guestPreferences(partition, { agent = false } = {}) {
  return {
    partition,
    disableDialogs: Boolean(agent),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    backgroundThrottling: false,
    navigateOnDragDrop: false,
    spellcheck: true,
    safeDialogs: true,
  };
}

function partitionFor(profile) {
  if (profile !== 'incognito') return STANDARD_PARTITION;
  if (!incognitoPartition) incognitoPartition = `${INCOGNITO_PREFIX}${randomUUID()}`;
  return incognitoPartition;
}

async function clearPartition(partition) {
  if (!isAllowedBrowserPartition(partition)) return;
  const browserSession = setupBrowserSession(partition);
  permissionGrants.get(partition)?.clear();
  await Promise.all([browserSession.clearCache(), browserSession.clearStorageData()]).catch(() => {});
}

// ─── Windows and views ────────────────────────────────────────────────────────

function mainWindow() {
  const win = options.getMainWindow();
  return win && !win.isDestroyed() ? win : null;
}

function ensureParking() {
  if (parking && !parking.isDestroyed()) return parking;
  parking = new BaseWindow({
    show: false,
    width: PARKING_SIZE.width,
    height: PARKING_SIZE.height,
    skipTaskbar: true,
    focusable: false,
    title: 'Asyncat browser',
  });
  parking.on('closed', () => {
    parking = null;
    for (const tab of tabs.values()) if (tab.viewParent && tab.viewParent.isDestroyed?.()) tab.viewParent = null;
  });
  return parking;
}

function detachFromParent(tab) {
  if (tab.view && tab.viewParent && !tab.viewParent.isDestroyed()) {
    try { tab.viewParent.contentView.removeChildView(tab.view); } catch { /* already removed */ }
  }
  tab.viewParent = null;
}

/** Where a tab that is not on screen waits. See placeView. */
function moveView(tab, parent, { visible = true, bounds = null, behind = false } = {}) {
  if (!tab.view) return;
  if (tab.viewParent !== parent || Boolean(tab.behind) !== behind) {
    detachFromParent(tab);
    if (parent) {
      // Index 0 puts a view under the window's own page.
      if (behind) parent.contentView.addChildView(tab.view, 0);
      else parent.contentView.addChildView(tab.view);
      tab.viewParent = parent;
    }
  }
  tab.behind = Boolean(parent) && behind;
  if (bounds) tab.view.setBounds(bounds);
  tab.view.setVisible(visible);
}

function mainWindowUsable(win = mainWindow()) {
  return Boolean(win && win.isVisible());
}

/**
 * Put a tab that is not on screen where it can keep working:
 *  - while the main window is visible, inside it: a tab the agent used in
 *    the last few minutes sits behind the app's own page, where it is still
 *    drawn (so real input and screenshots work); other tabs are hidden there.
 *    Their dialogs then have a real parent window;
 *  - otherwise agent tabs go to the hidden parking window (they never show
 *    dialogs, see guestPreferences; a page there isn't drawn, so the driver
 *    acts through the DOM) and the user's tabs are detached, so an alert from
 *    one of them gets a window of its own.
 */
function placeView(tab) {
  if (!tab?.view || shuttingDown || tab === shownTab) return;
  const win = mainWindow();
  if (mainWindowUsable(win)) {
    wireMainWindow(win);
    if (tab.agent && Date.now() - (tab.lastAgentAt || 0) < AGENT_DRAWN_MS) {
      moveView(tab, win, { visible: true, behind: true, bounds: { x: 0, y: 0, ...PARKING_SIZE } });
    } else {
      const bounds = tab.agent || !lastPanelBounds ? { x: 0, y: 0, ...PARKING_SIZE } : lastPanelBounds;
      moveView(tab, win, { visible: false, bounds });
    }
  } else if (tab.agent) {
    moveView(tab, ensureParking(), { visible: true, bounds: { x: 0, y: 0, ...PARKING_SIZE } });
  } else {
    moveView(tab, null, { visible: true, bounds: lastPanelBounds || { x: 0, y: 0, ...PARKING_SIZE } });
  }
}

/** Is the page being drawn right now? Then real input events work. */
function isDrawn(tab) {
  if (tab.popup) return !tab.popup.isDestroyed() && tab.popup.isVisible() && !tab.popup.isMinimized();
  const win = mainWindow();
  if (!win || !win.isVisible() || win.isMinimized()) return false;
  return tab === shownTab || (tab.viewParent === win && Boolean(tab.behind));
}

// Agent tabs stop being drawn behind the app a while after their last use.
setInterval(() => {
  for (const tab of tabs.values()) {
    if (tab.behind && tab !== shownTab && Date.now() - (tab.lastAgentAt || 0) >= AGENT_DRAWN_MS) placeView(tab);
  }
}, 60_000).unref?.();

/**
 * Before the agent reads or acts on a tab: make sure it sits in a window
 * (a detached page doesn't take mouse or keyboard input).
 */
function readyForAgent(tab) {
  if (!tab?.view || tab.popup) return;
  tab.lastAgentAt = Date.now();
  if (tab.viewParent && (tab === shownTab || tab.behind || !tab.agent || !mainWindowUsable())) return;
  placeView(tab);
  if (!tab.viewParent) {
    throw new Error('That tab belongs to the user and Asyncat\'s window is hidden, so it can\'t be used right now. Open your own tab with preview_navigate instead.');
  }
}

function wireMainWindow(win) {
  if (wiredWindows.has(win)) return;
  wiredWindows.add(win);
  const replaceAll = () => setImmediate(() => {
    if (win.isDestroyed()) return;
    for (const tab of tabs.values()) if (tab !== shownTab) placeView(tab);
  });
  win.on('show', replaceAll);
  win.on('hide', replaceAll);
  // Views would be destroyed with the window: move them out first.
  win.on('close', () => {
    viewport = null;
    shownTab = null;
    for (const tab of tabs.values()) {
      if (tab.viewParent !== win) continue;
      if (tab.agent) moveView(tab, ensureParking(), { visible: true, bounds: { x: 0, y: 0, ...PARKING_SIZE } });
      else moveView(tab, null);
    }
  });
  // A reload of the app's own page drops the panel; its view must go too.
  win.webContents.on('did-start-navigation', (details) => {
    if (details?.isMainFrame && !details.isSameDocument) {
      viewport = null;
      syncShownView();
    }
  });
}

function stripTabs() {
  return [...tabs.values()].filter((tab) => !tab.hidden && (tab.profile === mode || tab.agent || tab.popup || tab.catProfile));
}

function syncShownView() {
  const win = mainWindow();
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  // A reopened tab loads its page the first time it is shown.
  if (viewport && tab?.sleeping) wakeTab(tab);
  const want = viewport && win && tab?.view && tab.url && !tab.crashed && !tab.error && !tab.hidden ? tab : null;
  const previous = shownTab;
  shownTab = want;
  if (previous && previous !== want) placeView(previous);
  if (want) {
    wireMainWindow(win);
    moveView(want, win, { visible: true, bounds: viewport.bounds });
    // On top of any hidden views waiting in the same window.
    try { win.contentView.addChildView(want.view); } catch { /* already on top */ }
  }
  updateAudio();
}

function updateAudio() {
  for (const tab of tabs.values()) {
    if (!tab.wc || tab.wc.isDestroyed() || tab.popup) continue;
    try { tab.wc.setAudioMuted(tab !== shownTab || tab.muted); } catch { /* not ready */ }
  }
}

// ─── State for the panel ──────────────────────────────────────────────────────

function publicTab(tab) {
  return {
    id: tab.id,
    title: tab.title || (tab.url ? tab.url : 'New tab'),
    url: tab.url || '',
    loading: Boolean(tab.loading),
    crashed: Boolean(tab.crashed),
    error: tab.error ? { code: tab.error.code, description: tab.error.description } : null,
    canGoBack: Boolean(tab.canGoBack),
    canGoForward: Boolean(tab.canGoForward),
    profile: tab.profile,
    agent: Boolean(tab.agent),
    popup: Boolean(tab.popup),
    muted: Boolean(tab.muted),
    audible: Boolean(tab.audible),
    sleeping: Boolean(tab.sleeping),
    catProfile: Boolean(tab.catProfile),
    label: tab.label || null,
    lastAgentAt: tab.lastAgentAt || 0,
  };
}

export function browserState() {
  return {
    mode,
    modeChosen,
    activeTabId,
    agentPaused,
    tabs: [...tabs.values()].filter((tab) => !tab.hidden).map(publicTab),
    handover: handover ? { id: handover.id, tabId: handover.tabId, message: handover.message, expiresAt: handover.expiresAt } : null,
    downloads: downloads.map((d) => ({ ...d })),
  };
}

function scheduleBroadcast() {
  if (broadcastTimer || shuttingDown) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const win = mainWindow();
    if (win && !win.webContents.isDestroyed()) win.webContents.send('browser:state', browserState());
    scheduleSaveTabs();
  }, 30);
}

// ─── Saved tabs ───────────────────────────────────────────────────────────────

function saveTabsNow() {
  if (!savedTabsFile || !restoreTabs) return;
  if (tabs.get(activeTabId)?.profile === 'standard') lastStandardActiveId = activeTabId;
  const data = serializeTabs(tabs.values(), tabs.has(lastStandardActiveId) ? lastStandardActiveId : null);
  const key = JSON.stringify({ ...data, savedAt: null });
  if (key === lastSavedTabs) return;
  try {
    writeSavedTabsFile(savedTabsFile, data);
    lastSavedTabs = key;
  } catch (err) {
    console.warn('[Asyncat] Could not save the browser tabs:', err.message);
  }
}

function scheduleSaveTabs() {
  if (shuttingDown || !savedTabsFile) return;
  if (tabs.get(activeTabId)?.profile === 'standard') lastStandardActiveId = activeTabId;
  clearTimeout(saveTabsTimer);
  saveTabsTimer = setTimeout(saveTabsNow, 1000);
  saveTabsTimer.unref?.();
}

/** Reopen the Standard tabs saved at the last quit, asleep (no page yet). */
function restoreSavedTabs() {
  savedTabsFile = path.join(app.getPath('userData'), 'browser-tabs.json');
  const saved = parseSavedTabs(
    readSavedTabsFile(savedTabsFile),
    (url) => isAllowedBrowserUrl(url, { ports: PORTS, allowBlank: false }),
  );
  saved.tabs.forEach((entry, index) => {
    const tab = createTab({ profile: 'standard' });
    tab.url = entry.url;
    tab.title = entry.title || entry.url;
    tab.sleeping = true;
    if (index === saved.activeIndex) restoredActiveId = tab.id;
  });
  if (restoredActiveId) {
    activeTabId = restoredActiveId;
    lastStandardActiveId = restoredActiveId;
  }
  lastSavedTabs = JSON.stringify({ ...serializeTabs(tabs.values(), restoredActiveId), savedAt: null });
}

/** Load a reopened tab's page. */
function wakeTab(tab) {
  if (!tab?.sleeping) return;
  tab.sleeping = false;
  if (!isAllowedBrowserUrl(tab.url, { ports: PORTS, allowBlank: false })) {
    tab.url = '';
    tab.title = 'New tab';
    ensureView(tab);
    return;
  }
  loadUrl(tab, tab.url).catch(() => {});
}

/** Restoring was turned off: close the tabs that never woke and forget them. */
function dropSleepingTabs() {
  for (const tab of [...tabs.values()]) if (tab.sleeping) closeTab(tab.id);
  restoredActiveId = null;
  if (savedTabsFile) {
    try { writeSavedTabsFile(savedTabsFile, serializeTabs([], null)); } catch { /* best effort */ }
  }
}

function sendEvent(event) {
  const win = mainWindow();
  if (win && !win.webContents.isDestroyed()) win.webContents.send('browser:event', event);
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

/** The profile and site list for a tab an agent opens. */
function ownerTabOptions(owner) {
  const settings = owner ? ownerSettings.get(owner) : null;
  return settings ? { partition: settings.partition, allowedSites: settings.allowedSites, label: settings.label } : {};
}

function createTab({ profile = 'standard', agent = false, ownerKey = null, hidden = false, webContents = null, popup = null, openerTabId = null, partition = null, allowedSites = null, label = null } = {}) {
  tabSeq += 1;
  const tab = {
    id: `tab-${tabSeq}`,
    profile: profile === 'incognito' ? 'incognito' : 'standard',
    partition: null,
    agent,
    ownerKey,
    hidden,
    url: '',
    title: '',
    loading: false,
    crashed: false,
    error: null,
    canGoBack: false,
    canGoForward: false,
    muted: false,
    audible: false,
    view: null,
    viewParent: null,
    wc: null,
    popup,
    driver: null,
    openerTabId,
    navCount: 0,
    lastAgentAt: 0,
    createdAt: Date.now(),
  };
  // A Cat's tabs (its agent's, and the one the user signs in with) live in
  // the Cat's own profile.
  tab.partition = partition && isCatPartition(partition) ? partition : partitionFor(tab.profile);
  tab.catProfile = isCatPartition(tab.partition);
  tab.allowedSites = Array.isArray(allowedSites) && allowedSites.length ? allowedSites.map(String) : null;
  tab.label = label ? String(label).slice(0, 80) : null;
  tabs.set(tab.id, tab);
  if (popup) {
    tab.wc = popup.webContents;
    wireWebContents(tab);
  } else if (webContents) {
    ensureView(tab, webContents);
  }
  scheduleBroadcast();
  return tab;
}

function ensureView(tab, existing = null) {
  if (tab.view || tab.popup) return;
  setupBrowserSession(tab.partition);
  const view = existing
    ? new WebContentsView({ webContents: existing })
    : new WebContentsView({ webPreferences: guestPreferences(tab.partition, { agent: tab.agent }) });
  view.setBackgroundColor('#ffffff');
  tab.view = view;
  tab.wc = view.webContents;
  wireWebContents(tab);
  placeView(tab);
}

function refreshNavState(tab) {
  const wc = tab.wc;
  if (!wc || wc.isDestroyed()) return;
  try {
    const history = wc.navigationHistory;
    tab.canGoBack = history ? history.canGoBack() : wc.canGoBack();
    tab.canGoForward = history ? history.canGoForward() : wc.canGoForward();
  } catch { /* not ready */ }
}

function isAgentAllowedNavigation(tab, url) {
  if (!isAllowedBrowserUrl(url, { ports: PORTS, allowHtmlData: tab.allowHtmlData })) return false;
  if (tab.agent && agentRequestBlockReason(url, { ports: PORTS, extraPorts: AGENT_EXTRA_PORTS })) return false;
  // A Cat's own tabs keep to its sites; the user's sign-in tab is free.
  if (tab.agent && tab.allowedSites && /^https?:/i.test(url) && !siteOnList(url, tab.allowedSites)) return false;
  if (tab.agent && agentBlockedSites.length && /^https?:/i.test(url) && siteOnList(url, agentBlockedSites)) return false;
  return true;
}

function refusalText(tab, url) {
  let why = 'Asyncat keeps agents off that address';
  if (tab.allowedSites && !siteOnList(url, tab.allowedSites)) why = "it isn't on this Cat's list of sites";
  else if (agentBlockedSites.length && siteOnList(url, agentBlockedSites)) why = 'the user blocked it for agents in Settings';
  return `Agents may not open ${url}: ${why}`;
}

// Stop a navigation; an agent is told why instead of seeing an empty page.
function refuseNavigation(event, tab, url) {
  event.preventDefault();
  if (tab.agent && /^https?:/i.test(url)) tab.error = { code: 'BLOCKED', description: refusalText(tab, url), url };
}

function wireWebContents(tab) {
  const wc = tab.wc;

  wc.on('did-start-loading', () => {
    tab.loading = true;
    tab.error = null;
    scheduleBroadcast();
  });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    if (!wc.isDestroyed()) {
      const url = wc.getURL();
      if (url && !url.startsWith('about:')) tab.url = url;
      tab.title = wc.getTitle() || tab.title;
      refreshNavState(tab);
      if (!tab.hidden && /^https?:/i.test(url)) {
        sendEvent({ type: 'page-loaded', tabId: tab.id, url, title: tab.title, profile: tab.profile });
      }
    }
    scheduleBroadcast();
  });
  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    tab.error = { code: errorCode, description: errorDescription, url: validatedURL };
    tab.loading = false;
    scheduleBroadcast();
    if (tab === shownTab || activeTabId === tab.id) syncShownView();
  });
  wc.on('did-start-navigation', (details) => {
    if (details?.isMainFrame && !details.isSameDocument) tab.navCount += 1;
  });
  const onNavigate = (_event, url) => {
    if (url && !url.startsWith('about:')) tab.url = url;
    tab.error = null;
    refreshNavState(tab);
    scheduleBroadcast();
  };
  wc.on('did-navigate', (event, url) => {
    tab.driver?.resetRefs();
    onNavigate(event, url);
  });
  wc.on('did-navigate-in-page', (event, url, isMainFrame) => {
    if (isMainFrame) onNavigate(event, url);
  });
  wc.on('page-title-updated', (_event, title) => {
    tab.title = title;
    scheduleBroadcast();
  });
  wc.on('render-process-gone', () => {
    tab.crashed = true;
    tab.loading = false;
    scheduleBroadcast();
    if (tab === shownTab) syncShownView();
  });
  wc.on('media-started-playing', () => { tab.audible = true; scheduleBroadcast(); });
  wc.on('media-paused', () => { tab.audible = false; scheduleBroadcast(); });
  wc.on('enter-html-full-screen', () => sendEvent({ type: 'fullscreen', tabId: tab.id, on: true }));
  wc.on('leave-html-full-screen', () => sendEvent({ type: 'fullscreen', tabId: tab.id, on: false }));
  wc.on('found-in-page', (_event, result) => sendEvent({ type: 'found-in-page', tabId: tab.id, result }));

  wc.on('will-navigate', (event, url) => {
    if (!isAgentAllowedNavigation(tab, url)) refuseNavigation(event, tab, url);
  });
  wc.on('will-redirect', (event, url) => {
    if (!isAgentAllowedNavigation(tab, url)) refuseNavigation(event, tab, url);
  });

  wc.on('before-input-event', (event, input) => {
    if (tab.hidden || tab.popup || input.type !== 'keyDown') return;
    const command = input.control || input.meta;
    const key = String(input.key || '').toLowerCase();
    let shortcut = null;
    if (key === 'f11') shortcut = 'toggle-fullscreen';
    else if (key === 'escape') shortcut = 'exit-fullscreen';
    else if (command && input.shift && key === 't') shortcut = 'reopen-tab';
    else if (command && key === 'l') shortcut = 'focus-location';
    else if (command && key === 't') shortcut = 'new-tab';
    else if (command && key === 'w') shortcut = 'close-tab';
    else if (command && key === 'r') shortcut = 'reload';
    else if (command && key === 'h') shortcut = 'history';
    else if (command && key === 'f') shortcut = 'find';
    if (shortcut) {
      // Let the page receive Escape too (dialogs and native HTML fullscreen
      // rely on it); the panel only acts on it while full screen.
      if (shortcut !== 'exit-fullscreen') event.preventDefault();
      sendEvent({ type: 'shortcut', name: shortcut, tabId: tab.id });
      return;
    }
    if (input.alt && (key === 'left' || key === 'arrowleft')) { event.preventDefault(); goHistory(tab, -1); }
    if (input.alt && (key === 'right' || key === 'arrowright')) { event.preventDefault(); goHistory(tab, 1); }
  });

  wc.setWindowOpenHandler((details) => {
    const decision = windowOpenDecision({
      url: details.url,
      disposition: details.disposition,
      openLinks: tab.agent || tab.hidden ? 'internal' : openLinks,
      ports: PORTS,
    });
    if (decision === 'deny') return { action: 'deny' };
    if (decision === 'external') {
      shell.openExternal(details.url).catch(() => {});
      return { action: 'deny' };
    }
    if (decision === 'popup') {
      const win = mainWindow();
      const visible = !tab.hidden && win?.isVisible();
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: !tab.hidden,
          parent: visible ? win : undefined,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          title: 'Asyncat',
          webPreferences: guestPreferences(tab.partition, { agent: tab.agent }),
        },
      };
    }
    return {
      action: 'allow',
      createWindow: (createOptions) => {
        const child = createTab({
          profile: tab.profile,
          agent: tab.agent,
          ownerKey: tab.ownerKey,
          hidden: tab.hidden,
          webContents: createOptions.webContents,
          openerTabId: tab.id,
          partition: tab.partition,
          allowedSites: tab.allowedSites,
          label: tab.label,
        });
        child.url = details.url === 'about:blank' ? '' : details.url;
        child.title = 'Loading…';
        if (details.url === 'about:blank') child.url = 'about:blank';
        if (!tab.hidden && activeTabId === tab.id && details.disposition !== 'background-tab') {
          activeTabId = child.id;
          syncShownView();
        }
        scheduleBroadcast();
        return child.wc;
      },
    };
  });

  // window.open with features: a real window in the same session, kept in
  // the tab list so the agent can see it and the panel can focus it.
  wc.on('did-create-window', (win) => {
    const popupTab = createTab({ profile: tab.profile, agent: tab.agent, ownerKey: tab.ownerKey, hidden: tab.hidden, popup: win, openerTabId: tab.id, partition: tab.partition, allowedSites: tab.allowedSites, label: tab.label });
    popupTab.title = 'Pop-up';
    try { win.removeMenu(); } catch { /* no menu */ }
    win.on('page-title-updated', (_event, title) => { popupTab.title = title; scheduleBroadcast(); });
    win.once('closed', () => removeTab(popupTab.id));
  });

  wc.on('close', () => {
    // window.close() from a page that a script opened.
    if (tab.openerTabId && !tab.popup) setImmediate(() => closeTab(tab.id));
  });
  wc.once('destroyed', () => removeTab(tab.id));
}

function removeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  tabs.delete(id);
  try { tab.driver?.detach(); } catch { /* gone */ }
  tab.driver = null;
  if (shownTab === tab) shownTab = null;
  detachFromParent(tab);
  for (const [owner, tabId] of agentCurrent) if (tabId === id) agentCurrent.delete(owner);
  if (handover?.tabId === id) finishHandover(handover.id, 'closed');
  if (activeTabId === id) {
    const strip = stripTabs();
    const opener = tab.openerTabId && tabs.get(tab.openerTabId);
    activeTabId = opener && strip.includes(opener) ? opener.id : strip[strip.length - 1]?.id || null;
  }
  if (tab.profile === 'incognito' && ![...tabs.values()].some((t) => t.profile === 'incognito')) {
    const partition = incognitoPartition;
    incognitoPartition = null;
    if (partition) clearPartition(partition);
  }
  syncShownView();
  scheduleBroadcast();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (tab.popup && !tab.popup.isDestroyed()) {
    tab.popup.close();
    return;
  }
  const wc = tab.wc;
  removeTab(id);
  try {
    if (wc && !wc.isDestroyed()) wc.close();
  } catch { /* already closing */ }
}

function loadUrl(tab, url) {
  ensureView(tab);
  tab.url = url;
  tab.title = tab.title && tab.title !== 'New tab' ? tab.title : 'Loading…';
  tab.error = null;
  tab.crashed = false;
  tab.loading = true;
  scheduleBroadcast();
  return tab.wc.loadURL(url);
}

function goHistory(tab, delta) {
  const wc = tab?.wc;
  if (!wc || wc.isDestroyed()) return false;
  const history = wc.navigationHistory;
  if (delta < 0) {
    if (history ? !history.canGoBack() : !wc.canGoBack()) return false;
    if (history) history.goBack(); else wc.goBack();
  } else {
    if (history ? !history.canGoForward() : !wc.canGoForward()) return false;
    if (history) history.goForward(); else wc.goForward();
  }
  return true;
}

function reloadTab(tab) {
  if (!tab) return;
  if (tab.sleeping) {
    wakeTab(tab);
    syncShownView();
    return;
  }
  tab.crashed = false;
  tab.error = null;
  if (!tab.wc || tab.wc.isDestroyed()) return;
  if (tab.url && tab.wc.getURL() !== tab.url && tab.url !== 'about:blank') tab.wc.loadURL(tab.url).catch(() => {});
  else tab.wc.reload();
  syncShownView();
  scheduleBroadcast();
}

function activate(id) {
  if (!tabs.has(id)) return false;
  const tab = tabs.get(id);
  if (tab.popup) {
    if (!tab.popup.isDestroyed()) { tab.popup.show(); tab.popup.focus(); }
    return true;
  }
  activeTabId = id;
  syncShownView();
  scheduleBroadcast();
  return true;
}

function newUserTab(url = '') {
  const tab = createTab({ profile: mode });
  if (url) loadUrl(tab, url).catch(() => {});
  activeTabId = tab.id;
  syncShownView();
  return tab;
}

async function setMode(next) {
  const target = next === 'standard' ? 'standard' : 'incognito';
  modeChosen = true;
  if (target === mode) return;
  if (target === 'incognito') {
    mode = 'incognito';
    const existing = [...tabs.values()].find((tab) => tab.profile === 'incognito' && !tab.hidden && !tab.popup);
    activeTabId = existing ? existing.id : createTab({ profile: 'incognito' }).id;
  } else {
    mode = 'standard';
    for (const tab of [...tabs.values()]) if (tab.profile === 'incognito') closeTab(tab.id);
    const strip = stripTabs().filter((tab) => !tab.popup);
    const back = [lastStandardActiveId, restoredActiveId].map((id) => tabs.get(id)).find((tab) => tab && strip.includes(tab));
    restoredActiveId = null;
    activeTabId = back ? back.id : strip.length ? strip[strip.length - 1].id : createTab({ profile: 'standard' }).id;
  }
  syncShownView();
  scheduleBroadcast();
}

// ─── Small helpers for page work ──────────────────────────────────────────────

function hostOf(url) {
  try { return new URL(url).host; } catch { return ''; }
}

function pageInfo(tab) {
  const wc = tab.wc;
  const live = wc && !wc.isDestroyed();
  const info = {
    tabId: tab.id,
    url: live ? wc.getURL() : tab.url,
    title: live ? wc.getTitle() : tab.title,
  };
  if (live && wc.isLoading()) info.loading = true;
  if (tab.error) info.loadError = `${tab.error.description || 'The page could not be loaded'} (${tab.error.code})`;
  if (tab.crashed) info.crashed = true;
  return info;
}

function driverFor(tab) {
  if (!tab?.wc || tab.wc.isDestroyed()) throw new Error('That tab has no page. Open one with preview_navigate first.');
  if (tab.crashed) throw new Error('The page crashed. Reload it with preview_navigate.');
  readyForAgent(tab);
  if (!tab.driver) tab.driver = new PageDriver(tab.wc.debugger, { shouldAnswerDialogs: () => agentBusy > 0 });
  return tab.driver;
}

async function waitForLoad(tab, timeoutMs = 15000) {
  const wc = tab.wc;
  if (!wc || wc.isDestroyed() || !wc.isLoading()) return { timedOut: false };
  return new Promise((resolve) => {
    let timer = null;
    const finish = (timedOut) => {
      clearTimeout(timer);
      if (!wc.isDestroyed()) wc.removeListener('did-stop-loading', onStop);
      resolve({ timedOut });
    };
    const onStop = () => finish(false);
    wc.on('did-stop-loading', onStop);
    timer = setTimeout(() => finish(true), timeoutMs);
  });
}

async function navigateAndWait(tab, url, timeoutMs = 25000) {
  // will-navigate doesn't fire for loads the agent asks for, so check here.
  if (tab.agent && /^https?:/i.test(String(url)) && !isAgentAllowedNavigation(tab, String(url))) {
    return { ...pageInfo(tab), loadError: refusalText(tab, String(url)) };
  }
  try {
    await withTimeout(loadUrl(tab, url), timeoutMs, 'timeout');
  } catch (err) {
    // ERR_ABORTED: the page sent us elsewhere (a redirect by script); wait
    // for that load instead. Other failures are reported via loadError.
    if (/timeout/.test(String(err?.message))) return { ...pageInfo(tab), note: 'The page is still loading.' };
    await waitForLoad(tab, 10000);
  }
  await sleep(250);
  return pageInfo(tab);
}

/** After a click or key press: wait if it started loading a page. */
async function settleAfterAction(tab, before) {
  await sleep(200);
  const navigated = tab.navCount !== before.navCount;
  if (navigated || tab.wc?.isLoading()) await waitForLoad(tab, 12000);
  if (navigated) await sleep(200);
  const result = { ...pageInfo(tab), navigated };
  const opened = [...tabs.values()].filter((t) => t.openerTabId === tab.id && t.createdAt >= before.at);
  if (opened.length) {
    result.opened = opened.map((t) => ({ tabId: t.id, url: t.url, kind: t.popup ? 'popup window' : 'tab' }));
    result.note = 'The page opened a new tab or window. Use preview_list_tabs and preview_switch_tab to work in it.';
  }
  const dialogs = tab.driver?.takeDialogs() || [];
  if (dialogs.length) result.dialogs = dialogs;
  return result;
}

function actionStart(tab) {
  return { navCount: tab.navCount, at: Date.now() };
}

function markAgent(tab) {
  tab.lastAgentAt = Date.now();
  scheduleBroadcast();
}

export const NOT_ON_SCREEN = 'The page is not on screen (Asyncat\'s window is closed, hidden or minimised), so it can\'t be photographed now. Read it with preview_snapshot instead, or ask the user to open the window.';

async function captureJpeg(tab, params) {
  const driver = driverFor(tab);
  await driver.ensure();
  // Only a page that is being drawn can be photographed. With the panel
  // open, show the tab there (the user then sees what the agent looks at).
  if (!isDrawn(tab) && viewport && !tab.hidden && !tab.popup) {
    activeTabId = tab.id;
    syncShownView();
    scheduleBroadcast();
    await sleep(300);
  }
  const drawn = isDrawn(tab);
  try {
    return await withTimeout(driver.send('Page.captureScreenshot', params), drawn ? 10000 : 4000, 'timeout');
  } catch {
    throw new Error(drawn ? 'The screenshot timed out. Try again in a moment.' : NOT_ON_SCREEN);
  }
}

async function screenshot(tab, { ref, selector, fullPage = false } = {}) {
  const driver = driverFor(tab);
  await driver.ensure();
  const view = await driver.viewport();
  let clip = null;
  if (ref || selector) clip = await driver.elementClip(await driver.resolveTarget({ ref, selector }));
  const params = { format: 'jpeg', quality: 70 };
  if (fullPage && !clip) {
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: view.contentWidth, height: Math.min(view.contentHeight, 12000), scale: 1 };
  }
  const shot = await captureJpeg(tab, params);
  let image = nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64'));
  if (image.isEmpty()) throw new Error('The screenshot came back empty.');
  const size = image.getSize();
  const cssWidth = fullPage && !clip ? view.contentWidth : view.width;
  const ratio = cssWidth > 0 ? size.width / cssWidth : 1;
  if (clip) {
    const x = Math.max(0, Math.floor(clip.x * ratio));
    const y = Math.max(0, Math.floor(clip.y * ratio));
    const width = Math.max(1, Math.min(size.width - x, Math.ceil(clip.width * ratio)));
    const height = Math.max(1, Math.min(size.height - y, Math.ceil(clip.height * ratio)));
    image = image.crop({ x, y, width, height });
  }
  // One image pixel per CSS pixel, and not larger than models take in.
  let { width, height } = image.getSize();
  let scale = ratio > 1.05 ? 1 / ratio : 1;
  scale = Math.min(scale, 1600 / Math.max(1, width), 4000 / Math.max(1, height));
  if (scale < 0.99) {
    image = image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'good' });
    ({ width, height } = image.getSize());
  }
  const jpeg = image.toJPEG(70);
  return { dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`, width, height };
}

/**
 * The page's visible text, or only the text of the elements a CSS selector
 * matches: { text, matches } (matches is null without a selector). With an
 * attribute, that attribute of each element instead, one per line (elements
 * without it are skipped).
 */
async function pageTextOf(tab, selector = null, attribute = null) {
  const wc = tab.wc;
  if (!wc || wc.isDestroyed()) return { text: '', matches: null };
  const code = selector
    ? `(function (sel, attr) {
        var nodes = document.querySelectorAll(sel);
        var parts = [];
        Array.prototype.forEach.call(nodes, function (node) {
          var value = attr ? node.getAttribute(attr) : (node.innerText || node.textContent || '');
          if (value !== null) parts.push(value);
        });
        return { matches: nodes.length, text: parts.join(attr ? '\\n' : '\\n\\n') };
      })(${JSON.stringify(String(selector))}, ${JSON.stringify(attribute ? String(attribute) : null)})`
    : '({ matches: null, text: document.body ? document.body.innerText : document.documentElement ? document.documentElement.innerText : "" })';
  const found = await withTimeout(wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD_ID, [{ code }]), 10000, 'Reading the page timed out');
  return { text: String(found?.text || '').replace(/\n{3,}/g, '\n\n').trim(), matches: found?.matches ?? null };
}

/** The get_text result for a tab: its text (or a selector's), in parts. */
async function readText(tab, payload) {
  const selector = typeof payload.selector === 'string' && payload.selector.trim() ? payload.selector.trim() : null;
  const attribute = selector && typeof payload.attribute === 'string' && payload.attribute.trim() ? payload.attribute.trim() : null;
  const found = await pageTextOf(tab, selector, attribute);
  if (selector && !found.matches) return { success: false, ...pageInfo(tab), error: `Nothing on the page matches ${selector}.` };
  const page = pageText(found.text, { offset: payload.offset, limit: payload.limit || 12000 });
  return {
    success: true,
    ...pageInfo(tab),
    ...(selector ? { selector, matches: found.matches } : {}),
    ...(attribute ? { attribute } : {}),
    text: page.text,
    offset: page.offset,
    nextOffset: page.nextOffset,
    totalChars: page.totalChars,
    truncated: page.truncated,
    ...(page.truncated ? { hint: `More text follows: call preview_get_text with offset ${page.nextOffset}.` } : {}),
  };
}

/**
 * Load a page in a hidden tab of the agent's profile, run read(tab) on it,
 * then close the tab: for preview_get_text and preview_screenshot with a
 * url. The agent's own tab stays where it was, and reads of several pages
 * at once can't mix them up.
 */
async function inHiddenTab(owner, url, read) {
  const tab = createTab({ profile: 'standard', agent: true, ownerKey: owner, hidden: true, ...ownerTabOptions(owner) });
  try {
    const loaded = await navigateAndWait(tab, url, 25000);
    if (loaded.loadError) return { success: false, ...loaded, error: loaded.loadError };
    await waitForLoad(tab, 8000);
    await sleep(1200); // scripts draw the page
    return await read(tab);
  } finally {
    closeTab(tab.id);
  }
}

// ─── Agent commands ───────────────────────────────────────────────────────────

function ownerOf(payload) {
  return String(payload?.owner || 'default').slice(0, 200);
}

/** The tab an agent works in: its own, else the one the user is looking at. */
function agentTab(owner, { create = false } = {}) {
  const currentId = agentCurrent.get(owner);
  const current = currentId ? tabs.get(currentId) : null;
  if (current) return current;
  if (viewport && activeTabId) {
    const visible = tabs.get(activeTabId);
    if (visible?.url) return visible;
  }
  if (!create) return null;
  const tab = createTab({ profile: 'standard', agent: true, ownerKey: owner, ...ownerTabOptions(owner) });
  agentCurrent.set(owner, tab.id);
  return tab;
}

function requireAgentTab(owner) {
  const tab = agentTab(owner);
  if (!tab || !tab.wc) throw new Error('No page is open in the browser. Open one with preview_navigate first.');
  return tab;
}

function listTabs(owner) {
  const current = agentTab(owner);
  return [...tabs.values()].filter((tab) => !tab.hidden).map((tab, index) => ({
    index,
    tabId: tab.id,
    title: tab.title || '',
    url: tab.url || '',
    yours: tab.id === current?.id,
    shownToUser: tab.id === activeTabId && Boolean(viewport),
    openedBy: tab.agent ? 'agent' : 'user',
    kind: tab.popup ? 'popup window' : 'tab',
    profile: tab.profile,
  }));
}

function findListedTab(payload) {
  const listed = [...tabs.values()].filter((tab) => !tab.hidden);
  if (payload.tabId && tabs.has(payload.tabId)) return tabs.get(payload.tabId);
  if (Number.isInteger(payload.index)) return listed[payload.index] || null;
  if (payload.url) return listed.find((tab) => String(tab.url).includes(String(payload.url))) || null;
  return null;
}

function bringWindowForward() {
  const win = mainWindow();
  if (!win) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}

/**
 * Check a click, key press or typing target. Returns null when the action
 * may go ahead, or a needsApproval result that den turns into a question
 * for the user (see previewBrowserTools.js).
 */
async function sensitiveCheck(tab, driver, target, action, approved) {
  const { classification } = await driver.classify(target, action);
  if (!classification) return { blocked: null, classification: null };
  const host = hostOf(tab.wc.getURL());
  const key = approvalKey(classification, { backendNodeId: target.backendNodeId, host });
  if (Array.isArray(approved) && approved.includes(key)) return { blocked: null, classification };
  return {
    classification,
    blocked: {
      success: false,
      needsApproval: true,
      approval: {
        key,
        kind: classification.kind,
        description: describeSensitiveAction(classification, { host, action }),
      },
    },
  };
}

/** Tell the agent when an action went through the DOM instead of real input. */
function inputNote(input) {
  if (input !== 'simulated') return {};
  return { input: 'simulated', inputNote: 'The page is not on screen, so this was done through the page itself rather than with real mouse or keyboard input. If nothing happened, ask the user to open the Browser panel and try again.' };
}

async function doClick(tab, payload) {
  const driver = driverFor(tab);
  const target = await driver.resolveTarget(payload);
  const { blocked, classification } = await sensitiveCheck(tab, driver, target, 'click', payload.approvals);
  if (blocked) return blocked;
  const before = actionStart(tab);
  if (classification?.kind === 'file') {
    // The file picker is the user's to answer: show them the page.
    activeTabId = tab.id;
    syncShownView();
    bringWindowForward();
  }
  const { input } = await driver.click(target, {
    button: payload.button === 'right' ? 'right' : payload.button === 'middle' ? 'middle' : 'left',
    clickCount: payload.double ? 2 : 1,
    rendered: isDrawn(tab),
  });
  return { success: true, ...inputNote(input), ...(await settleAfterAction(tab, before)) };
}

async function doType(tab, payload) {
  const driver = driverFor(tab);
  const target = await driver.resolveTarget(payload);
  const { blocked } = await sensitiveCheck(tab, driver, target, 'type', payload.approvals);
  if (blocked) return blocked;
  const before = actionStart(tab);
  const element = await driver.typeText(target, payload.text, { clear: payload.clear !== false, rendered: isDrawn(tab) });
  if (payload.submit) {
    const { blocked: submitBlocked } = await sensitiveCheck(tab, driver, element, 'key', payload.approvals);
    if (submitBlocked) return submitBlocked;
    await driver.key('Enter', { rendered: isDrawn(tab) });
  }
  const value = await driver.fieldValue(element);
  return { success: true, ...(value !== null && value !== undefined ? { value } : {}), ...(await settleAfterAction(tab, before)) };
}

async function doKey(tab, payload) {
  const driver = driverFor(tab);
  let target = null;
  if (payload.ref || payload.selector) {
    target = await driver.focus(await driver.resolveTarget(payload), { rendered: isDrawn(tab) });
  }
  const key = String(payload.key || '');
  const last = key.split('+').pop().trim().toLowerCase();
  const activates = ['enter', 'return', 'space', ' '].includes(last);
  const types = [...last].length === 1 && last !== ' ';
  if (activates || types) {
    const focused = target || await driver.focusedTarget().catch(() => null);
    if (focused) {
      const { blocked } = await sensitiveCheck(tab, driver, focused, types ? 'type' : 'key', payload.approvals);
      if (blocked) return blocked;
    }
  }
  const before = actionStart(tab);
  const { input } = await driver.key(key, { repeat: payload.repeat, rendered: isDrawn(tab) });
  return { success: true, ...inputNote(input), ...(await settleAfterAction(tab, before)) };
}

async function runAgentCommand(owner, payload) {
  const action = String(payload.action || '');
  if (agentPaused && action !== 'list_tabs') {
    throw new Error('The user paused browser control. Ask them to press Resume in the browser panel, or carry on without the browser.');
  }

  switch (action) {
    case 'list_tabs':
      return { success: true, tabs: listTabs(owner) };

    case 'open_tab': {
      const tab = createTab({ profile: 'standard', agent: true, ownerKey: owner, ...ownerTabOptions(owner) });
      agentCurrent.set(owner, tab.id);
      activeTabId = tab.id;
      syncShownView();
      markAgent(tab);
      if (!payload.url) return { success: true, tabId: tab.id, url: '' };
      return { success: true, ...(await navigateAndWait(tab, payload.url)) };
    }

    case 'switch_tab': {
      const tab = findListedTab(payload);
      if (!tab) throw new Error('No tab matches. Use preview_list_tabs to see the open tabs.');
      if (tab.sleeping) {
        wakeTab(tab);
        await waitForLoad(tab, 15000);
      }
      agentCurrent.set(owner, tab.id);
      if (tab.popup) {
        if (!tab.popup.isDestroyed()) tab.popup.showInactive();
      } else {
        activeTabId = tab.id;
        syncShownView();
      }
      markAgent(tab);
      return { success: true, ...pageInfo(tab) };
    }

    case 'close_tab': {
      const tab = payload.index !== undefined || payload.tabId || payload.url ? findListedTab(payload) : agentTab(owner);
      if (!tab) throw new Error('No tab matches. Use preview_list_tabs to see the open tabs.');
      if (!tab.agent) throw new Error('That tab was opened by the user, so it stays open.');
      closeTab(tab.id);
      return { success: true, closed: tab.id };
    }

    case 'navigate': {
      // The agent's own tab (or one it switched to); never the page the user
      // happens to be reading.
      let tab = agentCurrent.has(owner) ? tabs.get(agentCurrent.get(owner)) : null;
      if (!tab) {
        tab = createTab({ profile: 'standard', agent: true, ownerKey: owner, ...ownerTabOptions(owner) });
        agentCurrent.set(owner, tab.id);
      }
      if (!tab.hidden) {
        activeTabId = tab.id;
        syncShownView();
      }
      markAgent(tab);
      return { success: true, ...(await navigateAndWait(tab, payload.url)) };
    }

    case 'back':
    case 'forward': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      const before = actionStart(tab);
      if (!goHistory(tab, action === 'back' ? -1 : 1)) {
        return { success: false, error: `There is no page to go ${action} to.` };
      }
      return { success: true, ...(await settleAfterAction(tab, before)) };
    }

    case 'reload': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      reloadTab(tab);
      await sleep(200);
      await waitForLoad(tab, 20000);
      return { success: true, ...pageInfo(tab) };
    }

    case 'wait_for_load': {
      const tab = requireAgentTab(owner);
      const { timedOut } = await waitForLoad(tab, Math.min(Number(payload.timeoutMs) || 15000, 30000));
      return { success: true, ...pageInfo(tab), ...(timedOut ? { note: 'Still loading after the wait.' } : {}) };
    }

    case 'wait_for_reload': {
      const tab = requireAgentTab(owner);
      const wc = tab.wc;
      await new Promise((resolve) => {
        const timer = setTimeout(done, 30000);
        function done() {
          clearTimeout(timer);
          if (!wc.isDestroyed()) wc.removeListener('did-stop-loading', done);
          resolve();
        }
        wc.on('did-stop-loading', done);
      });
      return { success: true, ...pageInfo(tab) };
    }

    case 'snapshot': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      await waitForLoad(tab, 8000);
      const driver = driverFor(tab);
      const snapshot = await withTimeout(driver.snapshot({
        offset: Number(payload.offset) || 0,
        limit: Number(payload.limit) || 400,
        maxChars: 12000,
      }), 20000, 'Reading the page took too long.');
      return {
        success: true,
        ...pageInfo(tab),
        snapshot: snapshot.text,
        offset: snapshot.offset,
        nextOffset: snapshot.nextOffset,
        totalLines: snapshot.totalLines,
        truncated: snapshot.truncated,
        ...(snapshot.truncated ? { hint: `More of the page follows: call preview_snapshot with offset ${snapshot.nextOffset}.` } : {}),
      };
    }

    case 'get_text': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      await waitForLoad(tab, 8000);
      return readText(tab, payload);
    }

    case 'screenshot': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      const shot = await screenshot(tab, { ref: payload.ref, selector: payload.selector, fullPage: Boolean(payload.fullPage) });
      return { success: true, ...pageInfo(tab), ...shot, format: 'image/jpeg' };
    }

    case 'read_page':
      return inHiddenTab(owner, payload.url, (tab) => readText(tab, payload));

    case 'screenshot_url':
      return inHiddenTab(owner, payload.url, async (tab) => {
        const shot = await screenshot(tab, { selector: payload.selector, fullPage: Boolean(payload.fullPage) });
        return { success: true, ...pageInfo(tab), ...shot, format: 'image/jpeg' };
      });

    case 'click': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      return doClick(tab, payload);
    }

    case 'hover': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      const driver = driverFor(tab);
      const { input } = await driver.hover(await driver.resolveTarget(payload), { rendered: isDrawn(tab) });
      if (input === 'simulated') {
        await sleep(250);
        return { success: true, ...inputNote(input), ...pageInfo(tab) };
      }
      await sleep(250);
      return { success: true, ...pageInfo(tab) };
    }

    case 'type': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      return doType(tab, payload);
    }

    case 'press_key': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      return doKey(tab, payload);
    }

    case 'select_option': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      const driver = driverFor(tab);
      const target = await driver.resolveTarget(payload);
      const values = (Array.isArray(payload.values) ? payload.values : [payload.values]).filter((v) => v !== undefined && v !== null).map(String);
      if (!values.length) throw new Error('Say which option to choose (its label or value).');
      const before = actionStart(tab);
      const selected = await driver.selectOption(target, values);
      return { success: true, selected, ...(await settleAfterAction(tab, before)) };
    }

    case 'scroll': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      const driver = driverFor(tab);
      let position;
      if (payload.ref || payload.selector) {
        position = await driver.scrollTo(await driver.resolveTarget(payload));
      } else {
        const amount = Math.max(1, Math.min(Number(payload.amount) || 600, 10000));
        const sign = payload.direction === 'up' || payload.direction === 'left' ? -1 : 1;
        const horizontal = payload.direction === 'left' || payload.direction === 'right';
        const onScreen = isDrawn(tab);
        position = await driver.wheel(horizontal ? { deltaX: sign * amount, onScreen } : { deltaY: sign * amount, onScreen });
      }
      return {
        success: true,
        scrollY: Math.round(position.scrollY),
        scrollX: Math.round(position.scrollX),
        pageHeight: Math.round(position.contentHeight),
        viewportHeight: Math.round(position.height),
      };
    }

    case 'evaluate': {
      const tab = requireAgentTab(owner);
      markAgent(tab);
      const result = await withTimeout(tab.wc.executeJavaScript(String(payload.code || ''), true), 15000, 'The script took too long.');
      let text;
      try { text = JSON.stringify(result); } catch { text = String(result); }
      return { success: true, result: text === undefined ? 'undefined' : String(text).slice(0, 4000) };
    }

    case 'handover_start': {
      const result = startHandover(owner, payload);
      const tab = tabs.get(result.tabId);
      if (tab) tab.lastHandoverId = result.handoverId;
      return result;
    }

    case 'handover_wait':
      return waitForHandover(String(payload.handoverId || ''));

    default:
      throw new Error(`Unknown browser action: ${action}`);
  }
}

/** Run agent commands one at a time per agent, in the order they arrive. */
export function handleAgentCommand(payload = {}) {
  const owner = ownerOf(payload);
  if (Array.isArray(payload.blockedSites)) agentBlockedSites = payload.blockedSites.map(String).filter(Boolean).slice(0, 200);
  if (payload.partition && isCatPartition(payload.partition)) {
    ownerSettings.set(owner, {
      partition: payload.partition,
      allowedSites: Array.isArray(payload.allowedSites) ? payload.allowedSites.map(String).slice(0, 50) : [],
      label: typeof payload.catName === 'string' ? payload.catName : null,
    });
  }
  const previous = agentQueues.get(owner) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    agentBusy += 1;
    try {
      return await runAgentCommand(owner, payload);
    } finally {
      agentBusy -= 1;
    }
  });
  agentQueues.set(owner, next);
  next.finally(() => { if (agentQueues.get(owner) === next) agentQueues.delete(owner); }).catch(() => {});
  return next;
}

// ─── Handing the page to the user ─────────────────────────────────────────────
// For sign-ins, captchas and two-factor codes: the agent shows the page and
// waits until the user presses Continue in the panel. Two steps, so den can
// send a desktop notification when no window is on screen.

const handoverResults = new Map(); // id → promise of 'done' | 'cancelled' | 'closed' | 'timeout'

function finishHandover(id, outcome) {
  if (!handover || handover.id !== id) return false;
  const current = handover;
  handover = null;
  clearTimeout(current.timer);
  current.resolve(outcome);
  scheduleBroadcast();
  sendEvent({ type: 'handover', handover: null });
  return true;
}

function startHandover(owner, payload) {
  const tab = agentTab(owner);
  if (!tab?.wc) throw new Error('Open the page first (preview_navigate), then hand it over.');
  if (handover) throw new Error('Asyncat is already waiting for the user on another page. Wait for that first.');
  if (tab.hidden) tab.hidden = false;
  const timeoutMs = Math.max(30_000, Math.min(Number(payload.timeoutMs) || 5 * 60 * 1000, HANDOVER_MAX_MS));
  const message = String(payload.message || 'Finish this step in the browser, then press Continue.').slice(0, 400);
  const conversationId = typeof payload.conversationId === 'string' && /^[\w-]{1,100}$/.test(payload.conversationId) ? payload.conversationId : null;
  const route = conversationId ? `/conversations/${conversationId}` : null;
  const id = randomUUID();

  const outcome = new Promise((resolve) => {
    handover = {
      id,
      tabId: tab.id,
      message,
      conversationId,
      startedAt: Date.now(),
      expiresAt: Date.now() + timeoutMs,
      resolve,
      timer: setTimeout(() => finishHandover(id, 'timeout'), timeoutMs),
    };
  });
  handoverResults.set(id, outcome);
  const publicHandover = { id, tabId: tab.id, message, expiresAt: handover.expiresAt };

  if (tab.popup) {
    if (!tab.popup.isDestroyed()) { tab.popup.show(); tab.popup.focus(); }
  } else {
    activeTabId = tab.id;
    syncShownView();
  }
  markAgent(tab);
  scheduleBroadcast();

  const win = mainWindow();
  const windowVisible = Boolean(win && win.isVisible() && !win.isMinimized());
  if (windowVisible) bringWindowForward();
  if (win) {
    // Show the chat this is about, with its browser panel open on the page.
    if (route) win.webContents.send('app:navigate', route);
    sendEvent({ type: 'handover', handover: publicHandover });
  }
  return { success: true, handoverId: id, tabId: tab.id, windowVisible, route };
}

async function waitForHandover(id) {
  const outcome = handoverResults.get(id);
  if (!outcome) throw new Error('That hand-over is not waiting any more.');
  const result = await outcome;
  handoverResults.delete(id);
  const tabId = [...tabs.values()].find((t) => t.lastHandoverId === id)?.id;
  const info = tabId ? pageInfo(tabs.get(tabId)) : {};
  if (result === 'done') return { success: true, outcome: 'done', ...info, note: 'The user says they finished. Take a new preview_snapshot before going on.' };
  if (result === 'cancelled') return { success: false, outcome: 'cancelled', error: 'The user chose not to do this step.', ...info };
  if (result === 'closed') return { success: false, outcome: 'closed', error: 'The tab was closed before the user finished.' };
  return { success: false, outcome: 'timeout', error: 'The user did not press Continue in time.', ...info };
}

// ─── IPC from the panel ───────────────────────────────────────────────────────

function fromMainWindow(event) {
  const win = mainWindow();
  return Boolean(win && event.sender === win.webContents);
}

async function handleUi(action, payload = {}) {
  const tab = payload.tabId ? tabs.get(payload.tabId) : null;
  switch (action) {
    case 'init': {
      if (payload.openLinks === 'system' || payload.openLinks === 'internal') openLinks = payload.openLinks;
      if (payload.restoreTabs === false && restoreTabs) {
        restoreTabs = false;
        dropSleepingTabs();
      } else if (payload.restoreTabs === true) {
        restoreTabs = true;
      }
      if (!modeChosen && (payload.mode === 'standard' || payload.mode === 'incognito')) {
        mode = payload.mode;
        modeChosen = true;
      }
      if (!stripTabs().some((t) => !t.popup)) activeTabId = createTab({ profile: mode }).id;
      else if (!activeTabId || !tabs.has(activeTabId)) activeTabId = stripTabs()[0]?.id || null;
      scheduleBroadcast();
      return browserState();
    }
    case 'set-open-links':
      if (payload.openLinks === 'system' || payload.openLinks === 'internal') openLinks = payload.openLinks;
      return true;
    case 'open-cat-profile': {
      // The user's own tab in a Cat's profile, to sign in to sites for it.
      if (!isCatPartition(payload.partition)) return false;
      const url = String(payload.url || '');
      const tab = createTab({ profile: 'standard', partition: payload.partition, label: payload.label || 'Cat' });
      if (url && isAllowedBrowserUrl(url, { ports: PORTS, allowBlank: false })) loadUrl(tab, url).catch(() => {});
      else ensureView(tab);
      activeTabId = tab.id;
      syncShownView();
      scheduleBroadcast();
      return tab.id;
    }
    case 'set-restore-tabs':
      if (payload.restoreTabs === false) {
        restoreTabs = false;
        dropSleepingTabs();
      } else {
        restoreTabs = true;
        lastSavedTabs = null;
        saveTabsNow();
      }
      return restoreTabs;
    case 'new-tab':
      return newUserTab(payload.url && isAllowedBrowserUrl(payload.url, { ports: PORTS, allowHtmlData: true }) ? payload.url : '').id;
    case 'close-tab':
      if (tab) closeTab(tab.id);
      return true;
    case 'activate':
      return tab ? activate(tab.id) : false;
    case 'navigate': {
      if (!tab || tab.popup) return false;
      const url = String(payload.url || '');
      if (!isAllowedBrowserUrl(url, { ports: PORTS, allowBlank: false, allowHtmlData: true })) return false;
      tab.allowHtmlData = /^data:text\/html/i.test(url);
      loadUrl(tab, url).catch(() => {});
      syncShownView();
      return true;
    }
    case 'open': {
      // A link or preview from the chat: show that tab, or open the address.
      if (payload.tabId && tabs.has(payload.tabId)) return activate(payload.tabId);
      const url = String(payload.url || '');
      if (!isAllowedBrowserUrl(url, { ports: PORTS, allowBlank: false, allowHtmlData: true })) return false;
      const strip = stripTabs();
      const existing = strip.find((t) => t.url === url);
      if (existing) return activate(existing.id);
      const active = activeTabId ? tabs.get(activeTabId) : null;
      const target = active && !active.url && !active.popup && active.profile === mode ? active : createTab({ profile: mode });
      target.allowHtmlData = /^data:text\/html/i.test(url);
      loadUrl(target, url).catch(() => {});
      activeTabId = target.id;
      syncShownView();
      scheduleBroadcast();
      return true;
    }
    case 'back':
      return goHistory(tab, -1);
    case 'forward':
      return goHistory(tab, 1);
    case 'reload':
      reloadTab(tab);
      return true;
    case 'stop':
      if (tab?.wc && !tab.wc.isDestroyed()) tab.wc.stop();
      return true;
    case 'set-mode':
      await setMode(payload.mode);
      return browserState();
    case 'find':
      if (!tab?.wc || tab.wc.isDestroyed()) return false;
      if (!payload.text) {
        tab.wc.stopFindInPage('clearSelection');
        return true;
      }
      tab.wc.findInPage(String(payload.text), { forward: payload.forward !== false, findNext: Boolean(payload.findNext) });
      return true;
    case 'stop-find':
      if (tab?.wc && !tab.wc.isDestroyed()) tab.wc.stopFindInPage('clearSelection');
      return true;
    case 'mute':
      if (tab) {
        tab.muted = Boolean(payload.muted);
        updateAudio();
        scheduleBroadcast();
      }
      return true;
    case 'devtools':
      if (tab?.wc && !tab.wc.isDestroyed()) tab.wc.openDevTools({ mode: 'detach' });
      return true;
    case 'page-text': {
      if (!tab?.wc) return '';
      const { text } = await pageTextOf(tab).catch(() => ({ text: '' }));
      return text.slice(0, 4000);
    }
    case 'capture': {
      if (!tab?.wc || tab.wc.isDestroyed() || tab !== shownTab) return null;
      const image = await withTimeout(tab.wc.capturePage(), 4000, 'timeout').catch(() => null);
      return image && !image.isEmpty() ? image.toDataURL() : null;
    }
    case 'exit-fullscreen':
      if (tab?.wc && !tab.wc.isDestroyed()) tab.wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {});
      return true;
    case 'pause-agent':
      agentPaused = Boolean(payload.paused);
      scheduleBroadcast();
      return agentPaused;
    case 'handover-done':
      return finishHandover(payload.id, payload.outcome === 'cancelled' ? 'cancelled' : 'done');
    case 'clear-downloads':
      downloads.splice(0);
      scheduleBroadcast();
      return true;
    default:
      return false;
  }
}

function registerIpc() {
  ipcMain.handle('browser:get-state', (event) => (fromMainWindow(event) ? browserState() : null));

  ipcMain.handle('browser:set-viewport', async (event, payload = {}) => {
    if (!fromMainWindow(event)) return null;
    const win = mainWindow();
    let frozen = null;
    if (!payload.rect) {
      // Something in the app covers the panel (a menu or dialog): keep a
      // still picture in its place while the page itself steps aside.
      if (payload.freeze && shownTab?.wc && !shownTab.wc.isDestroyed()) {
        const image = await withTimeout(shownTab.wc.capturePage(), 1500, 'timeout').catch(() => null);
        if (image && !image.isEmpty()) frozen = image.toJPEG(82).toString('base64');
      }
      viewport = null;
    } else {
      const bounds = viewBoundsFromRect(payload.rect, win?.webContents.getZoomFactor() || 1);
      viewport = bounds ? { bounds } : null;
      if (bounds) lastPanelBounds = bounds;
    }
    syncShownView();
    return frozen ? { frozen: `data:image/jpeg;base64,${frozen}` } : { frozen: null };
  });

  ipcMain.handle('browser:ui', async (event, action, payload) => {
    if (!fromMainWindow(event)) return null;
    try {
      return await handleUi(String(action || ''), payload && typeof payload === 'object' ? payload : {});
    } catch (err) {
      console.warn(`[Asyncat] Browser ${action} failed:`, err.message);
      return null;
    }
  });

  ipcMain.handle('browser:clear-data', async (event, payload = {}) => {
    if (!fromMainWindow(event)) return false;
    let partitions;
    if (payload.partition) {
      if (!isAllowedBrowserPartition(payload.partition)) return false;
      partitions = [payload.partition];
    } else if (payload.profile === 'persistent') {
      partitions = [STANDARD_PARTITION];
    } else {
      partitions = [...configuredSessions].filter((partition) => partition === 'asyncat-web-private' || partition.startsWith(INCOGNITO_PREFIX));
    }
    await Promise.all(partitions.map(clearPartition));
    return true;
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupBrowserHost(setupOptions = {}) {
  options = { ...options, ...setupOptions };
  setupBrowserSession(STANDARD_PARTITION);
  registerIpc();
  try {
    restoreSavedTabs();
  } catch (err) {
    console.warn('[Asyncat] Could not reopen the browser tabs:', err.message);
  }

  // The app no longer embeds <webview>; refuse any that a page tries to add.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  // The hidden parking window would keep the app alive after the last real
  // window closes, so do that check here.
  app.on('browser-window-created', (_event, win) => {
    win.once('closed', () => setImmediate(() => {
      if (shuttingDown) return;
      const others = BaseWindow.getAllWindows().filter((w) => w !== parking && !w.isDestroyed());
      // Same as Electron's own event, which the hidden window would block.
      if (others.length === 0 && parking) app.emit('window-all-closed');
    }));
  });
}

/**
 * "Delete everything": close every tab and forget all browsing data (the
 * standard profile, every Cat's profile, private tabs) and the saved tabs.
 */
export async function forgetAllBrowsing() {
  clearTimeout(saveTabsTimer);
  for (const tab of [...tabs.values()]) closeTab(tab.id);
  ownerSettings.clear();
  const partitions = new Set([STANDARD_PARTITION, ...configuredSessions]);
  // Cat profiles that weren't opened this time still have folders on disk.
  try {
    for (const name of fs.readdirSync(path.join(app.getPath('userData'), 'Partitions'))) {
      const partition = `persist:${name}`;
      if (isCatPartition(partition)) partitions.add(partition);
    }
  } catch { /* no partitions yet */ }
  await Promise.all([...partitions].filter(isAllowedBrowserPartition).map(clearPartition));
  if (savedTabsFile) {
    try { fs.rmSync(savedTabsFile, { force: true }); } catch { /* gone */ }
    lastSavedTabs = null;
  }
  return { success: true, partitions: partitions.size };
}

/** Close a Cat's tabs and forget its sign-ins (the Cat was deleted). */
export async function clearCatBrowserData(payload = {}) {
  const partition = String(payload.partition || '');
  if (!isCatPartition(partition)) return { success: false, error: 'Not a Cat profile.' };
  for (const tab of [...tabs.values()]) if (tab.partition === partition) closeTab(tab.id);
  for (const [owner, settings] of ownerSettings) if (settings.partition === partition) ownerSettings.delete(owner);
  await clearPartition(partition);
  return { success: true };
}

export function shutdownBrowserHost() {
  // Before the tabs close below, which would otherwise be saved as none.
  clearTimeout(saveTabsTimer);
  saveTabsNow();
  shuttingDown = true;
  if (handover) finishHandover(handover.id, 'closed');
  for (const tab of [...tabs.values()]) {
    try {
      tab.driver?.detach();
      if (tab.popup && !tab.popup.isDestroyed()) tab.popup.destroy();
      else if (tab.wc && !tab.wc.isDestroyed()) tab.wc.close();
    } catch { /* closing anyway */ }
  }
  tabs.clear();
  if (parking && !parking.isDestroyed()) parking.destroy();
  parking = null;
}
