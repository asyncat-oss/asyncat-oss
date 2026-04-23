// CommandCenterContextEnhanced.jsx - Updated for New Mode System
import { createContext, useState, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import commandCenterApi, { chatApi } from './commandCenterApi';
import { bgTasks } from '../utils/backgroundTasks';
import { tokenTracker } from './components/LocalModelStats';

// Utility to extract artifacts from AI response
const extractArtifacts = (content) => {
  if (!content) return { cleanContent: content, artifacts: [], artifactExplanation: null };
  
  // More flexible regex that handles any attributes in any order
  const artifactRegex = /<artifact\s+([^>]+)>([\s\S]*?)<\/artifact>/g;
  const artifacts = [];
  let match;
  let cleanContent = content;
  let artifactExplanation = null;
  
  // Extract explanation text before first artifact
  const firstArtifactIndex = content.search(/<artifact/);
  if (firstArtifactIndex > 0) {
    const textBefore = content.substring(0, firstArtifactIndex).trim();
    if (textBefore) {
      artifactExplanation = textBefore;
    }
  }
  
  // Extract all artifacts
  while ((match = artifactRegex.exec(content)) !== null) {
    const attributes = match[1];
    const artifactContent = match[2].trim();
    
    // Parse attributes
    const typeMatch = attributes.match(/type="([^"]+)"/);
    const titleMatch = attributes.match(/title="([^"]+)"/);
    const languageMatch = attributes.match(/language="([^"]+)"/);
    const editableMatch = attributes.match(/editable="([^"]+)"/);
    
    artifacts.push({
      id: `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: typeMatch ? typeMatch[1] : 'document',
      title: titleMatch ? titleMatch[1] : 'Untitled',
      content: artifactContent,
      language: languageMatch ? languageMatch[1] : null,
      editable: editableMatch ? editableMatch[1] === 'true' : true
    });
  }
  
  // Remove artifact tags from content
  cleanContent = content.replace(artifactRegex, '').trim();
  
  return { cleanContent, artifacts, artifactExplanation };
};

// Simplified action types
const ActionTypes = {
  SET_MESSAGES: 'SET_MESSAGES',
  ADD_MESSAGE: 'ADD_MESSAGE',
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
  
  
  // Workspace actions
  SET_CURRENT_WORKSPACE: 'SET_CURRENT_WORKSPACE',
  
  // Response style actions
  SET_RESPONSE_STYLE: 'SET_RESPONSE_STYLE',
  
  
  // Conversation file actions
  ADD_CONVERSATION_FILES: 'ADD_CONVERSATION_FILES',
  CLEAR_CONVERSATION_FILES: 'CLEAR_CONVERSATION_FILES',
  
  // Ghost mode actions
  SET_GHOST_MODE: 'SET_GHOST_MODE',
  
  // Conversation summarization actions
  ADD_CONVERSATION_SUMMARY: 'ADD_CONVERSATION_SUMMARY',
  SET_CONVERSATION_SUMMARIES: 'SET_CONVERSATION_SUMMARIES',

  // Streaming actions
  UPDATE_STREAMING_MESSAGE: 'UPDATE_STREAMING_MESSAGE',
  SET_IS_STREAMING: 'SET_IS_STREAMING',
  ADD_TOOL_CALL: 'ADD_TOOL_CALL',
  UPDATE_TOOL_CALL: 'UPDATE_TOOL_CALL'
};

// Simplified initial state
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
  
  
  // Workspace state
  currentWorkspace: null,
  
  // Response style state
  responseStyle: 'normal',
  
  isGhostMode: false,
  
  // Conversation-wide file tracking
  conversationFiles: [],
  conversationFileContent: '',
  
  // Conversation summarization state
  conversationSummaries: [],
  
  // Streaming state
  isStreaming: false,
  streamingMessageId: null
};

// Simplified reducer
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
      
      return {
        ...state,
        messages: [...state.messages, newMessage]
      };
    }
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
        responseStyle: state.responseStyle,
        isGhostMode: action.payload?.keepMode ? state.isGhostMode : false,
        conversationFiles: [],
        conversationFileContent: '',
        conversationSummaries: []
      };
    case ActionTypes.SET_CURRENT_CONVERSATION_ID:
      return { ...state, currentConversationId: action.payload };
    case ActionTypes.SET_CONVERSATION_TITLE:
      return { ...state, conversationTitle: action.payload };
    case ActionTypes.SET_JUST_LOADED:
      return { ...state, justLoadedConversation: true };
    case ActionTypes.CLEAR_JUST_LOADED:
      return { ...state, justLoadedConversation: false };
      
    
    // Workspace cases
    case ActionTypes.SET_CURRENT_WORKSPACE:
      return { ...state, currentWorkspace: action.payload };
    
    case ActionTypes.SET_RESPONSE_STYLE:
      return { ...state, responseStyle: action.payload };

    case ActionTypes.SET_GHOST_MODE:
      if (action.payload === true) {
        return { 
          ...state, 
          isGhostMode: true,
          currentConversationId: null,
          conversationTitle: '👻 Ghost Chat',
        };
      }
      return { 
        ...state, 
        isGhostMode: false,
        messages: [],
        conversationHistory: [],
        currentConversationId: null,
        conversationTitle: null,
        conversationTokens: 0
      };
      
    // Conversation summarization cases
    case ActionTypes.ADD_CONVERSATION_SUMMARY:
      return { 
        ...state, 
        conversationSummaries: [...state.conversationSummaries, action.payload]
      };
      
    case ActionTypes.SET_CONVERSATION_SUMMARIES:
      return { ...state, conversationSummaries: action.payload };

    // Conversation file cases
    case ActionTypes.ADD_CONVERSATION_FILES: {
      const newFiles = action.payload;
      const existingFiles = state.conversationFiles || [];
      const combinedFiles = [...existingFiles, ...newFiles];
      
      const combinedContent = combinedFiles.map(file => 
        `\n\n**File: ${file.name}**\n\`\`\`${file.name.split('.').pop() || 'text'}\n${file.content}\n\`\`\``
      ).join('');
      
      return { 
        ...state, 
        conversationFiles: combinedFiles,
        conversationFileContent: combinedContent
      };
    }
      
    case ActionTypes.CLEAR_CONVERSATION_FILES:
      return { 
        ...state, 
        conversationFiles: [],
        conversationFileContent: ''
      };
      
    // Streaming cases
    case ActionTypes.SET_IS_STREAMING:
      return { 
        ...state, 
        isStreaming: action.payload.isStreaming,
        streamingMessageId: action.payload.messageId || null
      };
    
    case ActionTypes.UPDATE_STREAMING_MESSAGE:
      return {
        ...state,
        messages: state.messages.map(msg => {
          if (msg.id === action.payload.messageId) {
            return {
              ...msg,
              isStreaming: action.payload.isStreaming !== false,
              ...(action.payload.content !== undefined && { content: action.payload.content }),
              ...(action.payload.artifacts !== undefined && { artifacts: action.payload.artifacts }),
              ...(action.payload.artifactExplanation !== undefined && { artifactExplanation: action.payload.artifactExplanation }),
              ...(action.payload.suggestions !== undefined && { suggestions: action.payload.suggestions }),
              ...(action.payload.searchEvent !== undefined && { searchEvent: action.payload.searchEvent }),
              ...(action.payload.isError !== undefined && { isError: action.payload.isError }),
              ...(action.payload.errorType !== undefined && { errorType: action.payload.errorType })
            };
          }
          return msg;
        })
      };

    case ActionTypes.ADD_TOOL_CALL:
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId
            ? {
                ...msg,
                toolCalls: [...(msg.toolCalls || []), {
                  id: action.payload.callId,
                  name: action.payload.tool,
                  args: action.payload.args,
                  result: null,
                  status: 'pending'
                }]
              }
            : msg
        )
      };

    case ActionTypes.UPDATE_TOOL_CALL:
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId
            ? {
                ...msg,
                toolCalls: (msg.toolCalls || []).map(tc =>
                  tc.id === action.payload.callId
                    ? { ...tc, result: action.payload.result, status: action.payload.result?.success ? 'done' : 'error' }
                    : tc
                )
              }
            : msg
        )
      };

    default:
      return state;
  }
}

// Helper function to generate instant title from user's message
const generateInstantTitle = (message) => {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    const suffix = Math.floor(Math.random() * 90000) + 10000; // 5-digit random number
    return `Chat ${suffix}`;
  }

  let title = trimmed.slice(0, 50);
  if (trimmed.length > 50) {
    title = title.slice(0, 47) + '...';
  }

  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title;
};

const CommandCenterContext = createContext();

export function useCommandCenter() {
  const context = useContext(CommandCenterContext);
  if (!context) {
    throw new Error('useCommandCenter must be used within a CommandCenterProvider');
  }
  return context;
}

export function CommandCenterProvider({ children, onProjectsChange }) {
  const [state, dispatch] = useReducer(commandCenterReducer, initialState);
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [conversationListRefresh, setConversationListRefresh] = useState(null);
  const isSavingRef = useRef(false);

  // Update workspace context when it changes
  useEffect(() => {
    if (currentWorkspace) {
      dispatch({ type: ActionTypes.SET_CURRENT_WORKSPACE, payload: currentWorkspace });
      commandCenterApi.workspace.setCurrentWorkspace(currentWorkspace.id);
      
      if (state.currentWorkspace && state.currentWorkspace.id !== currentWorkspace.id) {
        dispatch({ type: ActionTypes.RESET_STATE });
      }
    }
  }, [currentWorkspace, state.currentWorkspace]);

  // Trigger conversation refresh
  const triggerConversationRefresh = useCallback(() => {
    if (conversationListRefresh) {
      conversationListRefresh();
    }
  }, [conversationListRefresh]);

  const shouldSaveConversations = useCallback(() => {
    return !state.isGhostMode;
  }, [state.isGhostMode]);

  // Streaming message handler with smooth buffered updates
  const handleStreamingMessage = useCallback(async (content, selectedProjectIds = []) => {
    let messageContent = typeof content === 'object' && content.content ? content.content : content;
    const webSearch   = typeof content === 'object' ? (content.webSearch   ?? false) : false;
    const thinking    = typeof content === 'object' ? (content.thinking    ?? false) : false;
    const modelConfig = typeof content === 'object' ? (content.modelConfig ?? null)  : null;

    if (!messageContent || !messageContent.trim()) return;
    if (state.isProcessing || state.isStreaming) return;

    if (!currentWorkspace?.id) {
      dispatch({ type: ActionTypes.SET_ERROR, payload: 'No workspace selected. Please select a workspace first.' });
      return;
    }

    // === Capture everything needed for background-safe save (before any await) ===
    const capturedWorkspaceId = currentWorkspace.id;
    const capturedConversationId = state.currentConversationId;
    const capturedResponseStyle = state.responseStyle;
    const capturedShouldSave = shouldSaveConversations() && !state.isGhostMode;
    const capturedPreviousMessages = [...state.messages];
    const effectiveProjectIds = selectedProjectIds.length > 0 ? selectedProjectIds : state.selectedProjects;

    // Determine title (generate one now if this is a new conversation)
    let capturedTitle = state.conversationTitle;
    if (capturedShouldSave && !capturedConversationId && state.messages.length === 0) {
      capturedTitle = generateInstantTitle(messageContent);
    }

    // Register background task so sidebar can show a processing indicator
    const bgTaskId = capturedConversationId || `new_${Date.now()}`;
    bgTasks.register(bgTaskId, capturedTitle);

    dispatch({ type: ActionTypes.CLEAR_ERROR });
    dispatch({ type: ActionTypes.SET_PROCESSING, payload: true });

    // Instant title generation (dispatch to UI)
    if (capturedShouldSave && !capturedConversationId && state.messages.length === 0) {
      dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: capturedTitle });
    }

    // Add user message
    const userMessage = {
      content: messageContent.trim(),
      type: "user",
      projectIds: effectiveProjectIds,
      workspaceId: capturedWorkspaceId,
      responseStyle: capturedResponseStyle,
      timestamp: new Date().toISOString()
    };

    dispatch({ type: ActionTypes.ADD_MESSAGE, payload: userMessage });

    // Add empty assistant message for streaming
    const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    dispatch({ type: ActionTypes.ADD_MESSAGE, payload: {
      id: assistantMessageId,
      content: '',
      type: "assistant",
      isStreaming: true,
      timestamp: new Date().toISOString()
    }});

    dispatch({ type: ActionTypes.SET_IS_STREAMING, payload: { isStreaming: true, messageId: assistantMessageId } });

    try {
      let streamedContent = '';
      let hasDetectedArtifact = false;

      // Signal token tracker that a new stream is starting
      tokenTracker.startStream();
      
      // Stream the response — dispatch each chunk immediately for word-by-word display
      for await (const chunk of chatApi.sendMessageStream(
        messageContent,
        state.conversationHistory,
        effectiveProjectIds,
        state.responseStyle,
        webSearch,
        thinking,
        modelConfig
      )) {
        // Handle tool call events and search events (objects, not strings)
        if (chunk && typeof chunk === 'object') {
          if (chunk.type === 'tool_start') {
            dispatch({
              type: ActionTypes.ADD_TOOL_CALL,
              payload: { messageId: assistantMessageId, callId: chunk.callId, tool: chunk.tool, args: chunk.args }
            });
          } else if (chunk.type === 'tool_done') {
            dispatch({
              type: ActionTypes.UPDATE_TOOL_CALL,
              payload: { messageId: assistantMessageId, callId: chunk.callId, result: chunk.result }
            });
          } else if (chunk.type === 'suggestions') {
            dispatch({
              type: ActionTypes.UPDATE_STREAMING_MESSAGE,
              payload: { messageId: assistantMessageId, suggestions: chunk.suggestions }
            });
          } else if (chunk.type === 'search_start' || chunk.type === 'search_done' || chunk.type === 'search_error') {
            dispatch({
              type: ActionTypes.UPDATE_STREAMING_MESSAGE,
              payload: { messageId: assistantMessageId, searchEvent: chunk }
            });
          }
          continue;
        }

        // Record token for speed tracking (rough: 1 chunk ≈ 1 token)
        tokenTracker.recordToken(1);

        streamedContent += chunk;

        // Check if we've detected an artifact tag
        const firstArtifactStart = streamedContent.indexOf('<artifact');

        if (firstArtifactStart !== -1 && !hasDetectedArtifact) {
          hasDetectedArtifact = true;
        }

        if (hasDetectedArtifact) {
          // Extract text before artifact as explanation
          const textBefore = streamedContent.substring(0, firstArtifactStart).trim();

          // Check if artifact is complete
          const extracted = extractArtifacts(streamedContent);

          if (extracted.artifacts.length === 0) {
            dispatch({
              type: ActionTypes.UPDATE_STREAMING_MESSAGE,
              payload: {
                messageId: assistantMessageId,
                content: textBefore,
                artifacts: [{
                  id: 'artifact_creating',
                  type: 'code',
                  title: 'Creating artifact...',
                  content: 'Building something Awesome...',
                  isCreating: true
                }],
                artifactExplanation: textBefore
              }
            });
          } else {
            dispatch({
              type: ActionTypes.UPDATE_STREAMING_MESSAGE,
              payload: {
                messageId: assistantMessageId,
                content: extracted.cleanContent,
                artifacts: extracted.artifacts,
                artifactExplanation: extracted.artifactExplanation
              }
            });
          }
        } else {
          dispatch({
            type: ActionTypes.UPDATE_STREAMING_MESSAGE,
            payload: {
              messageId: assistantMessageId,
              content: streamedContent,
              artifacts: [],
              artifactExplanation: null
            }
          });
        }
      }

      // Final extraction with complete content
      const { cleanContent, artifacts, artifactExplanation: finalExplanation } = extractArtifacts(streamedContent);

      // Final update with complete content and artifacts — clears per-message isStreaming flag
      dispatch({
        type: ActionTypes.UPDATE_STREAMING_MESSAGE,
        payload: {
          messageId: assistantMessageId,
          content: cleanContent,
          artifacts: artifacts,
          artifactExplanation: finalExplanation,
          isStreaming: false
        }
      });

      // Update conversation history
      const updatedHistory = [
        ...state.conversationHistory,
        { role: 'user', content: messageContent },
        { role: 'assistant', content: streamedContent }
      ];
      dispatch({ type: ActionTypes.SET_CONVERSATION_HISTORY, payload: updatedHistory });

      if (effectiveProjectIds.length > 0 && onProjectsChange) {
        onProjectsChange(effectiveProjectIds);
      }

      // AI title generation — fire-and-forget for first exchange of new conversations
      if (capturedShouldSave && !capturedConversationId && capturedPreviousMessages.length === 0) {
        chatApi.generateTitle(messageContent, cleanContent).then(result => {
          if (result?.success && result.title) {
            capturedTitle = result.title;
            dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: result.title });
          }
        }).catch(() => {}); // non-fatal
      }

      // Background-safe save: saves to DB regardless of whether user navigated away.
      // This is the authoritative save for this response — the auto-save effect is a safety net.
      if (capturedShouldSave) {
        try {

          const finalUserMsg = {
            content: messageContent.trim(),
            type: 'user',
            projectIds: effectiveProjectIds,
            workspaceId: capturedWorkspaceId,
            timestamp: new Date().toISOString()
          };
          const finalAssistantMsg = {
            id: assistantMessageId,
            type: 'assistant',
            content: cleanContent,
            artifacts: artifacts || [],
            artifactExplanation: finalExplanation,
            timestamp: new Date().toISOString()
          };
          const saveResult = await commandCenterApi.chat.saveConversation({
            messages: [...capturedPreviousMessages, finalUserMsg, finalAssistantMsg],
            title: capturedTitle,
            mode: 'chat',
            projectIds: effectiveProjectIds,
            conversationId: capturedConversationId || null,
            metadata: {
              workspaceId: capturedWorkspaceId,
              responseStyle: capturedResponseStyle,
            }
          });

          console.log(`[BgSave] Done — success=${saveResult?.success} returnedId=${saveResult?.conversationId}`);

          // If this was a brand-new conversation and we're still on it, update the ID
          if (!capturedConversationId && saveResult?.conversationId) {
            dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: saveResult.conversationId });
            if (saveResult.title) {
              dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: saveResult.title });
            }
            setTimeout(() => triggerConversationRefresh(), 50);
          }

          bgTasks.complete(bgTaskId);
        } catch (saveErr) {
          console.error('[BgSave] FAILED:', saveErr?.message, saveErr);
          bgTasks.fail(bgTaskId);
        }
      } else {
        console.log('[BgSave] Skipped (ghost mode or non-chat mode)');
        bgTasks.complete(bgTaskId);
      }

    } catch (error) {
      console.error('Streaming Error:', error);

      bgTasks.fail(bgTaskId);

      let errorMessage = "Streaming failed. Please try again.";
      let userFriendlyMessage = "";

      // Check for content filter error
      if (error.type === 'local_model_offline' || error.message?.includes('local model server is not running') || error.message?.includes('ECONNREFUSED')) {
        errorMessage = "Local Model Offline";
        userFriendlyMessage = "😿 The local model server isn't running.\n\nGo to **Settings → Local Models** and click **Start** to load your model first.";
      } else if (error.type === 'context_overflow' || error.message?.includes('context') && error.message?.includes('token')) {
        errorMessage = "Message Too Long";
        userFriendlyMessage = "😿 Your message (plus search results) is too long for the model's context window.\n\nTry a shorter message or start a new conversation.";
      } else if (error.type === 'content_filter' || error.code === 'content_filter' ||
          error.message?.includes('content management policy') ||
          error.message?.includes('filtered due to the prompt') ||
          error.message?.includes('Content filtered')) {
        errorMessage = "Content Filter";
        userFriendlyMessage = "😿 I can't respond to this request as it's outside my content guidelines.\n\n" +
                            "Please try rephrasing your question or asking something else.";
      } else if (commandCenterApi.utils.isNetworkError(error)) {
        errorMessage = "Connection Error";
        userFriendlyMessage = "Connection error during streaming. Please check your internet connection.";
      } else {
        userFriendlyMessage = error.message || "Streaming failed. Please try again.";
      }

      const isOffline = error.type === 'local_model_offline' || error.message?.includes('local model server is not running') || error.message?.includes('ECONNREFUSED');
      dispatch({
        type: ActionTypes.UPDATE_STREAMING_MESSAGE,
        payload: {
          messageId: assistantMessageId,
          content: userFriendlyMessage,
          artifacts: [],
          artifactExplanation: null,
          isStreaming: false,
          isError: true,
          errorType: isOffline ? 'local_model_offline' : undefined
        }
      });

      dispatch({ type: ActionTypes.SET_ERROR, payload: errorMessage });
    } finally {
      // Signal token tracker that the stream has ended
      tokenTracker.endStream();
      dispatch({ type: ActionTypes.SET_IS_STREAMING, payload: { isStreaming: false, messageId: null } });
      dispatch({ type: ActionTypes.SET_PROCESSING, payload: false });
    }
  }, [state.conversationHistory, state.selectedProjects, state.currentConversationId, state.responseStyle, state.isProcessing, state.isStreaming, state.messages.length, state.isGhostMode, state.conversationTitle, onProjectsChange, currentWorkspace?.id, shouldSaveConversations, triggerConversationRefresh]);

  // Save conversation (only for saveable modes)
  const saveCurrentConversation = useCallback(async (title = null) => {
    if (!shouldSaveConversations() || state.isGhostMode) {
      return null;
    }
    
    if (isSavingRef.current || state.messages.length === 0 || !currentWorkspace?.id) {
      return null;
    }

    if (state.currentConversationId && state.messages.length < 2) {
      return null;
    }

    if (!state.currentConversationId && state.messages.length < 1) {
      return null;
    }

    isSavingRef.current = true;

    try {
      const result = await commandCenterApi.chat.saveConversation({
        messages: state.messages,
        title: title || state.conversationTitle,
        mode: 'chat',
        projectIds: state.selectedProjects,
        conversationId: state.currentConversationId,
        metadata: {
          workspaceId: currentWorkspace?.id,
          responseStyle: state.responseStyle,
          conversationSummaries: state.conversationSummaries || []
        },
        fileAttachments: state.conversationFiles || []
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
  }, [state.messages, state.selectedProjects, state.currentConversationId, state.conversationTitle, state.responseStyle, currentWorkspace?.id, triggerConversationRefresh, location.pathname, navigate, shouldSaveConversations]);

  // Auto-save (only for saveable modes)
  useEffect(() => {
    if (state.justLoadedConversation || !currentWorkspace?.id || state.isGhostMode || !shouldSaveConversations()) {
      return;
    }

    const shouldAutoSave = state.messages.length >= 2;
    
    if (shouldAutoSave && 
        !state.isProcessing &&
        !isSavingRef.current) {
      
      const lastMessage = state.messages[state.messages.length - 1];
      
      if (lastMessage && 
          lastMessage.type === 'assistant' && 
          !lastMessage.isError &&
          lastMessage.timestamp) {
                
        const saveImmediately = async () => {
          try {
            const result = await saveCurrentConversation();
            if (result && result.success) {
              setTimeout(() => triggerConversationRefresh(), 100);
            }
          } catch (error) {
            console.warn('Auto-save failed:', error);
          }
        };
        
        saveImmediately();
      }
    }
  }, [state.messages, state.currentConversationId, state.isProcessing, state.justLoadedConversation, currentWorkspace?.id, saveCurrentConversation, triggerConversationRefresh, shouldSaveConversations]);

  // Clear the "just loaded" flag after a short delay
  useEffect(() => {
    if (state.justLoadedConversation) {
      const timer = setTimeout(() => {
        dispatch({ type: ActionTypes.CLEAR_JUST_LOADED });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.justLoadedConversation]);

  // Handle new conversation
  const handleNewConversation = useCallback(async () => {
    if (shouldSaveConversations() && state.messages.length >= 2 && state.currentConversationId) {
      try {
        await saveCurrentConversation();
      } catch (error) {
        console.warn('Failed to save current conversation:', error);
      }
    }
    
    dispatch({ type: ActionTypes.RESET_STATE, payload: { keepMode: true } });
  }, [state.messages.length, state.currentConversationId, saveCurrentConversation, shouldSaveConversations]);

  const loadConversation = useCallback(async (conversationId) => {
    try {
      // Set loading immediately for instant feedback
      dispatch({ type: ActionTypes.SET_CONVERSATION_LOADING, payload: true });

      // Suppress auto-save during the transition and reset streaming UI state so the
      // new chat's input is unblocked immediately. Background stream continues via bgTasks.
      dispatch({ type: ActionTypes.SET_JUST_LOADED });
      dispatch({ type: ActionTypes.SET_PROCESSING, payload: false });
      dispatch({ type: ActionTypes.SET_IS_STREAMING, payload: { isStreaming: false, messageId: null } });

      // Add small artificial delay for smoother perception (optional)
      const [{ conversation }] = await Promise.all([
        commandCenterApi.chat.loadConversation(conversationId),
        new Promise(resolve => setTimeout(resolve, 150)) // Minimum 150ms for smooth transitions
      ]);

      dispatch({ type: ActionTypes.SET_JUST_LOADED });

      // For messages loaded from DB where artifacts weren't extracted at save time
      // (e.g. lab/pack sessions), parse <artifact> tags out of the content field now.
      // The backend convertFromJsonbFormat already mapped cat→content, so we check content.
      const processedMessages = (conversation.messages || []).map(msg => {
        if (
          msg.type === 'assistant' &&
          msg.content &&
          !msg.artifacts &&
          msg.content.includes('<artifact')
        ) {
          const { cleanContent, artifacts, artifactExplanation } = extractArtifacts(msg.content);
          return {
            ...msg,
            content: cleanContent,
            artifacts: artifacts.length > 0 ? artifacts : null,
            artifactExplanation: artifactExplanation || null,
          };
        }
        return msg;
      });

      dispatch({ type: ActionTypes.SET_MESSAGES, payload: processedMessages });
      dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: conversation.project_ids || [] });
      dispatch({ type: ActionTypes.SET_CURRENT_CONVERSATION_ID, payload: conversationId });
      dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: conversation.title });
      
      // Restore conversation summaries if they exist
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
      
      if (conversation.metadata) {
        if (conversation.metadata.responseStyle) {
          dispatch({ type: ActionTypes.SET_RESPONSE_STYLE, payload: conversation.metadata.responseStyle });
        }
        
        dispatch({ type: ActionTypes.CLEAR_CONVERSATION_FILES });
        if (conversation.metadata.fileAttachments && Array.isArray(conversation.metadata.fileAttachments)) {
          dispatch({ type: ActionTypes.ADD_CONVERSATION_FILES, payload: conversation.metadata.fileAttachments });
        }
      } else {
        dispatch({ type: ActionTypes.CLEAR_CONVERSATION_FILES });
      }
      
      
    } catch (error) {
      console.error('Load conversation error:', error);
      dispatch({ type: ActionTypes.SET_ERROR, payload: 'Failed to load conversation' });
    } finally {
      dispatch({ type: ActionTypes.SET_CONVERSATION_LOADING, payload: false });
    }
  }, [currentWorkspace?.id]);

  const handleRegenerate = useCallback(async (messageIndex) => {
    if (messageIndex < 0 || messageIndex >= state.messages.length) return;
    
    const targetMessage = state.messages[messageIndex];
    if (targetMessage.type !== 'assistant') return;
    
    let userMessageIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (state.messages[i].type === 'user') {
        userMessageIndex = i;
        break;
      }
    }
    
    if (userMessageIndex === -1) return;
    
    const userMessage = state.messages[userMessageIndex];
    
    const filteredMessages = state.messages.filter((_, index) => index !== messageIndex);
    dispatch({ type: ActionTypes.SET_MESSAGES, payload: filteredMessages });
    
    const updatedHistory = state.conversationHistory.slice(0, -1);
    dispatch({ type: ActionTypes.SET_CONVERSATION_HISTORY, payload: updatedHistory });
    
    dispatch({ type: ActionTypes.SET_PROCESSING, payload: true });
    
    try {
      let data;
      
      {
        const conversationFileContent = state.conversationFileContent || '';

        data = await chatApi.sendMessage(
          userMessage.content.trim(),
          updatedHistory,
          userMessage.projectIds || [],
          'chat',
          state.responseStyle,
          state.conversationFiles,
          conversationFileContent
        );

        if (data.success) {
          const responseContent = data.content || data.message || data.response || data.text || data.result;

          if (data.conversationHistory) {
            dispatch({ type: ActionTypes.SET_CONVERSATION_HISTORY, payload: data.conversationHistory });
          }

          dispatch({ type: ActionTypes.ADD_MESSAGE, payload: {
            type: "assistant",
            content: responseContent,
            suggestions: data.suggestions || []
          }});
        } else {
          throw new Error(data.error || 'Chat request failed');
        }
      }
      
    } catch (error) {
      console.error('Regenerate Error:', error);

      let errorMessage = "I'm having trouble connecting right now. Please check your connection and try again!";

      if (commandCenterApi.utils.isWorkspaceError(error)) {
        errorMessage = "I'm having trouble accessing your workspace. Please check your workspace permissions and try again.";
      } else if (commandCenterApi.utils.isAuthError(error)) {
        errorMessage = "Your session has expired. Please sign in again.";
      } else if (commandCenterApi.utils.isNetworkError(error)) {
        errorMessage = "Connection error. Please check your internet connection and try again.";
      }
      
      dispatch({ type: ActionTypes.ADD_MESSAGE, payload: {
        type: "assistant",
        content: errorMessage,
        isError: true
      }});
      
      dispatch({ type: ActionTypes.SET_ERROR, payload: error.message });
    } finally {
      dispatch({ type: ActionTypes.SET_PROCESSING, payload: false });
    }
  }, [state.messages, state.conversationHistory, state.currentConversationId, state.responseStyle, state.conversationFiles, state.conversationFileContent, currentWorkspace?.id, shouldSaveConversations]);

  const handleClearConversation = useCallback(() => {
    dispatch({ type: ActionTypes.RESET_STATE, payload: { keepMode: true } });
  }, []);

  const setConversationTitle = useCallback((title) => {
    dispatch({ type: ActionTypes.SET_CONVERSATION_TITLE, payload: title });
  }, []);

  const setSelectedProjects = useCallback((projectIds) => {
    dispatch({ type: ActionTypes.SET_SELECTED_PROJECTS, payload: projectIds || [] });
  }, []);

  const setResponseStyle = useCallback((style) => {
    dispatch({ type: ActionTypes.SET_RESPONSE_STYLE, payload: style });
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
    isStreaming: state.isStreaming,
    streamingMessageId: state.streamingMessageId,
    isConversationLoading: state.isConversationLoading,
    conversationHistory: state.conversationHistory,
    selectedProjects: state.selectedProjects,
    error: state.error,
    currentConversationId: state.currentConversationId,
    conversationTitle: state.conversationTitle,
    currentWorkspace: state.currentWorkspace,
    responseStyle: state.responseStyle,
    isGhostMode: state.isGhostMode,
    conversationSummaries: state.conversationSummaries,
    conversationFiles: state.conversationFiles || [],
    conversationFileCount: (state.conversationFiles || []).length,

    // Helper functions
    shouldSaveConversations,

    // Actions
    handleStreamingMessage,
    handleRegenerate,
    handleClearConversation,
    handleNewConversation,
    setSelectedProjects,
    setConversationTitle,
    clearError: () => dispatch({ type: ActionTypes.CLEAR_ERROR }),
    clearConversationFiles: () => dispatch({ type: ActionTypes.CLEAR_CONVERSATION_FILES }),
    loadConversation,
    saveCurrentConversation,
    setConversationListRefresh,
    triggerConversationRefresh,
    setResponseStyle,
    toggleGhostMode,
    setGhostMode
  };

  return (
    <CommandCenterContext.Provider value={contextValue}>
      {children}
    </CommandCenterContext.Provider>
  );
}

export default CommandCenterContext;