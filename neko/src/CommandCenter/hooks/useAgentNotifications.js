import { useEffect, useRef } from 'react';

function requestPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function fireNotification(title, body, { tag = 'asyncat-agent', onClick } = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  const n = new Notification(title, {
    body,
    icon: '/pwa-96x96.png',
    badge: '/pwa-72x72.png',
    tag,
    renotify: true,
  });
  // Must set onclick explicitly — without it, macOS opens Script Editor instead of focusing the tab
  n.onclick = (e) => {
    e.preventDefault();
    window.focus();
    n.close();
  };
  if (onClick) n.onclick = (e) => { e.preventDefault(); window.focus(); n.close(); onClick(); };
}

export function useAgentNotifications({ isRunning, lastAnswer, lastAskUser, lastPermissionRequest, conversationTitle }) {
  const prevRunning = useRef(false);
  const lastAskUserIdRef = useRef(null);
  const lastPermIdRef = useRef(null);

  useEffect(() => {
    requestPermission();
  }, []);

  // Notify when agent finishes
  useEffect(() => {
    const justFinished = prevRunning.current && !isRunning;
    prevRunning.current = isRunning;
    if (!justFinished || !lastAnswer) return;
    const preview = lastAnswer.length > 100 ? lastAnswer.slice(0, 100) + '…' : lastAnswer;
    fireNotification(
      conversationTitle ? `Asyncat — ${conversationTitle}` : 'Asyncat — Done',
      preview,
      { tag: 'asyncat-agent-done' }
    );
  }, [isRunning, lastAnswer, conversationTitle]);

  // Notify when agent asks user a question (needs input)
  useEffect(() => {
    if (!lastAskUser) return;
    const id = lastAskUser.requestId;
    if (!id || id === lastAskUserIdRef.current) return;
    lastAskUserIdRef.current = id;
    fireNotification(
      'Asyncat needs your input',
      lastAskUser.question || 'The agent is waiting for your response.',
      { tag: 'asyncat-ask-user' }
    );
  }, [lastAskUser]);

  // Notify when agent is waiting for tool approval
  useEffect(() => {
    if (!lastPermissionRequest) return;
    const id = lastPermissionRequest.requestId;
    if (!id || id === lastPermIdRef.current) return;
    lastPermIdRef.current = id;
    fireNotification(
      'Asyncat needs approval',
      `Allow: ${lastPermissionRequest.toolName || 'a tool'}?`,
      { tag: 'asyncat-permission' }
    );
  }, [lastPermissionRequest]);
}
