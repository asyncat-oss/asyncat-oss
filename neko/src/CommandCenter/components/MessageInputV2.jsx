// MessageInputV2.jsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Cloud, Cpu, Loader2, Send, Square, Wrench, X, Zap } from "lucide-react";
import { useLocalModelStatus } from "../hooks/useLocalModelStatus.js";
import { useModelConfig } from "../hooks/useModelConfig.js";
import { useActiveBrainStatus } from "../hooks/useActiveBrainStatus.js";
import { localModelsApi, llamaServerApi } from "../../Settings/settingApi.js";
import { profilesApi } from "../commandCenterApi.js";

function getMentionTrigger(value, cursor) {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
  if (!match) return null;
  const start = beforeCursor.length - match[2].length - 1;
  return { start, end: cursor, query: match[2].toLowerCase() };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMentionOverlayHtml(value, profiles) {
  if (!value) return "<br>";

  const validHandles = new Set(
    profiles.filter((p) => p?.handle).map((p) => String(p.handle).toLowerCase())
  );

  const mentionClass =
    "rounded bg-blue-100/60 px-1 font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 midnight:text-blue-300";
  const regex = /(^|[\s(])@([a-zA-Z0-9_-]+)/g;

  let html = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(value)) !== null) {
    html += escapeHtml(value.slice(lastIndex, match.index));

    const prefix = match[1];
    const handle = match[2];

    if (validHandles.has(handle.toLowerCase())) {
      html += `${escapeHtml(prefix)}<span style="box-decoration-break: clone; -webkit-box-decoration-break: clone;" class="${mentionClass}">${escapeHtml("@" + handle)}</span>`;
    } else {
      html += escapeHtml(match[0]);
    }

    lastIndex = regex.lastIndex;
  }

  html += escapeHtml(value.slice(lastIndex));
  return html.replace(/\n/g, "<br>") || "<br>";
}

function extractAgentMentions(value, profiles) {
  const handles = new Set(
    [...String(value || '').matchAll(/(^|[\s(])@([a-zA-Z0-9_-]+)/g)]
      .map(match => match[2].toLowerCase())
  );
  const seen = new Set();
  return profiles
    .filter(profile => profile?.handle && handles.has(String(profile.handle).toLowerCase()))
    .filter(profile => {
      if (seen.has(profile.id)) return false;
      seen.add(profile.id);
      return true;
    })
    .map(profile => ({
      id: profile.id,
      handle: profile.handle,
      name: profile.name,
      icon: profile.icon,
    }));
}

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
  contextInfo = null,
  contextLoading = false,
  onCompactContext,
  isCompacting = false,
  onDraftChange,
  prefillValue,
  toolsEnabled = true,
  onToggleTools,
  autoApprove = false,
  onToggleAutoApprove,
  isRunning = false,
  onStop,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [localModels, setLocalModels] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [modelSwitchError, setModelSwitchError] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [agentProfiles, setAgentProfiles] = useState([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  const localModel = useLocalModelStatus();
  const activeBrain = useActiveBrainStatus();
  const { config: modelContextConfig } = useModelConfig();
  const textareaRef = useRef(null);
  const overlayRef = useRef(null);
  const toolbarRef = useRef(null);
  const mentionTrigger = useMemo(
    () => getMentionTrigger(value, cursorPosition),
    [value, cursorPosition],
  );
  const mentionSuggestions = useMemo(() => {
    if (!mentionTrigger) return [];
    return agentProfiles
      .filter(profile => {
        const handle = String(profile.handle || '').toLowerCase();
        const name = String(profile.name || '').toLowerCase();
        return !mentionTrigger.query || handle.includes(mentionTrigger.query) || name.includes(mentionTrigger.query);
      })
      .slice(0, 6);
  }, [agentProfiles, mentionTrigger]);
  const detectedAgentMentions = useMemo(
    () => extractAgentMentions(value, agentProfiles),
    [agentProfiles, value],
  );

  const inputTokens = Math.ceil(value.length / 4);
  const totalTokens = conversationTokens + inputTokens;
  const ctxSize = localModel.ctxSize || modelContextConfig.ctx_size || 8192;
  const estimatedContextPercent = Math.min(
    100,
    Math.round((totalTokens / ctxSize) * 100),
  );
  const displayTokens = contextInfo?.inputTokens ?? totalTokens;
  const displayCtxSize = contextInfo?.ctxLimit ?? ctxSize;
  const contextPercent = contextInfo?.percent ?? estimatedContextPercent;
  const contextExact = Boolean(contextInfo?.exact);
  const contextLabel = contextInfo?.label || 'estimated tokens';

  useEffect(() => {
    if (!textareaRef.current) return;
    if (autoFocus && !disabled) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!prefillValue) return;
    setValue(prefillValue);
    onDraftChange?.(prefillValue);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [onDraftChange, prefillValue]);

  useEffect(() => {
    let cancelled = false;
    profilesApi
      .listProfiles()
      .then((res) => {
        if (!cancelled) setAgentProfiles(res.profiles || []);
      })
      .catch(() => {
        if (!cancelled) setAgentProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setProfilesLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    onDraftChange?.(newValue);
    setCursorPosition(e.target.selectionStart || newValue.length);

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [onDraftChange]);

  const handleCursorChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) setCursorPosition(textarea.selectionStart || 0);
  }, []);

  const insertMention = useCallback((profile) => {
    if (!mentionTrigger || !profile?.handle) return;
    const mention = `@${profile.handle}`;
    const nextValue = `${value.slice(0, mentionTrigger.start)}${mention} ${value.slice(mentionTrigger.end)}`;
    const nextCursor = mentionTrigger.start + mention.length + 1;
    setValue(nextValue);
    setCursorPosition(nextCursor);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
    });
  }, [mentionTrigger, value]);

  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const overlay = overlayRef.current;
    if (textarea && overlay) {
      overlay.style.transform = `translate(-${textarea.scrollLeft}px, -${textarea.scrollTop}px)`;
    }
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (!value.trim() || disabled) return;

      try {
        const messageToSend = {
          content: value.trim(),
          agentMentions: detectedAgentMentions,
        };

        await onSubmit(messageToSend, []);
        setValue("");
        onDraftChange?.("");
        setError(null);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (err) {
        console.error("Failed to submit message:", err);
        setError("Failed to send message. Please try again.");
      }
    },
    [value, disabled, onSubmit, detectedAgentMentions, onDraftChange],
  );

  const handleKeyDown = useCallback(
    (e) => {
      const nativeIsComposing = Boolean(e.nativeEvent?.isComposing);

      if (mentionSuggestions.length > 0 && (e.key === "Tab" || e.key === "Enter")) {
        e.preventDefault();
        insertMention(mentionSuggestions[0]);
        return;
      }

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
    [handleSubmit, insertMention, isComposing, mentionSuggestions],
  );

  const canSubmit = value.trim() && !disabled && !isRunning;
  const BrainIcon = activeBrain.isLocal ? Cpu : Cloud;
  const modelLabel = activeBrain.isLoadingModel
    ? "Loading"
    : `${activeBrain.mode} · ${activeBrain.providerName}${activeBrain.model ? ` · ${activeBrain.model}` : ""}`;
  const modelOptions = activeBrain.isBuiltin
    ? [
        ...(localModel.model
          ? [{ value: localModel.model, label: `${activeBrain.mode} · ${activeBrain.providerName} · ${activeBrain.model || localModel.model}`, active: true }]
          : [{ value: "", label: "No model loaded", active: true, disabled: true }]),
        ...localModels
          .filter((model) => model.filename && model.filename !== localModel.model)
          .map((model) => ({
            value: model.filename,
            label: model.filename.replace(/\.(gguf|bin)$/i, ""),
          })),
      ]
    : [{ value: "__current__", label: modelLabel, active: true, disabled: true }];

  useEffect(() => {
    if (!activeBrain.isBuiltin || modelsLoaded) return;
    let cancelled = false;

    localModelsApi
      .listModels()
      .then((res) => {
        if (!cancelled) setLocalModels(res.models || []);
      })
      .catch(() => {
        if (!cancelled) setLocalModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [activeBrain.isBuiltin, modelsLoaded]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!toolbarRef.current?.contains(event.target)) setOpenMenu(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const handleModelSelect = useCallback(
    async (nextModel) => {
      setOpenMenu(null);

      if (nextModel === "__manage__") {
        window.location.href = "/models";
        return;
      }

      if (!nextModel || nextModel === localModel.model || isSwitchingModel) return;

      setModelSwitchError(null);
      setIsSwitchingModel(true);
      try {
        await llamaServerApi.start(nextModel, ctxSize);
      } catch (err) {
        setModelSwitchError(err.message || "Could not switch model.");
      } finally {
        setIsSwitchingModel(false);
      }
    },
    [ctxSize, isSwitchingModel, localModel.model],
  );

  const getBorderColor = () => {
    return "border-gray-200 dark:border-gray-700 midnight:border-gray-700";
  };

  return (
    <div className="bg-transparent">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-3">
        {(localModel.isReady || activeBrain.isReady || contextInfo) && contextPercent > 90 && (
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
              {(error || modelSwitchError) && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                  <p className="text-sm text-red-800 dark:text-red-200 flex-1">
                    {error || modelSwitchError}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setModelSwitchError(null);
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="relative">
                <div
                  ref={overlayRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden text-base leading-relaxed text-gray-900 dark:text-gray-100 midnight:text-gray-100 break-words"
                  dangerouslySetInnerHTML={{
                    __html: buildMentionOverlayHtml(value, agentProfiles),
                  }}
                />
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onClick={handleCursorChange}
                  onKeyUp={handleCursorChange}
                  onScroll={handleScroll}
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
                  className="w-full resize-none bg-transparent text-transparent caret-gray-900 dark:caret-gray-100 midnight:caret-gray-100 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-500 focus:outline-none text-base leading-relaxed min-h-12 max-h-45 disabled:opacity-50"
                />
              </div>

              {mentionTrigger && (
                <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
                  {mentionSuggestions.length > 0 ? (
                    <div className="max-h-56 overflow-y-auto p-1">
                      {mentionSuggestions.map(profile => (
                        <button
                          key={profile.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => insertMention(profile)}
                          className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-slate-800"
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm dark:bg-gray-800 midnight:bg-slate-800">
                            {profile.icon || "🤖"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100 midnight:text-slate-100">
                              {profile.name}
                            </span>
                            <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                              @{profile.handle}{profile.description ? ` · ${profile.description}` : ''}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                      {profilesLoaded ? 'No matching agent profiles' : 'Loading agent profiles...'}
                    </div>
                  )}
                </div>
              )}

              {(localModel.isReady || activeBrain.isReady || contextInfo) && (
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                  <span className="min-w-0 truncate text-gray-400 dark:text-gray-500">
                    {contextLoading ? 'Checking context...' : (
                      <>
                        {contextExact ? '' : '~'}
                        {displayTokens.toLocaleString()} / {displayCtxSize.toLocaleString()}{" "}
                        {contextLabel} ({contextPercent}%)
                        {contextInfo?.contextWindowSource ? ` · ${contextInfo.contextWindowSource}` : ''}
                      </>
                    )}
                  </span>
                  {onCompactContext && contextPercent >= 50 && (
                    <button
                      type="button"
                      onClick={onCompactContext}
                      disabled={disabled || isCompacting}
                      className="shrink-0 rounded-md border border-amber-200 px-2 py-1 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800/70 dark:text-amber-300 dark:hover:bg-amber-950/20"
                      title="Summarize older context while keeping this chat visible"
                    >
                      {isCompacting ? 'Compacting...' : 'Compact'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                <div ref={toolbarRef} className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
                      disabled={disabled || activeBrain.loading || isSwitchingModel}
                      title={`${activeBrain.label}${activeBrain.supportsTools ? " · native tools enabled" : ""}`}
                      className={`inline-flex items-center gap-1.5 min-w-0 max-w-full sm:max-w-[16rem] px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        activeBrain.isLoadingModel
                          ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
                          : activeBrain.isReady
                            ? "bg-emerald-50/80 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-50"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                      } disabled:cursor-not-allowed`}
                    >
                      {activeBrain.isLoadingModel || activeBrain.loading || isSwitchingModel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <BrainIcon className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{modelLabel}</span>
                      <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </button>
                    {openMenu === "model" && (
                      <div className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
                        <div className="max-h-60 overflow-y-auto p-1">
                          {modelOptions.map((option) => (
                            <button
                              key={option.value || option.label}
                              type="button"
                              disabled={option.disabled || option.value === localModel.model}
                              onClick={() => handleModelSelect(option.value)}
                              className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                                option.active
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:hover:bg-slate-800"
                              } disabled:cursor-default`}
                            >
                              <span className="block truncate font-medium">{option.label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 p-1 dark:border-gray-800 midnight:border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleModelSelect("__manage__")}
                            className="w-full rounded-md px-2.5 py-2 text-left text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:hover:bg-slate-800"
                          >
                            Manage models
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {onToggleTools && (
                    <button
                      type="button"
                      onClick={onToggleTools}
                      disabled={disabled}
                      title={toolsEnabled ? "Tools enabled — click to disable" : "Tools disabled — click to enable"}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        toolsEnabled
                          ? "bg-blue-50 dark:bg-blue-950/30 midnight:bg-blue-950/30 text-blue-700 dark:text-blue-300 midnight:text-blue-300 border border-blue-300 dark:border-blue-700"
                          : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-500 dark:text-gray-400 midnight:text-gray-400 border border-transparent hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
                      }`}
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      {toolsEnabled ? 'Tools ON' : 'Tools OFF'}
                    </button>
                  )}

                  {onToggleAutoApprove && toolsEnabled && (
                    <button
                      type="button"
                      onClick={onToggleAutoApprove}
                      disabled={disabled}
                      title={autoApprove ? "Auto-approve enabled — click to ask before risky tools" : "Ask before risky tools — click to auto-approve"}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        autoApprove
                          ? "bg-amber-50 dark:bg-amber-950/30 midnight:bg-amber-950/30 text-amber-700 dark:text-amber-300 midnight:text-amber-300 border border-amber-300 dark:border-amber-700"
                          : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-500 dark:text-gray-400 midnight:text-gray-400 border border-transparent hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {autoApprove ? 'Auto ON' : 'Ask'}
                    </button>
                  )}
                </div>

                <div className="shrink-0">
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={onStop}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 transition-all duration-200 hover:bg-red-100 active:scale-95 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50 midnight:bg-red-950/30 midnight:text-red-300"
                      title="Stop generating"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      Stop
                    </button>
                  ) : (
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
                  )}
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
