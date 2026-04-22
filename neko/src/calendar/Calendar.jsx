import {
	useState,
	useEffect,
	useMemo,
	useCallback,
	useRef,
} from "react";
import { Plus } from "lucide-react";
import { EVENT_COLORS, DAYS_OF_WEEK } from "./data/CalendarConstants"; // Fixed typo here
import { AddEventModal } from "./components/modals/AddEventModal";
import ViewEventModal from "./components/modals/ViewEventModal";
import ViewCardModal from "./components/modals/ViewCardModal";
import MonthView from "./components/MonthView";
import DayView from "./components/DayView";
import WeekView from "./components/WeekView";
import MultipleEventsModal from "./components/MultipleEventsModal";
import { EditEventModal } from "./components/modals/EditEventModal";
import { motion, AnimatePresence } from "framer-motion"; // Added framer-motion for transitions

const Calendar = ({
	view,
	currentDate,
	onDateChange,
	selectedDate,
	events = [],
	cards = [], // Add cards as a new prop
	onAddEvent,
	onDeleteEvent,
	onEventUpdate,
	onCardUpdate, // Add handler for card updates
	onCardClick, // Add handler for card clicks
	fetchEvents,
	projectsMap = {}, // Add projects map for card modal
	allProjects = [], // Add all projects for permissions
	currentUserId, // Add current user ID
	currentUserEmail, // Add current user email
}) => {
	const [showAddEvent, setShowAddEvent] = useState(false);
	const [showViewEvent, setShowViewEvent] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState(null);
	// Add view card modal state
	const [showViewCard, setShowViewCard] = useState(false);
	const [selectedCard, setSelectedCard] = useState(null);
	const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
	const timeSlotRef = useRef(null);
	const [showMultipleEvents, setShowMultipleEvents] = useState(false);
	const [selectedDatePosition, setSelectedDatePosition] = useState(null);
	const [selectedDateEvents, setSelectedDateEvents] = useState([]);
	const [selectedDateCards, setSelectedDateCards] = useState([]); // Add state for cards
	const [showEditModal, setShowEditModal] = useState(false);
	// Optimistic UI states
	const [localEvents, setLocalEvents] = useState([]);
	const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);
	const [pendingActions, setPendingActions] = useState([]);
	const [currentTime, setCurrentTime] = useState(new Date()); // Add state for current time

	// Sync local events with props events
	useEffect(() => {
		if (!isOptimisticUpdate) {
			setLocalEvents(events);
		}
	}, [events, isOptimisticUpdate]);

	// Effect to update current time every minute
	useEffect(() => {
		const timerId = setInterval(() => {
			setCurrentTime(new Date());
		}, 60000); // Update every minute
		return () => clearInterval(timerId); // Cleanup on unmount
	}, []);

	const isSameDate = (date1, date2) => {
		if (!date1 || !date2) return false;
		const d1 = new Date(date1);
		const d2 = new Date(date2);
		return (
			d1.getFullYear() === d2.getFullYear() &&
			d1.getMonth() === d2.getMonth() &&
			d1.getDate() === d2.getDate()
		);
	};

	useEffect(() => {
		// Get time slot width after the component renders
		if (timeSlotRef.current) {
			// Time slot width calculation for layout
		}
	}, []); // Keep empty dependency array if the timeSlotRef logic should only run once

	const handleEventClick = (event, e) => {
		if (e) e.stopPropagation();
		setSelectedEvent(event);
		setShowViewEvent(true);
	};

	// New handler for card clicks
	const handleCardClick = (card, e) => {
		if (e) e.stopPropagation();

		// If there's an external handler, use it
		if (onCardClick) {
			onCardClick(card);
		} else {
			// Otherwise show the card modal
			setSelectedCard(card);
			setShowViewCard(true);
		}
	};

	// Optimistic UI for deleting an event
	const handleDeleteAndClose = (event) => {
		// Check if current user can delete this event
		// Event creators and project admins can delete events
		const canDelete =
			currentUserId &&
			(event.createdBy === currentUserId ||
				(event.projectId &&
					allProjects.some(
						(p) =>
							p.id === event.projectId &&
							p.created_by === currentUserId
					)));

		if (!canDelete) {
			return; // Exit early if user doesn't have permission
		}

		// Optimistically update UI
		setIsOptimisticUpdate(true);
		setLocalEvents((prev) => prev.filter((e) => e.id !== event.id));

		// Add a visual pending indicator or status
		setPendingActions((prev) => [
			...prev,
			{ type: "delete", id: event.id },
		]);

		// Close the modal immediately for better UX
		setShowViewEvent(false);

		// Actually delete from server
		onDeleteEvent(event)
			.then(() => {
				// On success, keep the optimistic state
				setPendingActions((prev) =>
					prev.filter(
						(action) =>
							!(
								action.type === "delete" &&
								action.id === event.id
							)
					)
				);
			})
			.catch((error) => {
				// On failure, restore the event
				console.error("Failed to delete event:", error);
				setLocalEvents(events);
				setPendingActions((prev) =>
					prev.filter(
						(action) =>
							!(
								action.type === "delete" &&
								action.id === event.id
							)
					)
				);
				// Could show an error notification here
			})
			.finally(() => {
				setIsOptimisticUpdate(false);
			});
	};

	// Handle showing more items for a date
	const handleShowMoreClick = (date, position = null) => {
		// Get events for the date
		const eventsOnDate = filteredEvents.filter((event) =>
			isSameDate(new Date(event.date), date)
		);

		// Get cards for the date
		const cardsOnDate = cards.filter((card) => {
			const cardDate = new Date(card.dueDate);
			return isSameDate(cardDate, date);
		});

		// Set selected items
		setSelectedDateEvents(eventsOnDate);
		setSelectedDateCards(cardsOnDate);
		setSelectedDatePosition(position); // Store the button position

		// Show modal
		setShowMultipleEvents(true);
	};

	const handleTimeSlotClick = (date, hour) => {
		const selectedDateTime = new Date(date);
		selectedDateTime.setHours(hour, 0, 0, 0);
		setSelectedTimeSlot(selectedDateTime);
		setShowAddEvent(true);
	};

	// Optimistic UI for adding an event
	const handleAddEvent = (newEvent) => {
		// Create temporary ID for optimistic update
		const tempEvent = {
			...newEvent,
			id: `temp-${Date.now()}`,
			isPending: true,
		};

		// Optimistically add to UI
		setIsOptimisticUpdate(true);
		setLocalEvents((prev) => [...prev, tempEvent]);

		// Close modal immediately
		setShowAddEvent(false);
		setSelectedTimeSlot(null);

		// Add to pending actions
		setPendingActions((prev) => [
			...prev,
			{ type: "add", id: tempEvent.id, tempEvent },
		]);

		// Actually add to server
		onAddEvent(newEvent)
			.then((savedEvent) => {
				// On success, replace temp event with real one
				setLocalEvents((prev) =>
					prev.map((e) =>
						e.id === tempEvent.id
							? { ...savedEvent, isPending: false }
							: e
					)
				);
				setPendingActions((prev) =>
					prev.filter(
						(action) =>
							!(
								action.type === "add" &&
								action.id === tempEvent.id
							)
					)
				);
			})
			.catch((error) => {
				// On failure, remove the temp event
				console.error("Failed to add event:", error);
				setLocalEvents((prev) =>
					prev.filter((e) => e.id !== tempEvent.id)
				);
				setPendingActions((prev) =>
					prev.filter(
						(action) =>
							!(
								action.type === "add" &&
								action.id === tempEvent.id
							)
					)
				);
				// Could show an error notification here
			})
			.finally(() => {
				setIsOptimisticUpdate(false);
			});
	};

	const handleEditEvent = (event) => {
		setShowViewEvent(false);
		setSelectedEvent(event);
		setShowEditModal(true);
	};
	// Optimistic UI for updating an event
	const handleUpdateEvent = (updatedEvent) => {
		// Optimistically update UI
		setIsOptimisticUpdate(true);
		const originalEvent = localEvents.find((e) => e.id === updatedEvent.id);

		setLocalEvents((prev) =>
			prev.map((e) =>
				e.id === updatedEvent.id
					? { ...updatedEvent, isPending: true }
					: e
			)
		);

		// Update selectedEvent if it's the same event being updated
		if (selectedEvent && selectedEvent.id === updatedEvent.id) {
			setSelectedEvent({ ...updatedEvent, isPending: true });
		}

		// Close modal immediately
		setShowEditModal(false);

		// Add to pending actions
		setPendingActions((prev) => [
			...prev,
			{
				type: "update",
				id: updatedEvent.id,
				updatedEvent,
				originalEvent,
			},
		]);
		// Actually update on server
		return onEventUpdate(updatedEvent)
			.then(() => {
				// On success, mark as not pending
				setLocalEvents((prev) =>
					prev.map((e) =>
						e.id === updatedEvent.id
							? { ...updatedEvent, isPending: false }
							: e
					)
				);

				// Update selectedEvent if it's the same event being updated
				if (selectedEvent && selectedEvent.id === updatedEvent.id) {
					setSelectedEvent({ ...updatedEvent, isPending: false });
				}

				setPendingActions((prev) =>
					prev.filter(
						(action) =>
							!(
								action.type === "update" &&
								action.id === updatedEvent.id
							)
					)
				);
			})
			.catch((error) => {
				// On failure, restore original event
				console.error("Failed to update event:", error);
				setLocalEvents((prev) =>
					prev.map((e) =>
						e.id === updatedEvent.id ? originalEvent : e
					)
				);

				// Restore selectedEvent if it's the same event being updated
				if (selectedEvent && selectedEvent.id === updatedEvent.id) {
					setSelectedEvent(originalEvent);
				}

				setPendingActions((prev) =>
					prev.filter(
						(action) =>
							!(
								action.type === "update" &&
								action.id === updatedEvent.id
							)
					)
				);
				throw error; // Re-throw to allow awaiting component to catch if necessary
			})
			.finally(() => {
				setIsOptimisticUpdate(false);
			});
	};

	const timeSlots = useMemo(() => {
		return Array.from(
			{ length: 24 },
			(_, i) => `${i.toString().padStart(2, "0")}:00`
		);
	}, []);

	const isToday = useCallback((date) => {
		const today = new Date();
		return date.toDateString() === today.toDateString();
	}, []);

	const isSelectedDate = useCallback(
		(date) => {
			return (
				date &&
				selectedDate &&
				date.toDateString() === selectedDate.toDateString()
			);
		},
		[selectedDate]
	);

	const getMonthDays = useCallback((year, month) => {
		const date = new Date(year, month, 1);
		const days = [];
		while (date.getMonth() === month) {
			days.push(new Date(date));
			date.setDate(date.getDate() + 1);
		}
		return days;
	}, []);

	const getEventStyle = useCallback((event) => {
		let style = EVENT_COLORS[event.color] || EVENT_COLORS.blue;

		// Enhanced visual feedback for different states
		if (event.isPending || event.isOptimisticUpdate) {
			style += " opacity-70 animate-pulse ring-2 ring-blue-300";
		} else if (event.hasError) {
			style +=
				" opacity-80 ring-2 ring-red-400 bg-red-500 border-red-600";
		}

		return style;
	}, []);

	const getCurrentTimePosition = useCallback(
		(now) => {
			// Accept currentTime as argument
			// const now = new Date(); // Remove internal Date creation
			const TIME_SLOT_HEIGHT_PX = 64; // Define for DayView and WeekView consistency
			if (view === "day" || view === "week") {
				// Apply to both day and week view
				// Calculate position based on current hour and minutes relative to the time slot height
				const minutes = now.getHours() * 60 + now.getMinutes();
				return (minutes / (24 * 60)) * (24 * TIME_SLOT_HEIGHT_PX);
			} else {
				// For month view or other views, it might return a percentage or different calculation
				const totalMinutes = now.getHours() * 60 + now.getMinutes();
				return (totalMinutes / (24 * 60)) * 100; // Original percentage for other views
			}
		},
		[view]
	);

	const filteredEvents = useMemo(() => {
		return localEvents.filter((event) => {
			const eventDate = new Date(event.date);
			eventDate.setHours(0, 0, 0, 0);

			const compareDate = new Date(currentDate);
			compareDate.setHours(0, 0, 0, 0);

			if (view === "day") {
				// For day view, check if the event spans or occurs on the current date
				if (event.startTime && event.endTime) {
					// Use startTime and endTime for more accurate multi-day event detection
					const startDate = new Date(event.startTime);
					const endDate = new Date(event.endTime);

					const dayStart = new Date(currentDate);
					dayStart.setHours(0, 0, 0, 0);
					const dayEnd = new Date(currentDate);
					dayEnd.setHours(23, 59, 59, 999);

					// Event overlaps with current day if it starts before day ends and ends after day starts
					return startDate <= dayEnd && endDate >= dayStart;
				} else {
					// Fallback to original logic for events without startTime/endTime
					return (
						eventDate.toDateString() === currentDate.toDateString()
					);
				}
			} else if (view === "week") {
				const weekStart = new Date(currentDate);
				const dayOfWeek = currentDate.getDay();
				const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0
				weekStart.setDate(currentDate.getDate() - mondayOffset);
				weekStart.setHours(0, 0, 0, 0);

				const weekEnd = new Date(weekStart);
				weekEnd.setDate(weekStart.getDate() + 6);
				weekEnd.setHours(23, 59, 59, 999);

				const eventDateStart = new Date(eventDate);
				eventDateStart.setHours(0, 0, 0, 0);
				return eventDate >= weekStart && eventDate <= weekEnd;
			} else if (view === "month") {
				// For month view, include the full visible range including overflow days from adjacent months
				const year = compareDate.getFullYear();
				const month = compareDate.getMonth();

				// Get the first day of the month
				const firstDayOfMonth = new Date(year, month, 1);
				const dayOfWeek = firstDayOfMonth.getDay();
				const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0

				// Calculate the start of the visible range (including previous month overflow)
				const visibleRangeStart = new Date(firstDayOfMonth);
				visibleRangeStart.setDate(
					firstDayOfMonth.getDate() - mondayOffset
				);
				visibleRangeStart.setHours(0, 0, 0, 0);

				// Get the last day of the month
				const lastDayOfMonth = new Date(year, month + 1, 0);
				const lastDayOfWeek = lastDayOfMonth.getDay();
				const sundayOffset =
					lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek; // Days needed to reach Sunday

				// Calculate the end of the visible range (including next month overflow)
				const visibleRangeEnd = new Date(lastDayOfMonth);
				visibleRangeEnd.setDate(
					lastDayOfMonth.getDate() + sundayOffset
				);
				visibleRangeEnd.setHours(23, 59, 59, 999);

				// Check if event falls within the visible range
				return (
					eventDate >= visibleRangeStart &&
					eventDate <= visibleRangeEnd
				);
			}
			return false;
		});
	}, [localEvents, view, currentDate]);

	// Filter cards based on current view
	const filteredCards = useMemo(() => {
		return cards.filter((card) => {
			// Skip cards without due dates
			if (!card.dueDate) return false;

			const cardDate = new Date(card.dueDate);
			cardDate.setHours(0, 0, 0, 0);

			const compareDate = new Date(currentDate);
			compareDate.setHours(0, 0, 0, 0);

			if (view === "day") {
				return cardDate.toDateString() === currentDate.toDateString();
			} else if (view === "week") {
				const weekStart = new Date(currentDate);
				const dayOfWeek = currentDate.getDay();
				const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0
				weekStart.setDate(currentDate.getDate() - mondayOffset);
				weekStart.setHours(0, 0, 0, 0);

				const weekEnd = new Date(weekStart);
				weekEnd.setDate(weekStart.getDate() + 6);
				weekEnd.setHours(23, 59, 59, 999);

				return cardDate >= weekStart && cardDate <= weekEnd;
			} else if (view === "month") {
				// For month view, include the full visible range including overflow days from adjacent months
				const year = compareDate.getFullYear();
				const month = compareDate.getMonth();

				// Get the first day of the month
				const firstDayOfMonth = new Date(year, month, 1);
				const dayOfWeek = firstDayOfMonth.getDay();
				const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0

				// Calculate the start of the visible range (including previous month overflow)
				const visibleRangeStart = new Date(firstDayOfMonth);
				visibleRangeStart.setDate(
					firstDayOfMonth.getDate() - mondayOffset
				);
				visibleRangeStart.setHours(0, 0, 0, 0);

				// Get the last day of the month
				const lastDayOfMonth = new Date(year, month + 1, 0);
				const lastDayOfWeek = lastDayOfMonth.getDay();
				const sundayOffset =
					lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek; // Days needed to reach Sunday

				// Calculate the end of the visible range (including next month overflow)
				const visibleRangeEnd = new Date(lastDayOfMonth);
				visibleRangeEnd.setDate(
					lastDayOfMonth.getDate() + sundayOffset
				);
				visibleRangeEnd.setHours(23, 59, 59, 999);

				// Check if card falls within the visible range
				return (
					cardDate >= visibleRangeStart && cardDate <= visibleRangeEnd
				);
			}
			return false;
		});
	}, [cards, view, currentDate]);
	return (
		<div
			className="calendar-container bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-lg shadow-lg h-full overflow-auto"
			style={{
				msOverflowStyle: "none" /* Internet Explorer 10+ */,
				scrollbarWidth: "none" /* Firefox */,
			}}
		>
			<style>{`
        .calendar-container::-webkit-scrollbar { 
          display: none;  /* Safari and Chrome */
        }
      `}</style>{" "}
			{view === "day" && (
				<DayView
					currentDate={currentDate}
					events={filteredEvents}
					cards={filteredCards}
					isToday={isToday}
					isSelectedDate={isSelectedDate}
					getEventStyle={getEventStyle}
					onEventClick={handleEventClick}
					onCardClick={handleCardClick}
					handleTimeSlotClick={handleTimeSlotClick}
					handleShowMoreClick={handleShowMoreClick}
					getCurrentTimePosition={() =>
						getCurrentTimePosition(currentTime)
					} // Pass currentTime
					onEventUpdate={handleUpdateEvent}
					onCardUpdate={onCardUpdate}
					fetchEvents={fetchEvents}
					currentTime={currentTime} // Pass currentTime as a prop
					onDateChange={onDateChange} // Add onDateChange prop for day navigation
					currentUserId={currentUserId} // Pass current user ID
					currentUserEmail={currentUserEmail} // Pass current user email
					allProjects={allProjects} // Pass all projects for permissions
					// Modal props
					showMultipleEvents={showMultipleEvents}
					selectedDateEvents={selectedDateEvents}
					selectedDateCards={selectedDateCards}
					selectedDatePosition={selectedDatePosition}
					onCloseMultipleEvents={() => {
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
					onEventClickFromModal={(event) => {
						setSelectedEvent(event);
						setShowViewEvent(true);
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
					onCardClickFromModal={(card) => {
						if (onCardClick) {
							onCardClick(card);
						} else {
							setSelectedCard(card);
							setShowViewCard(true);
						}
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
				/>
			)}{" "}
			{view === "week" && (
				<WeekView
					currentDate={currentDate}
					events={filteredEvents}
					cards={filteredCards}
					isToday={isToday}
					isSelectedDate={isSelectedDate}
					getEventStyle={getEventStyle}
					onEventClick={handleEventClick}
					onCardClick={handleCardClick}
					handleTimeSlotClick={handleTimeSlotClick}
					handleShowMoreClick={handleShowMoreClick}
					getCurrentTimePosition={() =>
						getCurrentTimePosition(currentTime)
					} // Pass currentTime
					onEventUpdate={handleUpdateEvent}
					onCardUpdate={onCardUpdate}
					fetchEvents={fetchEvents}
					currentTime={currentTime} // Pass currentTime as a prop
					onDateChange={onDateChange} // Add onDateChange prop for week navigation
					currentUserId={currentUserId} // Pass current user ID
					currentUserEmail={currentUserEmail} // Pass current user email
					allProjects={allProjects} // Pass all projects for permissions
					// Modal props
					showMultipleEvents={showMultipleEvents}
					selectedDateEvents={selectedDateEvents}
					selectedDateCards={selectedDateCards}
					selectedDatePosition={selectedDatePosition}
					onCloseMultipleEvents={() => {
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
					onEventClickFromModal={(event) => {
						setSelectedEvent(event);
						setShowViewEvent(true);
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
					onCardClickFromModal={(card) => {
						if (onCardClick) {
							onCardClick(card);
						} else {
							setSelectedCard(card);
							setShowViewCard(true);
						}
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
				/>
			)}
			{view === "month" && (
				<MonthView
					currentDate={currentDate}
					onDateChange={onDateChange}
					events={filteredEvents}
					cards={filteredCards} // Pass filtered cards
					isToday={isToday}
					isSelectedDate={isSelectedDate}
					monthDays={getMonthDays(
						currentDate.getFullYear(),
						currentDate.getMonth()
					)}
					firstDayOfMonth={(() => {
						const firstDay = new Date(
							currentDate.getFullYear(),
							currentDate.getMonth(),
							1
						).getDay();
						return firstDay === 0 ? 6 : firstDay - 1; // Convert Sunday=0 to Sunday=6, Monday=1 to Monday=0, etc.
					})()}
					onEventClick={handleEventClick}
					onCardClick={handleCardClick} // Pass card click handler
					onShowMoreClick={handleShowMoreClick}
					getEventStyle={getEventStyle}
					setSelectedTimeSlot={setSelectedTimeSlot}
					onEventUpdate={handleUpdateEvent}
					onCardUpdate={onCardUpdate} // Pass card update handler
					setShowAddEvent={setShowAddEvent}
					fetchEvents={fetchEvents}
					currentUserId={currentUserId} // Pass current user ID
					currentUserEmail={currentUserEmail} // Pass current user email
					allProjects={allProjects} // Pass all projects for permissions
					// Modal props
					showMultipleEvents={showMultipleEvents}
					selectedDateEvents={selectedDateEvents}
					selectedDateCards={selectedDateCards}
					selectedDatePosition={selectedDatePosition}
					onCloseMultipleEvents={() => {
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
					onEventClickFromModal={(event) => {
						setSelectedEvent(event);
						setShowViewEvent(true);
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
					onCardClickFromModal={(card) => {
						if (onCardClick) {
							onCardClick(card);
						} else {
							setSelectedCard(card);
							setShowViewCard(true);
						}
						setShowMultipleEvents(false);
						setSelectedDatePosition(null);
					}}
				/>
			)}
			<AnimatePresence>
				{showAddEvent && (
					<AddEventModal
						isOpen={showAddEvent}
						onClose={() => {
							setShowAddEvent(false);
							setSelectedTimeSlot(null);
						}}
						onAddEvent={handleAddEvent}
						initialDate={selectedTimeSlot}
						initialTitle=""
						initialeventid={null}
						initialProject={null}
					/>
				)}

				{showViewEvent && selectedEvent && (
					<ViewEventModal
						isOpen={showViewEvent}
						onClose={() => setShowViewEvent(false)}
						event={selectedEvent}
						onEdit={handleEditEvent}
						onDelete={handleDeleteAndClose}
						currentUserId={currentUserId}
						currentUserEmail={currentUserEmail}
						allProjects={allProjects}
						fetchEvents={fetchEvents}
					/>
				)}

				{showEditModal && (
					<EditEventModal
						isOpen={showEditModal}
						onClose={() => setShowEditModal(false)}
						onEditEvent={handleUpdateEvent}
						event={selectedEvent}
					/>
				)}

				{/* Add ViewCardModal */}
				{showViewCard && selectedCard && (
					<ViewCardModal
						isOpen={showViewCard}
						onClose={() => setShowViewCard(false)}
						card={selectedCard}
						projectsMap={projectsMap}
						currentUserId={currentUserId}
					/>
				)}
			</AnimatePresence>
		</div>
	);
};

export default Calendar;
