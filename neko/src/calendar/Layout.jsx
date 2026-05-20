import { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import TopBar from "./TopBar";
import Calendar from "./Calendar";
import { AddEventModal } from "./components/modals/AddEventModal";
import CalendarSkeleton from "./components/CalendarSkeleton";
import {
	calendarEventsApi,
	calendarDataApi,
} from "./api/calendarApi";
import { calendarUtils } from "./api/calendarUtils";

const soraFontBase = "font-sora";

const Layout = ({ session }) => {
	const [view, setView] = useState(() => {
		try {
			const savedView = localStorage.getItem("calendar-view");
			return savedView && ["month", "week", "day"].includes(savedView)
				? savedView
				: "month";
		} catch {
			return "month";
		}
	});
	const [currentDate, setCurrentDate] = useState(new Date());
	const [_selectedDate] = useState(null);
	const [showAddEvent, setShowAddEvent] = useState(false);
	const [events, setEvents] = useState([]);
	const [isInitialLoading, setIsInitialLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isMutating, setIsMutating] = useState(false);
	const [, setLoadingType] = useState("");
	const [fetchTrigger, setFetchTrigger] = useState(0);

	const isFirstLoad = useRef(true);
	const prevViewRef = useRef(view);
	const prevDateRef = useRef(currentDate);
	const prefetchTimeoutRef = useRef(null);

	useEffect(() => {
		setIsInitialLoading(true);
		calendarDataApi.invalidateCache();
		setFetchTrigger((prev) => prev + 1);
		calendarDataApi.networkSync.init();

		const invalidateAndRefresh = () => {
			calendarDataApi.invalidateCache();
			setFetchTrigger((prev) => prev + 1);
		};

		window.addEventListener("eventUpdated", invalidateAndRefresh);
		window.addEventListener("networkRestored", invalidateAndRefresh);

		return () => {
			window.removeEventListener("eventUpdated", invalidateAndRefresh);
			window.removeEventListener("networkRestored", invalidateAndRefresh);
			calendarDataApi.backgroundSync.stop();
		};
	}, []);

	useEffect(() => {
		const interval = setInterval(() => {
			if (!isMutating && !isRefreshing && document.visibilityState === "visible") {
				calendarDataApi.invalidateCache();
				setFetchTrigger((prev) => prev + 1);
			}
		}, 5 * 60 * 1000);

		const handleVisibility = () => {
			if (document.visibilityState === "visible" && !isMutating && !isRefreshing) {
				calendarDataApi.invalidateCache();
				setFetchTrigger((prev) => prev + 1);
			}
		};

		document.addEventListener("visibilitychange", handleVisibility);
		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, [isMutating, isRefreshing]);

	useEffect(() => {
		try {
			localStorage.setItem("calendar-view", view);
		} catch {
			// Ignore storage failures.
		}
	}, [view]);

	useEffect(() => {
		if (!isInitialLoading) {
			if (view !== prevViewRef.current) {
				setIsRefreshing(true);
				setLoadingType("viewChange");
			} else if (
				view === "month" &&
				(currentDate.getMonth() !== prevDateRef.current.getMonth() ||
					currentDate.getFullYear() !== prevDateRef.current.getFullYear())
			) {
				setIsRefreshing(true);
				setLoadingType("dateChange");
			}
		}
		prevViewRef.current = view;
		prevDateRef.current = currentDate;
	}, [view, currentDate, isInitialLoading]);

	useEffect(() => {
		const loadData = async () => {
			if (isFirstLoad.current) {
				setIsInitialLoading(true);
				isFirstLoad.current = false;
			}

			try {
				const { startDate, endDate } = calendarUtils.getViewDateRange(
					view,
					currentDate
				);
				const filters = {
					startDate: startDate.toISOString().split("T")[0],
					endDate: endDate.toISOString().split("T")[0],
				};

				const { events: fetchedEvents } =
					await calendarDataApi.fetchCalendarDataWithRetry(filters);

				setEvents(fetchedEvents.map(calendarUtils.formatEventForFrontend));

				if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current);
				prefetchTimeoutRef.current = setTimeout(() => {
					calendarDataApi.prefetchAdjacentData(filters, view);
				}, 100);

				calendarDataApi.backgroundSync.start(filters);
			} catch (error) {
				console.error("Error loading calendar data:", error);
				if (error.message?.includes("Authentication")) return;
				setEvents([]);
			} finally {
				setIsInitialLoading(false);
				setIsRefreshing(false);
				window.dispatchEvent(
					new CustomEvent("calendarSyncComplete", {
						detail: { timestamp: new Date() },
					})
				);
			}
		};

		loadData();
		return () => {
			if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current);
		};
	}, [fetchTrigger, view, currentDate]);

	const smartRefresh = async () => {
		setIsRefreshing(true);
		setLoadingType("manual");
		try {
			calendarDataApi.invalidateCache();
			setFetchTrigger((prev) => prev + 1);
		} finally {
			setIsRefreshing(false);
		}
	};

	const handleAddEvent = async (newEvent) => {
		setIsMutating(true);
		setLoadingType("adding");
		try {
			const eventData = {
				title: newEvent.title,
				color: newEvent.color || "purple",
				description: newEvent.description || "",
				location: newEvent.location || "",
			};

			if (newEvent.startDate && newEvent.endDate) {
				eventData.startDate = newEvent.startDate;
				eventData.startTime = newEvent.startTime;
				eventData.endDate = newEvent.endDate;
				eventData.endTime = newEvent.endTime;
			} else {
				eventData.date = newEvent.date;
				eventData.startTime = newEvent.startTime || newEvent.start;
				eventData.endTime = newEvent.endTime || newEvent.end;
			}

			const formattedEvent = calendarUtils.formatEventForBackend(eventData);
			const optimisticEvent = {
				id: `temp-${Date.now()}`,
				title: newEvent.title,
				date: eventData.date || eventData.startDate,
				startTime: formattedEvent.startTime,
				endTime: formattedEvent.endTime,
				color: eventData.color,
				description: eventData.description,
				isPending: true,
			};

			setEvents((prev) => [...prev, optimisticEvent]);
			setShowAddEvent(false);
			await calendarEventsApi.createEvent(formattedEvent);
			calendarDataApi.invalidateCache();
			setIsRefreshing(true);
			setFetchTrigger((prev) => prev + 1);
		} catch (error) {
			console.error("Error adding event:", error);
			setEvents((prev) => prev.filter((event) => !event.isPending));
		} finally {
			setIsMutating(false);
		}
	};

	const handleDeleteEvent = async (eventToDelete) => {
		setIsMutating(true);
		setLoadingType("deleting");
		try {
			setEvents((prev) => prev.filter((event) => event.id !== eventToDelete.id));
			await calendarEventsApi.deleteEvent(eventToDelete.id);
			calendarDataApi.invalidateCache();
		} catch (error) {
			console.error("Error deleting event:", error);
			setIsRefreshing(true);
			setFetchTrigger((prev) => prev + 1);
		} finally {
			setIsMutating(false);
		}
	};

	const handleEventUpdate = async (updatedEvent) => {
		setIsMutating(true);
		setLoadingType("updating");
		const originalEvent = events.find((event) => event.id === updatedEvent.id);

		try {
			setEvents((prev) =>
				prev.map((event) =>
					event.id === updatedEvent.id
						? { ...updatedEvent, isPending: true }
						: event
				)
			);

			const payload =
				updatedEvent.startTime?.includes("T") &&
				updatedEvent.endTime?.includes("T")
					? updatedEvent
					: calendarUtils.formatEventForBackend(updatedEvent);

			await calendarEventsApi.updateEvent(updatedEvent.id, payload);

			setEvents((prev) =>
				prev.map((event) =>
					event.id === updatedEvent.id
						? { ...updatedEvent, isPending: false }
						: event
				)
			);
			calendarDataApi.invalidateCache();
			window.dispatchEvent(
				new CustomEvent("eventUpdated", {
					detail: { eventId: updatedEvent.id, event: updatedEvent },
				})
			);
		} catch (error) {
			console.error("Error updating event:", error);
			setEvents((prev) =>
				prev.map((event) =>
					event.id === updatedEvent.id
						? { ...originalEvent, hasError: true }
						: event
				)
			);
			setTimeout(() => {
				setEvents((prev) =>
					prev.map((event) =>
						event.id === updatedEvent.id
							? { ...originalEvent, hasError: false }
							: event
					)
				);
			}, 3000);
			throw error;
		} finally {
			setIsMutating(false);
		}
	};

	return (
		<div
			className={`flex flex-col h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 ${soraFontBase}`}
		>
			<TopBar
				view={view}
				onViewChange={setView}
				currentDate={currentDate}
				onDateChange={setCurrentDate}
				isCalendarRefreshing={isRefreshing}
			/>

			<div className="flex-1 overflow-auto relative">
				{isInitialLoading ? (
					<div className="h-full">
						<CalendarSkeleton view={view} />
					</div>
				) : (
					<Calendar
						view={view}
						currentDate={currentDate}
						onDateChange={setCurrentDate}
						selectedDate={_selectedDate}
						events={events}
						onAddEvent={handleAddEvent}
						onDeleteEvent={handleDeleteEvent}
						onEventUpdate={handleEventUpdate}
						fetchEvents={smartRefresh}
						currentUserId={session?.user?.id}
						currentUserEmail={session?.user?.email}
					/>
				)}
			</div>

			<AnimatePresence>
				{showAddEvent && (
					<AddEventModal
						isOpen={showAddEvent}
						onClose={() => setShowAddEvent(false)}
						onAddEvent={handleAddEvent}
						initialDate={_selectedDate}
						initialTitle=""
						initialeventid={null}
					/>
				)}

			</AnimatePresence>
		</div>
	);
};

export default Layout;
