import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { chatApi, chatFoldersApi } from './commandCenterApi';
import { MessageSquare, Clock, Search, Folder, FolderOpen } from 'lucide-react';

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
  
  const [conversations, setConversations] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState({});

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
      
      const initialExpandedState = {};
      loadedFolders.forEach(f => { initialExpandedState[f.id] = true; });
      setExpandedFolders(initialExpandedState);
      
    } catch (err) {
      console.error('Failed to load chats:', err);
      setError('Failed to load conversations or folders');
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const filteredConversations = conversations.filter(c => 
    (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.preview || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const folderMap = {};
  folders.forEach(f => { folderMap[f.id] = []; });
  const unfiledConversations = [];

  filteredConversations.forEach(c => {
    if (c.folder_id && folderMap[c.folder_id]) {
      folderMap[c.folder_id].push(c);
    } else {
      unfiledConversations.push(c);
    }
  });

  const renderChatList = (chats) => {
    if (chats.length === 0) return null;
    return (
      <div className="border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-900 midnight:bg-slate-900 mb-6">
        {chats.map((chat, idx) => (
          <div 
            key={chat.id} 
            onClick={() => navigate(`/conversations/${chat.id}`)}
            className={`block group cursor-pointer p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50 ${idx !== chats.length - 1 ? 'border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800' : ''}`}
          >
            <div className="flex items-baseline justify-between mb-1 gap-4">
              <h3 className="font-medium text-gray-900 dark:text-white midnight:text-slate-100 truncate text-base">
                {chat.title || 'Untitled Chat'}
              </h3>
            </div>
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 truncate">
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
                {getRelativeTime(chat.updated_at)}
              </span>
              {chat.preview && (
                <>
                  <span className="mx-2">•</span>
                  <span className="truncate">{chat.preview}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950 overflow-hidden">
      <div className="max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col h-full relative z-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
          <h1 className="text-2xl font-serif text-gray-900 dark:text-white midnight:text-slate-100">
            {currentWorkspace?.name || "Workspace"} Chats
          </h1>
        </div>

        {/* Search */}
        <div className="relative mb-8 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search your chats..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 midnight:bg-slate-950 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-sans"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex flex-col p-4 border border-gray-100 dark:border-gray-800/50 rounded-xl">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-red-500 text-center py-10 font-medium">
              {error}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-20">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4 opacity-50" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No chats found</p>
            </div>
          ) : (
            <div className="space-y-4 text-left">
              {folders.map(folder => {
                const folderChats = folderMap[folder.id];
                if (folderChats.length === 0) return null;
                const isExpanded = expandedFolders[folder.id];
                
                return (
                  <div key={folder.id} className="mb-6">
                    <button 
                      onClick={() => toggleFolder(folder.id)}
                      className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {isExpanded ? <FolderOpen className="w-4 h-4 text-indigo-500" /> : <Folder className="w-4 h-4 text-indigo-500" />}
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
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 px-1">
                      Unfiled
                    </h3>
                  )}
                  {renderChatList(unfiledConversations)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatsPage;
