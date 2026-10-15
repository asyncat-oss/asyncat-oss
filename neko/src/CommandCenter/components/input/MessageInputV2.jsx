// MessageInputV2.jsx — the chat composer: the message box, its pickers and
// menus, attachments, the mic, and the agent's questions and permission asks.
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import { connectorToolLabel, connectorToolParts } from "../../../Connectors/connectorFormat.js";
import { startWavRecording } from "../../../utils/wavRecorder.js";
import { ArrowUp, Bell, Bookmark, Bot, Cat as CatIcon, ChevronDown, Hammer, ClipboardPen, Cpu, Headphones, ImagePlus, Loader2, Mail, MessageCircle, Mic, Paperclip, Rss, Send, ShieldAlert, ShieldOff, Square, Wrench, X, Zap, Plus, Folder, FolderSearch } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../../../components/ui/Menu.jsx";
import AgentAvatar from "../../../Agent/AgentAvatar.jsx";
import { useAgents } from "../../../Agent/useAgents.js";
import { ProviderGlyph } from "../../../Models/modelLogos.jsx";
import { folderName, usageHint } from "../../../Agent/externalAgentFormat.js";
import eventBus from "../../../utils/eventBus.js";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { WorkingContextModal } from "../modals/WorkingContextModal.jsx";
import { projectApi } from "../../../projects/projectApi.js";
import { useActiveBrainStatus } from "../../hooks/useActiveBrainStatus.js";
import { audioApi } from "../../../Settings/settingApi.js";
import { modelBlockReason } from "../../utils/chatModel.js";
import { contextMeter } from "../../utils/contextMeter.js";
import ChatModelPicker from "./ChatModelPicker.jsx";
import { filesApi } from "../../api";
import { dirname, basename, fileIconMeta, rootIcon } from "../../../files/fileUtils.js";
import { attachmentKind, AttachmentChip, ImageLightbox } from "../shared/AttachmentComponents.jsx";
import AskUserForm from "../agent/AskUserForm.jsx";
import Switch from "../../../components/ui/Switch.jsx";
import Button from "../../../components/ui/Button.jsx";
import Notice from "../../../components/ui/Notice.jsx";
import AsyncatMark from "../../../components/ui/AsyncatMark.jsx";
import { CONTROL_CLASS } from "../../../components/ui/Field.jsx";
import { chosenProjectEmoji } from "../../utils/projectEmoji.js";
import { chosenAgentIcon } from "../../../Agent/agentIcon.js";

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


function labelForWorkingContext(context, root) {
  if (context?.relativePath && context.relativePath !== ".") return basename(context.relativePath);
  if (root?.label) return root.label;
  if (root?.path) return formatRootLabel(root.path);
  return "Folder";
}

function relativeToContext(entryPath, contextPath = ".") {
  if (!contextPath || contextPath === ".") return entryPath;
  const prefix = `${contextPath.replace(/\/+$/, "")}/`;
  return String(entryPath || "").startsWith(prefix)
    ? String(entryPath).slice(prefix.length)
    : entryPath;
}


// The # (agents) and @ (files) suggestion lists above the box: the Menu's look.
const suggestionPanelClass =
  "absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-line bg-elevated text-fg shadow-xl shadow-black/10 dark:shadow-black/40";
const suggestionActiveClass = "bg-hover text-fg";
const suggestionIdleClass = "text-fg-muted hover:bg-hover hover:text-fg";
// A composer chip that opens a menu: neutral, the same in every theme.
const chipClass = "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60";

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
  const { label, percent, nearlyFull, title } = contextMeter(usage);
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className={`text-[11px] tabular-nums ${nearlyFull ? 'text-amber-600 dark:text-amber-400' : 'text-fg-subtle'}`}>{label}</span>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-line-strong">
        <span className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${nearlyFull ? 'bg-amber-500' : 'bg-fg-subtle'}`} style={{ width: `${percent}%` }} />
      </span>
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
  const connector = connectorToolParts(tool);
  if (connector) {
    return { label: `Use ${connector.connector}`, value: data.description || connector.tool };
  }
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

// The change a file edit will make, shown before it is approved. Opens at the
// first changed line rather than the top of the file.
function PermissionDiff({ diff }) {
  const scrollRef = useRef(null);
  const lines = useMemo(() => String(diff).split("\n"), [diff]);

  useEffect(() => {
    const container = scrollRef.current;
    const firstChange = container?.querySelector("[data-changed]");
    if (container && firstChange) container.scrollTop = Math.max(0, firstChange.offsetTop - 24);
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      aria-label="Proposed changes"
      className="relative mt-2 max-h-40 overflow-auto rounded-xl border border-line bg-canvas py-2 font-mono text-[11px] leading-relaxed"
    >
      {lines.map((line, index) => {
        const header = line.startsWith("---") || line.startsWith("+++");
        const added = !header && line.startsWith("+");
        const removed = !header && line.startsWith("-");
        return (
          <div
            key={index}
            data-changed={added || removed ? "" : undefined}
            className={`whitespace-pre px-3 ${
              added ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : removed ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : header ? "text-fg-subtle" : "text-fg-muted"
            }`}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
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

  // If sending an answer failed, put it back in the box so it can be resent.
  useEffect(() => {
    if (data.error && typeof data.draft === "string") setAnswer(data.draft);
  }, [data.error, data.draft]);

  if (!interaction?.type) return null;

  const resolving = Boolean(data.resolving || data.answered);
  const statusText = remainingMs !== null
    ? expired ? "Expired" : `Auto-deny in ${formatCountdown(remainingMs)}`
    : "Waiting";

  if (interaction.type === "ask_user") {
    const waitText = remainingMs !== null
      ? expired ? "Expired" : `Answer within ${formatCountdown(remainingMs)}`
      : "Waiting";
    const submit = (value) => {
      const next = String(value ?? answer ?? "").trim();
      if (!next && !data.default) return;
      onAskUserAnswer?.(data.requestId, next || data.default || "");
      setAnswer("");
    };

    return (
      <div className="bg-transparent">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <div className="overflow-hidden rounded-[1.4rem] border border-line-strong bg-surface shadow-sm">
            <div className="flex items-start gap-3 px-4 pt-4">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-fg-muted">Agent question</span>
                  <span className="text-[11px] text-fg-subtle">{waitText}</span>
                </div>
                <p className="mt-1 text-[15px] leading-relaxed text-fg">{data.question}</p>
                {data.error && (
                  <p role="alert" className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">
                    Couldn&apos;t send your answer ({data.error}). Try again.
                  </p>
                )}
                {Array.isArray(data.choices) && data.choices.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.choices.map((choice, index) => (
                      <button
                        key={`${choice}-${index}`}
                        type="button"
                        onClick={() => submit(choice)}
                        disabled={resolving}
                        className="rounded-lg border border-line-strong px-2.5 py-1 text-[13px] text-fg transition-colors hover:bg-hover disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 border-t border-line bg-canvas/40 px-4 py-3">
              {Array.isArray(data.fields) && data.fields.length > 0 ? (
                <AskUserForm fields={data.fields} onSubmit={(text) => submit(text)} />
              ) : (
              <div className="flex items-center gap-2">
                <input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                  }}
                  disabled={resolving}
                  placeholder={data.default ? `Default: ${data.default}` : "Type your answer…"}
                  aria-label="Your answer"
                  className={`h-9 min-w-0 flex-1 ${CONTROL_CLASS}`}
                  autoFocus
                />
                {data.default && (
                  <Button variant="secondary" onClick={() => submit(data.default)} disabled={resolving}>
                    Use default
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => submit()}
                  disabled={resolving || (!answer.trim() && !data.default)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg text-canvas transition-opacity hover:opacity-90 disabled:bg-hover disabled:text-fg-subtle outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  title="Send answer"
                  aria-label="Send answer"
                >
                  {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const intent = summarizePermissionRequest(data);
  const dangerous = data.permission === "dangerous";

  return (
    <div className="bg-transparent">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-3">
        <div className={`overflow-hidden rounded-[1.4rem] border bg-surface shadow-sm ${
          dangerous ? "border-red-500/40" : "border-amber-500/40"
        }`}>
          <div className="flex items-start gap-3 px-4 py-4">
            <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${dangerous ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-fg-muted">Permission needed</span>
                <span className="rounded-md bg-hover px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                  {connectorToolLabel(data.tool) || data.tool || data.toolName || "tool"}
                </span>
                <span className={`text-[11px] ${expired ? "text-red-600 dark:text-red-400" : "text-fg-subtle"}`}>{statusText}</span>
              </div>
              <p className="mt-1 text-[15px] text-fg">{intent.label}</p>
              {typeof data.diff === "string" && data.diff ? (
                <PermissionDiff diff={data.diff} />
              ) : (
                <div className="mt-2 rounded-xl border border-line bg-canvas px-3 py-2">
                  <code className="block max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fg">
                    {intent.value}
                  </code>
                </div>
              )}
              {data.workingDir && (
                <p className="mt-1 truncate text-[11px] text-fg-subtle">{data.workingDir}</p>
              )}
              {data.sandboxNote && (
                <p className="mt-1.5 text-xs leading-5 text-amber-700 dark:text-amber-400" data-sandbox-note>{data.sandboxNote}</p>
              )}
              {data.error && (
                <p role="alert" className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">
                  Couldn&apos;t send your choice ({data.error}). Try again.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/40 px-4 py-3">
            <div className="flex items-center gap-2">
              {tokenUsage?.totalTokens > 0 && <TokenBar usage={tokenUsage} />}
              {isRunning && onStop && (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-hover hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  title="Stop run"
                  aria-label="Stop run"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => onPermissionDecision?.(data.requestId, "deny")} disabled={resolving || expired}>
                Deny
              </Button>
              <Button
                variant={dangerous ? "destructive" : "primary"}
                onClick={() => onPermissionDecision?.(data.requestId, "allow")}
                disabled={expired}
                loading={resolving}
              >
                Approve once
              </Button>
              {!data.unsandboxed && (
                <Button variant="secondary" onClick={() => onPermissionDecision?.(data.requestId, "allow_session")} disabled={resolving || expired}>
                  Trust run
                </Button>
              )}
              {!data.unsandboxed && (
                <Button variant="danger" icon={ShieldOff} onClick={() => onPermissionDecision?.(data.requestId, "allow_always")} disabled={resolving || expired}>
                  Always
                </Button>
              )}
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

const ENGINE_DESCRIPTIONS = {
  asyncat: "Asyncat's own agent, with the model you chose",
  "claude-code": "Claude Code on this computer, with your Claude sign-in",
  codex: "Codex on this computer, with your ChatGPT sign-in",
};

// Picks which agent answers this conversation. Fixed once the conversation has
// messages, because each engine keeps its own memory of the chat.
function EnginePicker({ engine, engines, onChange, disabled }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const options = [{ id: "asyncat", name: "Asyncat", installed: true, signedIn: true }, ...engines];
  const current = options.find(option => option.id === engine) || options[0];
  const locked = !onChange;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !locked && setOpen(isOpen => !isOpen)}
        disabled={disabled}
        aria-haspopup={locked ? undefined : "menu"}
        aria-expanded={locked ? undefined : open}
        title={locked ? `${current.name} answers this conversation` : ENGINE_DESCRIPTIONS[current.id] || current.description}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-fg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed ${locked ? "cursor-default" : "hover:bg-hover hover:text-fg"}`}
      >
        <ProviderGlyph providerId={current.id} className="h-3.5 w-3.5" />
        <span>{current.name}</span>
        {!locked && <ChevronDown className="h-3 w-3 opacity-50" />}
      </button>
      {!locked && (
        <Menu anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} placement="top-start" width={300} label="Agent">
          <MenuLabel>Who answers</MenuLabel>
          {options.map(option => {
            const unavailable = !option.installed;
            const hint = unavailable
              ? option.description || "Not installed on this computer"
              : option.signedIn === false
                ? `Not signed in. Run \`${option.signInCommand}\` in a terminal.`
                : ENGINE_DESCRIPTIONS[option.id] || option.description;
            const usage = !unavailable && option.signedIn !== false ? usageHint(option.usage) : "";
            return (
              <MenuItem
                key={option.id}
                icon={() => <ProviderGlyph providerId={option.id} className="h-4 w-4 shrink-0" />}
                label={(
                  <span className="flex flex-col py-0.5">
                    <span className="text-fg">{option.name}</span>
                    <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">{hint}</span>
                    {usage ? <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">{usage}</span> : null}
                  </span>
                )}
                checked={engine === option.id}
                disabled={unavailable}
                onSelect={() => onChange(option.id)}
              />
            );
          })}
        </Menu>
      )}
    </>
  );
}

EnginePicker.propTypes = {
  engine: PropTypes.string.isRequired,
  engines: PropTypes.arrayOf(PropTypes.object).isRequired,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
};

// Which agent (custom instructions, knowledge, model, capabilities) answers.
// Asyncat's own mark, as a MenuItem icon for "No agent".
function AsyncatGlyphIcon({ className }) {
  return <AsyncatMark variant="glyph" className={className} />;
}

function AgentPicker({ agents, selectedAgentId, onChange, onManage, disabled }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  if (!onChange) return null;
  const current = agents.find(agent => agent.id === selectedAgentId) || null;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(isOpen => !isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current ? `${current.name}${current.description ? ` — ${current.description}` : ""}` : "Pick an agent for this chat"}
        className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed"
      >
        {current ? <AgentAvatar agent={current} size="xs" /> : <Bot className="h-3.5 w-3.5" />}
        <span className="truncate">{current ? current.name : "Agent"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>
      <Menu anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} placement="top-start" width={290} label="Agent">
        <MenuLabel>Agent for this chat</MenuLabel>
        <MenuItem
          icon={AsyncatGlyphIcon}
          label={(
            <span className="flex flex-col py-0.5">
              <span className="text-fg">No agent</span>
              <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">Asyncat with its usual instructions</span>
            </span>
          )}
          checked={!current}
          onSelect={() => onChange(null)}
        />
        {agents.map(agent => (
          <MenuItem
            key={agent.id}
            icon={() => <AgentAvatar agent={agent} size="xs" />}
            label={(
              <span className="flex flex-col py-0.5">
                <span className="text-fg">{agent.name}</span>
                {agent.description ? <span className="line-clamp-2 whitespace-normal text-[11px] leading-4 text-fg-subtle">{agent.description}</span> : null}
              </span>
            )}
            checked={current?.id === agent.id}
            onSelect={() => onChange(agent.id)}
          />
        ))}
        {onManage && (
          <>
            <MenuSeparator />
            <MenuItem icon={Plus} label={agents.length ? "Manage agents" : "Create an agent"} onSelect={onManage} />
          </>
        )}
      </Menu>
    </>
  );
}

AgentPicker.propTypes = {
  agents: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedAgentId: PropTypes.string,
  onChange: PropTypes.func,
  onManage: PropTypes.func,
  disabled: PropTypes.bool,
};

// Which model Claude Code or Codex uses. Can change between turns.
function EngineModelPicker({ engine, engines, value, onChange, disabled }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const models = engines.find(item => item.id === engine)?.models || [];
  if (models.length < 2 || !onChange) return null;
  const current = models.find(model => (model.id || null) === (value || null)) || models[0];
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(isOpen => !isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Model"
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed"
      >
        <span>{current.label}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
      <Menu anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} placement="top-start" width={260} label="Model">
        <MenuLabel>Model</MenuLabel>
        {models.map(model => (
          <MenuItem
            key={model.id || "default"}
            label={(
              <span className="flex flex-col py-0.5">
                <span className="text-fg">{model.label}</span>
                {model.hint ? <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">{model.hint}</span> : null}
              </span>
            )}
            checked={(model.id || null) === (current.id || null)}
            onSelect={() => onChange(model.id || null)}
          />
        ))}
      </Menu>
    </>
  );
}

EngineModelPicker.propTypes = {
  engine: PropTypes.string.isRequired,
  engines: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
};

const TOOLS_PREFERENCE_OPTIONS = [
  { value: "auto", short: "Auto", label: "Auto", hint: "Uses agent tools when a project is open or the model supports them" },
  { value: "on", short: "On", label: "Always use tools", hint: "Every message runs the agent" },
  { value: "off", short: "Off", label: "Just chat", hint: "Talks to the model directly, without tools" },
];

// Chooses whether messages run the agent (with tools) or go straight to the model.
function ToolsPreferenceControl({ value, onChange, disabled }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const current = TOOLS_PREFERENCE_OPTIONS.find(option => option.value === value) || TOOLS_PREFERENCE_OPTIONS[0];
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(isOpen => !isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current.hint}
        className={chipClass}
      >
        <Hammer className="h-3.5 w-3.5 shrink-0" />
        <span>Tools: {current.short}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      <Menu anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} placement="top-start" width={280} label="Agent tools">
        <MenuLabel>Agent tools</MenuLabel>
        {TOOLS_PREFERENCE_OPTIONS.map(option => (
          <MenuItem
            key={option.value}
            label={(
              <span className="flex flex-col py-0.5">
                <span className="text-fg">{option.label}</span>
                <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">{option.hint}</span>
              </span>
            )}
            checked={value === option.value}
            onSelect={() => onChange(option.value)}
          />
        ))}
      </Menu>
    </>
  );
}

ToolsPreferenceControl.propTypes = {
  value: PropTypes.oneOf(["auto", "on", "off"]),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export const MessageInputV2 = ({
  onSubmit,
  disabled,
  autoFocus,
  experienceMode = "work",
  placeholder = "Ask anything...",
  maxLength = 50000,
  hasMessages = false,
  prefillValue,
  toolsEnabled = true,
  onToggleTools,
  agentMode = toolsEnabled ? 'action' : 'plan',
  onToggleAgentMode,
  onAgentModeChange,
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
  toolsPreference = "auto",
  onToolsPreferenceChange,
  engine = "asyncat",
  engines = [],
  onEngineChange,
  selectedAgentId,
  onAgentChange,
  engineModel = null,
  onEngineModelChange,
  externalFolder = null,
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
  // { name, avatar }: messages go to a Cat, which has its own model and
  // settings, so the pickers are replaced by who you're writing to.
  lockedTo = null,
  // The model this chat runs on (utils/chatModel.js chatModelInfo), the
  // menu's other models, and an agent's own model when it has one.
  chatModel = null,
  modelOptions = [],
  agentModel = null,
  // { name, waitingFor } while a run loads this chat's local model.
  modelLoading = null,
  modelBusy = false,
  onChatModelChange,
  onModelMenuOpen,
  // Goes up by one each time the model menu should open by itself.
  modelMenuRequest = 0,
  temporaryChat = false,
}) => {
  const navigate = useNavigate();
  const isWorkExperience = experienceMode === "work";
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const [error, setError] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const { agents: agentProfiles, loaded: profilesLoaded } = useAgents();
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
  const [fileRoots, setFileRoots] = useState([]);
  const [fileRootsLoaded, setFileRootsLoaded] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [pendingContextSwitch, setPendingContextSwitch] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  const activeBrain = useActiveBrainStatus();
  // The model that answers: an agent's own, else this chat's, else (with
  // neither passed) the default.
  const answeringModel = agentModel || chatModel;
  const modelCapabilities = answeringModel?.capabilities ?? activeBrain.capabilities ?? null;
  const supportsImageInput = Boolean(
    modelCapabilities?.supportsImageInput
      ?? multimodalCapabilities?.vision?.supportsImageInput
      ?? multimodalCapabilities?.vision?.ready,
  );
  const supportsReasoning = Boolean(modelCapabilities?.supportsReasoning);
  const effectiveMultimodalCapabilities = useMemo(() => ({
    ...(multimodalCapabilities || {}),
    vision: {
      ...(multimodalCapabilities?.vision || {}),
      ready: supportsImageInput,
      supportsImageInput,
      model: answeringModel?.name || activeBrain.model || multimodalCapabilities?.vision?.model || null,
    },
  }), [activeBrain.model, answeringModel?.name, multimodalCapabilities, supportsImageInput]);
  const textareaRef = useRef(null);
  const plusButtonRef = useRef(null);
  const modeButtonRef = useRef(null);
  const filePickerRef = useRef(null);
  // Workspace-access toggle UI is unfinished; keep it hidden. Declaring this
  // avoids a ReferenceError when the tools menu renders (it was referenced in
  // JSX without ever being defined).
  const allowWorkspaceAccess = false;
  const rawAgentTrigger = useMemo(
    () => isWorkExperience ? getAgentTrigger(value, cursorPosition) : null,
    [cursorPosition, isWorkExperience, value],
  );
  const rawFileTrigger = useMemo(
    () => isWorkExperience ? getFileTrigger(value, cursorPosition) : null,
    [cursorPosition, isWorkExperience, value],
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
    return fileRoots.find(root => root.id === workingContext?.rootId) || null;
  }, [fileRoots, workingContext?.rootId]);
  const activeWorkingContext = useMemo(() => {
    if (!isWorkExperience) return null;
    // A project used without one of its folders: instructions and knowledge only.
    if (!activeRoot && workingContext?.projectId && !workingContext?.rootId) {
      return {
        rootId: null,
        projectId: workingContext.projectId,
        projectName: workingContext.projectName,
        projectEmoji: workingContext.projectEmoji,
        relativePath: ".",
        workingDir: null,
      };
    }
    if (!activeRoot) return null;
    const relativePath = workingContext?.relativePath || ".";
    return {
      rootId: activeRoot.id,
      rootLabel: activeRoot.label,
      rootKind: activeRoot.kind,
      rootPath: activeRoot.path,
      projectId: activeRoot.projectId,
      projectName: activeRoot.projectName,
      projectEmoji: activeRoot.projectEmoji,
      relativePath,
      workingDir: workingContext?.workingDir || absoluteFromRoot(activeRoot.path, relativePath),
    };
  }, [activeRoot, isWorkExperience, workingContext?.projectEmoji, workingContext?.projectId, workingContext?.projectName, workingContext?.relativePath, workingContext?.rootId, workingContext?.workingDir]);

  // A removed or unavailable Project folder is cleared only after roots finish
  // loading. Crucially, a null context remains null; it is never replaced with
  // the first or most recently used Project.
  useEffect(() => {
    if (isWorkExperience && fileRootsLoaded && workingContext?.rootId && !activeRoot && onWorkingContextChange) {
      onWorkingContextChange(null);
    }
  }, [activeRoot, fileRootsLoaded, isWorkExperience, onWorkingContextChange, workingContext?.rootId]);
  const activeContextLabel = labelForWorkingContext(activeWorkingContext, activeRoot);
  const activeProjectEmoji = chosenProjectEmoji(activeWorkingContext?.projectEmoji);
  const supportsReasoningControl = supportsReasoning && modelCapabilities?.reasoningType === 'effort_string';
  const currentReasoningOptions = useMemo(() => {
    if (!supportsReasoningControl) return [];
    const tiers = modelCapabilities?.reasoningTiers || ["low", "medium", "high"];
    const baseOptions = [
      { value: "auto", label: "Auto", short: "Think auto", description: "Let the provider choose." }
    ];
    const tierMap = {
      none: { value: "off", label: "Off", short: "Think off", description: "Answers straight away, without reasoning first." },
      minimal: { value: "minimal", label: "Minimal", short: "Think min", description: "Fastest reasoning." },
      low: { value: "low", label: "Low", short: "Think low", description: "Faster, lighter reasoning." },
      medium: { value: "medium", label: "Medium", short: "Think med", description: "Balanced reasoning." },
      high: { value: "high", label: "High", short: "Think high", description: "More careful reasoning." },
      xhigh: { value: "xhigh", label: "Extra high", short: "Think xhigh", description: "Even more careful reasoning." },
      max: { value: "max", label: "Max", short: "Think max", description: "The most effort this model offers. Slowest." },
    };
    for (const t of tiers) {
      if (tierMap[t]) baseOptions.push(tierMap[t]);
    }
    return baseOptions;
  }, [modelCapabilities, supportsReasoningControl]);

  const usesExternalEngine = Boolean(engine && engine !== "asyncat");

  // Claude Code and Codex answer on their own; Asyncat's model doesn't matter.
  // A chat on a model file or saved model can always send: a local model
  // loads when the message goes.
  const localModelSendBlockReason = usesExternalEngine || lockedTo
    ? null
    : modelBlockReason({ model: answeringModel || { ref: activeBrain.defaultRef }, brain: activeBrain });

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

  // Let other surfaces drop text into the composer (e.g. the browser's
  // "Ask agent about this page"). Fills the box, focuses it, cursor at the end.
  useEffect(() => {
    const unsub = eventBus.on('composer:prefill', (text) => {
      if (typeof text !== 'string' || !text.trim()) return;
      setValue(text);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* not focusable yet */ }
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!externalFileAttachment) return;
    const isPromptOnly = Boolean(externalFileAttachment.promptOnly);
    if (!isWorkExperience && !isPromptOnly) return;
    const mime = externalFileAttachment.mime || externalFileAttachment.mimeType || '';
    const ext = externalFileAttachment.ext || externalFileAttachment.name?.split('.').pop() || '';
    if (attachmentKind({ ...externalFileAttachment, mime, ext }) === 'image' && !supportsImageInput) {
      setError("This chat's model can't read images. Pick a model that can.");
      return;
    }
    const attachmentPath = externalFileAttachment.path
      || `prompt://${externalFileAttachment.nonce || Date.now()}-${safeAttachmentName(externalFileAttachment.name || 'attachment')}`;
    setFileAttachments(prev => {
      const rootId = externalFileAttachment.rootId || activeWorkingContext?.rootId || (isPromptOnly ? 'none' : null);
      if (!rootId) return prev;
      if (prev.some(file => file.path === attachmentPath && file.rootId === rootId)) return prev;
      return [...prev, {
        ...externalFileAttachment,
        rootId,
        path: attachmentPath,
        name: externalFileAttachment.name || basename(attachmentPath),
        ext,
        mime,
      }];
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [activeWorkingContext?.rootId, externalFileAttachment, isWorkExperience, supportsImageInput]);


  // A default agent is picked for new chats, visibly, in the agent picker.
  useEffect(() => {
    if (!onAgentChange || !profilesLoaded || hasMessages || selectedAgentId !== undefined) return;
    const defaultAgent = agentProfiles.find(profile => profile.is_default);
    if (defaultAgent) onAgentChange(defaultAgent.id);
  }, [agentProfiles, hasMessages, onAgentChange, profilesLoaded, selectedAgentId]);

  useEffect(() => {
    if (!isWorkExperience) {
      setFileRoots([]);
      setFileRootsLoaded(false);
      return undefined;
    }
    let cancelled = false;
    setFileRootsLoaded(false);
    filesApi
      .getRoots()
      .then((res) => {
        if (cancelled) return;
        const roots = (res.roots || []).filter(root => root.kind === 'project');
        setFileRoots(roots);
      })
      .catch(() => {
        if (!cancelled) setFileRoots([]);
      })
      .finally(() => {
        if (!cancelled) setFileRootsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isWorkExperience]);

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
        const rootId = activeWorkingContext?.rootId;
        if (!rootId) return;
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
    const rootId = activeWorkingContext?.rootId;
    if (!rootId) return;
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

  const removeFileAttachment = useCallback((path, rootId = null) => {
    setFileAttachments(prev => prev.filter(f => !(f.path === path && f.rootId === rootId)));
  }, []);

  const handlePickedFiles = useCallback(async (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length || disabled) return;

    const rootId = activeWorkingContext?.rootId;
    const selected = picked.slice(0, rootId ? 8 : 2);
    const imageFiles = selected.filter(file => String(file.type || '').toLowerCase().startsWith('image/'));
    const supportedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (imageFiles.some(file => !supportedImageTypes.has(String(file.type || '').toLowerCase()))) {
      setError('Image input supports PNG, JPEG, WebP, and GIF files.');
      return;
    }
    if (!rootId && imageFiles.some(file => Number(file.size || 0) > 5_000_000)) {
      setError('Each prompt image must be 5 MB or smaller.');
      return;
    }
    if (imageFiles.length > 0 && !supportsImageInput) {
      setError("This chat's model can't read images. Pick a model that can.");
      return;
    }
    if (!rootId && selected.some(file => !String(file.type || '').toLowerCase().startsWith('image/'))) {
      setError('Select a Project to attach non-image files.');
      return;
    }
    setUploadingAttachment(true);
    setError(null);

    try {
      const uploaded = [];
      for (const file of selected) {
        if (!rootId) {
          const safeName = safeAttachmentName(file.name);
          const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Could not read image'));
            reader.readAsDataURL(file);
          });
          uploaded.push({
            rootId: 'none',
            path: `prompt://${stamp}-${safeName}`,
            name: file.name,
            ext: file.name.split('.').pop() || '',
            mime: file.type || '',
            size: file.size,
            dataUrl,
            promptOnly: true,
          });
          continue;
        }
        const saved = await filesApi.attach(rootId, file);
        uploaded.push({
          rootId,
          path: saved.path,
          name: file.name,
          ext: file.name.split(".").pop() || "",
          mime: file.type || "",
          size: file.size,
          uploaded: true,
        });
      }

      setFileAttachments(prev => {
        const seen = new Set(prev.map(file => `${file.rootId || "none"}:${file.path}`));
        const next = [...prev];
        for (const file of uploaded) {
          const key = `${file.rootId || "none"}:${file.path}`;
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
  }, [activeWorkingContext?.rootId, disabled, supportsImageInput]);

  const handleSubmit = useCallback(
    async (e, overrideText = null) => {
      if (e) e.preventDefault();
      const textToSend = overrideText || value;
      if (!textToSend?.trim() || disabled) return;
      if (localModelSendBlockReason) {
        return;
      }
      if (!supportsImageInput && fileAttachments.some(file => attachmentKind(file) === 'image')) {
        setError("This chat's model can't read images. Remove the image or pick a model that can.");
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
          const key = `${meta?.rootId || "none"}:${meta?.path}`;
          if (meta && !seenPaths.has(key)) {
            seenPaths.add(key);
            resolvedInline.push({ ...meta, inline: true });
          }
        }
        const allFileAttachments = [...resolvedInline, ...fileAttachments];

        const messageToSend = {
          content: textToSend.trim(),
          agentMentions: detectedAgentMentions,
          fileAttachments: allFileAttachments.length > 0 ? allFileAttachments : undefined,
          reasoningEffort: supportsReasoning ? reasoningEffort : "auto",
          enabledIntegrationTools: Array.isArray(enabledIntegrationTools) ? enabledIntegrationTools : [],
        };

        // The message leaves the box as soon as it is sent, so it doesn't sit
        // in the composer (and repeat its bubble) for the whole reply. It
        // comes back only if sending fails.
        const draft = { value, fileAttachments, inlineMentions };
        setValue("");
        setFileAttachments([]);
        setInlineMentions(new Map());
        setError(null);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        try {
          await onSubmit(messageToSend, []);
        } catch (submitError) {
          setValue((current) => current || draft.value);
          setFileAttachments((current) => (current.length ? current : draft.fileAttachments));
          setInlineMentions((current) => (current.size ? current : draft.inlineMentions));
          throw submitError;
        }
      } catch (err) {
        console.error("Failed to submit message:", err);
        setError("Failed to send message. Please try again.");
      }
    },
    [value, disabled, localModelSendBlockReason, supportsImageInput, onSubmit, detectedAgentMentions, fileAttachments, inlineMentions, supportsReasoning, reasoningEffort, enabledIntegrationTools],
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

  const selectWorkingContext = useCallback((rootId, relativePath = ".") => {
    if (rootId && typeof rootId === 'object' && rootId.projectOnly) {
      const project = rootId.project || {};
      const nextContext = {
        rootId: null,
        projectId: project.id,
        projectName: project.name,
        projectEmoji: project.emoji,
        relativePath: ".",
        workingDir: null,
      };
      if (hasMessages && activeWorkingContext?.projectId !== project.id) {
        setPendingContextSwitch(nextContext);
        return;
      }
      onWorkingContextChange?.(nextContext);
      setContextModalOpen(false);
      return;
    }
    if (rootId === 'none' || !rootId) {
      if (hasMessages && activeWorkingContext) {
        setPendingContextSwitch({ noProject: true });
        return;
      }
      onWorkingContextChange?.(null);
      setContextModalOpen(false);
      return;
    }
    const root = fileRoots.find(item => item.id === rootId);
    if (!root || !onWorkingContextChange) return;
    const nextContext = {
      rootId: root.id,
      rootLabel: root.label,
      rootKind: root.kind,
      rootPath: root.path,
      projectId: root.projectId,
      projectName: root.projectName,
      projectEmoji: root.projectEmoji,
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
  }, [activeWorkingContext, fileRoots, hasMessages, onWorkingContextChange]);

  const [projectList, setProjectList] = useState([]);
  const openWorkingContextMenu = useCallback(async () => {
    setContextModalOpen(true);
    try {
      const res = await projectApi.getProjects();
      setProjectList(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // The folder list still shows projects that have folders.
    }
  }, []);

  const confirmContextSwitch = useCallback(() => {
    if (!pendingContextSwitch) return;
    onWorkingContextChange(pendingContextSwitch.noProject ? null : pendingContextSwitch);
    setPendingContextSwitch(null);
    setContextModalOpen(false);
  }, [pendingContextSwitch, onWorkingContextChange]);

  const cancelContextSwitch = useCallback(() => {
    setPendingContextSwitch(null);
  }, []);



  // Recorded as 16 kHz WAV, which speech recognition takes without ffmpeg.
  // Hands-free (voice mode) stops by itself when you stop talking.
  const finishRecording = async (result) => {
    mediaRecorderRef.current = null;
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
    setRecordingDuration(0);
    if (!result?.blob || result.heard === false) return;
    try {
      const res = await audioApi.whisper.transcribe(result.blob);
      const transcribed = String(res.text || '').trim();
      if (!transcribed) return;
      setValue(prev => {
        const base = prev.trim();
        return base ? `${base} ${transcribed}` : transcribed;
      });
      // Voice Mode: send it after a moment, so the words show first.
      if (voiceConversationActive) {
        setTimeout(() => {
          handleSubmit(null, transcribed);
        }, 400);
      }
    } catch (err) {
      setError('Failed to transcribe audio: ' + err.message);
    }
  };

  const startRecording = async ({ handsFree = false } = {}) => {
    if (mediaRecorderRef.current) return;
    try {
      const recorder = await startWavRecording({
        autoStop: handsFree,
        onAutoStop: finishRecording,
      });
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      const startMs = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - startMs);
      }, 1000);
    } catch (err) {
      setError('Could not access microphone: ' + err.message);
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    finishRecording(await recorder.stop());
  };

  // Hands-free: when an answer has been read aloud, listen again.
  useEffect(() => {
    if (autoRecordPrompt && voiceConversationActive && !isRecording && !disabled) {
      startRecording({ handsFree: true });
    }
    // startRecording changes identity every render; this follows the prompt only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRecordPrompt, voiceConversationActive]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.cancel();
      mediaRecorderRef.current = null;
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
    return "border-line-strong focus-within:border-fg-subtle/70";
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
      <div className={`w-full max-w-3xl mx-auto px-4 sm:px-6 ${isWorkExperience ? "py-3" : "py-2.5"}`}>
        <form onSubmit={handleSubmit}>
            <div
              className={`border bg-surface px-4 transition-[border-color,box-shadow] shadow-[0_2px_8px_rgba(15,23,42,0.04),0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] ${getBorderColor()} ${
                isWorkExperience ? "rounded-[1.4rem] pb-3 pt-3.5" : "rounded-[1.5rem] pb-2.5 pt-3.5"
              }`}
            >
              {error && (
                <Notice
                  tone="error"
                  className="mb-3"
                  action={(
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      aria-label="Dismiss"
                      className="flex h-6 w-6 items-center justify-center rounded-md opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500/40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                >
                  {error}
                </Notice>
              )}

              {localModelSendBlockReason && !disabled && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-hover py-1.5 pl-3 pr-1.5 text-[13px] text-fg-muted">
                  <div className="flex min-w-0 items-center gap-2">
                    {activeBrain.isLoadingModel || activeBrain.loading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Cpu className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{localModelSendBlockReason}</span>
                  </div>
                  {!(activeBrain.isLoadingModel || activeBrain.loading) && (
                    <Button variant="primary" size="xs" onClick={() => navigate('/models')}>
                      {activeBrain.rawModel ? "Change model" : "Choose a model"}
                    </Button>
                  )}
                </div>
              )}

              <div className="relative">
                {highlightedSegments && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-base leading-relaxed text-fg"
                    style={{ padding: 0, fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit" }}
                  >
                    {highlightedSegments.map((part, i) =>
                      part.type === "mention" ? (
                        <span key={i} className="text-accent">
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
                  rows={isWorkExperience ? 2 : 1}
                  style={{ padding: 0 }}
                  className={`w-full resize-none bg-transparent focus:outline-none text-base leading-relaxed max-h-45 disabled:opacity-50 caret-fg placeholder:text-fg-subtle ${isWorkExperience ? "min-h-12" : "min-h-8"} ${
                    highlightedSegments ? "text-transparent" : "text-fg"
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
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface text-sm ring-1 ring-inset ring-line">
                              {chosenAgentIcon(profile.icon) || <span className="text-[11px] font-medium text-fg-muted">{String(profile.name || "#").charAt(0).toUpperCase()}</span>}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-fg">
                                {profile.name}
                              </span>
                              <span className="block truncate text-[11px] text-fg-subtle">
                                #{profile.handle}{profile.description ? ` · ${profile.description}` : ''}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-fg-subtle">
                        {!profilesLoaded ? 'Loading agents…' : agentProfiles.length ? 'No agents match' : 'No agents yet'}
                      </div>
                    )}
                  </div>
                )}

                {fileTrigger && (
                  <div className={suggestionPanelClass}>
                    {fileSearchLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-subtle">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Searching files…
                      </div>
                    ) : fileSearchResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto p-1">
                        {fileSearchResults.map((file, index) => {
                          const { Icon } = fileIconMeta(file.ext, file.type);
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
                                <Icon className="h-4 w-4 text-fg-subtle" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-baseline gap-2">
                                  <span className="truncate text-[13px] font-medium text-fg">
                                    {file.path === '.' || file.type === 'dir' ? file.name : (
                                      <>
                                        {dirname(file.path) !== '.' && (
                                          <span className="font-normal text-fg-subtle">{dirname(file.path)}/</span>
                                        )}
                                        <span>{basename(file.path)}</span>
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
                      <div className="px-3 py-2 text-xs text-fg-subtle">
                        {fileSearchLoaded ? 'No files match' : 'Searching files…'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {fileAttachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {fileAttachments.map(file => (
                    <AttachmentChip
                      key={`${file.rootId || "none"}:${file.path}`}
                      file={file}
                      capabilities={effectiveMultimodalCapabilities}
                      onRemove={() => removeFileAttachment(file.path, file.rootId || null)}
                      onPreview={setLightbox}
                    />
                  ))}
                </div>
              )}


            <div className={`${isWorkExperience ? "mt-2.5" : "mt-1.5"} flex items-center justify-between gap-2 bg-transparent text-fg-muted select-none`}>
              {/* On a narrow window the pickers wrap, and the model's name shortens. */}
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <button
                  ref={plusButtonRef}
                  type="button"
                  onClick={() => setOpenMenu((current) => (current === "plus" ? null : "plus"))}
                  disabled={disabled}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "plus"}
                  aria-label="Add files and more"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
                  title="Add files and more"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <Menu anchorRef={plusButtonRef} open={openMenu === "plus"} onClose={() => setOpenMenu(null)} placement="top-start" width={256} label="Add files and more">
                  {(isWorkExperience || supportsImageInput) && (
                    <MenuItem
                      icon={Paperclip}
                      label={isWorkExperience ? (supportsImageInput ? 'Add photos and files' : 'Add files') : 'Add photos'}
                      onSelect={() => filePickerRef.current?.click()}
                    />
                  )}
                  {isWorkExperience && window?.electronAPI?.openFilesDialog && (
                    <MenuItem
                      icon={FolderSearch}
                      label="Browse this computer"
                      onSelect={async () => {
                        const result = await window.electronAPI.openFilesDialog({ multiSelections: false });
                        if (result?.canceled || !result?.filePaths?.length) return;
                        const filePath = result.filePaths[0];
                        const name = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
                        if (onNativeFileAttach) {
                          onNativeFileAttach({ name, path: filePath, type: 'file', nonce: Date.now() });
                        }
                      }}
                    />
                  )}
                  {voiceConversationAvailable && onToggleVoiceMode && (
                    <div className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Headphones className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
                        <div className="min-w-0">
                          <span className="block text-[13px] text-fg">Voice mode</span>
                          <span className="block text-[11px] leading-4 text-fg-subtle">
                            {voiceConversationActive ? "On: talk hands-free" : "Talk hands-free"}
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={Boolean(voiceConversationActive)}
                        onChange={() => onToggleVoiceMode()}
                        disabled={disabled}
                        label="Voice mode"
                      />
                    </div>
                  )}

                  {onReasoningEffortChange && supportsReasoningControl && (
                    <>
                      <MenuSeparator />
                      <MenuLabel>Reasoning effort</MenuLabel>
                      <div role="radiogroup" aria-label="Reasoning effort" className="flex flex-wrap gap-1 px-2 pb-1.5">
                        {currentReasoningOptions.map((option) => {
                          const selected = option.value === reasoningEffort;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              title={option.description}
                              onClick={() => onReasoningEffortChange(option.value)}
                              className={`rounded-md px-2 py-1 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
                                selected ? "bg-selected text-fg" : "text-fg-muted hover:bg-hover hover:text-fg"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {onEnabledIntegrationToolsChange && allowWorkspaceAccess && (
                    <>
                      <MenuSeparator />
                      <MenuLabel>Plugins</MenuLabel>
                      {INTEGRATION_TOOL_PACKS.map((pack) => (
                        <MenuItem
                          key={pack.id}
                          icon={pack.icon}
                          label={pack.label}
                          checked={pack.tools.some(tool => enabledIntegrationSet.has(tool))}
                          keepOpen
                          onSelect={() => toggleIntegrationPack(pack)}
                        />
                      ))}
                    </>
                  )}
                </Menu>

                {lockedTo ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-fg-muted" title={`Messages go to ${lockedTo.name}, which uses its own brain, model and freedom`}>
                    {lockedTo.avatar?.startsWith?.('data:image/')
                      ? <img src={lockedTo.avatar} alt="" className="h-4 w-4 rounded object-cover" />
                      : lockedTo.avatar
                        ? <span aria-hidden="true">{lockedTo.avatar}</span>
                        : <CatIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    To {lockedTo.name}
                  </span>
                ) : null}
                {!lockedTo && (engines.some(item => item.installed) || usesExternalEngine) && (
                  <EnginePicker engine={engine} engines={engines} onChange={onEngineChange} disabled={disabled} />
                )}
                {!lockedTo && usesExternalEngine && (
                  <EngineModelPicker engine={engine} engines={engines} value={engineModel} onChange={onEngineModelChange} disabled={disabled} />
                )}
                {!lockedTo && onAgentChange && (agentProfiles.length > 0 || selectedAgentId) && (
                  <AgentPicker
                    agents={agentProfiles}
                    selectedAgentId={selectedAgentId || null}
                    onChange={onAgentChange}
                    onManage={() => navigate('/agents')}
                    disabled={disabled}
                  />
                )}

                {!usesExternalEngine && !lockedTo && (
                  <ChatModelPicker
                    model={chatModel || { ref: activeBrain.defaultRef, name: activeBrain.defaultName || activeBrain.providerName, isLocal: activeBrain.isLocal, followsDefault: true }}
                    options={modelOptions}
                    agentModel={agentModel}
                    loading={modelLoading}
                    busy={modelBusy}
                    disabled={disabled || !onChatModelChange}
                    temporary={temporaryChat}
                    openRequest={modelMenuRequest}
                    onChange={onChatModelChange}
                    onOpen={onModelMenuOpen}
                    onManage={() => navigate("/models")}
                  />
                )}

              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <input
                  ref={filePickerRef}
                  type="file"
                  multiple
                  accept={!isWorkExperience ? 'image/png,image/jpeg,image/webp,image/gif' : undefined}
                  className="hidden"
                  onChange={handlePickedFiles}
                />

                {supportsImageInput && (
                  <button
                    type="button"
                    onClick={() => filePickerRef.current?.click()}
                    disabled={disabled || uploadingAttachment}
                    title={`Add an image for ${answeringModel?.name || activeBrain.model || "this chat's model"}`}
                    aria-label="Add an image"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40"
                  >
                    {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  </button>
                )}

                {sttReady && (
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : () => startRecording({ handsFree: voiceConversationActive })}
                    disabled={disabled && !isRecording}
                    title={isRecording ? "Stop recording" : voiceConversationActive ? "Voice mode is on" : "Speak instead of typing"}
                    aria-label={isRecording ? "Stop recording" : "Speak instead of typing"}
                    aria-pressed={voiceConversationActive || undefined}
                    className={`flex h-8 items-center justify-center gap-2 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
                      isRecording
                        ? "w-auto bg-red-500/10 px-2.5 text-red-600 dark:text-red-400"
                        : autoRecordPrompt
                          ? "w-8 bg-selected text-fg ring-1 ring-line-strong"
                          : voiceConversationActive
                            ? "w-8 bg-selected text-fg"
                            : "w-8 text-fg-muted hover:bg-hover hover:text-fg"
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
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-canvas transition-[opacity,transform] hover:opacity-90 active:scale-95"
                      title="Stop generating"
                      aria-label="Stop generating"
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2">
                    {tokenUsage?.totalTokens > 0 && <TokenBar usage={tokenUsage} />}
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,opacity,transform] duration-200 ${
                        canSubmit
                          ? "bg-fg text-canvas hover:opacity-90 active:scale-95"
                          : "cursor-not-allowed bg-hover text-fg-subtle"
                      }`}
                      title={localModelSendBlockReason || (canSubmit ? "Send" : "Type a message")}
                      aria-label="Send"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  </div>
                )}
              </div>
            </div>

              {isWorkExperience && !lockedTo && (activeWorkingContext || onWorkingContextChange) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 select-none">
            {/* Project and working-folder selector */}
            {activeWorkingContext && (
              <button
                type="button"
                onClick={openWorkingContextMenu}
                disabled={disabled || !onWorkingContextChange}
                title={activeWorkingContext.workingDir
                  ? `This chat can access: ${activeWorkingContext.workingDir}`
                  : "Uses this project's instructions and knowledge. No folder is selected, so local files are unavailable."}
                className={`${chipClass} min-w-0 max-w-full`}
              >
                {(() => {
                  const RootIcon = rootIcon(activeRoot?.kind);
                  return <RootIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />;
                })()}
                <span className="truncate">{activeProjectEmoji ? `${activeProjectEmoji} ` : ''}{activeWorkingContext.projectName || "Project"}</span>
                {activeWorkingContext.rootId ? (
                  <>
                    <span className="text-fg-subtle/60">/</span>
                    <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{activeContextLabel}</span>
                  </>
                ) : (
                  <span className="text-fg-subtle">· no folder</span>
                )}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            )}
            {!activeWorkingContext && externalFolder && (
              <span
                title={`Continues the session in ${externalFolder}`}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-muted"
              >
                <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{folderName(externalFolder)}</span>
              </span>
            )}
            {!activeWorkingContext && !externalFolder && (
              <button
                type="button"
                onClick={openWorkingContextMenu}
                disabled={disabled || !onWorkingContextChange}
                title="No project, so this chat can't use your files"
                className={`${chipClass} min-w-0`}
              >
                <ShieldOff className="h-3.5 w-3.5" /> No project
              </button>
            )}

            {onToolsPreferenceChange && !usesExternalEngine && (
              <ToolsPreferenceControl value={toolsPreference} onChange={onToolsPreferenceChange} disabled={disabled} />
            )}

            {/* How freely the agent acts: Plan, Action or Yolo. */}
            {(usesExternalEngine || toolsPreference !== "off") && (onAgentModeChange || onToggleAgentMode || onToggleTools) && (
              <>
                <button
                  ref={modeButtonRef}
                  type="button"
                  onClick={() => setModeMenuOpen(open => !open)}
                  disabled={disabled}
                  aria-haspopup="menu"
                  aria-expanded={modeMenuOpen}
                  className={chipClass}
                >
                  {!isActionMode ? (
                    <>
                      <ClipboardPen className="h-3.5 w-3.5 shrink-0" />
                      <span>Plan</span>
                    </>
                  ) : autoApprove ? (
                    <>
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      <span>Yolo</span>
                    </>
                  ) : (
                    <>
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <span>Action</span>
                    </>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                <Menu anchorRef={modeButtonRef} open={modeMenuOpen} onClose={() => setModeMenuOpen(false)} placement="top-start" width={240} label="How the agent works">
                  <MenuItem
                    icon={ClipboardPen}
                    label={(
                      <span className="flex flex-col py-0.5">
                        <span className="text-fg">Plan</span>
                        <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">Read-only tools only</span>
                      </span>
                    )}
                    checked={!isActionMode}
                    onSelect={() => setAgentMode('plan')}
                  />
                  <MenuItem
                    icon={Wrench}
                    label={(
                      <span className="flex flex-col py-0.5">
                        <span className="text-fg">Action</span>
                        <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">Asks before each tool call</span>
                      </span>
                    )}
                    checked={isActionMode && !autoApprove}
                    onSelect={() => {
                      setAgentMode('action');
                      if (autoApprove && onToggleAutoApprove) onToggleAutoApprove();
                    }}
                  />
                  {onToggleAutoApprove && (
                    <MenuItem
                      icon={Zap}
                      label={(
                        <span className="flex flex-col py-0.5">
                          <span className="text-fg">Yolo</span>
                          <span className="whitespace-normal text-[11px] leading-4 text-fg-subtle">Approves every tool call itself</span>
                        </span>
                      )}
                      checked={isActionMode && autoApprove}
                      onSelect={() => {
                        setAgentMode('action');
                        if (!autoApprove) onToggleAutoApprove();
                      }}
                    />
                  )}
                </Menu>
              </>
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
        projects={projectList}
        activeProjectId={activeWorkingContext?.projectId || null}
        initialRootId={activeWorkingContext?.rootId || "none"}
        initialRelativePath={activeWorkingContext?.relativePath || "."}
        activeWorkingDir={activeWorkingContext?.workingDir || ""}
        onManageProjects={() => { setContextModalOpen(false); navigate('/projects'); }}
      />

      <ConfirmModal
        isOpen={!!pendingContextSwitch}
        onClose={cancelContextSwitch}
        onConfirm={confirmContextSwitch}
        title="Change this chat's project?"
        message="New messages use the new project. Earlier messages stay in this chat."
        confirmLabel="Change project"
        cancelLabel="Keep current"
      />
    </div>
  );
};

export default MessageInputV2;
