/* eslint-disable react/prop-types */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Activity, Code2, Image, X, History, BookMarked, Globe, RotateCcw, ExternalLink, AlertTriangle, WifiOff, FilePlus, ArrowLeft, List, SquareTerminal, Bug, Camera } from 'lucide-react';
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
  preview: { label: 'Preview', icon: Globe },
  artifacts: { label: 'Artifacts', icon: FilePlus },
  artifact: { label: 'Artifact', icon: FilePlus },
  nav: { label: 'Jump to', icon: List },
  terminal: { label: 'Terminal', icon: SquareTerminal },
};

// ── Preview panel ─────────────────────────────────────────────────────────────

const isElectron = Boolean(window?.electronAPI);

function ElectronWebview({ url, onLoadStart, onLoadStop, onCrash, onLoadError, webviewRef }) {
  const internalRef = useRef(null);
  const ref = webviewRef || internalRef;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = () => onLoadStart?.();
    const stop  = () => onLoadStop?.();
    // Block new windows / popups so scareware can't spawn download dialogs
    const blockPopup = (e) => e.preventDefault();
    // Catch renderer crashes — surface them in UI instead of killing the app
    const handleCrash = () => onCrash?.();
    const handleGone  = () => onCrash?.();
    // Catch network/connection errors (ERR_CONNECTION_REFUSED etc.)
    const handleFailLoad = (e) => {
      // errorCode -3 (ERR_ABORTED) happens on navigation cancel — ignore it
      if (e.errorCode === -3) return;
      // Only care about the main frame failing, not sub-resources
      if (e.isMainFrame === false) return;
      onLoadError?.(e.errorCode, e.errorDescription);
    };
    el.addEventListener('did-start-loading', start);
    el.addEventListener('did-stop-loading', stop);
    el.addEventListener('did-fail-load', handleFailLoad);
    el.addEventListener('new-window', blockPopup);
    el.addEventListener('crashed', handleCrash);
    el.addEventListener('render-process-gone', handleGone);
    return () => {
      el.removeEventListener('did-start-loading', start);
      el.removeEventListener('did-stop-loading', stop);
      el.removeEventListener('did-fail-load', handleFailLoad);
      el.removeEventListener('new-window', blockPopup);
      el.removeEventListener('crashed', handleCrash);
      el.removeEventListener('render-process-gone', handleGone);
    };
  }, [onLoadStart, onLoadStop, onCrash, onLoadError]);
  // partition="sandbox" isolates cookies/storage from the main app session
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
  const [url, setUrl] = useState(initialUrl || '');
  const [inputUrl, setInputUrl] = useState(initialUrl || '');
  const [loading, setLoading] = useState(Boolean(initialUrl));
  const [crashed, setCrashed] = useState(false);
  const [loadError, setLoadError] = useState(null); // { code, description }
  const iframeRef = useRef(null);
  const webviewRef = useRef(null);
  const [key, setKey] = useState(0);

  // Sync when a new URL comes in from the agent
  useEffect(() => {
    if (initialUrl && initialUrl !== url) {
      setUrl(initialUrl);
      setInputUrl(initialUrl);
      setLoading(true);
      setLoadError(null);
      setKey(k => k + 1);
    }
  }, [initialUrl]);

  const navigate = (target) => {
    const trimmed = target.trim();
    if (!trimmed) return;
    const full = trimmed.startsWith('http') ? trimmed : `http://${trimmed}`;
    setUrl(full);
    setInputUrl(full);
    setLoading(true);
    setCrashed(false);
    setLoadError(null);
    setKey(k => k + 1);
  };

  const reload = () => {
    setLoading(true);
    setCrashed(false);
    setLoadError(null);
    setKey(k => k + 1);
  };

  const handleIframeLoad = () => {
    setLoading(false);
  };

  // ── Register browser executor for the agent's preview_* tools ────────────
  // The executor is called by CommandCenterV2Enhanced when a browser_command
  // SSE event arrives from the agent.
  const executeBrowserCommand = useCallback(async ({ action, selector, value, url: navUrl, code }) => {
    const webview = webviewRef.current;
    if (!webview) {
      return { success: false, error: 'Preview webview not mounted. Use preview_navigate to load a URL first.' };
    }
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
        case 'click': {
          return webview.executeJavaScript(`(function(){
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.click();
            return { success: true, tag: el.tagName, text: (el.textContent||'').trim().slice(0,80) };
          })()`);
        }
        case 'fill': {
          return webview.executeJavaScript(`(function(){
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
            el.focus();
            el.value = ${JSON.stringify(value)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true };
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
        default:
          return { success: false, error: `Unknown browser action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []); // webviewRef is a stable ref — access .current at call time

  useEffect(() => {
    if (!browserExecutorRef || !isElectron) return;
    browserExecutorRef.current = executeBrowserCommand;
    return () => { if (browserExecutorRef.current === executeBrowserCommand) browserExecutorRef.current = null; };
  }, [browserExecutorRef, executeBrowserCommand]);

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Address bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-2 py-1.5">
        <button
          type="button"
          onClick={reload}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title="Reload"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
        <form
          className="flex min-w-0 flex-1 items-center"
          onSubmit={(e) => { e.preventDefault(); navigate(inputUrl); }}
        >
          <input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-mono text-gray-700 outline-none transition-colors focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-200 midnight:focus:border-indigo-500 midnight:focus:ring-indigo-500/30"
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
        </form>
        {url && (
          <>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(url).catch(() => {})}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Copy URL"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Open in browser"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
        {isElectron && url && (
          <>
            <button
              type="button"
              onClick={() => webviewRef.current?.openDevTools()}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Open DevTools"
            >
              <Bug className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  // capturePage() on the webview element captures only the webview content
                  const image = await webviewRef.current?.capturePage();
                  const dataUrl = image?.toDataURL?.();
                  if (!dataUrl) return;
                  const a = document.createElement('a');
                  a.href = dataUrl;
                  a.download = `preview-${Date.now()}.png`;
                  a.click();
                } catch {
                  // Fallback to full app capture
                  const dataUrl = await window.electronAPI.captureScreen();
                  if (!dataUrl) return;
                  const a = document.createElement('a');
                  a.href = dataUrl;
                  a.download = `preview-${Date.now()}.png`;
                  a.click();
                }
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
              title="Capture screenshot of preview"
            >
              <Camera className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Frame */}
      <div className="relative min-h-0 flex-1 bg-white dark:bg-gray-950 midnight:bg-slate-950">
        {!url ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center px-6">
              <Globe className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No preview yet</p>
              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                When the agent starts a server, the URL will appear here automatically.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Spinner — shown during load, hidden once done or errored */}
            {loading && !crashed && !loadError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-950/80 midnight:bg-slate-950/80">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
              </div>
            )}

            {/* Connection / network error */}
            {loadError && !crashed && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-950 midnight:bg-slate-950 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
                  <WifiOff className="h-6 w-6 text-amber-500" />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Can't connect</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                  {getNetworkErrorMessage(loadError.code)}
                </p>
                <p className="text-[10px] font-mono text-gray-400 dark:text-gray-600 break-all max-w-xs">{url}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="mt-1 rounded-lg bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Renderer crash */}
            {crashed && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-950 midnight:bg-slate-950 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Page crashed</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">This site caused the preview renderer to crash. It may be running malicious scripts or consuming too much memory.</p>
                <button
                  type="button"
                  onClick={reload}
                  className="mt-1 rounded-lg bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Try again
                </button>
              </div>
            )}

            {isElectron ? (
              <ElectronWebview
                key={key}
                url={url}
                webviewRef={webviewRef}
                onLoadStart={() => { setLoading(true); setLoadError(null); }}
                onLoadStop={() => setLoading(false)}
                onCrash={() => { setCrashed(true); setLoading(false); }}
                onLoadError={(code, description) => { setLoadError({ code, description }); setLoading(false); }}
              />
            ) : (
              <iframe
                key={key}
                ref={iframeRef}
                src={url}
                onLoad={handleIframeLoad}
                className="h-full w-full border-0"
                title="Preview"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              />
            )}
          </>
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
