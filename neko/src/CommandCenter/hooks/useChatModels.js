// useChatModels.js — the models a chat can run on, for the composer's model
// menu: saved models (providers) and the model files on this computer. Loads
// again when models change, and when asked (the menu asks as it opens).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiProviderApi, localModelsApi } from '../../Settings/settingApi.js';
import { modelOptions } from '../utils/chatModel.js';

export function useChatModels({ loadedFile = null } = {}) {
  // `loaded` says which lists have come in at least once: until one has, a
  // chat's model can't be told apart from one that was removed.
  const [lists, setLists] = useState({ profiles: [], localModels: [], loaded: { profiles: false, local: false } });
  const mounted = useRef(true);
  const sent = useRef(0);
  const shown = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++sent.current;
    const [profiles, localModels] = await Promise.all([
      aiProviderApi.listProfiles().then((res) => res?.profiles || []).catch(() => null),
      localModelsApi.listModels().then((res) => res?.models || []).catch(() => null),
    ]);
    // Refreshes can overlap (the menu opening, a model loading): one that
    // answers after a newer one would put the older lists back.
    if (!mounted.current || request < shown.current) return;
    shown.current = request;
    // A list that couldn't load keeps what was there.
    setLists((prev) => ({
      profiles: profiles ?? prev.profiles,
      localModels: localModels ?? prev.localModels,
      loaded: {
        profiles: prev.loaded.profiles || profiles !== null,
        local: prev.loaded.local || localModels !== null,
      },
    }));
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    window.addEventListener('asyncat-model-runtime-updated', refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener('asyncat-model-runtime-updated', refresh);
    };
  }, [refresh]);

  const options = useMemo(
    () => modelOptions({ profiles: lists.profiles, localModels: lists.localModels, loadedFile }),
    [lists.profiles, lists.localModels, loadedFile],
  );
  return { options, loaded: lists.loaded, refresh };
}

export default useChatModels;
