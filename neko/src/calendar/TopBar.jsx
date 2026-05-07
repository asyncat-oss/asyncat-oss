import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	ChevronLeft,
	ChevronRight,
	RefreshCw,
	Filter,
	CheckSquare,
	AlertTriangle,
	CheckCircle,
	Target,
} from "lucide-react";

const TopBar = ({
	view,
	onViewChange,
	currentDate,
	onDateChange,
	cardFilters,
	updateCardFilter,
	isCalendarRefreshing,
}) => {
	const [showTaskFilters, setShowTaskFilters] = useState(false);
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [lastSyncTime, setLastSyncTime] = useState(null);
	const taskFiltersRef = useRef(null);

	useEffect(() => {
		const handleOnline = () => {
			setIsOnline(true);
			setLastSyncTime(new Date());
		};
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

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (
				taskFiltersRef.current &&
				!taskFiltersRef.current.contains(event.target)
			) {
				setShowTaskFilters(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const formatLastSyncTime = (time) => {
		if (!time) return "";
		const diff = Math.floor((new Date() - time) / 1000);
		if (diff < 60) return "Just now";
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return time.toLocaleDateString();
	};

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

	const activeFilterCount =
		(cardFilters.showCards && cardFilters.priority !== "all" ? 1 : 0) +
		(cardFilters.showCards && cardFilters.completed !== "all" ? 1 : 0);

	const clearTaskFilters = () => {
		updateCardFilter("priority", "all");
		updateCardFilter("completed", "all");
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
							onClick={() => onDateChange(new Date())}
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
						{view === "month" &&
							currentDate.toLocaleString("default", {
								month: "long",
								year: "numeric",
							})}
						{view === "week" &&
							(() => {
								const weekStart = new Date(currentDate);
								const dayOfWeek = currentDate.getDay();
								const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
								weekStart.setDate(currentDate.getDate() - mondayOffset);
								return `Week of ${weekStart.toLocaleString("default", {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}`;
							})()}
						{view === "day" &&
							currentDate.toLocaleString("default", {
								weekday: "long",
								month: "long",
								day: "numeric",
								year: "numeric",
							})}
					</span>
					{isCalendarRefreshing ? (
						<div className="flex items-center ml-5">
							<RefreshCw className="w-4 h-4 mr-2 animate-spin text-gray-600 dark:text-gray-400" />
							<span className="text-sm text-gray-600 dark:text-gray-400">Syncing...</span>
						</div>
					) : (
						<div className="flex items-center ml-5 space-x-3">
							<div className="flex items-center">
								<div
									className={`w-2 h-2 rounded-full mr-2 ${
										isOnline ? "bg-green-500" : "bg-red-500"
									}`}
								/>
								<span className="text-xs text-gray-600 dark:text-gray-400">
									{isOnline ? "Online" : "Offline"}
								</span>
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
				<div className="relative mr-2" ref={taskFiltersRef}>
					<motion.button
						onClick={() => setShowTaskFilters(!showTaskFilters)}
						className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 ${
							showTaskFilters || cardFilters.showCards
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
									<div className="flex items-center justify-between">
										<label className="text-sm font-medium text-gray-700 dark:text-gray-300">
											Show Tasks
										</label>
										<motion.button
											onClick={() =>
												updateCardFilter("showCards", !cardFilters.showCards)
											}
											className={`relative w-12 h-6 rounded-full transition-colors ${
												cardFilters.showCards
													? "bg-green-500"
													: "bg-gray-300 dark:bg-gray-700"
											}`}
											whileTap={{ scale: 0.95 }}
										>
											<motion.div
												className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
												animate={{ x: cardFilters.showCards ? 24 : 2 }}
												transition={{
													type: "spring",
													stiffness: 300,
													damping: 30,
												}}
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
											<div>
												<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
													Priority
												</label>
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
															className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm transition-colors ${
																cardFilters.priority === value
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

											<div>
												<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
													Status
												</label>
												<div className="grid grid-cols-3 gap-2">
													{[
														{ value: "all", label: "All" },
														{ value: "completed", label: "Done" },
														{ value: "notCompleted", label: "Todo" },
													].map(({ value, label }) => (
														<button
															key={value}
															onClick={() => updateCardFilter("completed", value)}
															className={`px-3 py-2 rounded-md text-sm transition-colors ${
																cardFilters.completed === value
																	? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
																	: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
															}`}
														>
															{label}
														</button>
													))}
												</div>
											</div>
										</motion.div>
									)}

									{activeFilterCount > 0 && (
										<motion.button
											onClick={clearTaskFilters}
											className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
											whileHover={{ scale: 1.02 }}
											whileTap={{ scale: 0.98 }}
										>
											Clear Task Filters
										</motion.button>
									)}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<div className="flex items-center bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg p-1">
					{["month", "week", "day"].map((viewName) => (
						<button
							key={viewName}
							onClick={() => onViewChange(viewName)}
							className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 capitalize ${
								view === viewName
									? "bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
									: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
							}`}
						>
							{viewName}
						</button>
					))}
				</div>
			</div>
		</div>
	);
};

export default TopBar;
