import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

const TopBar = ({
	view,
	onViewChange,
	currentDate,
	onDateChange,
	isCalendarRefreshing,
}) => {
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [lastSyncTime, setLastSyncTime] = useState(null);

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
