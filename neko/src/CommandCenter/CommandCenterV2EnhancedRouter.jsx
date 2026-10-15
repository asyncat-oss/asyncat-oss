import { useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useCommandCenter } from './context/CommandCenterContextEnhanced';
import { useToast } from '../components/toastContext';
import CommandCenterV2EnhancedOriginal from "./CommandCenterV2Enhanced.jsx";

const CommandCenterV2Enhanced = () => {
  const { conversationId, sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { loadConversation, currentConversationId, handleNewConversation } = useCommandCenter();
  const loadedRouteConversationRef = useRef(null);
  const handledProjectStartRef = useRef(null);
  const routeConversationIdRef = useRef(conversationId);
  routeConversationIdRef.current = conversationId;
  const previousConversationIdRef = useRef(currentConversationId);

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
    loadConversation(conversationId).then((result) => {
      // A trashed or deleted chat (an old link, a row from before it went):
      // say so and leave its dead address, so a message typed next starts a
      // new chat that stays on screen.
      if (!result?.notFound || routeConversationIdRef.current !== conversationId) return;
      loadedRouteConversationRef.current = null;
      navigate('/home', { replace: true });
      toast.info('That chat was deleted', {
        detail: 'It may still be in the Trash.',
        action: { label: 'Open Trash', onClick: () => navigate('/trash') },
      });
    });
  }, [conversationId, currentConversationId, loadConversation, navigate, toast]);

  // A new chat gets its own address as soon as it is saved, however it was
  // started (Home, a project page, Quick ask), so the sidebar marks it and a
  // reload or Back finds it again.
  useEffect(() => {
    const previous = previousConversationIdRef.current;
    previousConversationIdRef.current = currentConversationId;
    if (conversationId || previous || !currentConversationId) return;
    navigate(`/conversations/${currentConversationId}`, { replace: true });
  }, [conversationId, currentConversationId, navigate]);

  useEffect(() => {
    const startProjectChat = location.state?.startProjectChat;
    if (conversationId || !startProjectChat) return;
    const requestKey = `${startProjectChat.workingContext?.rootId || startProjectChat.workingContext?.projectId || 'none'}:${location.key}`;
    if (handledProjectStartRef.current === requestKey) return;
    handledProjectStartRef.current = requestKey;

    handleNewConversation(startProjectChat).finally(() => {
      navigate(location.pathname, { replace: true, state: null });
    });
  }, [conversationId, handleNewConversation, location.key, location.pathname, location.state, navigate]);

  return (
    <CommandCenterV2EnhancedOriginal agentSessionId={sessionId || null} />
  );
};

export default CommandCenterV2Enhanced;
