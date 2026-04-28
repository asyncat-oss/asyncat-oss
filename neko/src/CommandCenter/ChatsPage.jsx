import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { chatApi, chatFoldersApi, agentApi } from './commandCenterApi';
import { useCommandCenter } from './CommandCenterContextEnhanced';
import { MessageSquare, Clock, Search, Folder, FolderOpen, Bot, Plus } from 'lucide-react';

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

const agentSessionStatus = (s) => {
  if (s.status === 'error' || s.status === 'failed') return 'error';
  if (s.scratchpad?.finalAnswer || s.status === 'complete') return 'complete';
  return 'incomplete';
};

const ChatsPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { handleNewConversation } = useCommandCenter();

  const handleNewChat = useCallback(async () => {
    if (handleNewConversation) await handleNewConversation();
    navigate('/home');
  }, [handleNewConversation, navigate]);

  const [activeTab, setActiveTab] = useState('chats');

  // chats state
  const [conversations, setConversations] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});

  // agents state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

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

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await agentApi.getSessions(500);
      setSessions(res?.sessions || []);
    } catch (err) {
      console.error('Failed to load agent sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadSessions();
  }, [loadAll, loadSessions]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const q = searchQuery.toLowerCase();

  const filteredConversations = conversations.filter(c =>
    (c.title || '').toLowerCase().includes(q) ||
    (c.preview || '').toLowerCase().includes(q)
  );

  const filteredSessions = sessions.filter(s =>
    (s.goal || '').toLowerCase().includes(q)
  );

  // build folder map for chats
  const folderMap = {};
  folders.forEach(f => { folderMap[f.id] = []; });
  const unfiledConversations = [];
  filteredConversations.forEach(c => {
    if (c.folder_id && folderMap[c.folder_id]) folderMap[c.folder_id].push(c);
    else unfiledConversations.push(c);
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

  const renderAgentList = () => {
    if (sessionsLoading) return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-3 p-4 border border-gray-100 dark:border-gray-800/50 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );

    if (filteredSessions.length === 0) return (
      <div className="text-center py-20">
        <Bot className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4 opacity-50" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No agent runs found</p>
      </div>
    );

    return (
      <div className="border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-900 midnight:bg-slate-900">
        {filteredSessions.map((s, idx) => {
          const status = agentSessionStatus(s);
          return (
            <div
              key={s.id}
              onClick={() => navigate(`/agents/${s.id}`)}
              className={`group cursor-pointer p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50 ${idx !== filteredSessions.length - 1 ? 'border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  status === 'error' ? 'bg-red-400' : status === 'incomplete' ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white midnight:text-slate-100 truncate text-base">
                    {s.goal || '(untitled)'}
                  </h3>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    {s.created_at ? getRelativeTime(s.created_at) : '—'}
                    <span className="mx-1">•</span>
                    <span className={`text-xs font-medium ${
                      status === 'error' ? 'text-red-500' : status === 'incomplete' ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {status === 'error' ? 'Failed' : status === 'incomplete' ? 'In progress' : 'Complete'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950 overflow-hidden">
      <div className="max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col h-full relative z-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h1 className="text-2xl font-serif text-gray-900 dark:text-white midnight:text-slate-100">
            History
          </h1>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 rounded-xl p-1 w-fit flex-shrink-0">
          {[
            { key: 'chats', label: 'Chats', Icon: MessageSquare },
            { key: 'agents', label: 'Agent Runs', Icon: Bot },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                activeTab === key
                  ? 'bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === 'chats' ? 'Search chats…' : 'Search agent runs…'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-sans"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {activeTab === 'chats' && (
            loading ? (
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
                <p className="text-gray-500 dark:text-gray-400 font-medium">No chats found</p>
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
                        className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        {isExpanded
                          ? <FolderOpen className="w-4 h-4 text-indigo-500" />
                          : <Folder className="w-4 h-4 text-indigo-500" />
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
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 px-1">Unfiled</h3>
                    )}
                    {renderChatList(unfiledConversations)}
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'agents' && renderAgentList()}
        </div>
      </div>
    </div>
  );
};

export default ChatsPage;
