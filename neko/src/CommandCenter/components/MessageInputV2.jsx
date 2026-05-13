// MessageInputV2.jsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Brain, Check, ChevronDown, ClipboardPen, Cloud, Cpu, FolderOpen, HardDrive, Headphones, Loader2, Send, Square, Wrench, X, Zap, Mic } from "lucide-react";
import { useLocalModelStatus } from "../hooks/useLocalModelStatus.js";
import { useModelConfig } from "../hooks/useModelConfig.js";
import { useActiveBrainStatus } from "../hooks/useActiveBrainStatus.js";
import { localModelsApi, llamaServerApi, audioApi } from "../../Settings/settingApi.js";
import { profilesApi, filesApi } from "../api";
import { dirname, basename, fileIconMeta, rootIcon } from "../../files/fileUtils.js";

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

function formatRootLabel(rootPath = "") {
  const parts = String(rootPath || "").split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return "Workspace";
  return parts.slice(-2).join("/");
}

function joinRelativePath(parent = ".", child = "") {
  const cleanChild = String(child || "").replace(/^\/+/, "");
  if (!cleanChild) return parent || ".";
  if (!parent || parent === ".") return cleanChild;
  return `${String(parent).replace(/\/+$/, "")}/${cleanChild}`;
}

function absoluteFromRoot(rootPath = "", relativePath = ".") {
  if (!rootPath) return "";
  if (!relativePath || relativePath === ".") return rootPath;
  return `${String(rootPath).replace(/[\\/]+$/, "")}/${String(relativePath).replace(/^\/+/, "")}`;
}

function labelForWorkingContext(context, root) {
  if (context?.relativePath && context.relativePath !== ".") return basename(context.relativePath);
  if (root?.path) return formatRootLabel(root.path);
  return "Workspace";
}

function relativeToContext(entryPath, contextPath = ".") {
  if (!contextPath || contextPath === ".") return entryPath;
  const prefix = `${contextPath.replace(/\/+$/, "")}/`;
  return String(entryPath || "").startsWith(prefix)
    ? String(entryPath).slice(prefix.length)
    : entryPath;
}

const suggestionPanelClass =
  "absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-[#2a2a2a] dark:bg-[#1a1a1a] midnight:border-[#2a2a2a] midnight:bg-[#1a1a1a]";
const suggestionActiveClass = "bg-gray-100 dark:bg-[#2a2a2a] midnight:bg-[#2a2a2a]";
const suggestionIdleClass = "hover:bg-gray-50 dark:hover:bg-[#242424] midnight:hover:bg-[#242424]";

function RecordingWaveform() {
  const bars = [
    { height: "0.55rem", delay: "0ms", duration: "720ms" },
    { height: "0.95rem", delay: "90ms", duration: "640ms" },
    { height: "1.25rem", delay: "180ms", duration: "760ms" },
    { height: "0.8rem", delay: "270ms", duration: "680ms" },
    { height: "1.1rem", delay: "360ms", duration: "800ms" },
  ];

  return (
    <span className="inline-flex h-5 items-center gap-0.5" aria-hidden="true">
      {bars.map((bar, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-current"
          style={{
            height: bar.height,
            animation: `asyncat-recording-wave ${bar.duration} ease-in-out ${bar.delay} infinite`,
            transformOrigin: "center",
          }}
        />
      ))}
    </span>
  );
}

export const MessageInputV2 = ({
  onSubmit,
  disabled,
  autoFocus,
  placeholder = "Ask anything...",
  maxLength = 50000,
  hasMessages = false,
  prefillValue,
  toolsEnabled = true,
  onToggleTools,
  agentMode = toolsEnabled ? 'action' : 'plan',
  onToggleAgentMode,
  autoApprove = false,
  onToggleAutoApprove,
  isRunning = false,
  onStop,
  runStartedAt = null,
  externalFileAttachment = null,
  workingContext = null,
  onWorkingContextChange,
  reasoningEffort = "auto",
  onReasoningEffortChange,
  tokenUsage = null,
  sttReady = false,
  ttsReady = false,
  voiceMode = false,
  onToggleVoiceMode,
  autoRecordPrompt = false,
  voiceTtsState = 'idle',
}) => {
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
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
  const voiceCapabilityMode = sttReady && ttsReady ? 'full' : sttReady ? 'stt' : ttsReady ? 'tts' : 'none';
  const voiceConversationAvailable = voiceCapabilityMode === 'full';
  const voiceConversationActive = voiceMode && voiceConversationAvailable;
  // File attachments state
  const [fileAttachments, setFileAttachments] = useState([]);
  const [fileSearchResults, setFileSearchResults] = useState([]);
  const [fileSearchLoading, setFileSearchLoading] = useState(false);
  const [fileSearchLoaded, setFileSearchLoaded] = useState(false);
  const [fileRoot, setFileRoot] = useState(null);
  const [fileRoots, setFileRoots] = useState([]);
  const [contextBrowseRootId, setContextBrowseRootId] = useState("workspace");
  const [contextBrowsePath, setContextBrowsePath] = useState(".");
  const [contextBrowseEntries, setContextBrowseEntries] = useState([]);
  const [contextBrowseLoading, setContextBrowseLoading] = useState(false);
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
  const activeRoot = useMemo(() => {
    const rootId = workingContext?.rootId || "workspace";
    return fileRoots.find(root => root.id === rootId) || fileRoot || fileRoots[0] || null;
  }, [fileRoot, fileRoots, workingContext?.rootId]);
  const activeWorkingContext = useMemo(() => {
    if (!activeRoot) return null;
    const relativePath = workingContext?.relativePath || ".";
    return {
      rootId: activeRoot.id,
      rootLabel: activeRoot.label,
      rootKind: activeRoot.kind,
      rootPath: activeRoot.path,
      relativePath,
      workingDir: workingContext?.workingDir || absoluteFromRoot(activeRoot.path, relativePath),
    };
  }, [activeRoot, workingContext?.relativePath, workingContext?.workingDir]);
  const activeContextLabel = labelForWorkingContext(activeWorkingContext, activeRoot);
  const contextBrowseRoot = useMemo(
    () => fileRoots.find(root => root.id === contextBrowseRootId) || activeRoot,
    [activeRoot, contextBrowseRootId, fileRoots],
  );
  const contextBrowseWorkingDir = useMemo(
    () => contextBrowseRoot ? absoluteFromRoot(contextBrowseRoot.path, contextBrowsePath || ".") : "",
    [contextBrowsePath, contextBrowseRoot],
  );
  const contextBrowseLabel = contextBrowsePath === "."
    ? (contextBrowseRoot?.label || "Root")
    : basename(contextBrowsePath);
  
  const supportsReasoningControl = activeBrain.supportsReasoning && activeBrain.capabilities?.reasoningType === 'effort_string';
  const currentReasoningOptions = useMemo(() => {
    if (!supportsReasoningControl) return [];
    const tiers = activeBrain.capabilities?.reasoningTiers || ["low", "medium", "high"];
    const baseOptions = [
      { value: "auto", label: "Auto", short: "Think auto", description: "Let the provider choose." }
    ];
    const tierMap = {
      minimal: { value: "minimal", label: "Minimal", short: "Think min", description: "Fastest reasoning." },
      low: { value: "low", label: "Low", short: "Think low", description: "Faster, lighter reasoning." },
      medium: { value: "medium", label: "Medium", short: "Think med", description: "Balanced reasoning." },
      high: { value: "high", label: "High", short: "Think high", description: "More careful reasoning." },
      xhigh: { value: "xhigh", label: "Extra high", short: "Think xhigh", description: "Maximum effort where supported." },
    };
    for (const t of tiers) {
      if (tierMap[t]) baseOptions.push(tierMap[t]);
    }
    return baseOptions;
  }, [activeBrain.capabilities, supportsReasoningControl]);

  const ctxSize = localModel.ctxSize || modelContextConfig.ctx_size || (activeBrain.isLocal ? 8192 : 128000);
  const localModelSendBlockReason = useMemo(() => {
    if (!activeBrain.isBuiltin) return null;
    if (activeBrain.loading) return "Checking model status...";
    if (activeBrain.isLoadingModel) {
      return activeBrain.model
        ? `Model ${activeBrain.model} is still loading.`
        : "Model is still loading.";
    }
    if (activeBrain.isReady) return null;
    if (activeBrain.status === "error") return "Model failed to load. Choose another model or provider before sending.";
    return "Choose a model or provider before sending a message.";
  }, [
    activeBrain.isBuiltin,
    activeBrain.loading,
    activeBrain.isLoadingModel,
    activeBrain.isReady,
    activeBrain.status,
    activeBrain.model,
  ]);

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
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [prefillValue]);

  useEffect(() => {
    if (!externalFileAttachment?.path) return;
    setFileAttachments(prev => {
      const rootId = externalFileAttachment.rootId || activeWorkingContext?.rootId || "workspace";
      if (prev.some(file => file.path === externalFileAttachment.path && (file.rootId || "workspace") === rootId)) return prev;
      return [...prev, {
        rootId,
        path: externalFileAttachment.path,
        name: externalFileAttachment.name || basename(externalFileAttachment.path),
        ext: externalFileAttachment.ext || basename(externalFileAttachment.path).split('.').pop(),
      }];
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [externalFileAttachment?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setFileRoots(res.roots || []);
        setFileRoot(workspaceRoot);
        setContextBrowseRootId(workspaceRoot?.id || "workspace");
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
        const rootId = activeWorkingContext?.rootId || "workspace";
        const basePath = activeWorkingContext?.relativePath || ".";
        let res;
        if (!query || query.includes("/")) {
          res = await filesApi.listDirectory(rootId, joinRelativePath(basePath, dirPath), false);
          const needle = filter.toLowerCase();
          res = {
            ...res,
            entries: (res.entries || []).filter((entry) => !needle || entry.name.toLowerCase().includes(needle)),
          };
        } else {
          res = await filesApi.search(rootId, basePath, query, false, 160);
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
  }, [activeWorkingContext?.relativePath, activeWorkingContext?.rootId, fileTrigger]);

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
    setCursorPosition(e.target.selectionStart || newValue.length);

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

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
    setCursorPosition(nextCursor);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
    });
  }, [agentTrigger, value]);

  const attachFile = useCallback((file) => {
    if (!fileTrigger) return;
    if (file?.type === "dir") {
      const scopedPath = relativeToContext(file.path, activeWorkingContext?.relativePath || ".");
      const nextMention = `@${scopedPath.replace(/\/?$/, "/")}`;
      const nextValue = `${value.slice(0, fileTrigger.start)}${nextMention}${value.slice(fileTrigger.end)}`;
      const nextCursor = fileTrigger.start + nextMention.length;
      setValue(nextValue);
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
    setCursorPosition(fileTrigger.start);
    setFileAttachments(prev => {
      const rootId = activeWorkingContext?.rootId || "workspace";
      if (prev.some(f => f.path === file.path && (f.rootId || "workspace") === rootId)) return prev;
      return [...prev, { rootId, path: file.path, name: file.name, ext: file.ext }];
    });
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = fileTrigger.start;
      textareaRef.current.selectionEnd = fileTrigger.start;
    });
  }, [activeWorkingContext?.relativePath, activeWorkingContext?.rootId, fileTrigger, value]);

  const removeFileAttachment = useCallback((path, rootId = "workspace") => {
    setFileAttachments(prev => prev.filter(f => !(f.path === path && (f.rootId || "workspace") === rootId)));
  }, []);

  const handleSubmit = useCallback(
    async (e, overrideText = null) => {
      if (e) e.preventDefault();
      const textToSend = overrideText || value;
      if (!textToSend?.trim() || disabled) return;
      if (localModelSendBlockReason) {
        return;
      }

      try {
        const messageToSend = {
          content: textToSend.trim(),
          agentMentions: detectedAgentMentions,
          fileAttachments: fileAttachments.length > 0 ? fileAttachments : undefined,
          reasoningEffort: activeBrain.supportsReasoning ? reasoningEffort : "auto",
        };

        await onSubmit(messageToSend, []);
        setValue("");
        setFileAttachments([]);
        setError(null);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (err) {
        console.error("Failed to submit message:", err);
        setError("Failed to send message. Please try again.");
      }
    },
    [value, disabled, localModelSendBlockReason, onSubmit, detectedAgentMentions, fileAttachments, activeBrain.supportsReasoning, reasoningEffort],
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

  const canSubmit = value.trim() && !disabled && !isRunning && !localModelSendBlockReason;
  const isActionMode = agentMode === 'action';
  const BrainIcon = activeBrain.isLocal ? Cpu : Cloud;
  const currentReasoningOption = currentReasoningOptions.find(option => option.value === reasoningEffort) || currentReasoningOptions[0] || { label: "Auto", short: "Think auto" };
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

  const openWorkingContextMenu = useCallback(() => {
    setOpenMenu((current) => {
      const next = current === "context" ? null : "context";
      if (next === "context") {
        setContextBrowseRootId(activeWorkingContext?.rootId || "workspace");
        setContextBrowsePath(activeWorkingContext?.relativePath || ".");
      }
      return next;
    });
  }, [activeWorkingContext?.relativePath, activeWorkingContext?.rootId]);

  const selectWorkingContext = useCallback((rootId, relativePath = ".") => {
    const root = fileRoots.find(item => item.id === rootId) || activeRoot;
    if (!root || !onWorkingContextChange) return;
    const nextContext = {
      rootId: root.id,
      rootLabel: root.label,
      rootKind: root.kind,
      rootPath: root.path,
      relativePath: relativePath || ".",
      workingDir: absoluteFromRoot(root.path, relativePath || "."),
    };
    onWorkingContextChange(nextContext);
    setOpenMenu(null);
  }, [activeRoot, fileRoots, onWorkingContextChange]);

  useEffect(() => {
    if (openMenu !== "context") return;
    let cancelled = false;
    setContextBrowseLoading(true);
    filesApi
      .listDirectory(contextBrowseRootId, contextBrowsePath || ".", false, { limit: 240 })
      .then((res) => {
        if (cancelled) return;
        setContextBrowseEntries((res.entries || []).filter(entry => entry.type === "dir"));
      })
      .catch(() => {
        if (!cancelled) setContextBrowseEntries([]);
      })
      .finally(() => {
        if (!cancelled) setContextBrowseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contextBrowsePath, contextBrowseRootId, openMenu]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setIsRecording(false);
        clearInterval(recordingTimerRef.current);
        setRecordingDuration(0);
        try {
          const res = await audioApi.whisper.transcribe(audioBlob);
          if (res.text) {
            const transcribed = res.text.trim();
            setValue(prev => {
              const base = prev.trim();
              return base ? `${base} ${transcribed}` : transcribed;
            });
            // Voice Mode: auto-submit after a brief delay so the user sees what was transcribed
            if (voiceConversationActive && transcribed) {
              setTimeout(() => {
                handleSubmit(null, transcribed);
              }, 400);
            }
          }
        } catch (err) {
          setError('Failed to transcribe audio: ' + err.message);
        }
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      
      let startMs = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - startMs);
      }, 1000);
    } catch (err) {
      setError('Could not access microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const getBorderColor = () => {
    return "border-gray-200 dark:border-gray-800 midnight:border-gray-800 focus-within:border-gray-300 dark:focus-within:border-gray-700";
  };

  return (
    <div className="bg-transparent">
      <style>{`
        @keyframes asyncat-recording-wave {
          0%, 100% { transform: scaleY(0.45); opacity: 0.55; }
          35% { transform: scaleY(1); opacity: 1; }
          65% { transform: scaleY(0.7); opacity: 0.78; }
        }
      `}</style>
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-3">
        <form onSubmit={handleSubmit}>
            <div
              className={`p-4 bg-transparent border rounded-xl transition-colors ${getBorderColor()}`}
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

              {localModelSendBlockReason && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200 midnight:border-amber-900/50 midnight:bg-amber-900/20 midnight:text-amber-200">
                  <div className="flex min-w-0 items-center gap-2">
                    {activeBrain.isLoadingModel || activeBrain.loading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Cpu className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{localModelSendBlockReason}</span>
                  </div>
                  {!activeBrain.loading && !activeBrain.isLoadingModel && (
                    <button
                      type="button"
                      onClick={() => setOpenMenu("model")}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/30 midnight:hover:bg-amber-900/30"
                    >
                      Models
                    </button>
                  )}
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
                            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                              index === activeAgentIndex
                                ? suggestionActiveClass
                                : suggestionIdleClass
                            }`}
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm dark:bg-[#2a2a2a] midnight:bg-[#2a2a2a]">
                              {profile.icon || "🤖"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-gray-800 dark:text-gray-100 midnight:text-gray-100">
                                {profile.name}
                              </span>
                              <span className="block truncate text-[11px] text-gray-400 dark:text-[#666666] midnight:text-[#666666]">
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
                              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                                index === activeFileIndex
                                  ? suggestionActiveClass
                                  : suggestionIdleClass
                              }`}
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                                <Icon className={`h-5 w-5 ${color}`} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-baseline gap-2">
                                  <span className="truncate text-[13px] font-medium text-gray-800 dark:text-gray-100 midnight:text-gray-100">
                                    {file.path === '.' || file.type === 'dir' ? file.name : (
                                      <>
                                        {dirname(file.path) !== '.' && (
                                          <span className="text-gray-400 dark:text-[#666666] font-normal">{dirname(file.path)}/</span>
                                        )}
                                        <span className="text-gray-900 dark:text-gray-100">{basename(file.path)}</span>
                                      </>
                                    )}
                                  </span>
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
                        key={`${file.rootId || "workspace"}:${file.path}`}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 midnight:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                      >
                        <Icon className={`h-3.5 w-3.5 ${color}`} />
                        <span className="truncate max-w-[12rem]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFileAttachment(file.path, file.rootId || "workspace")}
                          className="ml-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div ref={toolbarRef} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {activeWorkingContext && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={openWorkingContextMenu}
                        disabled={disabled || !onWorkingContextChange}
                        title={`Agent working directory: ${activeWorkingContext.workingDir}`}
                        className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-gray-500 transition-all duration-200 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-100 midnight:hover:bg-slate-800"
                      >
                        {(() => {
                          const RootIcon = rootIcon(activeRoot?.kind);
                          return <RootIcon className="h-3.5 w-3.5 shrink-0" />;
                        })()}
                        <span className="hidden shrink-0 text-gray-400 dark:text-gray-500 sm:inline">Working in</span>
                        <span className="min-w-0 truncate font-medium">{activeContextLabel}</span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
                      </button>

	                      {openMenu === "context" && (
	                        <div className="absolute left-0 bottom-full z-30 mb-1.5 w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
	                          <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800 midnight:border-slate-800">
	                            <div className="flex items-start justify-between gap-3">
	                              <div className="min-w-0">
	                                <div className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">
	                                  {contextBrowseWorkingDir}
	                                </div>
	                                <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
	                                  Browsing folders. The selected folder becomes the agent workspace.
	                                </div>
	                              </div>
	                              <button
	                                type="button"
	                                onClick={() => selectWorkingContext(contextBrowseRootId, contextBrowsePath)}
	                                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
	                                title={`Use ${contextBrowseWorkingDir} as the working directory`}
	                              >
	                                <Check className="h-3.5 w-3.5" />
	                                Use this folder
	                              </button>
	                            </div>
	                          </div>

                          <div className="grid grid-cols-[8rem_1fr] divide-x divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
                            <div className="max-h-72 overflow-y-auto p-1">
                              {fileRoots.map((root) => {
                                const RootIcon = rootIcon(root.kind);
                                const active = root.id === contextBrowseRootId;
                                return (
                                  <button
                                    key={root.id}
                                    type="button"
                                    onClick={() => {
                                      setContextBrowseRootId(root.id);
                                      setContextBrowsePath(".");
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                      active
                                        ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800"
                                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 midnight:hover:bg-slate-800"
                                    }`}
                                  >
                                    <RootIcon className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{root.label}</span>
                                  </button>
                                );
                              })}
                            </div>

	                            <div className="min-w-0">
	                              <div className="flex items-center gap-1 border-b border-gray-100 p-1 dark:border-gray-800 midnight:border-slate-800">
	                                <div className="min-w-0 flex-1 px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
	                                  <span className="block truncate">{contextBrowseLabel}</span>
	                                </div>
	                                {contextBrowsePath !== "." && (
	                                  <button
	                                    type="button"
                                    onClick={() => setContextBrowsePath(dirname(contextBrowsePath))}
                                    className="rounded-md px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                  >
                                    Up
                                  </button>
                                )}
                              </div>
                              <div className="max-h-60 overflow-y-auto p-1">
                                {contextBrowseLoading ? (
                                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-gray-400 dark:text-gray-500">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Loading folders...
                                  </div>
                                ) : contextBrowseEntries.length > 0 ? (
                                  contextBrowseEntries.map((entry) => (
                                    <button
                                      key={entry.path}
                                      type="button"
                                      onClick={() => setContextBrowsePath(entry.path)}
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:hover:bg-slate-800"
                                    >
                                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                      <span className="truncate">{entry.name}</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-2 py-2 text-xs text-gray-400 dark:text-gray-500">
                                    No folders here.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
                      disabled={disabled || activeBrain.loading || isSwitchingModel}
                      title={`${activeBrain.label}${activeBrain.supportsTools ? " · native tools enabled" : ""}`}
                      className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs transition-all duration-200 ${
                        activeBrain.isLoadingModel
                          ? "text-amber-500 dark:text-amber-400"
                          : activeBrain.isReady
                            ? activeBrain.isLocal
                              ? "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                              : "text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                            : "text-gray-400 dark:text-gray-500"
                      } disabled:cursor-not-allowed`}
                    >
                      {activeBrain.isLoadingModel || activeBrain.loading || isSwitchingModel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <BrainIcon className="w-3.5 h-3.5" />
                      )}
                      <span className="truncate max-w-[8rem] sm:max-w-[10rem]">{modelLabel}</span>
                      <ChevronDown className="w-3 h-3 opacity-40" />
                    </button>
                    {openMenu === "model" && (
                      <div className="absolute left-0 bottom-full z-30 mb-1.5 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
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

                  {onReasoningEffortChange && supportsReasoningControl && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenu((current) => (current === "reasoning" ? null : "reasoning"))}
                        disabled={disabled}
                        title={`Reasoning effort: ${currentReasoningOption.label}`}
                        className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs transition-all duration-200 ${
                          reasoningEffort === "auto"
                            ? "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                            : "text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                        }`}
                      >
                        <Brain className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{currentReasoningOption.short}</span>
                        <ChevronDown className="w-3 h-3 opacity-40" />
                      </button>
                      {openMenu === "reasoning" && (
                        <div className="absolute left-0 bottom-full z-30 mb-1.5 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900">
                          <div className="p-1">
                            {currentReasoningOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  onReasoningEffortChange(option.value);
                                  setOpenMenu(null);
                                }}
                                className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                                  option.value === reasoningEffort
                                    ? "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:hover:bg-slate-800"
                                }`}
                              >
                                <span className="block font-medium">{option.label}</span>
                                <span className="block text-[11px] text-gray-400 dark:text-gray-500">{option.description}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {(onToggleAgentMode || onToggleTools) && (
                    <button
                      type="button"
                      onClick={onToggleAgentMode || onToggleTools}
                      disabled={disabled}
                      title={isActionMode ? "Action mode — can execute approved changes" : "Plan mode — safe inspection and answers only"}
                      className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs transition-all duration-200 ${
                        isActionMode
                          ? "text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                      }`}
                    >
                      {isActionMode ? <Wrench className="w-3.5 h-3.5" /> : <ClipboardPen className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{isActionMode ? 'Action' : 'Plan'}</span>
                    </button>
                  )}

                  {onToggleAutoApprove && isActionMode && (
                    <button
                      type="button"
                      onClick={onToggleAutoApprove}
                      disabled={disabled}
                      title={autoApprove ? "Auto-approve enabled — click to ask before risky tools" : "Ask before risky tools — click to auto-approve"}
                      className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs transition-all duration-200 ${
                        autoApprove
                          ? "text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                          : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{autoApprove ? 'Auto' : 'Ask'}</span>
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-2 dark:border-gray-800 midnight:border-slate-800 sm:flex-nowrap sm:border-t-0 sm:pt-0">
                  {voiceConversationAvailable && onToggleVoiceMode && (
                    <button
                      type="button"
                      onClick={onToggleVoiceMode}
                      disabled={disabled}
                      title={voiceConversationActive ? "Voice mode ON - click to disable" : "Voice mode - hands-free conversation"}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-all duration-200 ${
                        voiceConversationActive
                          ? "bg-violet-50 text-violet-600 ring-1 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-800"
                          : "text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800/60 dark:hover:text-gray-300"
                      }`}
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Voice</span>
                    </button>
                  )}

                  {sttReady && (
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={disabled && !isRecording}
                      title={isRecording ? "Stop recording" : voiceConversationActive ? "Voice conversation - click to speak" : "Record voice input"}
                      className={`inline-flex h-8 min-w-8 items-center justify-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-all duration-200 ${
                        isRecording
                          ? "bg-red-50 text-red-500 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800/70 midnight:bg-red-900/20"
                          : autoRecordPrompt
                            ? "animate-bounce bg-violet-100 text-violet-600 ring-2 ring-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-700"
                            : voiceConversationActive
                              ? "bg-violet-50 text-violet-500 ring-1 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-800"
                              : "text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800/60 dark:hover:text-gray-300"
                      }`}
                    >
                      {isRecording ? (
                        <>
                          <RecordingWaveform />
                          <span className="tabular-nums">{formatElapsed(recordingDuration)}</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          {autoRecordPrompt && <span className="hidden sm:inline">Speak</span>}
                        </>
                      )}
                    </button>
                  )}

                {isRunning ? (
                  <div className="inline-flex items-center gap-1.5">
                    {runElapsed > 0 && (
                      <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                        {formatElapsed(runElapsed)}
                      </span>
                    )}
                    {tokenUsage?.totalTokens > 0 && (
                      <>
                        <span className="text-[10px] text-gray-300 dark:text-gray-700">·</span>
                        <span className={`text-[10px] tabular-nums ${
                          tokenUsage.totalTokens > (tokenUsage.contextWindow || 128000) * 0.9
                            ? 'text-red-400'
                            : tokenUsage.totalTokens > (tokenUsage.contextWindow || 128000) * 0.7
                            ? 'text-amber-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {tokenUsage.estimated ? '~' : ''}{(tokenUsage.totalTokens / 1000).toFixed(1)}k
                        </span>
                        {tokenUsage.tokensPerSecond > 0 && (
                          <>
                            <span className="text-[10px] text-gray-300 dark:text-gray-700">·</span>
                            <span className="text-[10px] tabular-nums text-indigo-400 dark:text-indigo-500">
                              {tokenUsage.tokensPerSecond} tok/s
                            </span>
                          </>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={onStop}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-red-500 transition-all duration-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                      title="Stop generating"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span className="hidden sm:inline">Stop</span>
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    {tokenUsage?.totalTokens > 0 && (
                      <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500" title={`${tokenUsage.estimated ? 'Estimated ' : ''}${(tokenUsage.inputTokens / 1000).toFixed(1)}k in + ${(tokenUsage.outputTokens / 1000).toFixed(1)}k out · Context: ${(tokenUsage.contextWindow / 1000).toFixed(0)}k (${tokenUsage.contextWindowSource || 'unknown'})`}>
                        {tokenUsage.estimated ? '~' : ''}{(tokenUsage.totalTokens / 1000).toFixed(1)}k tokens
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${
                        canSubmit
                          ? "text-gray-500 hover:bg-gray-50 hover:text-gray-800 active:scale-95 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-100"
                          : "text-gray-300 dark:text-gray-600 midnight:text-gray-600 cursor-not-allowed"
                      }`}
                      title={localModelSendBlockReason || (canSubmit ? "Send (Enter)" : "Type a message")}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          </form>

        {activeWorkingContext?.workingDir && (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={openWorkingContextMenu}
              disabled={disabled || !onWorkingContextChange}
              title={`@ file search and agent tools are scoped to ${activeWorkingContext.workingDir}`}
              className="inline-flex max-w-full items-center gap-1.5 px-1 text-[10px] font-medium text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-default disabled:hover:text-gray-400 dark:text-gray-500 dark:hover:text-gray-300 midnight:text-slate-500"
            >
              <HardDrive className="h-3 w-3 shrink-0" />
              <span className="shrink-0">@ files search</span>
              <span className="min-w-0 truncate">{activeContextLabel}</span>
            </button>
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
