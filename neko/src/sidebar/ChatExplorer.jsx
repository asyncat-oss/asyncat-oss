import { useState, useEffect, useCallback, memo, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  AlertCircle,
  Plus,
  Folder,
  FolderOpen,
  ChevronRight,
  MoreHorizontal,
  FolderPlus,
  Pencil,
  Trash2,
  FolderMinus,
  Check,
  X,
} from 'lucide-react';
import { chatApi, chatFoldersApi } from '../CommandCenter/commandCenterApi';
import { useCommandCenter } from '../CommandCenter/CommandCenterContextEnhanced';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useBackgroundTasks } from '../hooks/useBackgroundTasks';

// ─── helpers ────────────────────────────────────────────────────────────────

const getRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffH = Math.floor((now - date) / 3_600_000);
  if (diffH < 1) return 'now';
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const groupByTime = (conversations) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86_400_000);
  const lastWeek = new Date(today - 7 * 86_400_000);
  const lastMonth = new Date(today - 30 * 86_400_000);

  const g = { pinned: [], today: [], yesterday: [], lastWeek: [], lastMonth: [], older: [] };

  conversations.forEach(c => {
    const d = new Date(c.updated_at);
    if (c.is_pinned) g.pinned.push(c);
    else if (d >= today) g.today.push(c);
    else if (d >= yesterday) g.yesterday.push(c);
    else if (d >= lastWeek) g.lastWeek.push(c);
    else if (d >= lastMonth) g.lastMonth.push(c);
    else g.older.push(c);
  });
  return g;
};

const normalizeFolders = (items) => (
  Array.isArray(items)
    ? items.filter(folder => folder?.id).map(folder => ({
        ...folder,
        name: folder.name?.trim() || 'Untitled folder',
      }))
    : []
);

// ─── skeletons ──────────────────────────────────────────────────────────────

const ChatSkeleton = () => (
  <div className="flex items-center py-2 px-3 space-x-3 animate-pulse">
    <div className="flex-1">
      <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-3/4 mb-2" />
      <div className="h-2 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-1/2" />
    </div>
  </div>
);

// ─── context menu ────────────────────────────────────────────────────────────

const ConversationMenu = memo(({ conversation, folders, onAssign, onUnassign, onClose, anchorRef }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  const currentFolderId = conversation.folder_id;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg py-1 text-sm"
    >
      {currentFolderId && (
        <button
          onClick={() => { onUnassign(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
        >
          <FolderMinus className="w-3.5 h-3.5 text-gray-400" />
          Remove from folder
        </button>
      )}

      {folders.length > 0 && (
        <>
          {currentFolderId && <div className="my-1 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800" />}
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-600 midnight:text-gray-600 font-semibold">
            Move to folder
          </div>
          {folders.filter(f => f?.id).map(f => (
            <button
              key={f.id}
              onClick={() => { onAssign(f.id); onClose(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                f.id === currentFolderId
                  ? 'text-blue-600 dark:text-blue-400 midnight:text-blue-400 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20'
                  : 'text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800'
              }`}
            >
              {f.id === currentFolderId
                ? <Check className="w-3.5 h-3.5" />
                : <Folder className="w-3.5 h-3.5 text-gray-400" />
              }
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </>
      )}

      {folders.length === 0 && !currentFolderId && (
        <div className="px-3 py-2 text-gray-400 dark:text-gray-600 text-xs">
          No folders yet
        </div>
      )}
    </div>
  );
});

ConversationMenu.displayName = 'ConversationMenu';

// ─── conversation item ───────────────────────────────────────────────────────

const ConversationItem = memo(({ conversation, isSelected, onSelect, isLoading, folders, onAssign, onUnassign, bgStatus }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);

  const isBgStreaming = bgStatus === 'streaming';
  const isBgDone = bgStatus === 'done';

  return (
    <div
      className={`group relative flex items-center py-2 px-3 rounded-lg transition-all duration-150 ${
        isBgStreaming ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
      } ${
        isSelected
          ? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-200'
          : 'text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 active:scale-[0.98]'
      } ${isLoading ? 'opacity-60 pointer-events-none' : ''} ${menuOpen ? 'z-50' : ''}`}
      title={isBgStreaming ? 'Generating response...' : undefined}
      onClick={() => !menuOpen && !isBgStreaming && onSelect(conversation)}
    >
      <div className="flex items-center gap-2 mr-2">
        {isLoading && (
          <div className="w-3 h-3 border-2 border-gray-200 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin flex-shrink-0" />
        )}
        {!isLoading && isBgStreaming && (
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse flex-shrink-0" title="Generating response..." />
        )}
        {!isLoading && isBgDone && (
          <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Response ready" />
        )}
        {!isLoading && !isBgStreaming && !isBgDone && Boolean(conversation.is_pinned) && (
          <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="block truncate font-medium text-sm" title={conversation.title || 'Untitled Chat'}>
            {conversation.title || 'Untitled Chat'}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0 group-hover:hidden">
            {getRelativeTime(conversation.updated_at)}
          </span>
          {/* ⋯ button revealed on hover */}
          <div className="hidden group-hover:flex items-center ml-2 flex-shrink-0 relative">
            <button
              ref={btnRef}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <ConversationMenu
                conversation={conversation}
                folders={folders}
                onAssign={(fid) => onAssign(conversation.id, fid)}
                onUnassign={() => onUnassign(conversation.id)}
                onClose={() => setMenuOpen(false)}
                anchorRef={btnRef}
              />
            )}
          </div>
        </div>

        {conversation.preview && (
          <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 truncate">
            {conversation.preview}
          </div>
        )}

        {conversation.mode && conversation.mode !== 'chat' && (
          <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs font-medium capitalize mt-0.5">
            {conversation.mode}
          </span>
        )}
      </div>
    </div>
  );
});

ConversationItem.displayName = 'ConversationItem';

// ─── time group ──────────────────────────────────────────────────────────────

const TimeGroup = memo(({ title, conversations, isSelected, onSelect, loadingConversationId, folders, onAssign, onUnassign, showTitle = true, bgTaskMap }) => {
  if (conversations.length === 0) return null;
  return (
    <div className="mb-5">
      {showTitle && (
        <div className="px-3 py-1.5 mb-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 midnight:bg-gray-600 uppercase tracking-wider">
            {title}
          </span>
        </div>
      )}
      <div className="space-y-0.5">
        {conversations.map(c => (
          <ConversationItem
            key={c.id}
            conversation={c}
            isSelected={isSelected(c)}
            onSelect={onSelect}
            isLoading={loadingConversationId === c.id}
            folders={folders}
            onAssign={onAssign}
            onUnassign={onUnassign}
            bgStatus={bgTaskMap?.get(c.id)?.status ?? null}
          />
        ))}
      </div>
    </div>
  );
});

TimeGroup.displayName = 'TimeGroup';

// ─── folder item ─────────────────────────────────────────────────────────────

const FolderItem = memo(({ folder, conversations, isExpanded, onToggle, isSelected, onSelect, loadingConversationId, folders, onAssign, onUnassign, onRename, onDelete, bgTaskMap }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.select();
  }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const commitRename = () => {
    const v = renameValue.trim();
    if (v && v !== folder.name) onRename(folder.id, v);
    setRenaming(false);
  };

  return (
    <div className="mb-1">
      {/* Folder header row */}
      <div
        className="group flex items-center gap-1.5 py-1.5 px-3 rounded-lg cursor-pointer text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
        onClick={() => !menuOpen && !renaming && onToggle(folder.id)}
      >
        <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />

        {isExpanded
          ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
          : <Folder className="w-3.5 h-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
        }

        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(folder.name); }
            }}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm bg-transparent border-0 border-b border-gray-400 dark:border-gray-500 outline-none text-gray-800 dark:text-gray-200 py-0"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm font-medium">
            {folder.name}
          </span>
        )}

        <span className="text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0 group-hover:hidden">
          {conversations.length}
        </span>

        {/* folder ⋯ */}
        <div className="flex items-center flex-shrink-0 relative">
          <button
            ref={btnRef}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            className="p-0.5 rounded text-gray-400 opacity-70 hover:opacity-100 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors"
            title="Folder actions"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg py-1 text-sm"
            >
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenaming(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-400" />
                Rename
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(folder.id); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete folder
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Folder contents */}
      {isExpanded && (
        <div className="pl-4 space-y-0.5 mt-0.5">
          {conversations.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">Empty folder</div>
          ) : (
            conversations.map(c => (
              <ConversationItem
                key={c.id}
                conversation={c}
                isSelected={isSelected(c)}
                onSelect={onSelect}
                isLoading={loadingConversationId === c.id}
                folders={folders}
                onAssign={onAssign}
                onUnassign={onUnassign}
                bgStatus={bgTaskMap?.get(c.id)?.status ?? null}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
});

FolderItem.displayName = 'FolderItem';

// ─── new folder input ────────────────────────────────────────────────────────

const NewFolderInput = memo(({ onSubmit, onCancel }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const v = value.trim();
    if (v) onSubmit(v);
    else onCancel();
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 mb-1">
      <Folder className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Folder name…"
        className="flex-1 min-w-0 text-sm bg-transparent border-0 outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
      />
      <button onClick={submit} className="text-gray-400 hover:text-blue-500 transition-colors">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-red-500 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

NewFolderInput.displayName = 'NewFolderInput';

// ─── main component ──────────────────────────────────────────────────────────

const ChatExplorer = ({ isChatMode = false, isCollapsed = false, onNewChat, showNewChatButton = true }) => {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingConversationId, setLoadingConversationId] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);

  const {
    loadConversation,
    currentConversationId,
    handleNewConversation,
    messages,
    setConversationListRefresh,
  } = useCommandCenter();

  const { currentWorkspace } = useWorkspace();
  const bgTaskMap = useBackgroundTasks();
  const prevBgTaskMapRef = useRef(new Map());

  // ── data loading ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async (showLoading = true) => {
    if (!currentWorkspace?.id) {
      setConversations([]);
      setFolders([]);
      if (showLoading) setLoading(false);
      setError('No workspace selected');
      return;
    }

    try {
      if (showLoading) setLoading(true);
      setError(null);

      const [convRes, foldRes] = await Promise.all([
        chatApi.getConversationHistory({ limit: 100, archived: false }),
        chatFoldersApi.getFolders()
      ]);

      const convs = convRes?.conversations || [];
      convs.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at) - new Date(a.updated_at);
      });
      setConversations(convs);
      setFolders(normalizeFolders(foldRes?.folders));
    } catch (err) {
      console.error('Failed to load chat explorer data:', err);
      setError('Failed to load conversations');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    setConversationListRefresh(() => () => loadAll(false));
    return () => setConversationListRefresh(null);
  }, [loadAll, setConversationListRefresh]);

  useEffect(() => {
    if (currentConversationId && messages.length >= 2) {
      const t = setTimeout(() => loadAll(false), 500);
      return () => clearTimeout(t);
    }
  }, [currentConversationId, messages.length, loadAll]);

  // When a background task completes, refresh the conversation list so the
  // newly-saved response appears and the indicator disappears.
  useEffect(() => {
    const prev = prevBgTaskMapRef.current;
    let needsRefresh = false;
    bgTaskMap.forEach((task, id) => {
      const prevTask = prev.get(id);
      if (prevTask?.status === 'streaming' && (task.status === 'done' || task.status === 'error')) {
        needsRefresh = true;
      }
    });
    prevBgTaskMapRef.current = bgTaskMap;
    if (needsRefresh) {
      loadAll(false);
    }
  }, [bgTaskMap, loadAll]);

  // ── folder state helpers ──────────────────────────────────────────────────

  const toggleFolder = useCallback((folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  }, []);

  const handleCreateFolder = useCallback(async (name) => {
    setShowNewFolder(false);
    try {
      const res = await chatFoldersApi.createFolder(name);
      if (res?.folder?.id) {
        setFolders(prev => [...prev, res.folder]);
        setExpandedFolders(prev => ({ ...prev, [res.folder.id]: true }));
      } else {
        loadAll(false);
      }
    } catch (err) {
      console.error('Create folder error:', err);
    }
  }, [loadAll]);

  const handleRenameFolder = useCallback(async (folderId, name) => {
    try {
      const res = await chatFoldersApi.updateFolder(folderId, { name });
      if (res?.folder?.id) setFolders(prev => prev.map(f => f.id === folderId ? res.folder : f));
    } catch (err) {
      console.error('Rename folder error:', err);
    }
  }, []);

  const handleDeleteFolder = useCallback(async (folderId) => {
    try {
      await chatFoldersApi.deleteFolder(folderId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      // Conversations will have folder_id = null (DB ON DELETE SET NULL) - refresh
      loadAll(false);
    } catch (err) {
      console.error('Delete folder error:', err);
    }
  }, [loadAll]);

  const handleAssign = useCallback(async (conversationId, folderId) => {
    // Optimistic update
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, folder_id: folderId } : c));
    try {
      await chatFoldersApi.assignConversation(conversationId, folderId);
    } catch (err) {
      console.error('Assign folder error:', err);
      loadAll(false);
    }
  }, [loadAll]);

  const handleUnassign = useCallback(async (conversationId) => {
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, folder_id: null } : c));
    try {
      await chatFoldersApi.assignConversation(conversationId, null);
    } catch (err) {
      console.error('Unassign folder error:', err);
      loadAll(false);
    }
  }, [loadAll]);

  // ── conversation selection ────────────────────────────────────────────────

  const handleSelectConversation = useCallback(async (conversation) => {
    if (loadingConversationId) return;
    // Block navigation to a conversation that's still streaming in the background
    if (bgTaskMap.get(conversation.id)?.status === 'streaming') return;
    try {
      setLoadingConversationId(conversation.id);
      navigate(`/conversations/${conversation.id}`);
      await loadConversation(conversation.id);
      // Mode is no longer used - all conversations are chat mode
    } catch (err) {
      console.error('Failed to load conversation:', err);
      navigate('/home');
    } finally {
      setTimeout(() => setLoadingConversationId(null), 300);
    }
  }, [loadConversation, navigate, loadingConversationId, bgTaskMap]);

  const handleNewChatClick = useCallback(async () => {
    try {
      await handleNewConversation();
      onNewChat?.();
      navigate('/home');
    } catch (err) {
      console.error('Failed to create new conversation:', err);
    }
  }, [handleNewConversation, onNewChat, navigate]);

  // ── derived data ──────────────────────────────────────────────────────────

  const folderConversations = useMemo(() => {
    const map = {};
    folders.forEach(f => { if (f.id) map[f.id] = []; });
    conversations.forEach(c => {
      if (c.folder_id && map[c.folder_id]) map[c.folder_id].push(c);
    });
    return map;
  }, [folders, conversations]);

  const unfiledConversations = useMemo(
    () => conversations.filter(c => !c.folder_id),
    [conversations]
  );

  const timeGroups = useMemo(() => groupByTime(unfiledConversations), [unfiledConversations]);

  const isSelected = useCallback(
    (c) => isChatMode && c.id === currentConversationId,
    [isChatMode, currentConversationId]
  );

  // ── collapsed view ────────────────────────────────────────────────────────

  if (isCollapsed) {
    return (
      <div className="px-2">
        <button
          onClick={handleNewChatClick}
          className="w-full p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
          title="New Chat"
        >
          <MessageSquare className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
        </button>
      </div>
    );
  }

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {/* New Chat Button */}
      {showNewChatButton && currentWorkspace?.id && (
        <div className="mb-2">
          <button
            onClick={handleNewChatClick}
            className="w-full flex items-center justify-start px-3 py-2 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md transition-colors text-xs font-medium border border-dashed border-gray-300 dark:border-gray-700 midnight:border-gray-800"
          >
            <Plus className="w-3.5 h-3.5 mr-2" />
            New Chat
          </button>
        </div>
      )}

      {/* No workspace */}
      {!currentWorkspace?.id && (
        <div className="p-3 bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/30 border border-orange-200 dark:border-orange-800 midnight:border-orange-700 rounded-lg mb-4">
          <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 midnight:text-orange-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Select a workspace to view conversations</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <ChatSkeleton key={i} />)}
        </div>
      ) : error && error !== 'No workspace selected' ? (
        <div className="py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400 mb-3">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadAll()}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
          >
            Try again
          </button>
        </div>
      ) : currentWorkspace?.id ? (
        <div>
          {/* ── Folders section ── */}
          <div className="mb-2">
            {/* Section header */}
            <div className="flex items-center justify-between px-3 py-1.5 mb-1">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Folders
              </span>
              <button
                onClick={() => setShowNewFolder(true)}
                className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors"
                title="New folder"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* New folder input */}
            {showNewFolder && (
              <NewFolderInput
                onSubmit={handleCreateFolder}
                onCancel={() => setShowNewFolder(false)}
              />
            )}

            {/* Folder list */}
            {folders.length === 0 && !showNewFolder ? (
              <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-600">
                No folders yet
              </div>
            ) : (
              <div className="space-y-0.5">
                {folders.map(folder => (
                  <FolderItem
                    key={folder.id}
                    folder={folder}
                    conversations={folderConversations[folder.id] || []}
                    isExpanded={!!expandedFolders[folder.id]}
                    onToggle={toggleFolder}
                    isSelected={isSelected}
                    onSelect={handleSelectConversation}
                    loadingConversationId={loadingConversationId}
                    folders={folders}
                    onAssign={handleAssign}
                    onUnassign={handleUnassign}
                    onRename={handleRenameFolder}
                    onDelete={handleDeleteFolder}
                    bgTaskMap={bgTaskMap}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Unfiled conversations ── */}
          {unfiledConversations.length > 0 && (
            <div className="mt-2">
              {folders.length > 0 && (
                <div className="px-3 py-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Unfiled
                  </span>
                </div>
              )}

              {timeGroups.pinned?.length > 0 && (
                <TimeGroup title="Pinned" conversations={timeGroups.pinned} isSelected={isSelected} onSelect={handleSelectConversation} loadingConversationId={loadingConversationId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} bgTaskMap={bgTaskMap} />
              )}
              {timeGroups.today?.length > 0 && (
                <TimeGroup title="Today" conversations={timeGroups.today} isSelected={isSelected} onSelect={handleSelectConversation} loadingConversationId={loadingConversationId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} bgTaskMap={bgTaskMap} />
              )}
              {timeGroups.yesterday?.length > 0 && (
                <TimeGroup title="Yesterday" conversations={timeGroups.yesterday} isSelected={isSelected} onSelect={handleSelectConversation} loadingConversationId={loadingConversationId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} bgTaskMap={bgTaskMap} />
              )}
              {timeGroups.lastWeek?.length > 0 && (
                <TimeGroup title="Previous 7 days" conversations={timeGroups.lastWeek} isSelected={isSelected} onSelect={handleSelectConversation} loadingConversationId={loadingConversationId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} bgTaskMap={bgTaskMap} />
              )}
              {timeGroups.lastMonth?.length > 0 && (
                <TimeGroup title="Previous 30 days" conversations={timeGroups.lastMonth} isSelected={isSelected} onSelect={handleSelectConversation} loadingConversationId={loadingConversationId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} bgTaskMap={bgTaskMap} />
              )}
              {timeGroups.older?.length > 0 && (
                <TimeGroup title="Older" conversations={timeGroups.older} isSelected={isSelected} onSelect={handleSelectConversation} loadingConversationId={loadingConversationId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} bgTaskMap={bgTaskMap} />
              )}
            </div>
          )}

          {/* All in folders, nothing unfiled */}
          {conversations.length > 0 && unfiledConversations.length === 0 && folders.length > 0 && (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">
              All conversations are in folders
            </div>
          )}

          {/* Empty state */}
          {conversations.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500">No conversations yet</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default memo(ChatExplorer);
