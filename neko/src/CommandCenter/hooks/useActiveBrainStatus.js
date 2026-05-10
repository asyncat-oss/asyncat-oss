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
  "openai-codex": "OpenAI Codex",
  "codex-cli": "Codex CLI",
  xai: "xAI",
  azure: "Azure",
  custom: "Custom",
};

const REASONING_PROVIDER_IDS = new Set([
  "openai",
  "openai-codex",
  "openrouter",
  "xai",
]);

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
    const rawModel = isBuiltin ? (localStatus?.model || config?.model) : config?.model;
    const model = shortModelName(rawModel);
    const mode = providerId === "openai-codex"
      ? "Codex"
      : providerId === "codex-cli"
        ? "Runtime"
        : isLocal
          ? "Local"
          : config?.provider_type === "cloud"
            ? "Cloud"
            : "Custom";
    const supportsReasoning = !isBuiltin && (
      REASONING_PROVIDER_IDS.has(providerId)
      || /\b(gpt-5|o[134]|grok|deepseek-r1|qwq)\b|thinking/i.test(String(rawModel || ""))
    );

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
      supportsReasoning,
      label: model ? `${mode} · ${providerName} · ${model}` : `${mode} · ${providerName}`,
    };
  }, [config, localStatus, loading]);
}

export default useActiveBrainStatus;
