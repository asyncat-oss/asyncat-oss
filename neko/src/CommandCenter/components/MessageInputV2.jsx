// MessageInputV2.jsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Cloud, Cpu, HardDrive, Loader2, Send, Square, Wrench, X, Zap } from "lucide-react";
import { useLocalModelStatus } from "../hooks/useLocalModelStatus.js";
import { useModelConfig } from "../hooks/useModelConfig.js";
import { useActiveBrainStatus } from "../hooks/useActiveBrainStatus.js";
import { localModelsApi, llamaServerApi } from "../../Settings/settingApi.js";
import { profilesApi, filesApi } from "../commandCenterApi.js";
import { dirname, fileIconMeta } from "../../files/fileUtils.js";

function getAgentTrigger(value, cursor) {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)#([a-zA-Z0-9_-]*)$/);
  if (!match) return null;
  const start = beforeCursor.length - match[2].length - 1;
  return { start, end: cursor, query: match[2].toLowerCase() };
}

function getFileTrigger(value, cursor) {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([^\s]*)$/);
  if (!match) return null;
  const start = beforeCursor.length - match[2].length - 1;
  return { start, end: cursor, query: match[2] };
}

function extractAgentMentions(value, profiles) {
  const handles = new Set(
    [...String(value || '').matchAll(/(^|[\s(])#([a-zA-Z0-9_-]+)/g)]
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

function formatElapsed(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function splitFileQuery(query = "") {
  const trimmed = String(query || "").replace(/^\/+/, "");
  if (!trimmed) return { dirPath: ".", filter: "" };
  if (trimmed.endsWith("/")) return { dirPath: trimmed.replace(/\/+$/, "") || ".", filter: "" };
  if (!trimmed.includes("/")) return { dirPath: ".", filter: trimmed };
  return { dirPath: dirname(trimmed), filter: trimmed.split("/").pop() || "" };
}

function fileSubtitle(file) {
  if (!file?.path) return "";
  if (file.type === "dir") return file.path === "." ? "Folder" : file.path;
  const dir = dirname(file.path);
  return dir === "." ? file.ext?.toUpperCase() || "File" : dir;
}

function formatRootLabel(rootPath = "") {
  const parts = String(rootPath || "").split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return "Workspace";
  return parts.slice(-2).join("/");
}

const suggestionPanelClass =
  "absolute bottom-full left-0 right-0 z-30 mb-1 overflow-hidden rounded-lg border border-gray-200/80 bg-white/95 backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-800/95 midnight:border-slate-700/80 midnight:bg-gray-900/95";
const suggestionActiveClass = "bg-gray-100/80 dark:bg-gray-700/70 midnight:bg-slate-800/75";
const suggestionIdleClass = "hover:bg-gray-50/90 dark:hover:bg-gray-700/60 midnight:hover:bg-slate-800/65";

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
  contextError = false,
  onCompactContext,
  isCompacting = false,
  onDraftChange,
  onFileAttachmentsChange,
  prefillValue,
  toolsEnabled = true,
  onToggleTools,
  autoApprove = false,
  onToggleAutoApprove,
  isRunning = false,
  onStop,
  runStartedAt = null,
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
  const [dismissedTrigger, setDismissedTrigger] = useState(null);
  const [runElapsed, setRunElapsed] = useState(0);

  // File attachments state
  const [fileAttachments, setFileAttachments] = useState([]);
  const [fileSearchResults, setFileSearchResults] = useState([]);
  const [fileSearchLoading, setFileSearchLoading] = useState(false);
  const [fileSearchLoaded, setFileSearchLoaded] = useState(false);
  const [fileRoot, setFileRoot] = useState(null);
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  const localModel = useLocalModelStatus();
  const activeBrain = useActiveBrainStatus();
  const { config: modelContextConfig } = useModelConfig();
  const textareaRef = useRef(null);
  const toolbarRef = useRef(null);
  const rawAgentTrigger = useMemo(
    () => getAgentTrigger(value, cursorPosition),
    [value, cursorPosition],
  );
  const rawFileTrigger = useMemo(
    () => getFileTrigger(value, cursorPosition),
    [value, cursorPosition],
  );
  const agentTrigger = dismissedTrigger?.kind === "agent"
    && dismissedTrigger.value === value
    && dismissedTrigger.start === rawAgentTrigger?.start
    && dismissedTrigger.end === rawAgentTrigger?.end
    ? null
    : rawAgentTrigger;
  const fileTrigger = dismissedTrigger?.kind === "file"
    && dismissedTrigger.value === value
    && dismissedTrigger.start === rawFileTrigger?.start
    && dismissedTrigger.end === rawFileTrigger?.end
    ? null
    : rawFileTrigger;
  const agentSuggestions = useMemo(() => {
    if (!agentTrigger) return [];
    return agentProfiles
      .filter(profile => {
        const handle = String(profile.handle || '').toLowerCase();
        const name = String(profile.name || '').toLowerCase();
        return !agentTrigger.query || handle.includes(agentTrigger.query) || name.includes(agentTrigger.query);
      })
      .slice(0, 6);
  }, [agentProfiles, agentTrigger]);
  const detectedAgentMentions = useMemo(
    () => extractAgentMentions(value, agentProfiles),
    [agentProfiles, value],
  );

  const inputTokens = Math.ceil(value.length / 4);
  const totalTokens = conversationTokens + inputTokens;
  const ctxSize = localModel.ctxSize || modelContextConfig.ctx_size || (activeBrain.isLocal ? 8192 : 128000);
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
    if (!isRunning || !runStartedAt) { setRunElapsed(0); return; }
    setRunElapsed(Date.now() - runStartedAt);
    const id = setInterval(() => setRunElapsed(Date.now() - runStartedAt), 1000);
    return () => clearInterval(id);
  }, [isRunning, runStartedAt]);

  useEffect(() => {
    if (!textareaRef.current) return;
    if (autoFocus && !disabled) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [autoFocus, disabled]);

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

  useEffect(() => {
    let cancelled = false;
    filesApi
      .getRoots()
      .then((res) => {
        if (cancelled) return;
        const workspaceRoot = (res.roots || []).find(root => root.id === "workspace") || res.roots?.[0] || null;
        setFileRoot(workspaceRoot);
      })
      .catch(() => {
        if (!cancelled) setFileRoot(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // File search effect
  useEffect(() => {
    if (!fileTrigger) {
      setFileSearchResults([]);
      setFileSearchLoaded(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setFileSearchLoading(true);
        const query = fileTrigger.query;
        const { dirPath, filter } = splitFileQuery(query);
        let res;
        if (!query || query.includes("/")) {
          res = await filesApi.listDirectory("workspace", dirPath, false);
          const needle = filter.toLowerCase();
          res = {
            ...res,
            entries: (res.entries || []).filter((entry) => !needle || entry.name.toLowerCase().includes(needle)),
          };
        } else {
          res = await filesApi.search("workspace", ".", query, false, 160);
        }
        if (!cancelled) {
          setFileSearchResults((res.entries || []).slice(0, 24));
          setActiveFileIndex(0);
        }
      } catch {
        if (!cancelled) setFileSearchResults([]);
      } finally {
        if (!cancelled) {
          setFileSearchLoading(false);
          setFileSearchLoaded(true);
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fileTrigger]);

  useEffect(() => {
    setActiveAgentIndex(0);
  }, [agentTrigger?.query]);

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
    setDismissedTrigger(null);
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

  const insertAgentMention = useCallback((profile) => {
    if (!agentTrigger || !profile?.handle) return;
    const mention = `#${profile.handle}`;
    const nextValue = `${value.slice(0, agentTrigger.start)}${mention} ${value.slice(agentTrigger.end)}`;
    const nextCursor = agentTrigger.start + mention.length + 1;
    setValue(nextValue);
    onDraftChange?.(nextValue);
    setCursorPosition(nextCursor);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
    });
  }, [agentTrigger, onDraftChange, value]);

  const attachFile = useCallback((file) => {
    if (!fileTrigger) return;
    if (file?.type === "dir") {
      const nextMention = `@${file.path.replace(/\/?$/, "/")}`;
      const nextValue = `${value.slice(0, fileTrigger.start)}${nextMention}${value.slice(fileTrigger.end)}`;
      const nextCursor = fileTrigger.start + nextMention.length;
      setValue(nextValue);
      onDraftChange?.(nextValue);
      setCursorPosition(nextCursor);
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = nextCursor;
        textareaRef.current.selectionEnd = nextCursor;
      });
      return;
    }

    const nextValue = value.slice(0, fileTrigger.start) + value.slice(fileTrigger.end);
    setValue(nextValue);
    onDraftChange?.(nextValue);
    setCursorPosition(fileTrigger.start);
    setFileAttachments(prev => {
      if (prev.some(f => f.path === file.path)) return prev;
      const next = [...prev, { path: file.path, name: file.name, ext: file.ext }];
      onFileAttachmentsChange?.(next);
      return next;
    });
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = fileTrigger.start;
      textareaRef.current.selectionEnd = fileTrigger.start;
    });
  }, [fileTrigger, onDraftChange, value, onFileAttachmentsChange]);

  const removeFileAttachment = useCallback((path) => {
    setFileAttachments(prev => {
      const next = prev.filter(f => f.path !== path);
      onFileAttachmentsChange?.(next);
      return next;
    });
  }, [onFileAttachmentsChange]);

  const handleSubmit = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (!value.trim() || disabled) return;

      try {
        const messageToSend = {
          content: value.trim(),
          agentMentions: detectedAgentMentions,
          fileAttachments: fileAttachments.length > 0 ? fileAttachments : undefined,
        };

        await onSubmit(messageToSend, []);
        setValue("");
        setFileAttachments([]);
        onFileAttachmentsChange?.([]);
        onDraftChange?.("");
        setError(null);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (err) {
        console.error("Failed to submit message:", err);
        setError("Failed to send message. Please try again.");
      }
    },
    [value, disabled, onSubmit, detectedAgentMentions, fileAttachments, onDraftChange, onFileAttachmentsChange],
  );

  const handleKeyDown = useCallback(
    (e) => {
      const nativeIsComposing = Boolean(e.nativeEvent?.isComposing);

      if (e.key === "Escape") {
        if (agentTrigger || fileTrigger) {
          e.preventDefault();
          const trigger = agentTrigger || fileTrigger;
          setDismissedTrigger({
            kind: agentTrigger ? "agent" : "file",
            start: trigger.start,
            end: trigger.end,
            value,
          });
          requestAnimationFrame(() => textareaRef.current?.focus());
          return;
        }
      }

      if (agentSuggestions.length > 0 && agentTrigger && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        setActiveAgentIndex((current) => {
          const delta = e.key === "ArrowDown" ? 1 : -1;
          return (current + delta + agentSuggestions.length) % agentSuggestions.length;
        });
        return;
      }

      if (fileSearchResults.length > 0 && fileTrigger && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        setActiveFileIndex((current) => {
          const delta = e.key === "ArrowDown" ? 1 : -1;
          return (current + delta + fileSearchResults.length) % fileSearchResults.length;
        });
        return;
      }

      if (agentSuggestions.length > 0 && (e.key === "Tab" || e.key === "Enter")) {
        e.preventDefault();
        insertAgentMention(agentSuggestions[activeAgentIndex] || agentSuggestions[0]);
        return;
      }

      if (fileSearchResults.length > 0 && (e.key === "Tab" || e.key === "Enter")) {
        e.preventDefault();
        attachFile(fileSearchResults[activeFileIndex] || fileSearchResults[0]);
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
    [handleSubmit, insertAgentMention, attachFile, isComposing, agentSuggestions, fileSearchResults, agentTrigger, fileTrigger, activeAgentIndex, activeFileIndex, value],
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
        {contextInfo && contextPercent > 90 && (
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
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onClick={handleCursorChange}
                  onKeyUp={handleCursorChange}
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
                  className="w-full resize-none bg-transparent text-gray-900 caret-gray-900 placeholder-gray-400 focus:outline-none text-base leading-relaxed min-h-12 max-h-45 disabled:opacity-50 dark:text-gray-100 dark:caret-gray-100 dark:placeholder-gray-500 midnight:text-gray-100 midnight:caret-gray-100 midnight:placeholder-gray-500"
                />

                {agentTrigger && (
                  <div className={suggestionPanelClass}>
                    {agentSuggestions.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto p-1">
                        {agentSuggestions.map((profile, index) => (
                          <button
                            key={profile.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertAgentMention(profile)}
                            className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                              index === activeAgentIndex
                                ? suggestionActiveClass
                                : suggestionIdleClass
                            }`}
                          >
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm dark:bg-gray-800 midnight:bg-slate-800">
                              {profile.icon || "🤖"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100 midnight:text-slate-100">
                                {profile.name}
                              </span>
                              <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                                #{profile.handle}{profile.description ? ` · ${profile.description}` : ''}
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

                {fileTrigger && (
                  <div className={suggestionPanelClass}>
                    {fileSearchLoading ? (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Searching files...
                      </div>
                    ) : fileSearchResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto p-1">
                        {fileSearchResults.map((file, index) => {
                          const { Icon, color } = fileIconMeta(file.ext, file.type);
                          return (
                            <button
                              key={file.path}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => attachFile(file)}
                              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                                index === activeFileIndex
                                  ? suggestionActiveClass
                                  : suggestionIdleClass
                              }`}
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100/80 dark:bg-gray-700/80 midnight:bg-slate-800/80">
                                <Icon className={`h-4 w-4 ${color}`} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-baseline gap-2">
                                  <span className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100 midnight:text-slate-100">
                                    {file.name}
                                  </span>
                                  {file.type === "dir" && (
                                    <span className="shrink-0 text-[10px] font-medium text-amber-500">folder</span>
                                  )}
                                </span>
                                <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                                  {fileSubtitle(file)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                        {fileSearchLoaded ? 'No matching files' : 'Searching files...'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {fileAttachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {fileAttachments.map(file => {
                    const { Icon, color } = fileIconMeta(file.ext, "file");
                    return (
                      <span
                        key={file.path}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 midnight:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                      >
                        <Icon className={`h-3.5 w-3.5 ${color}`} />
                        <span className="truncate max-w-[12rem]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFileAttachment(file.path)}
                          className="ml-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {(localModel.isReady || activeBrain.isReady || contextInfo) && (
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                  <span className="min-w-0 truncate text-gray-400 dark:text-gray-500">
                    {contextLoading ? 'Checking context...' : contextError ? (
                      <span className="text-amber-500 dark:text-amber-400">Context unavailable</span>
                    ) : (
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
                    <div className="inline-flex items-center gap-2">
                      {runElapsed > 0 && (
                        <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                          {formatElapsed(runElapsed)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={onStop}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 transition-all duration-200 hover:bg-red-100 active:scale-95 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50 midnight:bg-red-950/30 midnight:text-red-300"
                        title="Stop generating"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                        Stop
                      </button>
                    </div>
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

        {fileRoot?.path && (
          <div className="mt-2 flex justify-center">
            <div
              title={`@ file search is scoped to ${fileRoot.path}`}
              className="inline-flex max-w-full items-center gap-1.5 px-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 midnight:text-slate-500"
            >
              <HardDrive className="h-3 w-3 shrink-0" />
              <span className="shrink-0">@ files search</span>
              <span className="min-w-0 truncate">{formatRootLabel(fileRoot.path)}</span>
            </div>
          </div>
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
