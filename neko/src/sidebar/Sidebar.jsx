import React, {
	useState,
	useEffect,
	memo,
	useCallback,
	useMemo,
	useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import authService from "../services/authService.js";
import {
	Settings,
	PanelLeft,
	LogOut,
	MessageSquare,
	Plus,
	FolderOpen,
	Users,
	Hash,
	Zap,
	Calendar,
	Archive,
	Star,
	MoreHorizontal,
	Home,
	Compass,
	Building,
	ChevronRight,
	User,
	Folder,
	HomeIcon,
	Info,
	X,
	Library,
	Search,
	FlaskConical,
	Cpu,
	Code2,
	RefreshCw,
	Square,
	Bot,
	SlidersHorizontal,
	MessageSquare as ChatIcon,
	FolderOpen as ProjectsIcon,
	Calendar as CalendarIcon,
	Loader2,
} from "lucide-react";

import ChatExplorer from "./ChatExplorer";
import ProjectExplorer from "./ProjectExplorer";
import CreateProjectFlow from "../projects/components/CreateProjectFlow";
import CalendarContent from "./CalendarContent";
import UniversalSearch from "./UniversalSearch";
import HardwareWidget from "./HardwareWidget";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { usePermissions } from "../utils/permissions";
import { agentApi } from "../CommandCenter/commandCenterApi";
import ModelPickerDropdown from "../CommandCenter/components/ModelPickerDropdown";
import ModelParamsSidebar from "../CommandCenter/components/ModelParamsSidebar";

// ── Persistent model section (all modes) ─────────────────────────────────────
const ModelSection = memo(() => {
	const [showParams, setShowParams] = useState(false);
	return (
		<>
			<div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800 px-2 py-1.5 flex items-center gap-1">
				<div className="flex-1 min-w-0">
					<ModelPickerDropdown />
				</div>
				<button
					onClick={() => setShowParams(v => !v)}
					className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${showParams
							? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
							: 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
						}`}
					title="Model parameters & logs"
				>
					<SlidersHorizontal className="w-3.5 h-3.5" />
				</button>
			</div>
			{showParams && (
				<ModelParamsSidebar onClose={() => setShowParams(false)} />
			)}
		</>
	);
});
ModelSection.displayName = 'ModelSection';

// ── Agents sidebar panel ──────────────────────────────────────────────────────
function sessionStatus(s) {
  const hasAnswer = s.scratchpad?.finalAnswer || s.status === 'complete';
  const hasError  = s.status === 'error' || s.status === 'failed';
  const isEmpty   = !s.goal || s.goal.trim() === '';
  if (hasError)  return 'error';
  if (!hasAnswer && !hasError) return 'incomplete';
  return 'complete';
}

const AgentsSidebarContent = memo(({ navigate, currentPage }) => {
	const [sessions, setSessions]       = useState([]);
	const [deletingId, setDeletingId]   = useState(null);
	const [hoveredId, setHoveredId]     = useState(null);

	const loadSessions = useCallback(() => {
		agentApi.getSessions(40).then(res => {
			if (res?.sessions) setSessions(res.sessions);
		}).catch(() => {});
	}, []);

	useEffect(() => {
		loadSessions();
		window.addEventListener('agent-run-complete', loadSessions);
		return () => window.removeEventListener('agent-run-complete', loadSessions);
	}, [loadSessions]);

	const handleDelete = useCallback(async (e, id) => {
		e.stopPropagation();
		setDeletingId(id);
		try {
			await agentApi.deleteSession(id);
			setSessions(prev => prev.filter(s => s.id !== id));
			// If we were viewing this session, go back to /agents
			if (window.location.pathname.includes(id)) navigate('/agents');
		} catch {}
		setDeletingId(null);
	}, [navigate]);

	const isActive = (path) => typeof window !== 'undefined' && window.location.pathname.startsWith(path);

	// Group by date for cleaner display
	const today = new Date().toDateString();
	const yesterday = new Date(Date.now() - 86400000).toDateString();
	const formatDate = (d) => {
		const dt = new Date(d).toDateString();
		if (dt === today) return null; // no label for today
		if (dt === yesterday) return 'Yesterday';
		return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	};

	let lastDateLabel = null;

	return (
		<div className="flex flex-col h-full">
			{/* New Run button */}
			<div className="px-2 pt-2 pb-1">
				<button
					onClick={() => navigate('/agents')}
					className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200/60 dark:border-indigo-700/40 transition-colors"
				>
					<Plus className="w-3.5 h-3.5" />
					New Run
				</button>
			</div>

			{/* Sessions list */}
			<div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
				{sessions.length === 0 && (
					<p className="text-xs text-gray-400 dark:text-gray-600 text-center py-8 px-3 leading-relaxed">
						No runs yet.<br />Give the agent a goal above.
					</p>
				)}

				{sessions.map(s => {
					const status  = sessionStatus(s);
					const dateLabel = s.created_at ? formatDate(s.created_at) : null;
					const showLabel = dateLabel !== lastDateLabel;
					lastDateLabel = dateLabel;
					const active  = isActive(`/agents/${s.id}`);
					const label   = s.goal ? s.goal.slice(0, 60) : '(untitled)';
					const isDeleting = deletingId === s.id;

					return (
						<React.Fragment key={s.id}>
							{showLabel && dateLabel && (
								<div className="px-2 pt-3 pb-1">
									<span className="text-[10px] font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wider">{dateLabel}</span>
								</div>
							)}
							<div
								className={`group relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
									active
										? 'bg-gray-100 dark:bg-gray-800'
										: 'hover:bg-gray-100 dark:hover:bg-gray-800/60'
								}`}
								onClick={() => navigate(`/agents/${s.id}`)}
								onMouseEnter={() => setHoveredId(s.id)}
								onMouseLeave={() => setHoveredId(null)}
							>
								{/* Status dot */}
								<div className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-0.5 ${
									status === 'error'      ? 'bg-red-400'
									: status === 'incomplete' ? 'bg-amber-400'
									: 'bg-emerald-400'
								}`} />

								{/* Label */}
								<span className={`flex-1 text-xs truncate leading-snug ${
									active
										? 'text-gray-900 dark:text-gray-100 font-medium'
										: 'text-gray-600 dark:text-gray-400'
								}`}>
									{label}
								</span>

								{/* Delete button — visible on hover */}
								{(hoveredId === s.id || isDeleting) && (
									<button
										onClick={(e) => handleDelete(e, s.id)}
										disabled={isDeleting}
										className="flex-shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
										title="Delete session"
									>
										{isDeleting
											? <Loader2 className="w-3 h-3 animate-spin" />
											: <X className="w-3 h-3" />}
									</button>
								)}
							</div>
						</React.Fragment>
					);
				})}
			</div>

			{/* Legend */}
			{sessions.length > 0 && (
				<div className="flex-shrink-0 px-3 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
					<span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Done</span>
					<span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Partial</span>
					<span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Error</span>
				</div>
			)}
		</div>
	);
});
AgentsSidebarContent.displayName = 'AgentsSidebarContent';


// Clean Navigation Item Component
const NavItem = memo(
	({ icon: Icon, label, onClick, isActive, badge, className = "" }) => (
		<button
			onClick={onClick}
			className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 relative active:scale-95 ${isActive
					? "bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-100"
					: "text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200"
				} ${className}`}
			title={label}
		>
			<Icon className="w-5 h-5" />

			{/* Notification badge - only show when badge > 0 */}
			{badge > 0 && (
				<span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
					{badge > 9 ? "9+" : badge}
				</span>
			)}
		</button>
	)
);

NavItem.displayName = "NavItem";

// Persistent logo component to prevent re-renders
const LogoComponent = memo(() => {
	return (
		<img
			src="/cat.svg"
			alt="Cat"
			className="w-6 h-6"
			loading="eager"
			decoding="async"
			style={{ imageRendering: "auto" }}
		/>
	);
});

LogoComponent.displayName = "LogoComponent";

// FIXED: Persistent ProfileImage component to prevent re-renders - moved outside UserProfile
const ProfileImage = memo(
	({
		size = "w-8 h-8",
		className = "",
		src,
		initials,
		hasError,
		onError,
		onLoad,
	}) => {
		if (src && !hasError) {
			return (
				<img
					src={src}
					alt="Profile"
					className={`${size} rounded-full object-cover ${className}`}
					loading="eager"
					decoding="async"
					style={{ imageRendering: "auto" }}
					onError={onError}
					onLoad={onLoad}
				/>
			);
		}

		return (
			<div
				className={`${size} rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium text-sm ${className}`}
			>
				{initials}
			</div>
		);
	}
);

ProfileImage.displayName = "ProfileImage";

// FIXED: Global profile cache to prevent refetching
let globalProfileCache = null;
let profileCacheInitialized = false;

// User Profile Component - FIXED with proper caching and memoization
const UserProfile = memo(
	({
		session,
		onSignOut,
		onNavigate,
		onCreateWorkspace,
		showProfileDropdown,
		setShowProfileDropdown,
		hasWorkspaceAccess,
		hasReachedWorkspaceLimit,
		ownedWorkspaces,
		setIsWelcomeModalOpen,
	}) => {
		const API_URL = import.meta.env.VITE_USER_URL;
		const PROFILE_API = `${API_URL}/api/users/me`;

		const [profileData, setProfileData] = useState(() => {
			// Initialize with cache if available
			return (
				globalProfileCache || {
					name: "",
					profilePicture: "",
				}
			);
		});
		const [isLoading, setIsLoading] = useState(!profileCacheInitialized);
		const [imageLoadError, setImageLoadError] = useState(false);

		const {
			currentWorkspace,
		} = useWorkspace();


		// FIXED: Memoize user ID to prevent unnecessary effects
		const userId = useMemo(() => session?.user?.id, [session?.user?.id]);

		useEffect(() => {
			// FIXED: Only fetch if we don't have cached data
			if (profileCacheInitialized && globalProfileCache) {
				setProfileData(globalProfileCache);
				setIsLoading(false);
				return;
			}

			const fetchUserProfile = async () => {
				try {
					setIsLoading(true);
					const response = await authService.authenticatedFetch(
						PROFILE_API,
						{
							method: "GET",
							headers: {
								"Content-Type": "application/json",
							},
						}
					);

					if (!response.ok) {
						throw new Error("Failed to fetch profile data");
					}

					const data = await response.json();

					if (data.success && data.data) {
						const newProfileData = {
							name: data.data.name || "",
							profilePicture: data.data.profile_picture || "",
						};

						// FIXED: Cache globally to prevent refetching
						globalProfileCache = newProfileData;
						profileCacheInitialized = true;

						setProfileData(newProfileData);
						setImageLoadError(false);
					}
				} catch (error) {
					console.error("Error fetching profile:", error);
					if (session?.user) {
						const fallbackData = {
							name: session.user.name || "",
							profilePicture:
								session.user.profile_picture ||
								session.user.user_metadata?.profile_picture ||
								"",
						};

						// FIXED: Cache fallback data too
						globalProfileCache = fallbackData;
						profileCacheInitialized = true;

						setProfileData(fallbackData);
					}
				} finally {
					setIsLoading(false);
				}
			};

			// Only fetch if we have a user ID and no cache
			if (userId && !profileCacheInitialized) {
				fetchUserProfile();
			}
		}, [PROFILE_API, userId]); // FIXED: Only depend on stable userId

		useEffect(() => {
			const handleProfileUpdate = (event) => {
				const newProfileData = {
					profilePicture: event.detail.profilePicture,
					name:
						event.detail.name ||
						event.detail.fullName ||
						profileData.name,
				};

				// FIXED: Update global cache
				globalProfileCache = newProfileData;
				setProfileData(newProfileData);
				setImageLoadError(false);
			};

			const handleClickOutside = (event) => {
				if (
					showProfileDropdown &&
					!event.target.closest(".profile-dropdown-container")
				) {
					setShowProfileDropdown(false);
				}
			};

			window.addEventListener("profile-updated", handleProfileUpdate);
			document.addEventListener("click", handleClickOutside);

			return () => {
				window.removeEventListener(
					"profile-updated",
					handleProfileUpdate
				);
				document.removeEventListener("click", handleClickOutside);
			};
		}, [showProfileDropdown, profileData.name]); // FIXED: Minimal dependencies

		// FIXED: Memoize initials to prevent recalculation
		const getInitials = useMemo(() => {
			const name = profileData.name || session?.user?.name || "";
			if (name) return name.charAt(0).toUpperCase();

			const email = session?.user?.email || "";
			if (!email) return "U";
			return email.charAt(0).toUpperCase();
		}, [profileData.name, session?.user?.name, session?.user?.email]);

		// FIXED: Memoize profile picture URL to prevent recalculation
		const getProfilePicture = useMemo(() => {
			const profilePic = profileData.profilePicture;

			if (!profilePic) return null;

			if (profilePic.startsWith("https://")) {
				return profilePic;
			}

			try {
				switch (profilePic) {
					case "CAT":
						return new URL("../assets/dp/CAT.webp", import.meta.url)
							.href;
					case "DOG":
						return new URL("../assets/dp/DOG.webp", import.meta.url)
							.href;
					case "DOLPHIN":
						return new URL(
							"../assets/dp/DOLPHIN.webp",
							import.meta.url
						).href;
					case "DRAGON":
						return new URL(
							"../assets/dp/DRAGON.webp",
							import.meta.url
						).href;
					case "ELEPHANT":
						return new URL(
							"../assets/dp/ELEPHANT.webp",
							import.meta.url
						).href;
					case "FOX":
						return new URL("../assets/dp/FOX.webp", import.meta.url)
							.href;
					case "LION":
						return new URL(
							"../assets/dp/LION.webp",
							import.meta.url
						).href;
					case "OWL":
						return new URL("../assets/dp/OWL.webp", import.meta.url)
							.href;
					case "PENGUIN":
						return new URL(
							"../assets/dp/PENGUIN.webp",
							import.meta.url
						).href;
					case "WOLF":
						return new URL(
							"../assets/dp/WOLF.webp",
							import.meta.url
						).href;
					default:
						return null;
				}
			} catch (error) {
				console.error(
					"Failed to load predefined profile picture:",
					error
				);
				return null;
			}
		}, [profileData.profilePicture]);

		// FIXED: Memoize error handlers to prevent ProfileImage re-renders
		const handleImageError = useCallback(() => {
			setImageLoadError(true);
		}, []);

		const handleImageLoad = useCallback(() => {
			setImageLoadError(false);
		}, []);

		const getWorkspaceEmoji = (workspace) => {
			if (workspace?.emoji) return workspace.emoji;
			// Prefer owner_id if available (hybrid ownership model for workspaces/projects)
			const currentUserId = session?.user?.id;
			if (
				workspace?.owner_id &&
				currentUserId &&
				workspace.owner_id === currentUserId
			)
				return "👑";
			// Fallback to user_role for backward compatibility
			if (workspace?.user_role === "owner") return "👑";
			if (workspace?.access_type === "workspace") return "🏢";
			return "📁";
		};

		return (
			<div className="relative flex flex-col items-center space-y-1 profile-dropdown-container">
				<button
					onClick={() => setShowProfileDropdown(!showProfileDropdown)}
					className="w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 flex items-center justify-center transition-colors duration-200"
					title={
						session?.user?.name ||
						session?.user?.email ||
						"User Profile"
					}
				>
					<ProfileImage
						size="w-6 h-6"
						src={getProfilePicture}
						initials={getInitials}
						hasError={imageLoadError}
						onError={handleImageError}
						onLoad={handleImageLoad}
					/>
				</button>

				{/* Profile dropdown - now controlled by click */}
				{showProfileDropdown && (
					<div className="absolute bottom-full left-0 mb-2 z-50">
						<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-800 midnight:border-gray-800 rounded-lg p-3 min-w-[280px]">
							{/* User Info */}
							<div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-800">
								<div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-1">
									{profileData.name ||
										session?.user?.name ||
										"User"}
								</div>
								<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
									{session?.user?.email || "user@example.com"}
								</div>
							</div>

							{/* Current Workspace */}
							<div className="mb-3">
								<div className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-2 uppercase tracking-wide">
									Current Workspace
								</div>
								<div className="w-full flex items-center p-3 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg">
									<span className="text-base mr-2">
										{getWorkspaceEmoji(currentWorkspace)}
									</span>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
											{currentWorkspace?.name || "No Workspace"}
										</div>
										<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
											{(currentWorkspace?.owner_id &&
												session?.user?.id &&
												currentWorkspace.owner_id === session.user.id) ||
												currentWorkspace?.user_role === "owner"
												? "Owner"
												: hasWorkspaceAccess()
													? "Member"
													: "Guest"}
										</div>
									</div>
								</div>
							</div>

							{/* Workspace Actions */}
							<div className="space-y-2 mb-3">
								<button
									onClick={() => {
										setShowProfileDropdown(false);
										onNavigate('workspaces');
									}}
									className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 rounded-lg transition-colors"
								>
									<Building className="w-4 h-4 mr-2" />
									Switch Workspace
								</button>
								{!hasReachedWorkspaceLimit && (
									<button
										onClick={() => {
											setShowProfileDropdown(false);
											onCreateWorkspace();
										}}
										className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 rounded-lg transition-colors"
									>
										<Plus className="w-4 h-4 mr-2" />
										Create Workspace
									</button>
								)}
							</div>

							{/* About Button */}
							<button
								onClick={() => {
									setShowProfileDropdown(false);
									setIsWelcomeModalOpen(true);
								}}
								className="w-full flex items-center px-2 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded transition-colors mb-1"
							>
								<Info className="w-4 h-4 mr-2" />
								About
							</button>

							{/* Settings Button */}
							<button
								onClick={() => {
									setShowProfileDropdown(false);
									onNavigate("settings");
								}}
								className="w-full flex items-center px-2 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded transition-colors mb-1"
							>
								<Settings className="w-4 h-4 mr-2" />
								Settings
							</button>

							{/* Sign Out Button */}
							<button
								onClick={() => {
									setShowProfileDropdown(false);
									onSignOut();
								}}
								className="w-full flex items-center px-2 py-1.5 text-left text-sm text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 rounded transition-colors"
								title="Signs out from all devices"
							>
								<LogOut className="w-4 h-4 mr-2" />
								Sign Out
							</button>
						</div>
					</div>
				)}
			</div>
		);
	}
);

UserProfile.displayName = "UserProfile";

// Clean Content Header Component
const ContentHeader = memo(({ title, subtitle, action }) => (
	<div className="flex items-center justify-between mb-6">
		<div>
			<h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
				{title}
			</h2>
			{subtitle && (
				<p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-1">
					{subtitle}
				</p>
			)}
		</div>
		{action}
	</div>
));

ContentHeader.displayName = "ContentHeader";

// Welcome/About Modal Component - Elegant animated experience
const WelcomeModal = memo(({ isOpen, onClose }) => {
	const [currentSlide, setCurrentSlide] = useState(0);
	const [isAnimating, setIsAnimating] = useState(false);
	const [modalVisible, setModalVisible] = useState(false);
	const [contentVisible, setContentVisible] = useState(false);
	const [slideDirection, setSlideDirection] = useState(1); // 1 = forward, -1 = backward

	useEffect(() => {
		if (isOpen) {
			setCurrentSlide(0);
			setSlideDirection(1);
			const modalTimer = setTimeout(() => setModalVisible(true), 10);
			const contentTimer = setTimeout(() => setContentVisible(true), 100);
			return () => {
				clearTimeout(modalTimer);
				clearTimeout(contentTimer);
			};
		} else {
			setModalVisible(false);
			setContentVisible(false);
		}
	}, [isOpen]);

	const slides = [
		{
			title: "Welcome to Asyncat Workspace",
			subtitle: "Your AI-native productivity hub",
			accent: "from-violet-500 to-indigo-500",
			content: (
				<div className="text-center space-y-6">
					<div className="relative inline-block" style={{ animation: "acFloat 3s ease-in-out infinite" }}>
						<div className="absolute inset-0 rounded-full bg-violet-400/20 blur-2xl scale-150" />
						<div className="relative w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 midnight:from-violet-900/40 midnight:to-indigo-900/40 flex items-center justify-center shadow-xl border border-violet-200/60 dark:border-violet-700/40 midnight:border-violet-700/40">
							<img src="/cat.svg" className="w-14 h-14" alt="Asyncat Workspace" />
						</div>
					</div>
					<div className="space-y-3">
						<p className="text-base text-gray-600 dark:text-gray-300 midnight:text-gray-300 leading-relaxed max-w-xs mx-auto">
							Where productivity meets intelligence. Chat, build, organize — all in one place.
						</p>
						<div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
							<span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
							AI-powered workspace
						</div>
					</div>
				</div>
			),
		},
		{
			title: "Modular by design",
			subtitle: "Everything you need, nothing you don't",
			accent: "from-blue-500 to-cyan-500",
			content: (
				<div className="space-y-3 max-w-sm mx-auto w-full">
					{[
						{ icon: "💬", label: "Chat", desc: "AI conversations with context", color: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 border-blue-100 dark:border-blue-800/40 midnight:border-blue-800/40" },
						{ icon: "📁", label: "Projects", desc: "Boards, notes, habits & more", color: "bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/20 border-purple-100 dark:border-purple-800/40 midnight:border-purple-800/40" },
						{ icon: "📅", label: "Calendar", desc: "Smart scheduling & sync", color: "bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40 midnight:border-emerald-800/40" },
						{ icon: "🎯", label: "Feed", desc: "AI-curated personalized dashboard", color: "bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/20 border-orange-100 dark:border-orange-800/40 midnight:border-orange-800/40" },
					].map((item, i) => (
						<div
							key={item.label}
							className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all duration-500 ${item.color}`}
							style={{
								opacity: contentVisible ? 1 : 0,
								transform: contentVisible ? "translateX(0)" : "translateX(-16px)",
								transitionDelay: `${i * 75 + 60}ms`,
							}}
						>
							<span className="text-xl">{item.icon}</span>
							<div>
								<p className="font-semibold text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100">{item.label}</p>
								<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">{item.desc}</p>
							</div>
						</div>
					))}
				</div>
			),
		},
		{
			title: "Quick tips",
			subtitle: "Work smarter with shortcuts",
			accent: "from-emerald-500 to-teal-500",
			content: (
				<div className="space-y-3 max-w-sm mx-auto w-full">
					{[
						{ key: "Ctrl+K", action: "Search everywhere", icon: "🔍" },
						{ key: "Ctrl+,", action: "Workspace settings", icon: "⚙️" },
						{ key: "Ctrl+/", action: "Toggle sidebar", icon: "◀" },
					].map((shortcut, i) => (
						<div
							key={shortcut.key}
							className="flex items-center gap-4 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50 midnight:border-gray-700/50 transition-all duration-500"
							style={{
								opacity: contentVisible ? 1 : 0,
								transform: contentVisible ? "translateY(0)" : "translateY(14px)",
								transitionDelay: `${i * 90 + 80}ms`,
							}}
						>
							<span className="text-base w-8 text-center">{shortcut.icon}</span>
							<div className="flex-1 flex items-center justify-between">
								<span className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-300">{shortcut.action}</span>
								<kbd className="px-2.5 py-1 bg-white dark:bg-gray-700 midnight:bg-gray-700 rounded-lg text-xs font-mono shadow-sm border border-gray-200 dark:border-gray-600 midnight:border-gray-600 text-gray-700 dark:text-gray-200 midnight:text-gray-200">
									{shortcut.key}
								</kbd>
							</div>
						</div>
					))}
				</div>
			),
		},
		{
			title: "Stay connected",
			subtitle: "We'd love to hear from you",
			accent: "from-pink-500 to-rose-500",
			content: (
				<div className="space-y-6 max-w-sm mx-auto text-center">
					<p
						className="text-gray-600 dark:text-gray-400 midnight:text-gray-400 text-sm leading-relaxed transition-all duration-500"
						style={{
							opacity: contentVisible ? 1 : 0,
							transform: contentVisible ? "translateY(0)" : "translateY(10px)",
							transitionDelay: "80ms",
						}}
					>
						Questions, feedback, or just saying hi — we're all ears.
					</p>
					<div
						className="flex items-center justify-center gap-3 transition-all duration-500"
						style={{
							opacity: contentVisible ? 1 : 0,
							transform: contentVisible ? "translateY(0)" : "translateY(10px)",
							transitionDelay: "160ms",
						}}
					>
						<a
							href="mailto:info@asyncat.com"
							className="flex flex-col items-center p-4 rounded-2xl border border-transparent hover:border-gray-100 dark:hover:border-gray-700 midnight:hover:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-900/20 transition-all duration-200 group"
						>
							<span className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-200">📧</span>
							<span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400">Email</span>
						</a>
						<a
							href="https://x.com/asyncatHQ"
							target="_blank"
							rel="noopener noreferrer"
							className="flex flex-col items-center p-4 rounded-2xl border border-transparent hover:border-gray-100 dark:hover:border-gray-700 midnight:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50 transition-all duration-200 group"
						>
							<span className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-200">𝕏</span>
							<span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400">Twitter</span>
						</a>
						<a
							href="https://www.instagram.com/asyncathq/"
							target="_blank"
							rel="noopener noreferrer"
							className="flex flex-col items-center p-4 rounded-2xl border border-transparent hover:border-gray-100 dark:hover:border-gray-700 midnight:hover:border-gray-700 hover:bg-pink-50 dark:hover:bg-pink-900/20 midnight:hover:bg-pink-900/20 transition-all duration-200 group"
						>
							<span className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-200">📷</span>
							<span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400">Instagram</span>
						</a>
					</div>
				</div>
			),
		},
	];

	const goToSlide = (index) => {
		if (isAnimating || index === currentSlide) return;
		setSlideDirection(index > currentSlide ? 1 : -1);
		setIsAnimating(true);
		setContentVisible(false);
		setTimeout(() => {
			setCurrentSlide(index);
			setTimeout(() => {
				setContentVisible(true);
				setIsAnimating(false);
			}, 50);
		}, 250);
	};

	const nextSlide = () => {
		if (currentSlide < slides.length - 1) {
			goToSlide(currentSlide + 1);
		} else {
			onClose();
		}
	};

	const prevSlide = () => {
		if (currentSlide > 0) {
			goToSlide(currentSlide - 1);
		}
	};

	if (!isOpen) return null;

	const accent = slides[currentSlide].accent;

	return (
		<>
			<style>{`
				@keyframes acFloat {
					0%, 100% { transform: translateY(0px); }
					50% { transform: translateY(-10px); }
				}
			`}</style>
			<div
				className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300"
				onClick={onClose}
				style={{ opacity: modalVisible ? 1 : 0 }}
			>
				<div
					className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-gray-100 dark:border-gray-800 midnight:border-gray-800 overflow-hidden"
					onClick={(e) => e.stopPropagation()}
					style={{
						opacity: modalVisible ? 1 : 0,
						transform: modalVisible ? "scale(1) translateY(0)" : "scale(0.94) translateY(20px)",
						transition: "opacity 0.35s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
					}}
				>
					{/* Slide content */}
					<div className="p-8 min-h-[380px] flex flex-col">
						{/* Header */}
						<div
							className="text-center mb-8"
							style={{
								opacity: contentVisible ? 1 : 0,
								transform: contentVisible ? "translateY(0)" : `translateY(${slideDirection * -8}px)`,
								transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
							}}
						>
							<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-1">
								{slides[currentSlide].title}
							</h2>
							<p className="text-sm text-gray-400 dark:text-gray-500 midnight:text-gray-500">
								{slides[currentSlide].subtitle}
							</p>
						</div>

						{/* Content — slides in from direction of navigation */}
						<div
							className="flex-1 flex items-center justify-center"
							style={{
								opacity: contentVisible ? 1 : 0,
								transform: contentVisible ? "translateX(0)" : `translateX(${slideDirection * 28}px)`,
								transition: "opacity 0.35s ease, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
							}}
						>
							{slides[currentSlide].content}
						</div>
					</div>

					{/* Footer */}
					<div className="px-8 pb-8">
						{/* Progress dots — active dot uses slide accent color */}
						<div className="flex items-center justify-center gap-2 mb-6">
							{slides.map((_, i) => (
								<button
									key={i}
									onClick={() => goToSlide(i)}
									className={`h-1.5 rounded-full transition-all duration-300 ${i === currentSlide
											? "w-6 bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100"
											: "w-1.5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
										}`}
									aria-label={`Go to slide ${i + 1}`}
								/>
							))}
						</div>

						{/* Navigation buttons */}
						<div className="flex items-center justify-between">
							<button
								onClick={prevSlide}
								className={`px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${currentSlide === 0
										? "text-transparent cursor-default"
										: "text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800"
									}`}
								disabled={currentSlide === 0}
							>
								Back
							</button>
							<button
								onClick={nextSlide}
								className="px-6 py-2.5 bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100 text-white dark:text-gray-900 midnight:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 midnight:hover:bg-gray-200 transition-all duration-200 hover:shadow-md active:scale-[0.97]"
							>
								{currentSlide === slides.length - 1 ? "Get Started" : "Continue"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</>
	);
});

WelcomeModal.displayName = "WelcomeModal";

// Main Sidebar Component — single column, Claude-desktop style
const DynamicSidebar = ({
	isSidebarCollapsed,
	setIsSidebarCollapsed,
	currentPage,
	isChatMode,
	onPageChange,
	session,
	onSignOut,
	onProjectSelect,
	onRefreshProjects,
	onNewChat,
	basePage,
	pathSegments,
	className = "",
}) => {
	const navigate = useNavigate();
	const [isMobile, setIsMobile] = useState(false);
	const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
	const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
	const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [showProfileDropdown, setShowProfileDropdown] = useState(false);

	const {
		currentWorkspace,
		workspaces,
		switchWorkspace,
		refreshWorkspaces,
		hasWorkspaceAccess,
	} = useWorkspace();

	const userRole = currentWorkspace?.user_role || "viewer";
	const permissions = usePermissions(userRole);

	const ownedWorkspaces = workspaces?.filter(w =>
		w.user_role === 'owner' || (w.owner_id && w.owner_id === session?.user?.id)
	) || [];
	const hasReachedWorkspaceLimit = ownedWorkspaces.length >= 1;

	const currentProjectId = ((basePage === 'projects' || basePage === 'workspace') && pathSegments?.[1])
		? pathSegments[1]
		: null;


	// Active mode derived from URL
	const getMode = (bp) => {
		if (bp === 'projects' || bp === 'workspace' || bp === 'calendar') return 'workspace';
		if (bp === 'agents') return 'agents';
		return 'chat';
	};
	const [activeMode, setActiveMode] = useState(() => getMode(basePage));

	const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);

	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 768);
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	// Sync active mode when URL changes
	useEffect(() => {
		setActiveMode(getMode(basePage));
	}, [basePage]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "k") {
				e.preventDefault();
				setIsSearchOpen(true);
			} else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
				e.preventDefault();
				onPageChange("settings");
			} else if ((e.ctrlKey || e.metaKey) && e.key === "n") {
				e.preventDefault();
				handleNewChat();
			} else if ((e.ctrlKey || e.metaKey) && e.key === "/") {
				e.preventDefault();
				setIsSidebarCollapsed(!isSidebarCollapsed);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isSidebarCollapsed, setIsSidebarCollapsed, onPageChange]);

	const handleNewChat = useCallback(() => {
		setActiveMode('chat');
		onNewChat();
	}, [onNewChat]);

	return (
		<>
			{/* Sidebar */}
			<aside
				className={`h-full flex-shrink-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-r border-gray-200/70 dark:border-gray-800 midnight:border-gray-800 transition-all duration-500 ${isSidebarCollapsed ? 'w-0 overflow-hidden border-transparent' : 'w-[240px] overflow-visible relative z-20'} ${className}`}
				style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
			>
				{/* Fixed-width inner so content never reflows during animation */}
				<div 
					className={`w-[240px] h-full flex flex-col transition-all duration-500 ${isSidebarCollapsed ? 'opacity-0 -translate-x-10 pointer-events-none' : 'opacity-100 translate-x-0'}`}
					style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
				>

					{/* Mode tab strip */}
					<div className="flex-shrink-0 flex items-center gap-0.5 px-1.5 pt-2 pb-1.5 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800">
						{/* Collapse toggle */}
						<button
							onClick={() => setIsSidebarCollapsed(true)}
							title="Collapse sidebar (⌘/)"
							className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-all duration-150 flex-shrink-0"
						>
							<PanelLeft className="w-4 h-4" />
						</button>
						{/* Mode tabs */}
						{[
							{ mode: 'chat', Icon: ChatIcon, label: 'Chat', path: '/home' },
							{ mode: 'workspace', Icon: Compass, label: 'Workspace', path: '/workspace' },
							{ mode: 'agents', Icon: Bot, label: 'Agents', path: '/agents' },
						].map(({ mode, Icon, label, path }) => (
							<button
								key={mode}
								onClick={() => { setActiveMode(mode); navigate(path); }}
								title={label}
								className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all duration-150 ${activeMode === mode
										? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-100'
										: 'text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60 midnight:hover:bg-gray-800/60 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300'
									}`}
							>
								<Icon className="w-4 h-4" />
								<span className="text-[9px] font-medium leading-none">{label}</span>
							</button>
						))}
					</div>

					{/* Model picker — persistent, accessible from all modes */}
					<ModelSection />

					{/* Hardware widget — only shown when using a local/custom AI provider */}
					<HardwareWidget />

					{/* Scrollable content area */}
					<div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">

						{/* Chat mode */}
						<div className={`${activeMode !== 'chat' ? 'hidden' : ''}`}>
							{hasWorkspaceAccess() ? (
								<>
									<div className="px-2 pt-2 pb-1 space-y-0.5">
										<button
											onClick={handleNewChat}
											className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left group"
										>
											<Plus className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
											New Chat
											<span className="ml-auto font-mono text-[10px] text-gray-300 dark:text-gray-600">⌘N</span>
										</button>
										<button
											onClick={() => setIsSearchOpen(true)}
											className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left"
										>
											<Search className="w-3.5 h-3.5" />
											Search
											<span className="ml-auto font-mono text-[10px] text-gray-300 dark:text-gray-600">⌘K</span>
										</button>
										<button
											onClick={() => onPageChange('all-chats')}
											className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors text-left ${currentPage === 'all-chats'
													? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
													: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
												}`}
										>
											<div className="flex items-center gap-2.5">
												<MessageSquare className="w-3.5 h-3.5" />
												Chats
											</div>
										</button>
										<button
											onClick={() => navigate('/packs')}
											className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors text-left ${basePage === 'packs'
													? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
													: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
												}`}
										>
											<div className="flex items-center gap-2.5">
												<Library className="w-3.5 h-3.5" />
												Packs
											</div>
										</button>
										<button
											onClick={() => navigate('/lab')}
											className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors text-left ${basePage === 'lab'
													? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
													: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
												}`}
										>
											<div className="flex items-center gap-2.5">
												<FlaskConical className="w-3.5 h-3.5" />
												Labs
											</div>
										</button>
										<button
											onClick={() => navigate('/models')}
											className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors text-left ${basePage === 'models'
													? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
													: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
												}`}
										>
											<div className="flex items-center gap-2.5">
												<Cpu className="w-3.5 h-3.5" />
												Models
											</div>
										</button>
									</div>
									<div className="mx-3 h-px bg-gray-100 dark:bg-gray-800 mb-1" />
									<div className="px-1">
										<ChatExplorer isChatMode={isChatMode} isCollapsed={false} onNewChat={handleNewChat} showNewChatButton={false} />
									</div>
								</>
							) : (
								<p className="text-xs text-gray-400 dark:text-gray-500 text-center px-3 py-8">
									Chat is available to workspace members.
								</p>
							)}
						</div>

						{/* Workspace mode (Combined Projects & Calendar) */}
						<div className={`${activeMode !== 'workspace' ? 'hidden' : ''} flex flex-col h-full`}>
							{/* Expandable Calendar Section */}
							<div className="px-2 pt-2">
								<button
									onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
									className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium"
								>
									<div className="flex items-center gap-2.5 text-gray-600 dark:text-gray-300">
										<CalendarIcon className="w-3.5 h-3.5" />
										Calendar
									</div>
									<ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCalendarExpanded ? 'rotate-90' : ''}`} />
								</button>

								{isCalendarExpanded && (
									<div className="mt-1 px-1 pb-2 border-b border-gray-100 dark:border-gray-800">
										{hasWorkspaceAccess() ? (
											<CalendarContent
												onCreateEvent={() => navigate('/calendar')}
												onNavigateToCalendar={() => navigate('/calendar')}
											/>
										) : (
											<p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
												Calendar is available to workspace members.
											</p>
										)}
									</div>
								)}
							</div>

							{/* Projects Section */}
							<div className="flex-1 overflow-y-auto">
								<div className="px-2 pt-2 pb-1 space-y-0.5">
									{permissions?.canCreateProject && (
										<button
											onClick={() => setIsCreateProjectModalOpen(true)}
											className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left group"
										>
											<Plus className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
											New Project
										</button>
									)}
									<button
										onClick={() => navigate('/workspace')}
										className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors text-left ${(basePage === 'workspace' || basePage === 'projects') && !pathSegments?.[1]
												? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-100'
												: 'text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200'
											}`}
									>
										<FolderOpen className="w-3.5 h-3.5" />
										All Projects
									</button>
								</div>
								<div className="mx-3 h-px bg-gray-100 dark:bg-gray-800 mb-1" />
								<div className="px-1 pb-4">
									<ProjectExplorer
										isCollapsed={false}
										onCreateProject={permissions?.canCreateProject ? () => setIsCreateProjectModalOpen(true) : null}
										currentProjectId={currentProjectId}
										currentTab={pathSegments?.[2] || 'kanban'}
										session={session}
									/>
								</div>
							</div>
						</div>

						{/* Agents mode */}
						<div className={`${activeMode !== 'agents' ? 'hidden' : ''}`}>
							<AgentsSidebarContent
								basePage={basePage}
								navigate={navigate}
								currentPage={currentPage}
							/>
						</div>

					</div>

					{/* Profile bar */}
					<div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 px-2 py-2 flex items-center gap-1.5">
						{/* Avatar + dropdown (UserProfile handles its own trigger + dropdown) */}
						<UserProfile
							session={session}
							onSignOut={onSignOut}
							onNavigate={onPageChange}
							onCreateWorkspace={() => setIsCreateWorkspaceModalOpen(true)}
							showProfileDropdown={showProfileDropdown}
							setShowProfileDropdown={setShowProfileDropdown}
							hasWorkspaceAccess={hasWorkspaceAccess}
							hasReachedWorkspaceLimit={hasReachedWorkspaceLimit}
							ownedWorkspaces={ownedWorkspaces}
							setIsWelcomeModalOpen={setIsWelcomeModalOpen}
						/>
						{/* Name + workspace */}
						<div className="flex-1 min-w-0 overflow-hidden">
							<div className="text-xs font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-200 truncate leading-snug">
								{session?.user?.name || session?.user?.email?.split('@')[0] || 'User'}
							</div>
							<div className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-gray-600 truncate leading-snug">
								{currentWorkspace?.name || 'No workspace'}
							</div>
						</div>
						{/* Settings */}
						<button
							onClick={() => onPageChange('settings')}
							className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 midnight:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-all duration-150"
							title="Settings"
						>
							<Settings className="w-4 h-4" />
						</button>
					</div>
				</div>
			</aside>

			{/* Mobile overlay */}
			{isMobile && !isSidebarCollapsed && (
				<div
					className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20"
					onClick={() => setIsSidebarCollapsed(true)}
				/>
			)}

			<CreateProjectFlow
				isOpen={isCreateProjectModalOpen}
				onClose={() => setIsCreateProjectModalOpen(false)}
				onProjectCreate={(newProject) => {
					setIsCreateProjectModalOpen(false);
					onProjectSelect(newProject);
					if (onRefreshProjects) onRefreshProjects();
				}}
				session={session}
			/>

			<WelcomeModal
				isOpen={isWelcomeModalOpen}
				onClose={() => setIsWelcomeModalOpen(false)}
			/>

			<UniversalSearch
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
				onNavigate={onPageChange}
			/>
		</>
	);
};

export default memo(DynamicSidebar);
