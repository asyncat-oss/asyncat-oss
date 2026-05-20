import {
	useState,
	useEffect,
	useMemo,
	useCallback,
	useRef,
} from "react";
import { EVENT_COLORS } from "./data/CalendarConstants";
import { AddEventModal } from "./components/modals/AddEventModal";
import ViewEventModal from "./components/modals/ViewEventModal";
import MonthView from "./components/MonthView";
import DayView from "./components/DayView";
import WeekView from "./components/WeekView";
import { EditEventModal } from "./components/modals/EditEventModal";
import { AnimatePresence } from "framer-motion";

const Calendar = ({
	view,
	currentDate,
	onDateChange,
	selectedDate,
	events = [],
	onAddEvent,
	onDeleteEvent,
	onEventUpdate,
	fetchEvents,
	currentUserId,
	currentUserEmail,
}) => {
	const [showAddEvent, setShowAddEvent] = useState(false);
	const [showViewEvent, setShowViewEvent] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState(null);
	const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
	const timeSlotRef = useRef(null);
	const [showMultipleEvents, setShowMultipleEvents] = useState(false);
	const [selectedDatePosition, setSelectedDatePosition] = useState(null);
	const [selectedDateEvents, setSelectedDateEvents] = useState([]);
	const [showEditModal, setShowEditModal] = useState(false);
	// Optimistic UI states
	const [localEvents, setLocalEvents] = useState([]);
	const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);
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

	// Optimistic UI for deleting an event
	const handleDeleteAndClose = (event) => {
		// Optimistically update UI
		setIsOptimisticUpdate(true);
		setLocalEvents((prev) => prev.filter((e) => e.id !== event.id));

		// Close the modal immediately for better UX
		setShowViewEvent(false);

		// Actually delete from server
		onDeleteEvent(event)
			.catch((error) => {
				// On failure, restore the event
				console.error("Failed to delete event:", error);
				setLocalEvents(events);
			})
			.finally(() => {
				setIsOptimisticUpdate(false);
			});
	};

	const handleShowMoreClick = (date, position = null) => {
		const eventsOnDate = filteredEvents.filter((event) =>
			isSameDate(new Date(event.date), date)
		);
		setSelectedDateEvents(eventsOnDate);
		setSelectedDatePosition(position);
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
			})
			.catch((error) => {
				// On failure, remove the temp event
				console.error("Failed to add event:", error);
				setLocalEvents((prev) =>
					prev.filter((e) => e.id !== tempEvent.id)
				);
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

				throw error; // Re-throw to allow awaiting component to catch if necessary
			})
			.finally(() => {
				setIsOptimisticUpdate(false);
			});
	};

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
					isToday={isToday}
					isSelectedDate={isSelectedDate}
					getEventStyle={getEventStyle}
					onEventClick={handleEventClick}
					handleTimeSlotClick={handleTimeSlotClick}
					handleShowMoreClick={handleShowMoreClick}
					getCurrentTimePosition={() => getCurrentTimePosition(currentTime)}
					onEventUpdate={handleUpdateEvent}
					fetchEvents={fetchEvents}
					currentTime={currentTime}
					onDateChange={onDateChange}
					currentUserId={currentUserId}
					currentUserEmail={currentUserEmail}
					showMultipleEvents={showMultipleEvents}
					selectedDateEvents={selectedDateEvents}
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
				/>
			)}{" "}
			{view === "week" && (
				<WeekView
					currentDate={currentDate}
					events={filteredEvents}
					isToday={isToday}
					isSelectedDate={isSelectedDate}
					getEventStyle={getEventStyle}
					onEventClick={handleEventClick}
					handleTimeSlotClick={handleTimeSlotClick}
					handleShowMoreClick={handleShowMoreClick}
					getCurrentTimePosition={() => getCurrentTimePosition(currentTime)}
					onEventUpdate={handleUpdateEvent}
					fetchEvents={fetchEvents}
					currentTime={currentTime}
					onDateChange={onDateChange}
					currentUserId={currentUserId}
					currentUserEmail={currentUserEmail}
					showMultipleEvents={showMultipleEvents}
					selectedDateEvents={selectedDateEvents}
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
				/>
			)}
			{view === "month" && (
				<MonthView
					currentDate={currentDate}
					onDateChange={onDateChange}
					events={filteredEvents}
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
						return firstDay === 0 ? 6 : firstDay - 1;
					})()}
					onEventClick={handleEventClick}
					onShowMoreClick={handleShowMoreClick}
					getEventStyle={getEventStyle}
					setSelectedTimeSlot={setSelectedTimeSlot}
					onEventUpdate={handleUpdateEvent}
					setShowAddEvent={setShowAddEvent}
					fetchEvents={fetchEvents}
					currentUserId={currentUserId}
					currentUserEmail={currentUserEmail}
					showMultipleEvents={showMultipleEvents}
					selectedDateEvents={selectedDateEvents}
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

			</AnimatePresence>
		</div>
	);
};

export default Calendar;
