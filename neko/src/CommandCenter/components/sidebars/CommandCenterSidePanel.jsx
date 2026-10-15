// The chat's side panel: a header with the open tab's name, then that tab
// (steps, code, sources and media, saved messages, browser, artifacts, or
// the list of messages to jump to).

import { lazy, Suspense, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Activity, Code2, Link2, X, BookMarked, Globe, FilePlus, ArrowLeft, List } from 'lucide-react';
import AgentActivitySidebar from '../agent/AgentActivitySidebar';
import ArtifactCard from '../renderers/ArtifactRenderer';
import IconButton from '../../../components/ui/IconButton.jsx';

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

function EmptyPanel({ icon: Icon, title, hint }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-xs text-center">
        <Icon className="mx-auto mb-2 h-6 w-6 text-fg-subtle" strokeWidth={1.5} />
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <p className="mt-1 text-[12px] leading-5 text-fg-subtle">{hint}</p>
      </div>
    </div>
  );
}

EmptyPanel.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.node.isRequired,
  hint: PropTypes.node,
};

function ArtifactPanel({ artifact }) {
  if (!artifact) {
    return <EmptyPanel icon={FilePlus} title="No artifact selected" hint="Click Open on any artifact to view it here." />;
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
    return <EmptyPanel icon={FilePlus} title="No artifacts yet" hint="Artifacts created by the agent will collect here." />;
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <p className="text-[12px] tabular-nums text-fg-subtle">
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
    return <EmptyPanel icon={List} title="No messages yet" hint="Messages will appear here as you chat." />;
  }
  return (
    <div className="h-full space-y-px overflow-y-auto p-1.5">
      {items.map((item, i) => (
        <button
          key={item.domId}
          type="button"
          onClick={() => document.getElementById(item.domId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="w-full rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <div className="flex items-start gap-2">
            <span className="w-4 shrink-0 text-[11px] leading-5 tabular-nums text-fg-subtle">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {item.goal ? (
                <p className="line-clamp-2 text-[13px] leading-5 text-fg">{item.goal}</p>
              ) : (
                <p className="text-[13px] leading-5 text-fg-subtle">Agent message</p>
              )}
              {item.answerPreview && (
                <p className="mt-0.5 line-clamp-1 text-[12px] text-fg-subtle">{item.answerPreview}</p>
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
        className="block w-full rounded-lg border border-line px-3 py-2 text-left outline-none transition-colors hover:border-line-strong hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <p className="mb-0.5 text-[12px] text-fg-subtle">{item.type === 'user' ? 'You' : 'Assistant'}</p>
        <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-5 text-fg">
          {item.content || 'Empty message'}
        </p>
      </button>
    );
  };

  if (!bookmarked.length) {
    return (
      <EmptyPanel icon={BookMarked} title="No bookmarks yet" hint="Bookmark messages you want to collect here. Click any bookmark to jump back to it in the chat." />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <section>
        <h3 className="mb-2 px-0.5 text-[13px] font-semibold text-fg">
          Bookmarks <span className="font-normal tabular-nums text-fg-subtle">{bookmarked.length}</span>
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
    <div className="flex h-full min-h-0 flex-col bg-canvas text-fg">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pl-4 pr-2">
        {currentTab === 'artifact' && onBack ? (
          <IconButton size="sm" icon={ArrowLeft} label="Back" side="bottom" onClick={onBack} className="-ml-2" />
        ) : (
          <Icon className="h-4 w-4 text-fg-subtle" strokeWidth={1.75} />
        )}
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
          {meta.label}
        </h2>
        {onClose && (
          <IconButton size="sm" icon={X} label="Close panel" side="bottom" onClick={onClose} />
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
