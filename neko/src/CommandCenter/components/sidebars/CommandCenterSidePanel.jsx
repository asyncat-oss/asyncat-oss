/* eslint-disable react/prop-types */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Activity, Code2, Image, X, History, BookMarked, Globe, RotateCcw, ExternalLink, AlertTriangle, WifiOff, FilePlus, ArrowLeft, ArrowRight, List, SquareTerminal, Bug, Camera, Plus, Lock, ShieldAlert, FileText } from 'lucide-react';
import AgentActivitySidebar from '../agent/AgentActivitySidebar';
import ChatSourcesMediaSidebar from './ChatSourcesMediaSidebar';
import HistoryPanel from './HistoryPanel';
import ArtifactCard from '../renderers/ArtifactRenderer';
import CodePanel from './CodePanel';
import TerminalPanel from './TerminalPanel';

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
  terminal: { label: 'Terminal', icon: SquareTerminal },
};

// ── Preview panel ─────────────────────────────────────────────────────────────

const isElectron = Boolean(window?.electronAPI);

function ElectronWebview({ url, onLoadStart, onLoadStop, onCrash, onLoadError, onNavigate, onTitle, onNavStateChange, webviewRef }) {
  const internalRef = useRef(null);
  const ref = webviewRef || internalRef;

  // Store all callbacks in a ref so the event-listener useEffect only runs once
  // (on mount). Inline arrow functions passed as props are recreated every render,
  // so putting them in deps would detach/re-attach listeners constantly.
  const cbs = useRef({});
  cbs.current = { onLoadStart, onLoadStop, onCrash, onLoadError, onNavigate, onTitle, onNavStateChange };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reportNavState = () => {
      try {
        cbs.current.onNavStateChange?.({ canGoBack: el.canGoBack(), canGoForward: el.canGoForward() });
      } catch { /* dom-ready not fired yet */ }
    };
    const start       = () => cbs.current.onLoadStart?.();
    const stop        = () => { cbs.current.onLoadStop?.(); reportNavState(); };
    const handleTitle = (e) => cbs.current.onTitle?.(e.title);
    // Route target="_blank" / popup links back into same webview instead of dropping them.
    const handleNewWindow = (e) => {
      e.preventDefault();
      if (e.url && !e.url.startsWith('about:')) el.loadURL(e.url);
    };
    const handleNavigate = (e) => { cbs.current.onNavigate?.(e.url); reportNavState(); };
    const handleCrash    = () => cbs.current.onCrash?.();
    const handleGone     = () => cbs.current.onCrash?.();
    const handleFailLoad = (e) => {
      if (e.errorCode === -3) return;        // ERR_ABORTED — intentional cancel
      if (e.isMainFrame === false) return;   // sub-resource failure — ignore
      cbs.current.onLoadError?.(e.errorCode, e.errorDescription);
    };
    el.addEventListener('did-start-loading',    start);
    el.addEventListener('did-stop-loading',     stop);
    el.addEventListener('did-fail-load',        handleFailLoad);
    el.addEventListener('new-window',           handleNewWindow);
    el.addEventListener('did-navigate',         handleNavigate);
    el.addEventListener('did-navigate-in-page', handleNavigate);
    el.addEventListener('page-title-updated',   handleTitle);
    el.addEventListener('crashed',              handleCrash);
    el.addEventListener('render-process-gone',  handleGone);
    return () => {
      el.removeEventListener('did-start-loading',    start);
      el.removeEventListener('did-stop-loading',     stop);
      el.removeEventListener('did-fail-load',        handleFailLoad);
      el.removeEventListener('new-window',           handleNewWindow);
      el.removeEventListener('did-navigate',         handleNavigate);
      el.removeEventListener('did-navigate-in-page', handleNavigate);
      el.removeEventListener('page-title-updated',   handleTitle);
      el.removeEventListener('crashed',              handleCrash);
      el.removeEventListener('render-process-gone',  handleGone);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — latest callbacks always read from cbs ref

  // partition="sandbox" = in-memory session isolated from the main Asyncat app
  // eslint-disable-next-line react/no-unknown-property
  return <webview ref={ref} src={url} partition="sandbox" style={{ width: '100%', height: '100%', display: 'flex', border: 'none' }} />;
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

function PreviewPanel({ initialUrl, browserExecutorRef }) {
  // ── Tab state ─────────────────────────────────────────────────────────────
  // Each tab: { id, url, inputUrl, title, key, loading, crashed, error }
  // All tabs that have a URL get a webview mounted. Inactive ones are
  // hidden (display:none) and audio-muted — like real browser background tabs.
  // Tab URLs are persisted to sessionStorage so they survive page refresh.
  const tabSeq = useRef(2); // first tab = 't-1'; new tabs count up from 2

  const [tabs, setTabs] = useState(() => {
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
    } catch {}
    return [{
      id: 't-1', url: initialUrl || '', inputUrl: initialUrl || '',
      title: initialUrl ? 'Loading…' : 'New Tab',
      key: 0, loading: Boolean(initialUrl), crashed: false, error: null,
    }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('asyncat_web_tabs') || 'null');
      if (saved?.activeTabId && Array.isArray(saved?.tabs) && saved.tabs.some(t => t.id === saved.activeTabId)) {
        return saved.activeTabId;
      }
    } catch {}
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
  }, []);

  const navigateTab = useCallback((id, rawUrl) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    let full;
    if (/^(https?|file|about|data|blob|chrome):/.test(trimmed)) {
      // Already has a recognised protocol — use as-is
      full = trimmed;
    } else if (
      /^localhost(:\d+)?(\/|$)/.test(trimmed) ||            // localhost[:port]
      /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed) || // IPv4
      /^[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+([/?#].*)?$/.test(trimmed) // domain.tld
    ) {
      // Looks like a URL — add https://
      full = `https://${trimmed}`;
    } else {
      // Treat as a search query → Brave Search
      full = `https://search.brave.com/search?q=${encodeURIComponent(trimmed)}`;
    }
    setTabs(prev => prev.map(t => t.id === id
      ? { ...t, url: full, inputUrl: full, key: t.key + 1, loading: true, error: null, crashed: false, title: 'Loading…' }
      : t));
  }, []);

  const reloadTab = useCallback((id) =>
    setTabs(prev => prev.map(t => t.id === id
      ? { ...t, key: t.key + 1, loading: true, error: null, crashed: false }
      : t)), []);

  // ── Sync when agent calls preview_navigate ────────────────────────────────
  const prevInitialUrl = useRef(initialUrl || null);
  useEffect(() => {
    if (!initialUrl || initialUrl === prevInitialUrl.current) return;
    prevInitialUrl.current = initialUrl;
    navigateTab(activeTabIdRef.current, initialUrl);
  }, [initialUrl, navigateTab]);

  // ── Persist tab URLs to sessionStorage (survives refresh) ────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem('asyncat_web_tabs', JSON.stringify({
        tabs: tabs.map(({ id, url, inputUrl, title }) => ({ id, url, inputUrl, title })),
        activeTabId,
      }));
    } catch {}
  }, [tabs, activeTabId]);

  // ── Mute hidden tabs so background webviews don't leak audio ─────────────
  // Guard with try/catch: setAudioMuted throws if the webview hasn't fired
  // dom-ready yet. A freshly-mounted webview can't play audio anyway, so
  // skipping the mute call on those is safe.
  useEffect(() => {
    tabsRef.current.forEach(tab => {
      const wv = tabRefs.current[tab.id]?.current;
      if (!wv?.setAudioMuted) return;
      try {
        wv.setAudioMuted(tab.id !== activeTabId);
      } catch {
        // dom-ready hasn't fired yet for this webview — ignore
      }
    });
  }, [activeTabId]);

  // ── Browser command executor ──────────────────────────────────────────────
  const executeBrowserCommand = useCallback(async ({
    action, selector, value, url: navUrl, code, direction, amount, index: tabIndex,
  }) => {
    // ── Tab management ──────────────────────────────────────────────────────
    if (action === 'list_tabs') {
      const aid = activeTabIdRef.current;
      return { success: true, tabs: tabsRef.current.map((t, i) => ({ index: i, id: t.id, url: t.url, title: t.title, active: t.id === aid })) };
    }
    if (action === 'open_tab') {
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
          webview.loadURL(navUrl);
          await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('Navigation timed out after 10s')), 10000);
            webview.addEventListener('did-stop-loading', () => { clearTimeout(t); resolve(); }, { once: true });
          });
          return { success: true, url: navUrl };
        }
        case 'click':
          return webview.executeJavaScript(`(function(){
            var sel=${JSON.stringify(selector)},el=document.querySelector(sel);
            if(!el)return{success:false,error:'Element not found: '+sel};
            el.scrollIntoView({behavior:'instant',block:'center'});el.click();
            return{success:true,tag:el.tagName,text:(el.textContent||'').trim().slice(0,80)};
          })()`);
        case 'fill':
          return webview.executeJavaScript(`(function(){
            var sel=${JSON.stringify(selector)},el=document.querySelector(sel);
            if(!el)return{success:false,error:'Element not found: '+sel};
            el.focus();el.value=${JSON.stringify(value)};
            el.dispatchEvent(new Event('input',{bubbles:true}));
            el.dispatchEvent(new Event('change',{bubbles:true}));
            return{success:true};
          })()`);
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
  }, [addTab, closeTab]);

  // ── Register executor with parent ─────────────────────────────────────────
  useEffect(() => {
    if (!browserExecutorRef || !isElectron) return;
    browserExecutorRef.current = executeBrowserCommand;
    return () => { if (browserExecutorRef.current === executeBrowserCommand) browserExecutorRef.current = null; };
  }, [browserExecutorRef, executeBrowserCommand]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col min-h-0">

      {/* ── Tab strip ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/80 dark:bg-gray-950 midnight:bg-slate-950 px-1 py-0.5 min-w-0">
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
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
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
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-2 py-1.5">
        {/* Back / Forward */}
        <button
          type="button"
          disabled={!tabNavStates[activeTabId]?.canGoBack}
          onClick={() => { try { tabRefs.current[activeTabId]?.current?.goBack(); } catch {} }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title="Go back"
        >
          <ArrowLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          disabled={!tabNavStates[activeTabId]?.canGoForward}
          onClick={() => { try { tabRefs.current[activeTabId]?.current?.goForward(); } catch {} }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-default dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title="Go forward"
        >
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => reloadTab(activeTabId)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title="Reload"
        >
          <RotateCcw className="h-3 w-3" />
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
            if (u.startsWith('file://'))
              return <FileText className="h-3 w-3 shrink-0 text-gray-400" title="Local file" />;
            return null;
          })()}
          <input
            value={activeTab?.inputUrl || ''}
            onChange={e => updateTab(activeTabId, { inputUrl: e.target.value })}
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-mono text-gray-700 outline-none transition-colors focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-200 midnight:focus:border-indigo-500 midnight:focus:ring-indigo-500/30"
            placeholder="Search or enter address"
            spellCheck={false}
          />
        </form>
        {activeTab?.url && (
          <>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(activeTab.url).catch(() => {})}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Copy URL"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <a
              href={activeTab.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Open in system browser"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
        {isElectron && activeTab?.url && (
          <>
            <button
              type="button"
              onClick={() => tabRefs.current[activeTabId]?.current?.openDevTools()}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Open DevTools"
            >
              <Bug className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const image = await tabRefs.current[activeTabId]?.current?.capturePage();
                  const dataUrl = image?.toDataURL?.();
                  if (!dataUrl) return;
                  const a = document.createElement('a');
                  a.href = dataUrl; a.download = `web-${Date.now()}.png`; a.click();
                } catch {
                  const dataUrl = await window.electronAPI.captureScreen();
                  if (!dataUrl) return;
                  const a = document.createElement('a');
                  a.href = dataUrl; a.download = `web-${Date.now()}.png`; a.click();
                }
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Save screenshot"
            >
              <Camera className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* ── Webview area ──────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1 bg-white dark:bg-gray-950 midnight:bg-slate-950">

        {/* Empty state — active tab has no URL yet */}
        {!activeTab?.url && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center px-6">
              <Globe className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">New tab</p>
              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                Type a URL in the address bar or ask the agent to browse the web.
              </p>
            </div>
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
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Can't connect</p>
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
              key={tab.key}
              url={tab.url}
              webviewRef={getOrCreateTabRef(tab.id)}
              onLoadStart={() => updateTab(tab.id, { loading: true, error: null })}
              onLoadStop={() => updateTab(tab.id, { loading: false })}
              onCrash={() => updateTab(tab.id, { crashed: true, loading: false })}
              onLoadError={(code, desc) => updateTab(tab.id, { error: { code, description: desc }, loading: false })}
              onNavigate={newUrl => { if (newUrl && !newUrl.startsWith('about:')) updateTab(tab.id, { inputUrl: newUrl, error: null }); }}
              onTitle={title => { if (title) updateTab(tab.id, { title }); }}
              onNavStateChange={state => updateTabNavState(tab.id, state)}
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
  agentTerminalOutput = [],
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
        {currentTab === 'terminal' && (
          <TerminalPanel workingDir={workingDir} agentOutput={agentTerminalOutput} />
        )}
      </div>
    </div>
  );
}
