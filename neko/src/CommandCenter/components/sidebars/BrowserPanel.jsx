import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, AppWindow, ArrowLeft, ArrowRight, Bug, Camera, ChevronDown, ChevronUp, Copy, Download, ExternalLink,
  FileText, Ghost, Globe, Hand, History, Lock, Maximize2, Minimize2, MoreHorizontal, Pause, Play, Plus, RotateCcw,
  Search, ShieldAlert, Sparkles, Trash2, Volume2, VolumeX, WifiOff, X,
} from 'lucide-react';
import eventBus from '../../../utils/eventBus.js';
import { useUiPreferences } from '../../../contexts/UiPreferencesContext.jsx';
import { openWebLink } from '../../../utils/openWebLink.js';
import { connectionKind, rectsIntersect, resolveAddress, samplePoints, stripTabs } from '../../utils/browserPanel.js';

const MAIN_API = import.meta.env.VITE_MAIN_URL || 'http://127.0.0.1:8716';
const BROWSER_API = `${MAIN_API}/api/browser`;
const FILE_SITE_API = `${MAIN_API}/api/files/site`;

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

// Requests from the chat (links, previews) already opened, across remounts.
const handledRequests = new Set();

function networkErrorMessage(code) {
  switch (code) {
    case -102: return 'Connection refused. The server may not be running yet.';
    case -105: return 'Hostname not found. Check the address.';
    case -118: return 'The connection timed out. The server isn\'t responding.';
    case -6: return 'Page not found.';
    case -21: return 'The network changed. Try reloading.';
    case -20: return 'Asyncat blocked this address.';
    default: return 'The page couldn\'t be loaded.';
  }
}

function IconButton({ icon: Icon, label, onClick, disabled = false, active = false, className = '', children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-35 ${active ? 'bg-selected text-fg' : ''} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/** Live state of the browser tabs owned by the desktop app. */
function useHostState(api, prefs) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const off = api.onState((next) => { if (alive && next) setState(next); });
    api.ui('init', {
      mode: prefs.browserProfile === 'persistent' ? 'standard' : 'incognito',
      openLinks: prefs.browserOpenLinks,
    }).then((initial) => { if (alive && initial) setState(initial); }).catch(() => {});
    return () => { alive = false; off?.(); };
  // Preferences only seed the first launch; later changes go through set-open-links.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  useEffect(() => {
    api.ui('set-open-links', { openLinks: prefs.browserOpenLinks }).catch(() => {});
  }, [api, prefs.browserOpenLinks]);
  return state;
}

/**
 * Keep the page (a native view drawn above the app) exactly over `ref`, and
 * take it off screen while something of the app's own covers that area
 * (menus, dialogs, tooltips): a still picture of the page stands in for it.
 */
function usePageViewport(ref, api, { live }) {
  const [frozen, setFrozen] = useState(null);
  useEffect(() => {
    if (!live) {
      api.setViewport({ rect: null }).catch(() => {});
      setFrozen(null);
      return undefined;
    }
    let lastKey = '';
    let covered = false;
    let disposed = false;

    const coveredNow = (el, rect) => {
      for (const point of samplePoints(rect)) {
        if (point.x < 0 || point.y < 0 || point.x >= window.innerWidth || point.y >= window.innerHeight) continue;
        const hit = document.elementFromPoint(point.x, point.y);
        if (hit && hit !== el && !el.contains(hit)) return true;
      }
      // Tooltips and similar overlays don't take clicks, so look for them too.
      const floating = document.querySelectorAll('[role="tooltip"], [role="menu"], [role="dialog"], [role="listbox"], [data-floating-overlay]');
      for (const node of floating) {
        if (el.contains(node)) continue;
        const box = node.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && rectsIntersect(rect, box)) return true;
      }
      return false;
    };

    const check = async () => {
      const el = ref.current;
      if (!el || disposed) return;
      const rect = el.getBoundingClientRect();
      if (coveredNow(el, rect)) {
        if (!covered) {
          covered = true;
          lastKey = '';
          const result = await api.setViewport({ rect: null, freeze: true }).catch(() => null);
          if (!disposed && covered) setFrozen(result?.frozen || null);
        }
        return;
      }
      covered = false;
      const next = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      const key = `${Math.round(next.x)}:${Math.round(next.y)}:${Math.round(next.width)}:${Math.round(next.height)}`;
      if (key === lastKey) return;
      lastKey = key;
      await api.setViewport({ rect: next }).catch(() => {});
      if (!disposed && !covered) setFrozen(null);
    };

    const timer = setInterval(check, 150);
    const observer = new ResizeObserver(() => { check(); });
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('resize', check);
    check();
    return () => {
      disposed = true;
      clearInterval(timer);
      observer.disconnect();
      window.removeEventListener('resize', check);
      api.setViewport({ rect: null }).catch(() => {});
    };
  }, [api, live, ref]);
  return frozen;
}

function HostBrowser({ api, request, workingContext }) {
  const { workbenchPreferences: prefs } = useUiPreferences();
  const state = useHostState(api, prefs);
  const tabs = useMemo(() => stripTabs(state), [state]);
  const activeTab = tabs.find((tab) => tab.id === state?.activeTabId) || null;
  const incognito = state?.mode === 'incognito';
  const historyEnabled = prefs.browserHistoryEnabled && !incognito;

  const [inputs, setInputs] = useState({});
  const [localErrors, setLocalErrors] = useState({});
  const [startQuery, setStartQuery] = useState('');
  const [menu, setMenu] = useState(null); // 'more' | 'history' | 'downloads'
  const [find, setFind] = useState({ open: false, query: '', active: 0, total: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [recentlyClosed, setRecentlyClosed] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('asyncat_web_recently_closed') || '[]');
      return Array.isArray(saved) ? saved.slice(0, 20) : [];
    } catch { return []; }
  });
  const [now, setNow] = useState(() => Date.now());
  const addressRef = useRef(null);
  const findRef = useRef(null);
  const pageRef = useRef(null);
  const lastHistory = useRef({ url: '', at: 0 });

  const localError = activeTab ? localErrors[activeTab.id] : null;
  const showsPage = Boolean(activeTab?.url && !activeTab.popup && !activeTab.crashed && !activeTab.error && !localError);
  // The panel's own menus over the page count as covering it (see usePageViewport).
  const frozen = usePageViewport(pageRef, api, { live: showsPage });

  // Agent activity pulse.
  const agentRecentlyActive = tabs.some((tab) => tab.lastAgentAt && now - tab.lastAgentAt < 2500);
  useEffect(() => {
    if (!agentRecentlyActive) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 800);
    return () => clearInterval(timer);
  }, [agentRecentlyActive]);
  useEffect(() => {
    if (!state) return;
    setNow(Date.now());
  }, [state]);

  useEffect(() => {
    if (incognito) return;
    try { sessionStorage.setItem('asyncat_web_recently_closed', JSON.stringify(recentlyClosed)); } catch { /* storage may be unavailable */ }
  }, [incognito, recentlyClosed]);

  const ui = useCallback((action, payload) => api.ui(action, payload).catch(() => null), [api]);

  const openAddress = useCallback((tabId, raw) => {
    const resolved = resolveAddress(raw, { searchEngine: prefs.browserSearchEngine, workingContext, fileSiteApi: FILE_SITE_API });
    if (resolved.error) {
      setLocalErrors((previous) => ({ ...previous, [tabId]: { title: 'Can\'t open this address', message: resolved.error } }));
      return;
    }
    setLocalErrors((previous) => ({ ...previous, [tabId]: null }));
    setInputs((previous) => ({ ...previous, [tabId]: resolved.sourceUrl || undefined }));
    ui('navigate', { tabId, url: resolved.url });
  }, [prefs.browserSearchEngine, ui, workingContext]);

  const closeTab = useCallback((tab) => {
    if (!tab) return;
    if (!incognito && tab.url && !tab.popup) {
      setRecentlyClosed((previous) => [{ url: tab.url, title: tab.title || tab.url }, ...previous.filter((item) => item.url !== tab.url)].slice(0, 20));
    }
    ui('close-tab', { tabId: tab.id });
  }, [incognito, ui]);

  const reopenClosed = useCallback(() => {
    const [latest, ...rest] = recentlyClosed;
    if (!latest?.url) return;
    setRecentlyClosed(rest);
    ui('new-tab', { url: latest.url });
  }, [recentlyClosed, ui]);

  const runFind = useCallback((query, { forward = true, findNext = false } = {}) => {
    if (!activeTab) return;
    ui('find', { tabId: activeTab.id, text: query, forward, findNext });
    if (!query) setFind((current) => ({ ...current, active: 0, total: 0 }));
  }, [activeTab, ui]);

  const openFind = useCallback(() => {
    setFind((current) => ({ ...current, open: true }));
    setTimeout(() => findRef.current?.focus(), 30);
  }, []);

  const closeFind = useCallback(() => {
    if (activeTab) ui('stop-find', { tabId: activeTab.id });
    setFind({ open: false, query: '', active: 0, total: 0 });
  }, [activeTab, ui]);

  const exitFullscreen = useCallback(() => {
    if (activeTab) ui('exit-fullscreen', { tabId: activeTab.id });
    setFullscreen(false);
  }, [activeTab, ui]);

  const handleShortcut = useCallback((name) => {
    if (name === 'focus-location') { addressRef.current?.focus(); addressRef.current?.select(); }
    else if (name === 'new-tab') ui('new-tab', {});
    else if (name === 'close-tab') closeTab(activeTab);
    else if (name === 'reopen-tab') reopenClosed();
    else if (name === 'reload' && activeTab) ui('reload', { tabId: activeTab.id });
    else if (name === 'history') setMenu((current) => (current === 'history' ? null : 'history'));
    else if (name === 'find') openFind();
    else if (name === 'toggle-fullscreen') { if (fullscreen) exitFullscreen(); else setFullscreen(true); }
    else if (name === 'exit-fullscreen' && fullscreen) exitFullscreen();
  }, [activeTab, closeTab, exitFullscreen, fullscreen, openFind, reopenClosed, ui]);

  const recordHistory = useCallback((event) => {
    if (!historyEnabled || event.profile !== 'standard') return;
    const url = event.url || '';
    if (!/^https?:\/\//i.test(url) || url.startsWith(FILE_SITE_API)) return;
    const at = Date.now();
    if (lastHistory.current.url === url && at - lastHistory.current.at < 30000) return;
    lastHistory.current = { url, at };
    fetch(`${BROWSER_API}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title: event.title || '' }),
    }).catch(() => {});
  }, [historyEnabled]);

  // Events from the desktop app: find results, page loads, shortcuts typed
  // inside a page, HTML full screen.
  const eventHandlers = useRef({});
  eventHandlers.current = { handleShortcut, recordHistory, activeTabId: activeTab?.id };
  useEffect(() => api.onEvent((event) => {
    const handlers = eventHandlers.current;
    if (event?.type === 'found-in-page' && event.tabId === handlers.activeTabId) {
      const result = event.result || {};
      setFind((current) => ({ ...current, active: result.activeMatchOrdinal || 0, total: result.matches || 0 }));
    } else if (event?.type === 'page-loaded') {
      handlers.recordHistory(event);
    } else if (event?.type === 'shortcut') {
      handlers.handleShortcut(event.name);
    } else if (event?.type === 'fullscreen') {
      setFullscreen(Boolean(event.on));
    }
  }), [api]);

  // Links and previews from the chat.
  useEffect(() => {
    if (!state || !request?.key || handledRequests.has(request.key)) return;
    handledRequests.add(request.key);
    if (request.tabId) {
      ui('open', { tabId: request.tabId, url: request.url || '' });
      return;
    }
    if (!request.url) return;
    const resolved = resolveAddress(request.url, { searchEngine: prefs.browserSearchEngine, workingContext, fileSiteApi: FILE_SITE_API });
    if (resolved.url) ui('open', { url: resolved.url });
  }, [prefs.browserSearchEngine, request, state, ui, workingContext]);

  // History list.
  const loadHistory = useCallback(async () => {
    if (!historyEnabled) { setHistoryItems([]); return; }
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
    if (menu !== 'history') return undefined;
    const timeout = setTimeout(loadHistory, 150);
    return () => clearTimeout(timeout);
  }, [loadHistory, menu]);

  // Full screen: the panel covers the window; Escape leaves.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
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
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [exitFullscreen, fullscreen]);

  const handlePanelKey = useCallback((event) => {
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    let name = null;
    if (event.key === 'F11') name = 'toggle-fullscreen';
    else if (command && key === 'f') name = 'find';
    else if (command && key === 'l') name = 'focus-location';
    else if (command && event.shiftKey && key === 't') name = 'reopen-tab';
    else if (command && key === 't') name = 'new-tab';
    else if (command && key === 'w') name = 'close-tab';
    else if (command && key === 'r') name = 'reload';
    else if (command && key === 'h') name = 'history';
    if (name) {
      event.preventDefault();
      handleShortcut(name);
      return;
    }
    if (event.altKey && event.key === 'ArrowLeft' && activeTab) { event.preventDefault(); ui('back', { tabId: activeTab.id }); }
    if (event.altKey && event.key === 'ArrowRight' && activeTab) { event.preventDefault(); ui('forward', { tabId: activeTab.id }); }
  }, [activeTab, handleShortcut, ui]);

  const askAgent = useCallback(async () => {
    if (!activeTab?.url) return;
    const text = String(await ui('page-text', { tabId: activeTab.id }) || '').trim();
    const excerpt = text.slice(0, 2000);
    const title = activeTab.title && activeTab.title !== 'Loading…' ? activeTab.title : '';
    const prompt = [
      'Here is the web page I have open in the browser panel. Help me with it.',
      '',
      title ? `Title: ${title}` : null,
      `URL: ${activeTab.url}`,
      excerpt ? `\n"""\n${excerpt}${text.length > 2000 ? '\n…(truncated)' : ''}\n"""` : null,
      '',
    ].filter((line) => line !== null).join('\n');
    eventBus.emit('composer:prefill', prompt);
  }, [activeTab, ui]);

  const saveScreenshot = useCallback(async () => {
    if (!activeTab) return;
    const dataUrl = await ui('capture', { tabId: activeTab.id });
    if (!dataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `web-${Date.now()}.png`;
    anchor.click();
  }, [activeTab, ui]);

  if (!state) {
    return <div className="flex h-full items-center justify-center bg-surface text-xs text-fg-subtle">Starting the browser…</div>;
  }

  const handover = state.handover;
  const inputValue = activeTab ? (inputs[activeTab.id] ?? activeTab.url ?? '') : '';
  const connection = connectionKind(activeTab?.url);
  const agentRecent = (tab) => tab.lastAgentAt && now - tab.lastAgentAt < 2500;
  const downloadsActive = state.downloads.some((item) => item.state === 'progressing');

  return (
    <div
      className={`flex min-h-0 flex-col bg-surface ${fullscreen ? 'fixed inset-0 z-[100] h-dvh w-dvw' : 'h-full'}`}
      onKeyDown={handlePanelKey}
    >
      {/* Tabs */}
      <div className={`flex min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1 py-1 ${incognito ? 'border-violet-200 bg-violet-50/60 dark:border-violet-900/50 dark:bg-violet-950/20 midnight:border-violet-900/50 midnight:bg-violet-950/20' : 'border-line bg-canvas'}`}>
        {tabs.map((tab) => {
          const active = tab.id === state.activeTabId;
          const TabIcon = tab.popup ? AppWindow : tab.agent ? Sparkles : Globe;
          const tip = tab.popup
            ? 'Pop-up window (click to bring it forward)'
            : tab.agent
              ? 'Opened by Asyncat. Uses your Standard browser profile, so sign-ins here are kept.'
              : tab.title;
          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              title={tip}
              onClick={() => ui('activate', { tabId: tab.id })}
              onKeyDown={(event) => { if (event.key === 'Enter') ui('activate', { tabId: tab.id }); }}
              className={`group flex min-w-0 max-w-[160px] shrink-0 cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${active ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:bg-hover hover:text-fg'}`}
            >
              {tab.loading
                ? <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-line-strong border-t-accent" />
                : <TabIcon className={`h-3 w-3 shrink-0 ${tab.agent ? 'text-accent' : 'opacity-60'} ${agentRecent(tab) ? 'animate-pulse' : ''}`} />}
              <span className="min-w-0 flex-1 truncate">{tab.title || (tab.url ? tab.url : 'New tab')}</span>
              {tab.audible && !tab.muted && <Volume2 className="h-3 w-3 shrink-0 opacity-60" />}
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); closeTab(tab); }}
                className="shrink-0 rounded p-0.5 text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover:opacity-100"
                title="Close tab"
                aria-label="Close tab"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <IconButton icon={Plus} label="New tab" onClick={() => ui('new-tab', {})} />
      </div>

      {/* Address bar */}
      <div className="relative flex shrink-0 items-center gap-0.5 border-b border-line px-1.5 py-1">
        <IconButton icon={ArrowLeft} label="Back" disabled={!activeTab?.canGoBack} onClick={() => ui('back', { tabId: activeTab.id })} />
        <IconButton icon={ArrowRight} label="Forward" disabled={!activeTab?.canGoForward} onClick={() => ui('forward', { tabId: activeTab.id })} />
        <IconButton
          icon={activeTab?.loading ? X : RotateCcw}
          label={activeTab?.loading ? 'Stop' : 'Reload'}
          disabled={!activeTab?.url}
          onClick={() => ui(activeTab?.loading ? 'stop' : 'reload', { tabId: activeTab.id })}
        />
        <form
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line bg-canvas px-2 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/25"
          onSubmit={(event) => { event.preventDefault(); if (activeTab) openAddress(activeTab.id, inputValue); }}
        >
          {connection === 'secure' || connection === 'local'
            ? <Lock className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" title="Secure connection" />
            : connection === 'insecure'
              ? <span className="flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-400" title="Not encrypted. Don't enter private details here."><ShieldAlert className="h-3 w-3" /><span className="text-[9px] font-semibold uppercase tracking-wide">Not secure</span></span>
              : <Search className="h-3 w-3 shrink-0 text-fg-subtle" />}
          <input
            ref={addressRef}
            value={inputValue}
            onChange={(event) => activeTab && setInputs((previous) => ({ ...previous, [activeTab.id]: event.target.value }))}
            onFocus={(event) => event.target.select()}
            className="min-w-0 flex-1 bg-transparent py-1 font-mono text-[11px] text-fg outline-none placeholder:text-fg-subtle"
            placeholder="Search or enter address"
            spellCheck={false}
            disabled={!activeTab || activeTab.popup}
          />
        </form>
        <IconButton
          icon={Ghost}
          label={incognito ? 'Incognito is on. Switch to Standard browsing' : 'Switch to Incognito browsing'}
          active={incognito}
          className={incognito ? '!bg-violet-100 !text-violet-700 dark:!bg-violet-950/50 dark:!text-violet-300' : ''}
          onClick={() => ui('set-mode', { mode: incognito ? 'standard' : 'incognito' })}
        />
        {activeTab?.url && !activeTab.popup && (
          <IconButton icon={Sparkles} label="Ask Asyncat about this page" onClick={askAgent} />
        )}
        <IconButton
          icon={state.agentPaused ? Play : Pause}
          label={state.agentPaused ? 'Let Asyncat use the browser again' : 'Stop Asyncat using the browser'}
          active={state.agentPaused || agentRecentlyActive}
          className={state.agentPaused ? '!bg-amber-100 !text-amber-700 dark:!bg-amber-950/40 dark:!text-amber-300' : agentRecentlyActive ? '!text-accent' : ''}
          onClick={() => ui('pause-agent', { paused: !state.agentPaused })}
        >
          {state.agentPaused ? <span className="text-[10px] font-medium">Paused</span> : null}
        </IconButton>
        <IconButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? 'Exit full screen (Esc)' : 'Full screen (F11)'} active={fullscreen} onClick={() => (fullscreen ? exitFullscreen() : setFullscreen(true))} />
        <IconButton icon={History} label="History and recently closed (Ctrl+H)" active={menu === 'history'} onClick={() => setMenu((current) => (current === 'history' ? null : 'history'))} />
        {state.downloads.length > 0 && (
          <div className="relative">
            <IconButton icon={Download} label="Downloads" active={menu === 'downloads'} onClick={() => setMenu((current) => (current === 'downloads' ? null : 'downloads'))} />
            {downloadsActive && <span className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
          </div>
        )}
        <IconButton icon={MoreHorizontal} label="More" active={menu === 'more'} onClick={() => setMenu((current) => (current === 'more' ? null : 'more'))} />

        {menu === 'more' && (
          <div className="absolute right-1.5 top-full z-40 mt-1 w-56 rounded-lg border border-line bg-elevated p-1 shadow-xl" data-floating-overlay>
            {[
              { label: 'Copy address', icon: Copy, run: () => navigator.clipboard.writeText(activeTab?.url || '').catch(() => {}), show: Boolean(activeTab?.url) },
              { label: 'Find in page', icon: Search, run: openFind, show: Boolean(activeTab?.url) },
              { label: activeTab?.muted ? 'Unmute tab' : 'Mute tab', icon: activeTab?.muted ? Volume2 : VolumeX, run: () => ui('mute', { tabId: activeTab.id, muted: !activeTab.muted }), show: Boolean(activeTab?.url) },
              { label: 'Save screenshot', icon: Camera, run: saveScreenshot, show: showsPage },
              { label: 'Open in system browser', icon: ExternalLink, run: () => openWebLink(activeTab.url, 'system'), show: /^https?:/i.test(activeTab?.url || '') },
              { label: 'Developer tools', icon: Bug, run: () => ui('devtools', { tabId: activeTab.id }), show: Boolean(prefs.browserDeveloperTools && activeTab?.url) },
            ].filter((item) => item.show).map((item) => {
              const ItemIcon = item.icon;
              return (
                <button key={item.label} type="button" onClick={() => { item.run(); setMenu(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-hover hover:text-fg">
                  <ItemIcon className="h-3.5 w-3.5" />{item.label}
                </button>
              );
            })}
            <p className="px-2 pb-1 pt-1.5 text-[10px] leading-4 text-fg-subtle">Tabs Asyncat opens use your Standard profile, so a site you sign in to there stays signed in for Asyncat.</p>
          </div>
        )}
      </div>

      {/* Find bar */}
      {find.open && (
        <div className="flex shrink-0 items-center gap-1 border-b border-line bg-canvas px-2 py-1">
          <Search className="h-3 w-3 shrink-0 text-fg-subtle" />
          <input
            ref={findRef}
            value={find.query}
            onChange={(event) => { const query = event.target.value; setFind((current) => ({ ...current, query })); runFind(query); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); runFind(find.query, { forward: !event.shiftKey, findNext: true }); }
              else if (event.key === 'Escape') { event.preventDefault(); closeFind(); }
            }}
            placeholder="Find in page"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle"
          />
          <span className="min-w-[40px] text-right text-[10px] tabular-nums text-fg-subtle">{find.total ? `${find.active}/${find.total}` : '0/0'}</span>
          <IconButton icon={ChevronUp} label="Previous match" onClick={() => runFind(find.query, { forward: false, findNext: true })} />
          <IconButton icon={ChevronDown} label="Next match" onClick={() => runFind(find.query, { forward: true, findNext: true })} />
          <IconButton icon={X} label="Close (Esc)" onClick={closeFind} />
        </div>
      )}

      {/* Asyncat is waiting for the user */}
      {handover && (
        <div className="flex shrink-0 items-start gap-2 border-b border-accent/30 bg-accent-soft px-3 py-2">
          <Hand className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-fg">Asyncat is waiting for you</p>
            <p className="mt-0.5 text-xs leading-5 text-fg-muted">{handover.message} Then press Continue. Asyncat won&apos;t see what you type.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => ui('handover-done', { id: handover.id, outcome: 'cancelled' })} className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg">Skip</button>
            <button type="button" onClick={() => ui('handover-done', { id: handover.id, outcome: 'done' })} className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white shadow-sm hover:opacity-90 dark:text-gray-950">Continue</button>
          </div>
        </div>
      )}

      {/* An Asyncat tab while browsing in Incognito: say whose profile it uses */}
      {activeTab?.agent && incognito && !handover && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-canvas px-3 py-1 text-[10px] text-fg-muted">
          <Sparkles className="h-3 w-3 shrink-0 text-accent" />
          Asyncat&apos;s tab uses your Standard profile, not Incognito: sign-ins here are kept for Asyncat.
        </div>
      )}

      {/* Page area: the desktop app draws the page over this box */}
      <div className="relative min-h-0 flex-1 bg-surface">
        <div ref={pageRef} className="absolute inset-0" />

        {frozen && showsPage && (
          <img src={frozen} alt="" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-left-top" />
        )}

        {menu === 'history' && (
          <div className="absolute right-2 top-2 z-40 flex max-h-[75%] w-[min(340px,calc(100%-16px))] flex-col overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl" data-floating-overlay>
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <History className="h-3.5 w-3.5 text-fg-subtle" />
              <span className="flex-1 text-xs font-semibold text-fg">Browser history</span>
              {historyEnabled && historyItems.length > 0 && (
                <button type="button" onClick={async () => { await fetch(`${BROWSER_API}/history`, { method: 'DELETE' }).catch(() => {}); setHistoryItems([]); }} className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-red-500" title="Clear history"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
              <button type="button" onClick={() => setMenu(null)} className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg" title="Close"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="min-h-0 overflow-y-auto p-2">
              {historyEnabled && (
                <div className="mb-2 flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2">
                  <Search className="h-3 w-3 shrink-0 text-fg-subtle" />
                  <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search history" className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-fg outline-none placeholder:text-fg-subtle" />
                </div>
              )}
              {recentlyClosed.length > 0 && (
                <section className="mb-3">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Recently closed</p>
                    <button type="button" onClick={() => setRecentlyClosed([])} className="text-[10px] text-fg-subtle hover:text-fg">Clear</button>
                  </div>
                  {recentlyClosed.slice(0, 5).map((item, index) => (
                    <button key={`${item.url}-${index}`} type="button" onClick={() => { ui('new-tab', { url: item.url }); setRecentlyClosed((previous) => previous.filter((_, i) => i !== index)); setMenu(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover">
                      <RotateCcw className="h-3 w-3 shrink-0 text-fg-subtle" />
                      <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{item.title || item.url}</span>
                    </button>
                  ))}
                </section>
              )}
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Visited pages</p>
              {!historyEnabled && <p className="px-2 py-4 text-center text-xs text-fg-subtle">{incognito ? 'Incognito pages are not saved to history.' : 'History is turned off in Settings → Workbench.'}</p>}
              {historyEnabled && historyLoading && <p className="px-2 py-4 text-center text-xs text-fg-subtle">Loading…</p>}
              {historyEnabled && !historyLoading && historyItems.length === 0 && <p className="px-2 py-4 text-center text-xs text-fg-subtle">No browsing history yet.</p>}
              {historyItems.map((item) => (
                <div key={item.id} className="group flex items-center gap-1 rounded-md hover:bg-hover">
                  <button type="button" onClick={() => { ui('new-tab', { url: item.url }); setMenu(null); }} className="min-w-0 flex-1 px-2 py-1.5 text-left">
                    <p className="truncate text-xs text-fg-muted">{item.title || item.url}</p>
                    <p className="truncate text-[10px] text-fg-subtle">{item.url}</p>
                  </button>
                  <button type="button" onClick={async () => { await fetch(`${BROWSER_API}/history/${encodeURIComponent(item.id)}`, { method: 'DELETE' }).catch(() => {}); setHistoryItems((previous) => previous.filter((entry) => entry.id !== item.id)); }} className="mr-1 rounded p-1 text-fg-subtle opacity-0 hover:text-red-500 group-hover:opacity-100" title="Remove"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {menu === 'downloads' && (
          <div className="absolute right-2 top-2 z-40 w-[min(340px,calc(100%-16px))] overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl" data-floating-overlay>
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Download className="h-3.5 w-3.5 text-fg-subtle" />
              <span className="flex-1 text-xs font-semibold text-fg">Downloads</span>
              <button type="button" onClick={() => { ui('clear-downloads', {}); setMenu(null); }} className="text-[10px] text-fg-subtle hover:text-fg">Clear</button>
              <button type="button" onClick={() => setMenu(null)} className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg" title="Close"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {state.downloads.map((item) => {
                const percent = item.totalBytes > 0 ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100)) : 0;
                return (
                  <div key={item.id} className="rounded-lg px-2 py-2 hover:bg-hover">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                      <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{item.filename}</span>
                      <span className="text-[10px] text-fg-subtle">{item.state === 'progressing' ? `${percent}%` : item.state}</span>
                    </div>
                    {item.state === 'progressing' && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} /></div>}
                    {item.savePath && item.state === 'completed' && <button type="button" onClick={() => window.electronAPI?.shellShowInFolder?.(item.savePath)} className="mt-1 text-[10px] font-medium text-accent hover:opacity-80">Show in folder</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Start page */}
        {activeTab && !activeTab.url && !activeTab.popup && (
          <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8">
            <Globe className="h-8 w-8 text-fg-subtle" />
            {localError && (
              <div className="w-full max-w-sm rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{localError.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-700/80 dark:text-amber-400/80">{localError.message}</p>
              </div>
            )}
            <form className="w-full max-w-sm" onSubmit={(event) => { event.preventDefault(); if (startQuery.trim()) { openAddress(activeTab.id, startQuery); setStartQuery(''); } }}>
              <input
                value={startQuery}
                onChange={(event) => setStartQuery(event.target.value)}
                autoFocus
                placeholder="Search or enter a URL"
                spellCheck={false}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent/60 focus:ring-1 focus:ring-accent/25"
              />
            </form>
            <div className="flex w-full max-w-sm flex-wrap justify-center gap-1.5">
              {QUICK_LINKS.map((link) => (
                <button key={link.url} type="button" onClick={() => openAddress(activeTab.id, link.url)} className="rounded-md border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg">
                  {link.label}
                </button>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-center text-[11px] text-fg-subtle">
              {incognito && <Ghost className="h-3 w-3 text-violet-500" />}
              {incognito ? 'Incognito: no history, and site data is cleared when you leave Incognito.' : 'Or ask Asyncat to browse the web for you.'}
            </p>
          </div>
        )}

        {/* A page that failed or crashed */}
        {activeTab?.url && activeTab.error && !activeTab.crashed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30"><WifiOff className="h-6 w-6 text-amber-500" /></div>
            <p className="text-sm font-semibold text-fg">Can&apos;t connect</p>
            <p className="max-w-xs text-xs leading-relaxed text-fg-muted">{networkErrorMessage(activeTab.error.code)}</p>
            <p className="max-w-xs break-all font-mono text-[10px] text-fg-subtle">{activeTab.url}</p>
            <button type="button" onClick={() => ui('reload', { tabId: activeTab.id })} className="mt-1 rounded-lg border border-line px-4 py-2 text-xs font-medium text-fg hover:bg-hover">Try again</button>
          </div>
        )}
        {activeTab?.crashed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30"><AlertTriangle className="h-6 w-6 text-red-500" /></div>
            <p className="text-sm font-semibold text-fg">This page stopped working</p>
            <p className="max-w-xs text-xs text-fg-muted">It may have run out of memory.</p>
            <button type="button" onClick={() => ui('reload', { tabId: activeTab.id })} className="mt-1 rounded-lg border border-line px-4 py-2 text-xs font-medium text-fg hover:bg-hover">Reload</button>
          </div>
        )}
        {activeTab?.popup && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AppWindow className="h-8 w-8 text-fg-subtle" />
            <p className="max-w-xs text-xs leading-5 text-fg-muted">This page opened in its own window (for example to sign in or pay).</p>
            <button type="button" onClick={() => ui('activate', { tabId: activeTab.id })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-hover">Show the window</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Outside the desktop app (plain web build): one page in an iframe. */
function IframeBrowser({ request, workingContext }) {
  const { workbenchPreferences: prefs } = useUiPreferences();
  const [url, setUrl] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);

  const open = useCallback((raw) => {
    const resolved = resolveAddress(raw, { searchEngine: prefs.browserSearchEngine, workingContext, fileSiteApi: FILE_SITE_API });
    if (resolved.error) { setError(resolved.error); return; }
    setError(null);
    setUrl(resolved.url);
    setInput(resolved.sourceUrl || resolved.url);
  }, [prefs.browserSearchEngine, workingContext]);

  useEffect(() => {
    if (request?.url) open(request.url);
  }, [open, request?.key, request?.url]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <form className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5" onSubmit={(event) => { event.preventDefault(); open(input); }}>
        <Search className="h-3 w-3 text-fg-subtle" />
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search or enter address" spellCheck={false} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-fg outline-none placeholder:text-fg-subtle" />
      </form>
      {error && <p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{error}</p>}
      {url
        ? <iframe key={url} src={url} className="h-full w-full border-0" title="Web" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals" />
        : <div className="flex flex-1 items-center justify-center text-xs text-fg-subtle">The full browser is available in the Asyncat desktop app.</div>}
    </div>
  );
}

/**
 * The Browser tab of the side panel. In the desktop app the tabs themselves
 * live in the main process (electron/browserHost.js) and keep running while
 * this panel is closed; the panel shows them and passes the user's actions on.
 *
 * request: { url, tabId, key } — open this address (or show this tab) once.
 */
export default function BrowserPanel({ request = null, workingContext = null }) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.browser : null;
  if (!api) return <IframeBrowser request={request} workingContext={workingContext} />;
  return <HostBrowser api={api} request={request} workingContext={workingContext} />;
}
