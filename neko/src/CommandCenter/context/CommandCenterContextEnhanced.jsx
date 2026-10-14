// CommandCenterContextEnhanced.jsx
// Manages conversation metadata, message state, temporary chats, and agent mode.
// Streaming is handled directly in CommandCenterV2Enhanced via agentApi.runStream.

import { createContext, useState, useContext, useReducer, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import commandCenterApi from '../api';
import { CLIENT_ID, subscribeAppEvent } from '../../services/appEvents.js';
import { mergeStaleMessages } from '../utils/messageMerge.js';
import { buildEventsFromMessages } from '../utils/agentEventUtils.js';
import { newChatToolsEnabled } from '../../services/chatDefaults.js';
import { TEMPORARY_CHAT, withConversationId } from '../utils/temporaryChat.js';

const ActionTypes = {
  SET_MESSAGES: 'SET_MESSAGES',
  ADD_MESSAGE: 'ADD_MESSAGE',
  UPDATE_MESSAGE: 'UPDATE_MESSAGE',
  SET_PROCESSING: 'SET_PROCESSING',
  SET_CONVERSATION_LOADING: 'SET_CONVERSATION_LOADING',
  SET_CONVERSATION_HISTORY: 'SET_CONVERSATION_HISTORY',
  SET_SELECTED_PROJECTS: 'SET_SELECTED_PROJECTS',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  RESET_STATE: 'RESET_STATE',
  SET_CURRENT_CONVERSATION_ID: 'SET_CURRENT_CONVERSATION_ID',
  SET_CONVERSATION_TITLE: 'SET_CONVERSATION_TITLE',
  SET_JUST_LOADED: 'SET_JUST_LOADED',
  CLEAR_JUST_LOADED: 'CLEAR_JUST_LOADED',
  SET_CURRENT_WORKSPACE: 'SET_CURRENT_WORKSPACE',
  SET_TEMPORARY_CHAT: 'SET_TEMPORARY_CHAT',
  SET_CONVERSATION_SUMMARIES: 'SET_CONVERSATION_SUMMARIES',
  SET_WORKING_CONTEXT: 'SET_WORKING_CONTEXT',
  SET_CONVERSATION_METADATA: 'SET_CONVERSATION_METADATA',
  SET_PENDING_SEND: 'SET_PENDING_SEND',
};

const initialState = {
  messages: [],
  isProcessing: false,
  isConversationLoading: false,
  conversationHistory: [],
  selectedProjects: [],
  error: null,
  currentConversationId: null,
  conversationTitle: null,
  justLoadedConversation: false,
  currentWorkspace: null,
  isTemporaryChat: false,
  conversationSummaries: [],
  workingContext: null,
  conversationMetadata: {},
  // A first message to send as soon as a new chat opens (e.g. typed on a
  // project page).
  pendingSend: null,
};

function normalizeWorkingContext(context) {
  if (!context || typeof context !== 'object') return null;
  // Legacy global and absolute roots are intentionally not restored. Work now
  // resumes only through a folder that is still attached to a Project.
  if (context.rootId === 'none' || context.noWorkspace) return null;
  const rootId = context.rootId || context.root?.id || null;
  // A project used without a folder keeps its instructions and knowledge.
  if (!rootId && context.projectId) {
    return {
      rootId: null,
      projectId: String(context.projectId),
      projectName: context.projectName || null,
      projectEmoji: context.projectEmoji || null,
      relativePath: '.',
      workingDir: null,
    };
  }
  if (!rootId || !String(rootId).startsWith('project:')) return null;
  const relativePath = context.relativePath || context.path || '.';
  return {
    ...context,
    rootId,
    relativePath: relativePath || '.',
  };
}

function commandCenterReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_MESSAGES:
      return { ...state, messages: action.payload };
    case ActionTypes.ADD_MESSAGE: {
      const newMessage = {
        id: action.payload.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        ...action.payload
      };
      return { ...state, messages: [...state.messages, newMessage] };
    }
    case ActionTypes.UPDATE_MESSAGE:
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id
            ? { ...msg, ...action.payload.updates }
            : msg
        )
      };
    case ActionTypes.SET_PROCESSING:
      return { ...state, isProcessing: action.payload };
    case ActionTypes.SET_CONVERSATION_LOADING:
      return { ...state, isConversationLoading: action.payload };
    case ActionTypes.SET_CONVERSATION_HISTORY:
      return { ...state, conversationHistory: action.payload };
    case ActionTypes.SET_SELECTED_PROJECTS:
      return { ...state, selectedProjects: action.payload };
    case ActionTypes.SET_ERROR:
      return { ...state, error: action.payload, isProcessing: false };
    case ActionTypes.CLEAR_ERROR:
      return { ...state, error: null };
    case ActionTypes.RESET_STATE:
      return {
        ...initialState,
        currentWorkspace: state.currentWorkspace,
        isTemporaryChat: action.payload?.keepMode ? state.isTemporaryChat : false,
      };
    case ActionTypes.SET_PENDING_SEND:
      return { ...state, pendingSend: action.payload || null };
    case ActionTypes.SET_CURRENT_CONVERSATION_ID:
      return withConversationId(state, action.payload);
    case ActionTypes.SET_CONVERSATION_TITLE:
      return { ...state, conversationTitle: action.payload };
    case ActionTypes.SET_JUST_LOADED:
      return { ...state, justLoadedConversation: true };
    case ActionTypes.CLEAR_JUST_LOADED:
      return { ...state, justLoadedConversation: false };
    case ActionTypes.SET_CURRENT_WORKSPACE:
      return { ...state, currentWorkspace: action.payload };
    case ActionTypes.SET_TEMPORARY_CHAT: {
      // Starting or ending a temporary chat starts on the default model; one
      // picked in a temporary chat stays with it.
      const { model: _model, ...conversationMetadata } = state.conversationMetadata || {};
      if (action.payload === true) {
        return { ...state, conversationMetadata, isTemporaryChat: true, currentConversationId: null, conversationTitle: TEMPORARY_CHAT.title };
      }
      return { ...state, conversationMetadata, isTemporaryChat: false, messages: [], conversationHistory: [], currentConversationId: null, conversationTitle: null };
    }
    case ActionTypes.SET_CONVERSATION_SUMMARIES:
      return { ...state, conversationSummaries: action.payload };
    case ActionTypes.SET_WORKING_CONTEXT:
      return { ...state, workingContext: normalizeWorkingContext(action.payload) };
    case ActionTypes.SET_CONVERSATION_METADATA: {
      // A function is given the metadata as it is now, so a change made while
      // a run goes on (the chat's model, say) isn't lost to an older copy.
      const next = typeof action.payload === 'function' ? action.payload(state.conversationMetadata || {}) : action.payload;
      if (next === state.conversationMetadata) return state;
      return { ...state, conversationMetadata: next && typeof next === 'object' ? next : {} };
    }
    default:
      return state;
  }
}

const generateInstantTitle = (message) => {
  const trimmed = (message || '').trim();
  if (!trimmed) return `Chat ${Math.floor(Math.random() * 90000) + 10000}`;
  let title = trimmed.slice(0, 50);
  if (trimmed.length > 50) title = title.slice(0, 47) + '...';
  return title.charAt(0).toUpperCase() + title.slice(1);
};

const CommandCenterContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export function useCommandCenter() {
  const context = useContext(CommandCenterContext);
  if (!context) throw new Error('useCommandCenter must be used within a CommandCenterProvider');
  return context;
}

export function CommandCenterProvider({ children, onProjectsChange }) {
  const [state, dispatch] = useReducer(commandCenterReducer, initialState);
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();

  const [toolsEnabled, setToolsEnabled] = useState(() => {
    const preset = newChatToolsEnabled();
    if (preset !== null) return preset;
    try {
      const savedMode = localStorage.getItem('asyncat_agent_mode');
      if (savedMode === 'plan') return false;
      if (savedMode === 'action' || savedMode === 'design') return true;
      return localStorage.getItem('asyncat_tools_enabled') !== 'false';
    } catch { return true; }
  });
  const [conversationListRefresh, setConversationListRefresh] = useState(null);
  const [chatRuns, setChatRuns] = useState({});
  const savingConversationIdsRef = useRef(new Set());
  const loadConversationRequestRef = useRef(0);
  const agentAbortControllersRef = useRef(new Map());
  const runStartedAtRef = useRef(null);
  const chatRunsRef = useRef(chatRuns);
  const currentConversationIdRef = useRef(state.currentConversationId);
  // Per chat, the ids of every message this window has seen. Saves send them
  // so the server keeps messages added since (a scheduled run's result) and
  // drops only the ones this window removed (see utils/messageMerge.js).
  const knownMessageIdsRef = useRef(new Map());
  // Chats the server changed while this window was running an answer in them.
  const pendingRefreshRef = useRef(new Set());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    chatRunsRef.current = chatRuns;
  }, [chatRuns]);

  useEffect(() => {
    currentConversationIdRef.current = state.currentConversationId;
  }, [state.currentConversationId]);

  const updateChatRun = useCallback((runKey, updater) => {
    setChatRuns(prev => {
      const existing = prev[runKey] || {};
      const next = typeof updater === 'function' ? updater(existing) : { ...existing, ...updater };
      return { ...prev, [runKey]: next };
    });
  }, []);

  const activeConversationIds = useMemo(
    () => new Set(
      Object.entries(chatRuns)
        .filter(([key, run]) => key !== '__draft__' && run?.running)
        .map(([key]) => key)
    ),
    [chatRuns],
  );

  const hasActiveRuns = useMemo(
    () => Object.values(chatRuns).some(run => run?.running),
    [chatRuns],
  );

  const chatRunPreviews = useMemo(() => {
    const getRunTitle = (run, key) => {
      const goal = run?.goal || [...(run?.events || [])].reverse().find(ev => ev?.type === 'user_goal')?.data?.goal || '';
      const firstLine = String(goal).split('\n').find(Boolean)?.trim();
      if (firstLine) return firstLine;
      return key === '__draft__' ? 'New conversation' : 'Untitled conversation';
    };

    return Object.entries(chatRuns)
      .map(([key, run]) => {
        const events = Array.isArray(run?.events) ? run.events : [];
        const lastEvent = [...events].reverse().find(ev => ev?.arrivedAt || ev?.data?.timestamp);
        const updatedAtMs = lastEvent?.arrivedAt || Date.parse(lastEvent?.data?.timestamp || '') || 0;
        return {
          key,
          conversationId: key === '__draft__' ? null : key,
          title: getRunTitle(run, key),
          preview: run?.running ? 'Generating' : (run?.streamingText || run?.session?.summary || ''),
          running: Boolean(run?.running),
          sessionId: run?.sessionId || null,
          updatedAtMs,
        };
      })
      .filter(item => item.running || item.conversationId)
      .sort((a, b) => {
        if (a.running !== b.running) return a.running ? -1 : 1;
        return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
      });
  }, [chatRuns]);

  const handleSetToolsEnabled = useCallback((val) => {
    setToolsEnabled(val);
    try {
      const previousMode = localStorage.getItem('asyncat_agent_mode');
      localStorage.setItem('asyncat_agent_mode', previousMode === 'design' && val ? 'design' : val ? 'action' : 'plan');
      localStorage.setItem('asyncat_tools_enabled', String(val));
    } catch {}
  }, []);

  useEffect(() => {
    if (currentWorkspace) {
      dispatch({ type: ActionTypes.SET_CURRENT_WORKSPACE, payload: currentWorkspace });
      commandCenterApi.workspace.setCurrentWorkspace(currentWorkspace.id);
      if (state.currentWorkspace && state.currentWorkspace.id !== currentWorkspace.id) {
        dispatch({ type: ActionTypes.RESET_STATE });
      }
    }
  }, [currentWorkspace, state.currentWorkspace]);

  const triggerConversationRefresh = useCallback(() => {
    if (conversationListRefresh) conversationListRefresh();
  }, [conversationListRefresh]);

  const rememberMessageIds = useCallback((conversationId, messages = [], metadata = null) => {
    if (!conversationId) return;
    let known = knownMessageIdsRef.current.get(conversationId);
    if (!known) {
      known = new Set();
      knownMessageIdsRef.current.set(conversationId, known);
    }
    for (const message of Array.isArray(messages) ? messages : []) {
      if (message?.id) known.add(message.id);
    }
    for (const branch of Array.isArray(metadata?.branches) ? metadata.branches : []) {
      for (const message of Array.isArray(branch?.messages) ? branch.messages : []) {
        if (message?.id) known.add(message.id);
      }
    }
  }, []);

  const shouldSaveConversations = useCallback(() => !state.isTemporaryChat, [state.isTemporaryChat]);

  // Low-level dispatchers exposed to V2Enhanced for streaming updates
  const addMessage = useCallback((message) => {
    dispatch({ type: ActionTypes.ADD_MESSAGE, payload: message });
  }, []);

  const updateMessage = useCallback((id, updates) => {
    dispatch({ type: ActionTypes.UPDATE_MESSAGE, payload: { id, updates } });
  }, []);

  const setMessages = useCallback((messages) => {
    dispatch({ type: ActionTypes.SET_MESSAGES, payload: messages });
  }, []);

  const setConversationHistory = useCallback((history) => {
    dispatch({ type: ActionTypes.SET_CONVERSATION_HISTORY, payload: history });
  }, []);

  const setProcessing = useCallback((val) => {
    dispatch({ type: ActionTypes.SET_PROCESSING, payload: val });
  }, []);

  const setError = useCallback((msg) => {
    dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
  }, []);

  // Save conversation — accepts optional explicit messages to save
  const saveCurrentConversation = useCallback(async (options = {}) => {
    if (!shouldSaveConversations() || state.isTemporaryChat) return null;
    const messagesToSave = options.messages || state.messages;
    const targetConversationId = options.conversationId !== undefined ? options.conversationId : state.currentConversationId;
    const currentConversationIdNow = currentConversationIdRef.current;
    const savingCurrentConversation = targetConversationId === currentConversationIdNow;
    const savingKey = targetConversationId || '__new__';
    if (savingConversationIdsRef.current.has(savingKey) || messagesToSave.length === 0 || !currentWorkspace?.id) return null;
    if (targetConversationId && messagesToSave.length < 2) return null;
    if (!targetConversationId && messagesToSave.length < 1) return null;

    savingConversationIdsRef.current.add(savingKey);
    try {
      const savedWorkingContext = options.workingContext !== undefined
        ? normalizeWorkingContext(options.workingContext)
        : state.workingContext;
      const savedProjectIds = savedWorkingContext?.projectId
        ? [savedWorkingContext.projectId]
        : [];
      const savedMetadata = {
        ...(state.conversationMetadata || {}),
        workspaceId: currentWorkspace?.id,
        projectScope: savedWorkingContext ? 'project' : 'none',
        workingContext: savedWorkingContext,
        ...(options.metadata || {}),
      };
      const result = await commandCenterApi.chat.saveConversation({
        messages: messagesToSave,
        title: options.title || (savingCurrentConversation ? state.conversationTitle : undefined),
        mode: options.mode || 'chat',
        projectIds: savedProjectIds,
        conversationId: targetConversationId,
        metadata: savedMetadata,
        knownMessageIds: targetConversationId
          ? [...(knownMessageIdsRef.current.get(targetConversationId) || [])]
          : [],
        clientId: CLIENT_ID,
      });

      if (result.success) {
        const savedConversationId = result.conversationId || targetConversationId;
        rememberMessageIds(savedConversationId, messagesToSave, savedMetadata);
        // The server kept messages this window hadn't seen: show them.
        if (result.keptMessages > 0) {
          window.dispatchEvent(new CustomEvent('asyncat:conversation-stale', { detail: { conversationId: savedConversationId } }));
        }
        if (savingCurrentConversation && !currentConversationIdNow && result.conversationId) {
          dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: result.conversationId });
          if (result.title && result.title !== state.conversationTitle) {
            dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: result.title });
          }
          if (location.pathname === '/home') {
            navigate(`/conversations/${result.conversationId}`, { replace: true });
          }
          setTimeout(() => triggerConversationRefresh(), 50);
        }
        if (savingCurrentConversation && result.title && result.title !== state.conversationTitle) {
          dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: result.title });
        }
        if (!savingCurrentConversation) setTimeout(() => triggerConversationRefresh(), 50);
        return result;
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } finally {
      savingConversationIdsRef.current.delete(savingKey);
    }
  }, [state.messages, state.currentConversationId, state.conversationTitle, state.isTemporaryChat, state.workingContext, state.conversationMetadata, currentWorkspace?.id, triggerConversationRefresh, location.pathname, navigate, shouldSaveConversations, rememberMessageIds]);

  // Helper for V2Enhanced to set conversation id and title after a new save
  const setCurrentConversationId = useCallback((id) => {
    dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: id });
  }, []);

  const setConversationTitle = useCallback((title) => {
    dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: title });
  }, []);

  const setConversationMetadata = useCallback((metadata) => {
    dispatch({ type: ActionTypes.SET_CONVERSATION_METADATA, payload: metadata });
  }, []);

  // Generate instant title from first user message
  const generateAndSetTitle = useCallback((userMessage) => {
    const title = generateInstantTitle(userMessage);
    dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: title });
    return title;
  }, []);

  useEffect(() => {
    if (state.justLoadedConversation) {
      const timer = setTimeout(() => dispatch({ type: ActionTypes.CLEAR_JUST_LOADED }), 1000);
      return () => clearTimeout(timer);
    }
  }, [state.justLoadedConversation]);

  // Settings → Privacy & safety can make every new chat start in Plan or Action.
  const applyNewChatMode = useCallback(() => {
    const preset = newChatToolsEnabled();
    if (preset !== null) setToolsEnabled(preset);
  }, []);

  // Leaving a temporary chat discards it: a run still going in it stops, and
  // its steps don't show up in the next chat (its run has no chat id to be
  // kept under).
  const discardTemporaryRun = useCallback(() => {
    if (!stateRef.current.isTemporaryChat) return;
    agentAbortControllersRef.current.get('__draft__')?.abort();
    agentAbortControllersRef.current.delete('__draft__');
    setChatRuns(prev => {
      if (!prev.__draft__) return prev;
      const next = { ...prev };
      delete next.__draft__;
      return next;
    });
  }, []);

  const handleNewConversation = useCallback(async (options = {}) => {
    loadConversationRequestRef.current += 1;
    discardTemporaryRun();
    dispatch({ type: ActionTypes.RESET_STATE, payload: { keepMode: true } });
    applyNewChatMode();
    const nextWorkingContext = normalizeWorkingContext(options.workingContext || null);
    if (nextWorkingContext) {
      dispatch({ type: ActionTypes.SET_WORKING_CONTEXT, payload: nextWorkingContext });
      dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: nextWorkingContext.projectId ? [nextWorkingContext.projectId] : [] });
    }
    if (options.metadata || options.experienceMode) {
      dispatch({
        type: ActionTypes.SET_CONVERSATION_METADATA,
        payload: {
          ...(options.metadata || {}),
          experienceMode: options.experienceMode === 'work' ? 'work' : 'chat',
          projectScope: nextWorkingContext ? 'project' : 'none',
          workingContext: nextWorkingContext,
        },
      });
    }
    const initialMessage = String(options.initialMessage || '').trim();
    if (initialMessage) {
      dispatch({ type: ActionTypes.SET_PENDING_SEND, payload: { text: initialMessage, at: Date.now() } });
    }
  }, [applyNewChatMode, discardTemporaryRun]);

  const clearPendingSend = useCallback(() => {
    dispatch({ type: ActionTypes.SET_PENDING_SEND, payload: null });
  }, []);

  const loadConversation = useCallback(async (conversationId) => {
    const requestId = loadConversationRequestRef.current + 1;
    loadConversationRequestRef.current = requestId;
    // Opening a saved chat ends a temporary one (see withConversationId).
    if (stateRef.current.isTemporaryChat) {
      discardTemporaryRun();
      dispatch({ type: ActionTypes.SET_TEMPORARY_CHAT, payload: false });
    }
    try {
      dispatch({ type: ActionTypes.SET_CONVERSATION_LOADING, payload: true });
      dispatch({ type: ActionTypes.SET_JUST_LOADED });
      dispatch({ type: ActionTypes.SET_PROCESSING, payload: false });
      // Never display the context from the previously open chat while the next
      // conversation is loading. A conversation owns its own Project scope.
      dispatch({ type: ActionTypes.SET_WORKING_CONTEXT, payload: null });
      dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: [] });

      const [{ conversation }] = await Promise.all([
        commandCenterApi.chat.loadConversation(conversationId),
        new Promise(resolve => setTimeout(resolve, 150))
      ]);

      if (requestId !== loadConversationRequestRef.current) return;

      dispatch({ type: ActionTypes.SET_JUST_LOADED });

      const loadedMetadata = {
        ...(conversation.metadata || {}),
        // The persisted conversation mode is canonical. Legacy conversations
        // may contain metadata from the former per-turn Chat/Work switcher.
        experienceMode: conversation.mode === 'build' ? 'work' : 'chat',
      };

      rememberMessageIds(conversationId, conversation.messages || [], loadedMetadata);
      dispatch({ type: ActionTypes.SET_MESSAGES, payload: conversation.messages || [] });
      const loadedWorkingContext = normalizeWorkingContext(loadedMetadata.workingContext || null);
      dispatch({
        type: ActionTypes.SET_SELECTED_PROJECTS,
        payload: loadedWorkingContext?.projectId
          ? [loadedWorkingContext.projectId]
          : (conversation.project_ids || []),
      });
      dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: conversationId });
      dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: conversation.title });
      dispatch({ type: ActionTypes.SET_CONVERSATION_METADATA, payload: loadedMetadata });
      dispatch({ type: ActionTypes.SET_WORKING_CONTEXT, payload: loadedWorkingContext });

      if (loadedMetadata.conversationSummaries) {
        dispatch({ type: ActionTypes.SET_CONVERSATION_SUMMARIES, payload: loadedMetadata.conversationSummaries });
      }

      const apiHistory = [];
      for (const msg of conversation.messages) {
        if (msg.type === 'user' || msg.type === 'assistant') {
          apiHistory.push({
            role: msg.type,
            content: msg.content,
            timestamp: msg.timestamp,
            toolsEnabled: msg.toolsEnabled,
            agentSessionId: msg.agentSessionId,
          });
        }
      }
      const compactedHistory = Array.isArray(loadedMetadata.compactedConversationHistory)
        ? loadedMetadata.compactedConversationHistory
        : null;
      dispatch({ type: ActionTypes.SET_CONVERSATION_HISTORY, payload: compactedHistory || apiHistory.slice(-8) });
    } catch (error) {
      if (requestId !== loadConversationRequestRef.current) return;
      console.error('Load conversation error:', error);
      dispatch({ type: ActionTypes.RESET_STATE, payload: { keepMode: true } });
      dispatch({ type: ActionTypes.SET_ERROR, payload: 'Failed to load conversation' });
    } finally {
      if (requestId === loadConversationRequestRef.current) {
        dispatch({ type: ActionTypes.SET_CONVERSATION_LOADING, payload: false });
      }
    }
  }, [currentWorkspace?.id, rememberMessageIds, discardTemporaryRun]);

  // Show what the server added to the open chat (a scheduled run's result, a
  // Cat's report) without reloading the screen or losing anything unsaved.
  const refreshConversationFromServer = useCallback(async (conversationId) => {
    if (!conversationId || conversationId !== currentConversationIdRef.current) return;
    if (stateRef.current.isTemporaryChat) return;
    if (chatRunsRef.current?.[conversationId]?.running) {
      pendingRefreshRef.current.add(conversationId);
      return;
    }
    pendingRefreshRef.current.delete(conversationId);
    let conversation;
    try {
      ({ conversation } = await commandCenterApi.chat.loadConversation(conversationId));
    } catch {
      return; // deleted or unreachable: keep showing what we have
    }
    if (!conversation || conversationId !== currentConversationIdRef.current) return;
    if (chatRunsRef.current?.[conversationId]?.running) {
      pendingRefreshRef.current.add(conversationId);
      return;
    }

    const known = knownMessageIdsRef.current.get(conversationId) || new Set();
    const local = stateRef.current.messages || [];
    const { messages: merged, kept } = mergeStaleMessages({
      stored: conversation.messages || [],
      posted: local,
      knownIds: [...known],
    });
    rememberMessageIds(conversationId, conversation.messages || [], conversation.metadata || null);
    if (conversation.title && conversation.title !== stateRef.current.conversationTitle) {
      dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: conversation.title });
    }
    if (!kept) return;

    // Keys the server set meanwhile; this window's own values win.
    dispatch({
      type: ActionTypes.SET_CONVERSATION_METADATA,
      payload: { ...(conversation.metadata || {}), ...(stateRef.current.conversationMetadata || {}) },
    });
    dispatch({ type: ActionTypes.SET_MESSAGES, payload: merged });
    const history = merged
      .filter(msg => msg.type === 'user' || msg.type === 'assistant')
      .map(msg => ({
        role: msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        toolsEnabled: msg.toolsEnabled,
        agentSessionId: msg.agentSessionId,
      }));
    dispatch({ type: ActionTypes.SET_CONVERSATION_HISTORY, payload: history.slice(-8) });
    // The feed draws a chat that ran in this window from its run's events.
    setChatRuns(prev => {
      const run = prev[conversationId];
      if (!run || run.running || !Array.isArray(run.events) || run.events.length === 0) return prev;
      return {
        ...prev,
        [conversationId]: { ...run, events: buildEventsFromMessages(merged), conversationHistory: history },
      };
    });
  }, [rememberMessageIds]);

  useEffect(() => {
    let listTimer = null;
    const refreshList = () => {
      clearTimeout(listTimer);
      listTimer = setTimeout(() => triggerConversationRefresh(), 300);
    };
    const offUpdated = subscribeAppEvent('conversation.updated', (event) => {
      const data = event?.data || {};
      if (data.origin && data.origin === CLIENT_ID) return;
      refreshList();
      if (data.conversationId && data.conversationId === currentConversationIdRef.current) {
        refreshConversationFromServer(data.conversationId);
      }
    });
    const offReconnected = subscribeAppEvent('events.reconnected', () => {
      refreshList();
      refreshConversationFromServer(currentConversationIdRef.current);
    });
    const onStale = (event) => refreshConversationFromServer(event.detail?.conversationId);
    window.addEventListener('asyncat:conversation-stale', onStale);
    return () => {
      clearTimeout(listTimer);
      offUpdated();
      offReconnected();
      window.removeEventListener('asyncat:conversation-stale', onStale);
    };
  }, [refreshConversationFromServer, triggerConversationRefresh]);

  // A chat the server changed while an answer was running refreshes once the
  // answer is done.
  useEffect(() => {
    for (const conversationId of [...pendingRefreshRef.current]) {
      if (!chatRuns[conversationId]?.running) refreshConversationFromServer(conversationId);
    }
  }, [chatRuns, refreshConversationFromServer]);

  const handleClearConversation = useCallback(() => {
    loadConversationRequestRef.current += 1;
    discardTemporaryRun();
    dispatch({ type: ActionTypes.RESET_STATE, payload: { keepMode: true } });
    applyNewChatMode();
  }, [applyNewChatMode, discardTemporaryRun]);

  const setSelectedProjects = useCallback((projectIds) => {
    dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: projectIds || [] });
  }, []);

  const setWorkingContext = useCallback((context) => {
    const normalized = normalizeWorkingContext(context);
    dispatch({ type: ActionTypes.SET_WORKING_CONTEXT, payload: normalized });
    const projectIds = normalized?.projectId ? [normalized.projectId] : [];
    dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: projectIds });

    if (!state.currentConversationId || state.isTemporaryChat || !currentWorkspace?.id) return;
    const nextMetadata = {
      ...(state.conversationMetadata || {}),
      workspaceId: currentWorkspace.id,
      projectScope: normalized ? 'project' : 'none',
      workingContext: normalized,
    };
    dispatch({ type: ActionTypes.SET_CONVERSATION_METADATA, payload: nextMetadata });
    commandCenterApi.chat.updateConversation(state.currentConversationId, {
      metadata: nextMetadata,
      project_ids: projectIds,
    })
      .then(() => triggerConversationRefresh())
      .catch((error) => console.error('Failed to persist working context:', error));
  }, [currentWorkspace?.id, state.conversationMetadata, state.currentConversationId, state.isTemporaryChat, triggerConversationRefresh]);

  const toggleTemporaryChat = useCallback(() => {
    discardTemporaryRun();
    dispatch({ type: ActionTypes.SET_TEMPORARY_CHAT, payload: !state.isTemporaryChat });
  }, [state.isTemporaryChat, discardTemporaryRun]);

  const setTemporaryChat = useCallback((enabled) => {
    if (!enabled) discardTemporaryRun();
    dispatch({ type: ActionTypes.SET_TEMPORARY_CHAT, payload: enabled });
  }, [discardTemporaryRun]);

  const contextValue = {
    // State
    messages: state.messages,
    isProcessing: state.isProcessing,
    isConversationLoading: state.isConversationLoading,
    conversationHistory: state.conversationHistory,
    selectedProjects: state.selectedProjects,
    error: state.error,
    currentConversationId: state.currentConversationId,
    conversationTitle: state.conversationTitle,
    currentWorkspace: state.currentWorkspace,
    isTemporaryChat: state.isTemporaryChat,
    conversationSummaries: state.conversationSummaries,
    workingContext: state.workingContext,
    conversationMetadata: state.conversationMetadata,
    pendingSend: state.pendingSend,
    clearPendingSend,
    justLoadedConversation: state.justLoadedConversation,
    toolsEnabled,

    // Helpers
    shouldSaveConversations,

    // Message dispatchers (for streaming in V2Enhanced)
    addMessage,
    updateMessage,
    setMessages,
    setConversationHistory,
    setProcessing,
    setError,

    // Conversation management
    setCurrentConversationId,
    setConversationTitle,
    setConversationMetadata,
    generateAndSetTitle,
    handleClearConversation,
    handleNewConversation,
    setSelectedProjects,
    setWorkingContext,
    clearError: () => dispatch({ type: ActionTypes.CLEAR_ERROR }),
    loadConversation,
    refreshConversationFromServer,
    saveCurrentConversation,
    setConversationListRefresh,
    triggerConversationRefresh,
    toggleTemporaryChat,
    setTemporaryChat,
    setToolsEnabled: handleSetToolsEnabled,
    chatRuns,
    setChatRuns,
    chatRunsRef,
    updateChatRun,
    activeConversationIds,
    hasActiveRuns,
    chatRunPreviews,
    agentAbortControllersRef,
    runStartedAtRef,
    currentConversationIdRef,
    onProjectsChange,
  };

  return (
    <CommandCenterContext.Provider value={contextValue}>
      {children}
    </CommandCenterContext.Provider>
  );
}

export default CommandCenterContext;
