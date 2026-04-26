import { useEffect, useMemo, useState } from "react";
import { aiProviderApi, llamaServerApi } from "../../Settings/settingApi.js";

const PROVIDER_NAMES = {
  "llamacpp-builtin": "llama.cpp",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax CN",
  groq: "Groq",
  openrouter: "OpenRouter",
  azure: "Azure",
  custom: "Custom",
};

const shortModelName = (model) => {
  if (!model) return "";
  return String(model).replace(/\.(gguf|bin)$/i, "").replace(/[-_]?Q\d+[_-]?[A-Z0-9]*$/i, "");
};

export function useActiveBrainStatus({ pollMs = 30000 } = {}) {
  const [config, setConfig] = useState(null);
  const [localStatus, setLocalStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let cleanupStream = null;

    const load = async () => {
      try {
        const [configRes, localRes] = await Promise.all([
          aiProviderApi.getConfig().catch(() => null),
          llamaServerApi.getStatus().catch(() => null),
        ]);
        if (cancelled) return;
        setConfig(configRes);
        setLocalStatus(localRes);
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(load, pollMs);
        }
      }
    };

    load();
    cleanupStream = aiProviderApi.streamStatus?.((payload) => {
      if (cancelled) return;
      setConfig(payload.config || null);
      setLocalStatus(payload.localStatus || null);
      setLoading(false);
    }, () => {
      // Keep the polling fallback alive if EventSource drops.
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cleanupStream?.();
    };
  }, [pollMs]);

  return useMemo(() => {
    const providerId = config?.provider_id || "llamacpp-builtin";
    const providerName = PROVIDER_NAMES[providerId] || providerId || "Provider";
    const isLocal = config?.provider_type === "local";
    const isBuiltin = providerId === "llamacpp-builtin";
    const status = isBuiltin ? (localStatus?.status || "idle") : "ready";
    const model = shortModelName(isBuiltin ? (localStatus?.model || config?.model) : config?.model);
    const mode = isLocal ? "Local" : config?.provider_type === "cloud" ? "Cloud" : "Custom";

    return {
      loading,
      mode,
      providerId,
      providerName,
      model,
      status,
      isLocal,
      isBuiltin,
      isLoadingModel: isBuiltin && status === "loading",
      isReady: isBuiltin ? status === "ready" : Boolean(config?.model),
      supportsTools: Boolean(config?.supports_tools),
      label: model ? `${mode} · ${providerName} · ${model}` : `${mode} · ${providerName}`,
    };
  }, [config, localStatus, loading]);
}

export default useActiveBrainStatus;
