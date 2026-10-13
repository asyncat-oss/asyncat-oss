import { lazy, Suspense, useMemo } from 'react';
import { Activity, Code2, Link2, X, BookMarked, Globe, FilePlus, ArrowLeft, List } from 'lucide-react';
import AgentActivitySidebar from '../agent/AgentActivitySidebar';
import ArtifactCard from '../renderers/ArtifactRenderer';

// Loaded when their tab first opens, not with the app.
const ChatSourcesMediaSidebar = lazy(() => import('./ChatSourcesMediaSidebar'));
const CodePanel = lazy(() => import('./CodePanel'));
const BrowserPanel = lazy(() => import('./BrowserPanel'));

const panelLoading = <div className="flex flex-1 items-center justify-center text-[12px] text-fg-subtle">Loading…</div>;

const panelMeta = {
  steps: { label: 'Steps', icon: Activity },
  code: { label: 'Code', icon: Code2 },
  media: { label: 'Sources & media', icon: Link2 },
  saved: { label: 'Saved', icon: BookMarked },
  preview: { label: 'Browser', icon: Globe },
  artifacts: { label: 'Artifacts', icon: FilePlus },
  artifact: { label: 'Artifact', icon: FilePlus },
  nav: { label: 'Jump to', icon: List },
};

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
  highlights = null,
  onOpenSavedMessage,
  previewUrl = null,
  previewNavigationKey = null,
  previewTabId = null,
  artifacts = [],
  onSelectArtifact,
  selectedArtifact = null,
  chatNavItems = [],
}) {
  const currentTab = activeTab === 'git' || activeTab === 'sandboxes' ? 'code' : (activeTab || 'steps');
  const browserRequest = useMemo(
    () => (previewUrl || previewTabId ? { url: previewUrl, tabId: previewTabId, key: previewNavigationKey || previewUrl } : null),
    [previewNavigationKey, previewTabId, previewUrl],
  );
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

      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={panelLoading}>
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
        {currentTab === 'saved' && (
          <SavedMessagesPanel highlights={highlights} onOpenMessage={onOpenSavedMessage} />
        )}
        {currentTab === 'preview' && (
          <BrowserPanel request={browserRequest} workingContext={workingContext} />
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
        </Suspense>
      </div>
    </div>
  );
}
