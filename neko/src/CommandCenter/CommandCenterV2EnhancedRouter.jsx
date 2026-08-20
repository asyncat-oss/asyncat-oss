import { useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useCommandCenter } from './context/CommandCenterContextEnhanced';
import CommandCenterV2EnhancedOriginal from "./CommandCenterV2Enhanced.jsx";

const CommandCenterV2Enhanced = () => {
  const { conversationId, sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { loadConversation, currentConversationId, handleNewConversation } = useCommandCenter();
  const loadedRouteConversationRef = useRef(null);
  const handledProjectStartRef = useRef(null);

  const isAgentRoute = location.pathname.startsWith('/agents');
  const initialMode = isAgentRoute ? 'agent' : 'chat';

  useEffect(() => {
    if (!conversationId) {
      loadedRouteConversationRef.current = null;
      return;
    }

    if (conversationId === currentConversationId) {
      loadedRouteConversationRef.current = conversationId;
      return;
    }

    if (
      currentConversationId === null &&
      loadedRouteConversationRef.current === conversationId
    ) {
      return;
    }

    loadedRouteConversationRef.current = conversationId;
    loadConversation(conversationId);
  }, [conversationId, currentConversationId, loadConversation]);

  useEffect(() => {
    const startProjectChat = location.state?.startProjectChat;
    if (conversationId || !startProjectChat) return;
    const requestKey = `${startProjectChat.workingContext?.rootId || 'none'}:${location.key}`;
    if (handledProjectStartRef.current === requestKey) return;
    handledProjectStartRef.current = requestKey;

    handleNewConversation(startProjectChat).finally(() => {
      navigate(location.pathname, { replace: true, state: null });
    });
  }, [conversationId, handleNewConversation, location.key, location.pathname, location.state, navigate]);

  return (
    <CommandCenterV2EnhancedOriginal
      initialMode={initialMode}
      agentSessionId={sessionId || null}
    />
  );
};

export default CommandCenterV2Enhanced;
