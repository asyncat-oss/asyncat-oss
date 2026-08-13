import { memo, useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BrainCircuit,
  Cpu,
  GraduationCap,
  History,
  KanbanSquare,
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
import { useUiPreferences } from "../contexts/UiPreferencesContext.jsx";
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

const DynamicSidebar = ({ onNewChat, basePage, isSearchOpen, onSearchOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [shortcuts, setShortcuts] = useState(loadKeyboardShortcuts);
  const [updateAvailable, setUpdateAvailable] = useState(
    () => sessionStorage.getItem("asyncatUpdateAvailable") === "true",
  );
  const { sidebarState, setSidebarState, navItemsVisibility } = useUiPreferences();
  const {
    currentConversationId,
    hasActiveRuns,
    chatRunPreviews = [],
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
        case "navWorkspace": navigate("/workspace"); break;
        case "navModels": navigate("/models"); break;
        case "navTools": navigate("/tools"); break;
        case "navScheduler": navigate("/agent/scheduler"); break;
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

  const isOnWorkspace = ["workspace", "projects"].includes(basePage);
  const isOnChats = basePage === "all-chats";
  const isOnModels = basePage === "models";
  const isOnAgent = ["/agent", "/scheduler", "/profiles"].some((path) => location.pathname.startsWith(path));
  const isOnTools = location.pathname.startsWith("/tools");
  const isOnWorkflows = location.pathname.startsWith("/workflows");
  const isOnActivity = location.pathname.startsWith("/activity");
  const isOnTraining = location.pathname.startsWith("/training");
  const isOnTrash = basePage === "trash";
  const isOnSettings = basePage === "settings";

  const workItems = [
    { key: "projects", label: "Tasks", path: "/workspace", active: isOnWorkspace, icon: <KanbanSquare className={iconClass} /> },
    { key: "workflows", label: "Workflows", path: "/workflows", active: isOnWorkflows, icon: <Workflow className={iconClass} /> },
    { key: "activity", label: "Activity", path: "/activity", active: isOnActivity, icon: <Bell className={iconClass} /> },
  ].filter((item) => navItemsVisibility[item.key] !== false);

  const buildItems = [
    { key: "models", label: "Models", path: "/models", active: isOnModels, icon: <Cpu className={iconClass} /> },
    { key: "tools", label: "Tools & Skills", path: "/tools", active: isOnTools, icon: <Wrench className={iconClass} /> },
    { key: "agent", label: "Automation", path: "/agent", active: isOnAgent, icon: <BrainCircuit className={iconClass} /> },
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
          {!collapsed ? <div className="hidden px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 sm:block dark:text-gray-600 midnight:text-slate-600">Work</div> : null}
          <div className="space-y-0.5">{renderItems(workItems)}</div>

          {!collapsed ? <div className="mt-5 hidden px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 sm:block dark:text-gray-600 midnight:text-slate-600">Build</div> : null}
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
