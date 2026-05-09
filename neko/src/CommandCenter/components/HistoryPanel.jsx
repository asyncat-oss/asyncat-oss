import React from 'react';
import { Loader2, MessageSquare } from 'lucide-react';

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

export default function HistoryPanel({
  recentConversations = [],
  recentConversationsLoading = false,
  recentConversationsError = null,
  activeConversationIds = new Set(),
  currentConversationId = null,
  handleOpenConversation,
  navigate
}) {
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
          <div className="px-1.5 py-1.5 space-y-px">
            <div className="mb-2 mt-1 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-500">
              Recent
              <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">
                {recentConversations.length}
              </span>
            </div>
            {recentConversations.map((conversation) => {
              const active = conversation.id === currentConversationId;
              const running = activeConversationIds.has(conversation.id);
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
            })}
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
