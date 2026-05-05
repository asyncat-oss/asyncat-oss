import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
	ArrowLeft,
	LayoutGrid,
	KanbanSquare,
	List,
	Clock,
	GanttChartSquare,
	Link2,
	FileText,
} from "lucide-react";

// Import view components directly here
import KanIndex from "../views/kanban/KanIndex";
import ListView from "../views/list/ListView";
import TimelineView from "../views/timeline/TimelineView";
import GanttView from "../views/gantt/GanttView";
import NetworkView from "../views/network/NetworkView";
import NotesIndex from "../notes/NotesIndex";

// Import context providers
import { ColumnProvider } from "../views/context/ColumnProvider";
import { CardProvider } from "../views/context/CardProvider";


import { useWorkspace } from "../contexts/WorkspaceContext";

const soraFontBase = "font-sora";

const PROJECT_VIEWS = [
	{ key: 'kanban',   label: 'Kanban',   Icon: KanbanSquare },
	{ key: 'list',     label: 'List',     Icon: List },
	{ key: 'timeline', label: 'Timeline', Icon: Clock },
	{ key: 'gantt',    label: 'Gantt',    Icon: GanttChartSquare },
	{ key: 'network',  label: 'Network',  Icon: Link2 },
	{ key: 'notes',    label: 'Notes',    Icon: FileText },
];

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
	session,
}) => {
	const navigate = useNavigate();
	const [projectInfo, setProjectInfo] = useState(null);
	const [loading, setLoading] = useState(true);
	// Master loading state - true when any essential data is loading
	const [masterLoading, setMasterLoading] = useState(true);

	// Calculate skeleton state
	const shouldShowSkeleton = masterLoading || !selectedProject || (projectId && String(selectedProject.id) !== String(projectId));

	const { getWorkspaceProjects } = useWorkspace();

	useEffect(() => {
		const loadProjectData = async () => {
			if (selectedProject?.id) {
				// Reset states immediately when project changes
				setMasterLoading(true);
				setLoading(true);

				// CRITICAL: Preserve owner_id and user_role from selectedProject
				// These are set immediately after project creation and must not be lost
				let projectData = { 
					...selectedProject,
					owner_id: selectedProject.owner_id,
					user_role: selectedProject.user_role
				};

				setProjectInfo(projectData);
				setLoading(false);
				setMasterLoading(false);
			} else {
				// If no project, reset to loading state
				setMasterLoading(true);
			}
		};

		loadProjectData();
	}, [selectedProject?.id]);  // Only depend on selectedProject.id, not projectId prop

	const refreshProjectData = async () => {
		if (!selectedProject?.id) return;
		try {
			const projects = await getWorkspaceProjects();
			const updatedProject = projects.find(
				(p) => p.id === selectedProject.id
			);
			if (updatedProject) {
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


			case "notes":
				return (
					<NotesIndex
						selectedProject={projectData}
						session={session}
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
		<div className={`flex flex-col h-full ${soraFontBase} relative`}>
			{/* Section tab navigation */}
			<div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="flex items-center gap-0.5 px-4 overflow-x-auto scrollbar-none">
					<button
						onClick={() => navigate("/projects")}
						className="flex items-center gap-1.5 px-3 py-2.5 mr-2 text-sm font-medium border-b-2 border-transparent whitespace-nowrap text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white midnight:text-gray-300 midnight:hover:text-white transition-colors"
					>
						<ArrowLeft className="w-3.5 h-3.5" />
						Projects
					</button>
					{PROJECT_VIEWS.map(({ key, label, Icon }) => {
						const isActive = currentTab === key;
						return (
							<button
								key={key}
								onClick={() => navigate(`/workspace/${projectId}/${key}`)}
								className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
									isActive
										? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400'
										: 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200'
								}`}
							>
								<Icon className="w-3.5 h-3.5" />
								{label}
							</button>
						);
					})}
				</div>
			</div>
			<div className="flex-1 overflow-auto">
				{renderViewContent()}
			</div>
		</div>
	);
});

// Add display name for debugging
ProjectOverview.displayName = 'ProjectOverview';

export default ProjectOverview;
