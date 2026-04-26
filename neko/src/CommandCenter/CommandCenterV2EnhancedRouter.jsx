import { useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useCommandCenter } from './CommandCenterContextEnhanced';
import CommandCenterV2EnhancedOriginal from "./CommandCenterV2Enhanced.jsx";

const CommandCenterV2Enhanced = () => {
  const { conversationId, sessionId } = useParams();
  const location = useLocation();
  const { loadConversation, currentConversationId } = useCommandCenter();

  const isAgentRoute = location.pathname.startsWith('/agents');
  const initialMode = isAgentRoute ? 'agent' : 'chat';

  useEffect(() => {
    if (conversationId && conversationId !== currentConversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, currentConversationId, loadConversation]);

  return (
    <CommandCenterV2EnhancedOriginal
      initialMode={initialMode}
      agentSessionId={sessionId || null}
    />
  );
};

export default CommandCenterV2Enhanced;
