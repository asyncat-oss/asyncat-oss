import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BrainCircuit,
  CalendarClock,
  Cpu,
  GraduationCap,
  History,
  Folder,
  FolderOpen,
  FolderKanban,
  KanbanSquare,
  Check,
  ChevronRight,
  ListFilter,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Workflow,
  Wrench,
} from "lucide-react";

import { useCommandCenter } from "../CommandCenter/context/CommandCenterContextEnhanced";
import { chatApi } from "../CommandCenter/api/chatApi.js";
import { useUiPreferences } from "../contexts/UiPreferencesContext.jsx";
import { useWorkspace } from "../contexts/WorkspaceContext.jsx";
import eventBus from "../utils/eventBus.js";
import { loadKeyboardShortcuts } from "../utils/keyboardShortcutsUtils.js";
import UniversalSearch from "./UniversalSearch";

const iconClass = "h-[18px] w-[18px]";

const AsyncatMark = ({ className = "h-7 w-7" }) => (
  <svg
    viewBox="0 0 32 32"
    aria-hidden="true"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6 25L11.5 8L16 13L20.5 8L26 25" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 20H23" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

AsyncatMark.propTypes = {
  className: PropTypes.string,
};

const SidebarNavItem = memo(({ icon, label, onClick, isActive, collapsed = false }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-current={isActive ? "page" : undefined}
    className={`
      group relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5
      outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gray-400/40
      ${isActive
        ? "bg-gray-100 text-gray-950 dark:bg-white/[0.07] dark:text-gray-100 midnight:bg-white/[0.06] midnight:text-slate-100"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-100 midnight:text-slate-400 midnight:hover:bg-white/[0.05] midnight:hover:text-slate-100"
      }
    `}
  >
    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center transition-colors ${
      isActive
        ? "text-current"
        : "text-gray-400 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300 midnight:text-slate-500 midnight:group-hover:text-slate-300"
    }`}>
      {icon}
    </span>
    <span className={`min-w-0 flex-1 truncate text-left text-[13px] font-medium ${collapsed ? "hidden" : "hidden sm:block"}`}>
      {label}
    </span>
  </button>
));

SidebarNavItem.displayName = "SidebarNavItem";
SidebarNavItem.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  isActive: PropTypes.bool,
  collapsed: PropTypes.bool,
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

const RecentConversationItem = memo(({ conversation, active, running, onOpen, nested = false }) => {
  const isWork = conversation.mode === "build" || conversation.mode === "work";
  const modeLabel = isWork ? "Work" : "Chat";

  return (
    <button
      type="button"
      onClick={() => onOpen(conversation.id)}
      title={`${conversation.title || "Untitled conversation"} · ${modeLabel}`}
      aria-current={active ? "page" : undefined}
      className={`group flex h-8 w-full min-w-0 items-center gap-2 rounded-lg pr-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-400/40 ${nested ? "pl-7" : "pl-2.5"} ${
        active
          ? "bg-gray-100 text-gray-950 dark:bg-white/[0.07] dark:text-gray-100 midnight:bg-white/[0.06] midnight:text-slate-100"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-100 midnight:text-slate-400 midnight:hover:bg-white/[0.05] midnight:hover:text-slate-100"
      }`}
    >
      <span
        aria-label={running ? "Generating" : modeLabel}
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          running
            ? "animate-pulse bg-indigo-500 ring-2 ring-indigo-500/15"
            : isWork
              ? "bg-indigo-400/80 dark:bg-indigo-400/70"
              : "bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600"
        }`}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-normal">
        {conversation.title || "Untitled conversation"}
      </span>
    </button>
  );
});

RecentConversationItem.displayName = "RecentConversationItem";
RecentConversationItem.propTypes = {
  conversation: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string,
    mode: PropTypes.string,
  }).isRequired,
  active: PropTypes.bool,
  running: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  nested: PropTypes.bool,
};

const ProjectConversationGroup = memo(({
  project,
  conversations,
  expanded,
  active,
  activeConversationId,
  activeConversationIds,
  onToggle,
  onOpenProject,
  onOpenConversation,
}) => {
  const ProjectIcon = expanded ? FolderOpen : Folder;

  return (
    <div>
      <div className={`group flex h-8 items-center rounded-lg transition-colors ${active ? "bg-gray-100 dark:bg-white/[0.07] midnight:bg-white/[0.06]" : "hover:bg-gray-100 dark:hover:bg-white/[0.05] midnight:hover:bg-white/[0.05]"}`}>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400/40"
          aria-expanded={expanded}
          title={project.name}
        >
          <ChevronRight className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
          <ProjectIcon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 midnight:text-slate-400" />
          <span className={`min-w-0 flex-1 truncate text-[13px] ${active ? "font-medium text-gray-950 dark:text-gray-100 midnight:text-slate-100" : "font-normal text-gray-700 dark:text-gray-300 midnight:text-slate-300"}`}>
            {project.name || "Untitled project"}
          </span>
          {conversations.length > 0 ? (
            <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-600 midnight:text-slate-600">{conversations.length}</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onOpenProject}
          className="mr-1 flex h-6 shrink-0 items-center rounded px-1.5 text-[10px] font-medium text-gray-400 opacity-0 transition-[opacity,color,background-color] hover:bg-white hover:text-gray-700 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-white/[0.07] dark:hover:text-gray-200"
          title={`Open ${project.name || "project"}`}
        >
          Open
        </button>
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
              nested
            />
          )) : (
            <button
              type="button"
              onClick={onOpenProject}
              className="flex h-8 w-full items-center pl-7 pr-2.5 text-left text-[12px] text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-300 midnight:text-slate-600 midnight:hover:text-slate-300"
            >
              No chats yet · Open project
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
  expanded: PropTypes.bool,
  active: PropTypes.bool,
  activeConversationId: PropTypes.string,
  activeConversationIds: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onOpenProject: PropTypes.func.isRequired,
  onOpenConversation: PropTypes.func.isRequired,
};

const DynamicSidebar = ({ onNewChat, basePage, isSearchOpen, onSearchOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [shortcuts, setShortcuts] = useState(loadKeyboardShortcuts);
  const [updateAvailable, setUpdateAvailable] = useState(
    () => sessionStorage.getItem("asyncatUpdateAvailable") === "true",
  );
  const [recentConversations, setRecentConversations] = useState([]);
  const [conversationCatalog, setConversationCatalog] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  const [recentMode, setRecentMode] = useState("all");
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);
  const [showRecentFilter, setShowRecentFilter] = useState(false);
  const recentFilterRef = useRef(null);
  const recentRequestRef = useRef(0);
  const { sidebarState, setSidebarState, navItemsVisibility } = useUiPreferences();
  const { getWorkspaceProjects, bustProjectsCache, currentWorkspace } = useWorkspace();
  const {
    currentConversationId,
    hasActiveRuns,
    chatRunPreviews = [],
    activeConversationIds = new Set(),
    setConversationListRefresh,
  } = useCommandCenter();

  const collapsed = sidebarState === "collapsed";
  const latestChatRun = chatRunPreviews[0];
  const commandCenterTarget = currentConversationId
    ? `/conversations/${currentConversationId}`
    : latestChatRun?.conversationId
      ? `/conversations/${latestChatRun.conversationId}`
      : "/home";

  const openCommandCenter = useCallback(() => {
    navigate(commandCenterTarget);
  }, [commandCenterTarget, navigate]);

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

  useEffect(() => {
    const filtered = recentMode === "all"
      ? conversationCatalog
      : conversationCatalog.filter((conversation) => {
          const isWork = conversation.mode === "build" || conversation.mode === "work";
          return recentMode === "work" ? isWork : !isWork;
        });
    setRecentConversations(filtered.slice(0, 7));
  }, [conversationCatalog, recentMode]);

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
    if (!showRecentFilter) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!recentFilterRef.current?.contains(event.target)) setShowRecentFilter(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [showRecentFilter]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return undefined;
    const markAvailable = (available = true) => {
      sessionStorage.setItem("asyncatUpdateAvailable", available ? "true" : "false");
      setUpdateAvailable(available);
    };
    const handleFlag = (event) => markAvailable(Boolean(event.detail));
    const cleanups = [
      api.onUpdateAvailable(() => markAvailable(true)),
      api.onUpdateNotAvailable(() => markAvailable(false)),
    ];
    window.addEventListener("asyncat:update-flag", handleFlag);
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
        case "navHome": openCommandCenter(); break;
        case "navChat": navigate("/all-chats"); break;
        case "navWorkspace": navigate("/projects"); break;
        case "navModels": navigate("/models"); break;
        case "navTools": navigate("/tools"); break;
        case "navScheduler": navigate("/schedules"); break;
        case "navProfiles": navigate("/agent/profiles"); break;
        case "navAgent": navigate("/agent"); break;
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
  }, [navigate, onNewChat, onSearchOpen, openCommandCenter, shortcuts]);

  const isOnProjects = basePage === "projects";
  const isOnTasks = ["workspace", "tasks"].includes(basePage);
  const isOnChats = basePage === "all-chats";
  const isOnModels = basePage === "models";
  const isOnAgent = location.pathname === "/agent"
    || location.pathname.startsWith("/agent/profiles")
    || location.pathname.startsWith("/profiles");
  const isOnSchedules = ["/schedules", "/scheduler", "/agent/scheduler"].some((path) => location.pathname.startsWith(path));
  const isOnTools = location.pathname.startsWith("/tools");
  const isOnWorkflows = location.pathname.startsWith("/workflows");
  const isOnActivity = location.pathname.startsWith("/activity");
  const isOnTraining = location.pathname.startsWith("/training");
  const isOnTrash = basePage === "trash";
  const isOnSettings = basePage === "settings";
  const routeConversationId = location.pathname.match(/^\/conversations\/([^/]+)/)?.[1] || null;
  const activeRecentConversationId = routeConversationId;
  const routeProjectId = location.pathname.match(/^\/(?:projects|tasks)\/([^/]+)/)?.[1] || null;
  const activeConversationProjectId = useMemo(() => (
    conversationProjectId(conversationCatalog.find((conversation) => conversation.id === routeConversationId))
  ), [conversationCatalog, routeConversationId]);
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

  const projectGroups = useMemo(() => {
    const conversationsByProject = new Map();
    conversationCatalog.forEach((conversation) => {
      const projectId = conversationProjectId(conversation);
      if (!projectId) return;
      if (!conversationsByProject.has(projectId)) conversationsByProject.set(projectId, []);
      conversationsByProject.get(projectId).push(conversation);
    });
    return projects.map((project) => ({
      project,
      conversations: conversationsByProject.get(String(project.id)) || [],
    }));
  }, [conversationCatalog, projects]);

  const workItems = [
    { key: "projects", label: "Projects", path: "/projects", active: isOnProjects, icon: <FolderKanban className={iconClass} /> },
    { key: "tasks", label: "Tasks", path: "/tasks", active: isOnTasks, icon: <KanbanSquare className={iconClass} /> },
    { key: "workflows", label: "Workflows", path: "/workflows", active: isOnWorkflows, icon: <Workflow className={iconClass} /> },
    { key: "schedules", label: "Schedules", path: "/schedules", active: isOnSchedules, icon: <CalendarClock className={iconClass} /> },
    { key: "activity", label: "Activity", path: "/activity", active: isOnActivity, icon: <Bell className={iconClass} /> },
  ].filter((item) => navItemsVisibility[item.key] !== false);

  const buildItems = [
    { key: "models", label: "Models", path: "/models", active: isOnModels, icon: <Cpu className={iconClass} /> },
    { key: "tools", label: "Tools & Skills", path: "/tools", active: isOnTools, icon: <Wrench className={iconClass} /> },
    { key: "agent", label: "Agents", path: "/agent/profiles", active: isOnAgent, icon: <BrainCircuit className={iconClass} /> },
    { key: "training", label: "Training", path: "/training", active: isOnTraining, icon: <GraduationCap className={iconClass} /> },
  ].filter((item) => navItemsVisibility[item.key] !== false);

  const renderItems = (items) => items.map((item) => (
    <SidebarNavItem
      key={item.key}
      icon={item.icon}
      label={item.label}
      onClick={() => navigate(item.path)}
      isActive={item.active}
      collapsed={collapsed}
    />
  ));

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      <aside
        data-app-sidebar
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200/70 bg-white transition-[width] duration-200 ease-out dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 ${
          collapsed ? "w-[72px]" : "w-[72px] sm:w-64"
        }`}
      >
        <div className="flex h-16 items-center gap-2 px-3">
          <button
            type="button"
            onClick={openCommandCenter}
            title="Command Center"
            className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40"
          >
            <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center text-gray-900 dark:text-gray-100 midnight:text-slate-100">
              <AsyncatMark className="h-8 w-8" />
              {hasActiveRuns ? <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-gray-900 midnight:ring-slate-950" /> : null}
            </span>
            <span className={`min-w-0 flex-1 truncate text-left text-sm font-semibold tracking-[-0.01em] text-gray-950 dark:text-gray-100 midnight:text-slate-100 ${collapsed ? "hidden" : "hidden sm:block"}`}>
              <span className="inline-flex items-center gap-1.5">
                Asyncat
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300 midnight:border-indigo-400/20 midnight:bg-indigo-400/10 midnight:text-indigo-300">
                  Beta
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarState(collapsed ? "expanded" : "collapsed")}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 outline-none transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-400/40 dark:text-gray-500 dark:hover:bg-white/[0.05] dark:hover:text-gray-300 midnight:hover:bg-white/[0.05] ${collapsed ? "absolute left-5 top-[72px]" : ""}`}
          >
            <CollapseIcon className="h-[17px] w-[17px]" />
          </button>
        </div>

        <div className={`space-y-0.5 px-3 pb-3 ${collapsed ? "pt-11" : ""}`}>
          <SidebarNavItem
            icon={<SquarePen className={iconClass} />}
            label="New chat"
            onClick={onNewChat}
            collapsed={collapsed}
          />
          <SidebarNavItem
            icon={<History className={iconClass} />}
            label="All chats"
            onClick={() => navigate("/all-chats")}
            isActive={isOnChats}
            collapsed={collapsed}
          />
          <SidebarNavItem
            icon={<Search className={iconClass} />}
            label="Search"
            onClick={() => onSearchOpen(true)}
            collapsed={collapsed}
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {!collapsed ? (
            <section className="relative mb-5 hidden sm:block" aria-label="Projects and their conversations">
              <div className="flex items-center justify-between px-2.5 pb-1.5">
                <button
                  type="button"
                  onClick={() => navigate("/projects")}
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-300 midnight:text-slate-600 midnight:hover:text-slate-300"
                  title="Manage projects"
                >
                  Projects
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/projects")}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-600 dark:hover:bg-white/[0.05] dark:hover:text-gray-300"
                  title="View all projects"
                >
                  View all
                </button>
              </div>
              <div className="space-y-px">
                {projectsLoading && projectGroups.length === 0 ? (
                  <div className="px-2.5 py-2 text-xs text-gray-400 dark:text-gray-600 midnight:text-slate-600">Loading projects…</div>
                ) : projectGroups.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate("/projects")}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/[0.05] dark:hover:text-gray-300"
                  >
                    Create your first project
                  </button>
                ) : projectGroups.map(({ project, conversations }) => {
                  const projectId = String(project.id);
                  return (
                    <ProjectConversationGroup
                      key={projectId}
                      project={project}
                      conversations={conversations}
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
                      onOpenConversation={(conversationId) => navigate(`/conversations/${conversationId}`)}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {!collapsed ? (
            <section className="relative mb-5 hidden sm:block" aria-label="Recent conversations">
              <div className="flex items-center justify-between px-2.5 pb-1.5">
                <button
                  type="button"
                  onClick={() => navigate("/all-chats")}
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-300 midnight:text-slate-600 midnight:hover:text-slate-300"
                  title="View all conversations"
                >
                  Recent chats
                </button>
                <div ref={recentFilterRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowRecentFilter((visible) => !visible)}
                    aria-label={`Filter recent conversations: ${recentMode}`}
                    aria-expanded={showRecentFilter}
                    className={`flex h-6 w-6 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-400/40 ${
                      showRecentFilter || recentMode !== "all"
                        ? "bg-gray-100 text-gray-700 dark:bg-white/[0.07] dark:text-gray-300 midnight:bg-white/[0.06] midnight:text-slate-300"
                        : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-600 dark:hover:bg-white/[0.05] dark:hover:text-gray-300 midnight:text-slate-600 midnight:hover:bg-white/[0.05] midnight:hover:text-slate-300"
                    }`}
                    title="Filter recent conversations"
                  >
                    <ListFilter className="h-3.5 w-3.5" />
                  </button>
                  {showRecentFilter ? (
                    <div className="absolute right-0 top-7 z-50 w-32 rounded-xl border border-gray-200/80 bg-white p-1.5 shadow-xl shadow-black/10 dark:border-gray-700 dark:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900">
                      {[['all', 'All'], ['chat', 'Chat'], ['work', 'Work']].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setRecentMode(value);
                            setShowRecentFilter(false);
                          }}
                          className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.07] dark:hover:text-white midnight:text-slate-300 midnight:hover:bg-white/[0.06]"
                        >
                          <span className="flex-1">{label}</span>
                          {recentMode === value ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-px">
                {recentLoading && recentConversations.length === 0 ? (
                  <div className="flex h-16 items-center justify-center text-gray-400 dark:text-gray-600 midnight:text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : recentError ? (
                  <button
                    type="button"
                    onClick={loadRecentConversations}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/[0.05] dark:hover:text-gray-300 midnight:text-slate-500 midnight:hover:bg-white/[0.05] midnight:hover:text-slate-300"
                  >
                    Couldn&apos;t load recents · Retry
                  </button>
                ) : recentConversations.length === 0 ? (
                  <div className="px-2.5 py-2 text-xs text-gray-400 dark:text-gray-600 midnight:text-slate-600">
                    No recent {recentMode === "all" ? "conversations" : `${recentMode} conversations`}
                  </div>
                ) : recentConversations.map((conversation) => (
                  <RecentConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeRecentConversationId}
                    running={activeConversationIds.has(conversation.id)}
                    onOpen={(conversationId) => navigate(`/conversations/${conversationId}`)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {!collapsed ? <div className="hidden px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 sm:block dark:text-gray-600 midnight:text-slate-600">Work</div> : null}
          <div className="space-y-0.5">{renderItems(collapsed ? workItems : workItems.filter((item) => item.key !== "projects"))}</div>

          {!collapsed ? <div className="mt-5 hidden px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 sm:block dark:text-gray-600 midnight:text-slate-600">Configure</div> : null}
          <div className="space-y-0.5">{renderItems(buildItems)}</div>
        </nav>

        <div className="space-y-0.5 border-t border-gray-200/70 p-3 dark:border-gray-800 midnight:border-slate-800">
          {navItemsVisibility.trash !== false ? (
            <SidebarNavItem
              icon={<Trash2 className={iconClass} />}
              label="Trash"
              onClick={() => navigate("/trash")}
              isActive={isOnTrash}
              collapsed={collapsed}
            />
          ) : null}
          <SidebarNavItem
            icon={(
              <span className="relative flex h-5 w-5 items-center justify-center">
                <Settings className={iconClass} />
                {updateAvailable ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-gray-900 midnight:ring-slate-950" /> : null}
              </span>
            )}
            label="Settings"
            onClick={() => navigate(updateAvailable ? "/settings/about" : "/settings/profile")}
            isActive={isOnSettings}
            collapsed={collapsed}
          />
        </div>
      </aside>
      <UniversalSearch isOpen={isSearchOpen} onClose={() => onSearchOpen(false)} />
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
