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
  Settings,
  MessageSquare as ChatIcon,
  Cpu,
  Wrench,
  HardDrive,
  Clock,
  Layers,
  Trash2,
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

// ── DockItem ──────────────────────────────────────────────────────────────────

const DockItem = memo(({ children, label, onClick, isActive, dockPosition = 'bottom', className = "" }) => {
  const isVertical = dockPosition === 'left' || dockPosition === 'right';

  const tooltipClasses = {
    bottom: 'absolute bottom-full mb-3 left-1/2 -translate-x-1/2 origin-bottom',
    left: 'absolute right-full mr-3 top-1/2 -translate-y-1/2 origin-right',
    right: 'absolute left-full ml-3 top-1/2 -translate-y-1/2 origin-left',
  };

  const arrowClasses = {
    bottom: 'absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900 dark:border-t-gray-800 midnight:border-t-gray-800',
    left: 'absolute top-1/2 left-full -translate-y-1/2 border-[5px] border-transparent border-l-gray-900 dark:border-l-gray-800 midnight:border-l-gray-800',
    right: 'absolute top-1/2 right-full -translate-y-1/2 border-[5px] border-transparent border-r-gray-900 dark:border-r-gray-800 midnight:border-r-gray-800',
  };

  const activeDotClasses = {
    bottom: 'absolute -bottom-1.5 left-1/2 -translate-x-1/2',
    left: 'absolute -right-1.5 top-1/2 -translate-y-1/2',
    right: 'absolute -left-1.5 top-1/2 -translate-y-1/2',
  };

  return (
    <div className={`relative group/item flex-shrink-0 ${isVertical ? 'flex justify-center' : ''}`}>
      <button
        onClick={onClick}
        title={label}
        className={`
          relative w-10 h-10 rounded-xl flex items-center justify-center
          transition-all duration-150 active:scale-90 hover:scale-105
          ${isActive
            ? "text-gray-900 dark:text-white midnight:text-white bg-black/[0.07] dark:bg-white/10 midnight:bg-white/10"
            : "text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-800 dark:hover:text-white midnight:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.06] midnight:hover:bg-white/[0.06]"
          }
          ${className}
        `}
      >
        {children}
      </button>

      {/* Active indicator dot */}
      {isActive && (
        <span className={`${activeDotClasses[dockPosition]} w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400 midnight:bg-indigo-400 shadow-sm shadow-indigo-500/60`} />
      )}

      {/* Tooltip */}
      <div className={`
        ${tooltipClasses[dockPosition]}
        px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none z-[70]
        bg-gray-900 dark:bg-gray-800 midnight:bg-gray-800 text-white shadow-xl
        opacity-0 scale-95 group-hover/item:opacity-100 group-hover/item:scale-100
        transition-all duration-150
      `}>
        {label}
        <span className={arrowClasses[dockPosition]} />
      </div>
    </div>
  );
});
DockItem.displayName = "DockItem";
DockItem.propTypes = {
  children: PropTypes.node,
  label: PropTypes.string,
  onClick: PropTypes.func,
  isActive: PropTypes.bool,
  dockPosition: PropTypes.oneOf(["bottom", "left", "right"]),
  className: PropTypes.string,
};

// ── Dock separator ────────────────────────────────────────────────────────────

const DockSep = ({ dockPosition = 'bottom' }) => {
  const isVertical = dockPosition === 'left' || dockPosition === 'right';
  return (
    <div className={`${isVertical ? 'h-px w-6 my-0.5' : 'w-px h-6 mx-0.5'} bg-gray-200 dark:bg-white/10 midnight:bg-white/10 flex-shrink-0`} />
  );
};
DockSep.propTypes = {
  dockPosition: PropTypes.oneOf(["bottom", "left", "right"]),
};

// ── Main Dock Component ───────────────────────────────────────────────────────

const DynamicSidebar = ({
  onPageChange,
  session,
  onNewChat,
  basePage,
  isSearchOpen,
  onSearchOpen,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isDockVisible, setIsDockVisible] = useState(() => {
    return localStorage.getItem('dockVisibility') !== 'hover';
  });

  const [dockPosition, setDockPosition] = useState(() => {
    return localStorage.getItem('dockPosition') || 'bottom';
  });

  // Profile state (for dock avatar only)
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
    const handleStorageChange = (e) => {
      if (e.key === 'dockVisibility') {
        setIsDockVisible(e.newValue !== 'hover');
      }
      if (e.key === 'dockPosition') {
        setDockPosition(e.newValue || 'bottom');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const dockVis = localStorage.getItem('dockVisibility');
      setIsDockVisible(dockVis !== 'hover');
      const dockPos = localStorage.getItem('dockPosition') || 'bottom';
      setDockPosition(dockPos);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleDockPositionChange = () => {
      setDockPosition(localStorage.getItem('dockPosition') || 'bottom');
    };
    window.addEventListener('dock-position-changed', handleDockPositionChange);
    return () => window.removeEventListener('dock-position-changed', handleDockPositionChange);
  }, []);

  useEffect(() => {
    if (localStorage.getItem('dockVisibility') !== 'hover') return;

    const handleMouseMove = (e) => {
      const pos = localStorage.getItem('dockPosition') || 'bottom';
      if (pos === 'bottom' && e.clientY > window.innerHeight - 100) {
        setIsDockVisible(true);
      } else if (pos === 'left' && e.clientX < 100) {
        setIsDockVisible(true);
      } else if (pos === 'right' && e.clientX > window.innerWidth - 100) {
        setIsDockVisible(true);
      }
    };

    const handleMouseLeave = () => {
      setIsDockVisible(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // Fetch profile data (for dock avatar)
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
      const shortcuts = loadKeyboardShortcuts();

      const match = Object.values(shortcuts).find(s => {
        const keyMatch = s.key === e.key;
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
        return keyMatch && ctrlMatch;
      });

      if (!match) return;
      e.preventDefault();

      switch (match.action) {
        case 'openSearch': onSearchOpen(true); break;
        case 'openSettings': navigate("/settings/profile"); break;
        case 'newChat': onNewChat(); break;
        case 'navHome': openCommandCenter(); break;
        case 'navChat': navigate("/all-chats"); break;
        case 'navWorkspace': navigate("/workspace"); break;
        case 'navCalendar': navigate("/calendar"); break;
        case 'navFiles': navigate("/files"); break;
        case 'navModels': navigate("/models"); break;
        case 'navTools': navigate("/tools"); break;
        case 'navScheduler': navigate("/scheduler"); break;
        case 'navProfiles': navigate("/profiles"); break;
        default: break;
      }
    };

    const handleShortcutsChange = () => {
      document.removeEventListener("keydown", handler);
      document.addEventListener("keydown", handler);
    };

    document.addEventListener("keydown", handler);
    window.addEventListener('keyboard-shortcuts-changed', handleShortcutsChange);

    return () => {
      document.removeEventListener("keydown", handler);
      window.removeEventListener('keyboard-shortcuts-changed', handleShortcutsChange);
    };
  }, [onNewChat, openCommandCenter, navigate, onSearchOpen]);

  // Active states
  const isOnHome = basePage === "home";
  const isOnConversations = basePage === "all-chats";
  const isOnWorkspace = ["workspace", "projects"].includes(basePage);
  const isOnCalendar = basePage === "calendar";
  const isOnFiles = basePage === "files";
  const isOnModels = basePage === "models";
  const isOnScheduler = location.pathname.startsWith("/scheduler");
  const isOnProfiles  = location.pathname.startsWith("/profiles");
  const isOnTools = location.pathname.startsWith("/tools");
  const isOnTrash = basePage === "trash";
  const isOnSettings = basePage === "settings";

  const dockContainerClasses = {
    bottom: 'fixed bottom-4 left-1/2 -translate-x-1/2 flex-row items-center px-2.5 py-2',
    left: 'fixed left-4 top-1/2 -translate-y-1/2 flex-col items-center py-2.5 px-2',
    right: 'fixed right-4 top-1/2 -translate-y-1/2 flex-col items-center py-2.5 px-2',
  };

  const hoverTriggerClasses = {
    bottom: 'fixed bottom-0 left-0 right-0 h-24 z-40',
    left: 'fixed left-0 top-0 bottom-0 w-24 z-40',
    right: 'fixed right-0 top-0 bottom-0 w-24 z-40',
  };

  return (
    <>
      {/* ── Hover Trigger Zone (only when dockVisibility === 'hover') ── */}
      {localStorage.getItem('dockVisibility') === 'hover' && !isDockVisible && (
        <div
          className={hoverTriggerClasses[dockPosition]}
          onMouseEnter={() => setIsDockVisible(true)}
        />
      )}

      {/* ── The Dock ── */}
      <div
        className={`
          z-50
          flex gap-0.5
          bg-white/85 dark:bg-gray-900/85 midnight:bg-gray-950/90
          backdrop-blur-2xl
          border border-gray-200/70 dark:border-white/[0.08] midnight:border-white/[0.05]
          rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.55)] midnight:shadow-[0_8px_40px_rgba(0,0,0,0.7)]
          transition-opacity duration-200
          ${dockContainerClasses[dockPosition]}
          ${isDockVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onMouseEnter={() => {
          if (localStorage.getItem('dockVisibility') === 'hover') {
            setIsDockVisible(true);
          }
        }}
        onMouseLeave={() => {
          if (localStorage.getItem('dockVisibility') === 'hover') {
            setIsDockVisible(false);
          }
        }}
      >
        {/* Logo — command center */}
        <DockItem
          label={conversationTitle ? `Command Center · ${conversationTitle}` : "Command Center"}
          onClick={openCommandCenter}
          isActive={isOnHome || location.pathname.startsWith("/conversations") || location.pathname.startsWith("/agents")}
          dockPosition={dockPosition}
        >
          <img src="/cat.svg" alt="Asyncat" className="w-5 h-5" />
          {hasActiveRuns && (
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900 midnight:ring-gray-950 animate-pulse"
              title="A chat is generating"
            />
          )}
        </DockItem>

        <DockSep dockPosition={dockPosition} />

        {/* History — navigates to all chats history */}
        <DockItem
          label="History  ⌘2"
          onClick={() => navigate("/all-chats")}
          isActive={isOnConversations}
          dockPosition={dockPosition}
        >
          <ChatIcon className="w-5 h-5" />
        </DockItem>

        {/* Workspace — navigates directly to projects page */}
        <DockItem
          label="Workspace  ⌘3"
          onClick={() => navigate("/workspace")}
          isActive={isOnWorkspace}
          dockPosition={dockPosition}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </DockItem>

        {/* Calendar — direct navigate */}
        <DockItem
          label="Calendar  ⌘4"
          onClick={() => navigate("/calendar")}
          isActive={isOnCalendar}
          dockPosition={dockPosition}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </DockItem>

        {/* Files — direct navigate */}
        <DockItem
          label="Files  ⌘5"
          onClick={() => navigate("/files")}
          isActive={isOnFiles}
          dockPosition={dockPosition}
        >
          <HardDrive className="w-5 h-5" />
        </DockItem>

        <DockSep dockPosition={dockPosition} />

        {/* Models — standalone app */}
        <DockItem
          label="Models  ⌘6"
          onClick={() => navigate("/models")}
          isActive={isOnModels}
          dockPosition={dockPosition}
        >
          <Cpu className="w-5 h-5" />
        </DockItem>

        {/* Tools & Skills — standalone app */}
        <DockItem
          label="Tools & Skills  ⌘7"
          onClick={() => navigate("/tools")}
          isActive={isOnTools}
          dockPosition={dockPosition}
        >
          <Wrench className="w-5 h-5" />
        </DockItem>

        {/* Scheduler */}
        <DockItem
          label="Scheduler  ⌘8"
          onClick={() => navigate("/scheduler")}
          isActive={isOnScheduler}
          dockPosition={dockPosition}
        >
          <Clock className="w-5 h-5" />
        </DockItem>

        {/* Profiles */}
        <DockItem
          label="Profiles  ⌘9"
          onClick={() => navigate("/profiles")}
          isActive={isOnProfiles}
          dockPosition={dockPosition}
        >
          <Layers className="w-5 h-5" />
        </DockItem>

        {/* Trash */}
        <DockItem
          label="Trash"
          onClick={() => navigate("/trash")}
          isActive={isOnTrash}
          dockPosition={dockPosition}
        >
          <Trash2 className="w-5 h-5" />
        </DockItem>

        <DockSep dockPosition={dockPosition} />

        {/* Settings/Profile — navigates to unified settings page */}
        <DockItem
          label="Settings & Profile"
          onClick={() => navigate("/settings/profile")}
          isActive={isOnSettings}
          dockPosition={dockPosition}
        >
          {profilePictureUrl || profileInitials ? (
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
          )}
        </DockItem>
      </div>

      {/* ── Modals ── */}
      <UniversalSearch isOpen={isSearchOpen} onClose={() => onSearchOpen(false)} onNavigate={onPageChange} />
    </>
  );
};

DynamicSidebar.propTypes = {
  onPageChange: PropTypes.func,
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
