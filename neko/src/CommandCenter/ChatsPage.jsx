import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import eventBus from '../utils/eventBus.js';
import { agentApi, chatApi, chatFoldersApi } from './commandCenterApi';
import { useCommandCenter } from './CommandCenterContextEnhanced';
import { Bot, MessageSquare, CheckSquare, Clock, Search, Folder, FolderOpen, Plus, Pencil, Square, Trash2, Wrench, X } from 'lucide-react';

const getRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffH = Math.floor((now - date) / 3_600_000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const cleanAgentTitle = (session) => {
  const firstLine = String(session.goal || '').split('\n').find(Boolean) || '';
  if (!firstLine || /^Work on task card\s+/i.test(firstLine)) {
    return session.task_card_title || firstLine.replace(/^Work on task card\s+/i, '').replace(/\s+\([^)]+\)\.?$/, '').replace(/^"|"$/g, '').trim();
  }
  return firstLine.trim();
};

const ChatsPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { handleNewConversation } = useCommandCenter();

  const handleNewChat = useCallback(async () => {
    if (handleNewConversation) await handleNewConversation();
    navigate('/home');
  }, [handleNewConversation, navigate]);

  const [conversations, setConversations] = useState([]);
  const [agentSessions, setAgentSessions] = useState([]);
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
      setAgentSessions([]);
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
        agentApi.getSessions(500)
      ]);

      const convs = convRes?.conversations || [];
      convs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setConversations(convs);
      setAgentSessions(agentRes?.sessions || []);

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
      if (actionModal.type === 'agent') {
        await agentApi.renameSession(itemId, newTitle);
        setAgentSessions(prev => prev.map(s => s.id === itemId ? { ...s, goal: newTitle, task_card_title: null } : s));
      } else {
        await chatApi.updateConversation(itemId, { title: newTitle });
        setConversations(prev => prev.map(c => c.id === itemId ? { ...c, title: newTitle } : c));
      }
      setActionModal(null);
    } catch (err) {
      console.error('Failed to rename item:', err);
    }
  };

  const confirmDelete = async () => {
    const itemId = actionModal.id;
    const itemType = actionModal.type;
    setActionModal(null);
    if (itemType === 'agent') {
      setAgentSessions(prev => prev.filter(s => s.id !== itemId));
    } else {
      setConversations(prev => prev.filter(c => c.id !== itemId));
    }
    try {
      if (itemType === 'agent') {
        await agentApi.deleteSession(itemId);
      } else {
        await chatApi.deleteConversation(itemId);
      }
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

  const filteredAgentSessions = agentSessions
    .map(session => {
      const title = cleanAgentTitle(session) || 'Agent run';
      const preview = session.task_run_activity || session.task_run_summary || session.goal || '';
      return { ...session, type: 'agent', title, preview };
    })
    .filter(session =>
      session.title.toLowerCase().includes(q) ||
      (session.preview || '').toLowerCase().includes(q) ||
      (session.profile_name || '').toLowerCase().includes(q)
    );

  const folderMap = {};
  folders.forEach(f => { folderMap[f.id] = []; });
  const unfiledConversations = [];
  filteredConversations.forEach(c => {
    if (c.folder_id && folderMap[c.folder_id]) folderMap[c.folder_id].push(c);
    else unfiledConversations.push(c);
  });

  const visibleItems = [...filteredConversations, ...filteredAgentSessions];
  const selectedList = Object.values(selectedItems);
  const selectedCount = selectedList.length;
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(item => selectedItems[getSelectionKey(item)]);

  const selectAllVisible = () => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (allVisibleSelected) {
        visibleItems.forEach(item => delete next[getSelectionKey(item)]);
      } else {
        visibleItems.forEach(item => {
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
    setConversations(prev => prev.filter(chat => !items.some(item => item.type !== 'agent' && item.id === chat.id)));
    setAgentSessions(prev => prev.filter(session => !items.some(item => item.type === 'agent' && item.id === session.id)));
    try {
      const results = await Promise.allSettled(items.map(item => (
        item.type === 'agent'
          ? agentApi.deleteSession(item.id)
          : chatApi.deleteConversation(item.id)
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
    const isAgent = chat.type === 'agent';
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const lastAssistant = [...messages].reverse().find(msg => msg.type === 'assistant');
    const toolsUsed = isAgent || messages.some(msg => msg.toolsEnabled === true || msg.agentSessionId);
    const updatedAt = chat.updated_at || chat.updatedAt;
    const itemTitle = chat.title || (isAgent ? 'Agent run' : 'Untitled conversation');
    const selectionItem = { id: chat.id, type: chat.type, title: itemTitle };
    const isSelected = Boolean(selectedItems[getSelectionKey(selectionItem)]);
    const hasSelection = selectedCount > 0;

    return (
      <div
        key={`${chat.type}-${chat.id}`}
        onClick={(e) => {
          if (hasSelection) {
            toggleSelection(e, selectionItem);
          } else {
            navigate(isAgent ? `/agents/${chat.id}` : `/conversations/${chat.id}`);
          }
        }}
        className={`flex items-center gap-3 p-4 bg-white dark:bg-gray-800 midnight:bg-gray-800 border rounded-lg transition-colors cursor-pointer group ${
          isSelected
            ? 'border-gray-400 dark:border-gray-400 midnight:border-slate-400 ring-1 ring-gray-300 dark:ring-gray-600'
            : 'border-gray-100 dark:border-gray-700 midnight:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
        }`}
      >
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
        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 flex items-center justify-center flex-shrink-0">
          {isAgent
            ? <Bot className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            : <MessageSquare className="w-5 h-5 text-gray-400 dark:text-gray-500" />
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
                <span className="inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {isAgent ? <Bot className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                  {isAgent ? (chat.profile_name || 'Agent') : 'Tools'}
                </span>
              </>
            )}
            {isAgent && chat.status && (
              <>
                <span>•</span>
                <span className="capitalize flex-shrink-0">{chat.task_run_status || chat.status}</span>
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
        <div className={`flex items-center gap-0.5 transition-opacity flex-shrink-0 ${hasSelection ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            onClick={e => openActionModal(e, { id: chat.id, type: chat.type, title: itemTitle })}
            title="Edit"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
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
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950 overflow-hidden">
      <div className="max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col h-full relative z-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h1 className="text-2xl font-medium text-gray-900 dark:text-white midnight:text-slate-100">
            Conversation History
          </h1>
          <div className="flex items-center gap-2">
            {visibleItems.length > 0 && (
              <button
                onClick={selectAllVisible}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {allVisibleSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                {allVisibleSelected ? 'Deselect all' : 'Select'}
              </button>
            )}
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400/50 transition-all"
          />
        </div>

        {selectedCount > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50 dark:bg-gray-800 midnight:bg-slate-900 px-3 py-2 flex-shrink-0">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {selectedCount} selected
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={deleteSelected}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {bulkDeleting ? 'Deleting' : 'Delete'}
              </button>
              <button
                onClick={clearSelection}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
                <div key={i} className="animate-pulse flex flex-col p-4 border border-gray-100 dark:border-gray-800/50 rounded-xl">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-red-500 text-center py-10 font-medium">{error}</div>
          ) : filteredConversations.length === 0 && filteredAgentSessions.length === 0 ? (
            <div className="text-center py-20">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4 opacity-50" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No conversations found</p>
            </div>
          ) : (
            <div className="space-y-4 text-left">
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
              {filteredAgentSessions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-slate-300 mb-3 px-1">Agent runs</h3>
                  {renderChatList(filteredAgentSessions)}
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
            className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 midnight:border-gray-800"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-4">
              Edit {actionModal.type === 'agent' ? 'agent run' : 'conversation'}
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
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400/50 mb-6"
            />
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-4">
              <button
                onClick={confirmDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActionModal(null)}
                  className="px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveRename}
                  className="px-4 py-1.5 text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
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
