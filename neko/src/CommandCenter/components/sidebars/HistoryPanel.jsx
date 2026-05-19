import React, { useState } from 'react';
import { Folder, FolderOpen, Loader2, MessageSquare } from 'lucide-react';

const getRelativeConversationTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diffH = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function basenamePath(value = '') {
  const parts = String(value || '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function formatWorkingContextLabel(context) {
  if (!context || typeof context !== 'object') return null;
  if (context.relativePath && context.relativePath !== '.') return basenamePath(context.relativePath);
  if (context.workingDir) return basenamePath(context.workingDir);
  if (context.rootPath) return basenamePath(context.rootPath);
  return context.rootLabel || null;
}

function getWorkingContext(item) {
  return item?.metadata?.workingContext || item?.workingContext || null;
}

function getWorkingContextFilterKey(context) {
  if (!context || typeof context !== 'object') return null;
  const root = context.rootId || context.rootPath || context.rootLabel || '';
  const relative = context.relativePath || context.workingDir || context.rootPath || '';
  if (!root && !relative) return null;
  return `${root}:${relative}`;
}

function getItemUpdatedMs(item) {
  const value = item?.last_message_at || item?.updated_at || item?.updatedAt || item?.created_at;
  return value ? new Date(value).getTime() || 0 : 0;
}

function ConversationButton({ conversation, active, running, handleOpenConversation }) {
  return (
    <button
      key={conversation.id}
      type="button"
      onClick={() => handleOpenConversation(conversation.id)}
      className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
        active
          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 midnight:bg-indigo-950/30'
          : 'hover:bg-gray-100/60 dark:hover:bg-gray-800/40 midnight:hover:bg-slate-800/40'
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="mt-1 flex shrink-0 items-center justify-center w-2 h-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              running
                ? 'bg-blue-400 animate-pulse shadow-[0_0_0_3px_rgba(96,165,250,0.15)]'
                : active
                ? 'bg-indigo-400 dark:bg-indigo-500'
                : 'bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600'
            }`}
            title={running ? 'Generating' : ''}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 truncate leading-none">
              {conversation.title || 'Untitled conversation'}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-gray-400 dark:text-gray-500 midnight:text-slate-500">
              · {running ? 'Generating' : getRelativeConversationTime(conversation.updated_at)}
            </span>
          </div>
          {(conversation.preview || conversation.messages?.[0]?.content) && (
            <p className="mt-1 text-[10px] leading-snug text-gray-400 dark:text-gray-500 midnight:text-slate-500 line-clamp-2 break-all">
              {conversation.preview || conversation.messages?.[0]?.content}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function HistoryPanel({
  recentConversations = [],
  recentConversationsLoading = false,
  recentConversationsError = null,
  activeConversationIds = new Set(),
  currentConversationId = null,
  handleOpenConversation,
  navigate
}) {
  const [expandedFolders, setExpandedFolders] = useState({});

  const toggleFolder = (key) => {
    setExpandedFolders(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  // Build project folder groups from working context
  const workedFolderGroupMap = new Map();
  recentConversations.forEach(conv => {
    const context = getWorkingContext(conv);
    const key = getWorkingContextFilterKey(context);
    const label = formatWorkingContextLabel(context);
    if (!key || !label) return;
    const updatedAtMs = getItemUpdatedMs(conv);
    if (!workedFolderGroupMap.has(key)) {
      workedFolderGroupMap.set(key, {
        key,
        expandedKey: `worked:${key}`,
        label,
        title: context.workingDir || context.rootPath || label,
        updatedAtMs,
        items: [],
      });
    }
    const group = workedFolderGroupMap.get(key);
    group.items.push(conv);
    group.updatedAtMs = Math.max(group.updatedAtMs, updatedAtMs);
  });

  const workedFolderGroups = [...workedFolderGroupMap.values()]
    .map(group => ({
      ...group,
      items: group.items.sort((a, b) => getItemUpdatedMs(b) - getItemUpdatedMs(a)),
    }))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.label.localeCompare(b.label));

  const conversationsWithoutFolder = recentConversations.filter(
    c => !getWorkingContextFilterKey(getWorkingContext(c))
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto py-1">
        {recentConversationsLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading recent chats
          </div>
        ) : recentConversationsError ? (
          <div className="px-4 py-8 text-center text-xs text-red-500 dark:text-red-400">
            {recentConversationsError}
          </div>
        ) : recentConversations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MessageSquare className="mx-auto mb-2 h-6 w-6 text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400 dark:text-slate-500">No saved conversations yet</p>
          </div>
        ) : (
          <div className="px-1.5 py-1.5">
            {/* Projects section */}
            {workedFolderGroups.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  Projects
                </div>
                <div className="space-y-1">
                  {workedFolderGroups.map(group => {
                    const isExpanded = expandedFolders[group.expandedKey] ?? true;
                    return (
                      <div key={group.key}>
                        <button
                          type="button"
                          onClick={() => toggleFolder(group.expandedKey)}
                          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-100/60 dark:hover:bg-gray-800/40"
                          title={group.title}
                        >
                          {isExpanded
                            ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
                            : <Folder className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
                          }
                          <span className="truncate text-[11px] font-medium text-gray-600 dark:text-gray-300 midnight:text-slate-300">
                            {group.label}
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] text-gray-400 dark:text-slate-500">
                            {group.items.length}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="ml-3 space-y-px border-l border-gray-100 pl-2 dark:border-slate-800">
                            {group.items.map(conversation => (
                              <ConversationButton
                                key={conversation.id}
                                conversation={conversation}
                                active={conversation.id === currentConversationId}
                                running={activeConversationIds.has(conversation.id)}
                                handleOpenConversation={handleOpenConversation}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ungrouped chats */}
            {conversationsWithoutFolder.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  Chats
                  {workedFolderGroups.length === 0 && (
                    <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">
                      {conversationsWithoutFolder.length}
                    </span>
                  )}
                </div>
                <div className="space-y-px">
                  {conversationsWithoutFolder.map(conversation => (
                    <ConversationButton
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === currentConversationId}
                      running={activeConversationIds.has(conversation.id)}
                      handleOpenConversation={handleOpenConversation}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 p-2 dark:border-slate-800 midnight:border-slate-800">
        <button
          type="button"
          onClick={() => navigate('/all-chats')}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-slate-800 midnight:text-slate-300 midnight:hover:bg-slate-800"
        >
          View all history
        </button>
      </div>
    </div>
  );
}
