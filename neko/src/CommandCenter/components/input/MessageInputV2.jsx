// MessageInputV2.jsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Bell, Bookmark, ChevronDown, ClipboardPen, Cloud, Cpu, Headphones, Loader2, Mail, MessageCircle, Mic, Paperclip, Rss, Send, ShieldAlert, ShieldOff, Square, Wrench, X, Zap, Plus, Check, Folder } from "lucide-react";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { WorkingContextModal } from "../modals/WorkingContextModal.jsx";
import { useLocalModelStatus } from "../../hooks/useLocalModelStatus.js";
import { useModelConfig } from "../../hooks/useModelConfig.js";
import { useActiveBrainStatus } from "../../hooks/useActiveBrainStatus.js";
import { localModelsApi, llamaServerApi, audioApi, aiProviderApi } from "../../../Settings/settingApi.js";
import { profilesApi, filesApi } from "../../api";
import { dirname, basename, fileIconMeta, rootIcon } from "../../../files/fileUtils.js";
import { AttachmentChip, ImageLightbox } from "../shared/AttachmentComponents.jsx";

const ToggleSwitch = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked
          ? "bg-indigo-600 dark:bg-indigo-500"
          : "bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
};



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
  if (parts.length === 0) return "Projects";
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

function safeAttachmentName(name = "attachment") {
  const cleaned = String(name || "attachment")
    .replace(/[\\/]+/g, "-")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned || "attachment";
}

function isPromptTextFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  const ext = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
  return mime.startsWith("text/")
    || ["json", "csv", "tsv", "md", "txt", "log", "js", "jsx", "ts", "tsx", "py", "html", "css", "xml", "yaml", "yml", "toml", "sql"].includes(ext);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function createPromptOnlyAttachment(file) {
  const ext = file.name.split(".").pop() || "";
  const base = {
    id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rootId: "none",
    path: `prompt://${file.name}`,
    name: file.name,
    ext,
    mime: file.type || "",
    size: file.size,
    promptOnly: true,
  };

  if (isPromptTextFile(file) && file.size <= 512 * 1024) {
    return { ...base, content: await file.text() };
  }

  if (String(file.type || "").startsWith("image/") && file.size <= 6 * 1024 * 1024) {
    return { ...base, dataUrl: await readAsDataUrl(file) };
  }

  return base;
}

function labelForWorkingContext(context, root) {
  if (context?.relativePath && context.relativePath !== ".") return basename(context.relativePath);
  if (root?.path) return formatRootLabel(root.path);
  return "Projects";
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

const INTEGRATION_TOOL_PACKS = [
  {
    id: "rss",
    label: "RSS",
    description: "Feeds and latest items",
    icon: Rss,
    tools: ["rss_status", "rss_list_feeds", "rss_add_feed", "rss_latest_items"],
  },
  {
    id: "read_later",
    label: "Read later",
    description: "Saved links",
    icon: Bookmark,
    tools: ["read_later_add", "read_later_list"],
  },
  {
    id: "mail",
    label: "Mail",
    description: "Inbox headers and send",
    icon: Mail,
    tools: ["mail_status", "mail_list_messages", "mail_send_message"],
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Ping external channels",
    icon: Bell,
    tools: ["notification_status", "notify_channel"],
  },
];

function TokenBar({ usage }) {
  const ctx = usage.contextWindow || 128000;
  const contextTokens = usage.currentContextTokens || usage.lastInputTokens || usage.inputTokens || 0;
  const totalTokens = usage.cumulativeTotalTokens || usage.totalTokens || usage.lastTotalTokens || 0;
  const pct = Math.min((contextTokens / ctx) * 100, 100);
  const color = pct >= 90 ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : pct >= 70 ? 'bg-yellow-300' : 'bg-emerald-400';
  const textColor = pct >= 90 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : 'text-gray-400 dark:text-gray-500 midnight:text-slate-500';
  const label = `${usage.estimated ? '~' : ''}${(contextTokens / 1000).toFixed(1)}k`;
  const tooltip = `${usage.estimated ? 'Estimated — ' : ''}${(contextTokens / 1000).toFixed(1)}k current context · ${(totalTokens / 1000).toFixed(1)}k total used · ${pct.toFixed(0)}% of ${(ctx / 1000).toFixed(0)}k context (${usage.contextWindowSource || 'unknown'})`;

  return (
    <span className="inline-flex items-center gap-1" title={tooltip}>
      <span className={`text-[10px] tabular-nums ${textColor}`}>{label}</span>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700">
        <span className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </span>
      {pct >= 80 && (
        <span className={`text-[9px] font-medium ${pct >= 90 ? 'text-red-400' : 'text-amber-400'}`} title="Context window is getting full — history may be compacted soon">
          {pct >= 90 ? 'Full' : 'Filling'}
        </span>
      )}
    </span>
  );
}

function formatCountdown(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function summarizePermissionRequest(data = {}) {
  const args = data.args && typeof data.args === "object" ? data.args : {};
  const tool = data.tool || data.toolName || "tool";
  if (typeof args.command === "string" && args.command.trim()) {
    return { label: "Run command", value: args.command.trim() };
  }
  if (typeof args.code === "string" && args.code.trim()) {
    return { label: tool === "run_python" ? "Run Python" : "Run code", value: args.code.trim() };
  }
  if (typeof args.path === "string" && args.path.trim()) {
    const verb = /delete/i.test(tool) ? "Delete file"
      : /write|create/i.test(tool) ? "Write file"
        : /edit|patch/i.test(tool) ? "Edit file"
          : "Use file";
    return { label: verb, value: args.path.trim() };
  }
  if (typeof args.query === "string" && args.query.trim()) {
    return { label: "Search", value: args.query.trim() };
  }
  if (typeof data.description === "string" && data.description.trim()) {
    return { label: "Use tool", value: data.description.trim() };
  }
  try {
    const text = JSON.stringify(args || {}, null, 2);
    if (text && text !== "{}") return { label: "Use tool", value: text };
  } catch {
    /* ignore */
  }
  return { label: "Use tool", value: tool };
}

function PendingInteractionInput({ interaction, onPermissionDecision, onAskUserAnswer, tokenUsage, isRunning, onStop }) {
  const [answer, setAnswer] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const data = interaction?.data || {};
  const expiresAt = useMemo(() => (
    Number.isFinite(data.expiresInMs) && !data.resolved && !data.answered
      ? Date.now() + data.expiresInMs
      : null
  ), [data.expiresInMs, data.resolved, data.answered]);
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const expired = remainingMs === 0;

  useEffect(() => {
    if (!expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!interaction?.type) return null;

  const resolving = Boolean(data.resolving || data.answered);
  const statusText = remainingMs !== null
    ? expired ? "Expired" : `Auto-deny in ${formatCountdown(remainingMs)}`
    : "Waiting";

  if (interaction.type === "ask_user") {
    const submit = (value) => {
      const next = String(value ?? answer ?? "").trim();
      if (!next && !data.default) return;
      onAskUserAnswer?.(data.requestId, next || data.default || "");
      setAnswer("");
    };

    return (
      <div className="bg-transparent">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <div className="overflow-hidden rounded-[1.35rem] border border-blue-200/80 bg-white shadow-sm dark:border-blue-900/60 dark:bg-gray-900 midnight:border-blue-900/60 midnight:bg-slate-900">
            <div className="flex items-start gap-3 px-4 pt-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Agent question</span>
                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">{statusText}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-800 dark:text-gray-100 midnight:text-slate-100">{data.question}</p>
                {Array.isArray(data.choices) && data.choices.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.choices.map((choice, index) => (
                      <button
                        key={`${choice}-${index}`}
                        type="button"
                        onClick={() => submit(choice)}
                        disabled={resolving}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/40 midnight:border-slate-800 midnight:bg-slate-950/40">
              <div className="flex items-center gap-2">
                <input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                  }}
                  disabled={resolving}
                  placeholder={data.default ? `Default: ${data.default}` : "Type your answer..."}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-blue-800 dark:focus:ring-blue-950 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-100"
                  autoFocus
                />
                {data.default && (
                  <button
                    type="button"
                    onClick={() => submit(data.default)}
                    disabled={resolving}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                  >
                    Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => submit()}
                  disabled={resolving || (!answer.trim() && !data.default)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:bg-gray-300 disabled:text-white dark:disabled:bg-gray-700"
                  title="Send answer"
                >
                  {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const intent = summarizePermissionRequest(data);
  const dangerous = data.permission === "dangerous";
  const approveClass = dangerous
    ? "bg-rose-600 text-white hover:bg-rose-700"
    : "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white";

  return (
    <div className="bg-transparent">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-3">
        <div className={`overflow-hidden rounded-[1.35rem] border bg-white shadow-sm dark:bg-gray-900 midnight:bg-slate-900 ${
          dangerous
            ? "border-rose-200 dark:border-rose-900/60 midnight:border-rose-900/60"
            : "border-amber-200 dark:border-amber-900/60 midnight:border-amber-900/60"
        }`}>
          <div className="flex items-start gap-3 px-4 py-4">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
              dangerous
                ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                : "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
            }`}>
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 midnight:text-slate-100">Permission needed</span>
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400 midnight:bg-slate-800 midnight:text-slate-400">
                  {data.tool || data.toolName || "tool"}
                </span>
                <span className={`text-[10px] font-medium ${expired ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>{statusText}</span>
              </div>
              <p className="mt-1 text-sm text-gray-800 dark:text-gray-100 midnight:text-slate-100">{intent.label}</p>
              <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/50 midnight:border-slate-800 midnight:bg-slate-950/50">
                <code className="block max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                  {intent.value}
                </code>
              </div>
              {data.workingDir && (
                <p className="mt-1 truncate text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">{data.workingDir}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/40 midnight:border-slate-800 midnight:bg-slate-950/40">
            <div className="flex items-center gap-2">
              {tokenUsage?.totalTokens > 0 && <TokenBar usage={tokenUsage} />}
              {isRunning && onStop && (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200"
                  title="Stop run"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onPermissionDecision?.(data.requestId, "deny")}
                disabled={resolving || expired}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                Deny
              </button>
              <button
                type="button"
                onClick={() => onPermissionDecision?.(data.requestId, "allow")}
                disabled={resolving || expired}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${approveClass}`}
              >
                {resolving && <Loader2 className="h-3 w-3 animate-spin" />}
                Approve once
              </button>
              <button
                type="button"
                onClick={() => onPermissionDecision?.(data.requestId, "allow_session")}
                disabled={resolving || expired}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                Trust run
              </button>
              <button
                type="button"
                onClick={() => onPermissionDecision?.(data.requestId, "allow_always")}
                disabled={resolving || expired}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                <ShieldOff className="h-3 w-3" />
                Always
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  onAgentModeChange,
  chatOnlyMode = false,
  autoApprove = false,
  onToggleAutoApprove,
  enabledIntegrationTools = [],
  onEnabledIntegrationToolsChange,
  isRunning = false,
  onStop,
  externalFileAttachment = null,
  onNativeFileAttach = null,
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
  multimodalCapabilities = null,
  pendingInteraction = null,
  onPermissionDecision,
  onAskUserAnswer,
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
  const [providerProfiles, setProviderProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [agentProfiles, setAgentProfiles] = useState([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [dismissedTrigger, setDismissedTrigger] = useState(null);
  const voiceCapabilityMode = sttReady && ttsReady ? 'full' : sttReady ? 'stt' : ttsReady ? 'tts' : 'none';
  const voiceConversationAvailable = voiceCapabilityMode === 'full';
  const voiceConversationActive = voiceMode && voiceConversationAvailable;
  // File attachments state
  const [fileAttachments, setFileAttachments] = useState([]);
  // Map from "@displayPath" token → file metadata for inline @mentions in text
  const [inlineMentions, setInlineMentions] = useState(new Map());
  const [fileSearchResults, setFileSearchResults] = useState([]);
  const [fileSearchLoading, setFileSearchLoading] = useState(false);
  const [fileSearchLoaded, setFileSearchLoaded] = useState(false);
  const [fileRoot, setFileRoot] = useState(null);
  const [fileRoots, setFileRoots] = useState([]);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [pendingContextSwitch, setPendingContextSwitch] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  const localModel = useLocalModelStatus();
  const activeBrain = useActiveBrainStatus();
  const { config: modelContextConfig } = useModelConfig();
  const textareaRef = useRef(null);
  const toolbarRef = useRef(null);
  const modeMenuRef = useRef(null);
  const filePickerRef = useRef(null);
  const rawAgentTrigger = useMemo(
    () => getAgentTrigger(value, cursorPosition),
    [value, cursorPosition],
  );
  const allowWorkspaceAccess = !chatOnlyMode;
  const rawFileTrigger = useMemo(
    () => allowWorkspaceAccess ? getFileTrigger(value, cursorPosition) : null,
    [allowWorkspaceAccess, value, cursorPosition],
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
    if (!allowWorkspaceAccess) return null;
    const rootId = workingContext?.rootId || "workspace";
    if (rootId === "_abs" && workingContext?.workingDir) {
      // Synthesize a root from the absolute path chosen via native picker
      const absPath = workingContext.workingDir;
      return {
        id: "_abs",
        label: absPath.split("/").filter(Boolean).pop() || absPath,
        kind: "dir",
        path: absPath,
      };
    }
    return fileRoots.find(root => root.id === rootId) || fileRoot || fileRoots[0] || null;
  }, [allowWorkspaceAccess, fileRoot, fileRoots, workingContext?.rootId, workingContext?.workingDir]);
  const activeWorkingContext = useMemo(() => {
    if (!allowWorkspaceAccess) return null;
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
  }, [activeRoot, allowWorkspaceAccess, workingContext?.relativePath, workingContext?.workingDir]);
  const activeContextLabel = labelForWorkingContext(activeWorkingContext, activeRoot);
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
    if (chatOnlyMode) return;
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
  }, [chatOnlyMode, externalFileAttachment?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Keep @mention inline in text — positional context preserved
    const rootId = activeWorkingContext?.rootId || "workspace";
    const displayPath = relativeToContext(file.path, activeWorkingContext?.relativePath || ".");
    const token = `@${displayPath}`;
    const nextValue = `${value.slice(0, fileTrigger.start)}${token} ${value.slice(fileTrigger.end)}`;
    const nextCursor = fileTrigger.start + token.length + 1;
    setValue(nextValue);
    setCursorPosition(nextCursor);
    setInlineMentions(prev => {
      const next = new Map(prev);
      next.set(token, { rootId, path: file.path, name: file.name, ext: file.ext });
      return next;
    });
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
    });
  }, [activeWorkingContext?.relativePath, activeWorkingContext?.rootId, fileTrigger, value]);

  const removeFileAttachment = useCallback((path, rootId = "workspace") => {
    setFileAttachments(prev => prev.filter(f => !(f.path === path && (f.rootId || "workspace") === rootId)));
  }, []);

  const handlePickedFiles = useCallback(async (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length || disabled) return;

    const rootId = activeWorkingContext?.rootId || "workspace";
    const uploadDir = ".asyncat/attachments";
    setUploadingAttachment(true);
    setError(null);

    try {
      const uploaded = [];
      for (const file of picked.slice(0, 8)) {
        if (chatOnlyMode) {
          uploaded.push(await createPromptOnlyAttachment(file));
          continue;
        }
        const safeName = safeAttachmentName(file.name);
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const targetPath = joinRelativePath(uploadDir, `${stamp}-${safeName}`);
        await filesApi.upload(rootId, targetPath, file, { overwrite: true });
        uploaded.push({
          rootId,
          path: targetPath,
          name: file.name,
          ext: file.name.split(".").pop() || "",
          mime: file.type || "",
          size: file.size,
          uploaded: true,
        });
      }

      setFileAttachments(prev => {
        const seen = new Set(prev.map(file => `${file.rootId || "workspace"}:${file.path}`));
        const next = [...prev];
        for (const file of uploaded) {
          const key = `${file.rootId || "workspace"}:${file.path}`;
          if (!seen.has(key)) next.push(file);
        }
        return next;
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (err) {
      setError(`Failed to attach file: ${err.message || "Upload failed"}`);
    } finally {
      setUploadingAttachment(false);
    }
  }, [activeWorkingContext?.relativePath, activeWorkingContext?.rootId, chatOnlyMode, disabled]);

  const handleSubmit = useCallback(
    async (e, overrideText = null) => {
      if (e) e.preventDefault();
      const textToSend = overrideText || value;
      if (!textToSend?.trim() || disabled) return;
      if (localModelSendBlockReason) {
        return;
      }

      try {
        // Resolve inline @mention tokens present in the text at send time
        const resolvedInline = [];
        const mentionRegex = /@([^\s]+)/g;
        let mentionMatch;
        const seenPaths = new Set();
        while ((mentionMatch = mentionRegex.exec(textToSend)) !== null) {
          const token = `@${mentionMatch[1].replace(/[.,;:!?]+$/, "")}`;
          const meta = inlineMentions.get(token);
          const key = `${meta?.rootId || "workspace"}:${meta?.path}`;
          if (meta && !seenPaths.has(key)) {
            seenPaths.add(key);
            resolvedInline.push({ ...meta, inline: true });
          }
        }
        const allFileAttachments = chatOnlyMode ? fileAttachments : [...resolvedInline, ...fileAttachments];

        const messageToSend = {
          content: textToSend.trim(),
          chatOnly: chatOnlyMode,
          agentMentions: chatOnlyMode ? [] : detectedAgentMentions,
          fileAttachments: allFileAttachments.length > 0 ? allFileAttachments : undefined,
          reasoningEffort: activeBrain.supportsReasoning ? reasoningEffort : "auto",
          enabledIntegrationTools: chatOnlyMode ? [] : Array.isArray(enabledIntegrationTools) ? enabledIntegrationTools : [],
        };

        await onSubmit(messageToSend, []);
        setValue("");
        setFileAttachments([]);
        setInlineMentions(new Map());
        setError(null);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (err) {
        console.error("Failed to submit message:", err);
        setError("Failed to send message. Please try again.");
      }
    },
    [value, disabled, localModelSendBlockReason, onSubmit, chatOnlyMode, detectedAgentMentions, fileAttachments, inlineMentions, activeBrain.supportsReasoning, reasoningEffort, enabledIntegrationTools],
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
  const setAgentMode = useCallback((mode) => {
    if (onAgentModeChange) {
      onAgentModeChange(mode);
      return;
    }
    if (mode === 'plan' && isActionMode && (onToggleAgentMode || onToggleTools)) {
      (onToggleAgentMode || onToggleTools)();
    }
    if (mode === 'action' && !isActionMode && (onToggleAgentMode || onToggleTools)) {
      (onToggleAgentMode || onToggleTools)();
    }
  }, [isActionMode, onAgentModeChange, onToggleAgentMode, onToggleTools]);
  const enabledIntegrationSet = useMemo(
    () => new Set(Array.isArray(enabledIntegrationTools) ? enabledIntegrationTools : []),
    [enabledIntegrationTools],
  );
  const enabledIntegrationPacks = useMemo(
    () => INTEGRATION_TOOL_PACKS.filter(pack => pack.tools.some(tool => enabledIntegrationSet.has(tool))),
    [enabledIntegrationSet],
  );
  const enabledIntegrationCount = enabledIntegrationPacks.length;
  const toggleIntegrationPack = useCallback((pack) => {
    if (!onEnabledIntegrationToolsChange) return;
    const next = new Set(enabledIntegrationSet);
    const isEnabled = pack.tools.some(tool => next.has(tool));
    for (const tool of pack.tools) {
      if (isEnabled) next.delete(tool);
      else next.add(tool);
    }
    onEnabledIntegrationToolsChange([...next]);
  }, [enabledIntegrationSet, onEnabledIntegrationToolsChange]);

  const BrainIcon = activeBrain.isLocal ? Cpu : Cloud;
  const modelLabel = activeBrain.isLoadingModel
    ? "Loading…"
    : `${activeBrain.mode} · ${activeBrain.providerName}${activeBrain.model ? ` · ${activeBrain.model}` : ""}`;

  const allModelOptions = useMemo(() => {
    const opts = [];
    const cloudProfiles = providerProfiles.filter(p => p.provider_id !== "llamacpp-builtin");
    if (cloudProfiles.length > 0) {
      opts.push({ type: "section", label: "Providers" });
      for (const profile of cloudProfiles) {
        const isActive = profile.id === activeProfileId;
        opts.push({
          type: "option",
          value: `provider:${profile.id}`,
          label: profile.name,
          detail: profile.model || profile.provider_id || "",
          active: isActive,
        });
      }
    }
    if (localModels.length > 0 || (activeBrain.isBuiltin && localModel.model)) {
      if (opts.length > 0) opts.push({ type: "divider" });
      opts.push({ type: "section", label: "Local LLMs" });
      const localFilenames = new Set(localModels.map(m => m.filename));
      const allLocal = [
        ...(activeBrain.isBuiltin && localModel.model && !localFilenames.has(localModel.model)
          ? [{ filename: localModel.model, name: localModel.model }]
          : []),
        ...localModels,
      ];
      for (const m of allLocal) {
        const isActive = activeBrain.isBuiltin && m.filename === localModel.model;
        opts.push({
          type: "option",
          value: m.filename,
          label: (m.name || m.filename).replace(/\.(gguf|bin)$/i, ""),
          detail: isActive ? "Loaded" : "GGUF",
          active: isActive,
        });
      }
    }
    return opts;
  }, [providerProfiles, activeProfileId, localModels, localModel.model, activeBrain.isBuiltin]);

  // Provider profiles + active config
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [profilesRes, configRes] = await Promise.all([
          aiProviderApi.listProfiles().catch(() => ({ profiles: [] })),
          aiProviderApi.getConfig().catch(() => null),
        ]);
        if (cancelled) return;
        setProviderProfiles(profilesRes.profiles || []);
        setActiveProfileId(configRes?.profile_id || null);
      } catch {
        if (!cancelled) setProviderProfiles([]);
      }
    };
    load();
    window.addEventListener('asyncat-model-runtime-updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('asyncat-model-runtime-updated', load);
    };
  }, []);

  useEffect(() => {
    if (modelsLoaded) return;
    let cancelled = false;
    localModelsApi
      .listModels()
      .then((res) => { if (!cancelled) setLocalModels(res.models || []); })
      .catch(() => { if (!cancelled) setLocalModels([]); })
      .finally(() => { if (!cancelled) setModelsLoaded(true); });
    return () => { cancelled = true; };
  }, [modelsLoaded]);

  const handleModelSelect = useCallback(
    async (nextModel) => {
      setOpenMenu(null);
      if (nextModel === "__manage__") { window.location.href = "/models"; return; }
      if (!nextModel || isSwitchingModel) return;
      if (nextModel.startsWith("provider:")) {
        const profileId = nextModel.slice("provider:".length);
        if (profileId === activeProfileId) return;
        setModelSwitchError(null);
        setIsSwitchingModel(true);
        try {
          await aiProviderApi.activateProfile(profileId);
          setActiveProfileId(profileId);
          window.dispatchEvent(new CustomEvent("asyncat-model-runtime-updated"));
        } catch (err) {
          setModelSwitchError(err.message || "Could not switch provider.");
        } finally {
          setIsSwitchingModel(false);
        }
        return;
      }
      if (nextModel === localModel.model) return;
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
    [ctxSize, isSwitchingModel, localModel.model, activeProfileId],
  );

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!toolbarRef.current?.contains(event.target)) setOpenMenu(null);
      if (!modeMenuRef.current?.contains(event.target)) setModeMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const selectWorkingContext = useCallback((rootId, relativePath = ".") => {
    if (rootId === "_abs") {
      // Absolute path picked via native dialog — not mapped to any configured root
      const absPath = relativePath;
      const folderName = absPath.split('/').filter(Boolean).pop() || absPath;
      const nextContext = {
        rootId: "_abs",
        rootLabel: folderName,
        rootKind: "dir",
        rootPath: absPath,
        relativePath: ".",
        workingDir: absPath,
      };
      const currentKey = `${activeWorkingContext?.rootId || ""}:${activeWorkingContext?.relativePath || "."}`;
      const nextKey = `_abs:${absPath}`;
      if (hasMessages && currentKey !== nextKey) {
        setPendingContextSwitch(nextContext);
        return;
      }
      onWorkingContextChange(nextContext);
      setContextModalOpen(false);
      return;
    }
    if (rootId === "none") {
      const nextContext = {
        rootId: "none",
        rootLabel: "No workspace",
        rootKind: "none",
        rootPath: "",
        relativePath: ".",
        workingDir: null,
        noWorkspace: true,
      };
      const currentKey = `${activeWorkingContext?.rootId || (chatOnlyMode ? "none" : "")}:${activeWorkingContext?.relativePath || "."}`;
      const nextKey = "none:.";
      if (hasMessages && currentKey !== nextKey) {
        setPendingContextSwitch(nextContext);
        return;
      }
      onWorkingContextChange(nextContext);
      setContextModalOpen(false);
      return;
    }
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
    const currentKey = `${activeWorkingContext?.rootId || ""}:${activeWorkingContext?.relativePath || "."}`;
    const nextKey = `${nextContext.rootId}:${nextContext.relativePath}`;
    if (hasMessages && currentKey !== nextKey) {
      setPendingContextSwitch(nextContext);
      return;
    }
    onWorkingContextChange(nextContext);
    setContextModalOpen(false);
  }, [activeRoot, activeWorkingContext?.relativePath, activeWorkingContext?.rootId, chatOnlyMode, fileRoots, hasMessages, onWorkingContextChange]);

  const openWorkingContextMenu = useCallback(async () => {
    if (window?.electronAPI?.openDirectory) {
      const result = await window.electronAPI.openDirectory({
        defaultPath: activeWorkingContext?.workingDir || undefined,
      });
      if (result.canceled || !result.filePaths?.[0]) return;
      selectWorkingContext('_abs', result.filePaths[0]);
      return;
    }
    setContextModalOpen(true);
  }, [activeWorkingContext?.workingDir, selectWorkingContext]);

  const confirmContextSwitch = useCallback(() => {
    if (!pendingContextSwitch) return;
    onWorkingContextChange(pendingContextSwitch);
    setPendingContextSwitch(null);
    setContextModalOpen(false);
  }, [pendingContextSwitch, onWorkingContextChange]);

  const cancelContextSwitch = useCallback(() => {
    setPendingContextSwitch(null);
  }, []);



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

  // Segments for highlighting @mentions inline in the textarea overlay
  const highlightedSegments = useMemo(() => {
    if (!value || inlineMentions.size === 0) return null;
    const parts = [];
    let lastIndex = 0;
    const regex = /@([^\s]+)/g;
    let match;
    while ((match = regex.exec(value)) !== null) {
      const token = `@${match[1].replace(/[.,;:!?]+$/, "")}`;
      if (inlineMentions.has(token)) {
        if (match.index > lastIndex) {
          parts.push({ type: "text", content: value.slice(lastIndex, match.index) });
        }
        parts.push({ type: "mention", content: match[0] });
        lastIndex = match.index + match[0].length;
      }
    }
    if (lastIndex <= value.length) {
      parts.push({ type: "text", content: value.slice(lastIndex) });
    }
    return parts.some((p) => p.type === "mention") ? parts : null;
  }, [value, inlineMentions]);

  const getBorderColor = () => {
    return "border-gray-200/90 dark:border-gray-800 midnight:border-slate-800 focus-within:border-gray-300 dark:focus-within:border-gray-700 midnight:focus-within:border-slate-700";
  };

  if (pendingInteraction?.type) {
    return (
      <PendingInteractionInput
        interaction={pendingInteraction}
        onPermissionDecision={onPermissionDecision}
        onAskUserAnswer={onAskUserAnswer}
        tokenUsage={tokenUsage}
        isRunning={isRunning}
        onStop={onStop}
      />
    );
  }

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
              className={`bg-white px-4 pt-4 pb-3 rounded-[1.35rem] border transition-colors dark:bg-gray-900 midnight:bg-slate-900 ${getBorderColor()}`}
            >
              {(error || modelSwitchError) && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                  <p className="text-sm text-red-800 dark:text-red-200 flex-1">
                    {error || modelSwitchError}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setError(null); setModelSwitchError(null); }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {localModelSendBlockReason && !disabled && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200 midnight:border-amber-900/50 midnight:bg-amber-900/20 midnight:text-amber-200">
                  <div className="flex min-w-0 items-center gap-2">
                    {activeBrain.isLoadingModel || activeBrain.loading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Cpu className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{localModelSendBlockReason}</span>
                  </div>
                </div>
              )}

              <div className="relative">
                {highlightedSegments && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-base leading-relaxed text-gray-900 dark:text-gray-100 midnight:text-gray-100"
                    style={{ padding: 0, fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit" }}
                  >
                    {highlightedSegments.map((part, i) =>
                      part.type === "mention" ? (
                        <span key={i} className="text-blue-500/90 dark:text-blue-400 midnight:text-blue-400">
                          {part.content}
                        </span>
                      ) : (
                        <span key={i}>{part.content}</span>
                      )
                    )}
                    {/* trailing space keeps height consistent */}
                    {" "}
                  </div>
                )}
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
                  style={{ padding: 0 }}
                  className={`w-full resize-none bg-transparent focus:outline-none text-base leading-relaxed min-h-12 max-h-45 disabled:opacity-50 caret-gray-900 placeholder-gray-400 dark:caret-gray-100 dark:placeholder-gray-500 midnight:caret-gray-100 midnight:placeholder-gray-500 ${
                    highlightedSegments
                      ? "text-transparent"
                      : "text-gray-900 dark:text-gray-100 midnight:text-gray-100"
                  }`}
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {fileAttachments.map(file => (
                    <AttachmentChip
                      key={`${file.rootId || "workspace"}:${file.path}`}
                      file={file}
                      capabilities={multimodalCapabilities}
                      onRemove={() => removeFileAttachment(file.path, file.rootId || "workspace")}
                      onPreview={setLightbox}
                    />
                  ))}
                </div>
              )}


            <div ref={toolbarRef} className="mt-2.5 flex items-center justify-between gap-2 bg-transparent text-gray-500 select-none">
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenu((current) => (current === "plus" ? null : "plus"))}
                    disabled={disabled}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:text-slate-500 midnight:hover:bg-slate-800 midnight:hover:text-slate-300 transition-colors"
                    title="Options"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  {openMenu === "plus" && (
                    <div className="absolute left-0 bottom-full z-30 mb-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          filePickerRef.current?.click();
                        }}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-800"
                      >
                        <Paperclip className="h-4 w-4 text-gray-400 dark:text-gray-500 midnight:text-slate-500" />
                        <span className="flex-1 font-medium">{chatOnlyMode ? "Attach prompt files" : "Add photos & files"}</span>
                      </button>

                      {window?.electronAPI?.openFilesDialog && (
                        <button
                          type="button"
                          onClick={async () => {
                            setOpenMenu(null);
                            const result = await window.electronAPI.openFilesDialog({ multiSelections: false });
                            if (result?.canceled || !result?.filePaths?.length) return;
                            const filePath = result.filePaths[0];
                            const name = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
                            if (onNativeFileAttach) {
                              onNativeFileAttach({ name, path: filePath, type: 'file', nonce: Date.now() });
                            }
                          }}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-800"
                        >
                          <Folder className="h-4 w-4 text-gray-400 dark:text-gray-500 midnight:text-slate-500" />
                          <span className="flex-1 font-medium">Browse with Finder</span>
                        </button>
                      )}



                      {voiceConversationAvailable && onToggleVoiceMode && (
                        <div className="flex items-center justify-between rounded-md px-3 py-2 transition-colors">
                          <div className="flex items-center gap-3">
                            <Headphones className="h-4 w-4 text-gray-400 dark:text-gray-500 midnight:text-slate-500" />
                            <div className="text-left">
                              <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">Voice mode</span>
                              <span className="block text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                                {voiceConversationActive ? "Hands-free conversation active" : "Enable hands-free conversation"}
                              </span>
                            </div>
                          </div>
                          <ToggleSwitch
                            checked={voiceConversationActive}
                            onChange={onToggleVoiceMode}
                            disabled={disabled}
                          />
                        </div>
                      )}

                      {(supportsReasoningControl || onEnabledIntegrationToolsChange) && (
                        <div className="my-1 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800" />
                      )}

                      {onReasoningEffortChange && supportsReasoningControl && (
                        <div className="px-3 py-2">
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-slate-500 mb-1.5">
                            Reasoning effort
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {currentReasoningOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => onReasoningEffortChange(option.value)}
                                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                  option.value === reasoningEffort
                                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 midnight:bg-indigo-900/20 midnight:text-indigo-300"
                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 midnight:text-slate-400 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {onEnabledIntegrationToolsChange && allowWorkspaceAccess && supportsReasoningControl && (
                        <div className="my-1 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800" />
                      )}

                      {onEnabledIntegrationToolsChange && allowWorkspaceAccess && (
                        <div className="px-3 py-2">
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-slate-500 mb-1">
                            Plugins
                          </span>
                          <div className="space-y-0.5">
                            {INTEGRATION_TOOL_PACKS.map((pack) => {
                              const PackIcon = pack.icon;
                              const isEnabled = pack.tools.some(tool => enabledIntegrationSet.has(tool));
                              return (
                                <button
                                  key={pack.id}
                                  type="button"
                                  onClick={() => toggleIntegrationPack(pack)}
                                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                    isEnabled
                                      ? "text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400"
                                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-100"
                                  }`}
                                >
                                  <PackIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                  <span className="flex-1 font-medium">{pack.label}</span>
                                  <span className={`h-3 w-3 shrink-0 rounded-full border ${
                                    isEnabled
                                      ? "border-indigo-500 bg-indigo-500 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9)] dark:shadow-[inset_0_0_0_2px_rgba(17,24,39,0.95)] midnight:shadow-[inset_0_0_0_2px_rgba(15,23,42,0.95)]"
                                      : "border-gray-300 dark:border-gray-600 midnight:border-slate-600"
                                  }`} />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
                    disabled={disabled || activeBrain.loading || isSwitchingModel}
                    title={`${activeBrain.label}${activeBrain.supportsTools ? " · tools enabled" : ""}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed ${
                      activeBrain.isLoadingModel || isSwitchingModel
                        ? "text-amber-500 dark:text-amber-400 midnight:text-amber-400"
                        : activeBrain.isReady
                          ? activeBrain.isLocal
                            ? "text-emerald-600 hover:text-emerald-700 hover:bg-gray-100 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-gray-800 midnight:text-emerald-400 midnight:hover:text-emerald-300 midnight:hover:bg-slate-800"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:text-slate-100 midnight:hover:bg-slate-800"
                          : "text-gray-400 dark:text-gray-500 midnight:text-slate-500"
                    }`}
                  >
                    {activeBrain.isLoadingModel || activeBrain.loading || isSwitchingModel ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BrainIcon className="w-3.5 h-3.5" />
                    )}
                    <span className="truncate max-w-[14rem]">{modelLabel}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>
                  {openMenu === "model" && (
                    <div className="absolute left-0 bottom-full z-30 mb-2 w-80 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-700 midnight:bg-slate-900">
                      <div className="max-h-72 overflow-y-auto p-1">
                        {allModelOptions.length === 0 ? (
                          <div className="px-2.5 py-4 text-center text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                            No models configured
                          </div>
                        ) : allModelOptions.map((item, i) => {
                          if (item.type === "section") {
                            return (
                              <div key={`s-${i}`} className="px-2.5 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                                {item.label}
                              </div>
                            );
                          }
                          if (item.type === "divider") {
                            return <div key={`d-${i}`} className="my-1 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800" />;
                          }
                          return (
                            <button
                              key={item.value}
                              type="button"
                              disabled={item.active}
                              onClick={() => handleModelSelect(item.value)}
                              className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-default ${
                                item.active
                                  ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800 midnight:text-slate-100"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:text-slate-300 midnight:hover:bg-slate-800 midnight:hover:text-slate-100"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span className="block truncate font-medium flex-1">{item.label}</span>
                                {item.active && (
                                  <span className="flex h-2 w-2 shrink-0 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                  </span>
                                )}
                              </span>
                              {item.detail && (
                                <span className="block truncate text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500 mt-0.5">{item.detail}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="border-t border-gray-100 p-1 dark:border-gray-800 midnight:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleModelSelect("__manage__")}
                          className="w-full rounded-md px-2.5 py-2 text-left text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
                        >
                          Manage models →
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="flex items-center gap-2.5">
                <input
                  ref={filePickerRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handlePickedFiles}
                />
                
                {sttReady && (
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={disabled && !isRecording}
                    title={isRecording ? "Stop recording" : voiceConversationActive ? "Voice mode active" : "Record voice input"}
                    className={`flex h-8 items-center justify-center gap-2 rounded-full transition-all duration-200 ${
                      isRecording
                        ? "w-auto px-2.5 bg-red-50 text-red-500 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800/70"
                        : autoRecordPrompt
                          ? "w-8 bg-violet-100 text-violet-600 ring-2 ring-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-700"
                          : voiceConversationActive
                            ? "w-8 bg-violet-50 text-violet-500 ring-1 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-800"
                            : "w-8 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 midnight:text-slate-500 midnight:hover:bg-slate-800 midnight:hover:text-slate-300"
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <RecordingWaveform />
                        <span className="tabular-nums text-xs font-semibold">{formatElapsed(recordingDuration)}</span>
                      </>
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>
                )}

                {isRunning ? (
                  <div className="inline-flex items-center gap-2">
                    {tokenUsage?.totalTokens > 0 && <TokenBar usage={tokenUsage} />}
                    <button
                      type="button"
                      onClick={onStop}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-500 midnight:hover:text-slate-300 midnight:hover:bg-slate-800 transition-colors"
                      title="Stop generating"
                    >
                      <Square className="h-2.5 w-2.5 fill-current" />
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2">
                    {tokenUsage?.totalTokens > 0 && <TokenBar usage={tokenUsage} />}
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
                        canSubmit
                          ? "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 active:scale-95 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 midnight:bg-slate-800 midnight:hover:bg-slate-700 midnight:text-slate-400 midnight:hover:text-slate-200"
                          : "bg-gray-50 text-gray-300 dark:bg-gray-800/50 dark:text-gray-600 midnight:bg-slate-800/50 midnight:text-slate-600 cursor-not-allowed"
                      }`}
                      title={localModelSendBlockReason || (canSubmit ? "Send" : "Type a message")}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

              {(activeWorkingContext || onWorkingContextChange) && (
                <div className="-mx-4 px-4 pt-2.5 pb-3 mt-2 -mb-3 bg-gray-50/80 dark:bg-gray-800/40 midnight:bg-slate-800/40 flex flex-wrap items-center gap-3 select-none">
            {/* Workspace & Folder Combined Button */}
            {chatOnlyMode ? (
              <button
                type="button"
                onClick={openWorkingContextMenu}
                disabled={disabled || !onWorkingContextChange}
                title="No workspace selected. Prompt attachments are allowed; local folders, commands, and edits are disabled."
                className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-60 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                <span>No workspace</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            ) : activeWorkingContext && (
              <button
                type="button"
                onClick={openWorkingContextMenu}
                disabled={disabled || !onWorkingContextChange}
                title={`Workspace Root: ${activeWorkingContext.rootPath} | Working Folder: ${activeWorkingContext.relativePath}`}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-60 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:text-slate-200"
              >
                {(() => {
                  const RootIcon = rootIcon(activeRoot?.kind);
                  return <RootIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />;
                })()}
                <span>{activeWorkingContext.rootLabel || "Projects"}</span>
                <span className="text-gray-300 dark:text-gray-700 midnight:text-slate-700">/</span>
                <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span>{activeContextLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            )}

            {/* Mode Selector Dropdown */}
            {!chatOnlyMode && (onAgentModeChange || onToggleAgentMode || onToggleTools) && (
              <div ref={modeMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setModeMenuOpen(open => !open)}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-60 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:text-slate-200"
                >
                  {!isActionMode ? (
                    <>
                      <ClipboardPen className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                      <span>Plan</span>
                    </>
                  ) : autoApprove ? (
                    <>
                      <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                      <span>Yolo</span>
                    </>
                  ) : (
                    <>
                      <Wrench className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                      <span>Action</span>
                    </>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>

                {modeMenuOpen && (
                  <div className="absolute left-0 bottom-full z-30 mb-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
                    {/* Plan */}
                    <button
                      type="button"
                      onClick={() => {
                        setAgentMode('plan');
                        setModeMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                        !isActionMode
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 midnight:bg-emerald-900/20 midnight:text-emerald-300"
                          : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-800"
                      }`}
                    >
                      <ClipboardPen className="h-3.5 w-3.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="block font-medium">Plan</span>
                        <span className="block text-[10px] opacity-60">Read-only, no tool execution</span>
                      </div>
                      {!isActionMode && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>

                    {/* Action */}
                    <button
                      type="button"
                      onClick={() => {
                        setAgentMode('action');
                        if (autoApprove && onToggleAutoApprove) onToggleAutoApprove();
                        setModeMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                        isActionMode && !autoApprove
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 midnight:bg-blue-900/20 midnight:text-blue-300"
                          : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-800"
                      }`}
                    >
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="block font-medium">Action</span>
                        <span className="block text-[10px] opacity-60">Ask before each tool call</span>
                      </div>
                      {isActionMode && !autoApprove && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>

                    {/* Yolo */}
                    {onToggleAutoApprove && (
                      <button
                        type="button"
                        onClick={() => {
                          setAgentMode('action');
                          if (!autoApprove) onToggleAutoApprove();
                          setModeMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                          isActionMode && autoApprove
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 midnight:bg-amber-900/20 midnight:text-amber-300"
                            : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 midnight:text-slate-300 midnight:hover:bg-slate-800"
                        }`}
                      >
                        <Zap className="h-3.5 w-3.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="block font-medium">Yolo</span>
                          <span className="block text-[10px] opacity-60">Auto-approve all tools</span>
                        </div>
                        {isActionMode && autoApprove && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
                </div>
              )}
          </div>
        </form>

      </div>

      {lightbox && (
        <ImageLightbox
          url={lightbox.url}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}

      <WorkingContextModal
        isOpen={contextModalOpen}
        onClose={() => setContextModalOpen(false)}
        onSelect={selectWorkingContext}
        fileRoots={fileRoots}
        initialRootId={chatOnlyMode ? "none" : activeWorkingContext?.rootId || "workspace"}
        initialRelativePath={chatOnlyMode ? "." : activeWorkingContext?.relativePath || "."}
        activeWorkingDir={chatOnlyMode ? "" : activeWorkingContext?.workingDir || ""}
      />

      <ConfirmModal
        isOpen={!!pendingContextSwitch}
        onClose={cancelContextSwitch}
        onConfirm={confirmContextSwitch}
        title="Switch working folder?"
        message="Future file search, Git, shell tools, and edits will use the new folder. Earlier messages and edits stay as history."
        confirmLabel="Switch folder"
        cancelLabel="Keep current"
      />
    </div>
  );
};

export default MessageInputV2;
