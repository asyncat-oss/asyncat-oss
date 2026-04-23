import React, { useState, useEffect, useCallback } from "react";
import {
	KanbanSquare,
	List,
	Clock,
	GanttChartSquare,
	FileText,
	Link2,
	LayoutGrid,
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

import { projectViewsApi } from "./projectApi";

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
	onUpdate,
	onDelete,
	session,
}) => {
	const [projectInfo, setProjectInfo] = useState(null);
	const [loading, setLoading] = useState(true);
	const [projectMembers, setProjectMembers] = useState([]);
	const [loadingMembers, setLoadingMembers] = useState(false);

	// Master loading state - true when any essential data is loading
	const [masterLoading, setMasterLoading] = useState(true);

	// Calculate skeleton state
	const shouldShowSkeleton = masterLoading || !selectedProject || (projectId && String(selectedProject.id) !== String(projectId));

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

	const { getWorkspaceProjects } = useWorkspace();

	useEffect(() => {
		const loadProjectData = async () => {
			if (selectedProject?.id) {
				// Reset states immediately when project changes
				setMasterLoading(true);
				setLoading(true);
				setLoadingMembers(true);

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
					} catch {
						// Don't log to console in production flow; just continue with defaults
					}
				}

				setProjectInfo(projectData);
				setLoading(false);

				// Load all essential data in parallel
				try {
					await Promise.all([
						fetchProjectMembers()
					]);
} catch {
					// Surface friendly error state without console logs
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
				} catch {
					// Don't log to console in production flow; just continue with defaults
				}
				setProjectInfo(updatedProject);
			} else {
				console.warn(
					"Project not found in workspace projects, keeping current data"
				);
				setProjectInfo({ ...selectedProject });
			}
		} catch {
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


	const fetchProjectMembers = async () => {
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
