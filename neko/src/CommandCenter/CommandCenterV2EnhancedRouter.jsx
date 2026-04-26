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

  // Derive sub-view for agent routes
  const initialAgentView = location.pathname.startsWith('/agents/tools')
    ? 'tools'
    : location.pathname.startsWith('/agents/skills')
    ? 'skills'
    : 'run';

  useEffect(() => {
    if (conversationId && conversationId !== currentConversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, currentConversationId, loadConversation]);

  return (
    <CommandCenterV2EnhancedOriginal
      initialMode={initialMode}
      agentSessionId={sessionId || null}
      initialAgentView={initialAgentView}
    />
  );
};

export default CommandCenterV2Enhanced;
