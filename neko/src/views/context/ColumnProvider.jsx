import { useState, useEffect, useCallback } from "react";
import ColumnContext from "./ColumnContext";
import { FolderGit2 } from "lucide-react";
import viewsApi from "../viewsApi";

// Import view-specific skeletons
import ListViewSkeleton from "../list/ListViewSkeleton";
import GanttViewSkeleton from "../gantt/GanttViewSkeleton";
import { NetworkViewSkeleton } from "../network/NetworkView";

const KanbanSkeleton = () => {
	// Create skeleton columns
	const skeletonColumns = Array(4).fill(0);

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200">
			{/* Header skeleton */}
			<div className="h-16 p-4 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 flex items-center justify-between">
				<div className="w-48 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
				<div className="flex space-x-2">
					<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
					<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
					<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse"></div>
				</div>
			</div>

			{/* Kanban board skeleton */}
			<div className="flex-1 overflow-x-auto p-6">
				<div className="flex space-x-4">
					{skeletonColumns.map((_, index) => (
						<div
							key={index}
							className="flex-shrink-0 w-72 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-3 animate-pulse"
							style={{
								animationDelay: `${index * 100}ms`,
							}}
						>
							{/* Column header */}
							<div className="flex items-center justify-between mb-3">
								<div className="w-32 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
								<div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
							</div>

							{/* Card skeletons */}
							{Array(Math.floor(Math.random() * 4) + 2)
								.fill(0)
								.map((_, cardIndex) => (
									<div
										key={cardIndex}
										className="bg-white dark:bg-gray-700 midnight:bg-gray-900 rounded-lg p-3 shadow-sm dark:shadow-gray-900/10 midnight:shadow-black/10 mb-2"
									>
										{/* Card title */}
										<div className="w-full h-5 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded mb-2"></div>

										{/* Card description */}
										<div className="w-3/4 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800 rounded mb-1"></div>
										<div className="w-1/2 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800 rounded mb-3"></div>

										{/* Card footer */}
										<div className="flex justify-between items-center">
											<div className="flex space-x-1">
												{Array(
													Math.floor(
														Math.random() * 3
													) + 1
												)
													.fill(0)
													.map((_, avatarIndex) => (
														<div
															key={avatarIndex}
															className="w-6 h-6 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded-full"
														></div>
													))}
											</div>

											<div className="w-16 h-5 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded"></div>
										</div>
									</div>
								))}

							{/* Add card button */}
							<div className="h-8 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded-md w-full mt-2"></div>
						</div>
					))}

					{/* Add column button */}
					<div className="flex-shrink-0 w-72 h-12 border-2 border-dashed border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg animate-pulse"></div>
				</div>
			</div>
		</div>
	);
};

export const BoardSkeleton = () => {
	// Create skeleton columns
	const skeletonColumns = Array(4).fill(0);

	return (
		<div className="flex-1 overflow-x-auto p-6">
			<div className="flex space-x-4">
				{skeletonColumns.map((_, index) => (
					<div
						key={index}
						className="flex-shrink-0 w-72 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-3 animate-pulse"
						style={{
							animationDelay: `${index * 100}ms`,
						}}
					>
						{/* Column header */}
						<div className="flex items-center justify-between mb-3">
							<div className="w-32 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
							<div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
						</div>

						{/* Card skeletons */}
						{Array(Math.floor(Math.random() * 4) + 2)
							.fill(0)
							.map((_, cardIndex) => (
								<div
									key={cardIndex}
									className="bg-white dark:bg-gray-700 midnight:bg-gray-900 rounded-lg p-3 shadow-sm dark:shadow-gray-900/10 midnight:shadow-black/10 mb-2"
								>
									{/* Card title */}
									<div className="w-full h-5 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded mb-2"></div>

									{/* Card description */}
									<div className="w-3/4 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800 rounded mb-1"></div>
									<div className="w-1/2 h-3 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800 rounded mb-3"></div>

									{/* Card footer */}
									<div className="flex justify-between items-center">
										<div className="flex space-x-1">
											{Array(
												Math.floor(Math.random() * 3) +
													1
											)
												.fill(0)
												.map((_, avatarIndex) => (
													<div
														key={avatarIndex}
														className="w-6 h-6 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded-full"
													></div>
												))}
										</div>

										<div className="w-16 h-5 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded"></div>
									</div>
								</div>
							))}

						{/* Add card button */}
						<div className="h-8 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 rounded-md w-full mt-2"></div>
					</div>
				))}

				{/* Add column button */}
				<div className="flex-shrink-0 w-72 h-12 border-2 border-dashed border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg animate-pulse"></div>
			</div>
		</div>
	);
};

export const ColumnProvider = ({
	children,
	session,
	selectedProject,
	viewType = "kanban",
}) => {
	const [columns, setColumns] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	// Extract stable values to avoid unnecessary re-renders
	const hasSession = Boolean(session?.user?.id);
	const projectId = selectedProject?.id;

	// Memoize loadColumns to avoid dependency issues
	const loadColumns = useCallback(async () => {
		if (!hasSession) {
			setError("User session not found");
			setIsLoading(false);
			return;
		}

		if (!projectId) {
			setError("Please select a project to view its Kanban board");
			setIsLoading(false);
			return;
		}

		try {
			setIsLoading(true);
			const data = await viewsApi.column.loadColumns(projectId, null);

			// Process columns and sort cards
			const processedData = data.map((column) => ({
				...column,
				Cards: Array.isArray(column.Cards)
					? column.Cards.sort((a, b) => a.order - b.order)
					: [],
			}));

			setColumns(processedData);
			setError(null);
		} catch (err) {
			console.error("Error loading columns:", err);
			setError(err.message);
		} finally {
			setIsLoading(false);
		}
	}, [hasSession, projectId]);

	useEffect(() => {
		loadColumns();
	}, [loadColumns]);

	const value = {
		columns,
		setColumns,
		isLoading,
		error,
		loadColumns,
		selectedProject,
	};

	// Function to get appropriate skeleton based on view type
	const getSkeletonForView = () => {
		switch (viewType) {
			case "list":
				return <ListViewSkeleton />;
			case "gantt":
				return <GanttViewSkeleton />;
			case "network":
				return <NetworkViewSkeleton />;
			case "kanban":
			default:
				return <KanbanSkeleton />;
		}
	};

	if (isLoading) {
		return getSkeletonForView();
	}

	if (!projectId) {
		return (
			<div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="max-w-md text-center px-4">
					<FolderGit2 className="w-16 h-16 mx-auto mb-6 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
					<h2 className="text-2xl font-semibold mb-3 text-gray-800 dark:text-white midnight:text-indigo-200">
						Select a Project
					</h2>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
						Please select a project from the sidebar to view its
						Kanban board. Each project has its own set of columns
						and cards.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="max-w-md text-center px-4">
					<div className="text-xl font-semibold text-red-500 dark:text-red-400 midnight:text-red-300 mb-2">
						Oops! Something went wrong
					</div>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
						{error}
					</p>
				</div>
			</div>
		);
	}

	return (
		<ColumnContext.Provider value={value}>
			{children}
		</ColumnContext.Provider>
	);
};

export default ColumnProvider;
