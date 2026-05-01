import React, {
  useState,
  useEffect,
  memo,
  useCallback,
  useMemo,
  useRef,
} from "react";
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
import { useWorkspace } from "../contexts/WorkspaceContext";
import { loadKeyboardShortcuts } from "../utils/keyboardShortcutsUtils.js";

let globalProfileCache = null;
let profileCacheInitialized = false;

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

// ── DockItem ──────────────────────────────────────────────────────────────────

const DockItem = memo(({ children, label, onClick, isActive, className = "" }) => (
  <div className="relative group/item flex-shrink-0">
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
      <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400 midnight:bg-indigo-400 shadow-sm shadow-indigo-500/60" />
    )}

    {/* Tooltip */}
    <div className="
      absolute bottom-full mb-3 left-1/2 -translate-x-1/2
      px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none z-[70]
      bg-gray-900 dark:bg-gray-800 midnight:bg-gray-800 text-white shadow-xl
      opacity-0 scale-95 group-hover/item:opacity-100 group-hover/item:scale-100
      transition-all duration-150 origin-bottom
    ">
      {label}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900 dark:border-t-gray-800 midnight:border-t-gray-800" />
    </div>
  </div>
));
DockItem.displayName = "DockItem";

// ── Dock separator ────────────────────────────────────────────────────────────

const DockSep = () => (
  <div className="w-px h-6 bg-gray-200 dark:bg-white/10 midnight:bg-white/10 mx-0.5 flex-shrink-0" />
);

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

  // Profile state (for dock avatar only)
  const API_URL = import.meta.env.VITE_USER_URL;
  const [profileData, setProfileData] = useState(
    () => globalProfileCache || { name: "", profilePicture: "" }
  );
  const [profileImageError, setProfileImageError] = useState(false);
  const [dockItemsVisible, setDockItemsVisible] = useState(() => {
    const stored = localStorage.getItem('dockItemsVisible');
    if (stored) return JSON.parse(stored);
    return { chat: true, workspace: true, calendar: true, files: true, models: true, tools: true, scheduler: true, profiles: true, search: true, settings: true };
  });

  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    const handleStorageChange = () => {
      const dockVis = localStorage.getItem('dockVisibility');
      setIsDockVisible(dockVis !== 'hover');
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const dockVis = localStorage.getItem('dockVisibility');
      setIsDockVisible(dockVis !== 'hover');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (localStorage.getItem('dockVisibility') !== 'hover') return;

    const handleMouseMove = (e) => {
      if (e.clientY > window.innerHeight - 100) {
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
    const handler = (e) => {
      const p = { profilePicture: e.detail.profilePicture, name: e.detail.name || e.detail.fullName || profileData.name };
      globalProfileCache = p;
      setProfileData(p);
      setProfileImageError(false);
    };
    window.addEventListener("profile-updated", handler);
    return () => window.removeEventListener("profile-updated", handler);
  }, [profileData.name]);

  // Resolve profile picture URL
  const profilePictureUrl = useMemo(() => {
    const pic = profileData.profilePicture;
    if (!pic) return null;
    if (pic.startsWith("https://")) return pic;
    try {
      const dpMap = {
        CAT: "../assets/dp/CAT.webp", DOG: "../assets/dp/DOG.webp",
        DOLPHIN: "../assets/dp/DOLPHIN.webp", DRAGON: "../assets/dp/DRAGON.webp",
        ELEPHANT: "../assets/dp/ELEPHANT.webp", FOX: "../assets/dp/FOX.webp",
        LION: "../assets/dp/LION.webp", OWL: "../assets/dp/OWL.webp",
        PENGUIN: "../assets/dp/PENGUIN.webp", WOLF: "../assets/dp/WOLF.webp",
      };
      if (dpMap[pic]) return new URL(dpMap[pic], import.meta.url).href;
    } catch { return null; }
    return null;
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
        case 'navHome': onNewChat(); break;
        case 'navChat': navigate("/all-chats"); break;
        case 'navWorkspace': navigate("/workspace"); break;
        case 'navCalendar': navigate("/calendar"); break;
        case 'navFiles': navigate("/files"); break;
        case 'navModels': navigate("/models"); break;
        case 'navTools': navigate("/agents/tools"); break;
        case 'navScheduler': navigate("/agents/schedule"); break;
        case 'navProfiles': navigate("/agents/profiles"); break;
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
  }, [onNewChat]);

  // Active states
  const isOnHome = basePage === "home";
  const isOnConversations = ["conversations", "all-chats"].includes(basePage);
  const isOnWorkspace = ["workspace", "projects"].includes(basePage);
  const isOnCalendar = basePage === "calendar";
  const isOnFiles = basePage === "files";
  const isOnModels = basePage === "models";
  const isOnScheduler = location.pathname.startsWith("/agents/schedule");
  const isOnProfiles  = location.pathname.startsWith("/agents/profiles");
  const isOnTools = basePage === "agents" && !isOnScheduler && !isOnProfiles;
  const isOnTrash = basePage === "trash";
  const isOnSettings = basePage === "settings";

  return (
    <>
      {/* ── Hover Trigger Zone (only when dockVisibility === 'hover') ── */}
      {localStorage.getItem('dockVisibility') === 'hover' && !isDockVisible && (
        <div
          className="fixed bottom-0 left-0 right-0 h-24 z-40"
          onMouseEnter={() => setIsDockVisible(true)}
        />
      )}

      {/* ── The Dock ── */}
      <div
        className={`
          fixed bottom-4 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-0.5 px-2.5 py-2
          bg-white/85 dark:bg-gray-900/85 midnight:bg-gray-950/90
          backdrop-blur-2xl
          border border-gray-200/70 dark:border-white/[0.08] midnight:border-white/[0.05]
          rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.55)] midnight:shadow-[0_8px_40px_rgba(0,0,0,0.7)]
          transition-opacity duration-200
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
        {/* Logo — new chat */}
        <DockItem label="New Chat  ⌘N" onClick={onNewChat} isActive={isOnHome}>
          <img src="/cat.svg" alt="Asyncat" className="w-5 h-5" />
        </DockItem>

        <DockSep />

        {/* Chat — navigates to all chats history */}
        <DockItem
          label="Chat  ⌘2"
          onClick={() => navigate("/all-chats")}
          isActive={isOnConversations}
        >
          <ChatIcon className="w-5 h-5" />
        </DockItem>

        {/* Workspace — navigates directly to projects page */}
        <DockItem
          label="Workspace  ⌘3"
          onClick={() => navigate("/workspace")}
          isActive={isOnWorkspace}
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
        >
          <HardDrive className="w-5 h-5" />
        </DockItem>

        <DockSep />

        {/* Models — standalone app */}
        <DockItem
          label="Models  ⌘6"
          onClick={() => navigate("/models")}
          isActive={isOnModels}
        >
          <Cpu className="w-5 h-5" />
        </DockItem>

        {/* Tools & Skills — standalone app */}
        <DockItem
          label="Tools & Skills  ⌘7"
          onClick={() => navigate("/agents/tools")}
          isActive={isOnTools}
        >
          <Wrench className="w-5 h-5" />
        </DockItem>

        {/* Scheduler */}
        <DockItem
          label="Scheduler  ⌘8"
          onClick={() => navigate("/agents/schedule")}
          isActive={isOnScheduler}
        >
          <Clock className="w-5 h-5" />
        </DockItem>

        {/* Profiles */}
        <DockItem
          label="Profiles  ⌘9"
          onClick={() => navigate("/agents/profiles")}
          isActive={isOnProfiles}
        >
          <Layers className="w-5 h-5" />
        </DockItem>

        {/* Trash */}
        <DockItem
          label="Trash"
          onClick={() => navigate("/trash")}
          isActive={isOnTrash}
        >
          <Trash2 className="w-5 h-5" />
        </DockItem>

        <DockSep />

        {/* Settings/Profile — navigates to unified settings page */}
        <DockItem
          label="Settings & Profile"
          onClick={() => navigate("/settings/profile")}
          isActive={isOnSettings}
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

export default memo(DynamicSidebar);
