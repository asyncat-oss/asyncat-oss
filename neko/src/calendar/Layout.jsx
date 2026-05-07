import { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import TopBar from "./TopBar";
import Calendar from "./Calendar";
import { AddEventModal } from "./components/modals/AddEventModal";
import CalendarSkeleton from "./components/CalendarSkeleton";
import ViewCardModal from "./components/modals/ViewCardModal";
import {
	calendarEventsApi,
	calendarDataApi,
	calendarProjectsApi,
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
	const [cards, setCards] = useState([]);
	const [isInitialLoading, setIsInitialLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isMutating, setIsMutating] = useState(false);
	const [, setLoadingType] = useState("");
	const [selectedCard, setSelectedCard] = useState(null);
	const [showCardModal, setShowCardModal] = useState(false);
	const [projectsMap, setProjectsMap] = useState({});
	const [fetchTrigger, setFetchTrigger] = useState(0);

	const isFirstLoad = useRef(true);
	const prevViewRef = useRef(view);
	const prevDateRef = useRef(currentDate);
	const prefetchTimeoutRef = useRef(null);

	const [cardFilters, setCardFilters] = useState(() => {
		try {
			const saved = localStorage.getItem("calendar-card-filters");
			if (saved) {
				const parsed = JSON.parse(saved);
				return {
					showCards: parsed.showCards !== undefined ? parsed.showCards : true,
					priority: parsed.priority || "all",
					completed: parsed.completed || "all",
				};
			}
		} catch {
			// Ignore malformed persisted filters.
		}
		return { showCards: true, priority: "all", completed: "all" };
	});

	useEffect(() => {
		const fetchProjects = async () => {
			try {
				const { data } = await calendarProjectsApi.getProjects();
				const map = {};
				(data || []).forEach((project) => {
					map[project.id] = project;
				});
				setProjectsMap(map);
			} catch (error) {
				console.error("Error fetching projects for calendar cards:", error);
			}
		};
		fetchProjects();
	}, []);

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
		window.addEventListener("cardUpdated", invalidateAndRefresh);
		window.addEventListener("projectsUpdated", invalidateAndRefresh);
		window.addEventListener("networkRestored", invalidateAndRefresh);

		return () => {
			window.removeEventListener("eventUpdated", invalidateAndRefresh);
			window.removeEventListener("cardUpdated", invalidateAndRefresh);
			window.removeEventListener("projectsUpdated", invalidateAndRefresh);
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
		try {
			localStorage.setItem("calendar-card-filters", JSON.stringify(cardFilters));
		} catch {
			// Ignore storage failures.
		}
	}, [cardFilters]);

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

				const { events: fetchedEvents, cards: fetchedCards } =
					await calendarDataApi.fetchCalendarDataWithRetry(filters);

				setEvents(fetchedEvents.map(calendarUtils.formatEventForFrontend));
				setCards(fetchedCards);

				if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current);
				prefetchTimeoutRef.current = setTimeout(() => {
					calendarDataApi.prefetchAdjacentData(filters, view);
				}, 100);

				calendarDataApi.backgroundSync.start(filters);
			} catch (error) {
				console.error("Error loading calendar data:", error);
				if (error.message?.includes("Authentication")) return;
				setEvents([]);
				setCards([]);
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

	const updateCardFilter = (key, value) => {
		setCardFilters((prev) => ({ ...prev, [key]: value }));
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

	const handleCardUpdate = async (updatedCard) => {
		setIsMutating(true);
		setLoadingType("updating");
		const originalCard = cards.find((card) => card.id === updatedCard.id);

		try {
			setCards((prev) =>
				prev.map((card) =>
					card.id === updatedCard.id ? { ...updatedCard, isPending: true } : card
				)
			);

			const responseData = await calendarEventsApi.updateCardDueDate(
				updatedCard.id,
				updatedCard.dueDate
			);

			setCards((prev) =>
				prev.map((card) =>
					card.id === updatedCard.id
						? { ...responseData.card, isPending: false }
						: card
				)
			);
			calendarDataApi.invalidateCache();
			window.dispatchEvent(
				new CustomEvent("cardUpdated", {
					detail: { cardId: updatedCard.id, card: responseData.card },
				})
			);
		} catch (error) {
			console.error("Error updating card:", error);
			if (originalCard) {
				setCards((prev) =>
					prev.map((card) =>
						card.id === updatedCard.id
							? { ...originalCard, hasError: true }
							: card
					)
				);
				setTimeout(() => {
					setCards((prev) =>
						prev.map((card) =>
							card.id === updatedCard.id
								? { ...originalCard, hasError: false }
								: card
						)
					);
				}, 3000);
			}
			throw error;
		} finally {
			setIsMutating(false);
		}
	};

	const filteredCards = cards.filter((card) => {
		if (!cardFilters.showCards) return false;
		if (
			cardFilters.priority !== "all" &&
			card.priority?.toLowerCase() !== cardFilters.priority.toLowerCase()
		) {
			return false;
		}
		if (cardFilters.completed === "completed" && !card.isCompleted) return false;
		if (cardFilters.completed === "notCompleted" && card.isCompleted) return false;
		return true;
	});

	return (
		<div
			className={`flex flex-col h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 ${soraFontBase}`}
		>
			<TopBar
				view={view}
				onViewChange={setView}
				currentDate={currentDate}
				onDateChange={setCurrentDate}
				cardFilters={cardFilters}
				updateCardFilter={updateCardFilter}
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
						cards={filteredCards}
						onAddEvent={handleAddEvent}
						onDeleteEvent={handleDeleteEvent}
						onEventUpdate={handleEventUpdate}
						onCardUpdate={handleCardUpdate}
						onCardClick={(card) => {
							setSelectedCard(card);
							setShowCardModal(true);
						}}
						isEmpty={events.length === 0 && filteredCards.length === 0}
						fetchEvents={smartRefresh}
						projectsMap={projectsMap}
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

				{showCardModal && (
					<ViewCardModal
						isOpen={showCardModal}
						onClose={() => setShowCardModal(false)}
						card={selectedCard}
						projectsMap={projectsMap}
						currentUserId={session?.user?.id}
					/>
				)}
			</AnimatePresence>
		</div>
	);
};

export default Layout;
