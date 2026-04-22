import { useEffect } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useCommandCenter } from './CommandCenterContextEnhanced';
import CommandCenterV2EnhancedOriginal from "./CommandCenterV2Enhanced.jsx";

const CommandCenterV2Enhanced = () => {
  const { selectedProject, session } = useOutletContext();
  const { conversationId } = useParams();
  const { loadConversation, currentConversationId } = useCommandCenter();

  // Load conversation when conversationId changes
  useEffect(() => {
    if (conversationId && conversationId !== currentConversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, currentConversationId, loadConversation]);

  return (
    <CommandCenterV2EnhancedOriginal
      selectedProject={selectedProject}
      session={session}
    />
  );
};

export default CommandCenterV2Enhanced;
