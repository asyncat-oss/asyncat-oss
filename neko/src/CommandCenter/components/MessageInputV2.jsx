// MessageInputV2.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { Cloud, Cpu, Loader2, Send, Search, Wifi, WifiOff, X } from "lucide-react";
import { useLocalModelStatus } from "../hooks/useLocalModelStatus.js";
import { useModelConfig } from "../hooks/useModelConfig.js";
import { useActiveBrainStatus } from "../hooks/useActiveBrainStatus.js";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";

export const MessageInputV2 = ({
  onSubmit,
  disabled,
  autoFocus,
  onReset,
  placeholder = "Ask anything...",
  maxLength = 50000,
  hasMessages = false,
  conversationTooLong = false,
  conversationTokens = 0,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const localModel = useLocalModelStatus();
  const activeBrain = useActiveBrainStatus();
  const network = useNetworkStatus();
  const { config: modelConfig } = useModelConfig();
  const textareaRef = useRef(null);

  const inputTokens = Math.ceil(value.length / 4);
  const totalTokens = conversationTokens + inputTokens;
  const ctxSize = localModel.ctxSize || modelConfig.ctx_size || 8192;
  const contextPercent = Math.min(
    100,
    Math.round((totalTokens / ctxSize) * 100),
  );

  useEffect(() => {
    if (!textareaRef.current) return;
    if (autoFocus && !disabled) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [autoFocus]);

  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    if (prevDisabledRef.current && !disabled && textareaRef.current) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    prevDisabledRef.current = disabled;
  }, [disabled]);

  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    setValue(newValue);

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (!value.trim() || disabled) return;

      try {
        const messageToSend = {
          content: value.trim(),
          webSearch: webSearchEnabled,
          modelConfig,
        };

        await onSubmit(messageToSend, []);
        setValue("");
        setError(null);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (err) {
        console.error("Failed to submit message:", err);
        setError("Failed to send message. Please try again.");
      }
    },
    [value, disabled, webSearchEnabled, modelConfig, onSubmit],
  );

  const handleKeyDown = useCallback(
    (e) => {
      const nativeIsComposing = Boolean(e.nativeEvent?.isComposing);

      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !isComposing &&
        !nativeIsComposing
      ) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isComposing],
  );

  const canSubmit = value.trim() && !disabled;
  const BrainIcon = activeBrain.isLocal ? Cpu : Cloud;
  const NetworkIcon = network.fullyOnline ? Wifi : WifiOff;

  const getBorderColor = () => {
    return "border-gray-200 dark:border-gray-700 midnight:border-gray-700";
  };

  return (
    <div className="bg-transparent">
      <div className="max-w-4xl mx-auto px-6 py-3">
        {localModel.isReady && contextPercent > 90 && (
          <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/30 border-l-4 border-red-500 rounded-lg">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-red-500 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                  Context window is {contextPercent}% full
                </h3>
                <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                  The model may stop responding or produce incomplete answers.
                  Start a new conversation for best results.
                </p>
                <button
                  onClick={onReset}
                  className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Start New Chat
                </button>
              </div>
            </div>
          </div>
        )}

        {conversationTooLong ? (
          <div className="p-6 bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/30 border border-orange-200 dark:border-orange-800 midnight:border-orange-700 rounded-lg text-center">
            <h3 className="text-lg font-medium text-orange-900 dark:text-orange-100 mb-2">
              Conversation Too Long
            </h3>
            <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
              Start a new conversation for better performance.
            </p>
            <button
              onClick={onReset}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors font-medium"
            >
              Start New Conversation
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div
              className={`p-4 bg-white dark:bg-gray-800 midnight:bg-gray-900 border-2 rounded-lg transition-colors ${getBorderColor()}`}
            >
              {error && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                  <p className="text-sm text-red-800 dark:text-red-200 flex-1">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                disabled={disabled}
                placeholder={placeholder}
                maxLength={maxLength}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                rows="2"
                className="w-full resize-none bg-transparent text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-500 focus:outline-none text-base leading-relaxed min-h-12 max-h-45 disabled:opacity-50"
              />

              {localModel.isReady && (
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-gray-400 dark:text-gray-500">
                    {value.length > 0 && `+${inputTokens.toLocaleString()} · `}~
                    {totalTokens.toLocaleString()} / {ctxSize.toLocaleString()}{" "}
                    tokens ({contextPercent}%)
                  </span>
                  <div className="flex items-center gap-2" />
                </div>
              )}

              <div className="flex items-center justify-between gap-4 pt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    title={`${activeBrain.label}${activeBrain.supportsTools ? " · native tools enabled" : ""}`}
                    className={`inline-flex items-center gap-1.5 max-w-full px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                      activeBrain.isLoadingModel
                        ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
                        : activeBrain.isReady
                          ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    {activeBrain.isLoadingModel || activeBrain.loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <BrainIcon className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate max-w-[14rem]">
                      {activeBrain.isLoadingModel ? "Loading" : activeBrain.mode} · {activeBrain.providerName}
                      {activeBrain.model ? ` · ${activeBrain.model}` : ""}
                    </span>
                  </div>
                  <div
                    title={network.needsNetworkMessage || "Network ready"}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                      network.fullyOnline
                        ? "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-500 dark:text-gray-400 midnight:text-gray-400 border-gray-200 dark:border-gray-700"
                        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60"
                    }`}
                  >
                    <NetworkIcon className="w-3.5 h-3.5" />
                    {network.fullyOnline ? "Online" : "Offline"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setWebSearchEnabled((v) => !v)}
                    disabled={disabled}
                    title={
                      webSearchEnabled
                        ? "Web search ON — click to disable"
                        : "Search the web"
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      webSearchEnabled
                        ? "bg-blue-100 dark:bg-blue-900/40 midnight:bg-blue-900/40 text-blue-700 dark:text-blue-300 midnight:text-blue-300 ring-1 ring-blue-400 dark:ring-blue-500"
                        : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    Search
                  </button>
                </div>

                <div className="shrink-0">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`px-4 py-2 rounded-lg transition-all duration-200 font-medium ${
                      canSubmit
                        ? "bg-black hover:bg-gray-900 active:scale-95 text-white dark:bg-gray-800 dark:hover:bg-gray-700 midnight:bg-gray-900 midnight:hover:bg-gray-800 shadow-sm hover:shadow-md"
                        : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-400 dark:text-gray-500 midnight:text-gray-500 cursor-not-allowed"
                    }`}
                    title={canSubmit ? "Send (Enter)" : "Type a message"}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {hasMessages && (
          <div className="mt-2 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500">
              The Cat can make mistakes. Verify important information.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageInputV2;
