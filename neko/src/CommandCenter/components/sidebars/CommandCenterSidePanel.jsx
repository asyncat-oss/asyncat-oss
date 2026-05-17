/* eslint-disable react/prop-types */
import { useState, useRef, useEffect } from 'react';
import { Activity, GitBranch, Image, X, History, BookMarked, Globe, RotateCcw, ExternalLink, AlertTriangle } from 'lucide-react';
import AgentActivitySidebar from '../agent/AgentActivitySidebar';
import ChatSourcesMediaSidebar from './ChatSourcesMediaSidebar';
import GitPanel from '../git/GitPanel';
import HistoryPanel from './HistoryPanel';

const panelMeta = {
  steps: { label: 'Steps', icon: Activity },
  git: { label: 'Git', icon: GitBranch },
  media: { label: 'Media', icon: Image },
  history: { label: 'History', icon: History },
  saved: { label: 'Saved', icon: BookMarked },
  preview: { label: 'Preview', icon: Globe },
};

// ── Preview panel ─────────────────────────────────────────────────────────────

function PreviewPanel({ initialUrl }) {
  const [url, setUrl] = useState(initialUrl || '');
  const [inputUrl, setInputUrl] = useState(initialUrl || '');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialUrl));
  const iframeRef = useRef(null);
  const reloadKey = useRef(0);
  const [key, setKey] = useState(0);

  // Sync when a new URL comes in from the agent
  useEffect(() => {
    if (initialUrl && initialUrl !== url) {
      setUrl(initialUrl);
      setInputUrl(initialUrl);
      setBlocked(false);
      setLoading(true);
      setKey(k => k + 1);
    }
  }, [initialUrl]);

  const navigate = (target) => {
    const trimmed = target.trim();
    if (!trimmed) return;
    const full = trimmed.startsWith('http') ? trimmed : `http://${trimmed}`;
    setUrl(full);
    setInputUrl(full);
    setBlocked(false);
    setLoading(true);
    setKey(k => k + 1);
  };

  const handleLoad = () => {
    setLoading(false);
    // Detect blank iframe (X-Frame-Options block): try accessing contentDocument
    try {
      const doc = iframeRef.current?.contentDocument;
      // If we get a document but it's completely empty, it was blocked
      if (doc && doc.body && doc.body.innerHTML === '' && doc.title === '') {
        setBlocked(true);
      } else {
        setBlocked(false);
      }
    } catch {
      // Cross-origin access denied — iframe loaded (or was blocked by CSP)
      // We can't tell definitively; just clear blocked state
      setBlocked(false);
    }
  };

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Address bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-100 dark:border-gray-800 px-2 py-1.5">
        <button
          type="button"
          onClick={() => { setKey(k => k + 1); setLoading(true); setBlocked(false); }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
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
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-mono text-gray-700 outline-none transition-colors focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
        </form>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Open in browser"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Frame */}
      <div className="relative min-h-0 flex-1 bg-white dark:bg-gray-950">
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
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-950/80">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
              </div>
            )}
            {blocked && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-gray-950 px-6">
                <div className="text-center">
                  <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-400" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Can't embed this page</p>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                    The server set headers that prevent embedding (X-Frame-Options). Open it in your browser instead.
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in browser
                  </a>
                </div>
              </div>
            )}
            <iframe
              key={key}
              ref={iframeRef}
              src={url}
              onLoad={handleLoad}
              className="h-full w-full border-0"
              title="Preview"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          </>
        )}
      </div>
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
        className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:border-amber-200 hover:bg-amber-50/60 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-amber-900/60 dark:hover:bg-amber-950/20 dark:focus:ring-amber-900/50"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
          <BookMarked className="h-3 w-3 text-amber-500" />
          <span>{item.type === 'user' ? 'You' : 'Assistant'}</span>
        </div>
        <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-gray-700 dark:text-slate-200">
          {item.content || 'Empty message'}
        </p>
      </button>
    );
  };

  if (!bookmarked.length) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-slate-400">
        Bookmark messages you want to collect here. Click any bookmark to jump back to it in the chat.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300">
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
}) {
  const currentTab = activeTab || 'steps';
  const meta = panelMeta[currentTab] || panelMeta.steps;
  const Icon = meta.icon;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#0f1724] midnight:bg-[#0f1724]">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-slate-800 midnight:border-slate-800">
        <Icon className="h-4 w-4 text-gray-500 dark:text-slate-400" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
          {meta.label}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
        {currentTab === 'git' && (
          <GitPanel
            state={gitState}
            loading={gitLoading}
            error={gitError}
            onRefresh={onGitRefresh}
            onChanged={onGitChanged}
            onAttachFile={onAttachGitFile}
            workingDir={workingDir}
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
          <PreviewPanel initialUrl={previewUrl} />
        )}
      </div>
    </div>
  );
}
