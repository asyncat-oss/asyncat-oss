import React, { useState, useEffect, useRef } from "react";
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

const Layout = ({ selectedProject, session }) => {
	const [view, setView] = useState(() => {
		try {
			const savedView = localStorage.getItem("calendar-view");
			return savedView && ["month", "week", "day"].includes(savedView) ? savedView : "month";
		} catch { return "month"; }
	});
	const [currentDate, setCurrentDate] = useState(new Date());
	const [selectedDate, setSelectedDate] = useState(null);
	const [showAddEvent, setShowAddEvent] = useState(false);
	const [events, setEvents] = useState([]);
	const [cards, setCards] = useState([]);
	const [isInitialLoading, setIsInitialLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isMutating, setIsMutating] = useState(false);
	const [loadingType, setLoadingType] = useState("");

	const isFirstLoad = useRef(true);
	const prevViewRef = useRef(view);
	const prevDateRef = useRef(currentDate);
	const prefetchTimeoutRef = useRef(null);
	const [fetchTrigger, setFetchTrigger] = useState(0);

	const [selectedCard, setSelectedCard] = useState(null);
	const [showCardModal, setShowCardModal] = useState(false);

	// Project filter state (no workspace filter in single-user mode)
	const [projectFilter, setProjectFilter] = useState(null);
	const [allProjects, setAllProjects] = useState([]);
	const [projectsMap, setProjectsMap] = useState({});

	const [cardFilters, setCardFilters] = useState(() => {
		try {
			const saved = localStorage.getItem("calendar-card-filters");
			if (saved) {
				const p = JSON.parse(saved);
				return {
					showCards: p.showCards !== undefined ? p.showCards : true,
					priority: p.priority || "all",
					completed: p.completed || "all",
					assignedToMe: p.assignedToMe || false,
					createdByMe: p.createdByMe || false,
				};
			}
		} catch {}
		return { showCards: true, priority: "all", completed: "all", assignedToMe: false, createdByMe: false };
	});

	// Init project filter from URL
	useEffect(() => {
		const projectId = new URLSearchParams(window.location.search).get("project");
		if (projectId) setProjectFilter(projectId);
	}, []);

	// Fetch projects for filter dropdown
	useEffect(() => {
		const fetchProjects = async () => {
			try {
				const { data } = await calendarProjectsApi.getProjects();
				if (data) {
					const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
					setAllProjects(sorted);
					const map = {};
					sorted.forEach((p) => { map[p.id] = p; });
					setProjectsMap(map);
				}
			} catch (error) {
				console.error("Error fetching projects:", error);
			}
		};
		fetchProjects();
	}, []);

	// Initialize calendar
	useEffect(() => {
		setIsInitialLoading(true);
		calendarDataApi.invalidateCache();
		setFetchTrigger((prev) => prev + 1);
		calendarDataApi.networkSync.init();

		const invalidateAndRefresh = () => {
			calendarDataApi.invalidateCache(null, "user");
			setFetchTrigger((prev) => prev + 1);
		};

		window.addEventListener("eventInviteAccepted", invalidateAndRefresh);
		window.addEventListener("eventInviteDeclined", invalidateAndRefresh);
		window.addEventListener("eventUpdated", invalidateAndRefresh);
		window.addEventListener("cardUpdated", invalidateAndRefresh);
		window.addEventListener("projectsUpdated", invalidateAndRefresh);
		window.addEventListener("networkRestored", invalidateAndRefresh);

		return () => {
			window.removeEventListener("eventInviteAccepted", invalidateAndRefresh);
			window.removeEventListener("eventInviteDeclined", invalidateAndRefresh);
			window.removeEventListener("eventUpdated", invalidateAndRefresh);
			window.removeEventListener("cardUpdated", invalidateAndRefresh);
			window.removeEventListener("projectsUpdated", invalidateAndRefresh);
			window.removeEventListener("networkRestored", invalidateAndRefresh);
			calendarDataApi.backgroundSync.stop();
		};
	}, []);

	// Auto-refresh every 5 minutes
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

	// Save view to localStorage
	useEffect(() => {
		try { localStorage.setItem("calendar-view", view); } catch {}
	}, [view]);

	// Save card filters to localStorage
	useEffect(() => {
		try { localStorage.setItem("calendar-card-filters", JSON.stringify(cardFilters)); } catch {}
	}, [cardFilters]);

	// Smart loading state
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

	// Main data fetch
	useEffect(() => {
		const loadData = async () => {
			if (isFirstLoad.current) {
				setIsInitialLoading(true);
				isFirstLoad.current = false;
			}
			try {
				const { startDate, endDate } = calendarUtils.getViewDateRange(view, currentDate);
				const filters = {
					startDate: startDate.toISOString().split("T")[0],
					endDate: endDate.toISOString().split("T")[0],
				};

				if (projectFilter === "personal") {
					filters.personal = "true";
				} else if (projectFilter) {
					filters.projectId = projectFilter;
				}

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
				window.dispatchEvent(new CustomEvent("calendarSyncComplete", { detail: { timestamp: new Date() } }));
			}
		};

		loadData();
		return () => { if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current); };
	}, [fetchTrigger, projectFilter, view, currentDate]);

	const smartRefresh = async () => {
		setIsRefreshing(true);
		setLoadingType("manual");
		try {
			calendarDataApi.invalidateCache(projectFilter);
			setFetchTrigger((prev) => prev + 1);
		} catch (error) {
			console.error("Error refreshing calendar data:", error);
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
			let projectId = newEvent.projectId;
			if (!projectId && !newEvent.isPersonalEvent) {
				if (projectFilter && projectFilter !== "personal") projectId = projectFilter;
				else if (selectedProject?.id) projectId = selectedProject.id;
			}
			if (newEvent.isPersonalEvent) projectId = null;

			const eventData = {
				title: newEvent.title,
				projectId,
				color: newEvent.color || "purple",
				description: newEvent.description || "",
				attendees: [],
				location: newEvent.location || "",
				isPersonalEvent: newEvent.isPersonalEvent || false,
			};

			if (newEvent.startDate && newEvent.endDate) {
				eventData.startDate = newEvent.startDate;
				eventData.startTime = newEvent.startTime;
				eventData.endDate = newEvent.endDate;
				eventData.endTime = newEvent.endTime;
				eventData.isMultiDay = true;
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
				projectId: eventData.projectId,
				isPending: true,
			};

			setEvents((prev) => [...prev, optimisticEvent]);
			setShowAddEvent(false);

			await calendarEventsApi.createEvent(formattedEvent);

			if (projectId) calendarDataApi.invalidateCache(projectId, "project");
			else calendarDataApi.invalidateCache(null, "user");

			if (projectFilter && projectFilter !== "personal") {
				calendarDataApi.invalidateCache(projectFilter, "project");
			}

			setIsRefreshing(true);
			setFetchTrigger((prev) => prev + 1);
		} catch (error) {
			console.error("Error adding event:", error);
			setEvents((prev) => prev.filter((e) => !e.isPending));
		} finally {
			setIsMutating(false);
		}
	};

	const handleDeleteEvent = async (eventToDelete) => {
		setIsMutating(true);
		setLoadingType("deleting");
		try {
			setEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
			await calendarEventsApi.deleteEvent(eventToDelete.id, eventToDelete.projectId);

			if (eventToDelete.projectId) calendarDataApi.invalidateCache(eventToDelete.projectId, "project");
			else calendarDataApi.invalidateCache(null, "user");

			if (projectFilter && projectFilter !== "personal") {
				calendarDataApi.invalidateCache(projectFilter, "project");
			}
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
		const originalEvent = events.find((e) => e.id === updatedEvent.id);

		try {
			setEvents((prev) =>
				prev.map((e) => e.id === updatedEvent.id ? { ...updatedEvent, isPending: true } : e)
			);

			let projectId = updatedEvent.projectId;
			if (projectId && typeof projectId === "object" && projectId.id) projectId = projectId.id;

			const eventToUpdate = { ...updatedEvent, projectId };

			if (updatedEvent.startTime?.includes("T") && updatedEvent.endTime?.includes("T")) {
				await calendarEventsApi.updateEvent(updatedEvent.id, { ...eventToUpdate, attendees: eventToUpdate.attendees || [] });
			} else {
				await calendarEventsApi.updateEvent(updatedEvent.id, calendarUtils.formatEventForBackend(eventToUpdate));
			}

			setEvents((prev) =>
				prev.map((e) => e.id === updatedEvent.id ? { ...updatedEvent, isPending: false } : e)
			);

			if (projectId) calendarDataApi.invalidateCache(projectId, "project");
			else calendarDataApi.invalidateCache(null, "user");

			if (projectFilter && projectFilter !== "personal") {
				calendarDataApi.invalidateCache(projectFilter, "project");
			}

			window.dispatchEvent(new CustomEvent("eventUpdated", { detail: { eventId: updatedEvent.id, event: updatedEvent } }));
		} catch (error) {
			console.error("Error updating event:", error);
			setEvents((prev) =>
				prev.map((e) => e.id === updatedEvent.id ? { ...originalEvent, hasError: true } : e)
			);
			setTimeout(() => {
				setEvents((prev) =>
					prev.map((e) => e.id === updatedEvent.id ? { ...originalEvent, hasError: false } : e)
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
		const originalCard = cards.find((c) => c.id === updatedCard.id);

		try {
			setCards((prev) =>
				prev.map((c) => c.id === updatedCard.id ? { ...updatedCard, isPending: true } : c)
			);

			const responseData = await calendarEventsApi.updateCardDueDate(updatedCard.id, updatedCard.dueDate);

			setCards((prev) =>
				prev.map((c) => c.id === updatedCard.id ? { ...responseData.card, isPending: false } : c)
			);

			const cardProjectId = updatedCard.projectId || updatedCard.column?.projectId;
			if (cardProjectId) calendarDataApi.invalidateCache(cardProjectId, "project");
			else calendarDataApi.invalidateCache(null, "user");

			if (projectFilter && projectFilter !== "personal") {
				calendarDataApi.invalidateCache(projectFilter, "project");
			}

			window.dispatchEvent(new CustomEvent("cardUpdated", { detail: { cardId: updatedCard.id, card: responseData.card } }));
		} catch (error) {
			console.error("Error updating card:", error);
			if (originalCard) {
				setCards((prev) =>
					prev.map((c) => c.id === updatedCard.id ? { ...originalCard, hasError: true } : c)
				);
				setTimeout(() => {
					setCards((prev) =>
						prev.map((c) => c.id === updatedCard.id ? { ...originalCard, hasError: false } : c)
					);
				}, 3000);
			}
			throw error;
		} finally {
			setIsMutating(false);
		}
	};

	// Apply card filters
	const filteredCards = cards.filter((card) => {
		if (!cardFilters.showCards) return false;
		if (cardFilters.priority !== "all" && card.priority?.toLowerCase() !== cardFilters.priority.toLowerCase()) return false;
		if (cardFilters.completed === "completed" && !card.isCompleted) return false;
		if (cardFilters.completed === "notCompleted" && card.isCompleted) return false;

		if (cardFilters.assignedToMe && session?.user?.id) {
			const userId = session.user.id;
			let isAssigned = card.assignees?.some((a) => (typeof a === "object" ? a.id : a) === userId);
			if (!isAssigned) {
				isAssigned = card.checklist?.some((item) => {
					if (item.assignees?.some((a) => (typeof a === "object" ? a.id : a) === userId)) return true;
					if (item.assignee_id) return (typeof item.assignee_id === "object" ? item.assignee_id.id : item.assignee_id) === userId;
					return false;
				});
			}
			if (!isAssigned) return false;
		}

		if (cardFilters.createdByMe && session?.user?.id) {
			if (card.administrator_id !== session.user.id) return false;
		}

		return true;
	});

	const handleCardClick = (card) => {
		setSelectedCard(card);
		setShowCardModal(true);
	};

	const triggerRefresh = () => setFetchTrigger((prev) => prev + 1);

	return (
		<div className={`flex flex-col h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 ${soraFontBase}`}>
			<TopBar
				view={view}
				onViewChange={setView}
				currentDate={currentDate}
				onDateChange={setCurrentDate}
				allProjects={allProjects}
				projectFilter={projectFilter}
				setProjectFilter={setProjectFilter}
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
						selectedDate={selectedDate}
						events={events}
						cards={filteredCards}
						onAddEvent={handleAddEvent}
						onDeleteEvent={handleDeleteEvent}
						onEventUpdate={handleEventUpdate}
						onCardUpdate={handleCardUpdate}
						onCardClick={handleCardClick}
						isEmpty={events.length === 0 && filteredCards.length === 0}
						projectFilter={projectFilter}
						fetchEvents={smartRefresh}
						projectsMap={projectsMap}
						allProjects={allProjects}
						triggerRefresh={triggerRefresh}
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
						initialDate={selectedDate}
						initialTitle=""
						initialeventid={null}
						initialProject={projectFilter && projectFilter !== "personal" ? projectFilter : null}
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
