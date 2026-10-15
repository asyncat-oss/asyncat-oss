import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BrainCircuit,
  ChevronRight,
  ChevronsUpDown,
  CircleArrowUp,
  Cpu,
  Folder,
  FolderKanban,
  FolderOpen,
  Info,
  Loader2,
  Monitor,
  Moon,
  MoonStar,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  SlidersHorizontal,
  SquarePen,
  Sun,
  Trash2,
  Wrench,
  Cat as CatIcon,
} from "lucide-react";

import { useCommandCenter } from "../CommandCenter/context/CommandCenterContextEnhanced";
import { chatApi } from "../CommandCenter/api/chatApi.js";
import { useUiPreferences } from "../contexts/UiPreferencesContext.jsx";
import { useUser } from "../contexts/UserContext.jsx";
import { useWorkspace } from "../contexts/WorkspaceContext.jsx";
import { useConfirm } from "../components/confirmContext.js";
import { useToast, errorDetail } from "../components/toastContext.js";
import AsyncatMark from "../components/ui/AsyncatMark.jsx";
import ExternalSessionsSection from "./ExternalSessionsSection.jsx";
import ConversationBadge from "../components/ConversationBadge.jsx";
import { useAgents } from "../Agent/useAgents.js";
import { useWaitingCount } from "../Cats/useCats.js";
import { isSkippedUpdate, openUpdateScreen } from "../components/updateEvents.js";
import Tooltip from "../components/ui/Tooltip.jsx";
import { Menu, MenuItem, MenuSeparator } from "../components/ui/Menu.jsx";
import { formatShortcut } from "../components/ui/shortcuts.js";
import { avatarSrc } from "../assets/dp/avatars.js";
import eventBus from "../utils/eventBus.js";
import { loadKeyboardShortcuts } from "../utils/keyboardShortcutsUtils.js";
import { isPinned, sidebarChatLists, withPinned } from "./chatSearch.js";

const UniversalSearch = lazy(() => import("./UniversalSearch"));

// Below the sm breakpoint the rail always shows icons only.
const labelVisibility = (collapsed) => (collapsed ? "hidden" : "hidden sm:block");
const rowLayout = (collapsed) => (collapsed ? "justify-center px-0" : "justify-center px-0 sm:justify-start sm:px-2.5");

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "midnight", label: "Midnight", icon: MoonStar },
  { value: "system", label: "System", icon: Monitor },
];

const NavRow = memo(({ icon: Icon, label, onClick, isActive = false, collapsed = false, hint = "", badge = null }) => (
  <Tooltip label={label} shortcut={hint} disabled={!collapsed} className="w-full">
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={`group relative flex w-full items-center gap-2.5 rounded-lg text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/40 ${
        collapsed ? "h-9" : "h-8"
      } ${rowLayout(collapsed)} ${
        isActive ? "bg-selected font-medium text-fg" : "text-fg-muted hover:bg-hover hover:text-fg"
      }`}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
        {badge}
      </span>
      <span className={`min-w-0 flex-1 truncate text-left ${labelVisibility(collapsed)}`}>{label}</span>
      {hint && !collapsed ? (
        <kbd className="hidden shrink-0 font-sans text-[11px] font-normal text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
          {hint}
        </kbd>
      ) : null}
    </button>
  </Tooltip>
));

NavRow.displayName = "NavRow";
NavRow.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  isActive: PropTypes.bool,
  collapsed: PropTypes.bool,
  hint: PropTypes.string,
  badge: PropTypes.node,
};

const GROUP_OPEN_KEY = "asyncat_sidebar_customize_open";

// "Customize": Models, Agents and Tools & Skills behind one row. Expands in
// place in the full sidebar and opens a small menu from the collapsed rail.
const NavGroup = ({ icon: Icon, label, items, collapsed, onNavigate }) => {
  const anyActive = items.some((item) => item.active);
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(GROUP_OPEN_KEY) === "true"; } catch { return false; }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef(null);
  const expanded = open || anyActive;
  const toggle = () => setOpen((value) => {
    try { localStorage.setItem(GROUP_OPEN_KEY, String(!value)); } catch { /* localStorage may be unavailable */ }
    return !value;
  });

  if (collapsed) {
    return (
      <>
        <Tooltip label={label} disabled={menuOpen} className="w-full">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`flex h-9 w-full items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
              anyActive ? "bg-selected text-fg" : "text-fg-muted hover:bg-hover hover:text-fg"
            }`}
          >
            <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
          </button>
        </Tooltip>
        <Menu anchorRef={buttonRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="right-start" width={200} label={label}>
          {items.map((item) => (
            <MenuItem key={item.key} icon={item.icon} label={item.label} hint={item.hint} checked={item.active} onSelect={() => onNavigate(item)} />
          ))}
        </Menu>
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className={`group flex h-8 w-full items-center gap-2.5 rounded-lg text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/40 ${rowLayout(false)} text-fg-muted hover:bg-hover hover:text-fg`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </span>
        <span className={`min-w-0 flex-1 truncate text-left ${labelVisibility(false)}`}>{label}</span>
        <ChevronRight className={`hidden h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform sm:block ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded ? (
        <div className="mt-px space-y-px sm:pl-[26px]">
          {items.map((item) => (
            <NavRow
              key={item.key}
              icon={item.icon}
              label={item.label}
              hint={item.hint}
              onClick={() => onNavigate(item)}
              isActive={item.active}
              collapsed={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

NavGroup.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.elementType.isRequired,
    active: PropTypes.bool,
    hint: PropTypes.string,
  })).isRequired,
  collapsed: PropTypes.bool,
  onNavigate: PropTypes.func.isRequired,
};

function conversationProjectId(conversation) {
  const workingContext = conversation?.metadata?.workingContext || conversation?.workingContext;
  if (workingContext?.projectId) return String(workingContext.projectId);
  let projectIds = conversation?.project_ids;
  if (typeof projectIds === "string") {
    try { projectIds = JSON.parse(projectIds); } catch { projectIds = []; }
  }
  return Array.isArray(projectIds) && projectIds[0] ? String(projectIds[0]) : null;
}

function conversationUpdatedAt(conversation) {
  return new Date(
    conversation?.last_message_at || conversation?.updated_at || conversation?.created_at || 0,
  ).getTime() || 0;
}

const RecentConversationItem = memo(({ conversation, active, running, onOpen, onRename, onDelete, onTogglePin, nested = false, agentsById = null }) => {
  const title = conversation.title || "Untitled conversation";
  const pinned = isPinned(conversation);
  const menuButtonRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const renameDoneRef = useRef(false);

  const startRename = () => {
    renameDoneRef.current = false;
    setDraft(title);
    setRenaming(true);
  };

  // Enter and the blur that follows both land here; only the first one counts.
  const finishRename = (save) => {
    if (renameDoneRef.current) return;
    renameDoneRef.current = true;
    setRenaming(false);
    const next = draft.trim();
    if (save && next && next !== title) onRename(conversation.id, next);
  };

  if (renaming) {
    return (
      <div className={`flex h-8 items-center rounded-lg bg-hover pr-1.5 ${nested ? "pl-7" : "pl-1.5"}`}>
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={() => finishRename(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") finishRename(true);
            if (event.key === "Escape") finishRename(false);
          }}
          aria-label="Chat name"
          className="h-6 min-w-0 flex-1 rounded-md border border-line-strong bg-canvas px-1.5 text-[13px] text-fg outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <div
      className={`group relative flex h-8 items-center rounded-lg transition-colors ${
        active ? "bg-selected text-fg" : "text-fg-muted hover:bg-hover hover:text-fg"
      } ${menuOpen ? "bg-hover text-fg" : ""}`}
    >
      <button
        type="button"
        onClick={() => onOpen(conversation.id)}
        title={title}
        aria-current={active ? "page" : undefined}
        className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${nested ? "pl-7" : "pl-2.5"}`}
      >
        <ConversationBadge conversation={conversation} agentsById={agentsById} />
        <span className={`min-w-0 flex-1 truncate text-[13px] ${active ? "font-medium" : ""}`}>{title}</span>
      </button>

      <span className="pointer-events-none absolute right-2 flex h-4 w-4 items-center justify-center group-hover:opacity-0 group-focus-within:opacity-0">
        {running ? <Loader2 aria-label="Generating" className="h-3.5 w-3.5 animate-spin text-accent" /> : null}
      </span>

      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={`Options for ${title}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-chat-options={conversation.id}
        className={`absolute right-1 flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle outline-none transition-opacity hover:bg-selected hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Menu anchorRef={menuButtonRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end" width={176} label="Chat options">
        <MenuItem icon={pinned ? PinOff : Pin} label={pinned ? "Unpin" : "Pin"} onSelect={() => onTogglePin(conversation)} />
        <MenuItem icon={Pencil} label="Rename" onSelect={startRename} />
        <MenuSeparator />
        <MenuItem icon={Trash2} label="Delete" danger onSelect={() => onDelete(conversation)} />
      </Menu>
    </div>
  );
});

RecentConversationItem.displayName = "RecentConversationItem";
RecentConversationItem.propTypes = {
  conversation: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string,
    mode: PropTypes.string,
    is_pinned: PropTypes.oneOfType([PropTypes.bool, PropTypes.number]),
  }).isRequired,
  active: PropTypes.bool,
  running: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onTogglePin: PropTypes.func.isRequired,
  nested: PropTypes.bool,
  agentsById: PropTypes.instanceOf(Map),
};

const ProjectConversationGroup = memo(({
  project,
  conversations,
  pinnedCount = 0,
  expanded,
  active,
  activeConversationId,
  activeConversationIds,
  onToggle,
  onOpenProject,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation,
  onTogglePinConversation,
  agentsById = null,
}) => {
  const ProjectIcon = expanded ? FolderOpen : Folder;
  const name = project.name || "Untitled project";

  return (
    <div>
      <div className={`group relative flex h-8 items-center rounded-lg transition-colors ${active ? "bg-selected" : "hover:bg-hover"}`}>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-lg pl-1.5 pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
          aria-expanded={expanded}
          title={name}
        >
          <ChevronRight className={`h-3 w-3 shrink-0 text-fg-subtle transition-transform ${expanded ? "rotate-90" : ""}`} />
          <ProjectIcon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
          <span className={`min-w-0 flex-1 truncate text-[13px] ${active ? "font-medium text-fg" : "text-fg-muted group-hover:text-fg"}`}>
            {name}
          </span>
          {conversations.length > 0 ? (
            <span className="text-[11px] tabular-nums text-fg-subtle group-hover:opacity-0">{conversations.length}</span>
          ) : null}
        </button>
        <Tooltip label="Open project" side="top" className="absolute right-1">
          <button
            type="button"
            onClick={onOpenProject}
            aria-label={`Open ${name}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle opacity-0 outline-none transition-opacity hover:bg-selected hover:text-fg group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
      {expanded ? (
        <div className="mt-px space-y-px">
          {conversations.length > 0 ? conversations.map((conversation) => (
            <RecentConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              running={activeConversationIds.has(conversation.id)}
              onOpen={onOpenConversation}
              onRename={onRenameConversation}
              onDelete={onDeleteConversation}
              onTogglePin={onTogglePinConversation}
              agentsById={agentsById}
              nested
            />
          )) : (
            <button
              type="button"
              onClick={onOpenProject}
              className="flex h-8 w-full items-center rounded-lg pl-7 pr-2.5 text-left text-[12px] text-fg-subtle transition-colors hover:bg-hover hover:text-fg-muted"
            >
              <span className="truncate">{pinnedCount > 0 ? "Pinned above" : "No chats yet"} · Open project</span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
});

ProjectConversationGroup.displayName = "ProjectConversationGroup";
ProjectConversationGroup.propTypes = {
  project: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, name: PropTypes.string }).isRequired,
  conversations: PropTypes.arrayOf(PropTypes.object).isRequired,
  pinnedCount: PropTypes.number,
  expanded: PropTypes.bool,
  active: PropTypes.bool,
  activeConversationId: PropTypes.string,
  activeConversationIds: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onOpenProject: PropTypes.func.isRequired,
  onOpenConversation: PropTypes.func.isRequired,
  onRenameConversation: PropTypes.func.isRequired,
  onDeleteConversation: PropTypes.func.isRequired,
  onTogglePinConversation: PropTypes.func.isRequired,
  agentsById: PropTypes.instanceOf(Map),
};

const SectionHeader = ({ label, onLabelClick, labelTitle, children }) => (
  <div className="group/section flex h-7 items-center justify-between pl-2.5 pr-1">
    <button
      type="button"
      onClick={onLabelClick}
      title={labelTitle}
      className="rounded text-[11px] font-medium text-fg-subtle outline-none transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {label}
    </button>
    {children}
  </div>
);

SectionHeader.propTypes = {
  label: PropTypes.string.isRequired,
  onLabelClick: PropTypes.func,
  labelTitle: PropTypes.string,
  children: PropTypes.node,
};

const DynamicSidebar = ({ onNewChat, basePage, isSearchOpen, onSearchOpen }) => {
  // The search palette loads the first time it opens, then stays mounted.
  const [searchLoaded, setSearchLoaded] = useState(Boolean(isSearchOpen));
  useEffect(() => { if (isSearchOpen) setSearchLoaded(true); }, [isSearchOpen]);
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const [shortcuts, setShortcuts] = useState(loadKeyboardShortcuts);
  const [updateAvailable, setUpdateAvailable] = useState(
    () => sessionStorage.getItem("asyncatUpdateAvailable") === "true",
  );
  const [conversationCatalog, setConversationCatalog] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileButtonRef = useRef(null);
  const recentRequestRef = useRef(0);
  const { sidebarState, setSidebarState, navItemsVisibility, theme, setTheme } = useUiPreferences();
  const { user, profileData } = useUser();
  const { getWorkspaceProjects, bustProjectsCache, currentWorkspace } = useWorkspace();
  const {
    currentConversationId,
    hasActiveRuns,
    chatRunPreviews = [],
    activeConversationIds = new Set(),
    setConversationListRefresh,
  } = useCommandCenter();

  const { agents } = useAgents();
  const agentsById = useMemo(() => new Map(agents.map((agent) => [String(agent.id), agent])), [agents]);

  const collapsed = sidebarState === "collapsed";
  const displayName = profileData?.name || user?.name || "You";
  const latestChatRun = chatRunPreviews[0];
  // The logo goes back to the chat you were in (or the newest running one).
  const chatTarget = currentConversationId
    ? `/conversations/${currentConversationId}`
    : latestChatRun?.conversationId
      ? `/conversations/${latestChatRun.conversationId}`
      : "/home";

  const shortcutHint = useCallback((action) => (
    formatShortcut(Object.values(shortcuts).find((shortcut) => shortcut.action === action))
  ), [shortcuts]);

  const openChat = useCallback(() => {
    navigate(chatTarget);
  }, [chatTarget, navigate]);

  const loadRecentConversations = useCallback(async () => {
    const requestId = ++recentRequestRef.current;
    setRecentLoading(true);
    setRecentError(false);
    try {
      const result = await chatApi.getConversationHistory({
        limit: 80,
        mode: "all",
        archived: false,
      });
      if (requestId !== recentRequestRef.current) return;
      const conversations = [...(result?.conversations || [])]
        .sort((a, b) => conversationUpdatedAt(b) - conversationUpdatedAt(a));
      setConversationCatalog(conversations);
    } catch (error) {
      if (requestId !== recentRequestRef.current) return;
      console.error("Failed to load recent conversations:", error);
      setRecentError(true);
    } finally {
      if (requestId === recentRequestRef.current) setRecentLoading(false);
    }
  }, []);

  // Each chat shows once: pinned chats (projects' too) above everything,
  // other project chats in the Projects tree, and the newest of the rest in
  // Recents.
  const {
    pinned: pinnedConversations,
    recents: recentConversations,
    byProject: conversationsByProject,
    pinnedInProject,
  } = useMemo(() => (
    sidebarChatLists(conversationCatalog, { projectOf: conversationProjectId })
  ), [conversationCatalog]);

  const loadProjects = useCallback(async () => {
    if (!currentWorkspace) {
      setProjects([]);
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);
    try {
      const data = await getWorkspaceProjects();
      setProjects([...(data || [])]
        .filter((project) => !project.is_archived)
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)));
    } finally {
      setProjectsLoading(false);
    }
  }, [currentWorkspace, getWorkspaceProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => eventBus.on("projectsUpdated", () => {
    bustProjectsCache();
    loadProjects();
  }), [bustProjectsCache, loadProjects]);

  useEffect(() => {
    loadRecentConversations();
  }, [loadRecentConversations]);

  useEffect(() => {
    setConversationListRefresh(() => loadRecentConversations);
    return () => {
      recentRequestRef.current += 1;
      setConversationListRefresh(null);
    };
  }, [loadRecentConversations, setConversationListRefresh]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return undefined;
    const markAvailable = (available = true) => {
      sessionStorage.setItem("asyncatUpdateAvailable", available ? "true" : "false");
      setUpdateAvailable(available);
    };
    const handleFlag = (event) => markAvailable(Boolean(event.detail));
    const cleanups = [
      api.onUpdateAvailable((info) => markAvailable(!isSkippedUpdate(info?.version))),
      api.onUpdateNotAvailable(() => markAvailable(false)),
    ];
    window.addEventListener("asyncat:update-flag", handleFlag);
    // The launch check may have finished before this page loaded.
    api.getUpdateState?.()
      .then((state) => { if (state?.checked) markAvailable(Boolean(state.updateInfo) && !isSkippedUpdate(state.updateInfo.version)); })
      .catch(() => {});
    return () => {
      cleanups.forEach((cleanup) => {
        if (typeof cleanup === "function") cleanup();
      });
      window.removeEventListener("asyncat:update-flag", handleFlag);
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const match = Object.values(shortcuts).find((shortcut) => {
        const keyMatch = shortcut.key === event.key;
        const ctrlMatch = shortcut.ctrl
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey && !event.metaKey;
        return keyMatch && ctrlMatch;
      });

      if (!match) return;
      event.preventDefault();

      switch (match.action) {
        case "openSearch": onSearchOpen(true); break;
        case "openSettings": navigate("/settings/profile"); break;
        case "newChat": onNewChat(); break;
        case "navHome": openChat(); break;
        case "navChat": navigate("/all-chats"); break;
        case "navWorkspace": navigate("/projects"); break;
        case "navModels": navigate("/models"); break;
        case "navTools": navigate("/tools"); break;
        case "navScheduled":
        case "navScheduler":
        case "navCats": navigate("/cats"); break;
        case "navProfiles": navigate("/agents"); break;
        case "navAgent": navigate("/agents"); break;
        default: break;
      }
    };

    const handleShortcutsChange = () => setShortcuts(loadKeyboardShortcuts());
    document.addEventListener("keydown", handler);
    window.addEventListener("keyboard-shortcuts-changed", handleShortcutsChange);
    return () => {
      document.removeEventListener("keydown", handler);
      window.removeEventListener("keyboard-shortcuts-changed", handleShortcutsChange);
    };
  }, [navigate, onNewChat, onSearchOpen, openChat, shortcuts]);

  const isOnProjects = basePage === "projects";
  const isOnModels = basePage === "models";
  const isOnAgent = location.pathname === "/agents";
  const isOnCats = location.pathname.startsWith("/cats");
  const isOnFiles = location.pathname.startsWith("/files");
  const catsWaiting = useWaitingCount();
  const isOnTools = location.pathname.startsWith("/tools");
  const routeConversationId = location.pathname.match(/^\/conversations\/([^/]+)/)?.[1] || null;
  const activeRecentConversationId = routeConversationId;
  const routeProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1] || null;
  // A pinned chat is open from Pinned, so its project isn't marked or opened.
  const activeConversationProjectId = useMemo(() => {
    const conversation = conversationCatalog.find((item) => item.id === routeConversationId);
    return conversation && !isPinned(conversation) ? conversationProjectId(conversation) : null;
  }, [conversationCatalog, routeConversationId]);
  const activeProjectId = routeProjectId || activeConversationProjectId;

  useEffect(() => {
    if (!activeProjectId) return;
    setExpandedProjectIds((current) => {
      if (current.has(String(activeProjectId))) return current;
      const next = new Set(current);
      next.add(String(activeProjectId));
      return next;
    });
  }, [activeProjectId]);

  const projectGroups = useMemo(() => projects.map((project) => ({
    project,
    conversations: conversationsByProject.get(String(project.id)) || [],
    pinnedCount: pinnedInProject.get(String(project.id)) || 0,
  })), [conversationsByProject, pinnedInProject, projects]);

  const openConversation = useCallback((conversationId) => {
    navigate(`/conversations/${conversationId}`);
  }, [navigate]);

  const renameConversation = useCallback(async (conversationId, title) => {
    setConversationCatalog((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, title } : conversation
    )));
    try {
      await chatApi.updateConversation(conversationId, { title });
      eventBus.emit("conversationRenamed", { id: conversationId, title });
    } catch (err) {
      toast.error("Couldn't rename the chat", { detail: errorDetail(err) });
      loadRecentConversations();
    }
  }, [loadRecentConversations, toast]);

  // Pinning moves a chat to another section, where its row is a new
  // element. Done from the keyboard, focus follows the chat to its options
  // button (or to Recents, if it left the list) instead of dropping to the
  // page.
  const chatListRef = useRef(null);
  const refocusChatRef = useRef(null);
  useEffect(() => {
    const id = refocusChatRef.current;
    refocusChatRef.current = null;
    if (!id || (document.activeElement && document.activeElement !== document.body)) return;
    const list = chatListRef.current;
    const target = list?.querySelector(`[data-chat-options="${CSS.escape(id)}"]`)
      || list?.querySelector('[aria-label="Recent conversations"] button');
    target?.focus();
  }, [conversationCatalog]);

  const togglePinConversation = useCallback(async (conversation) => {
    const pinned = !isPinned(conversation);
    if (document.activeElement?.matches?.(":focus-visible")) refocusChatRef.current = conversation.id;
    setConversationCatalog((current) => withPinned(current, conversation.id, pinned));
    eventBus.emit("conversationPinned", { id: conversation.id, pinned });
    try {
      await chatApi.updateConversation(conversation.id, { is_pinned: pinned });
    } catch (err) {
      toast.error(pinned ? "Couldn't pin the chat" : "Couldn't unpin the chat", { detail: errorDetail(err) });
      eventBus.emit("conversationPinned", { id: conversation.id, pinned: !pinned });
      loadRecentConversations();
    }
  }, [loadRecentConversations, toast]);

  // Pinned, renamed or deleted on the All chats page, or restored from Trash.
  useEffect(() => {
    const offs = [
      eventBus.on("conversationPinned", ({ id, pinned } = {}) => {
        if (id) setConversationCatalog((current) => withPinned(current, id, pinned));
      }),
      eventBus.on("conversationRenamed", ({ id, title } = {}) => {
        if (!id) return;
        setConversationCatalog((current) => current.map((conversation) => (
          conversation.id === id ? { ...conversation, title } : conversation
        )));
      }),
      eventBus.on("conversationDeleted", ({ ids = [] } = {}) => {
        const gone = new Set(ids);
        setConversationCatalog((current) => current.filter((conversation) => !gone.has(conversation.id)));
      }),
      eventBus.on("conversationsUpdated", () => loadRecentConversations()),
    ];
    return () => offs.forEach((off) => off());
  }, [loadRecentConversations]);

  const deleteConversation = useCallback(async (conversation) => {
    const confirmed = await confirm({
      title: "Delete chat?",
      message: `"${conversation.title || "Untitled conversation"}" will be moved to Trash, where you can restore it.`,
      confirmLabel: "Move to Trash",
      destructive: true,
    });
    if (!confirmed) return;
    setConversationCatalog((current) => current.filter((item) => item.id !== conversation.id));
    if (conversation.id === routeConversationId) navigate("/home");
    try {
      await chatApi.deleteConversation(conversation.id);
      eventBus.emit("conversationDeleted", { ids: [conversation.id] });
    } catch (err) {
      toast.error("Couldn't delete the chat", { detail: errorDetail(err) });
      loadRecentConversations();
    }
  }, [confirm, loadRecentConversations, navigate, routeConversationId, toast]);

  // With labels shown, projects are listed below together with their chats.
  const showProjectsTree = !collapsed && navItemsVisibility.projects !== false;

  const workspaceItems = [
    {
      key: "cats",
      label: "Cats",
      path: "/cats",
      active: isOnCats,
      icon: CatIcon,
      hint: shortcutHint("navScheduled"),
      // Steps and questions waiting for your answer.
      badge: catsWaiting > 0 ? (
        <span aria-label={`${catsWaiting} waiting for you`} className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-amber-950">
          {catsWaiting > 9 ? '9+' : catsWaiting}
        </span>
      ) : null,
    },
    // What agents made, and everything else Asyncat keeps on this computer.
    { key: "files", label: "Files", path: "/files", active: isOnFiles, icon: Folder },
    // The full sidebar lists projects below; the rail needs a way in.
    { key: "projects", label: "Projects", path: "/projects", active: isOnProjects, icon: FolderKanban, hint: shortcutHint("navWorkspace") },
  ].filter((item) => navItemsVisibility[item.key] !== false && (collapsed || item.key !== "projects"));

  const configureItems = [
    { key: "models", label: "Models", path: "/models", active: isOnModels, icon: Cpu, hint: shortcutHint("navModels") },
    { key: "agent", label: "Agents", path: "/agents", active: isOnAgent, icon: BrainCircuit, hint: shortcutHint("navAgent") },
    { key: "tools", label: "Tools & Skills", path: "/tools", active: isOnTools, icon: Wrench, hint: shortcutHint("navTools") },
  ].filter((item) => navItemsVisibility[item.key] !== false);

  const renderItems = (items) => items.map((item) => (
    <NavRow
      key={item.key}
      icon={item.icon}
      label={item.label}
      hint={item.hint}
      onClick={() => navigate(typeof item.path === "function" ? item.path() : item.path)}
      isActive={item.active}
      collapsed={collapsed}
      badge={item.badge || null}
    />
  ));

  return (
    <>
      <aside
        data-app-sidebar
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-line bg-sidebar transition-[width] duration-200 ease-out ${
          collapsed ? "w-16" : "w-16 sm:w-64"
        }`}
      >
        <div className={`flex h-14 shrink-0 items-center px-3 ${collapsed ? "justify-center" : "justify-center gap-2 sm:justify-between"}`}>
          {collapsed ? (
            <Tooltip label="Expand sidebar">
              <button
                type="button"
                onClick={() => setSidebarState("expanded")}
                aria-label="Expand sidebar"
                aria-expanded="false"
                className="group relative flex h-10 w-10 items-center justify-center rounded-lg text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <PanelLeftOpen className="h-[18px] w-[18px] text-fg-muted transition-colors group-hover:text-fg" strokeWidth={1.75} />
                {hasActiveRuns ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-sidebar" /> : null}
              </button>
            </Tooltip>
          ) : (
            <>
              <button
                type="button"
                onClick={openChat}
                title="Go to chat"
                className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {/* Below the sm breakpoint the sidebar is a 64px rail with no room for the name. */}
                <AsyncatMark variant="glyph" className="h-5 w-5 text-fg sm:hidden" />
                <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
                  <span className="truncate text-[18px] font-[680] leading-none tracking-[-0.05em] text-fg">asyncat</span>
                  <span className="rounded-md bg-hover px-1.5 py-px text-[10px] font-medium text-fg-muted">Beta</span>
                </span>
                {hasActiveRuns ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="An agent is working" /> : null}
              </button>
              <Tooltip label="Collapse sidebar" side="bottom" className="hidden sm:block">
                <button
                  type="button"
                  onClick={() => setSidebarState("collapsed")}
                  aria-label="Collapse sidebar"
                  aria-expanded="true"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {/* Destinations stay pinned here; only the project and chat lists below scroll. */}
        <nav aria-label="Main" className="shrink-0 px-2 pb-2 sm:px-3">
          <div className="space-y-px">
            <NavRow icon={SquarePen} label="New chat" hint={shortcutHint("newChat")} onClick={onNewChat} collapsed={collapsed} />
            <NavRow icon={Search} label="Search" hint={shortcutHint("openSearch")} onClick={() => onSearchOpen(true)} collapsed={collapsed} />
            {renderItems(workspaceItems)}
            {configureItems.length ? (
              <NavGroup
                icon={SlidersHorizontal}
                label="Customize"
                items={configureItems}
                collapsed={collapsed}
                onNavigate={(item) => navigate(typeof item.path === "function" ? item.path() : item.path)}
              />
            ) : null}
          </div>
        </nav>

        <div ref={chatListRef} className={`min-h-0 flex-1 overflow-y-auto px-3 pb-3 ${collapsed ? "hidden" : "hidden sm:block"}`}>
          {pinnedConversations.length > 0 ? (
            <section className="mt-3" aria-label="Pinned chats">
              <SectionHeader label="Pinned" labelTitle="View all conversations" onLabelClick={() => navigate("/all-chats")} />
              <div className="space-y-px">
                {pinnedConversations.map((conversation) => (
                  <RecentConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeRecentConversationId}
                    running={activeConversationIds.has(conversation.id)}
                    onOpen={openConversation}
                    onRename={renameConversation}
                    onDelete={deleteConversation}
                    onTogglePin={togglePinConversation}
                    agentsById={agentsById}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {showProjectsTree ? (
            <section className="mt-3" aria-label="Projects and their conversations">
              <SectionHeader label="Projects" labelTitle="Manage projects" onLabelClick={() => navigate("/projects")}>
                <button
                  type="button"
                  onClick={() => navigate("/projects")}
                  className="rounded-md px-1.5 py-0.5 text-[11px] text-fg-subtle opacity-0 outline-none transition-opacity hover:bg-hover hover:text-fg-muted focus-visible:opacity-100 group-hover/section:opacity-100"
                >
                  View all
                </button>
              </SectionHeader>
              <div className="space-y-px">
                {projectsLoading && projectGroups.length === 0 ? (
                  <div className="px-2.5 py-2 text-[12px] text-fg-subtle">Loading projects…</div>
                ) : projectGroups.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate("/projects", { state: { createProject: true } })}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] text-fg-subtle transition-colors hover:bg-hover hover:text-fg-muted"
                  >
                    Create your first project
                  </button>
                ) : projectGroups.map(({ project, conversations, pinnedCount }) => {
                  const projectId = String(project.id);
                  return (
                    <ProjectConversationGroup
                      key={projectId}
                      project={project}
                      conversations={conversations}
                      pinnedCount={pinnedCount}
                      expanded={expandedProjectIds.has(projectId)}
                      active={String(activeProjectId || "") === projectId}
                      activeConversationId={activeRecentConversationId}
                      activeConversationIds={activeConversationIds}
                      onToggle={() => setExpandedProjectIds((current) => {
                        const next = new Set(current);
                        if (next.has(projectId)) next.delete(projectId);
                        else next.add(projectId);
                        return next;
                      })}
                      onOpenProject={() => navigate(`/projects/${project.id}`)}
                      onOpenConversation={openConversation}
                      onRenameConversation={renameConversation}
                      onDeleteConversation={deleteConversation}
                      onTogglePinConversation={togglePinConversation}
                      agentsById={agentsById}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-4" aria-label="Recent conversations">
            <SectionHeader label="Recents" labelTitle="View all conversations" onLabelClick={() => navigate("/all-chats")} />

            <div className="space-y-px">
              {recentLoading && recentConversations.length === 0 ? (
                <div className="flex h-16 items-center justify-center text-fg-subtle">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : recentError ? (
                <button
                  type="button"
                  onClick={loadRecentConversations}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] text-fg-subtle transition-colors hover:bg-hover hover:text-fg-muted"
                >
                  Couldn&apos;t load recents · Retry
                </button>
              ) : recentConversations.length === 0 ? (
                <div className="px-2.5 py-2 text-[12px] text-fg-subtle">
                  No recent conversations
                </div>
              ) : recentConversations.map((conversation) => (
                <RecentConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeRecentConversationId}
                  running={activeConversationIds.has(conversation.id)}
                  onOpen={openConversation}
                  onRename={renameConversation}
                  onDelete={deleteConversation}
                  onTogglePin={togglePinConversation}
                  agentsById={agentsById}
                />
              ))}
            </div>
          </section>

          <ExternalSessionsSection onOpened={loadRecentConversations} />
        </div>

        {collapsed ? <div className="flex-1" /> : <div className="flex-1 sm:hidden" />}

        <div className="shrink-0 border-t border-line p-2">
          <Tooltip label={displayName} disabled={!collapsed} className="w-full">
            <button
              ref={profileButtonRef}
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-label="Account and settings"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              className={`group flex h-11 w-full items-center gap-2.5 rounded-lg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40 ${rowLayout(collapsed)} ${
                profileMenuOpen ? "bg-hover" : ""
              }`}
            >
              <span className="relative shrink-0">
                <img src={avatarSrc(profileData?.profilePicture)} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-line" />
                {updateAvailable ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-sidebar" /> : null}
              </span>
              <span className={`min-w-0 flex-1 text-left ${labelVisibility(collapsed)}`}>
                <span className="block truncate text-[13px] font-medium text-fg">{displayName}</span>
                {updateAvailable ? <span className="block truncate text-[11px] text-accent">Update available</span> : null}
              </span>
              <ChevronsUpDown className={`h-4 w-4 shrink-0 text-fg-subtle ${labelVisibility(collapsed)}`} strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Menu
            anchorRef={profileButtonRef}
            open={profileMenuOpen}
            onClose={() => setProfileMenuOpen(false)}
            placement={collapsed ? "right-end" : "top-start"}
            width={240}
            label="Account and settings"
          >
            {updateAvailable ? (
              <>
                <MenuItem icon={CircleArrowUp} label={<span className="text-accent">Update available</span>} onSelect={openUpdateScreen} />
                <MenuSeparator />
              </>
            ) : null}
            <MenuItem icon={Settings} label="Settings" hint={shortcutHint("openSettings")} onSelect={() => navigate("/settings/profile")} />
            {navItemsVisibility.trash !== false ? (
              <MenuItem icon={Trash2} label="Trash" onSelect={() => navigate("/trash")} />
            ) : null}
            <MenuSeparator />
            <div className="flex items-center justify-between py-1 pl-2.5 pr-1">
              <span className="text-[13px] text-fg-muted">Theme</span>
              <div className="flex items-center gap-0.5 rounded-lg bg-hover p-0.5" role="radiogroup" aria-label="Theme">
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <Tooltip key={value} label={label} side="top">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={theme === value}
                      aria-label={label}
                      onClick={() => setTheme(value)}
                      className={`flex h-6 w-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        theme === value ? "bg-elevated text-fg shadow-sm ring-1 ring-line" : "text-fg-subtle hover:text-fg"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
            <MenuSeparator />
            <MenuItem icon={Info} label="About Asyncat" onSelect={() => navigate("/settings/about")} />
          </Menu>
        </div>
      </aside>
      {searchLoaded && (
        <Suspense fallback={null}>
          <UniversalSearch isOpen={isSearchOpen} onClose={() => onSearchOpen(false)} onNewChat={onNewChat} />
        </Suspense>
      )}
    </>
  );
};

DynamicSidebar.propTypes = {
  onNewChat: PropTypes.func,
  basePage: PropTypes.string,
  isSearchOpen: PropTypes.bool,
  onSearchOpen: PropTypes.func,
};

export default memo(DynamicSidebar);
