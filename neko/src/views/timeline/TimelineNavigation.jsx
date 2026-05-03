import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

const TimelineNavigation = ({
	viewMode,
	setViewMode,
	visibleDateRange,
	navigatePrevious,
	navigateNext,
	resetToToday,
	groupBy,
	setGroupBy,
}) => {
	const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);

	// Helper function to check if a date is in current period
	const isCurrentPeriod = () => {
		if (!visibleDateRange.start || !visibleDateRange.end) return false;

		const today = new Date();
		const rangeStart = new Date(visibleDateRange.start);
		const rangeEnd = new Date(visibleDateRange.end);

		return today >= rangeStart && today <= rangeEnd;
	};

	// Helper function to get relative period text
	const getNavigationText = () => {
		if (!visibleDateRange.start) return "";

		const today = new Date();
		const rangeStart = new Date(visibleDateRange.start);

		if (viewMode === "week") {
			const currentWeekStart = getWeekStart(today);
			const visibleWeekStart = getWeekStart(rangeStart);

			const weekDiff = Math.round(
				(visibleWeekStart - currentWeekStart) /
					(7 * 24 * 60 * 60 * 1000)
			);

			if (weekDiff === 0) return "This Week";
			else if (weekDiff === -1) return "Last Week";
			else if (weekDiff === 1) return "Next Week";
			else if (weekDiff < -1) return `${Math.abs(weekDiff)} Weeks Ago`;
			else return `${weekDiff} Weeks Ahead`;
		} else if (viewMode === "quarter") {
			const currentQuarterInfo = getQuarterInfo(today);
			const visibleQuarterInfo = getQuarterInfo(rangeStart);

			const yearDiff = visibleQuarterInfo.year - currentQuarterInfo.year;
			const quarterDiff =
				visibleQuarterInfo.quarter -
				currentQuarterInfo.quarter +
				yearDiff * 4;

			if (quarterDiff === 0) return "This Quarter";
			else if (quarterDiff === -1) return "Last Quarter";
			else if (quarterDiff === 1) return "Next Quarter";
			else if (quarterDiff < -1)
				return `${Math.abs(quarterDiff)} Quarters Ago`;
			else return `${quarterDiff} Quarters Ahead`;
		} else {
			const currentMonth = today.getMonth();
			const currentYear = today.getFullYear();
			const visibleMonth = rangeStart.getMonth();
			const visibleYear = rangeStart.getFullYear();

			const monthDiff =
				(visibleYear - currentYear) * 12 +
				(visibleMonth - currentMonth);

			if (monthDiff === 0) return "This Month";
			else if (monthDiff === -1) return "Last Month";
			else if (monthDiff === 1) return "Next Month";
			else if (monthDiff < -1) return `${Math.abs(monthDiff)} Months Ago`;
			else return `${monthDiff} Months Ahead`;
		}
	};

	// Helper functions
	const getWeekStart = (date) => {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day + (day === 0 ? -6 : 1);
		d.setDate(diff);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	const getQuarterInfo = (date) => {
		const quarter = Math.floor(date.getMonth() / 3) + 1;
		const year = date.getFullYear();
		return { quarter, year };
	};

	// Get the button text for the "Today"/"This Month"/"This Quarter" button
	const getTodayButtonText = () => {
		if (viewMode === "week") return "Today";
		else if (viewMode === "quarter") return "This Quarter";
		else return "This Month";
	};

	// Get date range text for display
	const getDateRangeText = () => {
		if (!visibleDateRange.start || !visibleDateRange.end) return "";

		if (viewMode === "week") {
			const startDate = visibleDateRange.start.toLocaleDateString(
				undefined,
				{
					month: "short",
					day: "numeric",
				}
			);
			const endDate = visibleDateRange.end.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
			return `${startDate} - ${endDate}`;
		} else if (viewMode === "quarter") {
			const quarterInfo = getQuarterInfo(visibleDateRange.start);
			const startDate = visibleDateRange.start.toLocaleDateString(
				undefined,
				{
					month: "short",
					day: "numeric",
				}
			);
			const endDate = visibleDateRange.end.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
			return `Q${quarterInfo.quarter} ${quarterInfo.year} (${startDate} - ${endDate})`;
		} else {
			return visibleDateRange.start.toLocaleDateString(undefined, {
				month: "long",
				year: "numeric",
			});
		}
	};

	// Custom Group By Dropdown
	const groupByOptions = [
		{ value: "status", label: "Status" },
		{ value: "priority", label: "Priority" },
		{ value: "dueStatus", label: "Due Status" },
		{ value: "completion", label: "Completion" },
	];

	const selectedGroupByOption = groupByOptions.find(
		(option) => option.value === groupBy
	);

	return (
		<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
			<div className="px-6 py-3">
				{/* Navigation and View Controls */}
				<div className="flex items-center justify-between gap-6">
					{/* Left side - Date Navigation */}
					<div className="flex items-center space-x-4">
						{/* Enhanced Navigation Controls */}
						<div className="flex items-center bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 rounded-xl overflow-hidden transition-shadow duration-200">
							<button
								onClick={navigatePrevious}
								className="p-2.5 text-gray-600 hover:text-gray-600 hover:bg-gray-50/50 dark:text-gray-400 dark:hover:text-gray-400 dark:hover:bg-gray-900/20 midnight:text-gray-500 midnight:hover:text-gray-300 midnight:hover:bg-gray-900/10 transition-all duration-200 group"
								title={
									viewMode === "week"
										? "Previous Week"
										: viewMode === "quarter"
										? "Previous Quarter"
										: "Previous Month"
								}
							>
								<ChevronLeft className="w-4 h-4" />
							</button>

							<div className="px-4 py-2 border-l border-r border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60">
								<div className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
									{getDateRangeText()}
								</div>
								<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
									{getNavigationText()}
								</div>
							</div>

							<button
								onClick={navigateNext}
								className="p-2.5 text-gray-600 hover:text-gray-600 hover:bg-gray-50/50 dark:text-gray-400 dark:hover:text-gray-400 dark:hover:bg-gray-900/20 midnight:text-gray-500 midnight:hover:text-gray-300 midnight:hover:bg-gray-900/10 transition-all duration-200 group"
								title={
									viewMode === "week"
										? "Next Week"
										: viewMode === "quarter"
										? "Next Quarter"
										: "Next Month"
								}
							>
								<ChevronRight className="w-4 h-4" />
							</button>
						</div>

						{/* Today/This Month/This Quarter Button */}
						<button
							onClick={resetToToday}
							className={`px-4 py-2.5 text-sm font-medium border rounded-xl transition-all duration-200 ${
								isCurrentPeriod()
									? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300 border-indigo-200 dark:border-indigo-600 midnight:border-indigo-700"
									: "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
							}`}
						>
							{getTodayButtonText()}
						</button>
					</div>

					{/* Right side - Group By and View Controls */}
					<div className="flex items-center space-x-4">
						{/* Custom Group By Dropdown */}
						<div className="relative">
							<button
								onClick={() =>
									setShowGroupByDropdown(!showGroupByDropdown)
								}
								className={`flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-all duration-200 ${
									showGroupByDropdown
										? "rounded-t-xl border-b-0 shadow-lg"
										: "rounded-xl hover:shadow-sm"
								}`}
							>
								<span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
									Group by:
								</span>
								<span>{selectedGroupByOption?.label}</span>
								<ChevronDown
									className={`w-4 h-4 transition-transform duration-200 ${
										showGroupByDropdown ? "rotate-180" : ""
									}`}
								/>
							</button>

							{showGroupByDropdown && (
								<div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 border-t-0 rounded-b-xl shadow-lg z-50 overflow-hidden">
									<div className="py-1">
										{groupByOptions.map((option, index) => (
											<button
												key={option.value}
												onClick={() => {
													setGroupBy(option.value);
													setShowGroupByDropdown(
														false
													);
												}}
												className={`w-full text-left px-4 py-2.5 text-sm transition-colors duration-200 ${
													groupBy === option.value
														? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300"
														: "text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
												} ${
													index === 0
														? "border-t border-gray-100 dark:border-gray-700 midnight:border-gray-800"
														: ""
												}`}
											>
												{option.label}
											</button>
										))}
									</div>
								</div>
							)}
						</div>

						{/* Three-way View Toggle */}
						<div className="flex items-center bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60 rounded-xl overflow-hidden transition-shadow duration-200">
							<button
								onClick={() => setViewMode("week")}
								className={`px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
									viewMode === "week"
										? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300"
										: "text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 midnight:hover:bg-indigo-900/5"
								}`}
							>
								Week
							</button>
							<div className="w-px h-6 bg-gray-200/60 dark:bg-gray-600/60 midnight:bg-gray-700/60"></div>
							<button
								onClick={() => setViewMode("month")}
								className={`px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
									viewMode === "month"
										? "bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-300"
										: "text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 midnight:hover:bg-indigo-900/5"
								}`}
							>
								Month
							</button>
							<div className="w-px h-6 bg-gray-200/60 dark:bg-gray-600/60 midnight:bg-gray-700/60"></div>
							<button
								onClick={() => setViewMode("quarter")}
								className={`px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
									viewMode === "quarter"
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

			{/* Close dropdown when clicking outside */}
			{showGroupByDropdown && (
				<div
					className="fixed inset-0 z-40"
					onClick={() => setShowGroupByDropdown(false)}
				/>
			)}
		</div>
	);
};

export default TimelineNavigation;
