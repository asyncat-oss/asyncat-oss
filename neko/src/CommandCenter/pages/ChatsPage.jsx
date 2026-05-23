import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import eventBus from '../../utils/eventBus.js';
import { agentTaskRunsApi, chatApi, chatFoldersApi } from '../api';
import { useCommandCenter } from '../context/CommandCenterContextEnhanced';
import { Bot, MessageSquare, CheckSquare, Clock, Search, Folder, FolderOpen, Plus, Pencil, Square, Trash2, Wrench, X, BookMarked, Loader2 } from 'lucide-react';

import { getRelativeTime, cleanTaskAgentTitle, parseConversationDate } from '../utils/conversationUtils.js';

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
  const [serverSearchResults, setServerSearchResults] = useState(null); // null = use local, array = server results
  const [serverSearching, setServerSearching] = useState(false);
  const serverSearchTimer = useRef(null);
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
      convs.sort((a, b) => {
        const bTime = parseConversationDate(b.last_message_at || b.updated_at || b.created_at)?.getTime() || 0;
        const aTime = parseConversationDate(a.last_message_at || a.updated_at || a.created_at)?.getTime() || 0;
        return bTime - aTime;
      });
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

  // Debounced server-side FTS search — fires 400ms after user stops typing
  useEffect(() => {
    clearTimeout(serverSearchTimer.current);
    if (searchQuery.trim().length < 3) {
      setServerSearchResults(null);
      setServerSearching(false);
      return;
    }
    setServerSearching(true);
    serverSearchTimer.current = setTimeout(async () => {
      try {
        const res = await chatApi.searchConversations(searchQuery.trim(), 50);
        setServerSearchResults(res?.conversations || []);
      } catch {
        setServerSearchResults(null);
      } finally {
        setServerSearching(false);
      }
    }, 400);
    return () => clearTimeout(serverSearchTimer.current);
  }, [searchQuery]);

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
  // Use server FTS results when available (query ≥ 3 chars), else local filter
  const conversationPool = serverSearchResults !== null
    ? serverSearchResults.map(c => ({ ...c, type: 'chat', title: c.title || 'Untitled conversation' }))
    : null;

  const activeChatRuns = chatRunPreviews
    .filter(run => run.running)
    .map(run => ({
      id: run.conversationId || run.key,
      type: 'active-run',
      runKey: run.key,
      conversationId: run.conversationId,
      title: run.title || 'New conversation',
      preview: run.preview || 'Generating',
      updated_at: run.updatedAtMs ? new Date(run.updatedAtMs).toISOString() : new Date().toISOString(),
      workingContext: run.workingContext || run.metadata?.workingContext || null,
    }));

  const filteredConversations = conversationPool !== null
    ? conversationPool
    : conversations.filter(c =>
        !q || (c.title || '').toLowerCase().includes(q) || (c.preview || '').toLowerCase().includes(q)
      ).map(c => ({ ...c, type: 'chat', title: c.title || 'Untitled conversation' }));

  const filteredTaskAgentRuns = taskAgentRuns
    .filter(run =>
      run.title.toLowerCase().includes(q) ||
      (run.preview || '').toLowerCase().includes(q) ||
      (run.projectName || '').toLowerCase().includes(q) ||
      (run.profile?.name || '').toLowerCase().includes(q)
    );

  const filteredActiveChatRuns = activeChatRuns
    .filter(run => !run.conversationId || !filteredConversations.some(c => c.id === run.conversationId))
    .filter(run => !q || (run.title || '').toLowerCase().includes(q) || (run.preview || '').toLowerCase().includes(q));

  const workedFolderGroupMap = new Map();
  const addWorkedFolderItem = (item) => {
    const context = getWorkingContext(item);
    const key = getWorkingContextFilterKey(context);
    const label = formatWorkingContextLabel(context);
    if (!key || !label) return false;
    const updatedAtMs = getItemUpdatedMs(item);
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
    group.items.push(item);
    group.updatedAtMs = Math.max(group.updatedAtMs, updatedAtMs);
    return true;
  };

  [...filteredActiveChatRuns, ...filteredConversations, ...filteredTaskAgentRuns].forEach(addWorkedFolderItem);

  const workedFolderGroups = [...workedFolderGroupMap.values()]
    .map(group => ({
      ...group,
      items: group.items.sort((a, b) => getItemUpdatedMs(b) - getItemUpdatedMs(a)),
    }))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.label.localeCompare(b.label));

  const conversationsWithoutWorkedFolder = filteredConversations.filter(c => !getWorkingContextFilterKey(getWorkingContext(c)));
  const taskAgentRunsWithoutWorkedFolder = filteredTaskAgentRuns.filter(run => !getWorkingContextFilterKey(getWorkingContext(run)));
  const activeRunsWithoutWorkedFolder = filteredActiveChatRuns.filter(run => !getWorkingContextFilterKey(getWorkingContext(run)));

  const folderMap = {};
  folders.forEach(f => { folderMap[f.id] = []; });
  const unfiledConversations = [];
  conversationsWithoutWorkedFolder.forEach(c => {
    if (c.folder_id && folderMap[c.folder_id]) folderMap[c.folder_id].push(c);
    else unfiledConversations.push(c);
  });

  // Unified top-level items sorted by recency so the latest activity always floats to top,
  // regardless of whether it's a project folder or a standalone chat.
  const topLevelItems = [];
  workedFolderGroups.forEach(group => {
    topLevelItems.push({ kind: 'worked-folder', sortMs: group.updatedAtMs, data: group });
  });
  activeRunsWithoutWorkedFolder.forEach(run => {
    topLevelItems.push({ kind: 'active-run', sortMs: getItemUpdatedMs(run), data: run });
  });
  folders.forEach(folder => {
    const folderChats = folderMap[folder.id];
    if (!folderChats || folderChats.length === 0) return;
    const sortMs = Math.max(...folderChats.map(c => getItemUpdatedMs(c)));
    topLevelItems.push({ kind: 'named-folder', sortMs, data: { folder, chats: folderChats } });
  });
  unfiledConversations.forEach(c => {
    topLevelItems.push({ kind: 'chat', sortMs: getItemUpdatedMs(c), data: c });
  });
  taskAgentRunsWithoutWorkedFolder.forEach(run => {
    topLevelItems.push({ kind: 'task-run', sortMs: getItemUpdatedMs(run), data: run });
  });
  topLevelItems.sort((a, b) => b.sortMs - a.sortMs);

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
    const updatedAt = chat.last_message_at || chat.updated_at || chat.updatedAt || chat.created_at;
    const itemTitle = chat.title || (isTaskAgent ? 'Task agent run' : 'Untitled conversation');
    const selectionItem = { id: chat.id, type: chat.type, title: itemTitle };
    const isSelected = Boolean(selectedItems[getSelectionKey(selectionItem)]);
    const hasSelection = selectedCount > 0;
    const canSelect = !isTaskAgent && !isActiveRun;
    const canOpen = isActiveRun || !isTaskAgent || chat.sessionId;
    const workingContext = getWorkingContext(chat);
    const workingContextLabel = formatWorkingContextLabel(workingContext);
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
        className={`flex items-center gap-2 px-3 py-2.5 border-b transition-colors group ${
          canOpen ? 'cursor-pointer' : 'cursor-default'
        } ${
          isSelected
            ? 'rounded-lg bg-gray-100/80 dark:bg-gray-800/50 midnight:bg-slate-900/60 border-transparent'
            : 'rounded-lg border-transparent hover:bg-gray-100/70 dark:hover:bg-gray-800/35 midnight:hover:bg-slate-900/45'
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
                  title={workingContext?.workingDir || ''}
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
    <div data-command-center className="flex flex-col h-full bg-transparent overflow-hidden">
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
          {serverSearching
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
            : <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          }
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white/40 py-2 pl-10 pr-4 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-100 dark:focus:border-gray-700 dark:focus:ring-gray-700 midnight:border-slate-800 midnight:bg-slate-950/30 midnight:text-slate-100"
          />
          {serverSearchResults !== null && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              {filteredConversations.length} found
            </span>
          )}
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
          ) : filteredConversations.length === 0 && filteredTaskAgentRuns.length === 0 && filteredActiveChatRuns.length === 0 ? (
            <div className="text-center py-20">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-500 midnight:border-slate-800 midnight:text-slate-500">
                <MessageSquare className="w-4 h-4" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No conversations found</p>
            </div>
          ) : (
            <div className="space-y-2 text-left">
              {topLevelItems.map(item => {
                if (item.kind === 'worked-folder') {
                  const group = item.data;
                  const isExpanded = expandedFolders[group.expandedKey] ?? true;
                  return (
                    <div key={group.key} className="mb-4">
                      <button
                        type="button"
                        onClick={() => toggleFolder(group.expandedKey)}
                        className="mb-1.5 flex min-h-8 w-full max-w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/35 dark:hover:text-white midnight:text-slate-300 midnight:hover:bg-slate-900/45"
                        title={group.title}
                      >
                        {isExpanded
                          ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-gray-500" />
                          : <Folder className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        }
                        <span className="truncate">{group.label}</span>
                      </button>
                      {isExpanded && renderChatList(group.items)}
                    </div>
                  );
                }
                if (item.kind === 'named-folder') {
                  const { folder, chats } = item.data;
                  const isExpanded = expandedFolders[folder.id];
                  return (
                    <div key={`folder-${folder.id}`} className="mb-4">
                      <button
                        type="button"
                        onClick={() => toggleFolder(folder.id)}
                        className="mb-1.5 flex min-h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/35 dark:hover:text-white midnight:text-slate-300 midnight:hover:bg-slate-900/45"
                      >
                        {isExpanded
                          ? <FolderOpen className="h-4 w-4 text-gray-500" />
                          : <Folder className="h-4 w-4 text-gray-500" />
                        }
                        {folder.name}
                        <span className="text-xs font-normal text-gray-400">({chats.length})</span>
                      </button>
                      {isExpanded && renderChatList(chats)}
                    </div>
                  );
                }
                return renderChatItem(item.data);
              })}
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
