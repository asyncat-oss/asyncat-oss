import { useEffect, useRef } from 'react';

function requestPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function fireNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // already watching
  new Notification(title, {
    body,
    icon: '/pwa-96x96.png',
    badge: '/pwa-72x72.png',
    tag: 'asyncat-agent-done',
    renotify: true,
  });
}

export function useAgentNotifications({ isRunning, lastAnswer, conversationTitle }) {
  const prevRunning = useRef(false);

  useEffect(() => {
    requestPermission();
  }, []);

  useEffect(() => {
    const justFinished = prevRunning.current && !isRunning;
    prevRunning.current = isRunning;
    if (!justFinished || !lastAnswer) return;
    const preview = lastAnswer.length > 80 ? lastAnswer.slice(0, 80) + '…' : lastAnswer;
    fireNotification(conversationTitle ? `Asyncat — ${conversationTitle}` : 'Asyncat — Done', preview);
  }, [isRunning, lastAnswer, conversationTitle]);
}
