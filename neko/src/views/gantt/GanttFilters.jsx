import React from "react";
import {
	Search,
	Plus,
	ChevronLeft,
	ChevronRight,
	CheckCircle,
	User,
	X,
} from "lucide-react";

const GanttFilters = ({
	searchTerm,
	setSearchTerm,
	filterConfig,
	toggleCompletedFilter,
	togglePriorityFilter,
	toggleAssignedToMeFilter,
	toggleDueStatusFilter,
	onClearFilters,
	session,
	onCreateTask,
	visibleRange,
	navigatePrevious,
	navigateNext,
	resetToToday,
	//timelineScale,
	//zoomIn,
	//zoomOut,
	viewType,
	toggleViewType, // Keep for backward compatibility
	setSpecificViewType, // NEW: Function to set specific view
	searchContext, // Keep for compatibility but simplified usage
}) => {
	// Check if any filters are active
	const hasActiveFilters =
		filterConfig.completed ||
		(filterConfig.priority && filterConfig.priority.length > 0) ||
		(filterConfig.assignees && filterConfig.assignees.length > 0) ||
		(filterConfig.dueStatus && filterConfig.dueStatus.length > 0);

	// Count total active filters
	const activeFilterCount =
		(filterConfig.completed ? 1 : 0) +
		(filterConfig.priority?.length || 0) +
		(filterConfig.assignees?.length || 0) +
		(filterConfig.dueStatus?.length || 0);
	// Helper function to get week start (Monday)
	const getWeekStart = (date) => {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day + (day === 0 ? -6 : 1);
		d.setDate(diff);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	// NEW: Helper function to get quarter start
	const getQuarterStart = (date) => {
		const d = new Date(date);
		const quarter = Math.floor(d.getMonth() / 3);
		const quarterStartMonth = quarter * 3;
		d.setMonth(quarterStartMonth);
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	// NEW: Helper function to get quarter info
	const getQuarterInfo = (date) => {
		const quarter = Math.floor(date.getMonth() / 3) + 1;
		const year = date.getFullYear();
		return { quarter, year };
	};

	// Helper function to check if a date is in current week
	const isCurrentWeek = (date) => {
		const today = new Date();
		const currentWeekStart = getWeekStart(today);
		const currentWeekEnd = new Date(currentWeekStart);
		currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

		const checkDate = new Date(date);
		return checkDate >= currentWeekStart && checkDate <= currentWeekEnd;
	};

	// Helper function to check if a date is in current month
	const isCurrentMonth = (date) => {
		const today = new Date();
		const checkDate = new Date(date);
		return (
			today.getMonth() === checkDate.getMonth() &&
			today.getFullYear() === checkDate.getFullYear()
		);
	};

	// NEW: Helper function to check if a date is in current quarter
	const isCurrentQuarter = (date) => {
		const today = new Date();
		const currentQuarterInfo = getQuarterInfo(today);
		const checkQuarterInfo = getQuarterInfo(date);
		return (
			currentQuarterInfo.quarter === checkQuarterInfo.quarter &&
			currentQuarterInfo.year === checkQuarterInfo.year
		);
	};

	// Helper function to check if date range includes current period
	const isCurrentPeriod = () => {
		if (!visibleRange.startDate || !visibleRange.endDate) return false;

		if (viewType === "week") {
			return isCurrentWeek(visibleRange.startDate);
		} else if (viewType === "quarter") {
			return isCurrentQuarter(visibleRange.startDate);
		} else {
			return isCurrentMonth(visibleRange.startDate);
		}
	};

	// Helper function to get relative period text
	const getNavigationText = () => {
		if (!visibleRange.startDate) return "";

		if (viewType === "week") {
			const today = new Date();
			const currentWeekStart = getWeekStart(today);
			const visibleWeekStart = getWeekStart(visibleRange.startDate);

			// Calculate week difference
			const weekDiff = Math.round(
				(visibleWeekStart - currentWeekStart) /
					(7 * 24 * 60 * 60 * 1000)
			);

			if (weekDiff === 0) {
				return "This Week";
			} else if (weekDiff === -1) {
				return "Last Week";
			} else if (weekDiff === 1) {
				return "Next Week";
			} else if (weekDiff < -1) {
				return `${Math.abs(weekDiff)} Weeks Ago`;
			} else {
				return `${weekDiff} Weeks Ahead`;
			}
		} else if (viewType === "quarter") {
			// NEW: Quarter navigation text
			const today = new Date();
			const currentQuarterInfo = getQuarterInfo(today);
			const visibleQuarterInfo = getQuarterInfo(visibleRange.startDate);

			const yearDiff = visibleQuarterInfo.year - currentQuarterInfo.year;
			const quarterDiff =
				visibleQuarterInfo.quarter -
				currentQuarterInfo.quarter +
				yearDiff * 4;

			if (quarterDiff === 0) {
				return "This Quarter";
			} else if (quarterDiff === -1) {
				return "Last Quarter";
			} else if (quarterDiff === 1) {
				return "Next Quarter";
			} else if (quarterDiff < -1) {
				return `${Math.abs(quarterDiff)} Quarters Ago`;
			} else {
				return `${quarterDiff} Quarters Ahead`;
			}
		} else {
			// Month view
			const today = new Date();
			const visibleMonth = visibleRange.startDate.getMonth();
			const visibleYear = visibleRange.startDate.getFullYear();
			const currentMonth = today.getMonth();
			const currentYear = today.getFullYear();

			const monthDiff =
				(visibleYear - currentYear) * 12 +
				(visibleMonth - currentMonth);

			if (monthDiff === 0) {
				return "This Month";
			} else if (monthDiff === -1) {
				return "Last Month";
			} else if (monthDiff === 1) {
				return "Next Month";
			} else if (monthDiff < -1) {
				return `${Math.abs(monthDiff)} Months Ago`;
			} else {
				return `${monthDiff} Months Ahead`;
			}
		}
	};

	// Get the button text for the "Today"/"This Month"/"This Quarter" button
	const getTodayButtonText = () => {
		if (viewType === "week") {
			return "Today";
		} else if (viewType === "quarter") {
			return "This Quarter";
		} else {
			return "This Month";
		}
	};

	// Get date range text for display
	const getDateRangeText = () => {
		if (!visibleRange.startDate || !visibleRange.endDate) return "";

		if (viewType === "week") {
			const startDate = visibleRange.startDate.toLocaleDateString(
				undefined,
				{
					month: "short",
					day: "numeric",
				}
			);
			const endDate = visibleRange.endDate.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
			return `${startDate} - ${endDate}`;
		} else if (viewType === "quarter") {
			// NEW: Quarter date range text
			const quarterInfo = getQuarterInfo(visibleRange.startDate);
			const startDate = visibleRange.startDate.toLocaleDateString(
				undefined,
				{
					month: "short",
					day: "numeric",
				}
			);
			const endDate = visibleRange.endDate.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
			return `Q${quarterInfo.quarter} ${quarterInfo.year} (${startDate} - ${endDate})`;
		} else {
			return visibleRange.startDate.toLocaleDateString(undefined, {
				month: "long",
				year: "numeric",
			});
		}
	};

	return (
		<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
			<div className="px-6 py-4">
				{/* Top Row - Main Controls */}
				<div className="flex items-center justify-between gap-4 mb-4">
					{/* Left side - Search and Filters */}
					<div className="flex items-center gap-4 flex-1 min-w-0">
						{/* Enhanced Search - Clean and Simple */}
						<div className="relative group">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
								<Search className="h-4 w-4 text-gray-400 dark:text-gray-500 midnight:text-gray-600 transition-colors group-focus-within:text-indigo-500" />
							</div>
							<input
								type="text"
								className="block w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 dark:bg-gray-800/70 midnight:bg-gray-900/70 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 rounded-xl text-gray-900 dark:text-gray-100 midnight:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/60 transition-all duration-200 min-w-[350px]"
								placeholder="Search tasks, assignees, priorities..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
							{searchTerm && (
								<button
									onClick={() => setSearchTerm("")}
									className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
								>
									<svg
										className="h-4 w-4"
										fill="currentColor"
										viewBox="0 0 20 20"
									>
										<path
											fillRule="evenodd"
											d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
											clipRule="evenodd"
										/>
									</svg>
								</button>
							)}
						</div>

						{/* Search Results Indicator - Simple Badge */}
						{searchContext.isSearchActive &&
							searchContext.totalResults > 0 && (
								<div className="flex items-center">
									<div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border border-blue-200 dark:border-blue-600 midnight:border-blue-700 rounded-lg text-xs font-medium">
										<span className="flex items-center gap-1.5">
											<Search className="w-3 h-3" />
											{searchContext.totalResults} found
										</span>
									</div>
								</div>
							)}

						{/* Enhanced Filter Pills */}
						<div className="flex items-center gap-2 overflow-x-auto pb-1 align-middle">
							{/* Completed Filter */}
							<button
								onClick={toggleCompletedFilter}
								className={`group px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
									filterConfig.completed
										? "bg-emerald-50 dark:bg-emerald-900/30 midnight:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border-emerald-200 dark:border-emerald-600 midnight:border-emerald-700"
										: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
								}`}
							>
								<div className="flex items-center gap-1.5">
									<CheckCircle className="w-3.5 h-3.5" />
									<span className="hidden sm:inline">
										Completed
									</span>
								</div>
							</button>

							{/* Assigned to Me Filter */}
							<button
								onClick={toggleAssignedToMeFilter}
								className={`group px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
									session?.user?.id &&
									filterConfig.assignees.includes(
										session.user.id
									)
										? "bg-purple-50 dark:bg-purple-900/30 midnight:bg-purple-900/20 text-purple-700 dark:text-purple-400 midnight:text-purple-300 border-purple-200 dark:border-purple-600 midnight:border-purple-700"
										: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
								}`}
							>
								<div className="flex items-center gap-1.5">
									<User className="w-3.5 h-3.5" />
									<span className="hidden lg:inline">
										Assigned to me
									</span>
								</div>
							</button>

							{/* Priority Filters */}
							<div className="flex items-center gap-1">
								{["High", "Medium", "Low"].map((priority) => (
									<button
										key={priority}
										onClick={() =>
											togglePriorityFilter(priority)
										}
										className={`px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
											filterConfig.priority.includes(
												priority
											)
												? priority === "High"
													? "bg-red-50 dark:bg-red-900/30 midnight:bg-red-900/20 text-red-700 dark:text-red-400 midnight:text-red-300 border-red-200 dark:border-red-600 midnight:border-red-700"
													: priority === "Medium"
													? "bg-amber-50 dark:bg-amber-900/30 midnight:bg-amber-900/20 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border-amber-200 dark:border-amber-600 midnight:border-amber-700"
													: "bg-emerald-50 dark:bg-emerald-900/30 midnight:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border-emerald-200 dark:border-emerald-600 midnight:border-emerald-700"
												: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
										}`}
									>
										{priority}
									</button>
								))}
							</div>

							{/* Due Status Filters */}
							<div className="flex items-center gap-1">
								{[
									{
										key: "overdue",
										label: "Overdue",
										color: "red",
									},
									{
										key: "today",
										label: "Today",
										color: "amber",
									},
									{
										key: "thisWeek",
										label: "This Week",
										color: "blue",
									},
								].map(({ key, label, color }) => (
									<button
										key={key}
										onClick={() =>
											toggleDueStatusFilter(key)
										}
										className={`px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
											filterConfig.dueStatus.includes(key)
												? color === "red"
													? "bg-red-50 dark:bg-red-900/30 midnight:bg-red-900/20 text-red-700 dark:text-red-400 midnight:text-red-300 border-red-200 dark:border-red-600 midnight:border-red-700"
													: color === "amber"
													? "bg-amber-50 dark:bg-amber-900/30 midnight:bg-amber-900/20 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border-amber-200 dark:border-amber-600 midnight:border-amber-700"
													: "bg-blue-50 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border-blue-200 dark:border-blue-600 midnight:border-blue-700"
												: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
										}`}
									>
										<span className="hidden sm:inline">
											{label}
										</span>
										<span className="sm:hidden">
											{label.split(" ")[0]}
										</span>
									</button>
								))}
							</div>

							{/* Clear Filters Button */}
							{hasActiveFilters && (
								<button
									onClick={onClearFilters}
									className="px-3 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 transition-all duration-200"
									title="Clear all filters"
								>
									<div className="flex items-center gap-1">
										<X className="w-3 h-3" />
										Clear ({activeFilterCount})
									</div>
								</button>
							)}
						</div>
					</div>

					{/* Right side - Create Task */}
					<div className="flex-shrink-0">
						<button
							onClick={onCreateTask}
							className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 text-black dark:text-indigo-400 midnight:text-indigo-300 text-sm font-medium flex items-center gap-1.5"
						>
							<Plus className="w-4 h-4" />
							Create Task
						</button>
					</div>
				</div>

				{/* Bottom Row - Navigation and View Controls */}
				<div className="flex items-center justify-between gap-6">
					{/* Left side - Date Navigation */}
					<div className="flex items-center space-x-4">
						{/* Enhanced Navigation Controls */}
						<div className="flex items-center bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 rounded-xl overflow-hidden transition-shadow duration-200">
							<button
								onClick={navigatePrevious}
								className="p-2.5 text-gray-600 hover:text-gray-600 hover:bg-gray-50/50 dark:text-gray-400 dark:hover:text-gray-400 dark:hover:bg-gray-900/20 midnight:text-gray-500 midnight:hover:text-gray-300 midnight:hover:bg-gray-900/10 transition-all duration-200 group"
								title={
									viewType === "week"
										? "Previous Week"
										: viewType === "quarter"
										? "Previous Quarter"
										: "Previous Month"
								}
							>
								<ChevronLeft className="w-4 h-4 group-hover:transform group-hover:-translate-x-0.5 transition-transform duration-200" />
							</button>

							<div className="px-4 py-2.5 min-w-[200px] text-center border-x border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60">
								<div className="text-xs font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-400">
									{getNavigationText()}
								</div>
								<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
									{getDateRangeText()}
								</div>
							</div>

							<button
								onClick={navigateNext}
								className="p-2.5 text-gray-600 hover:text-gray-600 hover:bg-gray-50/50 dark:text-gray-400 dark:hover:text-gray-400 dark:hover:bg-gray-900/20 midnight:text-gray-500 midnight:hover:text-gray-300 midnight:hover:bg-gray-900/10 transition-all duration-200 group"
								title={
									viewType === "week"
										? "Next Week"
										: viewType === "quarter"
										? "Next Quarter"
										: "Next Month"
								}
							>
								<ChevronRight className="w-4 h-4 group-hover:transform group-hover:translate-x-0.5 transition-transform duration-200" />
							</button>
						</div>

						{/* Today/This Month/This Quarter Button */}
						<button
							onClick={resetToToday}
							className={`px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all duration-200 ${
								isCurrentPeriod()
									? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300 border-indigo-200 dark:border-indigo-600 midnight:border-indigo-700"
									: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
							}`}
						>
							{getTodayButtonText()}
						</button>
					</div>

					{/* Right side - View Controls */}
					<div className="flex items-center space-x-4">
						{/* ENHANCED: Three-way View Toggle */}
						<div className="flex items-center bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 rounded-xl overflow-hidden transition-shadow duration-200">
							<button
								onClick={() =>
									setSpecificViewType
										? setSpecificViewType("week")
										: viewType !== "week" &&
										  toggleViewType()
								}
								className={`px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
									viewType === "week"
										? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300"
										: "text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 midnight:hover:bg-indigo-900/5"
								}`}
							>
								Week
							</button>
							<div className="w-px h-6 bg-gray-200/60 dark:bg-gray-600/60 midnight:bg-gray-700/60"></div>
							<button
								onClick={() =>
									setSpecificViewType
										? setSpecificViewType("month")
										: viewType !== "month" &&
										  toggleViewType()
								}
								className={`px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
									viewType === "month"
										? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300"
										: "text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 midnight:hover:bg-indigo-900/5"
								}`}
							>
								Month
							</button>
							<div className="w-px h-6 bg-gray-200/60 dark:bg-gray-600/60 midnight:bg-gray-700/60"></div>
							{/* NEW: Quarter View Button */}
							<button
								onClick={() =>
									setSpecificViewType
										? setSpecificViewType("quarter")
										: viewType !== "quarter" &&
										  toggleViewType()
								}
								className={`px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
									viewType === "quarter"
										? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300"
										: "text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 midnight:hover:bg-indigo-900/5"
								}`}
							>
								Quarter
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GanttFilters;
