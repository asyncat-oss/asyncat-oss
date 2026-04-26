import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 	ChevronLeft,
 	ChevronRight,
 	RefreshCw,
 	Filter,
 	CheckSquare,
 	AlertTriangle,
 	FolderOpen,
 	User,
 	Search,
 	CheckCircle,
 	Target,
} from "lucide-react";

const TopBar = ({
	view,
	onViewChange,
	currentDate,
	onDateChange,
	allProjects = [],
	projectFilter,
	setProjectFilter,
	cardFilters,
	updateCardFilter,
	isCalendarRefreshing,
}) => {
	const [showFilters, setShowFilters] = useState(false);
	const [showTaskFilters, setShowTaskFilters] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [lastSyncTime, setLastSyncTime] = useState(null);
	const filtersRef = useRef(null);
	const taskFiltersRef = useRef(null);

	// Network status tracking
	useEffect(() => {
		const handleOnline = () => { setIsOnline(true); setLastSyncTime(new Date()); };
		const handleOffline = () => setIsOnline(false);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	useEffect(() => {
		const handleSyncComplete = () => setLastSyncTime(new Date());
		window.addEventListener("calendarSyncComplete", handleSyncComplete);
		return () => window.removeEventListener("calendarSyncComplete", handleSyncComplete);
	}, []);

	const formatLastSyncTime = (time) => {
		if (!time) return "";
		const diff = Math.floor((new Date() - time) / 1000);
		if (diff < 60) return "Just now";
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return time.toLocaleDateString();
	};

	// Handle click outside to close dropdowns
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (filtersRef.current && !filtersRef.current.contains(event.target)) {
				setShowFilters(false);
			}
			if (taskFiltersRef.current && !taskFiltersRef.current.contains(event.target)) {
				setShowTaskFilters(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handlePrev = () => {
		const newDate = new Date(currentDate);
		if (view === "month") newDate.setMonth(newDate.getMonth() - 1);
		else if (view === "week") newDate.setDate(newDate.getDate() - 7);
		else if (view === "day") newDate.setDate(newDate.getDate() - 1);
		onDateChange(newDate);
	};

	const handleNext = () => {
		const newDate = new Date(currentDate);
		if (view === "month") newDate.setMonth(newDate.getMonth() + 1);
		else if (view === "week") newDate.setDate(newDate.getDate() + 7);
		else if (view === "day") newDate.setDate(newDate.getDate() + 1);
		onDateChange(newDate);
	};

	const handleToday = () => onDateChange(new Date());

	// Filter projects based on search
	const filteredProjects = allProjects.filter((project) =>
		project.name.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Get active filter count
	const getActiveFilterCount = () => {
		let count = 0;
		if (cardFilters.showCards && cardFilters.priority !== "all") count++;
		if (cardFilters.showCards && cardFilters.completed !== "all") count++;
		if (cardFilters.showCards && cardFilters.assignedToMe) count++;
		if (cardFilters.showCards && cardFilters.createdByMe) count++;
		return count;
	};

	const activeFilterCount = getActiveFilterCount();

	// Get project filter display name
	const getProjectFilterDisplayName = () => {
		if (!projectFilter) return "All Events";
		if (projectFilter === "personal") return "Personal Events";
		const project = allProjects.find((p) => p.id === projectFilter);
		return project ? project.name : "Unknown Project";
	};

	const handleProjectSelect = (projectId) => {
		setProjectFilter(projectId);
		setTimeout(() => setShowFilters(false), 150);
	};

	const clearAllFilters = () => {
		setProjectFilter(null);
		updateCardFilter("priority", "all");
		updateCardFilter("completed", "all");
		updateCardFilter("assignedToMe", false);
		updateCardFilter("createdByMe", false);
	};

	return (
		<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-900 px-6 py-3 flex items-center justify-between shadow-sm dark:shadow-gray-900/20 midnight:shadow-black/40 h-13.25 transition-all duration-300">
			<div className="flex items-center space-x-6">
				<div className="flex items-center space-x-3">
					<div className="flex items-center space-x-1 rounded-lg p-1 gap-2">
						<button
							onClick={handlePrev}
							aria-label="Previous"
							className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-lg transition-all duration-200"
						>
							<ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300 midnight:text-gray-400" />
						</button>
						<button
							onClick={handleToday}
							aria-label="Go to today"
							className="px-3 py-1.5 bg-gray-900 dark:bg-gray-800 midnight:bg-black text-white dark:text-gray-100 midnight:text-gray-100 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 midnight:hover:bg-gray-900 transition-all duration-200 text-sm font-medium border border-gray-900 dark:border-gray-600 midnight:border-gray-800 shadow-sm hover:shadow"
						>
							Today
						</button>
						<button
							onClick={handleNext}
							aria-label="Next"
							className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-lg transition-all duration-200"
						>
							<ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300 midnight:text-gray-400" />
						</button>
					</div>
					<span className="text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-semibold text-lg">
						{view === "month" && currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
						{view === "week" && (() => {
							const weekStart = new Date(currentDate);
							const dayOfWeek = currentDate.getDay();
							const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
							weekStart.setDate(currentDate.getDate() - mondayOffset);
							return `Week of ${weekStart.toLocaleString("default", { month: "short", day: "numeric", year: "numeric" })}`;
						})()}
						{view === "day" && currentDate.toLocaleString("default", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
					</span>
					{isCalendarRefreshing ? (
						<div className="flex items-center ml-5">
							<RefreshCw className="w-4 h-4 mr-2 animate-spin text-gray-600 dark:text-gray-400" />
							<span className="text-sm text-gray-600 dark:text-gray-400">Syncing...</span>
						</div>
					) : (
						<div className="flex items-center ml-5 space-x-3">
							<div className="flex items-center">
								<div className={`w-2 h-2 rounded-full mr-2 ${isOnline ? "bg-green-500" : "bg-red-500"}`}></div>
								<span className="text-xs text-gray-600 dark:text-gray-400">{isOnline ? "Online" : "Offline"}</span>
							</div>
							{lastSyncTime && (
								<span className="text-xs text-gray-500 dark:text-gray-500">
									Last sync: {formatLastSyncTime(lastSyncTime)}
								</span>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="flex items-center gap-4">
				{/* Event Filter (Personal / Project) */}
				<div className="relative mr-2" ref={filtersRef}>
					<motion.button
						onClick={() => setShowFilters(!showFilters)}
						className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-gray-200 dark:border-gray-700 midnight:border-gray-800
              ${showFilters || projectFilter
								? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700"
								: "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 midnight:bg-gray-900 midnight:text-gray-200 midnight:hover:bg-gray-800"
							}`}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<Filter className="w-4 h-4" />
						<span>{getProjectFilterDisplayName()}</span>
						{projectFilter && (
							<div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full"></div>
						)}
						{isCalendarRefreshing && (
							<div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
						)}
					</motion.button>

					<AnimatePresence>
						{showFilters && (
							<motion.div
								initial={{ opacity: 0, y: -10, scale: 0.95 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -10, scale: 0.95 }}
								transition={{ duration: 0.15 }}
								className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-80 bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 z-50 overflow-hidden"
								onClick={(e) => e.stopPropagation()}
							>
								{/* Header */}
								<div className="p-3 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex items-center justify-between">
									<h3 className="font-medium text-gray-800 dark:text-white midnight:text-indigo-200 flex items-center">
										<Filter size={16} className="mr-2 text-gray-600 dark:text-gray-400" />
										Filter Events
										{projectFilter && (
											<span className="ml-2 px-1.5 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-full">1</span>
										)}
									</h3>
									{projectFilter && (
										<button
											onClick={clearAllFilters}
											className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
										>
											Clear
										</button>
									)}
								</div>

								<div className="p-3 space-y-1 max-h-80 overflow-y-auto">
									{/* All Events */}
									<div
										onClick={() => handleProjectSelect(null)}
										className={`p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between ${!projectFilter ? "bg-indigo-50 dark:bg-indigo-900/20" : ""}`}
									>
										<div className="flex items-center">
											<Filter className="w-4 h-4 mr-3 text-indigo-600 dark:text-indigo-400" />
											<div>
												<span className="text-gray-700 dark:text-gray-300 font-medium">All Events</span>
												<div className="text-xs text-gray-500 dark:text-gray-400">Show all calendar events</div>
											</div>
										</div>
										{!projectFilter && <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>}
									</div>

									{/* Personal Events */}
									<div
										onClick={() => handleProjectSelect("personal")}
										className={`p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between ${projectFilter === "personal" ? "bg-amber-50 dark:bg-amber-900/20" : ""}`}
									>
										<div className="flex items-center">
											<User className="w-4 h-4 mr-3 text-amber-600 dark:text-amber-400" />
											<div>
												<span className="text-gray-700 dark:text-gray-300 font-medium">Personal Events</span>
												<div className="text-xs text-gray-500 dark:text-gray-400">Your personal calendar events</div>
											</div>
										</div>
										{projectFilter === "personal" && <div className="w-2 h-2 bg-amber-500 rounded-full"></div>}
									</div>

									{/* Projects divider */}
									{allProjects.length > 0 && (
										<>
											<div className="pt-2 pb-1 px-1">
												<div className="relative">
													<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
													<input
														type="text"
														placeholder="Search projects..."
														value={searchQuery}
														onChange={(e) => setSearchQuery(e.target.value)}
														className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
													/>
												</div>
											</div>
											{filteredProjects.map((project) => (
												<div
													key={project.id}
													onClick={() => handleProjectSelect(project.id)}
													className={`p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between ${projectFilter === project.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
												>
													<div className="flex items-center">
														<span className="text-base mr-3">{project.emoji || "📁"}</span>
														<div>
															<span className="text-gray-700 dark:text-gray-300 font-medium text-sm">{project.name}</span>
															<div className="text-xs text-gray-500 dark:text-gray-400">Project events & tasks</div>
														</div>
													</div>
													{projectFilter === project.id && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
												</div>
											))}
											{filteredProjects.length === 0 && searchQuery && (
												<div className="text-center py-6 text-gray-500 dark:text-gray-400">
													<FolderOpen className="w-6 h-6 mx-auto mb-1 opacity-50" />
													<p className="text-sm">No projects found</p>
												</div>
											)}
										</>
									)}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Task Filters */}
				<div className="relative mr-2" ref={taskFiltersRef}>
					<motion.button
						onClick={() => setShowTaskFilters(!showTaskFilters)}
						className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-gray-200 dark:border-gray-700 midnight:border-gray-800
              ${showTaskFilters || cardFilters.showCards
								? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
								: "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 midnight:bg-gray-900 midnight:text-gray-200 midnight:hover:bg-gray-800"
							}`}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<CheckSquare className="w-4 h-4" />
						<span>Tasks</span>
						{activeFilterCount > 0 && (
							<span className="ml-1 px-1.5 py-0.5 bg-green-600 dark:bg-green-500 text-white text-xs rounded-full">
								{activeFilterCount}
							</span>
						)}
					</motion.button>

					<AnimatePresence>
						{showTaskFilters && (
							<motion.div
								initial={{ opacity: 0, y: -10, scale: 0.95 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -10, scale: 0.95 }}
								transition={{ duration: 0.15 }}
								className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 z-50"
							>
								<div className="p-4 space-y-4">
									{/* Show Tasks Toggle */}
									<div className="flex items-center justify-between">
										<label className="text-sm font-medium text-gray-700 dark:text-gray-300">Show Tasks</label>
										<motion.button
											onClick={() => updateCardFilter("showCards", !cardFilters.showCards)}
											className={`relative w-12 h-6 rounded-full transition-colors ${cardFilters.showCards ? "bg-green-500" : "bg-gray-300 dark:bg-gray-700"}`}
											whileTap={{ scale: 0.95 }}
										>
											<motion.div
												className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
												animate={{ x: cardFilters.showCards ? 24 : 2 }}
												transition={{ type: "spring", stiffness: 300, damping: 30 }}
											/>
										</motion.button>
									</div>

									{cardFilters.showCards && (
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											className="space-y-3"
										>
											{/* Priority Filter */}
											<div>
												<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</label>
												<div className="grid grid-cols-2 gap-2">
													{[
														{ value: "all", label: "All", icon: Filter },
														{ value: "high", label: "High", icon: AlertTriangle },
														{ value: "medium", label: "Medium", icon: Target },
														{ value: "low", label: "Low", icon: CheckCircle },
													].map(({ value, label, icon: Icon }) => (
														<button
															key={value}
															onClick={() => updateCardFilter("priority", value)}
															className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm transition-colors ${cardFilters.priority === value
																? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
																: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
																}`}
														>
															<Icon className="w-4 h-4" />
															<span>{label}</span>
														</button>
													))}
												</div>
											</div>

											{/* Status Filter */}
											<div>
												<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
												<div className="grid grid-cols-3 gap-2">
													{[
														{ value: "all", label: "All" },
														{ value: "completed", label: "Done" },
														{ value: "notCompleted", label: "Todo" },
													].map(({ value, label }) => (
														<button
															key={value}
															onClick={() => updateCardFilter("completed", value)}
															className={`px-3 py-2 rounded-md text-sm transition-colors ${cardFilters.completed === value
																? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
																: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
																}`}
														>
															{label}
														</button>
													))}
												</div>
											</div>

											{/* Assignment Filter */}
											<div className="flex items-center justify-between">
												<label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assigned to me</label>
												<motion.button
													onClick={() => updateCardFilter("assignedToMe", !cardFilters.assignedToMe)}
													className={`relative w-12 h-6 rounded-full transition-colors ${cardFilters.assignedToMe ? "bg-green-500" : "bg-gray-300 dark:bg-gray-700"}`}
													whileTap={{ scale: 0.95 }}
												>
													<motion.div
														className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
														animate={{ x: cardFilters.assignedToMe ? 24 : 2 }}
														transition={{ type: "spring", stiffness: 300, damping: 30 }}
													/>
												</motion.button>
											</div>

											{/* Administrator Filter */}
											<div className="flex items-center justify-between">
												<label className="text-sm font-medium text-gray-700 dark:text-gray-300">Administrator</label>
												<motion.button
													onClick={() => updateCardFilter("createdByMe", !cardFilters.createdByMe)}
													className={`relative w-12 h-6 rounded-full transition-colors ${cardFilters.createdByMe ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"}`}
													whileTap={{ scale: 0.95 }}
												>
													<motion.div
														className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
														animate={{ x: cardFilters.createdByMe ? 24 : 2 }}
														transition={{ type: "spring", stiffness: 300, damping: 30 }}
													/>
												</motion.button>
											</div>
										</motion.div>
									)}

									{/* Clear All Button */}
									{(projectFilter || activeFilterCount > 0) && (
										<motion.button
											onClick={clearAllFilters}
											className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
											whileHover={{ scale: 1.02 }}
											whileTap={{ scale: 0.98 }}
										>
											Clear All Filters
										</motion.button>
									)}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* View Switcher */}
				<div className="flex items-center bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-1">
					{["month", "week", "day"].map((v) => (
						<button
							key={v}
							onClick={() => onViewChange(v)}
							className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 capitalize ${view === v
								? "bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
								: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
								}`}
						>
							{v}
						</button>
					))}
				</div>
			</div>
		</div>
	);
};

export default TopBar;
