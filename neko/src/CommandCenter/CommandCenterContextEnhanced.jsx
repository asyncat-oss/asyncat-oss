// CommandCenterContextEnhanced.jsx
// Manages conversation metadata, message state, ghost mode, and tools toggle.
// Streaming is handled directly in CommandCenterV2Enhanced via agentApi.runStream.

import { createContext, useState, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import commandCenterApi from './commandCenterApi';

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
  SET_GHOST_MODE: 'SET_GHOST_MODE',
  SET_CONVERSATION_SUMMARIES: 'SET_CONVERSATION_SUMMARIES',
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
  isGhostMode: false,
  conversationSummaries: [],
};

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
        isGhostMode: action.payload?.keepMode ? state.isGhostMode : false,
      };
    case ActionTypes.SET_CURRENT_CONVERSATION_ID:
      return { ...state, currentConversationId: action.payload };
    case ActionTypes.SET_CONVERSATION_TITLE:
      return { ...state, conversationTitle: action.payload };
    case ActionTypes.SET_JUST_LOADED:
      return { ...state, justLoadedConversation: true };
    case ActionTypes.CLEAR_JUST_LOADED:
      return { ...state, justLoadedConversation: false };
    case ActionTypes.SET_CURRENT_WORKSPACE:
      return { ...state, currentWorkspace: action.payload };
    case ActionTypes.SET_GHOST_MODE:
      if (action.payload === true) {
        return { ...state, isGhostMode: true, currentConversationId: null, conversationTitle: '👻 Ghost Chat' };
      }
      return { ...state, isGhostMode: false, messages: [], conversationHistory: [], currentConversationId: null, conversationTitle: null };
    case ActionTypes.SET_CONVERSATION_SUMMARIES:
      return { ...state, conversationSummaries: action.payload };
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
    try { return localStorage.getItem('asyncat_tools_enabled') !== 'false'; } catch { return true; }
  });
  const [conversationListRefresh, setConversationListRefresh] = useState(null);
  const isSavingRef = useRef(false);

  const handleSetToolsEnabled = useCallback((val) => {
    setToolsEnabled(val);
    try { localStorage.setItem('asyncat_tools_enabled', String(val)); } catch {}
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

  const shouldSaveConversations = useCallback(() => !state.isGhostMode, [state.isGhostMode]);

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
    if (!shouldSaveConversations() || state.isGhostMode) return null;
    const messagesToSave = options.messages || state.messages;
    if (isSavingRef.current || messagesToSave.length === 0 || !currentWorkspace?.id) return null;
    if (state.currentConversationId && messagesToSave.length < 2) return null;
    if (!state.currentConversationId && messagesToSave.length < 1) return null;

    isSavingRef.current = true;
    try {
      const result = await commandCenterApi.chat.saveConversation({
        messages: messagesToSave,
        title: options.title || state.conversationTitle,
        mode: options.mode || 'chat',
        projectIds: state.selectedProjects,
        conversationId: options.conversationId !== undefined ? options.conversationId : state.currentConversationId,
        metadata: { workspaceId: currentWorkspace?.id },
      });

      if (result.success) {
        if (!state.currentConversationId && result.conversationId) {
          dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: result.conversationId });
          if (result.title && result.title !== state.conversationTitle) {
            dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: result.title });
          }
          if (location.pathname === '/home') {
            navigate(`/conversations/${result.conversationId}`, { replace: true });
          }
          setTimeout(() => triggerConversationRefresh(), 50);
        }
        if (result.title && result.title !== state.conversationTitle) {
          dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: result.title });
        }
        return result;
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [state.messages, state.selectedProjects, state.currentConversationId, state.conversationTitle, state.isGhostMode, currentWorkspace?.id, triggerConversationRefresh, location.pathname, navigate, shouldSaveConversations]);

  // Helper for V2Enhanced to set conversation id and title after a new save
  const setCurrentConversationId = useCallback((id) => {
    dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: id });
  }, []);

  const setConversationTitle = useCallback((title) => {
    dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: title });
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

  const handleNewConversation = useCallback(async () => {
    dispatch({ type: ActionTypes.RESET_STATE, payload: { keepMode: true } });
  }, []);

  const loadConversation = useCallback(async (conversationId) => {
    try {
      dispatch({ type: ActionTypes.SET_CONVERSATION_LOADING, payload: true });
      dispatch({ type: ActionTypes.SET_JUST_LOADED });
      dispatch({ type: ActionTypes.SET_PROCESSING, payload: false });

      const [{ conversation }] = await Promise.all([
        commandCenterApi.chat.loadConversation(conversationId),
        new Promise(resolve => setTimeout(resolve, 150))
      ]);

      dispatch({ type: ActionTypes.SET_JUST_LOADED });

      dispatch({ type: ActionTypes.SET_MESSAGES, payload: conversation.messages || [] });
      dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: conversation.project_ids || [] });
      dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: conversationId });
      dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: conversation.title });

      if (conversation.metadata?.conversationSummaries) {
        dispatch({ type: ActionTypes.SET_CONVERSATION_SUMMARIES, payload: conversation.metadata.conversationSummaries });
      }

      const apiHistory = [];
      for (const msg of conversation.messages) {
        if (msg.type === 'user' || msg.type === 'assistant') {
          apiHistory.push({ role: msg.type, content: msg.content });
        }
      }
      dispatch({ type: ActionTypes.SET_CONVERSATION_HISTORY, payload: apiHistory.slice(-8) });
    } catch (error) {
      console.error('Load conversation error:', error);
      dispatch({ type: ActionTypes.SET_ERROR, payload: 'Failed to load conversation' });
    } finally {
      dispatch({ type: ActionTypes.SET_CONVERSATION_LOADING, payload: false });
    }
  }, [currentWorkspace?.id]);

  const handleClearConversation = useCallback(() => {
    dispatch({ type: ActionTypes.RESET_STATE, payload: { keepMode: true } });
  }, []);

  const setSelectedProjects = useCallback((projectIds) => {
    dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: projectIds || [] });
  }, []);

  const toggleGhostMode = useCallback(() => {
    dispatch({ type: ActionTypes.SET_GHOST_MODE, payload: !state.isGhostMode });
  }, [state.isGhostMode]);

  const setGhostMode = useCallback((enabled) => {
    dispatch({ type: ActionTypes.SET_GHOST_MODE, payload: enabled });
  }, []);

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
    isGhostMode: state.isGhostMode,
    conversationSummaries: state.conversationSummaries,
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
    generateAndSetTitle,
    handleClearConversation,
    handleNewConversation,
    setSelectedProjects,
    clearError: () => dispatch({ type: ActionTypes.CLEAR_ERROR }),
    loadConversation,
    saveCurrentConversation,
    setConversationListRefresh,
    triggerConversationRefresh,
    toggleGhostMode,
    setGhostMode,
    setToolsEnabled: handleSetToolsEnabled,
    onProjectsChange,
  };

  return (
    <CommandCenterContext.Provider value={contextValue}>
      {children}
    </CommandCenterContext.Provider>
  );
}

export default CommandCenterContext;
