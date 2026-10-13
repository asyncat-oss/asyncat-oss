import { useEffect, useMemo, useState } from "react";
import { aiProviderApi, llamaServerApi, mlxApi } from "../../Settings/settingApi.js";
import { friendlyModelName } from "../../utils/modelNames.js";

const PROVIDER_NAMES = {
  "llamacpp-builtin": "llama.cpp",
  "mlx-builtin": "MLX",
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
  // Built-in engines report file paths; keep only the model's own name.
  let name = friendlyModelName(model).replace(/\.(gguf|bin)$/i, "").replace(/[-_]?Q\d+[_-]?[A-Z0-9]*$/i, "");
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

// One shared poll loop and status stream for every component that shows the
// active model. Each hook used to run its own (the chat page and the
// composer both did), so every check went out twice.
const POLL_MS = 30000;
// MLX only runs on Apple Silicon Macs; elsewhere there is nothing to ask.
const CAN_RUN_MLX = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent || "");
let shared = { config: null, localStatus: null, mlxStatus: null, loading: true };
const listeners = new Set();
let started = false;
let pollTimer = null;
let stopStream = null;

function publish(patch) {
  shared = { ...shared, ...patch };
  for (const listener of listeners) listener(shared);
}

async function loadStatus() {
  try {
    const [configRes, localRes, mlxRes] = await Promise.all([
      aiProviderApi.getConfig().catch(() => null),
      llamaServerApi.getStatus().catch(() => null),
      CAN_RUN_MLX ? mlxApi.getStatus().catch(() => null) : Promise.resolve(null),
    ]);
    publish({ config: configRes, localStatus: localRes, mlxStatus: mlxRes });
  } finally {
    publish({ loading: false });
    if (started) {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(loadStatus, POLL_MS);
    }
  }
}

function refreshNow() {
  clearTimeout(pollTimer);
  loadStatus();
}

function startSharedStatus() {
  if (started) return;
  started = true;
  loadStatus();
  window.addEventListener("asyncat-model-runtime-updated", refreshNow);
  stopStream = aiProviderApi.streamStatus?.((payload) => {
    publish({ config: payload.config || null, localStatus: payload.localStatus || null, loading: false });
  }, () => {
    // Keep the polling fallback alive if EventSource drops.
  });
}

function stopSharedStatus() {
  started = false;
  clearTimeout(pollTimer);
  window.removeEventListener("asyncat-model-runtime-updated", refreshNow);
  stopStream?.();
  stopStream = null;
}

export function useActiveBrainStatus() {
  const [{ config, localStatus, mlxStatus, loading }, setState] = useState(shared);

  useEffect(() => {
    listeners.add(setState);
    setState(shared);
    startSharedStatus();
    return () => {
      listeners.delete(setState);
      if (listeners.size === 0) stopSharedStatus();
    };
  }, []);

  return useMemo(() => {
    const providerId = config?.provider_id || "llamacpp-builtin";
    const providerName = PROVIDER_NAMES[providerId] || providerId || "Provider";
    const isLocal = config?.provider_type === "local";
    // Both built-in engines only answer while their server is running.
    const isMlx = providerId === "mlx-builtin";
    const isBuiltin = providerId === "llamacpp-builtin" || isMlx;
    const engineStatus = isMlx ? mlxStatus : localStatus;
    const status = isBuiltin ? (engineStatus?.status || "idle") : "ready";
    const rawModel = isBuiltin ? (engineStatus?.model || config?.model) : config?.model;
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
      rawModel: rawModel || "",
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
  }, [config, localStatus, mlxStatus, loading]);
}

export default useActiveBrainStatus;
