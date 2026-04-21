import React, { useState, useEffect, useCallback } from "react";
import {
	Info,
	KanbanSquare,
	List,
	Clock,
	GanttChartSquare,
	FileText,
	Link2,
	LayoutGrid,
	CheckCircle,
	Users,
	TrendingUp,
	Target,
} from "lucide-react";

// Import view components directly here
import KanIndex from "../views/kanban/KanIndex";
import ListView from "../views/list/ListView";
import TimelineView from "../views/timeline/TimelineView";
import GanttView from "../views/gantt/GanttView";
import NetworkView from "../views/network/NetworkView";
import GalleryView from "../views/gallery/GalleryView";
import NotesIndex from "../notes/NotesIndex";
import HabitsIndex from "../habits/HabitsIndex";

// Import context providers
import { ColumnProvider } from "../views/context/ColumnProvider";
import { CardProvider } from "../views/context/CardProvider";

import ProjectSettingsModal from "./components/ProjectSettingsModal";
import { useUser } from "../contexts/UserContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { usePermissions, getRoleInfo } from "../utils/permissions";

// Import default profile pictures
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

import {
	DeadlinesWidget,
	ProjectDetailsWidget,
} from "./widgets";
import { projectMembersApi, projectApi, projectViewsApi } from "./projectApi";

// Create a mapping object for easier lookup
const profilePictureMapping = {
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

const soraFontBase = "font-sora";

// Comprehensive skeleton component for the project overview
const ProjectOverviewSkeleton = () => (
	<div className={`flex h-full ${soraFontBase} relative bg-white dark:bg-gray-900 midnight:bg-gray-950`}>
		<div className="flex-1 flex flex-col overflow-hidden animate-pulse">
			{/* Header skeleton */}
			<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-4">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center space-x-4">
						<div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
						<div>
							<div className="w-48 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-2"></div>
							<div className="w-32 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
						</div>
					</div>
					<div className="flex items-center space-x-3">
						{/* Member avatars skeleton */}
						<div className="flex -space-x-2">
							{[...Array(3)].map((_, i) => (
								<div key={i} className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full border-2 border-white"></div>
							))}
						</div>
						<div className="w-20 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
						<div className="w-24 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
					</div>
				</div>

				{/* Tab navigation skeleton */}
				<div className="border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
					<div className="flex space-x-8">
						{[...Array(6)].map((_, i) => (
							<div key={i} className="w-16 h-10 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-t"></div>
						))}
					</div>
				</div>
			</div>

			{/* Content skeleton */}
			<div className="flex-1 p-6">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
					{/* Main content area */}
					<div className="lg:col-span-2 space-y-6">
						{/* Dashboard widgets skeleton */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{[...Array(4)].map((_, i) => (
								<div key={i} className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-6">
									<div className="w-24 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-3"></div>
									<div className="w-16 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
								</div>
							))}
						</div>

						{/* Main view content skeleton */}
						<div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-6 h-96">
							<div className="w-32 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-4"></div>
							<div className="space-y-3">
								{[...Array(8)].map((_, i) => (
									<div key={i} className="flex items-center space-x-3">
										<div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
										<div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
										<div className="w-16 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* Sidebar skeleton */}
					<div className="space-y-6">
						{/* Project details widget */}
						<div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-4">
							<div className="w-20 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-4"></div>
							<div className="space-y-3">
								{[...Array(4)].map((_, i) => (
									<div key={i} className="flex justify-between">
										<div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
										<div className="w-12 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
									</div>
								))}
							</div>
						</div>

						{/* Deadlines widget */}
						<div className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-4">
							<div className="w-16 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-4"></div>
							<div className="space-y-2">
								{[...Array(3)].map((_, i) => (
									<div key={i} className="flex items-center space-x-3">
										<div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
										<div className="flex-1">
											<div className="w-full h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded mb-1"></div>
											<div className="w-20 h-2 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
);

const ProjectOverview = React.memo(({
	selectedProject,
	projectId,
	currentTab,
	onTabChange,
	onUpdate,
	onDelete,
	onSwitchProject,
	session,
}) => {
	const [projectInfo, setProjectInfo] = useState(null);
	const [pendingDelete, setPendingDelete] = useState(false);
	const [loading, setLoading] = useState(true);
	const [projectMembers, setProjectMembers] = useState([]);
	const [loadingMembers, setLoadingMembers] = useState(false);
	const [loadingEnrichedData, setLoadingEnrichedData] = useState(false);

	// Master loading state - true when any essential data is loading
	const [masterLoading, setMasterLoading] = useState(true);

	const isPresenceActive = !!selectedProject?.id;

	// Calculate skeleton state
	const shouldShowSkeleton = masterLoading || !selectedProject || (projectId && String(selectedProject.id) !== String(projectId));

	const currentUserInfo = session?.user
		? {
				userId: session.user.id,
				user_id: session.user.id,
				name:
					session.user.name ||
					session.user.email?.split("@")[0] ||
					"Unknown User",
				email: session.user.email,
				profile_picture: session.user.profile_picture,
		  }
		: null;
	

	const { getUserRole } = useUser();
	const getCurrentUserRole = () => {
		if (
			selectedProject?.owner_id === session?.user?.id ||
			projectInfo?.owner_id === session?.user?.id
		) {
			return "owner";
		}
		// Check user_role from selectedProject (important for newly created projects)
		if (selectedProject?.user_role) {
			return selectedProject.user_role;
		}
		// Check user_role from projectInfo
		if (projectInfo?.user_role) {
			return projectInfo.user_role;
		}
		const contextRole = getUserRole(selectedProject?.id);
		if (contextRole && contextRole !== "owner") {
			return contextRole;
		}
		if (session?.user?.id && projectMembers.length > 0) {
			const currentUserMember = projectMembers.find(
				(member) => member.id === session.user.id
			);
			if (currentUserMember) {
				return currentUserMember.role;
			}
		}
		return "viewer";
	};
	const userRole = getCurrentUserRole();
	const isViewer = userRole === "viewer";
	// Resolve permissions from role for conditional UI (e.g., show settings button)
	const permissions = usePermissions(userRole);

	const { getWorkspaceProjects, currentWorkspace } = useWorkspace();

	const getViewLabel = (viewKey) => {
		const labels = {
			kanban: "Kanban",
			list: "List",
			timeline: "Timeline",
			gantt: "Gantt",
			network: "Network",
			notes: "Notes",
			habits: "Habits",
			gallery: "Gallery",
		};
		return labels[viewKey] || viewKey;
	};
	const onlineUserIds = new Set();

	useEffect(() => {
		const loadProjectData = async () => {
			if (selectedProject?.id) {
				// Reset states immediately when project changes
				setMasterLoading(true);
				setLoading(true);
				setLoadingMembers(true);
				setLoadingEnrichedData(true);
				
				// CRITICAL: Preserve owner_id and user_role from selectedProject
				// These are set immediately after project creation and must not be lost
				let projectData = { 
					...selectedProject,
					// Explicitly preserve these critical fields
					owner_id: selectedProject.owner_id,
					user_role: selectedProject.user_role
				};

				if (!projectData.user_view_preferences && !projectData.user_visible_views) {
					try {
						const prefsResponse = await projectViewsApi.getUserViewPreferences(selectedProject.id);
						if (prefsResponse?.data?.view_preferences) {
							projectData.user_view_preferences = prefsResponse.data.view_preferences;
							projectData.user_visible_views = prefsResponse.data.view_preferences;
						}
					} catch (prefsError) {
						// Don't log to console in production flow; just continue with defaults
					}
				}

				setProjectInfo(projectData);
				setLoading(false);

				// Load all essential data in parallel
				try {
					await Promise.all([
						fetchProjectMembers(selectedProject.id)
					]);
				} catch (error) {
					// Surface friendly error state without console logs
					console.error('Failed to load project data:', error);
				} finally {
					// Clear loading immediately for faster experience
					setMasterLoading(false);
				}
			} else {
				// If no project, reset to loading state
				setMasterLoading(true);
			}
		};

		loadProjectData();
	}, [selectedProject?.id]);  // Only depend on selectedProject.id, not projectId prop

	// Track master loading state based on individual loading states
	useEffect(() => {
		if (loading || loadingMembers) {
			setMasterLoading(true);
		}
	}, [loading, loadingMembers]);

	const refreshProjectData = async () => {
		if (!selectedProject?.id) return;
		try {
			const projects = await getWorkspaceProjects();
			const updatedProject = projects.find(
				(p) => p.id === selectedProject.id
			);
			if (updatedProject) {
				// Always fetch fresh view preferences for the new project, don't carry over from previous project
				try {
					const prefsResponse = await projectViewsApi.getUserViewPreferences(selectedProject.id);
					if (prefsResponse?.data?.view_preferences) {
						updatedProject.user_view_preferences = prefsResponse.data.view_preferences;
						updatedProject.user_visible_views = prefsResponse.data.view_preferences;
					}
				} catch (prefsError) {
					// Don't log to console in production flow; just continue with defaults
				}
				setProjectInfo(updatedProject);
			} else {
				console.warn(
					"Project not found in workspace projects, keeping current data"
				);
				setProjectInfo({ ...selectedProject });
			}
		} catch (error) {
			// Avoid console logs; fallback to selectedProject
			setProjectInfo({ ...selectedProject });
		}
	};
	useEffect(() => {
		if (currentTab !== 'settings' && selectedProject?.id) {
			const timeoutId = setTimeout(() => {
				refreshProjectData();
			}, 100);
			return () => clearTimeout(timeoutId);
		}
	}, [currentTab, selectedProject?.id]);


	const fetchProjectMembers = async (_projectId) => {
		// Single-user mode: no project members to fetch — owner is always the only member.
		setProjectMembers([]);
		setLoadingMembers(false);
	};


	const handleSaveEdit = async (editedProject) => {
		// Check if this is a refresh request
		if (editedProject && editedProject._refreshRequired) {
			// Just refresh the project data without calling onUpdate
			await refreshProjectData();
			return true;
		}

		// For actual project updates (general settings like name, description, etc.)
		const updatedProject = await onUpdate(editedProject);
		if (updatedProject) {
			setProjectInfo(updatedProject);
			return updatedProject;
		}
		return null;
	};

	// Add a function to update local project preferences immediately
	const updateLocalProjectPreferences = useCallback(
		(preferences) => {
			if (projectInfo) {
				setProjectInfo((prev) => ({
					...prev,
					...preferences,
				}));
			}
		},
		[projectInfo]
	);

	const handleDeleteProject = async () => {
		await onDelete(projectInfo);
		setPendingDelete(false);
	};


	// Get available features for the project based on user's preferences and role
	const getProjectFeatures = () => {
		if (!projectInfo) return [];

		// Determine user's view preferences
		const userViewPreferences = projectInfo.user_view_preferences || projectInfo.user_visible_views;
		const hasUserPreferences = userViewPreferences !== undefined && userViewPreferences !== null;

		// If no user preferences are set, show all available views
		// If user preferences are set (even if empty), respect them
		const userVisibleViews = hasUserPreferences
			? userViewPreferences
			: (projectInfo.available_views || [
				"kanban", "list", "timeline",
				"gantt", "network", "gallery", "notes", "habits"
			]);


		const allFeatures = [
			// Work-focused sections
			{
				key: "kanban",
				label: "Kanban",
				icon: KanbanSquare,
				viewerAllowed: true,
				priority: 2,
			},
			{
				key: "list",
				label: "List",
				icon: List,
				viewerAllowed: true,
				priority: 3,
			},
			{
				key: "timeline",
				label: "Timeline",
				icon: Clock,
				viewerAllowed: true,
				priority: 4,
			},
			{
				key: "gantt",
				label: "Gantt",
				icon: GanttChartSquare,
				viewerAllowed: true,
				priority: 5,
			},
			{
				key: "network",
				label: "Network",
				icon: Link2,
				viewerAllowed: true,
				priority: 6,
			},
			{
				key: "gallery",
				label: "Gallery",
				icon: LayoutGrid,
				viewerAllowed: true,
				priority: 7,
			},
			{
				key: "notes",
				label: "Notes",
				icon: FileText,
				viewerAllowed: true,
				priority: 8,
			},
			{
				key: "habits",
				label: "Habits",
				icon: Target,
				viewerAllowed: true,
				priority: 9,
			},
		];

		// Filter based on enabled views and user visibility
		let filteredFeatures = allFeatures.filter((feature) =>
			userVisibleViews.includes(feature.key)
		);

		if (isViewer) {
			filteredFeatures = filteredFeatures.filter(
				(feature) => feature.viewerAllowed
			);
		}

		// Sort by priority to maintain the desired order
		return filteredFeatures.sort((a, b) => a.priority - b.priority);
	};

	const features = getProjectFeatures();

	const metrics = {
		tasksTotal: 0,
		tasksCompleted: 0,
		upcomingDeadlines: 0,
		teamSize: projectMembers.length,
		progressPercent: 0,
		totalChecklists: 0,
		completedChecklists: 0,
	};

	const deadlines = [];

	// Team member display (solo mode - no presence)
	const renderTeamMember = (member, index) => {
		const memberName =
			member.name || member.email?.split("@")[0] || "Unknown";
		const memberRole = member.role || "Member";

		const getProfilePicture = () => {
			const profilePicId = member.profile_picture;
			if (!profilePicId) return null;

			if (profilePicId.startsWith("https://")) {
				return profilePicId;
			}

			return profilePictureMapping[profilePicId] || null;
		};

		const profilePictureSrc = getProfilePicture();
		const hasProfilePicture = profilePictureSrc !== null;

		return (
			<div
				key={member.id || index}
				className="relative group"
				title={`${memberName} (${memberRole})`}
			>
				<div
					className={`w-8 h-8 rounded-full border-2 border-white/70 dark:border-gray-800/50 midnight:border-slate-800/50
          flex items-center justify-center text-xs font-medium
          transition-transform duration-200 hover:scale-110 hover:z-10 overflow-hidden cursor-pointer
          ${
				hasProfilePicture
					? "bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700"
					: "bg-gradient-to-br from-indigo-400 to-purple-500 text-white"
			}`}
				>
					{hasProfilePicture ? (
						<img
							src={profilePictureSrc}
							alt={memberName}
							className="w-full h-full object-cover"
							onError={(e) => {
								e.target.style.display = "none";
								e.target.nextSibling.style.display = "flex";
							}}
						/>
					) : null}
					<div
						className={`w-full h-full flex items-center justify-center text-white bg-gradient-to-br from-indigo-400 to-purple-500 ${
							hasProfilePicture ? "hidden" : ""
						}`}
					>
						{memberName.charAt(0).toUpperCase()}
					</div>
				</div>
			</div>
		);
	};

	// Enhanced team member display with online status and current view (dead code removed)
	const _renderOverviewContent_REMOVED = () => {
		return (
             <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
                 {(onlyOverview || hasNoViews) && (
                     <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                         <div className="rounded-xl p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                             <div className="text-sm text-yellow-800 dark:text-yellow-200">
                                 {hasNoViews
                                     ? "This project currently has no components enabled. To enable Kanban, List, Overview, and other components, update the project settings."
                                     : "This project currently only shows the Overview. To enable Kanban, List, and other components, update the project settings."
                                 }
                             </div>
                             <div className="flex-shrink-0">
                                 {permissions?.canEditProject ? (
                                     <button
                                         onClick={() => onTabChange('settings')}
                                         className="inline-flex items-center px-3 py-1.5 bg-yellow-600 text-white rounded-md text-sm hover:bg-yellow-700 transition-colors whitespace-nowrap"
                                     >
                                         Open Settings
                                     </button>
                                 ) : (
                                     <span className="text-sm text-yellow-700 dark:text-yellow-300 whitespace-nowrap">Ask an owner to enable components</span>
                                 )}
                             </div>
                         </div>
                     </div>
                 )}
				{/* Simple Header Section */}
				<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950">
					<div className="px-4 sm:px-6 py-6 sm:py-8">
						<div className="max-w-6xl mx-auto">
							<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white midnight:text-slate-100 mb-2">
								{projectData?.name}
							</h1>
							{projectData?.description && (
								<p className="text-gray-600 dark:text-gray-400 midnight:text-slate-400 text-base sm:text-lg max-w-3xl">
									{projectData.description}
								</p>
							)}
						</div>
					</div>
				</div>

				{/* Main Content Area */}
				<div className="px-4 sm:px-6 py-6 sm:py-8">
					<div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
						{/* Key Metrics Row */}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
							<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 midnight:border-slate-700">
								<div className="flex items-center justify-between mb-3">
									<div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/20 rounded-lg flex items-center justify-center">
										<CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400" />
									</div>
									<div className="text-right">
										<div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white midnight:text-slate-100">
											{metrics.tasksCompleted}
										</div>
										<div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
											of {metrics.tasksTotal}
										</div>
									</div>
								</div>
								<div className="space-y-2">
									<div className="flex justify-between text-xs sm:text-sm">
										<span className="text-gray-600 dark:text-gray-400 midnight:text-slate-400">
											Tasks Completed
										</span>
										<span className="font-medium text-emerald-600 dark:text-emerald-400">
											{metrics.progressPercent}%
										</span>
									</div>
									<div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-full h-2">
										<div
											className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
											style={{
												width: `${metrics.progressPercent}%`,
											}}
										/>
									</div>
								</div>
							</div>

							<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 midnight:border-slate-700">
								<div className="flex items-center justify-between mb-3">
									<div className="w-9 h-9 sm:w-10 sm:h-10 bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/20 rounded-lg flex items-center justify-center">
										<Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400" />
									</div>
									<div className="text-right">
										<div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white midnight:text-slate-100">
											{metrics.upcomingDeadlines}
										</div>
										<div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
											this week
										</div>
									</div>
								</div>
								<div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 midnight:text-slate-400">
									Upcoming Deadlines
								</div>
							</div>

							<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 midnight:border-slate-700">
								<div className="flex items-center justify-between mb-3">
									<div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 rounded-lg flex items-center justify-center">
										<Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
									</div>
									<div className="text-right">
										<div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white midnight:text-slate-100">
											{metrics.teamSize}
										</div>
										<div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
											members
										</div>
									</div>
								</div>
								<div className="flex -space-x-2">
									{projectMembers
										.slice(0, 4)
										.map((member, index) =>
											renderTeamMember(member, index)
										)}
									{projectMembers.length > 4 && (
										<div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400 border-2 border-white dark:border-gray-800 midnight:border-slate-900">
											+{projectMembers.length - 4}
										</div>
									)}
								</div>
							</div>
						</div>

						{/* Content Grid - Two Column Layout */}
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
							{/* Main Content - Left Side (2/3) */}
							<div className="lg:col-span-2 space-y-6">
								{/* Progress Overview */}
								<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl p-5 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 midnight:border-slate-700">
									<div className="flex items-center justify-between mb-5">
										<h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
											Progress Overview
										</h3>
										<TrendingUp className="w-5 h-5 text-gray-400" />
									</div>

									<div className="space-y-4">
										<div>
											<div className="flex items-center justify-between mb-2">
												<span className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
													Overall Progress
												</span>
												<span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
													{metrics.progressPercent}%
												</span>
											</div>
											<div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-full h-2.5">
												<div
													className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
													style={{
														width: `${metrics.progressPercent}%`,
													}}
												/>
											</div>
										</div>

										<div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
											<div className="text-center">
												<div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white midnight:text-slate-100">
													{metrics.tasksTotal}
												</div>
												<div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-1">
													Total Tasks
												</div>
											</div>
											<div className="text-center">
												<div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
													{metrics.tasksCompleted}
												</div>
												<div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-1">
													Completed
												</div>
											</div>
											<div className="text-center">
												<div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
													{metrics.tasksTotal - metrics.tasksCompleted}
												</div>
												<div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-1">
													Remaining
												</div>
											</div>
										</div>
									</div>
								</div>

								{/* Available Views */}
								<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl p-5 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 midnight:border-slate-700">
									<div className="flex items-center justify-between mb-4">
										<h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
											Available Views
										</h3>
										<LayoutGrid className="w-5 h-5 text-gray-400" />
									</div>
									<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
										{features.map((feature) => (
											<button
												key={feature.key}
												onClick={() =>
													onTabChange(feature.key)
												}
												className={`p-3 rounded-lg text-left transition-all duration-200 ${
													currentTab === feature.key
														? "bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 midnight:border-indigo-700"
														: "bg-gray-50 dark:bg-gray-700/30 midnight:bg-slate-800/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 midnight:hover:bg-slate-800/50"
												}`}
											>
												<div
													className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
														currentTab === feature.key
															? "bg-indigo-100 dark:bg-indigo-800/50 midnight:bg-indigo-800/30"
															: "bg-white dark:bg-gray-600 midnight:bg-slate-700"
													}`}
												>
													<feature.icon
														className={`w-4 h-4 ${
															currentTab === feature.key
																? "text-indigo-600 dark:text-indigo-400"
																: "text-gray-600 dark:text-gray-400 midnight:text-slate-400"
														}`}
													/>
												</div>
												<div
													className={`text-xs sm:text-sm font-medium ${
														currentTab === feature.key
															? "text-indigo-900 dark:text-indigo-100 midnight:text-indigo-100"
															: "text-gray-900 dark:text-white midnight:text-slate-100"
													}`}
												>
													{feature.label}
												</div>
											</button>
										))}
									</div>
								</div>
							</div>

							{/* Sidebar Widgets - Right Side (1/3) */}
							<div className="lg:col-span-1 space-y-6">
								{/* Project Details */}
								<ProjectDetailsWidget
									project={projectData}
									userRole={userRole}
									getRoleInfo={getRoleInfo}
									currentUserId={session?.user?.id}
								/>

								{/* Deadlines */}
								{deadlines && deadlines.length > 0 && (
									<DeadlinesWidget deadlines={deadlines} />
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	};

	// Enhanced team member display with online status and current view
	const renderViewContent = () => {
		// CRITICAL: Prefer selectedProject when it has fresh metadata (user_role, owner_id)
		// This prevents losing permission data during the initial load after project creation
		const projectData = (selectedProject?.user_role || selectedProject?.owner_id) 
			? selectedProject 
			: (projectInfo || selectedProject);

		switch (currentTab) {
			case "kanban":
				return (
					<ColumnProvider
						session={session}
						selectedProject={projectData}
						viewType="kanban"
					>
						<CardProvider session={session}>
							<KanIndex
								session={session}
								selectedProject={projectData}
							/>
						</CardProvider>
					</ColumnProvider>
				);

			case "list":
				return (
					<ColumnProvider
						session={session}
						selectedProject={projectData}
						viewType="list"
					>
						<CardProvider session={session}>
							<ListView
								session={session}
								selectedProject={projectData}
							/>
						</CardProvider>
					</ColumnProvider>
				);

			case "timeline":
				return (
					<ColumnProvider
						session={session}
						selectedProject={projectData}
						viewType="timeline"
					>
						<CardProvider session={session}>
							<TimelineView
								session={session}
								selectedProject={projectData}
							/>
						</CardProvider>
					</ColumnProvider>
				);

			case "gantt":
				return (
					<ColumnProvider
						session={session}
						selectedProject={projectData}
						viewType="gantt"
					>
						<CardProvider session={session}>
							<GanttView
								session={session}
								selectedProject={projectData}
							/>
						</CardProvider>
					</ColumnProvider>
				);

			case "network":
				return (
					<ColumnProvider
						session={session}
						selectedProject={projectData}
						viewType="network"
					>
						<CardProvider session={session}>
							<NetworkView
								session={session}
								selectedProject={projectData}
							/>
						</CardProvider>
					</ColumnProvider>
				);

			case "gallery":
				return (
					<ColumnProvider
						session={session}
						selectedProject={projectData}
						viewType="gallery"
					>
						<CardProvider session={session}>
							<GalleryView
								session={session}
								selectedProject={projectData}
							/>
						</CardProvider>
					</ColumnProvider>
				);

			case "notes":
				return (
					<NotesIndex
						selectedProject={projectData}
						session={session}
					/>
				);

			case "habits":
				return (
					<HabitsIndex
						selectedProject={projectData}
						session={session}
						currentPage={currentTab}
					/>
				);

			case "settings":
				if (isViewer) {
					return (
						<div className="flex items-center justify-center h-full">
							<p className="text-sm text-gray-500 dark:text-gray-400">You don't have access to project settings.</p>
						</div>
					);
				}
				return (
					<ProjectSettingsModal
						isPage
						project={projectInfo}
						onClose={() => {}}
						onSave={handleSaveEdit}
						onDelete={handleDeleteProject}
						session={session}
						onLocalUpdate={updateLocalProjectPreferences}
						initialTab="general"
					/>
				);

			default:
				return <div>No content available</div>;
		}
	};

	// Check skeleton state first - if loading, show skeleton even without selectedProject
	if (shouldShowSkeleton) {
		return <ProjectOverviewSkeleton />;
	}

	// Only show empty state if not loading and truly no project selected
	if (!selectedProject) {
		return (
			<div
				className={`flex items-center justify-center h-full ${soraFontBase}`}
			>
				<div className="text-center p-8">
					<LayoutGrid className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 midnight:text-gray-700 mb-4" />
					<h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-2">
						No Project Selected
					</h2>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 max-w-md">
						Select a project from the sidebar to view and manage it.
					</p>
				</div>
			</div>
		);
	}


	if (loading && !projectInfo) {
		return (
			<div
				className={`h-full bg-gray-50/50 dark:bg-gray-900 midnight:bg-slate-950 overflow-auto w-full ${soraFontBase}`}
			>
				<div className="p-4 space-y-4">
					{/* Loading skeleton */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						{[...Array(4)].map((_, i) => (
							<div
								key={i}
								className="bg-white/70 dark:bg-gray-800/50 midnight:bg-slate-800/50 rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30"
							>
								<div className="flex items-center justify-between mb-3">
									<div className="w-5 h-5 bg-gray-300/60 dark:bg-gray-600/60 midnight:bg-slate-600/60 rounded animate-pulse" />
								</div>
								<div className="space-y-2">
									<div className="w-16 h-6 bg-gray-300/60 dark:bg-gray-600/60 midnight:bg-slate-600/60 rounded animate-pulse" />
									<div className="w-12 h-3 bg-gray-300/60 dark:bg-gray-600/60 midnight:bg-slate-600/60 rounded animate-pulse" />
									<div className="w-8 h-2 bg-gray-300/60 dark:bg-gray-600/60 midnight:bg-slate-600/60 rounded animate-pulse" />
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={`flex h-full ${soraFontBase} relative`}>
			<div className="flex-1 overflow-auto">
				{renderViewContent()}
			</div>
		</div>
	);
});

// Add display name for debugging
ProjectOverview.displayName = 'ProjectOverview';

export default ProjectOverview;
