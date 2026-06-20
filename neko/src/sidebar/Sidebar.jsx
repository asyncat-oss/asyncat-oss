import {
  useState,
  useEffect,
  memo,
  useCallback,
  useMemo,
} from "react";
import PropTypes from "prop-types";
import { useNavigate, useLocation } from "react-router-dom";
import authService from "../services/authService.js";
import {
  Command,
  Settings,
  MessageSquare as ChatIcon,
  Cpu,
  Wrench,
  BrainCircuit,
  Workflow,
  Bell,
  Trash2,
  ChevronLeft,
  ChevronRight,
  KanbanSquare,
  GraduationCap,
} from "lucide-react";

import UniversalSearch from "./UniversalSearch";
import { useCommandCenter } from "../CommandCenter/context/CommandCenterContextEnhanced";
import { loadKeyboardShortcuts } from "../utils/keyboardShortcutsUtils.js";
import eventBus from "../utils/eventBus.js";
import catDP from "../assets/dp/CAT.webp";
import dogDP from "../assets/dp/DOG.webp";
import dolphinDP from "../assets/dp/DOLPHIN.webp";
import dragonDP from "../assets/dp/DRAGON.webp";
import elephantDP from "../assets/dp/ELEPHANT.webp";
import foxDP from "../assets/dp/FOX.webp";
import lionDP from "../assets/dp/LION.webp";
import owlDP from "../assets/dp/OWL.webp";
import penguinDP from "../assets/dp/PENGUIN.webp";
import wolfDP from "../assets/dp/WOLF.webp";

let globalProfileCache = null;
let profileCacheInitialized = false;

const PROFILE_PICTURE_MAP = {
  CAT: catDP,
  DOG: dogDP,
  DOLPHIN: dolphinDP,
  DRAGON: dragonDP,
  ELEPHANT: elephantDP,
  FOX: foxDP,
  LION: lionDP,
  OWL: owlDP,
  PENGUIN: penguinDP,
  WOLF: wolfDP,
};

const isProfilePictureUrl = (value) => {
  if (!value) return false;
  return /^(https?:|data:|blob:)/i.test(value) || value.startsWith("/");
};

// ── ProfileImage ──────────────────────────────────────────────────────────────

const ProfileImage = memo(
  ({ size = "w-6 h-6", className = "", src, initials, hasError, onError, onLoad }) => {
    if (src && !hasError) {
      return (
        <img
          src={src}
          alt="Profile"
          className={`${size} rounded-full object-cover ${className}`}
          loading="eager"
          decoding="async"
          onError={onError}
          onLoad={onLoad}
        />
      );
    }
    return (
      <div
        className={`${size} rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium text-[10px] ${className}`}
      >
        {initials}
      </div>
    );
  }
);
ProfileImage.displayName = "ProfileImage";
ProfileImage.propTypes = {
  size: PropTypes.string,
  className: PropTypes.string,
  src: PropTypes.string,
  initials: PropTypes.string,
  hasError: PropTypes.bool,
  onError: PropTypes.func,
  onLoad: PropTypes.func,
};

const formatShortcut = (shortcut) => {
  if (!shortcut?.key) return "";
  const parts = [];
  if (shortcut.meta) parts.push("⌘");
  else if (shortcut.ctrl) parts.push("Ctrl");
  parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return parts.join(shortcut.meta ? "" : "+");
};

const SidebarNavItem = memo(({ icon, label, shortcut, onClick, isActive, collapsed = false }) => (
  <button
    type="button"
    onClick={onClick}
    title={shortcut ? `${label} ${shortcut}` : label}
    className={`
      group w-full h-10 flex items-center gap-3 rounded-lg px-3
      transition-colors duration-150
      ${isActive
        ? "bg-gray-100/80 text-gray-950 dark:bg-white/[0.06] dark:text-white midnight:bg-white/[0.05] midnight:text-white"
        : "text-gray-500 hover:bg-gray-100/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.045] dark:hover:text-gray-100 midnight:text-gray-500 midnight:hover:bg-white/[0.045] midnight:hover:text-gray-100"
      }
    `}
  >
    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
      isActive
        ? 'text-gray-800 dark:text-gray-100 midnight:text-gray-100'
        : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300 midnight:text-gray-500 midnight:group-hover:text-gray-300'
    }`}>
      {icon}
    </span>
    <span className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${collapsed ? 'hidden' : 'hidden sm:block'}`}>
      {label}
    </span>
    {shortcut && !collapsed ? (
      <span className={`hidden flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:block ${
        isActive
          ? 'text-gray-400 dark:text-gray-500 midnight:text-gray-600'
          : 'text-gray-400 dark:text-gray-600 midnight:text-gray-600'
      }`}>
        {shortcut}
      </span>
    ) : null}
  </button>
));
SidebarNavItem.displayName = "SidebarNavItem";
SidebarNavItem.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string.isRequired,
  shortcut: PropTypes.string,
  onClick: PropTypes.func,
  isActive: PropTypes.bool,
  collapsed: PropTypes.bool,
};

// ── Main Sidebar Component ────────────────────────────────────────────────────

const DynamicSidebar = ({
  session,
  onNewChat,
  basePage,
  isSearchOpen,
  onSearchOpen,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return localStorage.getItem('sidebarPosition') || 'left';
  });
  const [sidebarState, setSidebarState] = useState(() => {
    return localStorage.getItem('sidebarState') || 'expanded';
  });
  const [sidebarVisibility, setSidebarVisibility] = useState(() => {
    return localStorage.getItem('sidebarVisibility') || 'always';
  });
  const [topBarVisible, setTopBarVisible] = useState(() => {
    return localStorage.getItem('topMenuBarVisibility') !== 'hidden';
  });
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => {
    return localStorage.getItem('sidebarVisibility') !== 'hover';
  });
  const [shortcuts, setShortcuts] = useState(loadKeyboardShortcuts);
  const [navItemsVisibility, setNavItemsVisibility] = useState(() => {
    try {
      const stored = localStorage.getItem('navItemsVisibility');
      const defaults = { history: true, projects: true, models: true, tools: true, agent: true, trash: true };
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch { return { history: true, projects: true, models: true, tools: true, agent: true, trash: true }; }
  });

  // Profile state (for sidebar avatar)
  const API_URL = import.meta.env.VITE_USER_URL;
  const [profileData, setProfileData] = useState(
    () => globalProfileCache || { name: "", profilePicture: "" }
  );
  const [profileImageError, setProfileImageError] = useState(false);
  const {
    currentConversationId,
    conversationTitle,
    hasActiveRuns,
    chatRunPreviews = [],
  } = useCommandCenter();

  const latestChatRun = chatRunPreviews[0];
  const commandCenterTarget = currentConversationId
    ? `/conversations/${currentConversationId}`
    : latestChatRun?.conversationId
      ? `/conversations/${latestChatRun.conversationId}`
      : '/home';
  const openCommandCenter = useCallback(() => {
    navigate(commandCenterTarget);
  }, [commandCenterTarget, navigate]);

  useEffect(() => {
    const syncNavigationPreferences = () => {
      setSidebarPosition(localStorage.getItem('sidebarPosition') || 'left');
      setSidebarState(localStorage.getItem('sidebarState') || 'expanded');
      const nextSidebarVisibility = localStorage.getItem('sidebarVisibility') || 'always';
      setSidebarVisibility(nextSidebarVisibility);
      setTopBarVisible(localStorage.getItem('topMenuBarVisibility') !== 'hidden');
      setIsSidebarVisible(nextSidebarVisibility !== 'hover');
    };
    const syncNavItems = () => {
      try {
        const stored = localStorage.getItem('navItemsVisibility');
        const defaults = { history: true, projects: true, models: true, tools: true, agent: true, trash: true };
        setNavItemsVisibility(stored ? { ...defaults, ...JSON.parse(stored) } : defaults);
      } catch { /* keep current */ }
    };
    window.addEventListener('storage', syncNavigationPreferences);
    window.addEventListener('storage', syncNavItems);
    window.addEventListener('sidebar-position-changed', syncNavigationPreferences);
    window.addEventListener('sidebar-state-changed', syncNavigationPreferences);
    window.addEventListener('sidebar-visibility-changed', syncNavigationPreferences);
    window.addEventListener('top-menu-bar-visibility-changed', syncNavigationPreferences);
    window.addEventListener('nav-items-visibility-changed', syncNavItems);
    return () => {
      window.removeEventListener('storage', syncNavigationPreferences);
      window.removeEventListener('storage', syncNavItems);
      window.removeEventListener('sidebar-position-changed', syncNavigationPreferences);
      window.removeEventListener('sidebar-state-changed', syncNavigationPreferences);
      window.removeEventListener('sidebar-visibility-changed', syncNavigationPreferences);
      window.removeEventListener('top-menu-bar-visibility-changed', syncNavigationPreferences);
      window.removeEventListener('nav-items-visibility-changed', syncNavItems);
    };
  }, []);

  useEffect(() => {
    if (sidebarVisibility !== 'hover') return;

    const handleMouseMove = (e) => {
      if (sidebarPosition === 'left' && e.clientX < 88) {
        setIsSidebarVisible(true);
      } else if (sidebarPosition === 'right' && e.clientX > window.innerWidth - 88) {
        setIsSidebarVisible(true);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [sidebarPosition, sidebarVisibility]);

  // Fetch profile data (for sidebar avatar)
  const userId = useMemo(() => session?.user?.id, [session?.user?.id]);
  useEffect(() => {
    if (profileCacheInitialized && globalProfileCache) { setProfileData(globalProfileCache); return; }
    if (!userId) return;
    authService
      .authenticatedFetch(`${API_URL}/api/users/me`, { method: "GET", headers: { "Content-Type": "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && data.data) {
          const p = { name: data.data.name || "", profilePicture: data.data.profile_picture || "" };
          globalProfileCache = p;
          profileCacheInitialized = true;
          setProfileData(p);
        }
      })
      .catch(() => {});
  }, [userId, API_URL]);

  // Listen for profile picture updates
  useEffect(() => {
    const handler = (data) => {
      const p = { profilePicture: data.profilePicture, name: data.name || data.fullName || profileData.name };
      globalProfileCache = p;
      setProfileData(p);
      setProfileImageError(false);
    };
    return eventBus.on("profile-updated", handler);
  }, [profileData.name]);

  // Resolve profile picture URL — default to CAT when no picture is set
  const profilePictureUrl = useMemo(() => {
    const pic = profileData.profilePicture || "CAT";
    if (isProfilePictureUrl(pic)) return pic;
    return PROFILE_PICTURE_MAP[pic] || null;
  }, [profileData.profilePicture]);

  const profileInitials = useMemo(() => {
    const n = profileData.name || session?.user?.name || "";
    return n ? n.charAt(0).toUpperCase() : (session?.user?.email || "U").charAt(0).toUpperCase();
  }, [profileData, session]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const match = Object.values(shortcuts).find(s => {
        const keyMatch = s.key === e.key;
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
        return keyMatch && ctrlMatch;
      });

      if (!match) return;
      e.preventDefault();

      switch (match.action) {
        case 'openSearch': onSearchOpen(true); break;
        case 'openSettings': navigate("/settings/general"); break;
        case 'newChat': onNewChat(); break;
        case 'navHome': openCommandCenter(); break;
        case 'navChat': navigate("/all-chats"); break;
        case 'navWorkspace': navigate("/workspace"); break;
        case 'navModels': navigate("/models"); break;
        case 'navTools': navigate("/tools"); break;
        case 'navScheduler': navigate("/agent/scheduler"); break;
        case 'navProfiles': navigate("/agent/profiles"); break;
        case 'navAgent': navigate("/agent"); break;
        default: break;
      }
    };

    const handleShortcutsChange = () => {
      setShortcuts(loadKeyboardShortcuts());
    };

    document.addEventListener("keydown", handler);
    window.addEventListener('keyboard-shortcuts-changed', handleShortcutsChange);

    return () => {
      document.removeEventListener("keydown", handler);
      window.removeEventListener('keyboard-shortcuts-changed', handleShortcutsChange);
    };
  }, [onNewChat, openCommandCenter, navigate, onSearchOpen, shortcuts]);

  // Active states
  const isOnHome = basePage === "home";
  const isOnConversations = basePage === "all-chats";
  const isOnWorkspace = ["workspace", "projects"].includes(basePage);
  const isOnModels = basePage === "models";
  const isOnAgent = location.pathname.startsWith("/agent") || location.pathname.startsWith("/scheduler") || location.pathname.startsWith("/profiles");
  const isOnTools = location.pathname.startsWith("/tools");
  const isOnWorkflows = location.pathname.startsWith("/workflows");
  const isOnActivity = location.pathname.startsWith("/activity");
  const isOnTraining = location.pathname.startsWith("/training");
  const isOnTrash = basePage === "trash";
  const isOnSettings = basePage === "settings";

  const shortcutByAction = useMemo(() => {
    return Object.values(shortcuts).reduce((acc, shortcut) => {
      acc[shortcut.action] = formatShortcut(shortcut);
      return acc;
    }, {});
  }, [shortcuts]);

  const labelWithShortcut = useCallback((label, action) => {
    const shortcut = shortcutByAction[action];
    return shortcut ? `${label}  ${shortcut}` : label;
  }, [shortcutByAction]);

  const workspaceIcon = <KanbanSquare className="w-5 h-5" />;

  const primaryItems = [
    { key: "history", label: "History", action: "navChat", onClick: () => navigate("/all-chats"), active: isOnConversations, icon: <ChatIcon className="w-5 h-5" /> },
    { key: "projects", label: "Tasks", action: "navWorkspace", onClick: () => navigate("/workspace"), active: isOnWorkspace, icon: workspaceIcon },
  ].filter(item => navItemsVisibility[item.key] !== false);

  const appItems = [
    { key: "models", label: "Models", action: "navModels", onClick: () => navigate("/models"), active: isOnModels, icon: <Cpu className="w-5 h-5" /> },
    { key: "tools", label: "Tools & Skills", action: "navTools", onClick: () => navigate("/tools"), active: isOnTools, icon: <Wrench className="w-5 h-5" /> },
    { key: "workflows", label: "Workflows", action: "navWorkflows", onClick: () => navigate("/workflows"), active: isOnWorkflows, icon: <Workflow className="w-5 h-5" /> },
    { key: "activity", label: "Activity", action: "navActivity", onClick: () => navigate("/activity"), active: isOnActivity, icon: <Bell className="w-5 h-5" /> },
    { key: "training", label: "Training", action: "navTraining", onClick: () => navigate("/training"), active: isOnTraining, icon: <GraduationCap className="w-5 h-5" /> },
    { key: "agent", label: "Agent", action: "navAgent", onClick: () => navigate("/agent"), active: isOnAgent, icon: <BrainCircuit className="w-5 h-5" /> },
  ].filter(item => navItemsVisibility[item.key] !== false);

  const settingsIcon = profilePictureUrl || profileInitials ? (
    <ProfileImage
      size="w-6 h-6"
      src={profilePictureUrl}
      initials={profileInitials}
      hasError={profileImageError}
      onError={() => setProfileImageError(true)}
      onLoad={() => setProfileImageError(false)}
    />
  ) : (
    <Settings className="w-5 h-5" />
  );

  const sidebarEdgeClasses = sidebarPosition === 'right'
    ? 'right-0'
    : 'left-0';
  const sidebarWidthClass = sidebarState === 'collapsed'
    ? 'w-16'
    : 'w-16 sm:w-56';
  const sidebarVisibilityClass = sidebarVisibility === 'hover' && !isSidebarVisible
    ? `opacity-0 pointer-events-none ${sidebarPosition === 'right' ? 'translate-x-2' : '-translate-x-2'}`
    : 'opacity-100 translate-x-0';
  const sidebarTriggerClass = sidebarPosition === 'right'
    ? 'fixed right-0 top-0 bottom-0 w-20 z-40'
    : 'fixed left-0 top-0 bottom-0 w-20 z-40';

  const toggleCollapse = () => {
    const next = sidebarState === 'collapsed' ? 'expanded' : 'collapsed';
    localStorage.setItem('sidebarState', next);
    window.dispatchEvent(new Event('sidebar-state-changed'));
  };

  const CollapseIcon = sidebarState === 'collapsed'
    ? (sidebarPosition === 'right' ? ChevronLeft : ChevronRight)
    : (sidebarPosition === 'right' ? ChevronRight : ChevronLeft);

  return (
    <>
      {sidebarVisibility === 'hover' && !isSidebarVisible && (
        <div
          className={sidebarTriggerClass}
          onMouseEnter={() => setIsSidebarVisible(true)}
        />
      )}
      <aside
        className={`
          fixed ${sidebarEdgeClasses} ${topBarVisible ? 'top-10 h-[calc(100vh-2.5rem)]' : 'top-0 h-screen'}
          z-50 flex ${sidebarWidthClass} flex-col bg-white/70 backdrop-blur-xl
          dark:bg-gray-950/55 midnight:bg-gray-950/55
          transition-[opacity,transform,width] duration-150
          ${sidebarVisibilityClass}
        `}
        onMouseLeave={() => {
          if (sidebarVisibility === 'hover') {
            setIsSidebarVisible(false);
          }
        }}
      >
        {/* Header row — identical styling to SidebarNavItem */}
        <div className="flex items-center gap-1 px-2.5 pt-2.5 pb-1">
          <button
            type="button"
            onClick={openCommandCenter}
            title={labelWithShortcut("Command Center", "navHome")}
            className={`
              group flex-1 h-10 flex items-center gap-3 rounded-lg px-3
              transition-colors duration-150
              ${isOnHome || location.pathname.startsWith("/conversations") || location.pathname.startsWith("/agents")
                ? "bg-gray-100/80 text-gray-950 dark:bg-white/[0.06] dark:text-white midnight:bg-white/[0.05] midnight:text-white"
                : "text-gray-500 hover:bg-gray-100/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.045] dark:hover:text-gray-100 midnight:text-gray-500 midnight:hover:bg-white/[0.045] midnight:hover:text-gray-100"
              }
            `}
          >
            <span className={`relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
              isOnHome || location.pathname.startsWith("/conversations") || location.pathname.startsWith("/agents")
                ? 'text-gray-800 dark:text-gray-100 midnight:text-gray-100'
                : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300 midnight:text-gray-500 midnight:group-hover:text-gray-300'
            }`}>
              <Command className="h-5 w-5" />
              {hasActiveRuns && (
                <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-950" />
              )}
            </span>
            <span className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${sidebarState === 'collapsed' ? 'hidden' : 'hidden sm:block'}`}>
              {conversationTitle || 'Asyncat'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleCollapse}
            title={sidebarState === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06] transition-colors"
          >
            <CollapseIcon className="w-3.5 h-3.5" />
          </button>
        </div>


        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          <div className="space-y-1">
            {primaryItems.map((item) => (
              <SidebarNavItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                shortcut={shortcutByAction[item.action]}
                onClick={item.onClick}
                isActive={item.active}
                collapsed={sidebarState === 'collapsed'}
              />
            ))}
          </div>

          <div className="space-y-1 mt-1">
            {appItems.map((item) => (
              <SidebarNavItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                shortcut={shortcutByAction[item.action]}
                onClick={item.onClick}
                isActive={item.active}
                collapsed={sidebarState === 'collapsed'}
              />
            ))}
            {navItemsVisibility.trash !== false && (
              <SidebarNavItem
                icon={<Trash2 className="w-5 h-5" />}
                label="Trash"
                onClick={() => navigate("/trash")}
                isActive={isOnTrash}
                collapsed={sidebarState === 'collapsed'}
              />
            )}
          </div>
        </nav>

        <div className="p-2.5">
          <SidebarNavItem
            icon={settingsIcon}
            label="Settings"
            shortcut={shortcutByAction.openSettings}
            onClick={() => navigate("/settings/general")}
            isActive={isOnSettings}
            collapsed={sidebarState === 'collapsed'}
          />
        </div>
      </aside>
      <UniversalSearch isOpen={isSearchOpen} onClose={() => onSearchOpen(false)} />
    </>
  );
};

DynamicSidebar.propTypes = {
  session: PropTypes.shape({
    user: PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      name: PropTypes.string,
      email: PropTypes.string,
    }),
  }),
  onNewChat: PropTypes.func,
  basePage: PropTypes.string,
  isSearchOpen: PropTypes.bool,
  onSearchOpen: PropTypes.func,
};

export default memo(DynamicSidebar);
