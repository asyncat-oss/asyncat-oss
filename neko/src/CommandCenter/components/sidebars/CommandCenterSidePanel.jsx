/* eslint-disable react/prop-types */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Activity, Code2, Image, X, History, BookMarked, Globe, RotateCcw, ExternalLink, AlertTriangle, WifiOff, FilePlus, ArrowLeft, ArrowRight, List, Bug, Camera, Plus, Search, Sparkles, Lock, ShieldAlert, FileText, MoreHorizontal, Copy, Download, Volume2, VolumeX, Trash2, Ghost, Maximize2, Minimize2 } from 'lucide-react';
import eventBus from '../../../utils/eventBus.js';
import AgentActivitySidebar from '../agent/AgentActivitySidebar';
import ChatSourcesMediaSidebar from './ChatSourcesMediaSidebar';
import HistoryPanel from './HistoryPanel';
import ArtifactCard from '../renderers/ArtifactRenderer';
import CodePanel from './CodePanel';
import { useUiPreferences } from '../../../contexts/UiPreferencesContext.jsx';

const panelMeta = {
  steps: { label: 'Steps', icon: Activity },
  code: { label: 'Code', icon: Code2 },
  media: { label: 'Media', icon: Image },
  history: { label: 'History', icon: History },
  saved: { label: 'Saved', icon: BookMarked },
  preview: { label: 'Web', icon: Globe },
  artifacts: { label: 'Artifacts', icon: FilePlus },
  artifact: { label: 'Artifact', icon: FilePlus },
  nav: { label: 'Jump to', icon: List },
};

// ── Preview panel ─────────────────────────────────────────────────────────────

const isElectron = Boolean(window?.electronAPI);

function ElectronWebview({ url, partition, openLinks, onLoadStart, onLoadStop, onCrash, onLoadError, onNavigate, onTitle, onNavStateChange, onFullscreenChange, webviewRef }) {
  const internalRef = useRef(null);
  const ref = webviewRef || internalRef;

  // Store all callbacks in a ref so the event-listener useEffect only runs once
  // (on mount). Inline arrow functions passed as props are recreated every render,
  // so putting them in deps would detach/re-attach listeners constantly.
  const cbs = useRef({});
  cbs.current = { onLoadStart, onLoadStop, onCrash, onLoadError, onNavigate, onTitle, onNavStateChange, onFullscreenChange };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reportNavState = () => {
      try {
        cbs.current.onNavStateChange?.({ canGoBack: el.canGoBack(), canGoForward: el.canGoForward() });
      } catch { /* dom-ready not fired yet */ }
    };
    const start       = () => cbs.current.onLoadStart?.();
    const stop        = () => {
      let page = {};
      try { page = { url: el.getURL?.() || '', title: el.getTitle?.() || '' }; } catch { /* guest not ready */ }
      cbs.current.onLoadStop?.(page);
      reportNavState();
    };
    const handleTitle = (e) => cbs.current.onTitle?.(e.title);
    const handleAttach = () => {
      try { window.electronAPI?.configureWebview?.({ webContentsId: el.getWebContentsId(), openLinks }); } catch { /* desktop bridge unavailable */ }
    };
    const handleNavigate = (e) => { cbs.current.onNavigate?.(e.url); reportNavState(); };
    const handleCrash    = () => cbs.current.onCrash?.();
    const handleGone     = () => cbs.current.onCrash?.();
    const handleEnterFullscreen = () => cbs.current.onFullscreenChange?.(true);
    const handleLeaveFullscreen = () => cbs.current.onFullscreenChange?.(false);
    const handleFailLoad = (e) => {
      if (e.errorCode === -3) return;        // ERR_ABORTED — intentional cancel
      if (e.isMainFrame === false) return;   // sub-resource failure — ignore
      cbs.current.onLoadError?.(e.errorCode, e.errorDescription);
    };
    el.addEventListener('did-start-loading',    start);
    el.addEventListener('did-stop-loading',     stop);
    el.addEventListener('did-fail-load',        handleFailLoad);
    el.addEventListener('did-attach',           handleAttach);
    el.addEventListener('did-navigate',         handleNavigate);
    el.addEventListener('did-navigate-in-page', handleNavigate);
    el.addEventListener('page-title-updated',   handleTitle);
    el.addEventListener('crashed',              handleCrash);
    el.addEventListener('render-process-gone',  handleGone);
    el.addEventListener('enter-html-full-screen', handleEnterFullscreen);
    el.addEventListener('leave-html-full-screen', handleLeaveFullscreen);
    return () => {
      el.removeEventListener('did-start-loading',    start);
      el.removeEventListener('did-stop-loading',     stop);
      el.removeEventListener('did-fail-load',        handleFailLoad);
      el.removeEventListener('did-attach',           handleAttach);
      el.removeEventListener('did-navigate',         handleNavigate);
      el.removeEventListener('did-navigate-in-page', handleNavigate);
      el.removeEventListener('page-title-updated',   handleTitle);
      el.removeEventListener('crashed',              handleCrash);
      el.removeEventListener('render-process-gone',  handleGone);
      el.removeEventListener('enter-html-full-screen', handleEnterFullscreen);
      el.removeEventListener('leave-html-full-screen', handleLeaveFullscreen);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — latest callbacks always read from cbs ref

  useEffect(() => {
    try {
      const webContentsId = ref.current?.getWebContentsId?.();
      if (webContentsId) window.electronAPI?.configureWebview?.({ webContentsId, openLinks });
    } catch { /* guest may not be attached yet */ }
  }, [openLinks, ref]);

  // Browser sessions stay isolated from the main Asyncat renderer session.
  // eslint-disable-next-line react/no-unknown-property
  return <webview ref={ref} src={url} partition={partition} allowpopups="true" style={{ width: '100%', height: '100%', display: 'flex', border: 'none' }} />;
}

function getNetworkErrorMessage(code) {
  switch (code) {
    case -102: return 'Connection refused — the server may not be running yet.';
    case -105: return 'Hostname not found — check the URL.';
    case -118: return 'Connection timed out — the server isn\'t responding.';
    case -6:   return 'Page not found.';
    case -21:  return 'Network changed — try reloading.';
    default:   return 'The page couldn\'t be loaded.';
  }
}

const QUICK_LINKS = [
  { label: 'Brave Search', url: 'https://search.brave.com' },
  { label: 'GitHub', url: 'https://github.com' },
  { label: 'MDN', url: 'https://developer.mozilla.org' },
  { label: 'Stack Overflow', url: 'https://stackoverflow.com' },
  { label: 'Wikipedia', url: 'https://wikipedia.org' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  { label: 'npm', url: 'https://www.npmjs.com' },
  { label: 'YouTube', url: 'https://youtube.com' },
];

const SEARCH_ENGINES = {
  brave: (query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
  google: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  duckduckgo: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  bing: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
};

const BROWSER_API = `${import.meta.env.VITE_MAIN_URL || 'http://127.0.0.1:8716'}/api/browser`;

function PreviewPanel({ initialUrl, browserExecutorRef }) {
  const { workbenchPreferences } = useUiPreferences();
  const [incognitoMode, setIncognitoMode] = useState(workbenchPreferences.browserProfile !== 'persistent');
  const incognitoPartition = useRef(`asyncat-web-incognito-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`).current;
  const browserPartition = incognitoMode ? incognitoPartition : 'persist:asyncat-web';
  const historyEnabled = workbenchPreferences.browserHistoryEnabled && !incognitoMode;
  // ── Tab state ─────────────────────────────────────────────────────────────
  // Each tab: { id, url, inputUrl, title, key, loading, crashed, error }
  // All tabs that have a URL get a webview mounted. Inactive ones are
  // hidden (display:none) and audio-muted — like real browser background tabs.
  // Tab URLs are persisted to sessionStorage so they survive page refresh.
  const tabSeq = useRef(2); // first tab = 't-1'; new tabs count up from 2

  const [tabs, setTabs] = useState(() => {
    if (incognitoMode || !workbenchPreferences.browserRestoreTabs) {
      return [{
        id: 't-1', url: initialUrl || '', inputUrl: initialUrl || '',
        title: initialUrl ? 'Loading…' : 'New Tab',
        key: 0, loading: Boolean(initialUrl), crashed: false, error: null,
      }];
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem('asyncat_web_tabs') || 'null');
      if (Array.isArray(saved?.tabs) && saved.tabs.length > 0) {
        // Advance tabSeq past the highest restored ID
        const maxN = saved.tabs.reduce((m, t) => Math.max(m, parseInt(t.id.replace('t-', ''), 10) || 0), 1);
        tabSeq.current = maxN + 1;
        return saved.tabs.map(t => ({
          id: t.id, url: t.url || '', inputUrl: t.inputUrl || '',
          title: t.title || (t.url ? 'Loading…' : 'New Tab'),
          key: 0, loading: Boolean(t.url), crashed: false, error: null,
        }));
      }
    } catch { /* ignore invalid session state */ }
    return [{
      id: 't-1', url: initialUrl || '', inputUrl: initialUrl || '',
      title: initialUrl ? 'Loading…' : 'New Tab',
      key: 0, loading: Boolean(initialUrl), crashed: false, error: null,
    }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    if (incognitoMode || !workbenchPreferences.browserRestoreTabs) return 't-1';
    try {
      const saved = JSON.parse(sessionStorage.getItem('asyncat_web_tabs') || 'null');
      if (saved?.activeTabId && Array.isArray(saved?.tabs) && saved.tabs.some(t => t.id === saved.activeTabId)) {
        return saved.activeTabId;
      }
    } catch { /* ignore invalid session state */ }
    return 't-1';
  });

  // ── Per-tab back/forward state ────────────────────────────────────────────
  const [tabNavStates, setTabNavStates] = useState({});
  const updateTabNavState = useCallback((id, state) =>
    setTabNavStates(prev => ({ ...prev, [id]: state })), []);

  // ── Per-tab webview refs ──────────────────────────────────────────────────
  // Initialise from the actual tabs array (which may be restored from sessionStorage)
  const tabRefs = useRef(Object.fromEntries(tabs.map(t => [t.id, { current: null }])));
  const getOrCreateTabRef = useCallback((id) => {
    if (!tabRefs.current[id]) tabRefs.current[id] = { current: null };
    return tabRefs.current[id];
  }, []);

  // ── Always-fresh mirrors for the async executor ───────────────────────────
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];
  const addressInputRef = useRef(null);
  const [recentlyClosed, setRecentlyClosed] = useState(() => {
    if (incognitoMode) return [];
    try {
      const saved = JSON.parse(sessionStorage.getItem('asyncat_web_recently_closed') || '[]');
      return Array.isArray(saved) ? saved.slice(0, 20) : [];
    } catch { return []; }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [mutedTabs, setMutedTabs] = useState(() => new Set());
  const [downloads, setDownloads] = useState([]);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [agentPaused, setAgentPaused] = useState(false);
  const [agentControlActive, setAgentControlActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const agentControlTimer = useRef(null);
  const lastHistoryEntry = useRef({ url: '', at: 0 });
  const standardSessionSnapshot = useRef(null);

  // ── Tab mutation helpers ──────────────────────────────────────────────────
  const updateTab = useCallback((id, patch) =>
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t)), []);

  const addTab = useCallback((url = '') => {
    const id = `t-${tabSeq.current++}`;
    tabRefs.current[id] = { current: null };
    setTabs(prev => [...prev, {
      id, url, inputUrl: url,
      title: url ? 'Loading…' : 'New Tab',
      key: 0, loading: Boolean(url), crashed: false, error: null,
    }]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((id) => {
    const cur = tabsRef.current;
    const closing = cur.find(t => t.id === id);
    if (!incognitoMode && closing?.url) {
      setRecentlyClosed(previous => [{ url: closing.url, title: closing.title || closing.url }, ...previous.filter(item => item.url !== closing.url)].slice(0, 20));
    }
    if (cur.length === 1) {
      // Can't close the last tab — clear it instead
      setTabs([{ ...cur[0], url: '', inputUrl: '', title: 'New Tab', key: cur[0].key + 1, loading: false, error: null, crashed: false }]);
      return;
    }
    const idx = cur.findIndex(t => t.id === id);
    const next = cur.filter(t => t.id !== id);
    delete tabRefs.current[id];
    setTabs(next);
    if (activeTabIdRef.current === id) setActiveTabId(next[Math.max(0, idx - 1)].id);
  }, [incognitoMode]);

  const reopenClosedTab = useCallback(() => {
    setRecentlyClosed(previous => {
      const [latest, ...rest] = previous;
      if (latest?.url) addTab(latest.url);
      return rest;
    });
  }, [addTab]);

  const navigateTab = useCallback((id, rawUrl) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    let full;
    if (/^https?:\/\//i.test(trimmed)) {
      // Already has a recognised protocol — use as-is
      full = trimmed;
    } else if (
      /^localhost(:\d+)?(\/|$)/i.test(trimmed) ||            // localhost[:port]
      /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed) || // IPv4
      /^[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+([/?#].*)?$/.test(trimmed) // domain.tld
    ) {
      // Local development usually serves plain HTTP; public domains default HTTPS.
      full = /^(localhost|127\.)/i.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}`;
    } else {
      const buildSearchUrl = SEARCH_ENGINES[workbenchPreferences.browserSearchEngine] || SEARCH_ENGINES.brave;
      full = buildSearchUrl(trimmed);
    }
    setTabs(prev => prev.map(t => t.id === id
      ? { ...t, url: full, inputUrl: full, key: t.key + 1, loading: true, error: null, crashed: false, title: 'Loading…' }
      : t));
  }, [workbenchPreferences.browserSearchEngine]);

  const reloadTab = useCallback((id) =>
    setTabs(prev => prev.map(t => t.id === id
      ? { ...t, key: t.key + 1, loading: true, error: null, crashed: false }
      : t)), []);

  // ── Start page + find-in-page (browser UX) ────────────────────────────────
  const [startQuery, setStartQuery] = useState('');
  const [find, setFind] = useState({ open: false, query: '', active: 0, total: 0 });
  const findInputRef = useRef(null);

  const runFind = useCallback((query, opts = {}) => {
    const wv = tabRefs.current[activeTabIdRef.current]?.current;
    if (!wv?.findInPage) return;
    if (!query) {
      try { wv.stopFindInPage('clearSelection'); } catch { /* find not active */ }
      setFind(f => ({ ...f, active: 0, total: 0 }));
      return;
    }
    try { wv.findInPage(query, opts); } catch { /* webview not ready */ }
  }, []);

  const openFind = useCallback(() => {
    setFind(f => ({ ...f, open: true }));
    setTimeout(() => findInputRef.current?.focus(), 30);
  }, []);

  const closeFind = useCallback(() => {
    const wv = tabRefs.current[activeTabIdRef.current]?.current;
    try { wv?.stopFindInPage?.('clearSelection'); } catch { /* find not active */ }
    setFind({ open: false, query: '', active: 0, total: 0 });
  }, []);

  const exitFullscreen = useCallback(() => {
    const webview = tabRefs.current[activeTabIdRef.current]?.current;
    try {
      webview?.executeJavaScript?.('if (document.fullscreenElement) document.exitFullscreen()')?.catch?.(() => {});
    } catch { /* guest not ready */ }
    setFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (fullscreen) exitFullscreen();
    else setFullscreen(true);
  }, [exitFullscreen, fullscreen]);

  const handlePanelKey = useCallback((e) => {
    const command = e.metaKey || e.ctrlKey;
    if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
    if (e.key === 'Escape' && fullscreen) { e.preventDefault(); exitFullscreen(); return; }
    if (command && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); openFind(); return; }
    if (command && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
      return;
    }
    if (command && e.shiftKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); reopenClosedTab(); return; }
    if (command && (e.key === 't' || e.key === 'T')) { e.preventDefault(); addTab(''); return; }
    if (command && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); closeTab(activeTabIdRef.current); return; }
    if (command && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); reloadTab(activeTabIdRef.current); return; }
    if (command && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); setHistoryOpen(value => !value); return; }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); try { tabRefs.current[activeTabIdRef.current]?.current?.goBack(); } catch { /* guest not ready */ } }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); try { tabRefs.current[activeTabIdRef.current]?.current?.goForward(); } catch { /* guest not ready */ } }
  }, [addTab, closeTab, exitFullscreen, fullscreen, openFind, reloadTab, reopenClosedTab, toggleFullscreen]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('browser-fullscreen-active');
    const onKeyDown = (event) => {
      if (event.key === 'Escape' || event.key === 'F11') {
        event.preventDefault();
        event.stopPropagation();
        exitFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('browser-fullscreen-active');
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [exitFullscreen, fullscreen]);

  // Track match counts as the webview reports them.
  useEffect(() => {
    if (!find.open || !isElectron) return undefined;
    const wv = tabRefs.current[activeTabId]?.current;
    if (!wv?.addEventListener) return undefined;
    const onFound = (e) => {
      const r = e.result || {};
      setFind(f => ({ ...f, active: r.activeMatchOrdinal || 0, total: r.matches || 0 }));
    };
    wv.addEventListener('found-in-page', onFound);
    return () => { try { wv.removeEventListener('found-in-page', onFound); } catch { /* detached */ } };
  }, [find.open, activeTabId]);

  // ── Sync when agent calls preview_navigate ────────────────────────────────
  const prevInitialUrl = useRef(initialUrl || null);
  useEffect(() => {
    if (!initialUrl || initialUrl === prevInitialUrl.current) return;
    prevInitialUrl.current = initialUrl;
    navigateTab(activeTabIdRef.current, initialUrl);
  }, [initialUrl, navigateTab]);

  // ── Persist tab URLs to sessionStorage (survives refresh) ────────────────
  useEffect(() => {
    if (incognitoMode) return;
    try {
      sessionStorage.setItem('asyncat_web_tabs', JSON.stringify({
        tabs: tabs.map(({ id, url, inputUrl, title }) => ({ id, url, inputUrl, title })),
        activeTabId,
      }));
    } catch { /* storage may be unavailable */ }
  }, [tabs, activeTabId, incognitoMode]);

  useEffect(() => {
    if (incognitoMode) return;
    try { sessionStorage.setItem('asyncat_web_recently_closed', JSON.stringify(recentlyClosed)); } catch { /* storage may be unavailable */ }
  }, [incognitoMode, recentlyClosed]);

  // Incognito gets a unique, in-memory Electron partition. It is cleared when
  // the mode is left and again when the browser panel closes.
  useEffect(() => {
    if (!incognitoMode) window.electronAPI?.clearBrowserData?.({ partition: incognitoPartition }).catch(() => {});
  }, [incognitoMode, incognitoPartition]);
  useEffect(() => () => {
    window.electronAPI?.clearBrowserData?.({ partition: incognitoPartition }).catch(() => {});
  }, [incognitoPartition]);

  const toggleIncognitoMode = useCallback(() => {
    if (!incognitoMode) {
      standardSessionSnapshot.current = {
        tabs: tabsRef.current.map(({ id, url, inputUrl, title }) => ({ id, url, inputUrl, title })),
        activeTabId: activeTabIdRef.current,
      };
      const id = `t-${tabSeq.current++}`;
      tabRefs.current = { [id]: { current: null } };
      setTabs([{ id, url: '', inputUrl: '', title: 'New Tab', key: 0, loading: false, crashed: false, error: null }]);
      setActiveTabId(id);
    } else {
      let snapshot = standardSessionSnapshot.current;
      if (!snapshot) {
        try { snapshot = JSON.parse(sessionStorage.getItem('asyncat_web_tabs') || 'null'); } catch { snapshot = null; }
      }
      const restored = Array.isArray(snapshot?.tabs) && snapshot.tabs.length
        ? snapshot.tabs.map((tab) => ({ ...tab, key: 0, loading: Boolean(tab.url), crashed: false, error: null }))
        : [{ id: `t-${tabSeq.current++}`, url: '', inputUrl: '', title: 'New Tab', key: 0, loading: false, crashed: false, error: null }];
      tabRefs.current = Object.fromEntries(restored.map((tab) => [tab.id, { current: null }]));
      setTabs(restored);
      setActiveTabId(restored.some((tab) => tab.id === snapshot?.activeTabId) ? snapshot.activeTabId : restored[0].id);
    }
    setIncognitoMode(!incognitoMode);
    setHistoryOpen(false);
    setRecentlyClosed([]);
  }, [incognitoMode]);

  const loadHistory = useCallback(async () => {
    if (!historyEnabled) {
      setHistoryItems([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (historyQuery.trim()) params.set('q', historyQuery.trim());
      const response = await fetch(`${BROWSER_API}/history?${params}`);
      const payload = await response.json();
      setHistoryItems(Array.isArray(payload.history) ? payload.history : []);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyEnabled, historyQuery]);

  useEffect(() => {
    if (!historyOpen) return undefined;
    const timeout = setTimeout(loadHistory, 150);
    return () => clearTimeout(timeout);
  }, [historyOpen, loadHistory]);

  const recordHistory = useCallback((page) => {
    const url = page?.url || '';
    if (!historyEnabled || !/^https?:\/\//i.test(url)) return;
    const now = Date.now();
    if (lastHistoryEntry.current.url === url && now - lastHistoryEntry.current.at < 30000) return;
    lastHistoryEntry.current = { url, at: now };
    fetch(`${BROWSER_API}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title: page?.title || '' }),
    }).catch(() => {});
  }, [historyEnabled]);

  const handlePageLoaded = useCallback((tabId, page) => {
    const patch = { loading: false };
    if (page?.url && !page.url.startsWith('about:')) {
      patch.url = page.url;
      patch.inputUrl = page.url;
    }
    if (page?.title) patch.title = page.title;
    updateTab(tabId, patch);
    recordHistory(page);
  }, [recordHistory, updateTab]);

  useEffect(() => {
    const unsubscribeOpen = window.electronAPI?.onBrowserOpenTab?.((url) => {
      if (/^https?:\/\//i.test(url || '')) addTab(url);
    });
    const unsubscribeDownload = window.electronAPI?.onBrowserDownload?.((download) => {
      if (!download?.id) return;
      setDownloads(previous => {
        const next = previous.filter(item => item.id !== download.id);
        return [download, ...next].slice(0, 5);
      });
    });
    const unsubscribeShortcut = window.electronAPI?.onBrowserShortcut?.((shortcut) => {
      const synthetic = {
        preventDefault() {}, metaKey: false, ctrlKey: true, altKey: false, shiftKey: false,
        key: '',
      };
      if (shortcut === 'focus-location') synthetic.key = 'l';
      if (shortcut === 'new-tab') synthetic.key = 't';
      if (shortcut === 'close-tab') synthetic.key = 'w';
      if (shortcut === 'reopen-tab') { synthetic.key = 't'; synthetic.shiftKey = true; }
      if (shortcut === 'reload') synthetic.key = 'r';
      if (shortcut === 'history') synthetic.key = 'h';
      if (shortcut === 'find') synthetic.key = 'f';
      if (shortcut === 'toggle-fullscreen') { synthetic.key = 'F11'; synthetic.ctrlKey = false; }
      if (shortcut === 'exit-fullscreen') { synthetic.key = 'Escape'; synthetic.ctrlKey = false; }
      handlePanelKey(synthetic);
    });
    return () => {
      unsubscribeOpen?.();
      unsubscribeDownload?.();
      unsubscribeShortcut?.();
    };
  }, [addTab, handlePanelKey]);

  // ── Mute hidden tabs so background webviews don't leak audio ─────────────
  // Guard with try/catch: setAudioMuted throws if the webview hasn't fired
  // dom-ready yet. A freshly-mounted webview can't play audio anyway, so
  // skipping the mute call on those is safe.
  useEffect(() => {
    tabsRef.current.forEach(tab => {
      const wv = tabRefs.current[tab.id]?.current;
      if (!wv?.setAudioMuted) return;
      try {
        wv.setAudioMuted(tab.id !== activeTabId || mutedTabs.has(tab.id));
      } catch {
        // dom-ready hasn't fired yet for this webview — ignore
      }
    });
  }, [activeTabId, mutedTabs]);

  // ── Browser command executor ──────────────────────────────────────────────
  const executeBrowserCommand = useCallback(async ({
    action, selector, value, url: navUrl, code, direction, amount, index: tabIndex,
  }) => {
    if (agentPaused && action !== 'list_tabs') {
      return { success: false, error: 'Browser control is paused by the user.' };
    }
    if (action !== 'list_tabs') {
      setAgentControlActive(true);
      clearTimeout(agentControlTimer.current);
      agentControlTimer.current = setTimeout(() => setAgentControlActive(false), 1800);
    }
    // ── Tab management ──────────────────────────────────────────────────────
    if (action === 'list_tabs') {
      const aid = activeTabIdRef.current;
      return { success: true, tabs: tabsRef.current.map((t, i) => ({ index: i, id: t.id, url: t.url, title: t.title, active: t.id === aid })) };
    }
    if (action === 'open_tab') {
      if (navUrl && !/^https?:\/\//i.test(navUrl)) {
        return { success: false, error: 'Browser tabs only allow HTTP(S) URLs.' };
      }
      const newId = addTab(navUrl || '');
      if (navUrl) await new Promise(r => setTimeout(r, 800));
      return { success: true, tabIndex: tabsRef.current.findIndex(t => t.id === newId), url: navUrl || '' };
    }
    if (action === 'switch_tab') {
      const ts = tabsRef.current;
      const target = tabIndex != null ? ts[tabIndex] : ts.find(t => navUrl && t.url.includes(navUrl));
      if (!target) return { success: false, error: `Tab not found — index=${tabIndex} url=${navUrl}` };
      setActiveTabId(target.id);
      return { success: true, tabIndex: ts.indexOf(target), url: target.url, title: target.title };
    }
    if (action === 'close_tab') {
      const ts = tabsRef.current;
      const target = tabIndex != null ? ts[tabIndex] : ts.find(t => t.id === activeTabIdRef.current);
      if (!target) return { success: false, error: 'Tab not found' };
      closeTab(target.id);
      return { success: true };
    }

    // ── Webview actions — always operate on the active tab ──────────────────
    const webview = tabRefs.current[activeTabIdRef.current]?.current;
    if (!webview) return { success: false, error: 'Preview webview not mounted. Use preview_navigate to load a URL first.' };
    try {
      switch (action) {
        case 'screenshot': {
          const image = await webview.capturePage();
          if (!image) return { success: false, error: 'capturePage returned null' };
          return { success: true, dataUrl: image.toDataURL(), format: 'image/png;base64', url: webview.getURL?.() || '' };
        }
        case 'navigate': {
          if (!/^https?:\/\//i.test(navUrl || '')) {
            return { success: false, error: 'Browser navigation only allows HTTP(S) URLs.' };
          }
          webview.loadURL(navUrl);
          await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('Navigation timed out after 10s')), 10000);
            webview.addEventListener('did-stop-loading', () => { clearTimeout(t); resolve(); }, { once: true });
          });
          return { success: true, url: navUrl };
        }
        case 'click': {
          const target = await webview.executeJavaScript(`(function(){
            var el=document.querySelector(${JSON.stringify(selector)});
            if(!el)return null;
            return{text:(el.innerText||el.value||el.getAttribute('aria-label')||'').trim().slice(0,160),action:el.formAction||el.closest('form')?.action||'',type:el.type||''};
          })()`);
          if (!target) return { success: false, error: `Element not found: ${selector}` };
          const actionDescription = `${target.text} ${target.action}`;
          if (/\b(buy|purchase|pay|place order|checkout|delete|remove account|unsubscribe|publish|send money|confirm order)\b/i.test(actionDescription)
            && !window.confirm(`Allow the agent to activate “${target.text || 'this sensitive action'}”?`)) {
            return { success: false, error: 'Sensitive click was declined by the user.' };
          }
          return webview.executeJavaScript(`(function(){
            var sel=${JSON.stringify(selector)},el=document.querySelector(sel);
            if(!el)return{success:false,error:'Element not found: '+sel};
            el.scrollIntoView({behavior:'instant',block:'center'});el.click();
            return{success:true,tag:el.tagName,text:(el.textContent||'').trim().slice(0,80)};
          })()`);
        }
        case 'fill': {
          const field = await webview.executeJavaScript(`(function(){
            var el=document.querySelector(${JSON.stringify(selector)});
            if(!el)return null;
            var type=String(el.type||'').toLowerCase(),ac=String(el.autocomplete||'').toLowerCase(),name=String(el.name||'').toLowerCase();
            return{type:type,autocomplete:ac,name:name,sensitive:type==='password'||/(cc-|card|cvc|cvv|password|one-time-code)/.test(ac+' '+name)};
          })()`);
          if (field?.sensitive && !window.confirm('Allow the agent to fill this sensitive field?')) {
            return { success: false, error: 'Sensitive-field fill was declined by the user.' };
          }
          return webview.executeJavaScript(`(function(){
            var sel=${JSON.stringify(selector)},el=document.querySelector(sel);
            if(!el)return{success:false,error:'Element not found: '+sel};
            el.focus();el.value=${JSON.stringify(value)};
            el.dispatchEvent(new Event('input',{bubbles:true}));
            el.dispatchEvent(new Event('change',{bubbles:true}));
            return{success:true};
          })()`);
        }
        case 'get_text': {
          const text = await webview.executeJavaScript('document.body.innerText');
          return { success: true, text: (text || '').slice(0, 8000), url: webview.getURL?.() || '' };
        }
        case 'evaluate': {
          const result = await webview.executeJavaScript(code);
          return { success: true, result: JSON.stringify(result)?.slice(0, 4000) };
        }
        case 'wait_for_reload':
          await new Promise(resolve => {
            const t = setTimeout(resolve, 30000);
            webview.addEventListener('did-stop-loading', () => { clearTimeout(t); resolve(); }, { once: true });
          });
          return { success: true, url: webview.getURL?.() || '' };
        case 'scroll': {
          const delta = direction === 'up' ? -(amount ?? 400) : (amount ?? 400);
          await webview.executeJavaScript(`window.scrollBy({top:${delta},behavior:'smooth'})`);
          await new Promise(r => setTimeout(r, 350));
          return { success: true };
        }
        default:
          return { success: false, error: `Unknown browser action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [addTab, agentPaused, closeTab]);

  useEffect(() => () => clearTimeout(agentControlTimer.current), []);

  // ── Register executor with parent ─────────────────────────────────────────
  useEffect(() => {
    if (!browserExecutorRef || !isElectron) return;
    browserExecutorRef.current = executeBrowserCommand;
    return () => { if (browserExecutorRef.current === executeBrowserCommand) browserExecutorRef.current = null; };
  }, [browserExecutorRef, executeBrowserCommand]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`flex min-h-0 flex-col bg-white dark:bg-gray-950 midnight:bg-slate-950 ${fullscreen ? 'fixed inset-0 z-[100] h-dvh w-dvw shadow-2xl' : 'h-full'}`}
      onKeyDown={handlePanelKey}
    >

      {/* ── Tab strip ─────────────────────────────────────────────────────── */}
      <div className={`flex min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1 py-0.5 ${incognitoMode ? 'border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/20 midnight:border-violet-900/60 midnight:bg-violet-950/20' : 'border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950'}`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            className={`group flex min-w-0 max-w-[150px] shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              tab.id === activeTabId
                ? 'bg-white dark:bg-gray-800 midnight:bg-slate-800 text-gray-700 dark:text-gray-200 midnight:text-slate-200 shadow-sm ring-1 ring-black/5 dark:ring-white/5'
                : 'text-gray-400 dark:text-gray-500 midnight:text-slate-500 hover:bg-white/80 dark:hover:bg-gray-800/60 midnight:hover:bg-slate-800/60 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {tab.loading
              ? <div className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-gray-300 dark:border-gray-600 midnight:border-slate-600 border-t-indigo-500" />
              : <Globe className="h-2.5 w-2.5 shrink-0 opacity-50" />
            }
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
            <span
              role="button"
              tabIndex={-1}
              onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(tab.id); } }}
              className="ml-0.5 shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 text-gray-400"
              title="Close tab"
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => addTab('')}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-gray-300"
          title="New tab"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Address bar ───────────────────────────────────────────────────── */}
      <div className="relative flex shrink-0 items-center gap-1 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-2 py-1.5">
        {/* Back / Forward */}
        <button
          type="button"
          disabled={!tabNavStates[activeTabId]?.canGoBack}
          onClick={() => { try { tabRefs.current[activeTabId]?.current?.goBack(); } catch { /* guest not ready */ } }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title="Go back"
        >
          <ArrowLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          disabled={!tabNavStates[activeTabId]?.canGoForward}
          onClick={() => { try { tabRefs.current[activeTabId]?.current?.goForward(); } catch { /* guest not ready */ } }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title="Go forward"
        >
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeTab?.loading) {
              try { tabRefs.current[activeTabId]?.current?.stop(); } catch { /* not mounted */ }
              updateTab(activeTabId, { loading: false });
            } else {
              reloadTab(activeTabId);
            }
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title={activeTab?.loading ? 'Stop' : 'Reload'}
        >
          {activeTab?.loading ? <X className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
        </button>
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={e => { e.preventDefault(); navigateTab(activeTabId, activeTab?.inputUrl || ''); }}
        >
          {/* ── Security indicator ── */}
          {(() => {
            const u = activeTab?.url || '';
            const isLocal = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+)(:\d+)?/.test(u);
            if (u.startsWith('https://') || isLocal)
              return <Lock className="h-3 w-3 shrink-0 text-green-500" title="Secure connection" />;
            if (u.startsWith('http://'))
              return (
                <span className="flex shrink-0 items-center gap-0.5 text-amber-500" title="Connection not encrypted — avoid entering sensitive information">
                  <ShieldAlert className="h-3 w-3" />
                  <span className="text-[9px] font-semibold uppercase tracking-wide">Not Secure</span>
                </span>
              );
            return null;
          })()}
          <input
            ref={addressInputRef}
            value={activeTab?.inputUrl || ''}
            onChange={e => updateTab(activeTabId, { inputUrl: e.target.value })}
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-mono text-gray-700 outline-none transition-colors focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-200 midnight:focus:border-indigo-500 midnight:focus:ring-indigo-500/30"
            placeholder="Search or enter address"
            spellCheck={false}
          />
        </form>
        <button
          type="button"
          onClick={toggleIncognitoMode}
          className={`flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[9px] font-semibold transition-colors ${incognitoMode ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/55 dark:text-violet-300 midnight:bg-violet-950/50 midnight:text-violet-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800'}`}
          title={incognitoMode ? 'Incognito is on — switch to Standard browsing' : 'Switch to Incognito browsing'}
        >
          <Ghost className="h-3 w-3" />
          {incognitoMode && <span>Incognito</span>}
        </button>
        {isElectron && activeTab?.url && (
          <>
            <button
              type="button"
              onClick={async () => {
                const wv = tabRefs.current[activeTabId]?.current;
                let pageText = '';
                try { pageText = await wv?.executeJavaScript('document.body.innerText'); } catch { /* cross-origin / not ready */ }
                const url = activeTab.url;
                const title = activeTab.title && activeTab.title !== 'Loading…' ? activeTab.title : '';
                const clean = String(pageText || '').replace(/\n{3,}/g, '\n\n').trim();
                const excerpt = clean.slice(0, 2000);
                const prompt = [
                  'Here is the web page I have open. Help me with it.',
                  '',
                  title ? `Title: ${title}` : null,
                  `URL: ${url}`,
                  excerpt ? `\n"""\n${excerpt}${clean.length > 2000 ? '\n…(truncated)' : ''}\n"""` : null,
                  '',
                ].filter(line => line !== null).join('\n');
                eventBus.emit('composer:prefill', prompt);
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-800 dark:hover:text-indigo-400 midnight:hover:bg-slate-800 midnight:hover:text-indigo-300"
              title="Ask agent about this page"
            >
              <Sparkles className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setAgentPaused(value => !value)}
              className={`flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[9px] font-medium transition-colors ${agentPaused ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30' : agentControlActive ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              title={agentPaused ? 'Resume agent browser control' : 'Pause agent browser control'}
            >
              <Sparkles className={`h-3 w-3 ${agentControlActive ? 'animate-pulse' : ''}`} />
              {agentPaused ? 'Paused' : agentControlActive ? 'Agent' : ''}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${fullscreen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300 midnight:bg-indigo-950/40 midnight:text-indigo-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200'}`}
          title={fullscreen ? 'Exit full screen (F11 or Esc)' : 'Full screen (F11)'}
          aria-label={fullscreen ? 'Exit browser full screen' : 'Open browser full screen'}
        >
          {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => { setHistoryOpen(value => !value); setDownloadsOpen(false); setMoreOpen(false); }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${historyOpen ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800'}`}
          title="History and recently closed (Ctrl+H)"
        >
          <History className="h-3 w-3" />
        </button>
        {downloads.length > 0 && (
          <button
            type="button"
            onClick={() => { setDownloadsOpen(value => !value); setHistoryOpen(false); setMoreOpen(false); }}
            className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${downloadsOpen ? 'bg-gray-100 text-gray-700 dark:bg-gray-800' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800'}`}
            title="Downloads"
          >
            <Download className="h-3 w-3" />
            {downloads.some(item => item.state === 'progressing') && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setMoreOpen(value => !value); setHistoryOpen(false); setDownloadsOpen(false); }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${moreOpen ? 'bg-gray-100 text-gray-700 dark:bg-gray-800' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800'}`}
          title="More browser actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {moreOpen && (
          <div className="absolute right-2 top-9 z-40 w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
            {[
              { label: 'Copy address', icon: Copy, action: () => navigator.clipboard.writeText(activeTab?.url || '').catch(() => {}) },
              { label: 'Find in page', icon: Search, action: openFind },
              { label: mutedTabs.has(activeTabId) ? 'Unmute tab' : 'Mute tab', icon: mutedTabs.has(activeTabId) ? Volume2 : VolumeX, action: () => setMutedTabs(previous => {
                const next = new Set(previous);
                if (next.has(activeTabId)) next.delete(activeTabId); else next.add(activeTabId);
                return next;
              }) },
              { label: 'Save screenshot', icon: Camera, action: async () => {
                try {
                  const image = await tabRefs.current[activeTabId]?.current?.capturePage();
                  const dataUrl = image?.toDataURL?.();
                  if (!dataUrl) return;
                  const anchor = document.createElement('a');
                  anchor.href = dataUrl; anchor.download = `web-${Date.now()}.png`; anchor.click();
                } catch { /* guest not ready */ }
              } },
            ].map(item => {
              const ItemIcon = item.icon;
              return <button key={item.label} type="button" onClick={() => { item.action(); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><ItemIcon className="h-3.5 w-3.5" />{item.label}</button>;
            })}
            {activeTab?.url && <a href={activeTab.url} target="_blank" rel="noopener noreferrer" onClick={() => setMoreOpen(false)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><ExternalLink className="h-3.5 w-3.5" />Open in system browser</a>}
            {workbenchPreferences.browserDeveloperTools && isElectron && activeTab?.url && <button type="button" onClick={() => { tabRefs.current[activeTabId]?.current?.openDevTools(); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><Bug className="h-3.5 w-3.5" />Developer tools</button>}
          </div>
        )}
      </div>

      {/* ── Webview area ──────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1 bg-white dark:bg-gray-950 midnight:bg-slate-950">

        {historyOpen && (
          <div className="absolute right-2 top-2 z-40 flex max-h-[75%] w-[min(340px,calc(100%-16px))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
              <History className="h-3.5 w-3.5 text-gray-400" />
              <span className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-200">Browser history</span>
              {historyEnabled && historyItems.length > 0 && (
                <button type="button" onClick={async () => { await fetch(`${BROWSER_API}/history`, { method: 'DELETE' }).catch(() => {}); setHistoryItems([]); }} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800" title="Clear history"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Close"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="min-h-0 overflow-y-auto p-2">
              {historyEnabled && (
                <div className="mb-2 flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 dark:border-gray-700 dark:bg-gray-950">
                  <Search className="h-3 w-3 shrink-0 text-gray-400" />
                  <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search history" className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-gray-600 outline-none placeholder:text-gray-400 dark:text-gray-300" />
                  {historyQuery && <button type="button" onClick={() => setHistoryQuery('')} className="rounded p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>}
                </div>
              )}
              {recentlyClosed.length > 0 && (
                <section className="mb-3">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Recently closed</p>
                    <button type="button" onClick={() => setRecentlyClosed([])} className="text-[10px] text-gray-400 hover:text-gray-600">Clear</button>
                  </div>
                  {recentlyClosed.slice(0, 5).map((item, index) => (
                    <button key={`${item.url}-${index}`} type="button" onClick={() => { addTab(item.url); setRecentlyClosed(previous => previous.filter((_, i) => i !== index)); setHistoryOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800">
                      <RotateCcw className="h-3 w-3 shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300">{item.title || item.url}</span>
                    </button>
                  ))}
                </section>
              )}
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Visited pages</p>
              {!historyEnabled && <p className="px-2 py-4 text-center text-xs text-gray-400">{incognitoMode ? 'Incognito pages are not saved to history.' : 'History is disabled in Settings → Workbench.'}</p>}
              {historyEnabled && historyLoading && <p className="px-2 py-4 text-center text-xs text-gray-400">Loading…</p>}
              {historyEnabled && !historyLoading && historyItems.length === 0 && <p className="px-2 py-4 text-center text-xs text-gray-400">No browsing history yet.</p>}
              {historyItems.map(item => (
                <div key={item.id} className="group flex items-center gap-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                  <button type="button" onClick={() => { addTab(item.url); setHistoryOpen(false); }} className="min-w-0 flex-1 px-2 py-1.5 text-left">
                    <p className="truncate text-xs text-gray-600 dark:text-gray-300">{item.title || item.url}</p>
                    <p className="truncate text-[10px] text-gray-400">{item.url}</p>
                  </button>
                  <button type="button" onClick={async () => { await fetch(`${BROWSER_API}/history/${encodeURIComponent(item.id)}`, { method: 'DELETE' }).catch(() => {}); setHistoryItems(previous => previous.filter(entry => entry.id !== item.id)); }} className="mr-1 rounded p-1 text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100" title="Remove"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {downloadsOpen && (
          <div className="absolute right-2 top-2 z-40 w-[min(340px,calc(100%-16px))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
              <Download className="h-3.5 w-3.5 text-gray-400" />
              <span className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-200">Downloads</span>
              <button type="button" onClick={() => setDownloads([])} className="text-[10px] text-gray-400 hover:text-gray-600">Clear</button>
              <button type="button" onClick={() => setDownloadsOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {downloads.map(item => {
                const percent = item.totalBytes > 0 ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100)) : 0;
                return (
                  <div key={item.id} className="rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300">{item.filename}</span>
                      <span className="text-[10px] text-gray-400">{item.state === 'progressing' ? `${percent}%` : item.state}</span>
                    </div>
                    {item.state === 'progressing' && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} /></div>}
                    {item.savePath && item.state === 'completed' && <button type="button" onClick={() => window.electronAPI?.shellShowInFolder?.(item.savePath)} className="mt-1 text-[10px] font-medium text-indigo-500 hover:text-indigo-600">Show in folder</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Find-in-page overlay */}
        {find.open && isElectron && (
          <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
            <Search className="h-3 w-3 shrink-0 text-gray-400" />
            <input
              ref={findInputRef}
              value={find.query}
              onChange={e => { const q = e.target.value; setFind(f => ({ ...f, query: q })); runFind(q, { findNext: false }); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); runFind(find.query, { forward: !e.shiftKey, findNext: true }); }
                else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
              }}
              placeholder="Find in page"
              spellCheck={false}
              className="w-36 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400 dark:text-gray-200 midnight:text-slate-200"
            />
            <span className="min-w-[40px] text-right text-[10px] tabular-nums text-gray-400">{find.total ? `${find.active}/${find.total}` : '0/0'}</span>
            <button type="button" onClick={() => runFind(find.query, { forward: false, findNext: true })} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300" title="Previous match"><ArrowLeft className="h-3 w-3 rotate-90" /></button>
            <button type="button" onClick={() => runFind(find.query, { forward: true, findNext: true })} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300" title="Next match"><ArrowLeft className="h-3 w-3 -rotate-90" /></button>
            <button type="button" onClick={closeFind} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300" title="Close (Esc)"><X className="h-3 w-3" /></button>
          </div>
        )}

        {/* Start page — active tab has no URL yet */}
        {!activeTab?.url && (
          <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8">
            <Globe className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            <form
              className="w-full max-w-sm"
              onSubmit={e => { e.preventDefault(); const v = startQuery.trim(); if (v) { navigateTab(activeTabId, v); setStartQuery(''); } }}
            >
              <input
                value={startQuery}
                onChange={e => setStartQuery(e.target.value)}
                autoFocus
                placeholder="Search or enter a URL"
                spellCheck={false}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-200"
              />
            </form>
            <div className="flex w-full max-w-sm flex-wrap justify-center gap-1.5">
              {QUICK_LINKS.map(l => (
                <button
                  key={l.url}
                  type="button"
                  onClick={() => navigateTab(activeTabId, l.url)}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-300 midnight:hover:bg-slate-800"
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              {incognitoMode && <Ghost className="h-3 w-3 text-violet-500" />}
              {incognitoMode ? 'Incognito: history, restored tabs, and persistent site data are off.' : 'Or ask the agent to browse the web for you.'}
            </p>
          </div>
        )}

        {/* Electron: all tabs with a URL are mounted; inactive = hidden + muted */}
        {isElectron && tabs.map(tab => !tab.url ? null : (
          <div
            key={tab.id}
            style={{ display: tab.id === activeTabId ? 'flex' : 'none', position: 'absolute', inset: 0, flexDirection: 'column' }}
          >
            {tab.loading && !tab.crashed && !tab.error && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-950/80 midnight:bg-slate-950/80">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
              </div>
            )}
            {tab.error && !tab.crashed && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-950 midnight:bg-slate-950 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
                  <WifiOff className="h-6 w-6 text-amber-500" />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Can&apos;t connect</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">{getNetworkErrorMessage(tab.error.code)}</p>
                <p className="text-[10px] font-mono text-gray-400 dark:text-gray-600 break-all max-w-xs">{tab.url}</p>
                <button type="button" onClick={() => reloadTab(tab.id)} className="mt-1 rounded-lg bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Retry</button>
              </div>
            )}
            {tab.crashed && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-950 midnight:bg-slate-950 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Page crashed</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">This site caused the renderer to crash. It may be consuming too much memory.</p>
                <button type="button" onClick={() => reloadTab(tab.id)} className="mt-1 rounded-lg bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Try again</button>
              </div>
            )}
            <ElectronWebview
              key={`${browserPartition}-${tab.key}`}
              url={tab.url}
              partition={browserPartition}
              openLinks={workbenchPreferences.browserOpenLinks}
              webviewRef={getOrCreateTabRef(tab.id)}
              onLoadStart={() => updateTab(tab.id, { loading: true, error: null })}
              onLoadStop={page => handlePageLoaded(tab.id, page)}
              onCrash={() => updateTab(tab.id, { crashed: true, loading: false })}
              onLoadError={(code, desc) => updateTab(tab.id, { error: { code, description: desc }, loading: false })}
              onNavigate={newUrl => { if (newUrl && !newUrl.startsWith('about:')) updateTab(tab.id, { url: newUrl, inputUrl: newUrl, error: null }); }}
              onTitle={title => { if (title) updateTab(tab.id, { title }); }}
              onNavStateChange={state => updateTabNavState(tab.id, state)}
              onFullscreenChange={setFullscreen}
            />
          </div>
        ))}

        {/* Non-Electron iframe fallback (single tab only) */}
        {!isElectron && activeTab?.url && (
          <iframe
            key={`${activeTabId}-${activeTab.key}`}
            src={activeTab.url}
            onLoad={() => updateTab(activeTabId, { loading: false })}
            className="h-full w-full border-0"
            title="Web"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        )}
      </div>
    </div>
  );
}

function ArtifactPanel({ artifact }) {
  if (!artifact) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <FilePlus className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No artifact selected</p>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Click Open on any artifact to view it here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <ArtifactCard
        key={artifact._artifactKey || artifact.noteId || artifact.path || artifact.filename || artifact.title}
        artifact={artifact}
        defaultExpanded
        fullHeight
      />
    </div>
  );
}

function ArtifactsPanel({ artifacts = [], onSelectArtifact }) {
  if (!artifacts.length) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <FilePlus className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No artifacts yet</p>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Artifacts created by the agent will collect here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <p className="text-[11px] font-medium text-gray-400 dark:text-slate-500 midnight:text-slate-500">
          {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="space-y-2">
        {artifacts.map((artifact) => (
          <ArtifactCard
            key={artifact._artifactKey || artifact.path || artifact.filename || artifact.title}
            artifact={artifact}
            onOpen={onSelectArtifact ? () => onSelectArtifact(artifact) : null}
          />
        ))}
      </div>
    </div>
  );
}

function ChatNavPanel({ items = [] }) {
  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <List className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No messages yet</p>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Messages will appear here as you chat.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-2 space-y-0.5">
      {items.map((item, i) => (
        <button
          key={item.domId}
          type="button"
          onClick={() => document.getElementById(item.domId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 midnight:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900/50 midnight:focus:ring-indigo-900/50"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-[10px] font-semibold text-gray-400 dark:text-slate-500 midnight:text-slate-500 tabular-nums w-4 shrink-0">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {item.goal ? (
                <p className="text-xs font-medium text-gray-700 dark:text-slate-200 midnight:text-slate-200 line-clamp-2 leading-snug">{item.goal}</p>
              ) : (
                <p className="text-xs font-medium text-gray-400 dark:text-slate-500 midnight:text-slate-500 italic">Agent message</p>
              )}
              {item.answerPreview && (
                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500 midnight:text-slate-500 line-clamp-1">{item.answerPreview}</p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SavedMessagesPanel({ highlights = null, onOpenMessage }) {
  const bookmarked = Array.isArray(highlights?.bookmarkedMessages) ? highlights.bookmarkedMessages : [];

  const renderItem = (item) => {
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onOpenMessage?.(item.id)}
        className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:border-amber-200 hover:bg-amber-50/60 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-amber-900/60 dark:hover:bg-amber-950/20 dark:focus:ring-amber-900/50 midnight:border-slate-800 midnight:bg-slate-950/60 midnight:hover:border-amber-900/60 midnight:hover:bg-amber-950/20 midnight:focus:ring-amber-900/50"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 midnight:text-slate-500">
          <BookMarked className="h-3 w-3 text-amber-500" />
          <span>{item.type === 'user' ? 'You' : 'Assistant'}</span>
        </div>
        <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-gray-700 dark:text-slate-200 midnight:text-slate-200">
          {item.content || 'Empty message'}
        </p>
      </button>
    );
  };

  if (!bookmarked.length) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-slate-400 midnight:text-slate-400">
        Bookmark messages you want to collect here. Click any bookmark to jump back to it in the chat.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 midnight:text-slate-300">
          <BookMarked className="h-3.5 w-3.5 text-amber-500" />
          Bookmarks
          <span className="text-[10px] font-normal text-gray-400">{bookmarked.length}</span>
        </h3>
        <div className="space-y-2">{bookmarked.map(renderItem)}</div>
      </section>
    </div>
  );
}


export default function CommandCenterSidePanel({
  activeTab,
  onClose,
  onBack,
  stepsItems = [],
  stepsLoading = false,
  isRunning = false,
  sourceCatalog = null,
  gitState = null,
  gitLoading = false,
  gitError = null,
  onGitRefresh,
  onGitChanged,
  onAttachGitFile,
  workingDir = null,
  workingContext = null,
  recentConversations = [],
  recentConversationsLoading = false,
  recentConversationsError = null,
  activeConversationIds = new Set(),
  currentConversationId = null,
  onOpenConversation,
  navigate,
  highlights = null,
  onOpenSavedMessage,
  previewUrl = null,
  artifacts = [],
  onSelectArtifact,
  selectedArtifact = null,
  chatNavItems = [],
  browserExecutorRef = null,
}) {
  const currentTab = activeTab === 'git' || activeTab === 'sandboxes' ? 'code' : (activeTab || 'steps');
  const meta = panelMeta[currentTab] || panelMeta.steps;
  const Icon = meta.icon;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#0f1724] midnight:bg-slate-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-slate-800 midnight:border-slate-800">
        {currentTab === 'artifact' && onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <Icon className="h-4 w-4 text-gray-500 dark:text-slate-400 midnight:text-slate-400" />
        )}
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400 midnight:text-slate-400">
          {meta.label}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {currentTab === 'steps' && (
          <AgentActivitySidebar items={stepsItems} isLoading={stepsLoading} isRunning={isRunning} />
        )}
        {currentTab === 'code' && (
          <CodePanel
            gitState={gitState}
            gitLoading={gitLoading}
            gitError={gitError}
            onGitRefresh={onGitRefresh}
            onGitChanged={onGitChanged}
            onAttachGitFile={onAttachGitFile}
            workingDir={workingDir}
            workingContext={workingContext}
          />
        )}
        {currentTab === 'media' && sourceCatalog && (
          <ChatSourcesMediaSidebar catalog={sourceCatalog} />
        )}
        {currentTab === 'history' && (
          <HistoryPanel
            recentConversations={recentConversations}
            recentConversationsLoading={recentConversationsLoading}
            recentConversationsError={recentConversationsError}
            activeConversationIds={activeConversationIds}
            currentConversationId={currentConversationId}
            handleOpenConversation={onOpenConversation}
            navigate={navigate}
          />
        )}
        {currentTab === 'saved' && (
          <SavedMessagesPanel highlights={highlights} onOpenMessage={onOpenSavedMessage} />
        )}
        {currentTab === 'preview' && (
          <PreviewPanel initialUrl={previewUrl} browserExecutorRef={browserExecutorRef} />
        )}
        {currentTab === 'artifacts' && (
          <ArtifactsPanel artifacts={artifacts} onSelectArtifact={onSelectArtifact} />
        )}
        {currentTab === 'artifact' && (
          <ArtifactPanel artifact={selectedArtifact} />
        )}
        {currentTab === 'nav' && (
          <ChatNavPanel items={chatNavItems} />
        )}
      </div>
    </div>
  );
}
