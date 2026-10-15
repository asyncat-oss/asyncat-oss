// All chats (/all-chats): every conversation and running agent, grouped by
// the folder they worked in, with pinned chats first. Searching looks in
// titles and in what was said, and a hit opens the chat at that message.
import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import eventBus from '../../utils/eventBus.js';
import { chatApi, chatFoldersApi } from '../api';
import { useCommandCenter } from '../context/CommandCenterContextEnhanced';
import { CheckSquare, Clock, Search, Folder, FolderOpen, MoreHorizontal, Plus, Pencil, Pin, PinOff, Square, Trash2, Wrench, X, BookMarked, Loader2 } from 'lucide-react';

import { getRelativeTime, parseConversationDate } from '../utils/conversationUtils.js';
import { chosenProjectEmoji } from '../utils/projectEmoji.js';
import { useConfirm } from '../../components/confirmContext.js';
import { useToast, errorDetail } from '../../components/toastContext.js';
import ConversationBadge from '../../components/ConversationBadge.jsx';
import { ProviderGlyph } from '../../Models/modelLogos.jsx';
import AsyncatMark from '../../components/ui/AsyncatMark.jsx';
import Cat from '../../components/ui/Cat.jsx';
import { useAgents } from '../../Agent/useAgents.js';
import { conversationEngine, engineDisplayName } from '../../Agent/externalAgentFormat.js';
import Button from '../../components/ui/Button.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/Menu.jsx';
import SearchSnippet from '../../components/SearchSnippet.jsx';
import { chatLink, hitMessageId, isPinned, markTitle, withPinned } from '../../sidebar/chatSearch.js';
import { latestSearch } from '../../utils/latestSearch.js';

const ENGINE_FILTER_KEY = 'asyncat_chats_engine_filter';
const ENGINE_ORDER = ['asyncat', 'claude-code', 'codex'];

function basenamePath(value = '') {
  const parts = String(value || '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function formatWorkingContextLabel(context) {
  if (!context || typeof context !== 'object') return null;
  const folder = context.relativePath && context.relativePath !== '.'
    ? basenamePath(context.relativePath)
    : context.rootLabel || basenamePath(context.workingDir) || basenamePath(context.rootPath);
  const emoji = chosenProjectEmoji(context.projectEmoji);
  return context.projectName
    ? `${emoji ? `${emoji} ` : ''}${context.projectName}${folder ? ` / ${folder}` : ''}`
    : folder || null;
}

function getWorkingContext(item) {
  return item?.metadata?.workingContext || item?.workingContext || null;
}

function getWorkingContextFilterKey(context) {
  if (!context || typeof context !== 'object') return null;
  const root = context.projectId || context.rootId || context.rootPath || context.rootLabel || '';
  const relative = context.relativePath || context.workingDir || context.rootPath || '';
  if (!root && !relative) return null;
  return `${root}:${relative}`;
}

function getItemUpdatedMs(item) {
  const value = item?.last_message_at || item?.updated_at || item?.updatedAt || item?.created_at;
  return value ? new Date(value).getTime() || 0 : 0;
}

// A chat's ⋯ menu: pin, rename, delete.
function ChatRowMenu({ chatId, title, pinned, hidden, onTogglePin, onRename, onDelete }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={`Options for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-chat-options={chatId}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle outline-none transition-[opacity,background-color,color] hover:bg-selected hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 ${
          hidden ? 'pointer-events-none opacity-0' : open ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Menu anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} placement="bottom-end" width={176} label="Chat options">
        <MenuItem icon={pinned ? PinOff : Pin} label={pinned ? 'Unpin' : 'Pin'} onSelect={onTogglePin} />
        <MenuItem icon={Pencil} label="Rename" onSelect={onRename} />
        <MenuSeparator />
        <MenuItem icon={Trash2} label="Delete" danger onSelect={onDelete} />
      </Menu>
    </>
  );
}

ChatRowMenu.propTypes = {
  chatId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  pinned: PropTypes.bool,
  hidden: PropTypes.bool,
  onTogglePin: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

const ChatsPage = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
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
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSearchResults, setServerSearchResults] = useState(null); // null = use local, array = server results
  const [serverSearching, setServerSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState(''); // what the results answer
  const [serverIndexing, setServerIndexing] = useState(false); // older chats not searchable yet
  const serverSearchTimer = useRef(null);
  const [searches] = useState(latestSearch);
  const searchInputRef = useRef(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Which engine's chats to show: 'all', 'asyncat', 'claude-code', 'codex'…
  const [engineFilter, setEngineFilterState] = useState(() => {
    try { return localStorage.getItem(ENGINE_FILTER_KEY) || 'all'; } catch { return 'all'; }
  });
  const setEngineFilter = (value) => {
    setEngineFilterState(value);
    try { localStorage.setItem(ENGINE_FILTER_KEY, value); } catch { /* localStorage may be unavailable */ }
  };
  const { agents } = useAgents();
  const agentsById = new Map(agents.map(agent => [String(agent.id), agent]));

  const [actionModal, setActionModal] = useState(null);
  const [actionModalTitle, setActionModalTitle] = useState('');
  const renameInputRef = useRef(null);

  // The dialog focuses its first control; the name is what you came to edit.
  useEffect(() => {
    if (!actionModal) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
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
        chatFoldersApi.getFolders(),
      ]);

      const convs = convRes?.conversations || [];
      convs.sort((a, b) => {
        const bTime = parseConversationDate(b.last_message_at || b.updated_at || b.created_at)?.getTime() || 0;
        const aTime = parseConversationDate(a.last_message_at || a.updated_at || a.created_at)?.getTime() || 0;
        return bTime - aTime;
      });
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

  // Pinned or unpinned in the sidebar.
  useEffect(() => eventBus.on('conversationPinned', ({ id, pinned } = {}) => {
    if (!id) return;
    setConversations(prev => withPinned(prev, id, pinned));
    setServerSearchResults(prev => (prev ? withPinned(prev, id, pinned) : prev));
  }), []);

  // Renamed or deleted from the sidebar.
  useEffect(() => {
    const offRenamed = eventBus.on('conversationRenamed', ({ id, title } = {}) => {
      if (!id) return;
      const rename = (list) => list.map(c => (c.id === id ? { ...c, title } : c));
      setConversations(rename);
      setServerSearchResults(prev => (prev ? rename(prev) : prev));
    });
    const offDeleted = eventBus.on('conversationDeleted', ({ ids = [] } = {}) => {
      const gone = new Set(ids);
      const others = (list) => list.filter(c => !gone.has(c.id));
      setConversations(others);
      setServerSearchResults(prev => (prev ? others(prev) : prev));
    });
    return () => { offRenamed(); offDeleted(); };
  }, []);

  // Searches titles and messages 400 ms after typing stops. Each keystroke
  // cancels the search before it, so a slow answer for an older query never
  // replaces the results for what is in the box now. While older chats are
  // still being indexed, it looks again every few seconds, so they show up.
  const trimmedQuery = searchQuery.trim();
  useEffect(() => {
    if (trimmedQuery.length < 3) {
      setServerSearchResults(null);
      setServerSearching(false);
      setServerIndexing(false);
      return;
    }
    setServerSearching(true);
    const run = async (again = false) => {
      const signal = searches.start();
      let results = null;
      let indexing = false;
      try {
        const res = await chatApi.searchConversations(trimmedQuery, 50, { signal });
        results = res?.conversations || [];
        indexing = Boolean(res?.indexing);
      } catch {
        // Falls back to filtering the loaded list (a later look keeps what
        // is shown).
      }
      if (signal.aborted || (again && results === null)) return;
      setServerSearchResults(results);
      setSearchedQuery(trimmedQuery);
      setServerIndexing(indexing);
      setServerSearching(false);
      if (indexing) serverSearchTimer.current = setTimeout(() => run(true), 3000);
    };
    serverSearchTimer.current = setTimeout(() => run(), 400);
    return () => {
      clearTimeout(serverSearchTimer.current);
      searches.cancel();
    };
  }, [trimmedQuery, searches]);

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

  const openRename = (chat) => {
    setActionModal({ id: chat.id, title: chat.title || '' });
    setActionModalTitle(chat.title || '');
  };

  const saveRename = async () => {
    const itemId = actionModal.id;
    const newTitle = actionModalTitle.trim();
    if (!newTitle || newTitle === actionModal.title) { setActionModal(null); return; }
    try {
      await chatApi.updateConversation(itemId, { title: newTitle });
      const rename = (list) => list.map(c => c.id === itemId ? { ...c, title: newTitle } : c);
      setConversations(rename);
      setServerSearchResults(prev => (prev ? rename(prev) : prev));
      eventBus.emit('conversationRenamed', { id: itemId, title: newTitle });
      setActionModal(null);
    } catch (err) {
      console.error('Failed to rename item:', err);
      toast.error("Couldn't rename the chat", { detail: errorDetail(err) });
    }
  };

  // Pinning moves a chat in or out of Pinned, where its row is a new
  // element. Done from the keyboard, focus follows the chat to its options
  // button (or to the search box, if it went into a closed folder).
  const chatListRef = useRef(null);
  const refocusChatRef = useRef(null);
  useEffect(() => {
    const id = refocusChatRef.current;
    refocusChatRef.current = null;
    if (!id || (document.activeElement && document.activeElement !== document.body)) return;
    const target = chatListRef.current?.querySelector(`[data-chat-options="${CSS.escape(id)}"]`)
      || searchInputRef.current;
    target?.focus();
  }, [conversations, serverSearchResults]);

  const togglePin = async (chat) => {
    const pinned = !isPinned(chat);
    if (document.activeElement?.matches?.(':focus-visible')) refocusChatRef.current = String(chat.id);
    const apply = (value) => {
      setConversations(prev => withPinned(prev, chat.id, value));
      setServerSearchResults(prev => (prev ? withPinned(prev, chat.id, value) : prev));
      eventBus.emit('conversationPinned', { id: chat.id, pinned: value });
    };
    apply(pinned);
    try {
      await chatApi.updateConversation(chat.id, { is_pinned: pinned });
    } catch (err) {
      apply(!pinned);
      toast.error(pinned ? "Couldn't pin the chat" : "Couldn't unpin the chat", { detail: errorDetail(err) });
    }
  };

  const deleteChat = async (chat) => {
    const ok = await confirm({
      title: 'Delete chat?',
      message: `"${chat.title || 'Untitled conversation'}" will be moved to Trash, where you can restore it.`,
      confirmLabel: 'Move to Trash',
      destructive: true,
    });
    if (!ok) return;
    const others = (list) => list.filter(c => c.id !== chat.id);
    setConversations(others);
    setServerSearchResults(prev => (prev ? others(prev) : prev));
    try {
      await chatApi.deleteConversation(chat.id);
      eventBus.emit('conversationDeleted', { ids: [chat.id] });
    } catch (err) {
      console.error('Failed to delete item:', err);
      toast.error("Couldn't delete the chat", { detail: errorDetail(err) });
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

  // Engines that answered at least one chat, for the filter chips.
  const enginesPresent = [...new Set(conversations.map(conversationEngine))]
    .sort((a, b) => {
      const ia = ENGINE_ORDER.indexOf(a);
      const ib = ENGINE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  const activeEngineFilter = engineFilter !== 'all' && !enginesPresent.includes(engineFilter) ? 'all' : engineFilter;
  const matchesEngine = (chat) => activeEngineFilter === 'all' || conversationEngine(chat) === activeEngineFilter;

  const filteredConversations = (conversationPool !== null
    ? conversationPool
    : conversations.filter(c =>
        !q || (c.title || '').toLowerCase().includes(q) || (c.preview || '').toLowerCase().includes(q)
      ).map(c => ({ ...c, type: 'chat', title: c.title || 'Untitled conversation' }))
  ).filter(matchesEngine);

  const filteredActiveChatRuns = activeChatRuns
    .filter(run => !run.conversationId || !filteredConversations.some(c => c.id === run.conversationId))
    .filter(run => !q || (run.title || '').toLowerCase().includes(q) || (run.preview || '').toLowerCase().includes(q));

  // Search results keep the server's order (title matches, then the best
  // message matches). Otherwise pinned chats come first, the rest grouped.
  const searchMode = conversationPool !== null;
  const pinnedChats = searchMode ? [] : filteredConversations.filter(isPinned);
  const groupedConversations = searchMode ? [] : filteredConversations.filter(c => !isPinned(c));

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

  if (!searchMode) [...filteredActiveChatRuns, ...groupedConversations].forEach(addWorkedFolderItem);

  const workedFolderGroups = [...workedFolderGroupMap.values()]
    .map(group => ({
      ...group,
      items: group.items.sort((a, b) => getItemUpdatedMs(b) - getItemUpdatedMs(a)),
    }))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.label.localeCompare(b.label));

  const conversationsWithoutWorkedFolder = groupedConversations.filter(c => !getWorkingContextFilterKey(getWorkingContext(c)));
  const activeRunsWithoutWorkedFolder = searchMode ? [] : filteredActiveChatRuns.filter(run => !getWorkingContextFilterKey(getWorkingContext(run)));

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
    const ok = await confirm({
      title: `Delete ${items.length} ${items.length === 1 ? 'chat' : 'chats'}?`,
      message: 'They will be moved to Trash, where you can restore them.',
      confirmLabel: 'Move to Trash',
      destructive: true,
    });
    if (!ok) return;
    setBulkDeleting(true);
    setSelectedItems({});
    setConversations(prev => prev.filter(chat => !items.some(item => item.type === 'chat' && item.id === chat.id)));
    try {
      const results = await Promise.allSettled(items.map(item => (
        chatApi.deleteConversation(item.id)
      )));
      const deletedIds = items.filter((_, index) => results[index].status === 'fulfilled').map(item => item.id);
      if (deletedIds.length) eventBus.emit('conversationDeleted', { ids: deletedIds });
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

  const openChat = (chat, messageId = null) => {
    if (chat.type === 'active-run') {
      navigate(chat.conversationId ? chatLink(chat.conversationId) : '/home');
    } else {
      navigate(chatLink(chat.id, messageId));
    }
  };

  const renderChatItem = (chat) => {
    const isActiveRun = chat.type === 'active-run';
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const lastAssistant = [...messages].reverse().find(msg => msg.type === 'assistant');
    const running = isActiveRun || activeConversationIds.has(chat.id) || activeConversationIds.has(String(chat.id));
    const actionModeUsed = messages.some(msg => msg.agentMode === 'action' || msg.toolsEnabled === true);
    const planModeUsed = messages.some(msg => msg.agentMode === 'plan' || msg.agentSessionId);
    const toolsUsed = running || actionModeUsed || planModeUsed;
    const updatedAt = chat.last_message_at || chat.updated_at || chat.updatedAt || chat.created_at;
    const itemTitle = chat.title || 'Untitled conversation';
    const selectionItem = { id: chat.id, type: chat.type, title: itemTitle };
    const isSelected = Boolean(selectedItems[getSelectionKey(selectionItem)]);
    const hasSelection = selectedCount > 0;
    const canSelect = !isActiveRun;
    const pinned = !isActiveRun && isPinned(chat);
    const workingContext = getWorkingContext(chat);
    const workingContextLabel = formatWorkingContextLabel(workingContext);
    const bookmarkCount = Array.isArray(chat.metadata?.highlights?.bookmarkedMessages)
      ? chat.metadata.highlights.bookmarkedMessages.length
      : messages.filter(msg => msg.bookmarked).length;
    // A search hit inside a message: show where, and open the chat there
    // (even when its name matched too).
    const hit = Array.isArray(chat.hits) ? chat.hits[0] : null;
    const matchCount = hit ? chat.hit_count || 1 : 0;
    const preview = chat.preview || lastAssistant?.content;

    return (
      <div
        key={`${chat.type}-${chat.id}`}
        className={`group flex items-center gap-1 rounded-lg pl-1 pr-2 transition-colors ${
          isSelected ? 'bg-selected' : 'hover:bg-hover'
        }`}
      >
        {canSelect ? (
          <button
            type="button"
            onClick={e => toggleSelection(e, selectionItem)}
            aria-label={isSelected ? `Deselect ${itemTitle}` : `Select ${itemTitle}`}
            aria-pressed={isSelected}
            className={`h-7 w-7 shrink-0 items-center justify-center rounded-md outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 ${
              isSelected || hasSelection ? 'flex text-fg opacity-100' : 'hidden text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100 sm:flex'
            }`}
          >
            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        ) : <span className="hidden w-7 shrink-0 sm:block" />}
        <button
          type="button"
          onClick={(e) => {
            if (hasSelection && canSelect) toggleSelection(e, selectionItem);
            else openChat(chat, hitMessageId(chat));
          }}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md py-2.5 pl-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:pl-1"
        >
          {!isActiveRun && <ConversationBadge conversation={chat} agentsById={agentsById} className="mt-[3px]" />}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              {/* Found by its name: the words that matched are marked. */}
              {searchMode && chat.title_match
                ? <SearchSnippet snippet={markTitle(itemTitle, searchedQuery)} className="truncate text-sm font-medium text-fg" />
                : <span className="truncate text-sm font-medium text-fg">{itemTitle}</span>}
              {pinned && searchMode ? <Pin aria-label="Pinned" className="h-3 w-3 shrink-0 text-fg-subtle" /> : null}
            </span>
            {hit ? (
              <SearchSnippet snippet={hit.snippet} className="mt-0.5 line-clamp-2 text-xs leading-[17px] text-fg-muted" />
            ) : null}
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="shrink-0">{getRelativeTime(updatedAt)}</span>
              {matchCount > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{matchCount} matches</span>
                </>
              )}
              {toolsUsed && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={`inline-flex shrink-0 items-center gap-0.5 ${running ? 'text-fg' : ''}`}>
                    <Wrench className="h-3 w-3" />
                    {running ? 'Generating' : actionModeUsed ? 'Action' : 'Plan'}
                  </span>
                </>
              )}
              {workingContextLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex min-w-0 items-center gap-0.5 truncate" title={workingContext?.workingDir || ''}>
                    <FolderOpen className="h-3 w-3 shrink-0" />
                    <span className="truncate">Worked in {workingContextLabel}</span>
                  </span>
                </>
              )}
              {bookmarkCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5" title={`${bookmarkCount} saved ${bookmarkCount === 1 ? 'message' : 'messages'}`}>
                    <BookMarked className="h-3 w-3" />
                    {bookmarkCount}
                  </span>
                </>
              )}
              {!hit && preview && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{preview}</span>
                </>
              )}
            </span>
          </span>
        </button>
        {!isActiveRun && (
          <ChatRowMenu
            chatId={String(chat.id)}
            title={itemTitle}
            pinned={pinned}
            hidden={hasSelection}
            onTogglePin={() => togglePin(chat)}
            onRename={() => openRename(chat)}
            onDelete={() => deleteChat(chat)}
          />
        )}
      </div>
    );
  };

  const renderChatList = (chats) => {
    if (chats.length === 0) return null;
    return (
      <div className="space-y-px">
        {chats.map(chat => renderChatItem(chat))}
      </div>
    );
  };

  // The Pinned and Recents headings and the folders line up with the chats'
  // icons (past the select box, which phones don't show).
  const groupHeaderClass = 'mb-1 flex min-h-8 w-full max-w-full items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-[13px] font-medium text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 sm:pl-10';
  const sectionHeadingClass = 'mb-1 pl-2.5 text-xs font-medium text-fg-subtle sm:pl-10';

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <div className="max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col h-full relative z-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">
              Chats
            </h1>
            <p className="mt-1 text-[13px] text-fg-muted">
              Conversations and agent runs
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectableItems.length > 0 && (
              <Button variant="secondary" size="sm" icon={allVisibleSelected ? CheckSquare : Square} onClick={selectAllVisible}>
                {allVisibleSelected ? 'Deselect all' : 'Select'}
              </Button>
            )}
            <Button variant="primary" size="sm" icon={Plus} onClick={handleNewChat}>
              New
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5 flex-shrink-0">
          {serverSearching
            ? <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-subtle" />
            : <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          }
          <input
            ref={searchInputRef}
            type="text"
            aria-label="Search chats"
            placeholder="Search titles and messages"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`h-9 w-full rounded-lg border border-line-strong bg-canvas pl-10 ${searchMode ? 'pr-24' : 'pr-4'} text-sm text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20`}
          />
          {searchMode && !serverSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
              {filteredConversations.length} found
            </span>
          )}
        </div>
        {/* Chats waiting to be indexed (after an update or a large import)
            can't be found by what was said yet. */}
        {searchMode && serverIndexing && !serverSearching && (
          <p role="status" className="-mt-3 mb-4 flex-shrink-0 text-xs text-fg-muted">
            Still indexing older chats, so some may be missing.
          </p>
        )}

        {enginesPresent.length > 1 && (
          <div className="mb-4 -mt-2 flex flex-wrap items-center gap-1.5 flex-shrink-0" role="radiogroup" aria-label="Who answered">
            {['all', ...enginesPresent].map(engine => {
              const selected = activeEngineFilter === engine;
              return (
                <button
                  key={engine}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setEngineFilter(engine)}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-line-strong bg-selected text-fg'
                      : 'border-line text-fg-muted hover:bg-hover hover:text-fg'
                  }`}
                >
                  {engine === 'all' ? null : engine === 'asyncat'
                    ? <AsyncatMark variant="glyph" className="h-3.5 w-3.5" />
                    : <ProviderGlyph providerId={engine} className="h-3.5 w-3.5" />}
                  {engine === 'all' ? 'All' : engineDisplayName(engine)}
                </button>
              );
            })}
          </div>
        )}

        {selectedCount > 0 && (
          <div className="mb-4 flex flex-shrink-0 items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <div className="text-xs font-medium text-fg">
              {selectedCount} selected
            </div>
            <div className="flex items-center gap-1">
              <Button variant="danger" size="xs" icon={Trash2} loading={bulkDeleting} onClick={deleteSelected}>
                {bulkDeleting ? 'Deleting' : 'Delete'}
              </Button>
              <button
                type="button"
                onClick={clearSelection}
                aria-label="Clear selection"
                title="Clear selection"
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div ref={chatListRef} className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex animate-pulse flex-col px-3 py-2.5">
                  <div className="mb-2 h-4 w-1/3 rounded bg-hover" />
                  <div className="h-3 w-1/4 rounded bg-hover" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</div>
          ) : filteredConversations.length === 0 && filteredActiveChatRuns.length === 0 ? (
            <div className="py-16 text-center">
              {!trimmedQuery ? <Cat pose="sleep" className="mx-auto mb-4 w-28" outline={4} /> : null}
              <p role="status" className="text-[13px] text-fg-muted">
                {!trimmedQuery ? 'No chats yet' : serverSearching ? 'Searching…' : 'No chats match that'}
              </p>
            </div>
          ) : searchMode ? (
            <div className="text-left">
              {renderChatList([...filteredActiveChatRuns, ...filteredConversations])}
            </div>
          ) : (
            <div className="space-y-px text-left">
              {pinnedChats.length > 0 && (
                <section aria-label="Pinned chats" className="mb-4">
                  <h2 className={sectionHeadingClass}>Pinned</h2>
                  {renderChatList(pinnedChats)}
                </section>
              )}
              {pinnedChats.length > 0 && topLevelItems.length > 0 && (
                <h2 className={sectionHeadingClass}>Recents</h2>
              )}
              {topLevelItems.map(item => {
                if (item.kind === 'worked-folder') {
                  const group = item.data;
                  const isExpanded = expandedFolders[group.expandedKey] ?? true;
                  return (
                    <div key={group.key} className="mb-4">
                      <button
                        type="button"
                        onClick={() => toggleFolder(group.expandedKey)}
                        aria-expanded={isExpanded}
                        className={groupHeaderClass}
                        title={group.title}
                      >
                        {isExpanded
                          ? <FolderOpen className="h-4 w-4 shrink-0 text-fg-subtle" />
                          : <Folder className="h-4 w-4 shrink-0 text-fg-subtle" />
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
                        aria-expanded={Boolean(isExpanded)}
                        className={groupHeaderClass}
                      >
                        {isExpanded
                          ? <FolderOpen className="h-4 w-4 shrink-0 text-fg-subtle" />
                          : <Folder className="h-4 w-4 shrink-0 text-fg-subtle" />
                        }
                        <span className="truncate">{folder.name}</span>
                        <span className="text-xs font-normal text-fg-subtle">{chats.length}</span>
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

      <Dialog
        open={Boolean(actionModal)}
        title="Rename chat"
        size="sm"
        as="form"
        onSubmit={(e) => { e.preventDefault(); saveRename(); }}
        onClose={() => setActionModal(null)}
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => setActionModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save
            </Button>
          </>
        )}
      >
        <Input
          ref={renameInputRef}
          value={actionModalTitle}
          onChange={e => setActionModalTitle(e.target.value)}
          aria-label="Chat name"
          placeholder="Chat name"
        />
      </Dialog>
    </div>
  );
};

export default ChatsPage;
