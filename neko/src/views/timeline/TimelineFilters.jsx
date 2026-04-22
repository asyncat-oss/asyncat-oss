
import {
	Search,
	CheckCircle,
	Plus,
	AlertTriangle,
	Calendar,
	X,
} from "lucide-react";

const TimelineFilters = ({
	searchTerm,
	setSearchTerm,
	activeFilters,
	toggleCompletedFilter,
	togglePriorityFilter,
	toggleOverdueFilter,
	toggleTimeRangeFilter,
	onClearFilters,
	onCreateTask,
	searchContext = { isSearchActive: false, totalResults: 0 },
}) => {
	// Check if any filters are active
	const hasActiveFilters =
		activeFilters.completed ||
		(activeFilters.priority && activeFilters.priority.length > 0) ||
		(activeFilters.timeRange && activeFilters.timeRange !== "all");

	// Count total active filters
	const activeFilterCount =
		(activeFilters.completed ? 1 : 0) +
		(activeFilters.priority?.length || 0) +
		(activeFilters.timeRange && activeFilters.timeRange !== "all" ? 1 : 0);
	return (
		<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
			<div className="px-6 py-4">
				{/* Main Controls Row */}
				<div className="flex items-center justify-between gap-4">
					{/* Left side - Search and Filters */}
					<div className="flex items-center gap-4 flex-1 min-w-0">
						{/* Enhanced Search */}
						<div className="relative group">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
								<Search className="h-4 w-4 text-gray-400 dark:text-gray-500 midnight:text-gray-600 transition-colors group-focus-within:text-indigo-500" />
							</div>
							<input
								type="text"
								className="block w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 dark:bg-gray-800/70 midnight:bg-gray-900/70 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 rounded-xl text-gray-900 dark:text-gray-100 midnight:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/60 transition-all duration-200 min-w-[280px] sm:min-w-[350px]"
								placeholder="Search tasks, priorities..."
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

						{/* Search Results Indicator */}
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
									activeFilters.completed
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

							{/* Overdue Filter */}
							<button
								onClick={toggleOverdueFilter}
								className={`group px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
									activeFilters.timeRange === "overdue"
										? "bg-red-50 dark:bg-red-900/30 midnight:bg-red-900/20 text-red-700 dark:text-red-400 midnight:text-red-300 border-red-200 dark:border-red-600 midnight:border-red-700"
										: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
								}`}
							>
								<div className="flex items-center gap-1.5">
									<AlertTriangle className="w-3.5 h-3.5" />
									<span className="hidden sm:inline">
										Overdue
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
											activeFilters.priority?.includes(
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
										<div className="flex items-center gap-1">
											<AlertTriangle className="w-3 h-3" />
											{priority}
										</div>
									</button>
								))}
							</div>

							{/* Timeline Specific: Time Range Filters */}
							<div className="flex items-center gap-1">
								{[
									{
										key: "today",
										label: "Today",
										color: "blue",
									},
									{
										key: "thisWeek",
										label: "This Week",
										color: "indigo",
									},
									{
										key: "thisMonth",
										label: "This Month",
										color: "purple",
									},
								].map(({ key, label, color }) => (
									<button
										key={key}
										onClick={() =>
											toggleTimeRangeFilter &&
											toggleTimeRangeFilter(key)
										}
										className={`px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
											activeFilters.timeRange === key
												? color === "blue"
													? "bg-blue-50 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border-blue-200 dark:border-blue-600 midnight:border-blue-700"
													: color === "indigo"
													? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300 border-indigo-200 dark:border-indigo-600 midnight:border-indigo-700"
													: "bg-purple-50 dark:bg-purple-900/30 midnight:bg-purple-900/20 text-purple-700 dark:text-purple-400 midnight:text-purple-300 border-purple-200 dark:border-purple-600 midnight:border-purple-700"
												: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
										}`}
									>
										<div className="flex items-center gap-1">
											<Calendar className="w-3 h-3" />
											<span className="hidden sm:inline">
												{label}
											</span>
											<span className="sm:hidden">
												{label.split(" ")[0]}
											</span>
										</div>
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
					<div className="flex items-center gap-3">
						<button
							onClick={onCreateTask}
							className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 text-black dark:text-indigo-400 midnight:text-indigo-300 text-sm font-medium flex items-center gap-1.5"
						>
							<Plus className="w-4 h-4" />
							Create Task
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default TimelineFilters;
