import { useMemo, useState } from "react";
import { useColumnContext } from "../context/ColumnContext";
import { useCardContext } from "../context/CardContext";
import AddCardModal from "../kanban/features/cards/AddCardModal";
import GalleryViewFilters from "./GalleryViewFilters";

// Helper: get due status
const getDueStatus = (dueDate) => {
	if (!dueDate) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const due = new Date(dueDate);
	due.setHours(0, 0, 0, 0);
	const diff = (due - today) / (1000 * 60 * 60 * 24);
	if (diff < 0)
		return {
			label: "Overdue",
			color: "bg-red-100 dark:bg-red-900/30 midnight:bg-red-900/30 text-red-600 dark:text-red-400 midnight:text-red-400",
		};
	if (diff === 0)
		return {
			label: "Today",
			color: "bg-amber-100 dark:bg-amber-900/30 midnight:bg-amber-900/30 text-amber-700 dark:text-amber-400 midnight:text-amber-400",
		};
	if (diff <= 3)
		return {
			label: "Soon",
			color: "bg-yellow-100 dark:bg-yellow-900/30 midnight:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 midnight:text-yellow-400",
		};
	return {
		label: "Upcoming",
		color: "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-300 midnight:text-gray-300",
	};
};

// Helper: get priority color
const getPriorityColor = (priority) => {
	switch (priority) {
		case "High":
			return "bg-red-500 dark:bg-red-600 midnight:bg-red-600 text-white";
		case "Medium":
			return "bg-amber-500 dark:bg-amber-600 midnight:bg-amber-600 text-white";
		case "Low":
			return "bg-gray-400 dark:bg-gray-500 midnight:bg-gray-500 text-white";
		default:
			return "bg-gray-200 dark:bg-gray-600 midnight:bg-gray-600 text-gray-500 dark:text-gray-300 midnight:text-gray-300";
	}
};

const GalleryView = ({ selectedProject }) => {
	const { columns, error } = useColumnContext();
	const { setSelectedCard } = useCardContext();

	const cards = columns.flatMap((col) => col.Cards || []);

	const [showCreateTask, setShowCreateTask] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [filterConfig, setFilterConfig] = useState({
		priority: [],
		dueStatus: [],
		completed: false,
	});

	const filteredCards = useMemo(() => {
		let result = [...cards];

		// Search
		if (searchTerm) {
			const s = searchTerm.toLowerCase();
			result = result.filter(
				(card) =>
					card.title?.toLowerCase().includes(s) ||
					card.description?.toLowerCase().includes(s)
			);
		}

		// Completed
		if (filterConfig.completed) {
			result = result.filter(
				(card) => card.progress === 100 || card.isCompletionColumn
			);
		}

		// Priority
		if (filterConfig.priority.length > 0) {
			result = result.filter((card) =>
				filterConfig.priority.includes(card.priority)
			);
		}

		// Due status
		if (filterConfig.dueStatus.length > 0) {
			result = result.filter((card) => {
				const k = dueStatusKey(card.dueDate);
				return k ? filterConfig.dueStatus.includes(k) : false;
			});
		}

		return result;
	}, [cards, searchTerm, filterConfig]);

	const toggleCompletedFilter = () => {
		setFilterConfig((prev) => ({ ...prev, completed: !prev.completed }));
	};

	const togglePriorityFilter = (priority) => {
		setFilterConfig((prev) => ({
			...prev,
			priority: prev.priority.includes(priority)
				? prev.priority.filter((p) => p !== priority)
				: [...prev.priority, priority],
		}));
	};

	const toggleDueStatusFilter = (key) => {
		setFilterConfig((prev) => ({
			...prev,
			dueStatus: prev.dueStatus.includes(key)
				? prev.dueStatus.filter((k) => k !== key)
				: [...prev.dueStatus, key],
		}));
	};

	const clearFilters = () => {
		setFilterConfig({
			priority: [],
			dueStatus: [],
			completed: false,
		});
	};

	const dueStatusKey = (dueDate) => {
		if (!dueDate) return null;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const due = new Date(dueDate);
		due.setHours(0, 0, 0, 0);
		if (due < today) return "overdue";
		if (due.getTime() === today.getTime()) return "today";
		const nextWeek = new Date(today);
		nextWeek.setDate(today.getDate() + 7);
		if (due > today && due <= nextWeek) return "thisWeek";
		return null;
	};

	if (error) {
		return (
			<div className="p-6 bg-white dark:bg-gray-900 midnight:bg-gray-950 min-h-screen flex items-center justify-center">
				<div className="text-center">
					<div className="text-red-500 dark:text-red-400 midnight:text-red-400 text-6xl mb-4">
						⚠️
					</div>
					<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-2">
						Error loading gallery
					</h3>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">
						{error}
					</p>
				</div>
			</div>
		);
	}
	if (!selectedProject?.id) {
		return (
			<div className="p-6 bg-white dark:bg-gray-900 midnight:bg-gray-950 min-h-screen flex items-center justify-center">
				<div className="text-center">
					<div className="text-gray-400 dark:text-gray-500 midnight:text-gray-500 text-6xl mb-4">
						📁
					</div>
					<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-2">
						No Project Selected
					</h3>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">
						Select a project to view its gallery.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 min-h-screen flex flex-col">
			{/* Filters header */}
			<GalleryViewFilters
				searchTerm={searchTerm}
				setSearchTerm={setSearchTerm}
				filterConfig={filterConfig}
				toggleCompletedFilter={toggleCompletedFilter}
				togglePriorityFilter={togglePriorityFilter}
				toggleDueStatusFilter={toggleDueStatusFilter}
				onClearFilters={clearFilters}
				onCreateTask={() => setShowCreateTask(true)}
				searchContext={{
					isSearchActive: !!searchTerm,
					totalResults: searchTerm ? filteredCards.length : 0,
				}}
			/>

			<div className="p-6">
				{cards.length === 0 ? (
					<div className="flex flex-1 min-h-[60vh] items-center justify-center">
						<div className="flex flex-col items-center text-center">
							<h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200 mb-2">
								No tasks to display
							</h3>
							<p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-4">
								There are no tasks in this project yet. Start by
								creating a new task!
							</p>
							<button
								type="button"
								className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 midnight:bg-blue-500 midnight:hover:bg-blue-600 text-white rounded-lg font-medium text-sm shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
								onClick={() => setShowCreateTask(true)}
							>
								+ Create Task
							</button>
						</div>
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
						{filteredCards.map((card) => {
							const due = getDueStatus(card.dueDate);
							const priorityColor = getPriorityColor(
								card.priority
							);
							const progress = card.progress || 0;
							return (
								<div
									key={card.id}
									className="bg-white dark:bg-gray-800 midnight:bg-slate-900 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col border border-gray-200 dark:border-gray-700 midnight:border-gray-800"
									onClick={() => setSelectedCard(card)}
								>
									<div className="p-4 flex-1 flex flex-col">
										<div className="flex items-center justify-between mb-2">
											<span
												className={`px-2 py-0.5 rounded text-xs font-semibold ${priorityColor}`}
											>
												{card.priority || "No Priority"}
											</span>
											{due && (
												<span
													className={`px-2 py-0.5 rounded text-xs font-medium ml-2 ${due.color}`}
												>
													{due.label}
												</span>
											)}
										</div>
										<h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
											{card.title}
										</h3>
										<p className="text-gray-600 dark:text-gray-300 midnight:text-gray-300 mb-3 line-clamp-3">
											{card.description}
										</p>
										<div className="flex-1" />
										<div className="mb-2">
											<div className="w-full h-2 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full">
												<div
													className="h-full bg-indigo-500 rounded-full transition-all duration-300"
													style={{
														width: `${progress}%`,
													}}
												/>
											</div>
											<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-1">
												{progress}% complete
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}

				{showCreateTask && (
					<AddCardModal
						onClose={() => setShowCreateTask(false)}
						onSuccess={() => setShowCreateTask(false)}
					/>
				)}
			</div>
		</div>
	);
};

export default GalleryView;
