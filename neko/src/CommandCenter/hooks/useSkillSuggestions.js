// useSkillSuggestions.js — the "Save this as a skill?" drafts waiting in a
// chat (Settings → Privacy & safety → Suggest skills from my chats). Loaded
// when the chat opens and kept in step with /api/events, so a draft made
// after the answer shows up, and Save or Not now in another window closes it.
import { useCallback, useEffect, useState } from 'react';
import learningApi from '../../services/learningApi.js';
import { subscribeAppEvent } from '../../services/appEvents.js';
import { applySkillEvent, markSaved } from '../utils/skillSuggestions.js';

export default function useSkillSuggestions(conversationId) {
  const [state, setState] = useState({ conversationId: null, items: [] });

  useEffect(() => {
    if (!conversationId) return undefined;
    let alive = true;
    const load = () => {
      learningApi.suggestions(conversationId)
        .then((res) => {
          if (!alive) return;
          // Keep cards saved in this window; the server no longer has them.
          setState((current) => ({
            conversationId,
            items: [
              ...(current.conversationId === conversationId ? current.items.filter((item) => item.saved) : []),
              ...(res.suggestions || []),
            ],
          }));
        })
        .catch(() => { /* no cards this time */ });
    };
    load();
    const update = (event) => setState((current) => ({
      conversationId,
      items: applySkillEvent(current.conversationId === conversationId ? current.items : [], event, conversationId),
    }));
    const offs = [
      subscribeAppEvent('skill.suggested', update),
      subscribeAppEvent('skill.closed', update),
      subscribeAppEvent('events.reconnected', load),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [conversationId]);

  const save = useCallback(async (id) => {
    await learningApi.saveSuggestion(id);
    setState((current) => ({ ...current, items: markSaved(current.items, id) }));
  }, []);

  const dismiss = useCallback(async (id) => {
    await learningApi.dismissSuggestion(id);
    setState((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
  }, []);

  const suggestions = conversationId && state.conversationId === conversationId ? state.items : [];
  return { suggestions, save, dismiss };
}
