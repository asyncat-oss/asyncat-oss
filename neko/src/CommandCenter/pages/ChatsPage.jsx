import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import eventBus from '../../utils/eventBus.js';
import { agentTaskRunsApi, chatApi, chatFoldersApi } from '../api';
import { useCommandCenter } from '../context/CommandCenterContextEnhanced';
import { Bot, MessageSquare, CheckSquare, Clock, Search, Folder, FolderOpen, Plus, Pencil, Square, Trash2, Wrench, X, BookMarked } from 'lucide-react';

import { getRelativeTime, cleanTaskAgentTitle } from '../utils/conversationUtils.js';

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

const ChatsPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const {
    handleNewConversation,
    activeConversationIds = new Set(),
    chatRunPreviews = [],
  } = useCommandCenter();

  const handleNewChat = useCallback(async () => {
    if (handleNewConversation) await handleNewConversation();
    navigate('/home');
  }, [handleNewConversation, navigate]);

  const [conversations, setConversations] = useState([]);
  const [taskAgentRuns, setTaskAgentRuns] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState({});
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [actionModal, setActionModal] = useState(null);
  const [actionModalTitle, setActionModalTitle] = useState('');
  const actionInputRef = useRef(null);
  const didFocusRef = useRef(false);

  useEffect(() => {
    if (actionModal && actionInputRef.current && !didFocusRef.current) {
      actionInputRef.current.focus();
      actionInputRef.current.select();
      didFocusRef.current = true;
    }
    if (!actionModal) {
      didFocusRef.current = false;
    }
  }, [actionModal]);

  const loadAll = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setConversations([]);
      setTaskAgentRuns([]);
      setFolders([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [convRes, foldRes, agentRes] = await Promise.all([
        chatApi.getConversationHistory({ limit: 500, archived: false }),
        chatFoldersApi.getFolders(),
        agentTaskRunsApi.list()
      ]);

      const convs = convRes?.conversations || [];
      convs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setConversations(convs);
      const runs = (agentRes?.tasks || [])
        .filter(task => task?.agentRun)
        .map(task => {
          const run = task.agentRun;
          return {
            ...run,
            type: 'task-agent',
            taskId: task.id,
            taskTitle: task.title,
            projectName: task.projectName,
            columnTitle: task.columnTitle,
            title: cleanTaskAgentTitle(task, run) || 'Task agent run',
            preview: run.needsInput ? 'Needs input' : (run.lastEventLabel || run.summary || run.goal || ''),
            updated_at: run.updatedAt,
          };
        })
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      setTaskAgentRuns(runs);

      const loadedFolders = foldRes?.folders || [];
      setFolders(loadedFolders);

      const initialExpanded = {};
      loadedFolders.forEach(f => { initialExpanded[f.id] = true; });
      setExpandedFolders(initialExpanded);
    } catch (err) {
      console.error('Failed to load chats:', err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const unsub = eventBus.on('conversationsUpdated', () => loadAll());
    return () => unsub();
  }, [loadAll]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const getSelectionKey = (item) => `${item.type || 'chat'}:${item.id}`;

  const toggleSelection = (e, item) => {
    e.stopPropagation();
    const key = getSelectionKey(item);
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { id: item.id, type: item.type || 'chat', title: item.title || '' };
      return next;
    });
  };

  const openActionModal = (e, item) => {
    e.stopPropagation();
    setActionModal({ id: item.id, type: item.type || 'chat', title: item.title || '' });
    setActionModalTitle(item.title || '');
  };

  const saveRename = async () => {
    const itemId = actionModal.id;
    const newTitle = actionModalTitle.trim();
    if (!newTitle || newTitle === actionModal.title) { setActionModal(null); return; }
    try {
      await chatApi.updateConversation(itemId, { title: newTitle });
      setConversations(prev => prev.map(c => c.id === itemId ? { ...c, title: newTitle } : c));
      setActionModal(null);
    } catch (err) {
      console.error('Failed to rename item:', err);
    }
  };

  const confirmDelete = async () => {
    const itemId = actionModal.id;
    setActionModal(null);
    setConversations(prev => prev.filter(c => c.id !== itemId));
    try {
      await chatApi.deleteConversation(itemId);
    } catch (err) {
      console.error('Failed to delete item:', err);
      loadAll();
    }
  };

  const q = searchQuery.toLowerCase();

  const filteredConversations = conversations.filter(c =>
    (c.title || '').toLowerCase().includes(q) ||
    (c.preview || '').toLowerCase().includes(q)
  ).map(c => ({ ...c, type: 'chat', title: c.title || 'Untitled conversation' }));

  const filteredTaskAgentRuns = taskAgentRuns
    .filter(run =>
      run.title.toLowerCase().includes(q) ||
      (run.preview || '').toLowerCase().includes(q) ||
      (run.projectName || '').toLowerCase().includes(q) ||
      (run.profile?.name || '').toLowerCase().includes(q)
    );

  const activeChatRuns = chatRunPreviews
    .filter(run => run.running)
    .filter(run => !run.conversationId || !filteredConversations.some(c => c.id === run.conversationId))
    .filter(run => !q || (run.title || '').toLowerCase().includes(q) || (run.preview || '').toLowerCase().includes(q))
    .map(run => ({
      id: run.conversationId || run.key,
      type: 'active-run',
      runKey: run.key,
      conversationId: run.conversationId,
      title: run.title || 'New conversation',
      preview: run.preview || 'Generating',
      updated_at: run.updatedAtMs ? new Date(run.updatedAtMs).toISOString() : new Date().toISOString(),
    }));

  const folderMap = {};
  folders.forEach(f => { folderMap[f.id] = []; });
  const unfiledConversations = [];
  filteredConversations.forEach(c => {
    if (c.folder_id && folderMap[c.folder_id]) folderMap[c.folder_id].push(c);
    else unfiledConversations.push(c);
  });

  const selectableItems = filteredConversations;
  const selectedList = Object.values(selectedItems);
  const selectedCount = selectedList.length;
  const allVisibleSelected = selectableItems.length > 0 && selectableItems.every(item => selectedItems[getSelectionKey(item)]);

  const selectAllVisible = () => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (allVisibleSelected) {
        selectableItems.forEach(item => delete next[getSelectionKey(item)]);
      } else {
        selectableItems.forEach(item => {
          next[getSelectionKey(item)] = { id: item.id, type: item.type || 'chat', title: item.title || '' };
        });
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedItems({});

  const deleteSelected = async () => {
    if (selectedCount === 0 || bulkDeleting) return;
    const items = selectedList;
    setBulkDeleting(true);
    setSelectedItems({});
    setConversations(prev => prev.filter(chat => !items.some(item => item.type === 'chat' && item.id === chat.id)));
    try {
      const results = await Promise.allSettled(items.map(item => (
        chatApi.deleteConversation(item.id)
      )));
      if (results.some(result => result.status === 'rejected')) {
        throw new Error('Some selected items could not be deleted');
      }
    } catch (err) {
      console.error('Failed to bulk delete selected items:', err);
      setError(err.message || 'Failed to delete selected items');
      loadAll();
    } finally {
      setBulkDeleting(false);
    }
  };

  const renderChatItem = (chat) => {
    const isTaskAgent = chat.type === 'task-agent';
    const isActiveRun = chat.type === 'active-run';
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const lastAssistant = [...messages].reverse().find(msg => msg.type === 'assistant');
    const running = isActiveRun || activeConversationIds.has(chat.id) || activeConversationIds.has(String(chat.id));
    const actionModeUsed = messages.some(msg => msg.agentMode === 'action' || msg.toolsEnabled === true);
    const planModeUsed = messages.some(msg => msg.agentMode === 'plan' || msg.agentSessionId);
    const toolsUsed = isTaskAgent || running || actionModeUsed || planModeUsed;
    const updatedAt = chat.updated_at || chat.updatedAt;
    const itemTitle = chat.title || (isTaskAgent ? 'Task agent run' : 'Untitled conversation');
    const selectionItem = { id: chat.id, type: chat.type, title: itemTitle };
    const isSelected = Boolean(selectedItems[getSelectionKey(selectionItem)]);
    const hasSelection = selectedCount > 0;
    const canSelect = !isTaskAgent && !isActiveRun;
    const canOpen = isActiveRun || !isTaskAgent || chat.sessionId;
    const workingContextLabel = formatWorkingContextLabel(chat.metadata?.workingContext || chat.workingContext);
    const bookmarkCount = Array.isArray(chat.metadata?.highlights?.bookmarkedMessages)
      ? chat.metadata.highlights.bookmarkedMessages.length
      : messages.filter(msg => msg.bookmarked).length;

    return (
      <div
        key={`${chat.type}-${chat.id}`}
        onClick={(e) => {
          if (!canOpen) return;
          if (hasSelection && canSelect) {
            toggleSelection(e, selectionItem);
          } else {
            navigate(isActiveRun
              ? (chat.conversationId ? `/conversations/${chat.conversationId}` : '/home')
              : isTaskAgent ? `/agents/${chat.sessionId}` : `/conversations/${chat.id}`);
          }
        }}
        className={`flex items-center gap-3 px-3 py-3 border-b transition-colors group ${
          canOpen ? 'cursor-pointer' : 'cursor-default'
        } ${
          isSelected
            ? 'bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/60 border-gray-300 dark:border-gray-600 midnight:border-slate-700'
            : 'border-gray-100 dark:border-gray-800 midnight:border-slate-800 hover:bg-gray-50/70 dark:hover:bg-gray-800/35 midnight:hover:bg-slate-900/45'
        }`}
      >
        {canSelect && (
        <button
          onClick={e => toggleSelection(e, selectionItem)}
          title={isSelected ? 'Deselect' : 'Select'}
          className={`p-1 rounded-md transition-colors flex-shrink-0 ${
            isSelected || hasSelection
              ? 'opacity-100 text-gray-700 dark:text-gray-200'
              : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </button>
        )}
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-colors ${
          running
            ? 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-200'
            : 'border-gray-200 bg-white text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 midnight:border-slate-800 midnight:bg-slate-950 midnight:text-slate-400'
        }`}>
          {isTaskAgent
            ? <Bot className="w-3.5 h-3.5" />
            : <MessageSquare className="w-3.5 h-3.5" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
            {itemTitle}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className="flex-shrink-0">{getRelativeTime(updatedAt)}</span>
            {toolsUsed && (
              <>
                <span>•</span>
                <span className={`inline-flex items-center gap-0.5 flex-shrink-0 ${
                  running
                    ? 'text-gray-700 dark:text-gray-200 midnight:text-slate-200'
                    : 'text-gray-500 dark:text-gray-400 midnight:text-slate-400'
                }`}>
                  {isTaskAgent ? <Bot className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                  {running ? 'Generating' : isTaskAgent ? (chat.profile?.name || 'Agent') : actionModeUsed ? 'Action' : 'Plan'}
                </span>
              </>
            )}
            {workingContextLabel && (
              <>
                <span>•</span>
                <span
                  className="inline-flex min-w-0 items-center gap-0.5 truncate text-gray-500 dark:text-gray-400 midnight:text-slate-400"
                  title={chat.metadata?.workingContext?.workingDir || chat.workingContext?.workingDir || ''}
                >
                  <FolderOpen className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">Worked in {workingContextLabel}</span>
                </span>
              </>
            )}
            {bookmarkCount > 0 && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-amber-500">
                  <BookMarked className="h-3 w-3" />
                  {bookmarkCount}
                </span>
              </>
            )}
            {isTaskAgent && chat.status && (
              <>
                <span>•</span>
                <span className="capitalize flex-shrink-0">
                  {chat.displayStatus === 'needs_input' || chat.needsInput ? 'Needs input' : chat.status}
                </span>
              </>
            )}
            {(chat.preview || lastAssistant?.content) && (
              <>
                <span>•</span>
                <span className="truncate">{chat.preview || lastAssistant?.content}</span>
              </>
            )}
          </div>
        </div>
        {!isTaskAgent && !isActiveRun && (
        <div className={`flex items-center gap-0.5 transition-opacity flex-shrink-0 ${hasSelection ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            onClick={e => openActionModal(e, { id: chat.id, type: chat.type, title: itemTitle })}
            title="Edit"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
        )}
      </div>
    );
  };

  const renderChatList = (chats) => {
    if (chats.length === 0) return null;
    return (
      <div className="space-y-2">
        {chats.map(chat => renderChatItem(chat))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <div className="max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col h-full relative z-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold leading-none text-gray-950 dark:text-gray-100 midnight:text-slate-100">
              Chats
            </h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              Conversations and agent runs
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectableItems.length > 0 && (
              <button
                onClick={selectAllVisible}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:border-slate-800 midnight:text-slate-300 midnight:hover:bg-slate-900"
              >
                {allVisibleSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                {allVisibleSelected ? 'Deselect all' : 'Select'}
              </button>
            )}
            <button
              onClick={handleNewChat}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:text-slate-900 midnight:hover:bg-slate-200"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white/40 py-2 pl-10 pr-4 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-100 dark:focus:border-gray-700 dark:focus:ring-gray-700 midnight:border-slate-800 midnight:bg-slate-950/30 midnight:text-slate-100"
          />
        </div>

        {selectedCount > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex-shrink-0 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
              {selectedCount} selected
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={deleteSelected}
                disabled={bulkDeleting}
                className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="w-4 h-4" />
                {bulkDeleting ? 'Deleting' : 'Delete'}
              </button>
              <button
                onClick={clearSelection}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex flex-col p-4 border-b border-gray-100 dark:border-gray-800/50">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-red-500 text-center py-10 font-medium">{error}</div>
          ) : filteredConversations.length === 0 && filteredTaskAgentRuns.length === 0 && activeChatRuns.length === 0 ? (
            <div className="text-center py-20">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-500 midnight:border-slate-800 midnight:text-slate-500">
                <MessageSquare className="w-4 h-4" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No conversations found</p>
            </div>
          ) : (
            <div className="space-y-4 text-left">
              {activeChatRuns.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-slate-300 mb-3 px-1">Active</h3>
                  {renderChatList(activeChatRuns)}
                </div>
              )}
              {folders.map(folder => {
                const folderChats = folderMap[folder.id];
                if (!folderChats || folderChats.length === 0) return null;
                const isExpanded = expandedFolders[folder.id];
                return (
                  <div key={folder.id} className="mb-6">
                    <button
                      onClick={() => toggleFolder(folder.id)}
                      className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {isExpanded
                        ? <FolderOpen className="w-4 h-4 text-gray-500" />
                        : <Folder className="w-4 h-4 text-gray-500" />
                      }
                      {folder.name}
                      <span className="text-xs font-normal text-gray-400">({folderChats.length})</span>
                    </button>
                    {isExpanded && renderChatList(folderChats)}
                  </div>
                );
              })}
              {unfiledConversations.length > 0 && (
                <div className="mb-6">
                  {folders.length > 0 && (
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-slate-300 mb-3 px-1">Unfiled</h3>
                  )}
                  {renderChatList(unfiledConversations)}
                </div>
              )}
              {filteredTaskAgentRuns.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-slate-300 mb-3 px-1">Task agent runs</h3>
                  {renderChatList(filteredTaskAgentRuns)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Modal (rename + delete) */}
      {actionModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setActionModal(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
              Edit conversation
            </h3>
            <input
              ref={actionInputRef}
              value={actionModalTitle}
              onChange={e => setActionModalTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveRename();
                }
                if (e.key === 'Escape') setActionModal(null);
              }}
              placeholder="Conversation title"
              className="mb-6 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-gray-700 midnight:border-slate-700 midnight:bg-slate-900"
            />
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-4">
              <button
                onClick={confirmDelete}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActionModal(null)}
                  className="h-8 rounded-lg px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  onClick={saveRename}
                  className="h-8 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatsPage;
