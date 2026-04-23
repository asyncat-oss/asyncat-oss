// MessageInputV2.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Search,
  Brain,
  X,
  Target,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import ResponseStyleController from "./ResponseStyleController";
import { useLocalModelStatus } from "../hooks/useLocalModelStatus.js";
import { useModelConfig } from "../hooks/useModelConfig.js";

const RESPONSE_STYLES = {
  normal: { name: "Chillax", icon: Target },
  concise: { name: "Speedrun", icon: Target },
  explanatory: { name: "Storyteller", icon: BookOpen },
  learning: { name: "Professor", icon: GraduationCap },
};

export const MessageInputV2 = ({
  onSubmit,
  disabled,
  autoFocus,
  onReset,
  placeholder = "Ask anything...",
  maxLength = 50000,
  hasMessages = false,
  conversationTooLong = false,
  responseStyle = "normal",
  onResponseStyleChange,
  conversationTokens = 0,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const localModel = useLocalModelStatus();
  const { config: modelConfig } = useModelConfig();
  const textareaRef = useRef(null);

  // Token estimation: ~4 chars per token (rough approximation)
  const inputTokens = Math.ceil(value.length / 4);
  const totalTokens = conversationTokens + inputTokens;
  const ctxSize = localModel.ctxSize || modelConfig.ctx_size || 8192;
  const contextPercent = Math.min(
    100,
    Math.round((totalTokens / ctxSize) * 100),
  );

  // Focus on mount if autoFocus
  useEffect(() => {
    if (!textareaRef.current) return;
    if (autoFocus && !disabled) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [autoFocus]);

  // Re-focus when AI finishes
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
          thinking: thinkingEnabled,
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
    [value, disabled, webSearchEnabled, thinkingEnabled, modelConfig, onSubmit],
  );

  const handleKeyDown = useCallback(
    (e) => {
      const nativeIsComposing = Boolean(e.nativeEvent?.isComposing);

      // Avoid submitting while composing IME text (Japanese/Chinese/Korean, etc).
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

  // Border color based on context usage
  const getBorderColor = () => {
    if (!localModel.isReady)
      return "border-gray-200 dark:border-gray-700 midnight:border-gray-700";
    if (contextPercent >= 85)
      return "border-red-400 dark:border-red-500 midnight:border-red-500";
    if (contextPercent >= 50)
      return "border-amber-400 dark:border-amber-500 midnight:border-amber-500";
    return "border-green-400 dark:border-green-500 midnight:border-green-500";
  };

  return (
    <div className="bg-transparent">
      <div className="max-w-4xl mx-auto px-6 py-3">
        {/* Context warning banner — shown when >90% */}
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
              {/* Error Message */}
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

              {/* Textarea */}
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

              {/* Token counter + draft saved indicator */}
              {localModel.isReady && (
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span
                    className={`${contextPercent > 85 ? "text-red-600 dark:text-red-400" : contextPercent > 50 ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"}`}
                  >
                    {value.length > 0 && `+${inputTokens.toLocaleString()} · `}~
                    {totalTokens.toLocaleString()} / {ctxSize.toLocaleString()}{" "}
                    tokens ({contextPercent}%)
                  </span>
                  <div className="flex items-center gap-2">
                    {contextPercent > 85 && (
                      <span className="text-red-500 dark:text-red-400 font-medium">
                        Context nearly full
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <div className="flex items-center justify-between gap-4 pt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <ResponseStyleController
                    currentStyle={responseStyle}
                    onStyleChange={onResponseStyleChange}
                    disabled={disabled}
                  />

                  {/* Web Search Toggle */}
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

                  {/* Think Toggle */}
                  <button
                    type="button"
                    onClick={() => setThinkingEnabled((v) => !v)}
                    disabled={disabled}
                    title={
                      thinkingEnabled
                        ? "Thinking ON — click to disable"
                        : "Enable step-by-step reasoning"
                    }
                    className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      thinkingEnabled
                        ? "bg-purple-100 dark:bg-purple-900/40 midnight:bg-purple-900/40 text-purple-700 dark:text-purple-300 midnight:text-purple-300 ring-1 ring-purple-400 dark:ring-purple-500"
                        : localModel.supportsThinking
                          ? "bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/20 text-purple-600 dark:text-purple-400 midnight:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                          : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
                    }`}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Think
                    {localModel.supportsThinking && !thinkingEnabled && (
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-400"
                        title="Native thinking model"
                      />
                    )}
                  </button>

                  {/* Active response style pill */}
                  {responseStyle !== "normal" && (
                    <div className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900/30 midnight:bg-green-900/30 text-green-700 dark:text-green-300 midnight:text-green-300 rounded-full text-sm">
                      <span>{RESPONSE_STYLES[responseStyle]?.name}</span>
                      <button
                        type="button"
                        onClick={() => onResponseStyleChange("normal")}
                        className="ml-1 hover:bg-green-200 dark:hover:bg-green-800/50 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Send button */}
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
