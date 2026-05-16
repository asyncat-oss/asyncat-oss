import { useEffect, useMemo, useState } from "react";
import { aiProviderApi, llamaServerApi } from "../../Settings/settingApi.js";

const PROVIDER_NAMES = {
  "llamacpp-builtin": "llama.cpp",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  xai: "xAI",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  kimi: "Kimi",
  together: "Together",
  perplexity: "Perplexity",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax CN",
  groq: "Groq",
  huggingface: "Hugging Face",
  "nvidia-nim": "NVIDIA NIM",
  openrouter: "OpenRouter",
  cohere: "Cohere",
  fireworks: "Fireworks",
  cerebras: "Cerebras",
  deepinfra: "DeepInfra",
  bedrock: "Bedrock",
  "openai-codex": "OpenAI Codex",
  "codex-cli": "Codex CLI",
  azure: "Azure",
  custom: "Custom",
};

const shortModelName = (model, providerName = "") => {
  if (!model) return "";
  let name = String(model).replace(/\.(gguf|bin)$/i, "").replace(/[-_]?Q\d+[_-]?[A-Z0-9]*$/i, "");
  // Strip provider prefix from model name to avoid "MiniMax · MiniMax-M2.7" redundancy
  if (providerName) {
    const prefix = providerName.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const nameStart = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (nameStart.startsWith(prefix)) {
      name = name.slice(providerName.length).replace(/^[-_.]/, "");
    }
  }
  return name || String(model).replace(/\.(gguf|bin)$/i, "");
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

    const refreshNow = () => {
      clearTimeout(timer);
      load();
    };

    load();
    window.addEventListener("asyncat-model-runtime-updated", refreshNow);
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
      window.removeEventListener("asyncat-model-runtime-updated", refreshNow);
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
    const model = shortModelName(rawModel, providerName);
    const mode = providerId === "openai-codex"
      ? "Codex"
      : providerId === "codex-cli"
        ? "Runtime"
        : isLocal
          ? "Local"
          : config?.provider_type === "cloud"
            ? "Cloud"
            : "Custom";
            
    const capabilities = config?.capabilities || null;
    const supportsReasoning = capabilities?.supportsReasoning || false;

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
      capabilities,
      label: model ? `${mode} · ${providerName} · ${model}` : `${mode} · ${providerName}`,
    };
  }, [config, localStatus, loading]);
}

export default useActiveBrainStatus;
