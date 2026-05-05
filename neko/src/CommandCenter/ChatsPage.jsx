import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import eventBus from '../utils/eventBus.js';
import { chatApi, chatFoldersApi } from './commandCenterApi';
import { useCommandCenter } from './CommandCenterContextEnhanced';
import { MessageSquare, Clock, Search, Folder, FolderOpen, Plus, Pencil, Trash2, Wrench } from 'lucide-react';

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

const ChatsPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { handleNewConversation } = useCommandCenter();

  const handleNewChat = useCallback(async () => {
    if (handleNewConversation) await handleNewConversation();
    navigate('/home');
  }, [handleNewConversation, navigate]);

  const [conversations, setConversations] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

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
      setFolders([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [convRes, foldRes] = await Promise.all([
        chatApi.getConversationHistory({ limit: 500, archived: false }),
        chatFoldersApi.getFolders()
      ]);

      const convs = convRes?.conversations || [];
      convs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setConversations(convs);

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

  const openActionModal = (e, id, title) => {
    e.stopPropagation();
    setActionModal({ id, title: title || '' });
    setActionModalTitle(title || '');
  };

  const saveRename = async () => {
    const chatId = actionModal.id;
    const newTitle = actionModalTitle.trim();
    if (!newTitle || newTitle === actionModal.title) { setActionModal(null); return; }
    try {
      await chatApi.updateConversation(chatId, { title: newTitle });
      setConversations(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
      setActionModal(null);
    } catch (err) {
      console.error('Failed to rename chat:', err);
    }
  };

  const confirmDelete = async () => {
    const chatId = actionModal.id;
    setActionModal(null);
    setConversations(prev => prev.filter(c => c.id !== chatId));
    try {
      await chatApi.deleteConversation(chatId);
    } catch (err) {
      console.error('Failed to delete chat:', err);
      loadAll();
    }
  };

  const q = searchQuery.toLowerCase();

  const filteredConversations = conversations.filter(c =>
    (c.title || '').toLowerCase().includes(q) ||
    (c.preview || '').toLowerCase().includes(q)
  );

  const folderMap = {};
  folders.forEach(f => { folderMap[f.id] = []; });
  const unfiledConversations = [];
  filteredConversations.forEach(c => {
    if (c.folder_id && folderMap[c.folder_id]) folderMap[c.folder_id].push(c);
    else unfiledConversations.push(c);
  });

  const renderChatItem = (chat) => {
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const lastAssistant = [...messages].reverse().find(msg => msg.type === 'assistant');
    const toolsUsed = messages.some(msg => msg.toolsEnabled === true || msg.agentSessionId);

    return (
      <div
        key={chat.id}
        onClick={() => navigate(`/conversations/${chat.id}`)}
        className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 midnight:bg-gray-800 border border-gray-100 dark:border-gray-700 midnight:border-gray-700 rounded-lg hover:border-gray-200 dark:hover:border-gray-600 transition-colors cursor-pointer group"
      >
        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
            {chat.title || 'Untitled conversation'}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className="flex-shrink-0">{getRelativeTime(chat.updated_at)}</span>
            {toolsUsed && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0">
                  <Wrench className="w-3 h-3" />
                  Tools
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
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={e => openActionModal(e, chat.id, chat.title)}
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
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
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
          ) : filteredConversations.length === 0 ? (
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
